const amqp = require('amqplib');
const pino = require('pino');

class AMQPMate {
  constructor(config = { url: 'amqp://localhost' }) {
    // Validate config is an object
    if (typeof config !== 'object' || config === null) {
      throw new Error('Configuration must be an object');
    }

    // Prioritize explicit URL over generated URL
    if (config.url) {
      this.url = config.url;
    } else if (config.host) {
      this.url = this.#buildUrl(config);
    } else {
      this.url = 'amqp://localhost'; // Default fallback
    }
    
    this.connection = null;
    this.channel = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isShuttingDown = false;
    this.pendingMessages = new Set();
    this.startTime = Date.now();
    
    // Logger configuration
    const loggerConfig = {
      title: this.constructor.name,
      level: 'info',
      isDev: true,
      ...config.logger
    };
    
    this.logger = config.logger || this.#createLogger(loggerConfig);
    
    // Configuration
    this.reconnectOptions = {
      enabled: true,
      maxRetries: 5,
      delay: 1000,
      backoffMultiplier: 2,
      ...config.reconnect
    };
    
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // Metrics
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesProcessed: 0,
      errors: 0,
      reconnections: 0,
      totalProcessingTime: 0,
      lastReconnectAt: null
    };
    
    this.#setupProcessHandlers();
    
    if (config.listeners) {
      config.listeners.forEach(([topic, handler]) => {
        this.listen(topic, handler);
      });
    }
    this.start();
  }

  #buildUrl({ host, port = 5672, username, password, vhost = '/' }) {
    const auth = username && password ? `${username}:${password}@` : '';
    const vhostPath = vhost === '/' ? '' : `/${vhost}`;
    return `amqp://${auth}${host}:${port}${vhostPath}`;
  }

  #createLogger(config) {
    const baseOptions = {
      name: config.title,
      level: config.level
    };

    if (config.isDev) {
      return pino({
        ...baseOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname'
          }
        }
      });
    }

    return pino(baseOptions);
  }

  #setupProcessHandlers() {
    const gracefulShutdown = async (signal) => {
      this.logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
      await this.gracefulShutdown();
      process.exit(0);
    };

    ['SIGTERM', 'SIGINT', 'SIGHUP'].forEach(signal => {
      process.on(signal, gracefulShutdown);
    });
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async #retryWithBackoff(fn, context = '', maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        this.metrics.errors++;
        
        if (i === maxRetries - 1) {
          this.logger.error({ 
            error: error.message, 
            attempts: maxRetries,
            context 
          }, `Maximum retry attempts exceeded for ${context}`);
          throw error;
        }
        
        const delay = Math.pow(2, i) * 1000;
        this.logger.warn({ 
          error: error.message, 
          attempt: i + 1,
          delay,
          context
        }, `Error occurred for ${context}, retrying in ${delay}ms`);
        await this.#sleep(delay);
      }
    }
  }

  async start() {
    if (this.isConnected || this.isShuttingDown) {
      this.logger.warn('Attempted to connect to already connected AMQP or during shutdown');
      return;
    }

    try {
      this.logger.info({ 
        url: this.url,
        attempt: this.reconnectAttempts + 1 
      }, 'Connecting to AMQP server');
      
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      this.#setupConnectionHandlers();
      this.logger.info('Successfully connected to AMQP server');

      await this.#setupListeners();
      this.logger.info({ listenersCount: this.listeners.size }, 'Listeners setup completed');
    } catch (error) {
      this.logger.error({ 
        error: error.message, 
        url: this.url,
        attempt: this.reconnectAttempts + 1
      }, 'Failed to connect to AMQP server');
      
      if (!this.isShuttingDown && this.reconnectOptions.enabled) {
        this.#scheduleReconnect();
      } else {
        throw error;
      }
    }
  }

  #setupConnectionHandlers() {
    this.connection.on('close', (err) => {
      this.logger.warn({ error: err?.message }, 'AMQP connection closed');
      this.isConnected = false;
      this.channel = null;
      this.connection = null;
      
      if (!this.isShuttingDown && this.reconnectOptions.enabled) {
        this.#scheduleReconnect();
      }
    });

    this.connection.on('error', (err) => {
      this.logger.error({ error: err.message }, 'AMQP connection error');
      this.metrics.errors++;
    });
  }

  #scheduleReconnect() {
    if (this.reconnectAttempts >= this.reconnectOptions.maxRetries) {
      this.logger.fatal({
        maxRetries: this.reconnectOptions.maxRetries
      }, 'Maximum reconnection attempts exceeded');
      return;
    }

    this.reconnectAttempts++;
    this.metrics.reconnections++;
    this.metrics.lastReconnectAt = new Date().toISOString();
    
    const delay = this.reconnectOptions.delay * 
      Math.pow(this.reconnectOptions.backoffMultiplier, this.reconnectAttempts - 1);
    
    this.logger.info({
      attempt: this.reconnectAttempts,
      maxRetries: this.reconnectOptions.maxRetries,
      delay
    }, `Scheduling reconnection in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => this.start(), delay);
  }

  async #setupListeners() {
    await Promise.all(
      Array.from(this.listeners.entries()).map(([topic, handler]) =>
        this.#createConsumer(topic, handler)
      )
    );
  }

  async #createConsumer(topic, handler) {
    try {
      await this.channel.assertQueue(topic, { durable: false });
      this.logger.debug({ topic }, 'Queue asserted');
      
      await this.channel.consume(topic, async (msg) => {
        if (!msg) return;
        
        const messageId = `${topic}-${Date.now()}-${Math.random()}`;
        this.pendingMessages.add(messageId);
        this.metrics.messagesReceived++;
        
        const startTime = Date.now();
        
        try {
          const content = JSON.parse(msg.content.toString());
          this.logger.debug({ topic, messageSize: msg.content.length }, 'Message received');
          
          await handler(content);
          this.channel.ack(msg);
          
          const processingTime = Date.now() - startTime;
          this.metrics.messagesProcessed++;
          this.metrics.totalProcessingTime += processingTime;
          
          this.logger.debug({ 
            topic, 
            processingTime
          }, 'Message processed successfully');
        } catch (error) {
          this.metrics.errors++;
          this.logger.error({ 
            topic, 
            error: error.message,
            messageContent: msg.content.toString()
          }, 'Message processing failed');
          this.channel.nack(msg);
        } finally {
          this.pendingMessages.delete(messageId);
        }
      });
      
      this.logger.info({ topic }, 'Consumer created for topic');
    } catch (error) {
      this.logger.error({ topic, error: error.message }, 'Failed to create consumer');
      throw error;
    }
  }

  listen(topic, handler) {
    this.listeners.set(topic, handler);
    this.logger.debug({ topic }, 'Listener added');
    
    if (this.isConnected) {
      this.#createConsumer(topic, handler);
    }
  }

  async send(topic, data) {
    if (!this.isConnected) {
      const error = 'AMQP channel is not initialized. Call start() before sending messages';
      this.logger.error({ topic }, error);
      throw new Error(error);
    }

    data.timestamp = Date.now()

    return this.#retryWithBackoff(async () => {
      await this.channel.assertQueue(topic, { durable: false });
      const message = JSON.stringify(data);
      this.channel.sendToQueue(topic, Buffer.from(message));
      this.metrics.messagesSent++;
      this.logger.info({ topic, messageSize: message.length }, 'Message sent');
    }, `sending message to ${topic}`);
  }

  async gracefulShutdown(timeout = 10000) {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info({ 
      pendingMessages: this.pendingMessages.size,
      timeout
    }, 'Starting graceful shutdown');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Wait for current messages to finish processing
    const startWait = Date.now();
    while (this.pendingMessages.size > 0 && (Date.now() - startWait) < timeout) {
      this.logger.debug({ pendingMessages: this.pendingMessages.size }, 'Waiting for messages to complete');
      await this.#sleep(100);
    }

    if (this.pendingMessages.size > 0) {
      this.logger.warn({ 
        pendingMessages: this.pendingMessages.size 
      }, 'Timeout reached, some messages may not have completed processing');
    }

    await this.close();
    this.logger.info('Graceful shutdown completed');
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      avgProcessingTime: this.metrics.messagesProcessed > 0 
        ? Math.round(this.metrics.totalProcessingTime / this.metrics.messagesProcessed)
        : 0,
      pendingMessages: this.pendingMessages.size,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  getHealthCheck() {
    const metrics = this.getMetrics();
    return {
      status: this.isConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: metrics.uptime,
      isConnected: this.isConnected,
      pendingMessages: metrics.pendingMessages,
      metrics: {
        messagesSent: metrics.messagesSent,
        messagesReceived: metrics.messagesReceived,
        messagesProcessed: metrics.messagesProcessed,
        errors: metrics.errors,
        avgProcessingTime: metrics.avgProcessingTime
      }
    };
  }

  async close() {
    if (!this.isConnected) {
      this.logger.warn('Attempted to close inactive connection');
      return;
    }
    
    try {
      this.logger.info('Closing AMQP connection');
      await this.channel?.close();
      await this.connection?.close();
      this.logger.info('AMQP connection closed');
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error occurred while closing connection');
    } finally {
      this.isConnected = false;
      this.channel = null;
      this.connection = null;
    }
  }
}

module.exports = AMQPMate;

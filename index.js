const amqp = require('amqplib');

class AMQPMate {
  constructor(url, options = {}) {
    this.url = url;
    this.connection = null;
    this.channel = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isShuttingDown = false;
    this.pendingMessages = new Set();
    this.startTime = Date.now();
    
    // Конфигурация
    this.logger = options.logger || this.#createDefaultLogger();
    this.reconnectOptions = {
      enabled: true,
      maxRetries: 5,
      delay: 1000,
      backoffMultiplier: 2,
      ...options.reconnect
    };
    
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // Метрики
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
    
    if (options.listeners) {
      options.listeners.forEach(([topic, handler]) => {
        this.listen(topic, handler);
      });
    }
    this.start();
  }

  #createDefaultLogger() {
    const levels = ['info', 'error', 'warn', 'debug'];
    const prefix = '[Database]';
    return Object.fromEntries(
      levels.map(level => [level, (msg, meta = {}) => console[level](`${prefix} ${level.toUpperCase()} ${msg}`, meta)])
    );
  }

  #setupProcessHandlers() {
    const gracefulShutdown = async (signal) => {
      this.logger.info(`Получен сигнал ${signal}, начинаем graceful shutdown...`);
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
          this.logger.error(`Превышено количество попыток для ${context}`, { 
            error: error.message, 
            attempts: maxRetries 
          });
          throw error;
        }
        
        const delay = Math.pow(2, i) * 1000;
        this.logger.warn(`Ошибка ${context}, повтор через ${delay}ms`, { 
          error: error.message, 
          attempt: i + 1 
        });
        await this.#sleep(delay);
      }
    }
  }

  async start() {
    if (this.isConnected || this.isShuttingDown) {
      this.logger.warn('Попытка подключения к уже подключенному AMQP или во время shutdown');
      return;
    }

    try {
      this.logger.info('Подключение к AMQP...', { 
        url: this.url,
        attempt: this.reconnectAttempts + 1 
      });
      
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      this.#setupConnectionHandlers();
      this.logger.info('Успешное подключение к AMQP');

      await this.#setupListeners();
      this.logger.info('Настройка слушателей завершена', { listenersCount: this.listeners.size });
    } catch (error) {
      this.logger.error('Ошибка подключения к AMQP', { 
        error: error.message, 
        url: this.url,
        attempt: this.reconnectAttempts + 1
      });
      
      if (!this.isShuttingDown && this.reconnectOptions.enabled) {
        this.#scheduleReconnect();
      } else {
        throw error;
      }
    }
  }

  #setupConnectionHandlers() {
    this.connection.on('close', (err) => {
      this.logger.warn('Соединение AMQP закрыто', { error: err?.message });
      this.isConnected = false;
      this.channel = null;
      this.connection = null;
      
      if (!this.isShuttingDown && this.reconnectOptions.enabled) {
        this.#scheduleReconnect();
      }
    });

    this.connection.on('error', (err) => {
      this.logger.error('Ошибка соединения AMQP', { error: err.message });
      this.metrics.errors++;
    });
  }

  #scheduleReconnect() {
    if (this.reconnectAttempts >= this.reconnectOptions.maxRetries) {
      this.logger.error('Превышено максимальное количество попыток переподключения', {
        maxRetries: this.reconnectOptions.maxRetries
      });
      return;
    }

    this.reconnectAttempts++;
    this.metrics.reconnections++;
    this.metrics.lastReconnectAt = new Date().toISOString();
    
    const delay = this.reconnectOptions.delay * 
      Math.pow(this.reconnectOptions.backoffMultiplier, this.reconnectAttempts - 1);
    
    this.logger.info(`Планируется переподключение через ${delay}ms`, {
      attempt: this.reconnectAttempts,
      maxRetries: this.reconnectOptions.maxRetries
    });

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
      this.logger.debug('Очередь создана/подтверждена', { topic });
      
      await this.channel.consume(topic, async (msg) => {
        if (!msg) return;
        
        const messageId = `${topic}-${Date.now()}-${Math.random()}`;
        this.pendingMessages.add(messageId);
        this.metrics.messagesReceived++;
        
        const startTime = Date.now();
        
        try {
          const content = JSON.parse(msg.content.toString());
          this.logger.debug('Получено сообщение', { topic, messageSize: msg.content.length });
          
          await handler(content);
          this.channel.ack(msg);
          
          const processingTime = Date.now() - startTime;
          this.metrics.messagesProcessed++;
          this.metrics.totalProcessingTime += processingTime;
          
          this.logger.debug('Сообщение обработано успешно', { 
            topic, 
            processingTime: `${processingTime}ms`
          });
        } catch (error) {
          this.metrics.errors++;
          this.logger.error('Ошибка обработки сообщения', { 
            topic, 
            error: error.message,
            messageContent: msg.content.toString()
          });
          this.channel.nack(msg);
        } finally {
          this.pendingMessages.delete(messageId);
        }
      });
      
      this.logger.info('Слушатель создан', { topic });
    } catch (error) {
      this.logger.error('Ошибка создания слушателя', { topic, error: error.message });
      throw error;
    }
  }

  listen(topic, handler) {
    this.listeners.set(topic, handler);
    this.logger.debug('Слушатель добавлен', { topic });
    
    if (this.isConnected) {
      this.#createConsumer(topic, handler);
    }
  }

  async send(topic, data) {
    if (!this.isConnected) {
      const error = 'Канал AMQP не инициализирован. Вызовите start() перед отправкой.';
      this.logger.error(error, { topic });
      throw new Error(error);
    }

    return this.#retryWithBackoff(async () => {
      await this.channel.assertQueue(topic, { durable: false });
      const message = JSON.stringify(data);
      this.channel.sendToQueue(topic, Buffer.from(message));
      this.metrics.messagesSent++;
      this.logger.info('Сообщение отправлено', { topic, messageSize: message.length });
    }, `отправка сообщения в ${topic}`);
  }

  async gracefulShutdown(timeout = 10000) {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Начинаем graceful shutdown...', { 
      pendingMessages: this.pendingMessages.size,
      timeout: `${timeout}ms`
    });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Ждем завершения обработки текущих сообщений
    const startWait = Date.now();
    while (this.pendingMessages.size > 0 && (Date.now() - startWait) < timeout) {
      this.logger.debug(`Ждем завершения ${this.pendingMessages.size} сообщений...`);
      await this.#sleep(100);
    }

    if (this.pendingMessages.size > 0) {
      this.logger.warn(`Timeout достигнут, осталось ${this.pendingMessages.size} необработанных сообщений`);
    }

    await this.close();
    this.logger.info('Graceful shutdown завершен');
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
      this.logger.warn('Попытка закрытия неактивного соединения');
      return;
    }
    
    try {
      this.logger.info('Закрытие AMQP соединения...');
      await this.channel?.close();
      await this.connection?.close();
      this.logger.info('AMQP соединение закрыто');
    } catch (error) {
      this.logger.error('Ошибка при закрытии соединения', { error: error.message });
    } finally {
      this.isConnected = false;
      this.channel = null;
      this.connection = null;
    }
  }
}

module.exports = AMQPMate;

const AMQPMate = require('./index');

async function main() {
  // Create instance using connection parameters
  const amqp = new AMQPMate({
    host: 'localhost',
    port: 5672,
    // username: 'user',    // uncomment if authentication needed
    // password: 'pass',    // uncomment if authentication needed
    // vhost: '/'           // default vhost
  }, {
    reconnect: {
      maxRetries: 10,
      delay: 2000,
      backoffMultiplier: 1.5
    },
    logger: {
      title: 'AMQPExample',
      level: 'debug',
      isDev: true
    }
  });

  // Alternative: Create instance using URL
  // const amqp = new AMQPMate('amqp://localhost:5672');

  // Add listeners
  amqp.listen('user.created', async (data) => {
    console.log('New user:', data);
    // Simulate long processing
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  amqp.listen('order.placed', async (data) => {
    console.log('New order:', data);
    // Sometimes simulate error for retry demonstration
    if (Math.random() < 0.3) {
      throw new Error('Temporary order processing error');
    }
  });

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Send test messages
  try {
    await amqp.send('user.created', {
      id: 123,
      name: 'Eugene',
      email: 'eugene@example.com'
    });

    await amqp.send('order.placed', {
      orderId: 456,
      userId: 123,
      amount: 99.99
    });

    console.log('Test messages sent');
  } catch (error) {
    console.error('Send error:', error.message);
  }

  // Show metrics every 5 seconds
  const metricsInterval = setInterval(() => {
    const metrics = amqp.getMetrics();
    console.log('\nMetrics:', {
      sent: metrics.messagesSent,
      received: metrics.messagesReceived,
      processed: metrics.messagesProcessed,
      errors: metrics.errors,
      avgProcessingTime: `${metrics.avgProcessingTime}ms`,
      uptime: `${Math.round(metrics.uptime / 1000)}s`,
      reconnections: metrics.reconnections
    });

    const health = amqp.getHealthCheck();
    console.log('Health:', health.status, {
      connected: health.isConnected,
      pendingMessages: health.pendingMessages
    });
  }, 5000);

  // Graceful shutdown after 30 seconds for demonstration
  setTimeout(async () => {
    console.log('\nDemonstrating graceful shutdown...');
    clearInterval(metricsInterval);
    
    // Send several messages before shutdown
    for (let i = 0; i < 3; i++) {
      await amqp.send('user.created', { id: 1000 + i, name: `User${i}` });
    }
    
    // Graceful shutdown will process all pending messages
    await amqp.gracefulShutdown(15000);
    console.log('Application finished');
    process.exit(0);
  }, 30000);
}

main().catch(console.error); 
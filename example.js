const AMQPMate = require('./index');

async function main() {
  // Создаем экземпляр с настройками переподключения
  const amqp = new AMQPMate('amqp://localhost', {
    reconnect: {
      maxRetries: 10,
      delay: 2000,
      backoffMultiplier: 1.5
    },
    logger: {
      info: (msg, meta) => console.log(`📢 ${msg}`, meta),
      error: (msg, meta) => console.error(`❌ ${msg}`, meta),
      warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta),
      debug: (msg, meta) => console.debug(`🔍 ${msg}`, meta)
    }
  });

  // Добавляем слушателей
  amqp.listen('user.created', async (data) => {
    console.log('🆕 Новый пользователь:', data);
    // Имитируем долгую обработку
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  amqp.listen('order.placed', async (data) => {
    console.log('🛒 Новый заказ:', data);
    // Иногда эмулируем ошибку для демонстрации retry
    if (Math.random() < 0.3) {
      throw new Error('Временная ошибка обработки заказа');
    }
  });

  // Ждем подключения
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Отправляем тестовые сообщения
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

    console.log('📊 Отправлено тестовых сообщений');
  } catch (error) {
    console.error('Ошибка отправки:', error.message);
  }

  // Показываем метрики каждые 5 секунд
  const metricsInterval = setInterval(() => {
    const metrics = amqp.getMetrics();
    console.log('\n📈 Метрики:', {
      отправлено: metrics.messagesSent,
      получено: metrics.messagesReceived,
      обработано: metrics.messagesProcessed,
      ошибки: metrics.errors,
      среднее_время_обработки: `${metrics.avgProcessingTime}ms`,
      время_работы: `${Math.round(metrics.uptime / 1000)}s`,
      переподключения: metrics.reconnections
    });

    const health = amqp.getHealthCheck();
    console.log('🏥 Health:', health.status, {
      подключено: health.isConnected,
      ожидающих_сообщений: health.pendingMessages
    });
  }, 5000);

  // Graceful shutdown через 30 секунд для демонстрации
  setTimeout(async () => {
    console.log('\n🔄 Демонстрация graceful shutdown...');
    clearInterval(metricsInterval);
    
    // Отправляем несколько сообщений перед shutdown
    for (let i = 0; i < 3; i++) {
      await amqp.send('user.created', { id: 1000 + i, name: `User${i}` });
    }
    
    // Graceful shutdown обработает все ожидающие сообщения
    await amqp.gracefulShutdown(15000);
    console.log('✅ Приложение завершено');
    process.exit(0);
  }, 30000);
}

main().catch(console.error); 
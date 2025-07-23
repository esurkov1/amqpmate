# 🐰 AMQPMate

[![npm version](https://badge.fury.io/js/amqpmate.svg)](https://badge.fury.io/js/amqpmate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 🚀 Легковесная и мощная обертка над AMQP для работы с очередями сообщений

## ✨ Особенности

- 🔄 **Автоматическое переподключение** с настраиваемой стратегией backoff
- 📊 **Встроенные метрики** и health check
- 🛡️ **Graceful shutdown** с ожиданием завершения обработки сообщений
- 🔁 **Retry механизм** для отправки сообщений
- 📝 **Гибкое логирование** с поддержкой кастомных логгеров
- ⚡ **Простой API** для быстрого старта
- 💪 **TypeScript ready** (типы включены)

## 📦 Установка

```bash
npm install amqpmate
```

## 🚀 Быстрый старт

```javascript
const AMQPMate = require('amqpmate');

// Создаем экземпляр
const amqp = new AMQPMate('amqp://localhost');

// Слушаем сообщения
amqp.listen('user.created', async (data) => {
  console.log('Новый пользователь:', data);
});

// Отправляем сообщение
await amqp.send('user.created', {
  id: 123,
  name: 'Eugene',
  email: 'eugene@example.com'
});
```

## 📖 Подробная документация

### Инициализация

#### Базовая инициализация
```javascript
const amqp = new AMQPMate('amqp://localhost');
```

#### Расширенная конфигурация
```javascript
const amqp = new AMQPMate('amqp://user:pass@localhost:5672', {
  // Настройки переподключения
  reconnect: {
    enabled: true,
    maxRetries: 10,
    delay: 2000,
    backoffMultiplier: 1.5
  },
  
  // Кастомный логгер
  logger: {
    info: (msg, meta) => console.log(`📢 ${msg}`, meta),
    error: (msg, meta) => console.error(`❌ ${msg}`, meta),
    warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta),
    debug: (msg, meta) => console.debug(`🔍 ${msg}`, meta)
  },
  
  // Слушатели в конструкторе
  listeners: [
    ['orders', handleOrder],
    ['notifications', handleNotification]
  ]
});
```

### 📨 Отправка сообщений

```javascript
// Простая отправка
await amqp.send('topic', { message: 'Hello!' });

// С обработкой ошибок
try {
  await amqp.send('important-topic', { data: 'critical' });
  console.log('✅ Сообщение отправлено');
} catch (error) {
  console.error('❌ Ошибка отправки:', error.message);
}
```

### 👂 Прослушивание сообщений

```javascript
// Добавление слушателя
amqp.listen('user.events', async (data) => {
  console.log('Событие пользователя:', data);
  
  // Имитация обработки
  await processUserEvent(data);
});

// Обработка с ошибками
amqp.listen('payments', async (payment) => {
  try {
    await processPayment(payment);
    console.log('💰 Платеж обработан:', payment.id);
  } catch (error) {
    console.error('💥 Ошибка обработки платежа:', error);
    throw error; // Сообщение будет отправлено в nack
  }
});
```

### 📊 Метрики и мониторинг

```javascript
// Получение метрик
const metrics = amqp.getMetrics();
console.log('📈 Метрики:', {
  отправлено: metrics.messagesSent,
  получено: metrics.messagesReceived,
  обработано: metrics.messagesProcessed,
  ошибки: metrics.errors,
  время_работы: `${Math.round(metrics.uptime / 1000)}s`,
  среднее_время_обработки: `${metrics.avgProcessingTime}ms`
});

// Health check
const health = amqp.getHealthCheck();
console.log('🏥 Состояние:', health.status);
console.log('📋 Детали:', health);
```

### 🛡️ Graceful Shutdown

```javascript
// Автоматический graceful shutdown при получении сигналов
// SIGTERM, SIGINT, SIGHUP

// Ручной graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Получен SIGTERM, завершаем работу...');
  await amqp.gracefulShutdown(15000); // 15 секунд на завершение
  process.exit(0);
});

// Или просто закрыть соединение
await amqp.close();
```

## 🎯 Примеры использования

### Микросервисная архитектура

```javascript
const AMQPMate = require('amqpmate');

class UserService {
  constructor() {
    this.amqp = new AMQPMate('amqp://localhost', {
      reconnect: { maxRetries: 20 }
    });
    
    this.setupListeners();
  }
  
  setupListeners() {
    // Обработка регистрации
    this.amqp.listen('user.register', async (userData) => {
      const user = await this.createUser(userData);
      
      // Уведомляем другие сервисы
      await this.amqp.send('user.created', user);
      await this.amqp.send('email.welcome', { 
        email: user.email, 
        name: user.name 
      });
    });
    
    // Обработка обновления профиля
    this.amqp.listen('user.update', async (updateData) => {
      await this.updateUser(updateData);
      await this.amqp.send('user.updated', updateData);
    });
  }
  
  async createUser(userData) {
    // Логика создания пользователя
    return { id: Date.now(), ...userData };
  }
  
  async updateUser(updateData) {
    // Логика обновления
    console.log('Обновляем пользователя:', updateData);
  }
}

const service = new UserService();
```

### E-commerce система

```javascript
const amqp = new AMQPMate('amqp://localhost');

// Обработка заказов
amqp.listen('order.placed', async (order) => {
  console.log('🛒 Новый заказ:', order.id);
  
  // Резервируем товар
  await amqp.send('inventory.reserve', {
    orderId: order.id,
    items: order.items
  });
  
  // Отправляем на обработку платежа
  await amqp.send('payment.process', {
    orderId: order.id,
    amount: order.total,
    paymentMethod: order.paymentMethod
  });
});

// Обработка платежей
amqp.listen('payment.completed', async (payment) => {
  console.log('💳 Платеж завершен:', payment.orderId);
  
  await amqp.send('order.confirmed', { orderId: payment.orderId });
  await amqp.send('shipping.prepare', { orderId: payment.orderId });
  await amqp.send('email.order-confirmation', { 
    orderId: payment.orderId,
    email: payment.customerEmail 
  });
});
```

## 🔧 API Reference

### Constructor
```javascript
new AMQPMate(url, options)
```

**Параметры:**
- `url` (string) - URL подключения к AMQP серверу
- `options` (object) - Опциональные настройки
  - `reconnect` - Настройки переподключения
  - `logger` - Кастомный логгер
  - `listeners` - Массив слушателей для инициализации

### Методы

#### `listen(topic, handler)`
Добавляет слушателя для топика.

#### `send(topic, data)`
Отправляет сообщение в топик.

#### `getMetrics()`
Возвращает метрики работы.

#### `getHealthCheck()`
Возвращает состояние здоровья сервиса.

#### `gracefulShutdown(timeout)`
Выполняет graceful shutdown с указанным таймаутом.

#### `close()`
Закрывает соединение.

## 🤝 Вклад в проект

Буду рад вашим предложениям и улучшениям! Пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT © [Eugene Surkov](https://github.com/esurkov1)

## 🐛 Нашли баг?

Пожалуйста, создайте [issue](https://github.com/esurkov1/amqpmate/issues) с подробным описанием.

---

**Сделано с ❤️ для Node.js сообщества** 
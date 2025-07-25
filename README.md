# AMQPMate

[![npm version](https://badge.fury.io/js/amqpmate.svg)](https://badge.fury.io/js/amqpmate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight and powerful AMQP wrapper for message queue operations

## Overview

AMQPMate is a production-ready Node.js library that simplifies working with AMQP message brokers like RabbitMQ. It provides automatic connection recovery, built-in metrics, graceful shutdown handling, and structured logging with Pino. The library abstracts away low-level AMQP protocol details while preserving full control over message handling patterns, making it ideal for microservices and event-driven architectures.

## Features

- **Automatic reconnection** with configurable backoff strategy
- **Built-in metrics** and health check endpoints
- **Graceful shutdown** with pending message completion
- **Retry mechanism** for message sending with exponential backoff
- **Structured logging** with Pino (development and production modes)
- **Flexible connection** options (URL or parameters)
- **Simple API** for quick integration
- **TypeScript ready** (types included)

## Installation

```bash
npm install amqpmate
```

## Quick Start

```javascript
const AMQPMate = require('amqpmate');

// Simple connection
const amqp = new AMQPMate('amqp://localhost');

// Or with parameters
const amqp2 = new AMQPMate({
  host: 'localhost',
  port: 5672,
  username: 'user',
  password: 'pass'
});

// Listen for messages
amqp.listen('user.created', async (data) => {
  console.log('New user:', data);
});

// Send message
await amqp.send('user.created', {
  id: 123,
  name: 'Eugene',
  email: 'eugene@example.com'
});
```

## Configuration Options

### URL String (Simple)
```javascript
const amqp = new AMQPMate('amqp://user:pass@localhost:5672/vhost');
```

### Configuration Object (Advanced)
```javascript
const amqp = new AMQPMate({
  // Connection via URL
  url: 'amqp://localhost:5672',
  
  // OR Connection via parameters
  host: 'localhost',     // required if no url
  port: 5672,            // default: 5672
  username: 'user',      // optional
  password: 'pass',      // optional
  vhost: '/',            // default: '/'
  
  // Logger configuration
  logger: {
    title: 'MyService',        // Logger name (default: class name)
    level: 'info',             // Log level (default: 'info')
    isDev: false               // Use JSON format for production (default: true)
  },
  
  // Reconnection settings
  reconnect: {
    enabled: true,
    maxRetries: 10,
    delay: 2000,
    backoffMultiplier: 1.5
  },
  
  // Listeners in constructor
  listeners: [
    ['orders', handleOrder],
    ['notifications', handleNotification]
  ]
});
```

## API Reference

### Constructor
```javascript
new AMQPMate(config)
```

**Parameters:**
- `config` (string|object) - AMQP connection URL string or configuration object

### Core Methods

#### `listen(topic, handler)`
Adds a listener for the specified topic.

#### `send(topic, data)`
Sends a message to the specified topic.

#### `getMetrics()`
Returns comprehensive metrics about the AMQP instance.

#### `getHealthCheck()`
Returns health status information suitable for monitoring systems.

#### `gracefulShutdown(timeout)`
Performs graceful shutdown, waiting for pending messages to complete.

#### `close()`
Immediately closes the AMQP connection.

## Examples

### Environment-based Configuration
```javascript
const AMQPMate = require('amqpmate');

const amqp = new AMQPMate({
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER,
  password: process.env.RABBITMQ_PASS,
  vhost: process.env.RABBITMQ_VHOST || '/',
  
  logger: {
    title: 'UserService',
    level: process.env.LOG_LEVEL || 'info',
    isDev: process.env.NODE_ENV !== 'production'
  },
  
  reconnect: {
    maxRetries: 20
  }
});

amqp.listen('user.register', async (userData) => {
  const user = await createUser(userData);
  await amqp.send('user.created', user);
});
```

### Health Check Endpoint
```javascript
app.get('/health', (req, res) => {
  const health = amqp.getHealthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Graceful Shutdown
```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await amqp.gracefulShutdown(15000);
  process.exit(0);
});
```

## License

MIT © [Eugene Surkov](https://github.com/esurkov1)

---

**Made with ❤️ for the Node.js community** 
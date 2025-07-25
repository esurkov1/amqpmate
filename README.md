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

// Create instance with URL
const amqp = new AMQPMate('amqp://localhost');

// Or with connection parameters
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

## Connection Options

### URL Connection
```javascript
const amqp = new AMQPMate('amqp://user:pass@localhost:5672/vhost');
```

### Parameter Connection
```javascript
const amqp = new AMQPMate({
  host: 'localhost',     // required
  port: 5672,            // default: 5672
  username: 'user',      // optional
  password: 'pass',      // optional
  vhost: '/'             // default: '/'
});
```

### Advanced Configuration
```javascript
const amqp = new AMQPMate('amqp://localhost', {
  // Reconnection settings
  reconnect: {
    enabled: true,
    maxRetries: 10,
    delay: 2000,
    backoffMultiplier: 1.5
  },
  
  // Logger configuration
  logger: {
    title: 'MyService',        // Logger name (default: class name)
    level: 'info',             // Log level (default: 'info')
    isDev: false               // Use JSON format for production (default: true)
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
new AMQPMate(connectionConfig, options)
```

**Parameters:**
- `connectionConfig` (string|object) - AMQP connection URL or parameters object
- `options` (object) - Optional configuration (reconnect, logger, listeners)

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

## Logger Configuration

- **title** (string): Name displayed in logs (default: class name)
- **level** (string): Logging level - 'trace', 'debug', 'info', 'warn', 'error', 'fatal' (default: 'info')
- **isDev** (boolean): 
  - `true`: Uses pino-pretty for colored, human-readable output (development)
  - `false`: Uses JSON format for structured logging (production)

## Examples

### Microservice with Parameters
```javascript
const AMQPMate = require('amqpmate');

const amqp = new AMQPMate({
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USER,
  password: process.env.RABBITMQ_PASS,
  vhost: process.env.RABBITMQ_VHOST || '/'
}, {
  logger: {
    title: 'UserService',
    level: process.env.LOG_LEVEL || 'info',
    isDev: process.env.NODE_ENV !== 'production'
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
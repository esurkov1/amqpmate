# AMQPMate

[![npm version](https://badge.fury.io/js/amqpmate.svg)](https://badge.fury.io/js/amqpmate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight and powerful AMQP wrapper for message queue operations

## Overview

AMQPMate is a production-ready Node.js library that simplifies working with AMQP message brokers like RabbitMQ. It provides automatic connection recovery, built-in metrics, structured logging with Pino, and a clean API. The library abstracts away low-level AMQP protocol details while preserving full control over message handling patterns, making it ideal for microservices and event-driven architectures.

## Features

- **Automatic reconnection** with configurable backoff strategy
- **Built-in metrics** and health check endpoints

- **Retry mechanism** for message sending with exponential backoff
- **Structured logging** with Pino (development and production modes)
- **Flexible connection** options
- **Simple API** for quick integration
- **TypeScript ready** (types included)

## Installation

```bash
npm install amqpmate
```

## Quick Start

```javascript
const AMQPMate = require('amqpmate');

// Default connection (localhost)
const amqp = new AMQPMate();

// Connection with URL
const amqp2 = new AMQPMate({ 
  url: 'amqp://localhost:5672' 
});

// Connection with parameters
const amqp3 = new AMQPMate({
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

### Default Connection
```javascript
// Uses amqp://localhost by default
const amqp = new AMQPMate();
```

### URL Connection
```javascript
const amqp = new AMQPMate({ 
  url: 'amqp://user:pass@localhost:5672/vhost' 
});
```

### Parameters Connection
```javascript
const amqp = new AMQPMate({
  host: 'localhost',     // required if no url
  port: 5672,            // default: 5672
  username: 'user',      // optional
  password: 'pass',      // optional
  vhost: '/'             // default: '/'
});
```

### Full Configuration
```javascript
const amqp = new AMQPMate({
  // Connection settings
  host: 'localhost',
  port: 5672,
  
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
- `config` (object) - Configuration object with connection settings
  - `url` (string, optional) - Full AMQP connection URL
  - `host` (string, optional) - Hostname for connection
  - `port` (number, optional) - Port number (default: 5672)
  - `username` (string, optional) - Connection username
  - `password` (string, optional) - Connection password
  - `vhost` (string, optional) - Virtual host (default: '/')
  - `logger` (object, optional) - Logger configuration
  - `reconnect` (object, optional) - Reconnection settings
  - `listeners` (array, optional) - Initial listeners

### Core Methods

#### `listen(topic, handler)`
Adds a listener for the specified topic.

#### `send(topic, data)`
Sends a message to the specified topic.

#### `getMetrics()`
Returns comprehensive metrics about the AMQP instance.

#### `getHealthCheck()`
Returns health status information suitable for monitoring systems.



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

### Close Connection
```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await amqp.close();
  process.exit(0);
});
```

## License

MIT © [Eugene Surkov](https://github.com/esurkov1)

---

**Made with ❤️ for the Node.js community** 
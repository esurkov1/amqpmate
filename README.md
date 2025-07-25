# AMQPMate

[![npm version](https://badge.fury.io/js/amqpmate.svg)](https://badge.fury.io/js/amqpmate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight and powerful AMQP wrapper for message queue operations

## Overview

AMQPMate is a production-ready Node.js library that simplifies working with AMQP message brokers like RabbitMQ. Unlike raw AMQP client libraries that require extensive boilerplate code and manual error handling, AMQPMate provides a clean, intuitive API that handles the complexity for you.

Built with modern Node.js applications in mind, AMQPMate automatically manages connections, implements intelligent retry mechanisms, and provides comprehensive monitoring capabilities. The library abstracts away the low-level AMQP protocol details while preserving full control over message handling patterns.

Key advantages over raw AMQP implementations include automatic connection recovery with exponential backoff, built-in metrics collection, graceful shutdown handling, and structured logging with Pino. Whether you're building microservices, event-driven architectures, or distributed systems, AMQPMate reduces development time and operational overhead while ensuring reliability and observability.

The library is designed for production environments with features like health checks, processing metrics, and configurable logging levels. It supports both development and production deployments with minimal configuration changes, making it ideal for teams that need to move quickly from prototype to production.

## Features

- **Automatic reconnection** with configurable backoff strategy
- **Built-in metrics** and health check endpoints
- **Graceful shutdown** with pending message completion
- **Retry mechanism** for message sending with exponential backoff
- **Structured logging** with Pino (development and production modes)
- **Simple API** for quick integration
- **TypeScript ready** (types included)
- **Production tested** with comprehensive error handling

## Installation

```bash
npm install amqpmate
```

## Quick Start

```javascript
const AMQPMate = require('amqpmate');

// Create instance
const amqp = new AMQPMate('amqp://localhost');

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

## Detailed Documentation

### Initialization

#### Basic initialization
```javascript
const amqp = new AMQPMate('amqp://localhost');
```

#### Advanced configuration
```javascript
const amqp = new AMQPMate('amqp://user:pass@localhost:5672', {
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

### Logger Configuration

The logger configuration accepts the following options:

- **title** (string): Name displayed in logs (default: class name)
- **level** (string): Logging level - 'trace', 'debug', 'info', 'warn', 'error', 'fatal' (default: 'info')
- **isDev** (boolean): 
  - `true`: Uses pino-pretty for colored, human-readable output (development)
  - `false`: Uses JSON format for structured logging (production)

```javascript
// Development configuration
const amqp = new AMQPMate('amqp://localhost', {
  logger: {
    title: 'UserService',
    level: 'debug',
    isDev: true  // Pretty printed logs with colors
  }
});

// Production configuration  
const amqp = new AMQPMate('amqp://localhost', {
  logger: {
    title: 'UserService',
    level: 'warn',
    isDev: false  // JSON structured logs
  }
});
```

### Sending Messages

```javascript
// Simple send
await amqp.send('topic', { message: 'Hello!' });

// With error handling
try {
  await amqp.send('important-topic', { data: 'critical' });
  console.log('Message sent successfully');
} catch (error) {
  console.error('Send error:', error.message);
}
```

### Listening for Messages

```javascript
// Add listener
amqp.listen('user.events', async (data) => {
  console.log('User event:', data);
  
  // Simulate processing
  await processUserEvent(data);
});

// Error handling in listeners
amqp.listen('payments', async (payment) => {
  try {
    await processPayment(payment);
    console.log('Payment processed:', payment.id);
  } catch (error) {
    console.error('Payment processing failed:', error);
    throw error; // Message will be nacked
  }
});
```

### Metrics and Monitoring

```javascript
// Get metrics
const metrics = amqp.getMetrics();
console.log('Metrics:', {
  sent: metrics.messagesSent,
  received: metrics.messagesReceived,
  processed: metrics.messagesProcessed,
  errors: metrics.errors,
  uptime: `${Math.round(metrics.uptime / 1000)}s`,
  avgProcessingTime: `${metrics.avgProcessingTime}ms`
});

// Health check
const health = amqp.getHealthCheck();
console.log('Status:', health.status);
console.log('Details:', health);
```

### Graceful Shutdown

```javascript
// Automatic graceful shutdown on signals
// SIGTERM, SIGINT, SIGHUP are handled automatically

// Manual graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await amqp.gracefulShutdown(15000); // 15 seconds timeout
  process.exit(0);
});

// Or simply close connection
await amqp.close();
```

## Usage Examples

### Microservice Architecture

```javascript
const AMQPMate = require('amqpmate');

class UserService {
  constructor() {
    this.amqp = new AMQPMate('amqp://localhost', {
      reconnect: { maxRetries: 20 },
      logger: {
        title: 'UserService',
        level: 'info',
        isDev: process.env.NODE_ENV !== 'production'
      }
    });
    
    this.setupListeners();
  }
  
  setupListeners() {
    // Handle user registration
    this.amqp.listen('user.register', async (userData) => {
      const user = await this.createUser(userData);
      
      // Notify other services
      await this.amqp.send('user.created', user);
      await this.amqp.send('email.welcome', { 
        email: user.email, 
        name: user.name 
      });
    });
    
    // Handle profile updates
    this.amqp.listen('user.update', async (updateData) => {
      await this.updateUser(updateData);
      await this.amqp.send('user.updated', updateData);
    });
  }
  
  async createUser(userData) {
    // User creation logic
    return { id: Date.now(), ...userData };
  }
  
  async updateUser(updateData) {
    // Update logic
    console.log('Updating user:', updateData);
  }
}

const service = new UserService();
```

### E-commerce System

```javascript
const amqp = new AMQPMate('amqp://localhost', {
  logger: {
    title: 'EcommerceService',
    level: 'info'
  }
});

// Order processing
amqp.listen('order.placed', async (order) => {
  console.log('New order:', order.id);
  
  // Reserve inventory
  await amqp.send('inventory.reserve', {
    orderId: order.id,
    items: order.items
  });
  
  // Process payment
  await amqp.send('payment.process', {
    orderId: order.id,
    amount: order.total,
    paymentMethod: order.paymentMethod
  });
});

// Payment completion
amqp.listen('payment.completed', async (payment) => {
  console.log('Payment completed:', payment.orderId);
  
  await amqp.send('order.confirmed', { orderId: payment.orderId });
  await amqp.send('shipping.prepare', { orderId: payment.orderId });
  await amqp.send('email.order-confirmation', { 
    orderId: payment.orderId,
    email: payment.customerEmail 
  });
});
```

## API Reference

### Constructor
```javascript
new AMQPMate(url, options)
```

**Parameters:**
- `url` (string) - AMQP server connection URL
- `options` (object) - Optional configuration
  - `reconnect` - Reconnection settings
  - `logger` - Logger configuration
  - `listeners` - Array of listeners for initialization

### Methods

#### `listen(topic, handler)`
Adds a listener for the specified topic.

**Parameters:**
- `topic` (string) - Topic name to listen to
- `handler` (function) - Async function to handle incoming messages

**Example:**
```javascript
amqp.listen('user.created', async (userData) => {
  await processUser(userData);
});
```

#### `send(topic, data)`
Sends a message to the specified topic.

**Parameters:**
- `topic` (string) - Topic name to send to
- `data` (object) - Message data (will be JSON serialized)

**Returns:** Promise that resolves when message is sent

**Example:**
```javascript
await amqp.send('user.created', {
  id: 123,
  name: 'John Doe',
  email: 'john@example.com'
});
```

#### `getMetrics()`
Returns comprehensive metrics about the AMQP instance.

**Returns:** Object with metrics:
- `messagesSent` - Total messages sent
- `messagesReceived` - Total messages received  
- `messagesProcessed` - Total messages successfully processed
- `errors` - Total errors encountered
- `reconnections` - Number of reconnection attempts
- `uptime` - Uptime in milliseconds
- `avgProcessingTime` - Average message processing time
- `pendingMessages` - Currently pending messages
- `isConnected` - Connection status
- `reconnectAttempts` - Current reconnection attempts

#### `getHealthCheck()`
Returns health status information suitable for monitoring systems.

**Returns:** Object with health information:
- `status` - 'healthy' or 'unhealthy'
- `timestamp` - Current timestamp
- `uptime` - Uptime in milliseconds
- `isConnected` - Connection status
- `pendingMessages` - Number of pending messages
- `metrics` - Subset of key metrics

#### `gracefulShutdown(timeout)`
Performs graceful shutdown, waiting for pending messages to complete.

**Parameters:**
- `timeout` (number) - Maximum time to wait in milliseconds (default: 10000)

**Returns:** Promise that resolves when shutdown is complete

#### `close()`
Immediately closes the AMQP connection.

**Returns:** Promise that resolves when connection is closed

#### `start()`
Manually starts the AMQP connection (called automatically in constructor).

**Returns:** Promise that resolves when connected

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © [Eugene Surkov](https://github.com/esurkov1)

## Found a Bug?

Please create an [issue](https://github.com/esurkov1/amqpmate/issues) with detailed description.

---

**Made with ❤️ for the Node.js community** 
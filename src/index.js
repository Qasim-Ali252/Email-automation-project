import express from 'express';
import { config, validateConfig } from './config/index.js';
import emailRoutes from './routes/emailRoutes.js';
import testRoutes from './routes/testRoutes.js';

// Validate configuration on startup
try {
  validateConfig();
  console.log('✓ Configuration validated successfully');
} catch (error) {
  console.error('✗ Configuration validation failed:', error.message);
  process.exit(1);
}

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// Email routes
app.use('/api/emails', emailRoutes);

// Test routes (for debugging)
app.use('/api/test', testRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📧 Email webhook endpoint: POST http://localhost:${config.port}/api/emails/inbound`);
  console.log(`💚 Health check: GET http://localhost:${config.port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;

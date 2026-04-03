const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposits');
const withdrawalRoutes = require('./routes/withdrawals');
const betRoutes = require('./routes/bets');
const balanceRoutes = require('./routes/balance');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://gotlucky.bet',
      'https://www.gotlucky.bet',
      'https://admin.gotlucky.bet'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/balance', balanceRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Lucky Casino Backend API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/login': 'Login/Register with wallet address',
        'GET /api/auth/profile': 'Get user profile',
        'PUT /api/auth/profile': 'Update username'
      },
      deposits: {
        'POST /api/deposits/create': 'Create a new deposit',
        'GET /api/deposits/history': 'Get user deposits',
        'PUT /api/deposits/:id/status': 'Update deposit status'
      },
      withdrawals: {
        'POST /api/withdrawals/create': 'Create a new withdrawal',
        'GET /api/withdrawals/history': 'Get user withdrawals',
        'PUT /api/withdrawals/:id/status': 'Update withdrawal status'
      },
      bets: {
        'POST /api/bets/save-result': 'Save bet result',
        'GET /api/bets/history': 'Get bet history',
        'GET /api/bets/statistics': 'Get bet statistics',
        'GET /api/bets/recent': 'Get recent bets'
      },
      balance: {
        'GET /api/balance/balance': 'Get user balance',
        'GET /api/balance/history': 'Get balance history',
        'GET /api/balance/summary': 'Get balance summary',
        'POST /api/balance/deduct': 'Deduct balance for bet placement',
        'POST /api/balance/credit': 'Credit balance for wins/pushes',
        'PUT /api/balance/update': 'Update balance (admin)'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Initialize database tables
    await initializeDatabase();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/api`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer(); 
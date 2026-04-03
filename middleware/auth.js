const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware to verify wallet address
const verifyWalletAddress = async (req, res, next) => {
  const { wallet_address } = req.body;
  
  if (!wallet_address) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }

  // Basic wallet address validation (you can enhance this based on your needs)
  if (wallet_address.length < 10) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }

  try {
    const connection = await pool.getConnection();
    
    // Check if user exists, if not create one
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    if (users.length === 0) {
      // Create new user
      const [result] = await connection.execute(
        'INSERT INTO users (wallet_address) VALUES (?)',
        [wallet_address]
      );
      req.user = {
        id: result.insertId,
        wallet_address,
        balance: 0
      };
    } else {
      req.user = users[0];
    }

    connection.release();
    next();
  } catch (error) {
    console.error('Error verifying wallet address:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Rate limiting middleware
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  }
});

module.exports = {
  authenticateToken,
  verifyWalletAddress,
  apiLimiter,
  authLimiter
}; 
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verifyWalletAddress, authLimiter } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Login/Register with wallet address
router.post('/login', 
  authLimiter,
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('wallet_address').isLength({ min: 10 }).withMessage('Invalid wallet address format')
  ],
  verifyWalletAddress,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address } = req.body;
      const user = req.user;

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: user.id, 
          wallet_address: user.wallet_address 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            wallet_address: user.wallet_address,
            balance: user.balance,
            username: user.username
          },
          token
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const connection = await pool.getConnection();
    
    const [users] = await connection.execute(
      'SELECT id, wallet_address, username, balance, created_at FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    connection.release();

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update username
router.put('/profile', 
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('username').optional().isLength({ min: 2, max: 50 }).withMessage('Username must be between 2 and 50 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address, username } = req.body;

      const connection = await pool.getConnection();
      
      const [result] = await connection.execute(
        'UPDATE users SET username = ? WHERE wallet_address = ?',
        [username, wallet_address]
      );

      connection.release();

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router; 
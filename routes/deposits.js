const express = require('express');
const { pool } = require('../config/database');
const { verifyWalletAddress, apiLimiter } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Create a new deposit
router.post('/create', 
  apiLimiter,
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('amount').isFloat({ min: 0.00000001 }).withMessage('Amount must be a positive number'),
    body('transaction_hash').optional().isString().withMessage('Transaction hash must be a string')
  ],
  verifyWalletAddress,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address, amount, transaction_hash } = req.body;
      const user = req.user;

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Create deposit record
        const [depositResult] = await connection.execute(
          'INSERT INTO deposits (user_id, wallet_address, amount, transaction_hash, status) VALUES (?, ?, ?, ?, ?)',
          [user.id, wallet_address, amount, transaction_hash || null, 'pending']
        );

        // Update user balance
        const [updateResult] = await connection.execute(
          'UPDATE users SET balance = balance + ? WHERE id = ?',
          [amount, user.id]
        );

        // Record balance history
        const [balanceHistoryResult] = await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, 'deposit', amount, user.balance, parseFloat(user.balance) + parseFloat(amount), depositResult.insertId, 'deposit']
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Deposit created successfully',
          data: {
            deposit_id: depositResult.insertId,
            amount,
            status: 'pending'
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Create deposit error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get user deposits
router.get('/history', async (req, res) => {
  try {
    const { wallet_address, page = 1, limit = 10 } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const offset = (page - 1) * limit;
    
    const connection = await pool.getConnection();
    
    // Get user ID
    const [users] = await connection.execute(
      'SELECT id FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].id;

    // Get deposits with pagination
    const [deposits] = await connection.execute(
      'SELECT id, amount, transaction_hash, status, created_at FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM deposits WHERE user_id = ?',
      [userId]
    );

    connection.release();

    res.json({
      success: true,
      data: {
        deposits,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update deposit status (admin function)
router.put('/:id/status', 
  [
    body('status').isIn(['pending', 'completed', 'failed']).withMessage('Invalid status'),
    body('wallet_address').notEmpty().withMessage('Wallet address is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status, wallet_address } = req.body;

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get deposit details
        const [deposits] = await connection.execute(
          'SELECT d.*, u.wallet_address FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.id = ? AND u.wallet_address = ?',
          [id, wallet_address]
        );

        if (deposits.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Deposit not found' });
        }

        const deposit = deposits[0];

        // Update deposit status
        await connection.execute(
          'UPDATE deposits SET status = ? WHERE id = ?',
          [status, id]
        );

        // If status is failed, revert the balance
        if (status === 'failed' && deposit.status === 'completed') {
          await connection.execute(
            'UPDATE users SET balance = balance - ? WHERE id = ?',
            [deposit.amount, deposit.user_id]
          );

          // Record balance history for failed deposit
          await connection.execute(
            'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [deposit.user_id, 'withdrawal', deposit.amount, deposit.amount, 0, id, 'deposit_failed']
          );
        }

        await connection.commit();

        res.json({
          success: true,
          message: 'Deposit status updated successfully',
          data: { status }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Update deposit status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router; 
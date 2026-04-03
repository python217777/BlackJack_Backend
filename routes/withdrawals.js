const express = require('express');
const { pool } = require('../config/database');
const { verifyWalletAddress, apiLimiter } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Create a new withdrawal request
router.post('/create', 
  apiLimiter,
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('amount').isFloat({ min: 0.00000001 }).withMessage('Amount must be a positive number'),
    body('withdrawal_address').notEmpty().withMessage('Withdrawal address is required')
  ],
  verifyWalletAddress,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address, amount, withdrawal_address } = req.body;
      const user = req.user;

      // Check if user has sufficient balance
      if (parseFloat(user.balance) < parseFloat(amount)) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Create withdrawal record
        const [withdrawalResult] = await connection.execute(
          'INSERT INTO withdrawals (user_id, wallet_address, amount, status) VALUES (?, ?, ?, ?)',
          [user.id, withdrawal_address, amount, 'pending']
        );

        // Deduct from user balance
        const [updateResult] = await connection.execute(
          'UPDATE users SET balance = balance - ? WHERE id = ?',
          [amount, user.id]
        );

        // Record balance history
        const [balanceHistoryResult] = await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, 'withdrawal', amount, user.balance, parseFloat(user.balance) - parseFloat(amount), withdrawalResult.insertId, 'withdrawal']
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Withdrawal request created successfully',
          data: {
            withdrawal_id: withdrawalResult.insertId,
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
      console.error('Create withdrawal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get user withdrawals
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

    // Get withdrawals with pagination
    const [withdrawals] = await connection.execute(
      'SELECT id, amount, wallet_address as withdrawal_address, transaction_hash, status, created_at FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM withdrawals WHERE user_id = ?',
      [userId]
    );

    connection.release();

    res.json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update withdrawal status (admin function)
router.put('/:id/status', 
  [
    body('status').isIn(['pending', 'completed', 'failed']).withMessage('Invalid status'),
    body('transaction_hash').optional().isString().withMessage('Transaction hash must be a string'),
    body('wallet_address').notEmpty().withMessage('Wallet address is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status, transaction_hash, wallet_address } = req.body;

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get withdrawal details
        const [withdrawals] = await connection.execute(
          'SELECT w.*, u.wallet_address as user_wallet FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.id = ? AND u.wallet_address = ?',
          [id, wallet_address]
        );

        if (withdrawals.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Withdrawal not found' });
        }

        const withdrawal = withdrawals[0];

        // Update withdrawal status
        await connection.execute(
          'UPDATE withdrawals SET status = ?, transaction_hash = ? WHERE id = ?',
          [status, transaction_hash || null, id]
        );

        // If status is failed, return the balance to user
        if (status === 'failed' && withdrawal.status === 'pending') {
          await connection.execute(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [withdrawal.amount, withdrawal.user_id]
          );

          // Record balance history for failed withdrawal
          await connection.execute(
            'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [withdrawal.user_id, 'deposit', withdrawal.amount, 0, withdrawal.amount, id, 'withdrawal_failed']
          );
        }

        await connection.commit();

        res.json({
          success: true,
          message: 'Withdrawal status updated successfully',
          data: { status }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Update withdrawal status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router; 
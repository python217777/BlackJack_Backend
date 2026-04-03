const express = require('express');
const { pool } = require('../config/database');
const { verifyWalletAddress, apiLimiter } = require('../middleware/auth');

const router = express.Router();

// Get user balance
router.get('/balance', async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const connection = await pool.getConnection();
    
    let [users] = await connection.execute(
      'SELECT id, wallet_address, username, balance, created_at FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    if (users.length === 0) {
      // Create new user
      const [newUser] = await connection.execute(
        'INSERT INTO users (wallet_address, username, balance, created_at) VALUES (?, ?, ?, NOW())',
        [wallet_address, `User_${wallet_address.slice(0, 8)}`, 0]
      );
      
      // Get the newly created user
      [users] = await connection.execute(
        'SELECT id, wallet_address, username, balance, created_at FROM users WHERE wallet_address = ?',
        [wallet_address]
      );
    }

    connection.release();

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get balance history
router.get('/history', async (req, res) => {
  try {
    const { wallet_address, page = 1, limit = 10, type } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const offset = (page - 1) * limit;
    
    const connection = await pool.getConnection();
    
    // Get user ID or create if doesn't exist
    let [users] = await connection.execute(
      'SELECT id FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    let userId;

    if (users.length === 0) {
      // Create new user
      const [newUser] = await connection.execute(
        'INSERT INTO users (wallet_address, username, balance, created_at) VALUES (?, ?, ?, NOW())',
        [wallet_address, `User_${wallet_address.slice(0, 8)}`, 0]
      );
      
      userId = newUser.insertId;
    } else {
      userId = users[0].id;
    }

    // Build query with filters
    let query = 'SELECT id, type, amount, previous_balance, new_balance, reference_id, reference_type, created_at FROM balance_history WHERE user_id = ?';
    let queryParams = [userId];

    if (type) {
      query += ' AND type = ?';
      queryParams.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    // Get balance history with pagination
    const [history] = await connection.execute(query, queryParams);

    // Get total count with same filters
    let countQuery = 'SELECT COUNT(*) as total FROM balance_history WHERE user_id = ?';
    let countParams = [userId];

    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    const [countResult] = await connection.execute(countQuery, countParams);

    connection.release();

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get balance history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get balance summary
router.get('/summary', async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const connection = await pool.getConnection();
    
    // Get user ID or create if doesn't exist
    let [users] = await connection.execute(
      'SELECT id FROM users WHERE wallet_address = ?',
      [wallet_address]
    );

    let userId;

    if (users.length === 0) {
      // Create new user
      const [newUser] = await connection.execute(
        'INSERT INTO users (wallet_address, username, balance, created_at) VALUES (?, ?, ?, NOW())',
        [wallet_address, `User_${wallet_address.slice(0, 8)}`, 0]
      );
      
      userId = newUser.insertId;
    } else {
      userId = users[0].id;
    }

    // Get total deposits
    const [totalDepositsResult] = await connection.execute(
      'SELECT SUM(amount) as total FROM balance_history WHERE user_id = ? AND type = "deposit"',
      [userId]
    );

    // Get total withdrawals
    const [totalWithdrawalsResult] = await connection.execute(
      'SELECT SUM(amount) as total FROM balance_history WHERE user_id = ? AND type = "withdrawal"',
      [userId]
    );

    // Get total bet wins
    const [totalBetWinsResult] = await connection.execute(
      'SELECT SUM(amount) as total FROM balance_history WHERE user_id = ? AND type = "bet_win"',
      [userId]
    );

    // Get total bet losses
    const [totalBetLossesResult] = await connection.execute(
      'SELECT SUM(amount) as total FROM balance_history WHERE user_id = ? AND type = "bet_loss"',
      [userId]
    );

    // Get current balance
    const [currentBalanceResult] = await connection.execute(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    connection.release();

    const totalDeposits = parseFloat(totalDepositsResult[0].total || 0);
    const totalWithdrawals = parseFloat(totalWithdrawalsResult[0].total || 0);
    const totalBetWins = parseFloat(totalBetWinsResult[0].total || 0);
    const totalBetLosses = parseFloat(totalBetLossesResult[0].total || 0);
    const currentBalance = parseFloat(currentBalanceResult[0].balance || 0);

    const netDeposits = totalDeposits - totalWithdrawals;
    const netGambling = totalBetWins - totalBetLosses;

    res.json({
      success: true,
      data: {
        current_balance: currentBalance,
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        total_bet_wins: totalBetWins,
        total_bet_losses: totalBetLosses,
        net_deposits: netDeposits,
        net_gambling: netGambling,
        total_profit: netGambling + netDeposits
      }
    });
  } catch (error) {
    console.error('Get balance summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deduct balance for bet placement
router.post('/deduct', 
  apiLimiter,
  async (req, res) => {
    try {
      const { wallet_address, amount, game_type = 'blackjack', reference_id } = req.body;
      
      if (!wallet_address || !amount) {
        return res.status(400).json({ error: 'Wallet address and amount are required' });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get user or create if doesn't exist
        let [users] = await connection.execute(
          'SELECT id, balance FROM users WHERE wallet_address = ?',
          [wallet_address]
        );

        let user;
        let previousBalance = 0;

        if (users.length === 0) {
          // Create new user
          const [newUser] = await connection.execute(
            'INSERT INTO users (wallet_address, username, balance, created_at) VALUES (?, ?, ?, NOW())',
            [wallet_address, `User_${wallet_address.slice(0, 8)}`, 0]
          );
          
          user = { id: newUser.insertId, balance: 0 };
          previousBalance = 0;
        } else {
          user = users[0];
          previousBalance = parseFloat(user.balance);
        }
        
        // Check if user has sufficient balance
        if (previousBalance < amount) {
          await connection.rollback();
          return res.status(400).json({ 
            error: 'Insufficient balance',
            data: {
              current_balance: previousBalance,
              required_amount: amount,
              shortfall: amount - previousBalance
            }
          });
        }

        const newBalance = previousBalance - parseFloat(amount);

        // Update user balance
        await connection.execute(
          'UPDATE users SET balance = ? WHERE id = ?',
          [newBalance, user.id]
        );

        // Record balance history
        await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, 'bet_placed', amount, previousBalance, newBalance, game_type, reference_id || null]
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Balance deducted successfully',
          data: {
            previous_balance: previousBalance,
            new_balance: newBalance,
            deducted_amount: amount,
            game_type,
            reference_id
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Deduct balance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Credit balance for wins and pushes
router.post('/credit', 
  apiLimiter,
  async (req, res) => {
    try {
      const { wallet_address, amount, game_type = 'blackjack', result_type, reference_id } = req.body;
      
      if (!wallet_address || !amount) {
        return res.status(400).json({ error: 'Wallet address and amount are required' });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get user or create if doesn't exist
        let [users] = await connection.execute(
          'SELECT id, balance FROM users WHERE wallet_address = ?',
          [wallet_address]
        );

        let user;
        let previousBalance = 0;

        if (users.length === 0) {
          // Create new user
          const [newUser] = await connection.execute(
            'INSERT INTO users (wallet_address, username, balance, created_at) VALUES (?, ?, ?, NOW())',
            [wallet_address, `User_${wallet_address.slice(0, 8)}`, 0]
          );
          
          user = { id: newUser.insertId, balance: 0 };
          previousBalance = 0;
        } else {
          user = users[0];
          previousBalance = parseFloat(user.balance);
        }

        const newBalance = previousBalance + parseFloat(amount);

        // Update user balance
        await connection.execute(
          'UPDATE users SET balance = ? WHERE id = ?',
          [newBalance, user.id]
        );

        // Record balance history with appropriate type
        const historyType = result_type === 'win' ? 'bet_win' : 
                           result_type === 'push' ? 'bet_push' : 'bet_credit';
        
        await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, historyType, amount, previousBalance, newBalance, game_type, reference_id || null]
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Balance credited successfully',
          data: {
            previous_balance: previousBalance,
            new_balance: newBalance,
            credited_amount: amount,
            game_type,
            result_type,
            reference_id
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Credit balance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update balance (admin function)
router.put('/update', 
  apiLimiter,
  async (req, res) => {
    try {
      const { wallet_address, amount, type, reason } = req.body;
      
      if (!wallet_address || !amount || !type) {
        return res.status(400).json({ error: 'Wallet address, amount, and type are required' });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get user
        const [users] = await connection.execute(
          'SELECT id, balance FROM users WHERE wallet_address = ?',
          [wallet_address]
        );

        if (users.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const previousBalance = parseFloat(user.balance);
        const newBalance = previousBalance + parseFloat(amount);

        // Update user balance
        await connection.execute(
          'UPDATE users SET balance = ? WHERE id = ?',
          [newBalance, user.id]
        );

        // Record balance history
        await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_type) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, type, Math.abs(amount), previousBalance, newBalance, reason || 'admin_adjustment']
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Balance updated successfully',
          data: {
            previous_balance: previousBalance,
            new_balance: newBalance,
            change: amount
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Update balance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router; 
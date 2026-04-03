const express = require('express');
const { pool } = require('../config/database');
const { verifyWalletAddress, apiLimiter } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Save bet result
router.post('/save-result', 
  apiLimiter,
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('game_type').notEmpty().withMessage('Game type is required'),
    body('bet_amount').isFloat({ min: 0.00000001 }).withMessage('Bet amount must be a positive number'),
    body('result').isIn(['win', 'lose', 'push']).withMessage('Result must be win, lose, or push'),
    body('win_amount').isFloat({ min: 0 }).withMessage('Win amount must be a non-negative number'),
    body('game_data').optional().isObject().withMessage('Game data must be an object')
  ],
  async (req, res) => {
    console.log("save-result ---------------------------------------", req.body);
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address, game_type, bet_amount, result, win_amount, game_data } = req.body;
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Calculate balance changes
        let balanceChange = 0;

        if (result === 'win') {
          balanceChange = parseFloat(win_amount);
        } else if (result === 'lose') {
          balanceChange = -parseFloat(bet_amount);
        } else {
          // Draw - no balance change
          balanceChange = 0;
        }

        // Save bet history
        const [betResult] = await connection.execute(
          'INSERT INTO bet_history (wallet_address, game_type, bet_amount, win_amount, result, game_data) VALUES (?, ?, ?, ?, ?, ?)',
          [wallet_address, game_type, bet_amount, win_amount, result, JSON.stringify(game_data || {})]
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Bet result saved successfully',
          data: {
            bet_id: betResult.insertId,
            result,
            balance_change: balanceChange,
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Save bet result error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get bet history
router.get('/history', async (req, res) => {
  try {
    const { wallet_address, page = 1, limit = 10, game_type, result } = req.query;
    
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

    // Build query with filters
    let query = 'SELECT id, game_type, bet_amount, win_amount, result, game_data, created_at FROM bet_history WHERE user_id = ?';
    let queryParams = [userId];

    if (game_type) {
      query += ' AND game_type = ?';
      queryParams.push(game_type);
    }

    if (result) {
      query += ' AND result = ?';
      queryParams.push(result);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    // Get bet history with pagination
    const [bets] = await connection.execute(query, queryParams);

    // Get total count with same filters
    let countQuery = 'SELECT COUNT(*) as total FROM bet_history WHERE user_id = ?';
    let countParams = [userId];

    if (game_type) {
      countQuery += ' AND game_type = ?';
      countParams.push(game_type);
    }

    if (result) {
      countQuery += ' AND result = ?';
      countParams.push(result);
    }

    const [countResult] = await connection.execute(countQuery, countParams);

    // Parse game_data JSON for each bet
    const betsWithParsedData = bets.map(bet => ({
      ...bet,
      game_data: bet.game_data ? JSON.parse(bet.game_data) : {}
    }));

    connection.release();

    res.json({
      success: true,
      data: {
        bets: betsWithParsedData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get bet history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bet statistics
router.get('/statistics', async (req, res) => {
  try {
    const { wallet_address } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

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

    // Get total bets
    const [totalBetsResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM bet_history WHERE user_id = ?',
      [userId]
    );

    // Get total bet amount
    const [totalBetAmountResult] = await connection.execute(
      'SELECT SUM(bet_amount) as total FROM bet_history WHERE user_id = ?',
      [userId]
    );

    // Get total win amount
    const [totalWinAmountResult] = await connection.execute(
      'SELECT SUM(win_amount) as total FROM bet_history WHERE user_id = ? AND result = "win"',
      [userId]
    );

    // Get wins count
    const [winsResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM bet_history WHERE user_id = ? AND result = "win"',
      [userId]
    );

    // Get losses count
    const [lossesResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM bet_history WHERE user_id = ? AND result = "lose"',
      [userId]
    );

    // Get draws count
    const [drawsResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM bet_history WHERE user_id = ? AND result = "draw"',
      [userId]
    );

    // Get game type breakdown
    const [gameTypeResult] = await connection.execute(
      'SELECT game_type, COUNT(*) as count FROM bet_history WHERE user_id = ? GROUP BY game_type',
      [userId]
    );

    connection.release();

    const totalBets = totalBetsResult[0].total;
    const totalBetAmount = parseFloat(totalBetAmountResult[0].total || 0);
    const totalWinAmount = parseFloat(totalWinAmountResult[0].total || 0);
    const wins = winsResult[0].total;
    const losses = lossesResult[0].total;
    const draws = drawsResult[0].total;
    const winRate = totalBets > 0 ? (wins / totalBets * 100).toFixed(2) : 0;
    const netProfit = totalWinAmount - totalBetAmount;

    res.json({
      success: true,
      data: {
        total_bets: totalBets,
        total_bet_amount: totalBetAmount,
        total_win_amount: totalWinAmount,
        wins,
        losses,
        draws,
        win_rate: parseFloat(winRate),
        net_profit: netProfit,
        game_types: gameTypeResult
      }
    });
  } catch (error) {
    console.error('Get bet statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent bets
router.get('/recent', async (req, res) => {
  try {
    const { wallet_address, limit = 5 } = req.query;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

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

    // Get recent bets
    const [bets] = await connection.execute(
      'SELECT id, game_type, bet_amount, win_amount, result, created_at FROM bet_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, parseInt(limit)]
    );

    connection.release();

    res.json({
      success: true,
      data: bets
    });
  } catch (error) {
    console.error('Get recent bets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Real play bet endpoint
router.post('/real-play', 
  apiLimiter,
  [
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('game_type').notEmpty().withMessage('Game type is required'),
    body('bet_amount').isFloat({ min: 0.00000001 }).withMessage('Bet amount must be a positive number'),
    body('game_data').optional().isObject().withMessage('Game data must be an object')
  ],
  verifyWalletAddress,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { wallet_address, game_type, bet_amount, game_data } = req.body;
      const user = req.user;

      // Check if user has sufficient balance for the bet
      if (parseFloat(user.balance) < parseFloat(bet_amount)) {
        return res.status(400).json({ error: 'Insufficient balance for bet' });
      }

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Deduct bet amount from balance immediately
        const newBalance = parseFloat(user.balance) - parseFloat(bet_amount);
        await connection.execute(
          'UPDATE users SET balance = ? WHERE id = ?',
          [newBalance, user.id]
        );

        // Record the bet (pending result)
        const [betResult] = await connection.execute(
          'INSERT INTO bet_history (user_id, game_type, bet_amount, win_amount, result, game_data) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, game_type, bet_amount, 0, 'pending', JSON.stringify(game_data || {})]
        );

        // Record balance history for bet deduction
        await connection.execute(
          'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, 'bet_loss', bet_amount, user.balance, newBalance, betResult.insertId, 'bet']
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Bet placed successfully',
          data: {
            bet_id: betResult.insertId,
            bet_amount: parseFloat(bet_amount),
            new_balance: newBalance,
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
      console.error('Real play bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Complete bet with result
router.post('/complete-bet', 
  apiLimiter,
  [
    body('bet_id').isInt().withMessage('Bet ID is required'),
    body('wallet_address').notEmpty().withMessage('Wallet address is required'),
    body('result').isIn(['win', 'lose', 'draw']).withMessage('Result must be win, lose, or draw'),
    body('win_amount').isFloat({ min: 0 }).withMessage('Win amount must be a non-negative number'),
    body('payout_multiplier').optional().isFloat({ min: 0 }).withMessage('Payout multiplier must be a non-negative number')
  ],
  verifyWalletAddress,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bet_id, wallet_address, result, win_amount, payout_multiplier } = req.body;
      const user = req.user;

      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get the bet details
        const [bets] = await connection.execute(
          'SELECT * FROM bet_history WHERE id = ? AND user_id = ? AND result = "pending"',
          [bet_id, user.id]
        );

        if (bets.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Bet not found or already completed' });
        }

        const bet = bets[0];
        const currentBalance = parseFloat(user.balance);

        // Calculate balance changes
        let balanceChange = 0;
        let balanceType = '';

        if (result === 'win') {
          balanceChange = parseFloat(win_amount);
          balanceType = 'bet_win';
        } else if (result === 'lose') {
          balanceChange = 0; // Already deducted when bet was placed
          balanceType = 'bet_loss';
        } else {
          // Draw - return the bet amount
          balanceChange = parseFloat(bet.bet_amount);
          balanceType = 'bet_win';
        }

        const newBalance = currentBalance + balanceChange;

        // Update bet result
        await connection.execute(
          'UPDATE bet_history SET result = ?, win_amount = ? WHERE id = ?',
          [result, win_amount, bet_id]
        );

        // Update user balance
        await connection.execute(
          'UPDATE users SET balance = ? WHERE id = ?',
          [newBalance, user.id]
        );

        // Record balance history for result
        if (balanceChange > 0) {
          await connection.execute(
            'INSERT INTO balance_history (user_id, type, amount, previous_balance, new_balance, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user.id, balanceType, balanceChange, currentBalance, newBalance, bet_id, 'bet_result']
          );
        }

        await connection.commit();

        res.json({
          success: true,
          message: 'Bet completed successfully',
          data: {
            bet_id: parseInt(bet_id),
            result,
            win_amount: parseFloat(win_amount),
            balance_change: balanceChange,
            new_balance: newBalance,
            payout_multiplier: payout_multiplier || 1
          }
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Complete bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get all users bet history (admin function)
router.get('/all-history', async (req, res) => {
  try {
    const { page = 1, limit = 20, game_type, result, wallet_address } = req.query;
    
    const offset = (page - 1) * limit;
    
    const connection = await pool.getConnection();
    
    // Build query with filters
    let query = `SELECT * FROM bet_history WHERE 1=1`;
    let queryParams = [];

    if (game_type) {
      query += ' AND game_type = ?';
      queryParams.push(game_type);
    }

    if (result) {
      query += ' AND result = ?';
      queryParams.push(result);
    }

    if (wallet_address) {
      query += ' AND wallet_address LIKE ?';
      queryParams.push(`%${wallet_address}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit).toString(), offset.toString());

    // Get bet history with pagination
    const [bets] = await connection.execute(query, queryParams);

    // Get total count with same filters
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM bet_history 
      WHERE 1=1
    `;
    let countParams = [];

    if (game_type) {
      countQuery += ' AND game_type = ?';
      countParams.push(game_type);
    }

    if (result) {
      countQuery += ' AND result = ?';
      countParams.push(result);
    }

    if (wallet_address) {
      countQuery += ' AND wallet_address LIKE ?';
      countParams.push(`%${wallet_address}%`);
    }

    const [countResult] = await connection.execute(countQuery, countParams);
    connection.release();

    res.json({
      success: true,
      data: {
        bets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all bet history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 
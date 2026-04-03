# Lucky Casino Backend

A Node.js backend API for the Lucky Casino game, providing deposit/withdrawal management, bet history tracking, and user balance management with MySQL database integration.

## Features

- 🔐 **Authentication**: Wallet-based user authentication
- 💰 **Deposit/Withdrawal System**: Complete deposit and withdrawal management
- 🎰 **Bet History**: Track all betting activities and results
- 💳 **Balance Management**: Real-time balance updates and history
- 📊 **Statistics**: Comprehensive betting and financial statistics
- 🔒 **Security**: Rate limiting, input validation, and secure transactions
- 📈 **Pagination**: Efficient data retrieval with pagination support

## Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   cd lucky_backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=lucky_casino
   DB_PORT=3306

   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=24h

   # CORS Configuration
   FRONTEND_URL=http://localhost:3000
   ```

4. **Set up MySQL database**
   ```sql
   CREATE DATABASE lucky_casino;
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login/Register with wallet address
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update username

### Deposits
- `POST /api/deposits/create` - Create a new deposit
- `GET /api/deposits/history` - Get user deposits
- `PUT /api/deposits/:id/status` - Update deposit status

### Withdrawals
- `POST /api/withdrawals/create` - Create a new withdrawal
- `GET /api/withdrawals/history` - Get user withdrawals
- `PUT /api/withdrawals/:id/status` - Update withdrawal status

### Bets
- `POST /api/bets/save-result` - Save bet result
- `GET /api/bets/history` - Get bet history
- `GET /api/bets/statistics` - Get bet statistics
- `GET /api/bets/recent` - Get recent bets

### Balance
- `GET /api/balance/balance` - Get user balance
- `GET /api/balance/history` - Get balance history
- `GET /api/balance/summary` - Get balance summary
- `PUT /api/balance/update` - Update balance (admin)

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100),
  balance DECIMAL(20,8) DEFAULT 0.00000000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Deposits Table
```sql
CREATE TABLE deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  transaction_hash VARCHAR(255),
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Withdrawals Table
```sql
CREATE TABLE withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  transaction_hash VARCHAR(255),
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Bet History Table
```sql
CREATE TABLE bet_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  game_type VARCHAR(50) NOT NULL,
  bet_amount DECIMAL(20,8) NOT NULL,
  win_amount DECIMAL(20,8) DEFAULT 0.00000000,
  result ENUM('win', 'lose', 'draw') NOT NULL,
  game_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Balance History Table
```sql
CREATE TABLE balance_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit', 'withdrawal', 'bet_win', 'bet_loss', 'bonus') NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  previous_balance DECIMAL(20,8) NOT NULL,
  new_balance DECIMAL(20,8) NOT NULL,
  reference_id INT,
  reference_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Usage Examples

### Frontend Integration

```javascript
// Example: Save bet result
const saveBetResult = async (walletAddress, betData) => {
  try {
    const response = await fetch('http://localhost:3001/api/bets/save-result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        game_type: 'blackjack',
        bet_amount: 10.0,
        result: 'win',
        win_amount: 20.0,
        game_data: {
          player_cards: ['A♠', 'K♥'],
          dealer_cards: ['7♣', '9♦'],
          final_score: 21
        }
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error saving bet result:', error);
  }
};

// Example: Get user balance
const getUserBalance = async (walletAddress) => {
  try {
    const response = await fetch(`http://localhost:3001/api/balance/balance?wallet_address=${walletAddress}`);
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error getting balance:', error);
  }
};

// Example: Create deposit
const createDeposit = async (walletAddress, amount, transactionHash) => {
  try {
    const response = await fetch('http://localhost:3001/api/deposits/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        amount: amount,
        transaction_hash: transactionHash
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating deposit:', error);
  }
};
```

## Security Features

- **Rate Limiting**: Prevents abuse with configurable rate limits
- **Input Validation**: Comprehensive validation using express-validator
- **SQL Injection Protection**: Parameterized queries with mysql2
- **CORS Protection**: Configurable CORS settings
- **Helmet Security**: Security headers with helmet middleware
- **Transaction Safety**: Database transactions for critical operations

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message",
  "errors": [
    {
      "field": "wallet_address",
      "message": "Wallet address is required"
    }
  ]
}
```

## Development

### Running in Development Mode
```bash
npm run dev
```

### Running Tests
```bash
npm test
```

### Health Check
```bash
curl http://localhost:3001/health
```

### API Documentation
```bash
curl http://localhost:3001/api
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_USER` | MySQL username | root |
| `DB_PASSWORD` | MySQL password | - |
| `DB_NAME` | Database name | lucky_casino |
| `DB_PORT` | MySQL port | 3306 |
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment | development |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | JWT expiration | 24h |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details "# lucky_backend" 

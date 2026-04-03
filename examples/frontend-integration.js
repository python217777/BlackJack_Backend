// Frontend Integration Examples for Lucky Casino
// This file shows how to integrate the backend API with your React frontend

const API_BASE_URL = 'http://localhost:3001/api';

// API Helper Functions
class LuckyCasinoAPI {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Generic request helper
  async makeRequest(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Authentication
  async login(walletAddress) {
    return this.makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ wallet_address: walletAddress }),
    });
  }

  async getProfile(walletAddress) {
    return this.makeRequest(`/auth/profile?wallet_address=${walletAddress}`);
  }

  async updateProfile(walletAddress, username) {
    return this.makeRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ wallet_address: walletAddress, username }),
    });
  }

  // Balance Management
  async getBalance(walletAddress) {
    return this.makeRequest(`/balance/balance?wallet_address=${walletAddress}`);
  }

  async getBalanceHistory(walletAddress, page = 1, limit = 10) {
    return this.makeRequest(
      `/balance/history?wallet_address=${walletAddress}&page=${page}&limit=${limit}`
    );
  }

  async getBalanceSummary(walletAddress) {
    return this.makeRequest(`/balance/summary?wallet_address=${walletAddress}`);
  }

  // Deposits
  async createDeposit(walletAddress, amount, transactionHash = null) {
    return this.makeRequest('/deposits/create', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: walletAddress,
        amount,
        transaction_hash: transactionHash,
      }),
    });
  }

  async getDepositHistory(walletAddress, page = 1, limit = 10) {
    return this.makeRequest(
      `/deposits/history?wallet_address=${walletAddress}&page=${page}&limit=${limit}`
    );
  }

  // Withdrawals
  async createWithdrawal(walletAddress, amount, withdrawalAddress) {
    return this.makeRequest('/withdrawals/create', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: walletAddress,
        amount,
        withdrawal_address: withdrawalAddress,
      }),
    });
  }

  async getWithdrawalHistory(walletAddress, page = 1, limit = 10) {
    return this.makeRequest(
      `/withdrawals/history?wallet_address=${walletAddress}&page=${page}&limit=${limit}`
    );
  }

  // Bet Management
  async saveBetResult(walletAddress, betData) {
    return this.makeRequest('/bets/save-result', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: walletAddress,
        ...betData,
      }),
    });
  }

  async getBetHistory(walletAddress, page = 1, limit = 10, filters = {}) {
    const params = new URLSearchParams({
      wallet_address: walletAddress,
      page,
      limit,
      ...filters,
    });
    return this.makeRequest(`/bets/history?${params}`);
  }

  async getBetStatistics(walletAddress) {
    return this.makeRequest(`/bets/statistics?wallet_address=${walletAddress}`);
  }

  async getRecentBets(walletAddress, limit = 5) {
    return this.makeRequest(
      `/bets/recent?wallet_address=${walletAddress}&limit=${limit}`
    );
  }
}

// React Hook for API Integration
import { useState, useEffect, useCallback } from 'react';

export const useLuckyCasinoAPI = () => {
  const [api] = useState(() => new LuckyCasinoAPI());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeRequest = useCallback(async (requestFn) => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestFn();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    api,
    loading,
    error,
    executeRequest,
  };
};

// Example React Components

// User Authentication Component
export const UserAuth = ({ walletAddress, onLogin }) => {
  const { api, loading, error, executeRequest } = useLuckyCasinoAPI();

  const handleLogin = async () => {
    try {
      const result = await executeRequest(() => api.login(walletAddress));
      onLogin(result.data);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
};

// Balance Display Component
export const BalanceDisplay = ({ walletAddress }) => {
  const { api, loading, error, executeRequest } = useLuckyCasinoAPI();
  const [balance, setBalance] = useState(null);

  const fetchBalance = useCallback(async () => {
    try {
      const result = await executeRequest(() => api.getBalance(walletAddress));
      setBalance(result.data);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  }, [walletAddress, executeRequest]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
    }
  }, [walletAddress, fetchBalance]);

  if (loading) return <div>Loading balance...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!balance) return <div>No balance data</div>;

  return (
    <div>
      <h3>Balance: {balance.balance} SOL</h3>
      <button onClick={fetchBalance}>Refresh</button>
    </div>
  );
};

// Bet History Component
export const BetHistory = ({ walletAddress }) => {
  const { api, loading, error, executeRequest } = useLuckyCasinoAPI();
  const [bets, setBets] = useState([]);
  const [page, setPage] = useState(1);

  const fetchBets = useCallback(async () => {
    try {
      const result = await executeRequest(() =>
        api.getBetHistory(walletAddress, page, 10)
      );
      setBets(result.data.bets);
    } catch (err) {
      console.error('Failed to fetch bet history:', err);
    }
  }, [walletAddress, page, executeRequest]);

  useEffect(() => {
    if (walletAddress) {
      fetchBets();
    }
  }, [walletAddress, page, fetchBets]);

  if (loading) return <div>Loading bet history...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Bet History</h3>
      {bets.map((bet) => (
        <div key={bet.id} className="bet-item">
          <div>Game: {bet.game_type}</div>
          <div>Bet: {bet.bet_amount} SOL</div>
          <div>Result: {bet.result}</div>
          <div>Win: {bet.win_amount} SOL</div>
          <div>Date: {new Date(bet.created_at).toLocaleDateString()}</div>
        </div>
      ))}
      <div>
        <button onClick={() => setPage(page - 1)} disabled={page === 1}>
          Previous
        </button>
        <span>Page {page}</span>
        <button onClick={() => setPage(page + 1)} disabled={bets.length < 10}>
          Next
        </button>
      </div>
    </div>
  );
};

// Game Integration Example
export const GameIntegration = ({ walletAddress, gameType }) => {
  const { api, executeRequest } = useLuckyCasinoAPI();

  const handleGameResult = async (betAmount, result, winAmount, gameData) => {
    try {
      const result = await executeRequest(() =>
        api.saveBetResult(walletAddress, {
          game_type: gameType,
          bet_amount: betAmount,
          result, // 'win', 'lose', or 'draw'
          win_amount: winAmount,
          game_data: gameData,
        })
      );

      console.log('Bet result saved:', result);
      return result;
    } catch (err) {
      console.error('Failed to save bet result:', err);
      throw err;
    }
  };

  // Example usage in your game component
  const handleBlackjackResult = async (playerScore, dealerScore, betAmount) => {
    let result, winAmount;

    if (playerScore > 21) {
      result = 'lose';
      winAmount = 0;
    } else if (dealerScore > 21 || playerScore > dealerScore) {
      result = 'win';
      winAmount = betAmount * 2; // Blackjack pays 2:1
    } else if (playerScore === dealerScore) {
      result = 'draw';
      winAmount = betAmount; // Return original bet
    } else {
      result = 'lose';
      winAmount = 0;
    }

    await handleGameResult(betAmount, result, winAmount, {
      player_score: playerScore,
      dealer_score: dealerScore,
      game_type: 'blackjack',
    });
  };

  return null; // This component doesn't render anything, it's just for integration
};

// Deposit/Withdrawal Components
export const DepositForm = ({ walletAddress, onSuccess }) => {
  const { api, loading, error, executeRequest } = useLuckyCasinoAPI();
  const [amount, setAmount] = useState('');

  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      const result = await executeRequest(() =>
        api.createDeposit(walletAddress, parseFloat(amount))
      );
      onSuccess(result.data);
      setAmount('');
    } catch (err) {
      console.error('Deposit failed:', err);
    }
  };

  return (
    <form onSubmit={handleDeposit}>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount in SOL"
        step="0.00000001"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Processing...' : 'Deposit'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
};

export const WithdrawalForm = ({ walletAddress, onSuccess }) => {
  const { api, loading, error, executeRequest } = useLuckyCasinoAPI();
  const [amount, setAmount] = useState('');
  const [withdrawalAddress, setWithdrawalAddress] = useState('');

  const handleWithdrawal = async (e) => {
    e.preventDefault();
    try {
      const result = await executeRequest(() =>
        api.createWithdrawal(walletAddress, parseFloat(amount), withdrawalAddress)
      );
      onSuccess(result.data);
      setAmount('');
      setWithdrawalAddress('');
    } catch (err) {
      console.error('Withdrawal failed:', err);
    }
  };

  return (
    <form onSubmit={handleWithdrawal}>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount in SOL"
        step="0.00000001"
        required
      />
      <input
        type="text"
        value={withdrawalAddress}
        onChange={(e) => setWithdrawalAddress(e.target.value)}
        placeholder="Withdrawal Address"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Processing...' : 'Withdraw'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
};

// Export the API class for direct usage
export default LuckyCasinoAPI; 
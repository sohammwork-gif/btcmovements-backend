const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware - SIMPLE
app.use(cors());
app.use(express.json());

// PORT for Render
const PORT = process.env.PORT || 10000;

// Bybit API
const BYBIT_API = 'https://api.bybit.com/v5/market/kline';

// Simple interval mapping
function getBybitInterval(resolution) {
  const map = {
    '1': '1', '5': '5', '15': '15', '30': '30', '60': '60',
    'D': 'D', 'W': 'W'
  };
  return map[resolution] || '60';
}

// HEALTH CHECK - SIMPLE
app.get('/api/health', (req, res) => {
  console.log('✅ Health check received');
  res.json({ 
    status: 'OK', 
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

// CANDLES ENDPOINT - SIMPLE
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, resolution = '60', limit = 100 } = req.query;
    
    console.log('📡 Fetching from Bybit:', { instrument_name, resolution, limit });

    const response = await axios.get(BYBIT_API, {
      params: {
        category: 'linear',
        symbol: 'BTCUSDT',
        interval: getBybitInterval(resolution),
        limit: parseInt(limit)
      },
      timeout: 10000
    });

    if (response.data.retCode !== 0) {
      return res.status(400).json({ error: response.data.retMsg });
    }

    const candles = response.data.result.list.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    })).reverse();

    console.log(`✅ Returning ${candles.length} candles`);
    res.json(candles);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: 'Backend error',
      details: error.message 
    });
  }
});

// ROOT - SIMPLE
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements API',
    endpoints: ['/api/health', '/api/candles'] 
  });
});

// START SERVER - SIMPLE
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
  console.log(`📊 Candles: http://localhost:${PORT}/api/candles`);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('🆘 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🆘 Unhandled Rejection at:', promise, 'reason:', reason);
});

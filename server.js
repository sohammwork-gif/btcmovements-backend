const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Binance Futures API
const BINANCE_API = 'https://fapi.binance.com/fapi/v1/klines';

// Convert resolution to Binance interval
function getBinanceInterval(resolution) {
  const intervalMap = {
    '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '120': '2h', '240': '4h', '360': '6h', '480': '8h', '720': '12h',
    'D': '1d', '1D': '1d', 'W': '1w', 'M': '1M'
  };
  return intervalMap[resolution] || '1h';
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution = '60', limit = 500 } = req.query;
    
    console.log('📈 Fetching from Binance:', { instrument_name, resolution, limit });

    const binanceInterval = getBinanceInterval(resolution);
    
    // Use BTCUSDT for perpetual futures
    const symbol = 'BTCUSDT';

    const response = await axios.get(BINANCE_API, {
      params: {
        symbol: symbol,
        interval: binanceInterval,
        startTime: start_ts || undefined,
        endTime: end_ts || undefined,
        limit: parseInt(limit)
      },
      timeout: 10000
    });

    // Binance returns: [timestamp, open, high, low, close, volume, ...]
    const formattedData = response.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    console.log(`✅ Success: Returning ${formattedData.length} candles from Binance`);
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ Binance API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timeout' });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch data from Binance',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend is running',
    timestamp: new Date().toISOString(),
    provider: 'Binance Futures API',
    limits: '1200 requests/minute'
  });
});

// Test Binance connection
app.get('/api/test', async (req, res) => {
  try {
    const response = await axios.get(BINANCE_API, {
      params: {
        symbol: 'BTCUSDT',
        interval: '1h',
        limit: 3
      }
    });
    
    res.json({ 
      status: 'Binance API Connected',
      sample_data: response.data,
      rate_limits: '1200 requests per minute'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Binance API Failed', 
      error: error.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements Backend API',
    version: '1.0',
    provider: 'Binance Futures API',
    endpoints: {
      health: '/api/health',
      candles: '/api/candles?instrument_name=BTC-PERPETUAL&resolution=60&limit=100',
      test: '/api/test'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BTC Movements Backend running on port ${PORT}`);
  console.log(`📊 Using Binance Futures API`);
  console.log(`⚡ Rate Limits: 1200 requests/minute`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
});

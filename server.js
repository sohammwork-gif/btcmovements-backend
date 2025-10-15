const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Use Render's port or default to 10000
const PORT = process.env.PORT || 10000;

// Binance API - High limits, no restrictions
const BYBIT_API = 'https://api.bybit.com/v5/market/kline';

// Convert resolution to Bybit interval
function getBybitInterval(resolution) {
  const intervalMap = {
    '1': '1', '3': '3', '5': '5', '15': '15', '30': '30',
    '60': '60', '120': '120', '240': '240', '360': '360', '720': '720',
    'D': 'D', '1D': 'D', 'W': 'W', 'M': 'M'
  };
  return intervalMap[resolution] || '60';
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution = '60' } = req.query;
    
    console.log('🚀 Fetching from Bybit:', { instrument_name, start_ts, end_ts, resolution });

    const bybitInterval = getBybitInterval(resolution);
    
    // Use linear for perpetual, spot for spot
    const category = instrument_name && instrument_name.includes('PERP') ? 'linear' : 'spot';
    const symbol = 'BTCUSDT';

    const response = await axios.get(BYBIT_API, {
      params: {
        category: category,
        symbol: symbol,
        interval: bybitInterval,
        start: start_ts || undefined,
        end: end_ts || undefined,
        limit: 1000
      },
      timeout: 10000
    });

    if (response.data.retCode !== 0) {
      throw new Error(response.data.retMsg || 'Bybit API error');
    }

    // Bybit returns: [timestamp, open, high, low, close, volume, turnover]
    const formattedData = response.data.result.list.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    })).reverse(); // Reverse to get chronological order

    console.log(`✅ Success: Returning ${formattedData.length} candles from Bybit`);
    
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ Bybit API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timeout' });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch data from Bybit',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend with Bybit is running',
    timestamp: new Date().toISOString(),
    provider: 'Bybit API',
    limits: '100 requests/second'
  });
});

// Root endpoint - simple response
app.get('/', (req, res) => {
  res.json({
    message: 'BTC Movements Backend API',
    endpoints: {
      candles: '/api/candles?instrument_name=BTC-PERPETUAL&resolution=60',
      health: '/api/health'
    }
  });
});

// Remove the static file serving that's causing the error
// app.use(express.static('public'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BTC Movements Backend running on port ${PORT}`);
  console.log(`📊 Bybit API Endpoint: http://localhost:${PORT}/api/candles`);
  console.log(`❤️ Health Check: http://localhost:${PORT}/api/health`);
});

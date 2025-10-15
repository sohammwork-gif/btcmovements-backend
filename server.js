const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 4809;

// Binance API configuration
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1/klines';

// Convert resolution to Binance interval
function getBinanceInterval(resolution) {
  const intervalMap = {
    '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '120': '2h', '240': '4h', '360': '6h', '480': '8h', '720': '12h',
    'D': '1d', '1D': '1d', '3D': '3d', 'W': '1w', 'M': '1M'
  };
  return intervalMap[resolution] || '1h';
}

// Main candles endpoint
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution = '60' } = req.query;
    
    console.log('Fetching data for:', { instrument_name, start_ts, end_ts, resolution });

    const binanceInterval = getBinanceInterval(resolution);
    
    const response = await axios.get(BINANCE_FUTURES_API, {
      params: {
        symbol: 'BTCUSDT',
        interval: binanceInterval,
        startTime: start_ts || undefined,
        endTime: end_ts || undefined,
        limit: 1000
      },
      timeout: 15000
    });

    const formattedData = response.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    console.log(`Returning ${formattedData.length} candles`);
    res.json(formattedData);
    
  } catch (error) {
    console.error('Binance API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timeout' });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch data from Binance',
      details: error.response?.data?.msg || error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BTC Movements Backend running on port ${PORT}`);
  console.log(`📊 Endpoint: http://localhost:${PORT}/api/candles`);
  console.log(`❤️ Health check: http://localhost:${PORT}/api/health`);
});
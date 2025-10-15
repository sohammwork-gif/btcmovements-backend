const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Multiple API endpoints as fallbacks
const API_ENDPOINTS = [
  {
    name: 'Bybit',
    url: 'https://api.bybit.com/v5/market/kline',
    params: { category: 'linear', symbol: 'BTCUSDT' }
  },
  {
    name: 'Binance Futures',
    url: 'https://fapi.binance.com/fapi/v1/klines',
    params: { symbol: 'BTCUSDT' }
  },
  {
    name: 'Binance Spot',
    url: 'https://api.binance.com/api/v3/klines',
    params: { symbol: 'BTCUSDT' }
  }
];

// Interval mapping for different APIs
function getInterval(resolution, apiName) {
  const map = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h',
    '240': '4h', 'D': '1d', 'W': '1w'
  };
  
  // Bybit uses numbers, Binance uses strings
  if (apiName === 'Bybit') {
    const bybitMap = { '1': '1', '5': '5', '15': '15', '30': '30', '60': '60', 'D': 'D' };
    return bybitMap[resolution] || '60';
  }
  
  return map[resolution] || '1h';
}

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend is running',
    timestamp: new Date().toISOString(),
    provider: 'Multi-API with fallbacks'
  });
});

// CANDLES ENDPOINT WITH FALLBACKS
app.get('/api/candles', async (req, res) => {
  const { instrument_name, resolution = '60', limit = 100 } = req.query;
  
  console.log('📡 Fetching data for:', { instrument_name, resolution, limit });

  // Try each API endpoint until one works
  for (let i = 0; i < API_ENDPOINTS.length; i++) {
    const api = API_ENDPOINTS[i];
    
    try {
      console.log(`🔄 Trying ${api.name}...`);
      
      const params = {
        ...api.params,
        interval: getInterval(resolution, api.name),
        limit: parseInt(limit)
      };
      
      const response = await axios.get(api.url, { 
        params, 
        timeout: 8000 
      });
      
      let candles;
      
      // Parse response based on API
      if (api.name === 'Bybit') {
        if (response.data.retCode !== 0) {
          throw new Error(response.data.retMsg);
        }
        candles = response.data.result.list.map(candle => ({
          timestamp: parseInt(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        })).reverse();
      } else {
        // Binance format
        candles = response.data.map(candle => ({
          timestamp: parseInt(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        }));
      }
      
      console.log(`✅ Success with ${api.name}: ${candles.length} candles`);
      return res.json(candles);
      
    } catch (error) {
      console.log(`❌ ${api.name} failed:`, error.message);
      // Continue to next API
    }
  }
  
  // All APIs failed
  console.error('💥 All APIs failed');
  res.status(500).json({ 
    error: 'All data sources failed',
    details: 'Please try again later or use different parameters'
  });
});

// ROOT
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements API',
    endpoints: ['/api/health', '/api/candles'],
    features: 'Multi-API fallback system'
  });
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
});

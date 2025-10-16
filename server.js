const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// OKX Public API - NO API KEYS NEEDED for market data
const OKX_API = 'https://www.okx.com/api/v5/market/candles';

// Convert resolution to OKX interval
function getOKXInterval(resolution) {
  const intervalMap = {
    '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1H', '120': '2H', '240': '4H', '360': '6H', '720': '12H',
    'D': '1D', '1D': '1D', 'W': '1W', 'M': '1M'
  };
  return intervalMap[resolution] || '1H';
}

// Get instrument ID based on selection
function getInstrumentId(instrument_name) {
  if (instrument_name.includes('BTC') && instrument_name.includes('PERP')) {
    return 'BTC-USDT-SWAP'; // BTC Perpetual Swap
  } else if (instrument_name.includes('ETH') && instrument_name.includes('PERP')) {
    return 'ETH-USDT-SWAP'; // ETH Perpetual Swap
  } else {
    return 'BTC-USDT-SWAP'; // Default to BTC
  }
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution = '60', limit = 100 } = req.query;
    
    console.log('🚀 Fetching from OKX:', { instrument_name, resolution, limit });

    const okxInterval = getOKXInterval(resolution);
    const instId = getInstrumentId(instrument_name);

    const response = await axios.get(OKX_API, {
      params: {
        instId: instId,
        bar: okxInterval,
        limit: parseInt(limit),
        after: start_ts || undefined,
        before: end_ts || undefined
      },
      timeout: 10000
    });

    if (response.data.code !== '0') {
      throw new Error(response.data.msg || 'OKX API error');
    }

    // OKX returns: [timestamp, open, high, low, close, volume, volumeCcy]
    const formattedData = response.data.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    console.log(`✅ Success: Returning ${formattedData.length} candles from OKX`);
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ OKX API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timeout' });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch data from OKX',
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
    provider: 'OKX Public API',
    limits: '20 requests/2 seconds',
    security: 'No API keys needed - public data only'
  });
});

// Test endpoint to verify OKX connection
app.get('/api/test', async (req, res) => {
  try {
    const response = await axios.get(OKX_API, {
      params: {
        instId: 'BTC-USDT-SWAP',
        bar: '1H',
        limit: 3
      }
    });
    
    res.json({ 
      status: 'OKX API Connected',
      sample_data: response.data.data,
      rate_limits: '20 requests per 2 seconds'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'OKX API Failed', 
      error: error.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements Backend API',
    version: '1.0',
    provider: 'OKX Public API',
    endpoints: {
      health: '/api/health',
      candles: '/api/candles?instrument_name=BTC-PERPETUAL&resolution=60&limit=100',
      test: '/api/test'
    },
    note: 'Using public market data - no authentication required'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BTC Movements Backend running on port ${PORT}`);
  console.log(`📊 Using OKX Public API - No authentication needed`);
  console.log(`⚡ Rate Limits: 20 requests/2 seconds`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
  console.log(`📈 Candles: http://localhost:${PORT}/api/candles`);
});

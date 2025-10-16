const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Binance SPOT API
const BINANCE_SPOT_API = 'https://api.binance.com/api/v3/klines';

// Convert resolution to Binance interval
function getBinanceInterval(resolution) {
  const map = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '120': '2h', '240': '4h', '360': '6h', '720': '12h',
    'D': '1d', '1D': '1d', 'W': '1w', 'M': '1M'
  };
  return map[resolution] || '1h';
}

// Get symbol for spot trading
function getSpotSymbol(instrument_name) {
  if (instrument_name.includes('BTC') && instrument_name.includes('SPOT')) {
    return 'BTCUSDT';
  } else if (instrument_name.includes('ETH') && instrument_name.includes('SPOT')) {
    return 'ETHUSDT';
  } else {
    return 'BTCUSDT'; // Default
  }
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution = '60', limit = 500 } = req.query;
    
    console.log('📈 Fetching SPOT data from Binance:', { instrument_name, resolution, limit });

    const binanceInterval = getBinanceInterval(resolution);
    const symbol = getSpotSymbol(instrument_name);

    const response = await axios.get(BINANCE_SPOT_API, {
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

    console.log(`✅ Success: Returning ${formattedData.length} SPOT candles for ${symbol}`);
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ Binance Spot API error:', error.message);
    
    // Fallback to mock data
    const mockData = generateMockData();
    console.log('🔄 Using mock data as fallback');
    res.json(mockData);
  }
});

// Generate realistic mock data as fallback
function generateMockData() {
  const basePrice = 60000;
  const data = [];
  const now = Date.now();
  
  for (let i = 0; i < 100; i++) {
    const timestamp = now - (100 - i) * 3600000;
    const variation = basePrice * 0.02 * (Math.random() - 0.5);
    const price = basePrice + variation;
    
    data.push({
      timestamp: timestamp,
      open: price,
      high: price + Math.random() * 200,
      low: price - Math.random() * 200,
      close: price + (Math.random() - 0.5) * 100,
      volume: 1000 + Math.random() * 5000
    });
  }
  
  return data;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend - Binance SPOT API',
    timestamp: new Date().toISOString(),
    provider: 'Binance Spot API',
    symbols: 'BTCUSDT, ETHUSDT',
    limits: '1200 requests/minute'
  });
});

// Test specific symbol
app.get('/api/test/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const response = await axios.get(BINANCE_SPOT_API, {
      params: {
        symbol: symbol,
        interval: '1h',
        limit: 3
      }
    });
    
    res.json({ 
      status: `Binance Spot API Connected for ${symbol}`,
      symbol: symbol,
      sample_data: response.data.map(candle => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4])
      })),
      rate_limits: '1200 requests per minute'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Binance Spot API Failed', 
      error: error.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements Backend API - SPOT DATA',
    version: '1.0',
    provider: 'Binance Spot API',
    symbols: {
      btc: 'BTC-USDT-SPOT',
      eth: 'ETH-USDT-SPOT'
    },
    endpoints: {
      health: '/api/health',
      candles: '/api/candles?instrument_name=BTC-USDT-SPOT&resolution=60&limit=100',
      test_btc: '/api/test/BTCUSDT',
      test_eth: '/api/test/ETHUSDT'
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BTC Movements Backend running on port ${PORT}`);
  console.log(`📊 Using Binance SPOT API`);
  console.log(`⚡ Rate Limits: 1200 requests/minute`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
});

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Binance PUBLIC API - no restrictions
const BINANCE_PUBLIC_API = 'https://api.binance.com/api/v3/klines';

// Convert resolution to Binance interval
function getBinanceInterval(resolution) {
  const map = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '240': '4h', 'D': '1d'
  };
  return map[resolution] || '1h';
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, resolution = '60', limit = 100 } = req.query;
    
    console.log('📈 Fetching from Binance Public API:', { resolution, limit });

    const response = await axios.get(BINANCE_PUBLIC_API, {
      params: {
        symbol: 'BTCUSDT',
        interval: getBinanceInterval(resolution),
        limit: parseInt(limit)
      },
      timeout: 10000
    });

    const formattedData = response.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    console.log(`✅ Success: ${formattedData.length} candles from Binance`);
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ Binance error:', error.message);
    
    // Fallback to mock data if Binance fails
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
    const timestamp = now - (100 - i) * 3600000; // 1 hour intervals
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

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend - Binance Public API',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📊 Using Binance Public API with fallback`);
});

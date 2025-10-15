// server.js - Using CoinGecko API (cloud-friendly)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CoinGecko API endpoint
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Map your frontend instrument names to CoinGecko IDs
const INSTRUMENT_MAP = {
  'BTC-PERPETUAL': { coinId: 'bitcoin', name: 'Bitcoin' },
  'ETH-PERPETUAL': { coinId: 'ethereum', name: 'Ethereum' },
  'BTC-SPOT': { coinId: 'bitcoin', name: 'Bitcoin' },
  'ETH-SPOT': { coinId: 'ethereum', name: 'Ethereum' },
};

function resolveInstrument(instrumentName) {
  if (INSTRUMENT_MAP[instrumentName]) return INSTRUMENT_MAP[instrumentName];
  if (instrumentName && instrumentName.toUpperCase().includes('PERPETUAL')) {
    if (instrumentName.toUpperCase().startsWith('BTC')) return INSTRUMENT_MAP['BTC-PERPETUAL'];
    if (instrumentName.toUpperCase().startsWith('ETH')) return INSTRUMENT_MAP['ETH-PERPETUAL'];
    return INSTRUMENT_MAP['BTC-PERPETUAL'];
  }
  return { coinId: 'bitcoin', name: 'Bitcoin' };
}

// /api/ticker => returns CoinGecko ticker data
app.get('/api/ticker', async (req, res) => {
  try {
    const { instrument_name } = req.query;
    if (!instrument_name) return res.status(400).json({ error: 'instrument_name required' });

    const inst = resolveInstrument(instrument_name);
    const coinId = inst.coinId;

    const url = `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const coinData = response.data[coinId];
    if (!coinData) {
      throw new Error('No ticker data found');
    }

    // Get more detailed data for high/low
    const detailUrl = `${COINGECKO_API}/coins/${coinId}`;
    const detailResponse = await axios.get(detailUrl, { timeout: 10000 });
    const marketData = detailResponse.data.market_data;

    const result = [{
      instrument_name: instrument_name,
      bid_price: Number(coinData.usd) * 0.999, // Simulate bid
      ask_price: Number(coinData.usd) * 1.001, // Simulate ask
      last: Number(coinData.usd),
      high: Number(marketData.high_24h?.usd || coinData.usd * 1.02),
      low: Number(marketData.low_24h?.usd || coinData.usd * 0.98),
      volume: Number(marketData.total_volume?.usd || 0),
      volume_usd: Number(marketData.total_volume?.usd || 0),
      timestamp: coinData.last_updated_at ? coinData.last_updated_at * 1000 : Date.now()
    }];

    return res.json({ jsonrpc: '2.0', result });
  } catch (err) {
    console.error('ERROR /api/ticker (coingecko):', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// /api/candles => Using CoinGecko API (cloud-friendly)
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution } = req.query;
    if (!instrument_name || !start_ts || !end_ts) {
      return res.status(400).json({ error: 'instrument_name, start_ts, end_ts required (timestamps in ms)' });
    }

    console.log('\n🎯 ========== SERVER CANDLES REQUEST ==========');
    console.log('📋 Request params:', { instrument_name, start_ts, end_ts, resolution });

    const inst = resolveInstrument(instrument_name);
    const coinId = inst.coinId;

    console.log('🔧 Using CoinGecko with:', { coinId: coinId, name: inst.name });

    // Convert timestamps to seconds
    const startTime = Math.floor(Number(start_ts) / 1000);
    const endTime = Math.floor(Number(end_ts) / 1000);
    
    // Calculate days between dates
    const daysDiff = Math.ceil((endTime - startTime) / (60 * 60 * 24));
    let days = Math.max(1, Math.min(daysDiff, 90)); // CoinGecko limit: 90 days max
    
    console.log('📅 Date range:', new Date(Number(start_ts)), 'to', new Date(Number(end_ts)));
    console.log('⏰ Days range:', days, 'days');

    // Use hourly data for better granularity
    const coingeckoUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=hourly`;
    
    console.log('🔗 Making request to CoinGecko:', coingeckoUrl);

    const response = await axios.get(coingeckoUrl, { timeout: 30000 });
    
    console.log('✅ Received response from CoinGecko');

    if (!response.data.prices) {
      throw new Error('No price data from CoinGecko');
    }

    const prices = response.data.prices; // [[timestamp, price], ...]
    
    console.log('📊 CoinGecko returned', prices.length, 'price points');

    // Filter data to our requested time range
    const filteredPrices = prices.filter(price => {
      const priceTime = Number(price[0]);
      return priceTime >= Number(start_ts) && priceTime <= Number(end_ts);
    });

    console.log('📊 After filtering:', filteredPrices.length, 'points in range');

    // Convert CoinGecko format to our expected format
    // Since CoinGecko doesn't give OHLC directly, we'll simulate it
    const result = {
      t: filteredPrices.map(d => Number(d[0])), // Timestamp in ms
      o: filteredPrices.map(d => parseFloat(d[1])), // Use price as open
      h: filteredPrices.map(d => parseFloat(d[1]) * 1.001), // Simulate high (slightly higher)
      l: filteredPrices.map(d => parseFloat(d[1]) * 0.999), // Simulate low (slightly lower)
      c: filteredPrices.map(d => parseFloat(d[1])), // Use price as close
      v: filteredPrices.map(d => 1000) // Simulate volume
    };

    // Debug first data point
    if (result.t.length > 0) {
      console.log('🔍 First data point:');
      console.log('   Time:', new Date(result.t[0]));
      console.log('   Open:', result.o[0]);
      console.log('   High:', result.h[0]);
      console.log('   Low:', result.l[0]);
      console.log('   Close:', result.c[0]);
      console.log('📈 Price range - Min:', Math.min(...result.o), 'Max:', Math.max(...result.o));
    } else {
      console.log('❌ NO DATA IN FILTERED RANGE');
      // If no filtered data, use all data
      result.t = prices.map(d => Number(d[0]));
      result.o = prices.map(d => parseFloat(d[1]));
      result.h = prices.map(d => parseFloat(d[1]) * 1.001);
      result.l = prices.map(d => parseFloat(d[1]) * 0.999);
      result.c = prices.map(d => parseFloat(d[1]));
      result.v = prices.map(d => 1000);
      console.log('🔄 Using all', result.t.length, 'data points');
    }

    const hasData = result.t.length > 0;
    if (!hasData) {
      return res.status(200).json({
        resolution_used: 'hourly',
        message: 'No price data found for chosen range on CoinGecko.',
        result: result
      });
    }

    console.log(`📤 Sending ${result.t.length} data points to frontend`);
    console.log('✅ ========== REQUEST COMPLETE ==========\n');
    
    return res.json({ 
      resolution_used: 'hourly', 
      result: result 
    });
    
  } catch (err) {
    console.error('\n❌ ========== SERVER ERROR ==========');
    console.error('Error details:', err.message);
    if (err.response) {
      console.error('API response status:', err.response.status);
      console.error('API response data:', err.response.data);
    }
    console.error('❌ ========== ERROR END ==========\n');
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

// Simple root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'BTC Movements Backend API',
    status: 'running',
    endpoints: {
      '/api/candles': 'Get candle data',
      '/api/ticker': 'Get ticker data'
    }
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('🚀 ==========================================');
  console.log('🚀 CoinGecko Backend Server STARTED');
  console.log('🚀 Port:', PORT);
  console.log('🚀 Time:', new Date().toLocaleString());
  console.log('🚀 ==========================================');
});
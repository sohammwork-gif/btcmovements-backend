// server.js - Using Bybit API (no geographic restrictions)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bybit API endpoint
const BYBIT_API = 'https://api.bybit.com';

// Map your frontend instrument names to Bybit symbols
const INSTRUMENT_MAP = {
  'BTC-PERPETUAL': { symbol: 'BTCUSDT', type: 'spot' },
  'ETH-PERPETUAL': { symbol: 'ETHUSDT', type: 'spot' },
  'BTC-SPOT': { symbol: 'BTCUSDT', type: 'spot' },
  'ETH-SPOT': { symbol: 'ETHUSDT', type: 'spot' },
};

function resolveInstrument(instrumentName) {
  if (INSTRUMENT_MAP[instrumentName]) return INSTRUMENT_MAP[instrumentName];
  if (instrumentName && instrumentName.toUpperCase().includes('PERPETUAL')) {
    if (instrumentName.toUpperCase().startsWith('BTC')) return INSTRUMENT_MAP['BTC-PERPETUAL'];
    if (instrumentName.toUpperCase().startsWith('ETH')) return INSTRUMENT_MAP['ETH-PERPETUAL'];
    return INSTRUMENT_MAP['BTC-PERPETUAL'];
  }
  return { symbol: 'BTCUSDT', type: 'spot' };
}

function resolutionToInterval(res) {
  if (!res) return '1';
  const s = String(res).toLowerCase();
  if (s === '1' || s === '1m') return '1';
  if (s === '5' || s === '5m') return '5';
  if (s === '15' || s === '15m') return '15';
  if (s === '60' || s === '1h' || s === '60m') return '60';
  if (s === '240' || s === '4h') return '240';
  if (s === '1d' || s === '1D' || s === '1440') return 'D';
  return '1';
}

// /api/ticker => returns Bybit 24hr ticker summary
app.get('/api/ticker', async (req, res) => {
  try {
    const { instrument_name } = req.query;
    if (!instrument_name) return res.status(400).json({ error: 'instrument_name required' });

    const inst = resolveInstrument(instrument_name);
    const symbol = inst.symbol;

    const url = `${BYBIT_API}/v5/market/tickers?category=spot&symbol=${symbol}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.data.retMsg}`);
    }

    const tickers = response.data.result.list;
    if (!tickers || tickers.length === 0) {
      throw new Error('No ticker data found');
    }

    const ticker = tickers[0];
    const result = [{
      instrument_name: instrument_name,
      bid_price: Number(ticker.bid1Price),
      ask_price: Number(ticker.ask1Price),
      last: Number(ticker.lastPrice),
      high: Number(ticker.highPrice24h),
      low: Number(ticker.lowPrice24h),
      volume: Number(ticker.volume24h),
      volume_usd: Number(ticker.turnover24h),
      timestamp: Date.now()
    }];

    return res.json({ jsonrpc: '2.0', result });
  } catch (err) {
    console.error('ERROR /api/ticker (bybit):', err.message);
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

    // Convert instrument name to CoinGecko format
    let coinId;
    if (instrument_name.includes('BTC')) {
      coinId = 'bitcoin';
    } else if (instrument_name.includes('ETH')) {
      coinId = 'ethereum';
    } else {
      coinId = 'bitcoin'; // default
    }

    // Convert resolution to days (CoinGecko uses days)
    const startTime = Math.floor(Number(start_ts) / 1000); // Convert to seconds
    const endTime = Math.floor(Number(end_ts) / 1000);
    
    // Calculate days between dates for appropriate data density
    const daysDiff = Math.ceil((endTime - startTime) / (60 * 60 * 24));
    let days = Math.max(1, Math.min(daysDiff, 90)); // CoinGecko limit: 90 days max
    
    console.log('🔧 Using CoinGecko with:', { coinId, days });

    const coingeckoUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${
      resolution === '1' || resolution === '5' || resolution === '15' ? 'hourly' : 'daily'
    }`;
    
    console.log('🔗 Making request to CoinGecko');

    const response = await axios.get(coingeckoUrl, { timeout: 30000 });
    
    console.log('✅ Received response from CoinGecko');

    if (!response.data.prices) {
      throw new Error('No price data from CoinGecko');
    }

    const prices = response.data.prices; // [[timestamp, price], ...]
    
    console.log('📊 CoinGecko returned', prices.length, 'price points');

    // Convert CoinGecko format to our expected format
    // Since CoinGecko doesn't give OHLC directly, we'll use the price for all OHLC
    const result = {
      t: prices.map(d => Number(d[0])), // Timestamp in ms
      o: prices.map(d => parseFloat(d[1])), // Use price as open
      h: prices.map(d => parseFloat(d[1])), // Use price as high  
      l: prices.map(d => parseFloat(d[1])), // Use price as low
      c: prices.map(d => parseFloat(d[1])), // Use price as close
      v: prices.map(d => 0) // No volume data
    };

    // Debug first data point
    if (result.t.length > 0) {
      console.log('🔍 First data point:');
      console.log('   Time:', new Date(result.t[0]));
      console.log('   Price:', result.o[0]);
      console.log('📈 Price range:', Math.min(...result.o), 'to', Math.max(...result.o));
    } else {
      console.log('❌ NO DATA RETURNED FROM COINGECKO');
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
    }
    console.error('❌ ========== ERROR END ==========\n');
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('🚀 ==========================================');
  console.log('🚀 Bybit Backend Server STARTED');
  console.log('🚀 Port:', PORT);
  console.log('🚀 Time:', new Date().toLocaleString());
  console.log('🚀 ==========================================');
});
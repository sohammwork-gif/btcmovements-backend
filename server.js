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

// /api/candles => Using Bybit API (no geographic restrictions)
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution } = req.query;
    if (!instrument_name || !start_ts || !end_ts) {
      return res.status(400).json({ error: 'instrument_name, start_ts, end_ts required (timestamps in ms)' });
    }

    console.log('\n🎯 ========== SERVER CANDLES REQUEST ==========');
    console.log('📋 Request params:', { instrument_name, start_ts, end_ts, resolution });

    // Convert instrument name to Bybit format
    let symbol;
    if (instrument_name.includes('BTC')) {
      symbol = 'BTCUSDT';
    } else if (instrument_name.includes('ETH')) {
      symbol = 'ETHUSDT';
    } else {
      symbol = 'BTCUSDT'; // default
    }

    // Convert resolution to Bybit format
    let interval;
    switch (resolution) {
      case '1': interval = '1'; break;
      case '5': interval = '5'; break;
      case '15': interval = '15'; break;
      case '60': interval = '60'; break;
      case '240': interval = '240'; break;
      case '1D': interval = 'D'; break;
      default: interval = '1';
    }

    console.log('🔧 Using Bybit with:', { symbol, interval });

    // Convert timestamps to seconds (Bybit uses seconds)
    const startTime = Math.floor(Number(start_ts) / 1000);
    const endTime = Math.floor(Number(end_ts) / 1000);

    console.log('⏰ Bybit timestamps (seconds):', startTime, 'to', endTime);
    console.log('📅 Date range:', new Date(Number(start_ts)), 'to', new Date(Number(end_ts)));

    const bybitUrl = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&start=${startTime}&end=${endTime}&limit=1000`;
    
    console.log('🔗 Making request to Bybit');

    const response = await axios.get(bybitUrl, { timeout: 30000 });
    
    console.log('✅ Received response from Bybit');

    if (response.data.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.data.retMsg}`);
    }

    const klines = response.data.result.list || [];
    
    console.log('📊 Bybit returned', klines.length, 'candles');

    // Convert Bybit format to our expected format
    const result = {
      t: klines.map(d => Number(d[0]) * 1000), // Convert seconds to milliseconds
      o: klines.map(d => parseFloat(d[1])),    // Open
      h: klines.map(d => parseFloat(d[2])),    // High
      l: klines.map(d => parseFloat(d[3])),    // Low
      c: klines.map(d => parseFloat(d[4])),    // Close
      v: klines.map(d => parseFloat(d[5]))     // Volume
    };

    // Debug first candle
    if (result.t.length > 0) {
      console.log('🔍 First candle details:');
      console.log('   Time:', new Date(result.t[0]));
      console.log('   Open:', result.o[0]);
      console.log('   High:', result.h[0]);
      console.log('   Low:', result.l[0]);
      console.log('   Close:', result.c[0]);
      console.log('📈 Price range - Open:', Math.min(...result.o), 'to', Math.max(...result.o));
    } else {
      console.log('❌ NO CANDLES RETURNED FROM BYBIT');
    }

    const hasData = result.t.length > 0;
    if (!hasData) {
      return res.status(200).json({
        resolution_used: interval + 'm',
        message: 'No candles found for chosen range on Bybit. Try a smaller/recent range.',
        result: result
      });
    }

    console.log(`📤 Sending ${result.t.length} candles to frontend`);
    console.log('✅ ========== REQUEST COMPLETE ==========\n');
    
    return res.json({ 
      resolution_used: interval + 'm', 
      result: result 
    });
    
  } catch (err) {
    console.error('\n❌ ========== SERVER ERROR ==========');
    console.error('Error details:', err.message);
    if (err.response) {
      console.error('API response:', err.response.data);
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
// server.js - Binance backend with DEBUG LOGGING
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Binance endpoints
const BINANCE_SPOT = 'https://api.binance.com';
const BINANCE_FUT = 'https://fapi.binance.com';

// Map your frontend instrument names to Binance symbols
const INSTRUMENT_MAP = {
  'BTC-PERPETUAL': { symbol: 'BTCUSDT', type: 'futures' },
  'ETH-PERPETUAL': { symbol: 'ETHUSDT', type: 'futures' },
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
  if (!res) return '1m';
  const s = String(res).toLowerCase();
  if (s === '1' || s === '1m') return '1m';
  if (s === '5' || s === '5m') return '5m';
  if (s === '15' || s === '15m') return '15m';
  if (s === '60' || s === '1h' || s === '60m') return '1h';
  if (s === '240' || s === '4h') return '4h';
  if (s === '1d' || s === '1D' || s === '1440') return '1d';
  return s;
}

// fetch klines with pagination (binance limit=1000 per request)
async function fetchKlinesPaginated(baseUrl, symbol, interval, startTime, endTime) {
  const limit = 1000;
  let start = Number(startTime);
  const end = Number(endTime);
  const t = [], o = [], h = [], l = [], c = [];

  console.log(`   📡 Fetching SPOT data for ${symbol} from ${new Date(start)} to ${new Date(end)}`);

  while (true) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
      startTime: String(start),
      endTime: String(end),
    });
    const url = `${baseUrl}/api/v3/klines?${params.toString()}`;
    
    console.log(`   🔗 Making request to: ${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&startTime=${start}&endTime=${end}`);
    
    const r = await axios.get(url, { timeout: 30000 });
    const rows = r.data;
    
    console.log(`   ✅ Received ${rows.length} candles from Binance`);

    if (!Array.isArray(rows) || rows.length === 0) break;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      t.push(Number(row[0]));
      o.push(Number(row[1]));
      h.push(Number(row[2]));
      l.push(Number(row[3]));
      c.push(Number(row[4]));
    }

    const lastOpen = Number(rows[rows.length - 1][0]);
    if (rows.length < limit || lastOpen >= end) break;

    let addMs = 60000;
    if (interval.endsWith('m')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 60 * 1000;
    } else if (interval.endsWith('h')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 60 * 60 * 1000;
    } else if (interval.endsWith('d')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 24 * 60 * 60 * 1000;
    }
    start = lastOpen + addMs;
    if (start > Date.now() + 1000) break;
  }

  console.log(`   📊 Total SPOT candles collected: ${t.length}`);
  return { t, o, h, l, c };
}

// Special path for futures klines: endpoint differs (/fapi/v1/klines)
async function fetchKlinesPaginatedFutures(baseUrl, symbol, interval, startTime, endTime) {
  const limit = 1000;
  let start = Number(startTime);
  const end = Number(endTime);
  const t = [], o = [], h = [], l = [], c = [];

  console.log(`   📡 Fetching FUTURES data for ${symbol} from ${new Date(start)} to ${new Date(end)}`);

  while (true) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
      startTime: String(start),
      endTime: String(end),
    });
    const url = `${baseUrl}/fapi/v1/klines?${params.toString()}`;
    
    console.log(`   🔗 Making request to: ${baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&startTime=${start}&endTime=${end}`);
    
    const r = await axios.get(url, { timeout: 30000 });
    const rows = r.data;
    
    console.log(`   ✅ Received ${rows.length} candles from Binance Futures`);

    if (!Array.isArray(rows) || rows.length === 0) break;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      t.push(Number(row[0]));
      o.push(Number(row[1]));
      h.push(Number(row[2]));
      l.push(Number(row[3]));
      c.push(Number(row[4]));
    }

    const lastOpen = Number(rows[rows.length - 1][0]);
    if (rows.length < limit || lastOpen >= end) break;

    let addMs = 60000;
    if (interval.endsWith('m')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 60 * 1000;
    } else if (interval.endsWith('h')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 60 * 60 * 1000;
    } else if (interval.endsWith('d')) {
      const n = parseInt(interval.slice(0, -1));
      addMs = n * 24 * 60 * 60 * 1000;
    }
    start = lastOpen + addMs;
    if (start > Date.now() + 1000) break;
  }

  console.log(`   📊 Total FUTURES candles collected: ${t.length}`);
  return { t, o, h, l, c };
}

// /api/ticker => returns Binance 24hr ticker summary
app.get('/api/ticker', async (req, res) => {
  try {
    const { instrument_name } = req.query;
    if (!instrument_name) return res.status(400).json({ error: 'instrument_name required' });

    const inst = resolveInstrument(instrument_name);
    const symbol = inst.symbol;
    if (inst.type === 'futures') {
      const url = `${BINANCE_FUT}/fapi/v1/ticker/24hr?symbol=${symbol}`;
      const r = await axios.get(url, { timeout: 10000 });
      const data = r.data;
      const result = [{
        instrument_name: instrument_name,
        bid_price: Number(data.bidPrice),
        ask_price: Number(data.askPrice),
        last: Number(data.lastPrice),
        high: Number(data.highPrice),
        low: Number(data.lowPrice),
        volume: Number(data.volume),
        volume_usd: Number(data.quoteVolume),
        timestamp: Date.now()
      }];
      return res.json({ jsonrpc: '2.0', result });
    } else {
      const url = `${BINANCE_SPOT}/api/v3/ticker/24hr?symbol=${symbol}`;
      const r = await axios.get(url, { timeout: 10000 });
      const data = r.data;
      const result = [{
        instrument_name: instrument_name,
        bid_price: Number(data.bidPrice),
        ask_price: Number(data.askPrice),
        last: Number(data.lastPrice),
        high: Number(data.highPrice),
        low: Number(data.lowPrice),
        volume: Number(data.volume),
        volume_usd: Number(data.quoteVolume),
        timestamp: Date.now()
      }];
      return res.json({ jsonrpc: '2.0', result });
    }
  } catch (err) {
    console.error('ERROR /api/ticker (binance):', err.response?.data || err.message || err);
    return res.status(500).json({ error: 'Internal server error', details: err.response?.data || err.message || String(err) });
  }
});

// /api/candles => returns t,o,h,l,c arrays (fetches minute/hourly from Binance)
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_ts, end_ts, resolution } = req.query;
    if (!instrument_name || !start_ts || !end_ts) {
      return res.status(400).json({ error: 'instrument_name, start_ts, end_ts required (timestamps in ms)' });
    }

    console.log('\n🎯 ========== SERVER CANDLES REQUEST ==========');
    console.log('📋 Request params:', { 
      instrument_name, 
      start_ts, 
      end_ts, 
      resolution 
    });
    console.log('📅 Date range:', new Date(Number(start_ts)), 'to', new Date(Number(end_ts)));
    console.log('⏰ Timestamps:', start_ts, 'to', end_ts);

    const inst = resolveInstrument(instrument_name);
    const symbol = inst.symbol;
    const interval = resolutionToInterval(resolution || '1');

    console.log('🔧 Resolved instrument:', inst);
    console.log('⏱️  Using interval:', interval);

    let data;
    if (inst.type === 'futures') {
      console.log('🚀 Fetching FUTURES data from Binance...');
      const kl = await fetchKlinesPaginatedFutures(BINANCE_FUT, symbol, interval, start_ts, end_ts);
      data = { result: kl, resolution_used: interval };
    } else {
      console.log('🚀 Fetching SPOT data from Binance...');
      const kl = await fetchKlinesPaginated(BINANCE_SPOT, symbol, interval, start_ts, end_ts);
      data = { result: kl, resolution_used: interval };
    }

    // CRITICAL DEBUG INFO
    console.log('\n📊 ========== BINANCE DATA ANALYSIS ==========');
    console.log('📦 Total candles received:', data.result.t.length);
    
    if (data.result.t.length > 0) {
      console.log('\n🔍 FIRST CANDLE DETAILS:');
      console.log('   🕐 Time:', new Date(data.result.t[0]));
      console.log('   💰 Open:', data.result.o[0]);
      console.log('   📈 High:', data.result.h[0]);
      console.log('   📉 Low:', data.result.l[0]);
      console.log('   📊 Close:', data.result.c[0]);
      
      console.log('\n🔍 DATA TYPES:');
      console.log('   Open type:', typeof data.result.o[0]);
      console.log('   Close type:', typeof data.result.c[0]);
      
      console.log('\n📈 PRICE RANGES:');
      console.log('   Open:  ', Math.min(...data.result.o), 'to', Math.max(...data.result.o));
      console.log('   Close: ', Math.min(...data.result.c), 'to', Math.max(...data.result.c));
      
      console.log('\n🔢 FIRST 5 CANDLES:');
      for (let i = 0; i < Math.min(5, data.result.t.length); i++) {
        console.log(`   ${i+1}. Time: ${new Date(data.result.t[i])}, Close: ${data.result.c[i]}`);
      }
    } else {
      console.log('❌ NO CANDLES RETURNED FROM BINANCE!');
      console.log('💡 Possible issues:');
      console.log('   - Date range too far in future (2025)');
      console.log('   - Binance has no data for this range');
      console.log('   - Symbol/interval not supported');
    }

    const hasData = data.result.t.length > 0;
    if (!hasData) {
      console.log('\n📤 Sending empty response to frontend');
      return res.status(200).json({
        resolution_used: interval,
        message: 'No candles found for chosen range/resolution on Binance. Try a smaller/recent range.',
        result: data.result
      });
    }

    console.log(`\n📤 Sending ${data.result.t.length} candles to frontend`);
    console.log('✅ ========== REQUEST COMPLETE ==========\n');
    
    return res.json({ 
      resolution_used: data.resolution_used, 
      result: data.result 
    });
    
  } catch (err) {
    console.error('\n❌ ========== SERVER ERROR ==========');
    console.error('Error details:', err.message);
    if (err.response) {
      console.error('Binance API response:', err.response.data);
    }
    console.error('❌ ========== ERROR END ==========\n');
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

const PORT = process.env.PORT || 4000; // Make sure it's 4000, not 4800
app.listen(PORT, () => {
  console.log('🚀 ==========================================');
  console.log('🚀 Binance Backend Server STARTED');
  console.log('🚀 Port:', PORT);
  console.log('🚀 Time:', new Date().toLocaleString());
  console.log('🚀 ==========================================');
});
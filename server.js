// server.js
// Binance candle backend with Dubai (Asia/Dubai) date handling.
// Usage:
//   GET /api/candles?instrument_name=BTC&start_date=2025-10-01&end_date=2025-10-02&resolution=1m&market=spot
// Responds with an array of formatted candle objects.

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Endpoints (spot vs futures)
const BINANCE_SPOT_API = 'https://api.binance.com/api/v3/klines';
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1/klines';

// Interval -> milliseconds mapping
const INTERVAL_MS = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000
};

// Convert a YYYY-MM-DD string (Dubai local date) to UTC ms start/end
function dateToUTCTimestamps(dateStr) {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error('date must be in YYYY-MM-DD format');
  }
  const [y, m, d] = parts;
  // Dubai is UTC+4. Date.UTC returns UTC midnight for the date.
  // Dubai midnight in UTC is UTC midnight - 4 hours.
  const dubaiOffsetMs = 4 * 60 * 60 * 1000;
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0) - dubaiOffsetMs;
  const endUTC = Date.UTC(y, m - 1, d, 23, 59, 59) - dubaiOffsetMs;
  return { startUTC, endUTC };
}

// Helper: de-duplicate candles by open time and sort ascending
function dedupeAndSortCandles(rawCandles) {
  const map = new Map();
  for (const c of rawCandles) {
    const ts = Number(c[0]);
    // keep the last occurrence (most recent API result)
    map.set(ts, c);
  }
  const keys = Array.from(map.keys()).sort((a, b) => a - b);
  return keys.map(k => map.get(k));
}

// Core fetcher: chunked requests, safe progression
async function fetchBinanceData(symbol, startUTC, endUTC, interval = '1m', useFutures = false) {
  const limit = 1000;
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) throw new Error('Unsupported interval: ' + interval);

  const apiBase = useFutures ? BINANCE_FUTURES_API : BINANCE_SPOT_API;

  let start = startUTC;
  const allData = [];

  while (start <= endUTC) {
    const chunkEnd = Math.min(endUTC, start + intervalMs * (limit - 1));
    try {
      const response = await axios.get(apiBase, {
        params: {
          symbol: symbol,
          interval: interval,
          startTime: start,
          endTime: chunkEnd,
          limit: limit
        },
        timeout: 20000
      });

      const data = response.data;
      if (!data || data.length === 0) break;

      allData.push(...data);

      const lastOpen = Number(data[data.length - 1][0]);
      const nextStart = lastOpen + intervalMs;

      if (nextStart <= start) {
        console.warn('fetchBinanceData: start did not advance; breaking to avoid infinite loop.');
        break;
      }

      start = nextStart;

      if (data.length < limit) break;
    } catch (err) {
      const msg = (err && err.response && err.response.data) ? JSON.stringify(err.response.data) : (err.message || String(err));
      throw new Error('Binance fetch error: ' + msg);
    }
  }

  const clean = dedupeAndSortCandles(allData);
  return clean;
}

// Format a raw Binance kline array into a friendly object
function formatKlineArray(candleArr) {
  return {
    timestamp: Number(candleArr[0]),           // open time (ms)
    open: parseFloat(candleArr[1]),
    high: parseFloat(candleArr[2]),
    low: parseFloat(candleArr[3]),
    close: parseFloat(candleArr[4]),
    volume: parseFloat(candleArr[5]),
    closeTime: Number(candleArr[6]),
    quoteVolume: parseFloat(candleArr[7]),
    trades: Number(candleArr[8]),
    takerBuyBase: parseFloat(candleArr[9]),
    takerBuyQuote: parseFloat(candleArr[10])
  };
}

// Main endpoint
app.get('/api/candles', async (req, res) => {
  try {
    // query params:
    // instrument_name (e.g., 'BTC'), symbol override (e.g., 'BTCUSDT'), start_date (YYYY-MM-DD), end_date (YYYY-MM-DD optional),
    // resolution (1m default), market ('spot' or 'futures')
    const {
      instrument_name = 'BTC',
      symbol: symbolOverride,
      start_date,
      end_date,
      resolution = '1m',
      market = 'spot'
    } = req.query;

    if (!start_date) {
      return res.status(400).json({ error: 'start_date is required (YYYY-MM-DD)' });
    }

    // decide symbol: explicit override > instrument_name-based pick
    let symbol = symbolOverride;
    if (!symbol) {
      const up = (instrument_name || '').toUpperCase();
      if (up.includes('BTC')) symbol = 'BTCUSDT';
      else if (up.includes('ETH')) symbol = 'ETHUSDT';
      else symbol = up.endsWith('USDT') ? up : up + 'USDT';
    }

    const useFutures = market.toLowerCase() === 'futures';

    const { startUTC } = dateToUTCTimestamps(start_date);
    const finalEndUTC = end_date ? dateToUTCTimestamps(end_date).endUTC : dateToUTCTimestamps(start_date).endUTC;

    console.log('📈 Fetching Binance candles', {
      symbol, resolution, start_date, end_date, market,
      startUTC: new Date(startUTC).toISOString(),
      finalEndUTC: new Date(finalEndUTC).toISOString()
    });

    const raw = await fetchBinanceData(symbol, startUTC, finalEndUTC, resolution, useFutures);

    if (!raw || raw.length === 0) {
      return res.status(404).json({ error: 'No data found for the specified date range' });
    }

    const formatted = raw.map(formatKlineArray);

    console.log(`✅ Returned ${formatted.length} candles for ${symbol}`);
    console.log(`First ts: ${new Date(formatted[0].timestamp).toISOString()}  Last ts: ${new Date(formatted[formatted.length - 1].timestamp).toISOString()}`);

    res.json(formatted);
  } catch (error) {
    console.error('❌ /api/candles error:', error && error.message ? error.message : error);
    res.status(500).json({ error: 'Failed to fetch data', details: error && error.message ? error.message : String(error) });
  }
});

// health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Binance Candle Backend (Dubai date handling)',
    timestamp: new Date().toISOString(),
    note: 'Use /api/candles?start_date=YYYY-MM-DD&instrument_name=BTC'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

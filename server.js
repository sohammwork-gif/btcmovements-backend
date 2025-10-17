// server.js
// Binance candle backend (Dubai date handling) with API key header included.
// Copy-paste and run (node server.js). Install deps: npm i express axios cors

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- YOUR BINANCE API KEYS ---
// You provided these keys in the chat; they are placed here as defaults so you can
// copy-paste and run immediately. If you'd rather store them in env variables,
// replace the string literals below with process.env.BINANCE_API_KEY and process.env.BINANCE_API_SECRET.
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || 'HBeI4lngodO2vttAfg8ZtBO6zA4bm28pMgF2PNv5UnB3VWMVBiJdB7iK7B56cnTJ';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '7T7tj1FTwJI7ElmjuFNb91waSAI7d3NtFAxLo2uGSju6G7K9ZVXL665h5owX7y7';

// Binance endpoints
const BINANCE_SPOT_API = 'https://api.binance.com/api/v3/klines';
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1/klines';

// ms mapping
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
  '1d': 24 * 60 * 60 * 1000
};

// Convert YYYY-MM-DD (Dubai local date) to UTC ms start/end
function dateToUTCTimestamps(dateStr) {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) throw new Error('date must be YYYY-MM-DD');
  const [y, m, d] = parts;
  const dubaiOffsetMs = 4 * 60 * 60 * 1000; // UTC+4
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0) - dubaiOffsetMs;
  const endUTC = Date.UTC(y, m - 1, d, 23, 59, 59) - dubaiOffsetMs;
  return { startUTC, endUTC };
}

// dedupe & sort by open time
function dedupeAndSortCandles(arrays) {
  const map = new Map();
  for (const a of arrays) {
    const ts = Number(a[0]);
    map.set(ts, a);
  }
  return Array.from(map.keys()).sort((a,b)=>a-b).map(k => map.get(k));
}

// format Binance kline to object
function formatBinanceKline(k) {
  return {
    timestamp: Number(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: Number(k[6]),
    quoteVolume: parseFloat(k[7]),
    trades: Number(k[8]),
    takerBuyBase: parseFloat(k[9] || 0),
    takerBuyQuote: parseFloat(k[10] || 0)
  };
}

// axios headers using API key (public klines don't strictly need it, but okay to add)
function axiosHeaders() {
  const headers = {};
  if (BINANCE_API_KEY) headers['X-MBX-APIKEY'] = BINANCE_API_KEY;
  return { headers };
}

// chunked Binance fetch
async function fetchBinanceData(symbol, startUTC, endUTC, interval='1m', useFutures=false) {
  const limit = 1000;
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) throw new Error('Unsupported interval: ' + interval);
  const apiBase = useFutures ? BINANCE_FUTURES_API : BINANCE_SPOT_API;

  let start = startUTC;
  const all = [];

  if (endUTC < startUTC) return [];

  while (start <= endUTC) {
    const chunkEnd = Math.min(endUTC, start + intervalMs * (limit - 1));
    const params = { symbol, interval, startTime: start, endTime: chunkEnd, limit };

    try {
      const r = await axios.get(apiBase, { params, timeout: 20000, ...axiosHeaders() });
      const data = r.data;
      if (!data || data.length === 0) break;
      all.push(...data);
      const lastOpen = Number(data[data.length - 1][0]);
      const nextStart = lastOpen + intervalMs;
      if (nextStart <= start) break;
      start = nextStart;
      if (data.length < limit) break;
    } catch (err) {
      // present helpful message
      const body = err.response && err.response.data ? err.response.data : err.message || String(err);
      throw new Error('Binance fetch error: ' + JSON.stringify(body));
    }
  }

  const clean = dedupeAndSortCandles(all);
  return clean.map(formatBinanceKline);
}

// CSV formatter
function formatCandlesToCsv(candles) {
  const header = ['Open time (UTC)','Open','High','Low','Close','Volume','Close time (UTC)','Quote asset volume','Trades','Taker buy base','Taker buy quote'];
  const lines = [header.join(',')];
  for (const c of candles) {
    lines.push([
      new Date(c.timestamp).toISOString(),
      c.open, c.high, c.low, c.close, c.volume,
      new Date(c.closeTime).toISOString(),
      c.quoteVolume, c.trades, c.takerBuyBase, c.takerBuyQuote
    ].join(','));
  }
  return lines.join('\n');
}

// API: /api/candles -> returns JSON array of formatted candles
app.get('/api/candles', async (req, res) => {
  try {
    const {
      instrument_name = 'BTC',
      symbol: symbolOverride,
      start_date,
      end_date,
      resolution = '1m',
      market = 'spot'
    } = req.query;

    if (!start_date) return res.status(400).json({ error: 'start_date required (YYYY-MM-DD, Dubai local)' });

    let symbol = symbolOverride;
    if (!symbol) {
      const up = (instrument_name || '').toUpperCase();
      if (up.includes('BTC')) symbol = 'BTCUSDT';
      else if (up.includes('ETH')) symbol = 'ETHUSDT';
      else symbol = up.endsWith('USDT') ? up : up + 'USDT';
    }

    const useFutures = (market || '').toLowerCase() === 'futures';
    const { startUTC } = dateToUTCTimestamps(start_date);
    const finalEndUTC = end_date ? dateToUTCTimestamps(end_date).endUTC : dateToUTCTimestamps(start_date).endUTC;

    console.log(`[${new Date().toISOString()}] Fetching ${symbol} ${resolution} ${start_date} -> ${end_date || start_date} (Dubai): ${new Date(startUTC).toISOString()} -> ${new Date(finalEndUTC).toISOString()}`);

    const candles = await fetchBinanceData(symbol, startUTC, finalEndUTC, resolution, useFutures);
    if (!candles || candles.length === 0) {
      return res.status(404).json({ error: 'No candle data returned for the selected range. Try a smaller/recent range (e.g., last 24 hours)' });
    }

    return res.json(candles);
  } catch (err) {
    console.error('ERROR /api/candles:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to fetch data', details: err && err.message ? err.message : String(err) });
  }
});

// API: /api/candles.csv -> CSV file download
app.get('/api/candles.csv', async (req, res) => {
  try {
    const { instrument_name = 'BTC', symbol: symbolOverride, start_date, end_date, resolution = '1m', market = 'spot' } = req.query;
    if (!start_date) return res.status(400).send('start_date required (YYYY-MM-DD, Dubai local)');

    let symbol = symbolOverride;
    if (!symbol) {
      const up = (instrument_name || '').toUpperCase();
      if (up.includes('BTC')) symbol = 'BTCUSDT';
      else if (up.includes('ETH')) symbol = 'ETHUSDT';
      else symbol = up.endsWith('USDT') ? up : up + 'USDT';
    }
    const useFutures = (market || '').toLowerCase() === 'futures';
    const { startUTC } = dateToUTCTimestamps(start_date);
    const finalEndUTC = end_date ? dateToUTCTimestamps(end_date).endUTC : dateToUTCTimestamps(start_date).endUTC;

    const candles = await fetchBinanceData(symbol, startUTC, finalEndUTC, resolution, useFutures);
    if (!candles || candles.length === 0) return res.status(404).send('No candle data returned for the selected range.');

    const csv = formatCandlesToCsv(candles);
    res.setHeader('Content-Type', 'text/csv');
    const fileName = `${symbol}_1m_${start_date}_to_${end_date || start_date}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err) {
    console.error('ERROR /api/candles.csv:', err && err.message ? err.message : err);
    res.status(500).send('Failed to fetch/generate CSV: ' + (err && err.message ? err.message : String(err)));
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Binance candle backend (Dubai date handling)', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT} (listening 0.0.0.0:${PORT})`);
});

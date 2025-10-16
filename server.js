const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Binance SPOT API - SAME AS YOUR PYTHON CODE
const BINANCE_API = 'https://api.binance.com/api/v3/klines';

// Convert date to UTC timestamps (like your Python function)
function dateToUTCTimestamps(dateStr) {
  const startDate = new Date(dateStr + 'T00:00:00+04:00'); // Dubai time UTC+4
  const endDate = new Date(dateStr + 'T23:59:59+04:00');   // Dubai time UTC+4
  
  const startUTC = startDate.getTime();
  const endUTC = endDate.getTime();
  
  return { startUTC, endUTC };
}

// Fetch data from Binance (like your Python function)
async function fetchBinanceData(symbol, startUTC, endUTC, interval = '1m') {
  const allData = [];
  let start = startUTC;

  while (start < endUTC) {
    try {
      const response = await axios.get(BINANCE_API, {
        params: {
          symbol: symbol,
          interval: interval,
          startTime: start,
          endTime: endUTC,
          limit: 1000
        },
        timeout: 10000
      });

      const data = response.data;
      if (!data || data.length === 0) break;

      allData.push(...data);
      start = data[data.length - 1][0] + 60000; // move forward 1 minute

    } catch (error) {
      console.error('Error fetching Binance data:', error.message);
      break;
    }
  }

  return allData;
}

// Main endpoint - SAME LOGIC AS YOUR PYTHON CODE
app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, start_date, end_date, resolution = '1m' } = req.query;
    
    console.log('📈 Fetching REAL Binance data...', { instrument_name, start_date, end_date, resolution });

    // Get symbol (BTCUSDT or ETHUSDT)
    const symbol = instrument_name.includes('BTC') ? 'BTCUSDT' : 'ETHUSDT';
    
    // Convert dates to UTC timestamps (like your Python code)
    const { startUTC, endUTC } = dateToUTCTimestamps(start_date);
    const finalEndUTC = end_date ? dateToUTCTimestamps(end_date).endUTC : endUTC;

    console.log(`🕐 Time range: ${new Date(startUTC)} to ${new Date(finalEndUTC)}`);

    // Fetch data from Binance
    const binanceData = await fetchBinanceData(symbol, startUTC, finalEndUTC, resolution);

    if (binanceData.length === 0) {
      return res.status(404).json({ error: 'No data found for the specified date range' });
    }

    // Format data exactly like your Python output
    const formattedData = binanceData.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: parseInt(candle[6]),
      quoteVolume: parseFloat(candle[7]),
      trades: parseInt(candle[8]),
      takerBuyBase: parseFloat(candle[9]),
      takerBuyQuote: parseFloat(candle[10])
    }));

    console.log(`✅ REAL DATA: ${formattedData.length} candles for ${symbol}`);
    console.log(`💰 Price range: ${formattedData[0]?.close} to ${formattedData[formattedData.length - 1]?.close}`);
    
    res.json(formattedData);
    
  } catch (error) {
    console.error('❌ Binance API error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch data from Binance',
      details: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'BTC Movements Backend - Real Binance Data',
    timestamp: new Date().toISOString(),
    provider: 'Binance Spot API (Same as Python script)'
  });
});

// Test endpoint with exact dates
app.get('/api/test', async (req, res) => {
  try {
    const symbol = 'BTCUSDT';
    const { startUTC, endUTC } = dateToUTCTimestamps('2024-10-01');
    
    const data = await fetchBinanceData(symbol, startUTC, endUTC, '1m');
    
    res.json({
      symbol: symbol,
      date: '2024-10-01',
      candles_count: data.length,
      sample_candles: data.slice(0, 3).map(candle => ({
        timestamp: new Date(parseInt(candle[0])).toISOString(),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📊 Using EXACT Binance API as your Python script`);
  console.log(`✅ Real-time BTC/USDT and ETH/USDT spot data`);
});

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const OKX_API = 'https://www.okx.com/api/v5/market/candles';

function getOKXInterval(resolution) {
  const map = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1H', '240': '4H', 'D': '1D'
  };
  return map[resolution] || '1H';
}

app.get('/api/candles', async (req, res) => {
  try {
    const { instrument_name, resolution = '60', limit = 100 } = req.query;
    
    const response = await axios.get(OKX_API, {
      params: {
        instId: 'BTC-USDT-SWAP',
        bar: getOKXInterval(resolution),
        limit: parseInt(limit)
      },
      timeout: 10000
    });

    if (response.data.code !== '0') {
      throw new Error(response.data.msg);
    }

    const formattedData = response.data.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    res.json(formattedData);
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch data',
      details: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend running',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

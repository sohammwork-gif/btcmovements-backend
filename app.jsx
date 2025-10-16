import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [instrument, setInstrument] = useState("BTC-PERPETUAL");
  const [iv, setIv] = useState(30);
  const [startDate, setStartDate] = useState("2024-10-01");
  const [endDate, setEndDate] = useState("2024-10-02");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  // FIXED: Make sure API_BASE is properly defined
  const API_BASE = "https://btcmovements-backend.onrender.com/api";

  const fetchAndCompute = async () => {
    setLoading(true);
    setError("");
    setSummary(null);

    try {
      const start = new Date(`${startDate}T00:00:00Z`).getTime();
      const end = new Date(`${endDate}T23:59:59Z`).getTime();
      
      // FIXED: Proper URL construction
      const url = `${API_BASE}/candles?instrument_name=${encodeURIComponent(instrument)}&start_ts=${start}&end_ts=${end}&resolution=60`;
      
      console.log('🚀 Fetching data from:', url);
      
      const res = await axios.get(url, { timeout: 60000 });
      
      // Handle OKX response format
      if (!res.data || !Array.isArray(res.data)) {
        throw new Error("Invalid response format from backend");
      }
      
      const candles = res.data;
      if (candles.length === 0) {
        setError("No candle data returned for the selected range.");
        setLoading(false);
        return;
      }

      console.log('📊 Processing', candles.length, 'candles');
      
      // Convert to expected format
      const formattedCandles = {
        t: candles.map(c => c.timestamp),
        o: candles.map(c => c.open),
        h: candles.map(c => c.high),
        l: candles.map(c => c.low),
        c: candles.map(c => c.close)
      };
      
      const movements = computeMovementsFromCandles_ExcelStyle(formattedCandles, iv);
      const s = { instrument, iv, startDate, endDate, candles: formattedCandles, movements };
      setSummary(s);
      
    } catch (err) {
      console.error("Fetch error:", err);
      const msg = err?.response?.data?.error || err?.response?.data?.details || err?.message || String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ... keep the rest of your computeMovementsFromCandles_ExcelStyle function exactly as before ...
  // ... and the return JSX exactly as before ...
}

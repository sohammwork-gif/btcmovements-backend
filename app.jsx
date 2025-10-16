import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [instrument, setInstrument] = useState("BTC-PERPETUAL");
  const [iv, setIv] = useState(30);
  const [startDate, setStartDate] = useState("2025-10-01");
  const [endDate, setEndDate] = useState("2025-10-02");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  // Use port 4800 since that's what your backend is running on
  const API_BASE = "http://localhost:4800/api";

  const fetchAndCompute = async () => {
    setLoading(true);
    setError("");
    setSummary(null);

    try {
      const start = new Date(`${startDate}T00:00:00Z`).getTime();
      const end = new Date(`${endDate}T23:59:59Z`).getTime();
      const url = `${API_BASE}/candles?instrument_name=${encodeURIComponent(instrument)}&start_ts=${start}&end_ts=${end}&resolution=1`;
      
      console.log('🚀 === FRONTEND DEBUG START ===');
      console.log('📅 Date range:', startDate, 'to', endDate);
      console.log('⏰ Timestamps:', start, 'to', end);
      console.log('🔗 URL:', url);
      
      const res = await axios.get(url, { timeout: 60000 });
      
      console.log('✅ GOT RESPONSE FROM SERVER');
      console.log('📊 Full response:', res.data);
      
      if (res.data.result) {
        const candles = res.data.result;
        console.log('🕯️ Number of candles:', candles.t?.length || 0);
        
        if (candles.o && candles.o.length > 0) {
          console.log('💰 First 10 OPEN prices:', candles.o.slice(0, 10));
          console.log('💰 First 10 CLOSE prices:', candles.c.slice(0, 10));
          
          console.log('📈 Price Ranges:');
          console.log('   OPEN:  Min:', Math.min(...candles.o), 'Max:', Math.max(...candles.o));
          console.log('   CLOSE: Min:', Math.min(...candles.c), 'Max:', Math.max(...candles.c));
          
          // Check if prices look reasonable
          const avgPrice = (candles.o[0] + candles.c[0]) / 2;
          console.log('🤔 Price sanity check - Average of first candle:', avgPrice);
          if (avgPrice > 1000000) {
            console.log('❌ PRICES ARE TOO HIGH - Likely data format issue!');
          } else if (avgPrice < 1000) {
            console.log('❌ PRICES ARE TOO LOW - Likely data format issue!');
          } else {
            console.log('✅ Prices look reasonable for BTC');
          }
        }
      }
      
      console.log('🎯 === FRONTEND DEBUG END ===');

      if (!res.data || !res.data.result) {
        throw new Error("Empty response from backend");
      }
      
      const candles = res.data.result;
      if (!candles || !candles.t || candles.t.length === 0) {
        setError("No candle data returned for the selected range.");
        setLoading(false);
        return;
      }

      // Simple test - just show the data we received
      const openingPrice = candles.c[0];
      const FM_thresh = (Number(iv) / 1900) * openingPrice;
      
      console.log('🧮 Calculation debug:');
      console.log('   Opening price:', openingPrice);
      console.log('   FM threshold:', FM_thresh);
      
      const movements = {
        openingPrice: openingPrice,
        ivPercent: Number(iv),
        thresholds: { 
          FM: FM_thresh, 
          LM: FM_thresh * 0.7, 
          SM: FM_thresh * 0.25 
        },
        totals: { FM: 0, LM: 0, SM: 0 },
        events: []
      };

      const s = { 
        instrument, 
        iv, 
        startDate, 
        endDate, 
        candles, 
        movements 
      };
      setSummary(s);
      
    } catch (err) {
      console.error("❌ Fetch error:", err);
      const msg = err?.response?.data?.error || err?.response?.data || err?.message || String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24 }}>
      <h1>🚀 BTC Price Debug Tool</h1>
      <p><strong>Location: C:\binance-frontend\src\App.jsx</strong></p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <select 
          value={instrument} 
          onChange={(e) => setInstrument(e.target.value)} 
          style={{ padding: 6 }}
        >
          <option value="BTC-PERPETUAL">BTC-PERPETUAL</option>
          <option value="ETH-PERPETUAL">ETH-PERPETUAL</option>
        </select>

        <input 
          type="number" 
          value={iv} 
          onChange={(e) => setIv(e.target.value)} 
          placeholder="IV %" 
          style={{ width: 90, padding: 6 }} 
        />

        <input 
          type="date" 
          value={startDate} 
          onChange={(e) => setStartDate(e.target.value)} 
          style={{ padding: 6 }} 
        />
        <input 
          type="date" 
          value={endDate} 
          onChange={(e) => setEndDate(e.target.value)} 
          style={{ padding: 6 }} 
        />

        <button 
          onClick={fetchAndCompute} 
          disabled={loading} 
          style={{ padding: "6px 12px", background: '#007acc', color: 'white', border: 'none' }}
        >
          {loading ? "Loading..." : "🚀 Fetch & Debug"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fdecea", color: "#7a1f1f", padding: 10, borderRadius: 6, marginBottom: 12 }}>
          <b>Error:</b> {String(error)}
        </div>
      )}

      {summary && (
        <div style={{ background: "#fafafa", padding: 14, borderRadius: 8 }}>
          <h3>📊 Debug Results</h3>
          <div><strong>Opening Price:</strong> {Number(summary.movements.openingPrice).toLocaleString()}</div>
          <div><strong>FM Threshold:</strong> {Number(summary.movements.thresholds.FM).toLocaleString()}</div>
          <div><strong>Candles Received:</strong> {summary.candles.t?.length || 0}</div>
          <div><strong>Backend:</strong> {API_BASE}</div>
        </div>
      )}

      {!summary && !error && (
        <div style={{ marginTop: 18, color: "#666", padding: 20, textAlign: 'center' }}>
          <p>Select a range and click <b>🚀 Fetch & Debug</b></p>
          <p><small>Check browser Console (F12) for detailed debug information</small></p>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "#999" }}>
        <div><strong>File location:</strong> C:\binance-frontend\src\App.jsx</div>
        <div><strong>Backend:</strong> <code>{API_BASE}</code></div>
        <div><strong>Frontend:</strong> <code>localhost:5173</code></div>
      </div>
    </div>
  );
}

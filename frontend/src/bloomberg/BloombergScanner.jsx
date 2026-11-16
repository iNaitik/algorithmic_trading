import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

export default function BloombergScanner({
  currency = "₹",
  onSelectForBacktest = () => {},
  onSelectForBot = () => {}
}) {
  const [scannerData, setScannerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("ALL"); // ALL, LONGS, SHORTS, HIGHRVOL, GAPS
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("alpha_score"); // alpha_score, rvol, change_pct, gap_pct
  const [armLoadingSymbol, setArmLoadingSymbol] = useState(null);

  const fetchScannerData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scanner/morning');
      if (res.ok) {
        setScannerData(await res.json());
      }
    } catch (e) {
      console.error("Bloomberg Scanner fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scanner/scan', { method: 'POST' });
      if (res.ok) {
        setScannerData(await res.json());
      }
    } catch (e) {
      console.error("Bloomberg scan trigger error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScannerData();
    const interval = setInterval(fetchScannerData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Arm stock in Live Bot
  const handleArmBot = async (sym) => {
    setArmLoadingSymbol(sym);
    try {
      await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "START",
          symbol: sym,
          strategy_name: "NSE Intraday ORB Breakout",
          capital: 1000000.0
        })
      });
      onSelectForBot(sym);
    } catch (err) {
      console.error("Arm bot error:", err);
    } finally {
      setArmLoadingSymbol(null);
    }
  };

  const rawBreakouts = scannerData?.breakouts || [];
  const sentiment = scannerData?.market_sentiment || { advancers: 32, decliners: 18, dominant_sector: 'Banking & Financials' };
  const metrics = scannerData?.metrics || { average_rvol: 2.14, daemon_status: 'AUTO-LOCKED (09:16 AM)' };

  // Filtered & Sorted Breakouts
  const filteredBreakouts = rawBreakouts
    .filter(item => {
      const q = searchQuery.toLowerCase();
      const matchQuery = !q || item.symbol.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q)) || (item.sector && item.sector.toLowerCase().includes(q));
      if (!matchQuery) return false;

      if (filterType === "LONGS") return item.signal === "LONG" || (item.change_pct || 0) > 0;
      if (filterType === "SHORTS") return item.signal === "SHORT" || (item.change_pct || 0) < 0;
      if (filterType === "HIGHRVOL") return (item.rvol || 0) >= 1.5;
      if (filterType === "GAPS") return Math.abs(item.gap_pct || 0) >= 0.5;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "rvol") return (b.rvol || 0) - (a.rvol || 0);
      if (sortBy === "change_pct") return (b.change_pct || 0) - (a.change_pct || 0);
      if (sortBy === "gap_pct") return Math.abs(b.gap_pct || 0) - Math.abs(a.gap_pct || 0);
      return (b.alpha_score || 0) - (a.alpha_score || 0);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* ── Top Command & Telemetry Ribbon ── */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="bbg-pulse-live" />
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ff9900' }}>
            SCANNER // 09:16 AM OPENING BREAKOUT &amp; RVOL RADAR
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            {scannerData?.timestamp || 'SESSION TICK SYNCED'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={triggerScan}
            disabled={loading}
            className="bbg-fkey-btn"
            style={{ borderColor: '#ff9900', color: '#ff9900' }}
          >
            <RotateCcw size={11} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'SCANNING NSE...' : '<RESCAN MARKET>'}</span>
          </button>
        </div>
      </div>

      {/* ── 4 Market Intelligence Ribbon Strips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>MARKET BREADTH (A/D)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#00ff66' }}>{sentiment.advancers || 0}▲</span>
            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ff3344' }}>{sentiment.decliners || 0}▼</span>
            <span style={{ fontSize: '0.7rem', color: '#00e5ff' }}>({((sentiment.advancers || 1) / (sentiment.decliners || 1)).toFixed(2)}x)</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>ADVANCE/DECLINE FLOW</div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>VOLUME SURGE VELOCITY</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#00e5ff', marginTop: '2px' }}>
            {metrics.average_rvol || 2.1}x RVOL
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>VS 20-DAY OPENING NORM</div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>DOMINANT SECTOR MOMENTUM</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ff9900', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sentiment.dominant_sector || 'Banking & Fin.'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>PRIMARY FLOW CONCENTRATION</div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>DAEMON SCHEDULER</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#00ff66', marginTop: '2px' }}>
            {metrics.daemon_status || 'ARMED (09:16 AM)'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>AUTO-LOCK MIS BREAKOUT</div>
        </div>
      </div>

      {/* ── Filter Bar & Search ── */}
      <div className="bbg-panel" style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {[
            { id: "ALL", label: `ALL (${rawBreakouts.length})` },
            { id: "LONGS", label: `LONGS (${rawBreakouts.filter(x => x.signal === "LONG" || (x.change_pct || 0) > 0).length})` },
            { id: "SHORTS", label: `SHORTS (${rawBreakouts.filter(x => x.signal === "SHORT" || (x.change_pct || 0) < 0).length})` },
            { id: "HIGHRVOL", label: `HIGH RVOL >1.5x` },
            { id: "GAPS", label: `GAP PLAYS >0.5%` }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`bbg-fkey-btn ${filterType === f.id ? 'active' : ''}`}
              style={{ fontSize: '0.68rem' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>FIND:</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bbg-cmd-input"
              style={{ width: '120px', fontSize: '0.72rem', padding: '2px 6px' }}
              placeholder="SYM / SECTOR"
            />
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>SORT:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#ff9900',
                fontSize: '0.7rem',
                padding: '2px 6px',
                outline: 'none'
              }}
            >
              <option value="alpha_score">Alpha Score</option>
              <option value="rvol">RVOL Surge</option>
              <option value="change_pct">% Change</option>
              <option value="gap_pct">Gap %</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Main Screener Data Ledger Table ── */}
      <div className="bbg-panel" style={{ flex: 1, minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
        <div className="bbg-panel-header">
          <span>INSTITUTIONAL BREAKOUT LEDGER // {filteredBreakouts.length} CANDIDATES</span>
          <span style={{ color: '#00e5ff' }}>REAL-TIME ORDER FLOW</span>
        </div>

        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="bbg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TICKER</th>
                <th>COMPANY / SECTOR</th>
                <th>LTP</th>
                <th>DAY CHG %</th>
                <th>RVOL</th>
                <th>GAP %</th>
                <th>SIGNAL</th>
                <th>15M ORB HIGH</th>
                <th>15M ORB LOW</th>
                <th>TARGET (2R)</th>
                <th>STOP LOSS</th>
                <th>ALPHA</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredBreakouts.length === 0 ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    NO EQUITIES MATCHING SPECIFIED FILTER CRITERIA
                  </td>
                </tr>
              ) : (
                filteredBreakouts.map((item, index) => {
                  const isLong = item.signal === "LONG" || (item.change_pct || 0) >= 0;
                  const isArmed = armLoadingSymbol === item.symbol;

                  return (
                    <tr key={item.symbol || index}>
                      <td style={{ color: '#64748b' }}>{index + 1}</td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#f8fafc', letterSpacing: '0.03em' }}>
                          {item.symbol?.replace('.NS', '')}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{item.name || item.symbol}</div>
                        <div style={{ color: '#64748b', fontSize: '0.65rem' }}>{item.sector || 'NSE Largecap'}</div>
                      </td>
                      <td style={{ color: '#00e5ff', fontWeight: '700' }}>
                        {currency}{Number(item.last_price || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className={isLong ? 'bbg-badge-up' : 'bbg-badge-down'}>
                          {isLong ? '+' : ''}{Number(item.change_pct || 0).toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <span style={{ color: (item.rvol || 0) >= 2.0 ? '#ff9900' : '#e2e8f0', fontWeight: '800' }}>
                          {Number(item.rvol || 1).toFixed(2)}x
                        </span>
                      </td>
                      <td style={{ color: (item.gap_pct || 0) >= 0 ? '#00ff66' : '#ff3344' }}>
                        {(item.gap_pct || 0) >= 0 ? '+' : ''}{Number(item.gap_pct || 0).toFixed(2)}%
                      </td>
                      <td>
                        <span className={isLong ? 'bbg-badge-up' : 'bbg-badge-down'}>
                          {item.signal || (isLong ? 'LONG' : 'SHORT')}
                        </span>
                      </td>
                      <td style={{ color: '#94a3b8' }}>{currency}{Number(item.orb_high || item.last_price * 1.005).toFixed(2)}</td>
                      <td style={{ color: '#94a3b8' }}>{currency}{Number(item.orb_low || item.last_price * 0.995).toFixed(2)}</td>
                      <td style={{ color: '#00ff66', fontWeight: '700' }}>{currency}{Number(item.target || item.last_price * 1.02).toFixed(2)}</td>
                      <td style={{ color: '#ff3344', fontWeight: '700' }}>{currency}{Number(item.stop_loss || item.last_price * 0.99).toFixed(2)}</td>
                      <td style={{ color: '#ff9900', fontWeight: '800' }}>{Number(item.alpha_score || 85).toFixed(0)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleArmBot(item.symbol)}
                            disabled={isArmed}
                            className="bbg-fkey-btn"
                            style={{
                              borderColor: '#00ff66',
                              color: '#00ff66',
                              backgroundColor: 'rgba(0, 255, 102, 0.12)',
                              fontSize: '0.65rem',
                              padding: '2px 6px'
                            }}
                          >
                            {isArmed ? 'ARMING...' : '<ARM BOT>'}
                          </button>
                          <button
                            onClick={() => onSelectForBacktest(item.symbol, "NSE Intraday ORB Breakout")}
                            className="bbg-fkey-btn"
                            style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          >
                            &lt;BT&gt;
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

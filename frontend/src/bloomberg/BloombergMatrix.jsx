import React, { useState, useEffect } from 'react';
import { RotateCcw, Layers } from 'lucide-react';

export default function BloombergMatrix({
  currency = "₹",
  onSelectCombination = () => {}
}) {
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStrategy, setFilterStrategy] = useState("ALL");
  const [filterStock, setFilterStock] = useState("ALL");
  const [sortBy, setSortBy] = useState("sharpe"); // sharpe, win_rate, return_pct, net_pnl
  const [viewMode, setViewMode] = useState("TABLE"); // TABLE, HEATMAP

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/matrix/summary');
      if (res.ok) {
        setMatrixData(await res.json());
      }
    } catch (e) {
      console.error("Bloomberg matrix fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const rawRows = matrixData?.matrix || matrixData?.leaderboard || matrixData?.runs || [];

  // Filtered & Sorted Rows
  const filteredRows = rawRows
    .filter(item => {
      const matchStrat = filterStrategy === "ALL" || item.strategy === filterStrategy;
      const matchStock = filterStock === "ALL" || item.asset === filterStock || item.symbol === filterStock;
      return matchStrat && matchStock;
    })
    .sort((a, b) => {
      if (sortBy === "win_rate") return (b.win_rate || 0) - (a.win_rate || 0);
      if (sortBy === "return_pct") return (b.return_pct || b.net_return_pct || 0) - (a.return_pct || a.net_return_pct || 0);
      if (sortBy === "net_pnl") return (b.net_pnl || 0) - (a.net_pnl || 0);
      return (b.sharpe || b.sharpe_ratio || 0) - (a.sharpe || a.sharpe_ratio || 0);
    });

  // Unique options for filters
  const uniqueStrategies = Array.from(new Set(rawRows.map(r => r.strategy).filter(Boolean)));
  const uniqueAssets = Array.from(new Set(rawRows.map(r => r.asset || r.symbol).filter(Boolean)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* ── Top Command Bar ── */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Layers size={14} color="#ff9900" />
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ff9900' }}>
            FACTOR MATRIX // CROSS-SECTIONAL STRATEGY SURFACE
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            TOTAL RUNS: {rawRows.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setViewMode(viewMode === "TABLE" ? "HEATMAP" : "TABLE")}
            className="bbg-fkey-btn"
          >
            VIEW: {viewMode}
          </button>

          <button
            onClick={fetchSummary}
            disabled={loading}
            className="bbg-fkey-btn"
            style={{ borderColor: '#ff9900', color: '#ff9900' }}
          >
            <RotateCcw size={11} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'RELOADING...' : '<REFRESH>'}</span>
          </button>
        </div>
      </div>

      {/* ── Filter Controls ── */}
      <div className="bbg-panel" style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>STRATEGY:</span>
          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            style={{
              backgroundColor: '#000000',
              border: '1px solid #1e293b',
              color: '#00e5ff',
              fontSize: '0.72rem',
              padding: '2px 6px',
              outline: 'none'
            }}
          >
            <option value="ALL">ALL STRATEGIES ({uniqueStrategies.length})</option>
            {uniqueStrategies.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>ASSET:</span>
          <select
            value={filterStock}
            onChange={(e) => setFilterStock(e.target.value)}
            style={{
              backgroundColor: '#000000',
              border: '1px solid #1e293b',
              color: '#ff9900',
              fontSize: '0.72rem',
              padding: '2px 6px',
              outline: 'none'
            }}
          >
            <option value="ALL">ALL ASSETS ({uniqueAssets.length})</option>
            {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>RANK BY:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              backgroundColor: '#000000',
              border: '1px solid #1e293b',
              color: '#00ff66',
              fontSize: '0.72rem',
              padding: '2px 6px',
              outline: 'none'
            }}
          >
            <option value="sharpe">Sharpe Ratio</option>
            <option value="win_rate">Win Rate %</option>
            <option value="return_pct">Net Return %</option>
            <option value="net_pnl">Net P&amp;L</option>
          </select>
        </div>
      </div>

      {/* ── Table View ── */}
      {viewMode === "TABLE" && (
        <div className="bbg-panel" style={{ flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div className="bbg-panel-header">
            <span>PERFORMANCE MATRIX LEADERBOARD</span>
            <span style={{ color: '#00e5ff' }}>{filteredRows.length} COMBINATIONS</span>
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table className="bbg-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ASSET</th>
                  <th>STRATEGY</th>
                  <th>TF</th>
                  <th>WIN RATE %</th>
                  <th>NET RETURN %</th>
                  <th>SHARPE</th>
                  <th>MAX DD %</th>
                  <th>TRADES</th>
                  <th>NET P&amp;L</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      NO MATRIX RUNS RECORDED. RUN MATRIX FROM SERVER OR BACKTEST COMBINATIONS.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const sym = row.asset || row.symbol || '---';
                    const strat = row.strategy || '---';
                    const tf = row.timeframe || row.interval || '2m';
                    const retPct = row.return_pct || row.net_return_pct || 0;
                    const isPositive = retPct >= 0;
                    const sharpe = row.sharpe || row.sharpe_ratio || 0;

                    return (
                      <tr key={idx}>
                        <td style={{ color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ fontWeight: '800', color: '#ff9900' }}>{sym.replace('.NS', '')}</td>
                        <td style={{ color: '#e2e8f0', fontSize: '0.72rem' }}>{strat}</td>
                        <td style={{ color: '#00e5ff', fontWeight: '700' }}>{tf}</td>
                        <td style={{ color: '#00e5ff', fontWeight: '700' }}>
                          {Number(row.win_rate || row.win_rate_pct || 0).toFixed(1)}%
                        </td>
                        <td>
                          <span className={isPositive ? 'bbg-badge-up' : 'bbg-badge-down'}>
                            {isPositive ? '+' : ''}{Number(retPct).toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ color: sharpe >= 1.0 ? '#00ff66' : (sharpe >= 0 ? '#ffaa00' : '#ff3344'), fontWeight: '800' }}>
                          {Number(sharpe).toFixed(2)}
                        </td>
                        <td style={{ color: '#ff3344' }}>
                          -{Math.abs(Number(row.max_drawdown_pct || row.max_drawdown || 0)).toFixed(2)}%
                        </td>
                        <td style={{ fontWeight: '700' }}>{row.trades || row.total_trades || 0}</td>
                        <td style={{ color: isPositive ? '#00ff66' : '#ff3344', fontWeight: '800' }}>
                          {currency}{Number(row.net_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>
                          <button
                            onClick={() => onSelectCombination({ asset: sym, strategy: strat, timeframe: tf })}
                            className="bbg-fkey-btn"
                            style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          >
                            &lt;BT&gt;
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Heatmap Grid View ── */}
      {viewMode === "HEATMAP" && (
        <div className="bbg-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#ff9900', marginBottom: '8px' }}>
            ALPHA HEATMAP (SHARPE &amp; RETURN DENSITY)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
            {filteredRows.slice(0, 48).map((row, i) => {
              const ret = row.return_pct || row.net_return_pct || 0;
              const isWin = ret >= 0;
              return (
                <div
                  key={i}
                  onClick={() => onSelectCombination({
                    asset: row.asset || row.symbol,
                    strategy: row.strategy,
                    timeframe: row.timeframe || row.interval || '2m'
                  })}
                  style={{
                    backgroundColor: isWin ? 'rgba(0, 255, 102, 0.1)' : 'rgba(255, 51, 68, 0.1)',
                    border: `1px solid ${isWin ? '#00ff66' : '#ff3344'}`,
                    padding: '8px',
                    borderRadius: '2px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#ff9900' }}>
                    {(row.asset || row.symbol)?.replace('.NS', '')}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.strategy}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '800', color: isWin ? '#00ff66' : '#ff3344', marginTop: '4px' }}>
                    {isWin ? '+' : ''}{Number(ret).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#00e5ff' }}>
                    SHARPE: {Number(row.sharpe || row.sharpe_ratio || 0).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

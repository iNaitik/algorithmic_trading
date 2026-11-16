import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Terminal,
  XCircle,
  Trash2
} from 'lucide-react';

export default function BloombergBotMonitor({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {},
  _onSelectSymbol = () => {}
}) {
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [strategy, setStrategy] = useState("NSE Midday VWAP Pullback");
  const [botData, setBotData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [logFilter, setLogFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);

  const userSelectedSymbolRef = useRef(false);
  const terminalLogsRef = useRef(null);

  // Polling real-time engine telemetry
  const fetchData = async () => {
    try {
      const querySym = userSelectedSymbolRef.current ? `?symbol=${encodeURIComponent(symbol)}` : '';
      const [botRes, wlRes] = await Promise.all([
        fetch(`/api/bot/state${querySym}`),
        fetch(`/api/market/watchlist?market=${market}`)
      ]);
      if (botRes.ok) {
        const json = await botRes.json();
        setBotData(json);
        if (!userSelectedSymbolRef.current && (json.active_symbol || json.bot_state?.symbol)) {
          setSymbol(json.active_symbol || json.bot_state.symbol);
        }
        if (json.active_strategy || json.bot_state?.strategy) {
          setStrategy(json.active_strategy || json.bot_state.strategy);
        }
      }
      if (wlRes.ok) setWatchlist(await wlRes.json());
    } catch (e) {
      console.error("Bloomberg Bot telemetry error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, [symbol, market]);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (autoScroll && terminalLogsRef.current) {
      terminalLogsRef.current.scrollTop = terminalLogsRef.current.scrollHeight;
    }
  }, [botData?.logs, autoScroll]);

  // Bot action handler
  const handleControl = async (action, overrideSymbol = null) => {
    const targetSymbol = overrideSymbol || symbol;
    setActionLoading(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          symbol: targetSymbol,
          strategy_name: strategy,
          capital: 1000000.0
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.bot_state) {
          setBotData(prev => ({ ...prev, bot_state: json.bot_state }));
        }
      }
    } catch (err) {
      console.error("Bloomberg control failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Clear server logs
  const handleClearLogs = async () => {
    try {
      await fetch('/api/bot/logs/clear', { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  };

  const isArmed = botData?.bot_state?.status?.includes("ACTIVE");
  const isPaused = botData?.bot_state?.status === "PAUSED";
  const pos = botData?.position || {};
  const hasPosition = Boolean(pos.side && pos.side !== "NONE" && pos.shares > 0);
  const isLong = pos.side === "LONG";
  const pnl = pos.unrealized_pnl || 0;
  const isPnlPositive = pnl >= 0;

  // Realized stats
  const realizedPnl = botData?.realized_pnl || 0;
  const totalTrades = botData?.total_trades || 0;
  const winRate = botData?.win_rate || 0;
  const friction = botData?.total_friction || 0;

  // Filter logs
  const filteredLogs = (botData?.logs || []).filter(line => {
    if (logFilter === "ALL") return true;
    if (logFilter === "ORDERS") return line.includes("ORDER") || line.includes("FILL") || line.includes("ENTRY") || line.includes("EXIT");
    if (logFilter === "RISK") return line.includes("RISK") || line.includes("CIRCUIT") || line.includes("STOP");
    if (logFilter === "TICKS") return line.includes("TICK") || line.includes("CANDLE");
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* ── Top Command & Telemetry Ribbon ── */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="bbg-pulse-live" style={{ backgroundColor: isArmed ? '#00ff66' : (isPaused ? '#ffaa00' : '#ff3344') }} />
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: isArmed ? '#00ff66' : (isPaused ? '#ffaa00' : '#ff3344') }}>
              {isArmed ? 'ENGINE ARMED [09:15-15:15 MIS]' : (isPaused ? 'ENGINE PAUSED' : 'ENGINE DISARMED')}
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: '#1e293b' }} />

          {/* Symbol Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>ACTIVE SYM:</span>
            <select
              value={symbol}
              onChange={(e) => {
                userSelectedSymbolRef.current = true;
                setSymbol(e.target.value);
              }}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #ff9900',
                color: '#ff9900',
                fontWeight: '700',
                padding: '3px 8px',
                fontSize: '0.75rem',
                borderRadius: '2px',
                outline: 'none'
              }}
            >
              {watchlist.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} ({currency}{item.last_price?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Strategy Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>STRAT:</span>
            <span style={{ color: '#00e5ff', fontSize: '0.75rem', fontWeight: '700' }}>
              {strategy}
            </span>
          </div>
        </div>

        {/* Engine Control Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!isArmed ? (
            <button
              onClick={() => handleControl("START")}
              disabled={actionLoading}
              className="bbg-fkey-btn"
              style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0, 255, 102, 0.15)', padding: '5px 12px' }}
            >
              <Play size={12} fill="#00ff66" />
              <span>&lt;ARM ENGINE&gt;</span>
            </button>
          ) : (
            <button
              onClick={() => handleControl("PAUSE")}
              disabled={actionLoading}
              className="bbg-fkey-btn"
              style={{ borderColor: '#ffaa00', color: '#ffaa00', background: 'rgba(255, 170, 0, 0.15)', padding: '5px 12px' }}
            >
              <Pause size={12} fill="#ffaa00" />
              <span>&lt;PAUSE BOT&gt;</span>
            </button>
          )}

          <button
            onClick={() => handleControl("SQUARE_OFF")}
            disabled={actionLoading || !hasPosition}
            className="bbg-fkey-btn"
            style={{
              borderColor: hasPosition ? '#ff3344' : '#1e293b',
              color: hasPosition ? '#ff3344' : '#64748b',
              background: hasPosition ? 'rgba(255, 51, 68, 0.15)' : 'transparent',
              padding: '5px 10px'
            }}
          >
            <Square size={12} />
            <span>&lt;SQ OFF ALL&gt;</span>
          </button>

          <button
            onClick={() => handleControl("STOP")}
            disabled={actionLoading}
            className="bbg-fkey-btn"
            style={{ borderColor: '#ef4444', color: '#ef4444', padding: '5px 10px' }}
          >
            <XCircle size={12} />
            <span>&lt;HALT&gt;</span>
          </button>
        </div>
      </div>

      {/* ── Watchlist Quick Ticker Strip ── */}
      <div className="bbg-panel" style={{ padding: '4px 8px', display: 'flex', gap: '12px', overflowX: 'auto', backgroundColor: '#070a10' }}>
        <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800', alignSelf: 'center', whiteSpace: 'nowrap' }}>
          TICKER FLOW:
        </span>
        {watchlist.slice(0, 8).map(w => {
          const isSelected = w.symbol === symbol;
          const up = (w.change_pct || 0) >= 0;
          return (
            <div
              key={w.symbol}
              onClick={() => {
                userSelectedSymbolRef.current = true;
                setSymbol(w.symbol);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                backgroundColor: isSelected ? 'rgba(255, 153, 0, 0.15)' : '#0b101a',
                border: `1px solid ${isSelected ? '#ff9900' : '#1a2333'}`,
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '0.7rem',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ fontWeight: '700', color: isSelected ? '#ff9900' : '#e2e8f0' }}>{w.symbol.replace('.NS', '')}</span>
              <span style={{ color: '#00e5ff' }}>{currency}{w.last_price?.toFixed(2)}</span>
              <span style={{ color: up ? '#00ff66' : '#ff3344', fontWeight: '700' }}>
                {up ? '+' : ''}{(w.change_pct || 0).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Main Cockpit: 3-Column Bloomberg Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1.2fr', gap: '8px' }}>
        {/* Column 1: Live Position & Risk Ladder */}
        <div className="bbg-panel">
          <div className="bbg-panel-header">
            <span>POSITION COCKPIT // {symbol}</span>
            <span style={{ color: hasPosition ? (isLong ? '#00ff66' : '#ff3344') : '#94a3b8' }}>
              {hasPosition ? (isLong ? '● LONG MIS' : '● SHORT MIS') : '○ FLAT'}
            </span>
          </div>

          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Unrealized PnL Big Gauge */}
            <div style={{
              backgroundColor: '#06090f',
              border: `1px solid ${hasPosition ? (isPnlPositive ? '#00ff66' : '#ff3344') : '#1e293b'}`,
              padding: '10px',
              borderRadius: '2px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', letterSpacing: '0.05em' }}>UNREALIZED INTRADAY P&L</div>
              <div style={{
                fontSize: '1.6rem',
                fontWeight: '800',
                color: hasPosition ? (isPnlPositive ? '#00ff66' : '#ff3344') : '#94a3b8',
                marginTop: '2px'
              }}>
                {currency}{hasPosition ? (isPnlPositive ? '+' : '') + pnl.toFixed(2) : '0.00'}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                LTP: <strong style={{ color: '#00e5ff' }}>{currency}{pos.current_price?.toFixed(2) || '0.00'}</strong> | SHARES: <strong style={{ color: '#ff9900' }}>{pos.shares || 0}</strong>
              </div>
            </div>

            {/* Position Metrics Table */}
            <table className="bbg-table" style={{ fontSize: '0.72rem' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#94a3b8' }}>ENTRY PRICE</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#e2e8f0' }}>{currency}{pos.entry_price?.toFixed(2) || '---'}</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>STOP LOSS (SL)</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>{currency}{pos.stop_loss?.toFixed(2) || '---'}</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>TARGET 1 (2R)</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>{currency}{pos.target_1?.toFixed(2) || '---'}</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>TARGET 2 (3R)</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>{currency}{pos.target_2?.toFixed(2) || '---'}</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>MIS LEVERAGE</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00e5ff' }}>5.0x (SEBI COMPLIANT)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>AUTO SQUARE-OFF</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff9900' }}>15:15:00 IST</td>
                </tr>
              </tbody>
            </table>

            {/* Intra-Candle Risk Ladder Meter */}
            {hasPosition && (
              <div style={{ backgroundColor: '#090d15', border: '1px solid #1e293b', padding: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '4px' }}>
                  <span style={{ color: '#ff3344' }}>SL: {pos.stop_loss?.toFixed(2)}</span>
                  <span style={{ color: '#00e5ff' }}>NOW: {pos.current_price?.toFixed(2)}</span>
                  <span style={{ color: '#00ff66' }}>TGT: {pos.target_1?.toFixed(2)}</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '1px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, ((pos.current_price - pos.stop_loss) / (pos.target_1 - pos.stop_loss || 1)) * 100))}%`,
                    height: '100%',
                    backgroundColor: isPnlPositive ? '#00ff66' : '#ff3344',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Order Fill Blotter & Execution Flow */}
        <div className="bbg-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="bbg-panel-header">
            <span>ORDER BLOTTER & EXECUTIONS // SESSION</span>
            <span style={{ color: '#00e5ff' }}>{(botData?.fills || []).length} FILLS</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
            <table className="bbg-table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>SYM</th>
                  <th>SIDE</th>
                  <th>QTY</th>
                  <th>PRICE</th>
                  <th>FEES</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(botData?.fills || []).length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      NO INTRADAY FILLS RECORDED YET. ENGINE MONITORING TICK STREAM...
                    </td>
                  </tr>
                ) : (
                  (botData.fills || []).map((f, i) => {
                    const isBuy = f.side === "BUY" || f.side === "LONG";
                    return (
                      <tr key={i}>
                        <td style={{ color: '#94a3b8' }}>{f.time || f.timestamp || '---'}</td>
                        <td style={{ color: '#ff9900', fontWeight: '700' }}>{f.symbol?.replace('.NS', '')}</td>
                        <td>
                          <span className={isBuy ? 'bbg-badge-up' : 'bbg-badge-down'}>
                            {f.side}
                          </span>
                        </td>
                        <td style={{ fontWeight: '700' }}>{f.shares || f.quantity}</td>
                        <td style={{ color: '#00e5ff', fontWeight: '700' }}>{currency}{Number(f.price).toFixed(2)}</td>
                        <td style={{ color: '#ff3344' }}>{currency}{Number(f.fees || 0).toFixed(1)}</td>
                        <td>
                          <span style={{ color: '#00ff66', fontSize: '0.68rem', fontWeight: '700' }}>FILLED</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Blotter Actions */}
          <div style={{
            padding: '6px 10px',
            borderTop: '1px solid #1e293b',
            backgroundColor: '#0a0e17',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
              FEES: <strong style={{ color: '#ff3344' }}>{currency}{friction.toFixed(2)}</strong> (STT+BROKERAGE)
            </span>
            <button
              onClick={onNavigateToBacktest}
              className="bbg-fkey-btn"
              style={{ fontSize: '0.68rem' }}
            >
              &lt;ANALYZE IN BACKTESTER F3&gt;
            </button>
          </div>
        </div>

        {/* Column 3: Daily Session Ledger & Performance */}
        <div className="bbg-panel">
          <div className="bbg-panel-header">
            <span>SESSION LEDGER // METRICS</span>
            <span style={{ color: '#ff9900' }}>MIS 24H</span>
          </div>

          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div style={{ backgroundColor: '#070a10', border: '1px solid #1e293b', padding: '6px 8px' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>REALIZED P&L</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: realizedPnl >= 0 ? '#00ff66' : '#ff3344' }}>
                  {currency}{realizedPnl.toFixed(2)}
                </div>
              </div>
              <div style={{ backgroundColor: '#070a10', border: '1px solid #1e293b', padding: '6px 8px' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>WIN RATE %</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#00e5ff' }}>
                  {winRate.toFixed(1)}%
                </div>
              </div>
            </div>

            <table className="bbg-table" style={{ fontSize: '0.72rem' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#94a3b8' }}>TOTAL TRADES</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#e2e8f0' }}>{totalTrades}</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>MAX DAILY DRAWDOWN</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>{currency}20,000 (HARD STOP)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>DAEMON HEARTBEAT</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>ACTIVE (15s CHECK)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>MIS STATUTORY FEE</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ffaa00' }}>NSE MIS (0.03% STT)</td>
                </tr>
              </tbody>
            </table>

            {/* Quick Command Action Box */}
            <div style={{
              backgroundColor: '#090d16',
              border: '1px dashed #334155',
              padding: '8px',
              borderRadius: '2px',
              marginTop: '4px'
            }}>
              <div style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '700', marginBottom: '4px' }}>
                QUICK TERMINAL COMMANDS:
              </div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Type in top command bar:<br />
                • <strong style={{ color: '#00e5ff' }}>START &lt;GO&gt;</strong> - Arms bot<br />
                • <strong style={{ color: '#ff3344' }}>SQOFF &lt;GO&gt;</strong> - Square off position<br />
                • <strong style={{ color: '#00ff66' }}>RELIANCE &lt;GO&gt;</strong> - Switch symbol
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Panel: Streaming Real-Time Engine Console Logs ── */}
      <div className="bbg-panel" style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
        <div className="bbg-panel-header" style={{ padding: '4px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={13} color="#ff9900" />
            <span>REAL-TIME ENGINE TELEMETRY STREAM</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['ALL', 'ORDERS', 'RISK', 'TICKS'].map(filter => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className={`bbg-fkey-btn ${logFilter === filter ? 'active' : ''}`}
                style={{ fontSize: '0.65rem', padding: '1px 6px' }}
              >
                {filter}
              </button>
            ))}

            <div style={{ width: '1px', height: '14px', backgroundColor: '#1e293b' }} />

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className="bbg-fkey-btn"
              style={{ fontSize: '0.65rem', padding: '1px 6px', color: autoScroll ? '#00ff66' : '#64748b' }}
            >
              SCROLL: {autoScroll ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={handleClearLogs}
              className="bbg-fkey-btn"
              title="Clear Server Logs"
              style={{ fontSize: '0.65rem', padding: '1px 6px', color: '#ff3344' }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>

        {/* Console Body */}
        <div
          ref={terminalLogsRef}
          style={{
            flex: 1,
            backgroundColor: '#040609',
            overflowY: 'auto',
            padding: '8px 12px',
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            fontSize: '0.72rem',
            lineHeight: '1.4',
            color: '#cbd5e1'
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '20px' }}>
              &gt; Telemetry stream idle. Awaiting engine events...
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              let color = '#94a3b8';
              if (log.includes("BUY") || log.includes("LONG") || log.includes("PROFIT") || log.includes("FILLED")) color = '#00ff66';
              else if (log.includes("SELL") || log.includes("SHORT") || log.includes("STOP LOSS") || log.includes("HALT") || log.includes("ERROR")) color = '#ff3344';
              else if (log.includes("RISK") || log.includes("WARNING") || log.includes("PAUSE") || log.includes("MIS")) color = '#ffaa00';
              else if (log.includes("CANDLE") || log.includes("TICK") || log.includes("MONITOR")) color = '#38bdf8';

              return (
                <div key={index} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

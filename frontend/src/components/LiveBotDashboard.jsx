import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Pause,
  Square,
  RotateCcw,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Clock,
  Layers,
  CreditCard,
  Send,
  Download,
  Terminal,
  CheckCircle2,
  XCircle,
  Trash2,
  Filter,
  Maximize2,
  FileText,
  ChevronRight,
  RefreshCw,
  Sliders
} from 'lucide-react';

export default function LiveBotDashboard({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {}
}) {
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [strategy, setStrategy] = useState("NSE Midday VWAP Pullback");
  const [botData, setBotData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [logFilter, setLogFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [tradeScope, setTradeScope] = useState("ALL"); // "ALL" or "SYMBOL"
  const [activeBottomView, setActiveBottomView] = useState("DUAL"); // "DUAL", "LOGS", "TRADES"
  const [countdownText, setCountdownText] = useState("");

  const logsEndRef = useRef(null);

  // Live Market Countdown Timer (09:15 AM IST Open / 03:15 PM MIS / 03:30 PM Close)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      // IST is UTC + 5:30
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));

      const hours = ist.getHours();
      const minutes = ist.getMinutes();
      const seconds = ist.getSeconds();
      const currentSeconds = hours * 3600 + minutes * 60 + seconds;

      const openSeconds = 9 * 3600 + 15 * 60; // 09:15:00
      const sqSeconds = 15 * 3600 + 15 * 60;  // 15:15:00
      const closeSeconds = 15 * 3600 + 30 * 60; // 15:30:00

      if (currentSeconds < openSeconds) {
        const diff = openSeconds - currentSeconds;
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setCountdownText(`Market Opens in ${m}m ${s}s (09:15 AM)`);
      } else if (currentSeconds >= openSeconds && currentSeconds < sqSeconds) {
        const diff = sqSeconds - currentSeconds;
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        setCountdownText(`Market LIVE • MIS Square-Off in ${h}h ${m}m`);
      } else if (currentSeconds >= sqSeconds && currentSeconds < closeSeconds) {
        const diff = closeSeconds - currentSeconds;
        const m = Math.floor(diff / 60);
        setCountdownText(`MIS Squared Off • Market Closes in ${m}m`);
      } else {
        setCountdownText("NSE Market Closed • Next Session Tomorrow 09:15 AM");
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch bot telemetry, logs, and market quotes
  const fetchData = async () => {
    try {
      const [botRes, wlRes] = await Promise.all([
        fetch(`/api/bot/state?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/market/watchlist?market=${market}`)
      ]);
      if (botRes.ok) {
        const json = await botRes.json();
        setBotData(json);
        if (json.bot_state?.strategy) {
          setStrategy(json.bot_state.strategy);
        }
      }
      if (wlRes.ok) setWatchlist(await wlRes.json());
    } catch (e) {
      console.error("Telemetry error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // 3s polling for real-time reactivity
    return () => clearInterval(interval);
  }, [symbol, market]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [botData?.logs, autoScroll]);

  // Bot Control Actions
  const handleControl = async (action) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, symbol, strategy_name: strategy, capital: 1000000.0 })
      });
      if (res.ok) {
        const json = await res.json();
        setBotData(prev => ({
          ...prev,
          bot_state: json.bot_state
        }));
        await fetchData();
      }
    } catch (e) {
      console.error("Control error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/bot/logs/clear', { method: 'POST' });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  };

  const handleDownloadLogs = () => {
    const rawLogs = botData?.logs || [];
    const textContent = rawLogs
      .map(l => `[${l.date || ''} ${l.timestamp}] [${l.level}] [${l.symbol}] ${l.message}`)
      .join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `algo_bot_terminal_${symbol}_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTradesCSV = () => {
    const trades = tradeScope === "SYMBOL" ? (botData?.recent_trades || []) : (botData?.all_trades || []);
    if (!trades.length) return;
    const headers = ["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change", "Status"];
    const rows = trades.map(t => [
      t.Timestamp,
      t.Action,
      t.Symbol,
      t.Shares,
      t.Execution_Price,
      t.Cash_Change,
      t.Status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trade_history_${symbol}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const bot = botData?.bot_state || {
    status: "ACTIVE (MONITORING)",
    cash: 1000000.0,
    in_position: false,
    shares: 0,
    position_side: null,
    entry_price: 0.0,
    stop_loss: null,
    target_price: null
  };

  const isRunning = Boolean(bot.status?.includes("ACTIVE"));
  const isPaused = Boolean(bot.status?.includes("PAUSED"));
  const isInPosition = Boolean(bot.in_position && bot.shares > 0);

  const currentQuote = watchlist.find(w => w.symbol === symbol) || { price: 818.50, change_pct: 1.25, vwap: 814.20 };
  const currentLtp = currentQuote.price || bot.entry_price || 815.0;
  const positionValue = isInPosition ? bot.shares * currentLtp : 0;
  const totalNetWorth = (bot.cash || 1000000.0) + positionValue;
  const initialCapital = 1000000.0;
  const totalReturnPct = ((totalNetWorth - initialCapital) / initialCapital) * 100;
  const unrealizedPnl = isInPosition ? (currentLtp - bot.entry_price) * bot.shares : 0;

  // Real trades from backend
  const allFills = botData?.all_trades || [];
  const symbolFills = botData?.recent_trades || [];
  const activeFills = tradeScope === "SYMBOL" ? symbolFills : allFills;

  // Logs filtering
  const allLogs = botData?.logs || [];
  const filteredLogs = logFilter === "ALL"
    ? allLogs
    : allLogs.filter(l => l.level === logFilter);

  // Helper for log level color badge
  const getLogLevelStyle = (level) => {
    switch (level) {
      case 'ORDER':
        return { bg: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)' };
      case 'SIGNAL':
        return { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' };
      case 'INFO':
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' };
      case 'RISK':
        return { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' };
      case 'CONTROL':
        return { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
      case 'ERROR':
        return { bg: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)' };
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      padding: '24px 36px',
      maxWidth: '1440px',
      margin: '0 auto',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>

      {/* ── Top Countdown & Session Status Banner ──────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '14px',
        padding: '10px 18px',
        fontSize: '0.82rem',
        color: '#166534',
        fontWeight: '600',
        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} color="#059669" />
          <span>{countdownText}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem' }}>
          <span>Pre-Market Setup: <b style={{ color: '#059669' }}>09:00 AM IST</b></span>
          <span>•</span>
          <span>Morning Momentum Scan: <b style={{ color: '#059669' }}>09:16 AM IST</b></span>
          <span>•</span>
          <span>MIS Auto-Square-Off: <b style={{ color: '#dc2626' }}>03:15 PM IST</b></span>
        </div>
      </div>

      {/* ── Operational Control Strip ─────────────────────────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '20px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Left: Engine Status with Live Pulse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: isRunning ? '#e6f4ea' : (isPaused ? '#fef3c7' : '#fee2e2'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}>
            <Activity size={22} color={isRunning ? '#059669' : (isPaused ? '#d97706' : '#dc2626')} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.01em' }}>
                Automated Execution Engine
              </span>

              {/* Status Badge with Live Pulse */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '3px 10px',
                borderRadius: '8px',
                backgroundColor: isRunning ? '#e6f4ea' : (isPaused ? '#fef3c7' : '#fee2e2'),
                color: isRunning ? '#059669' : (isPaused ? '#b45309' : '#dc2626'),
                border: `1px solid ${isRunning ? '#a7f3d0' : (isPaused ? '#fde68a' : '#fecaca')}`,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isRunning ? '#059669' : (isPaused ? '#d97706' : '#dc2626'),
                  boxShadow: isRunning ? '0 0 8px #059669' : 'none'
                }} />
                {bot.status || "MONITORING"}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
              Instrument: <b style={{ color: '#111827' }}>{symbol}</b> • Strategy: <b style={{ color: '#059669' }}>{strategy}</b> • Timeframe: <b style={{ color: '#111827' }}>{bot.timeframe || "2m"}</b>
            </div>
          </div>
        </div>

        {/* Right: State-Aware Dynamic Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Symbol Selector */}
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{
              padding: '9px 14px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              color: '#111827',
              fontSize: '0.82rem',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="SBIN.NS">SBIN.NS (State Bank of India)</option>
            <option value="RELIANCE.NS">RELIANCE.NS (Reliance Industries)</option>
            <option value="HDFCBANK.NS">HDFCBANK.NS (HDFC Bank)</option>
            <option value="ICICIBANK.NS">ICICIBANK.NS (ICICI Bank)</option>
            <option value="TATAMOTORS.NS">TATAMOTORS.NS (Tata Motors)</option>
            <option value="TCS.NS">TCS.NS (Tata Consultancy Services)</option>
            <option value="INFY.NS">INFY.NS (Infosys Ltd)</option>
          </select>

          {/* DYNAMIC PLAY / PAUSE TOGGLE BUTTON */}
          <button
            onClick={() => handleControl(isRunning ? "PAUSE" : "START")}
            disabled={actionLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '10px',
              backgroundColor: isRunning ? '#d97706' : '#059669',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: 'none',
              boxShadow: isRunning ? '0 2px 10px rgba(217, 119, 6, 0.3)' : '0 2px 10px rgba(5, 150, 105, 0.35)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title={isRunning ? "Click to Pause Bot execution" : "Click to Start Bot execution"}
          >
            {actionLoading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : isRunning ? (
              <>
                <Pause size={14} fill="#ffffff" />
                <span>Pause Bot</span>
              </>
            ) : (
              <>
                <Play size={14} fill="#ffffff" />
                <span>Start Bot</span>
              </>
            )}
          </button>

          {/* SQUARE OFF BUTTON */}
          <button
            onClick={() => handleControl("SQUARE_OFF")}
            disabled={actionLoading || !isInPosition}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '10px',
              backgroundColor: isInPosition ? '#fee2e2' : '#f3f4f6',
              color: isInPosition ? '#dc2626' : '#9ca3af',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: isInPosition ? '1px solid #fecaca' : '1px solid #e5e7eb',
              cursor: isInPosition ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease'
            }}
            title={isInPosition ? "Manually square off active position" : "No open position to square off"}
          >
            <AlertTriangle size={14} />
            <span>Square Off {isInPosition ? `(${bot.shares} shs)` : ''}</span>
          </button>

          {/* RESET BUTTON */}
          <button
            onClick={() => handleControl("RESET")}
            disabled={actionLoading}
            title="Reset Virtual Margin to ₹10 Lakhs"
            style={{
              padding: '9px 12px',
              borderRadius: '10px',
              backgroundColor: '#f3f4f6',
              color: '#6b7280',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.78rem',
              fontWeight: '600'
            }}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* ── Quixotic Row 1: The 3 Hero Telemetry Cards ─────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 340px) 1fr minmax(280px, 320px)',
        gap: '20px'
      }}>
        {/* Card 1: Emerald VISA Margin Card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#111827' }}>
                Portfolio Capital
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total allocated fund & margin</div>
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280'
            }}>
              <TrendingUp size={16} />
            </div>
          </div>

          {/* Emerald Green VISA style Card */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #007a4d 100%)',
            borderRadius: '16px',
            padding: '20px',
            color: '#ffffff',
            boxShadow: '0 6px 18px -2px rgba(5, 150, 105, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '800', letterSpacing: '0.06em' }}>TRADING MARGIN</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.9, backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                NSE MIS 5X
              </span>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: '800', letterSpacing: '-0.02em', marginTop: '4px' }}>
              {currency}{totalNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', opacity: 0.9, marginTop: '4px' }}>
              <span>VIRTUAL ACCOUNT •••• 9090</span>
              <span>EXP 12/26</span>
            </div>
          </div>

          {/* Bottom stats under VISA card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Total Return (Paper)</div>
              <div style={{ fontSize: '1.05rem', fontWeight: '800', color: totalReturnPct >= 0 ? '#059669' : '#dc2626' }}>
                {totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%
              </div>
            </div>
            <span style={{
              fontSize: '0.74rem',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              Zero Brokerage Friction
            </span>
          </div>
        </div>

        {/* Card 2: Strategy Alpha Yield & Technical Gauges */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#e6f4ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={16} color="#059669" />
              </div>
              <div>
                <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#111827' }}>
                  Live Signal & Technicals
                </span>
                <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                  Evaluating {symbol} on {bot.timeframe || "2m"} candles
                </div>
              </div>
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: currentQuote.change_pct >= 0 ? '#e6f4ea' : '#fee2e2',
              color: currentQuote.change_pct >= 0 ? '#059669' : '#dc2626',
              fontSize: '0.75rem',
              fontWeight: '700'
            }}>
              {currentQuote.change_pct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {currentQuote.change_pct >= 0 ? '+' : ''}{currentQuote.change_pct}%
            </div>
          </div>

          {/* Real-time Indicator Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            backgroundColor: '#f9fafb',
            padding: '14px',
            borderRadius: '14px',
            border: '1px solid #f3f4f6'
          }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600' }}>LAST TRADED PRICE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827' }}>
                {currency}{currentLtp.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600' }}>SESSION VWAP</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#059669' }}>
                {currency}{(currentQuote.vwap || 814.20).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600' }}>RSI (14)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#3b82f6' }}>
                {currentQuote.rsi || 54.2}
              </div>
            </div>
          </div>

          {/* Position Status Details */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: isInPosition ? 'rgba(5, 150, 105, 0.08)' : '#f9fafb',
            border: `1px solid ${isInPosition ? '#a7f3d0' : '#e5e7eb'}`
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>ACTIVE POSITION</div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#111827' }}>
                {isInPosition ? (
                  <span style={{ color: '#059669' }}>
                    {bot.position_side} {bot.shares} Shares @ {currency}{bot.entry_price?.toFixed(2)}
                  </span>
                ) : (
                  <span style={{ color: '#6b7280' }}>FLAT (No Open Exposure)</span>
                )}
              </div>
            </div>
            {isInPosition && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>UNREALIZED P&L</div>
                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: unrealizedPnl >= 0 ? '#059669' : '#dc2626' }}>
                  {unrealizedPnl >= 0 ? '+' : ''}{currency}{unrealizedPnl.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Liquid Reserve & Mountain Area */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#111827' }}>
                  Liquid Reserve
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Available unencumbered cash</div>
              </div>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <TrendingUp size={16} />
              </div>
            </div>

            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', marginTop: '10px' }}>
              {currency}{(bot.cash || 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* Smooth Green Mountain Area Curve */}
          <div style={{ height: '65px', width: '100%', marginTop: '4px' }}>
            <svg viewBox="0 0 300 65" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="mintGradLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 45 Q 40 15, 80 40 T 160 25 T 240 35 T 300 20 L 300 65 L 0 65 Z"
                fill="url(#mintGradLive)"
              />
              <path
                d="M 0 45 Q 40 15, 80 40 T 160 25 T 240 35 T 300 20"
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
              />
            </svg>
          </div>

          {/* Dynamic Play / Pause in Card */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={() => handleControl(isRunning ? "PAUSE" : "START")}
              disabled={actionLoading}
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor: isRunning ? '#d97706' : '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: isRunning ? '0 2px 8px rgba(217,119,6,0.25)' : '0 2px 8px rgba(5,150,105,0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {isRunning ? <><Pause size={13} fill="#ffffff" /> Pause Bot</> : <><Play size={13} fill="#ffffff" /> Start Bot</>}
            </button>
            <button
              onClick={() => handleControl("SQUARE_OFF")}
              disabled={!isInPosition || actionLoading}
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor: '#ffffff',
                color: isInPosition ? '#dc2626' : '#9ca3af',
                border: isInPosition ? '1px solid #dc2626' : '1px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: isInPosition ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              <AlertTriangle size={13} /> Square Off
            </button>
          </div>
        </div>
      </div>

      {/* ── View Mode Selector Bar (Dual / Terminal / Trades) ───────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        padding: '12px 20px',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#111827' }}>
            Execution Workstation
          </span>
          <span style={{
            fontSize: '0.72rem',
            color: '#059669',
            backgroundColor: '#e6f4ea',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: '600'
          }}>
            Live Telemetry & Historical Fills
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setActiveBottomView("DUAL")}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeBottomView === "DUAL" ? '#059669' : '#f3f4f6',
              color: activeBottomView === "DUAL" ? '#ffffff' : '#6b7280',
              transition: 'all 0.2s ease'
            }}
          >
            Split View (Both)
          </button>
          <button
            onClick={() => setActiveBottomView("LOGS")}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeBottomView === "LOGS" ? '#059669' : '#f3f4f6',
              color: activeBottomView === "LOGS" ? '#ffffff' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Terminal size={13} />
            <span>Terminal Logs ({allLogs.length})</span>
          </button>
          <button
            onClick={() => setActiveBottomView("TRADES")}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeBottomView === "TRADES" ? '#059669' : '#f3f4f6',
              color: activeBottomView === "TRADES" ? '#ffffff' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileText size={13} />
            <span>Previous Trades ({allFills.length})</span>
          </button>
        </div>
      </div>

      {/* ── Quixotic Row 2: Live Terminal Logs Console + Previous Trades Ledger ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: activeBottomView === "DUAL" ? '1fr 1fr' : '1fr',
        gap: '20px'
      }}>

        {/* ── LEFT: Live Terminal Logs Console ────────────────────────── */}
        {(activeBottomView === "DUAL" || activeBottomView === "LOGS") && (
          <div style={{
            backgroundColor: '#090d16',
            borderRadius: '20px',
            border: '1px solid #1e293b',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: '440px'
          }}>
            {/* Terminal Window Chrome / Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#0c121e'
            }}>
              {/* Traffic Lights & Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
                </div>
                <span style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  color: '#94a3b8',
                  letterSpacing: '0.04em'
                }}>
                  ALGO EXECUTION TERMINAL — LIVE LOGS
                </span>
              </div>

              {/* Terminal Controls: Filter & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  style={{
                    backgroundColor: '#161f30',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">ALL LEVELS</option>
                  <option value="INFO">INFO</option>
                  <option value="SIGNAL">SIGNAL</option>
                  <option value="ORDER">ORDER</option>
                  <option value="RISK">RISK</option>
                  <option value="CONTROL">CONTROL</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>

                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  style={{
                    backgroundColor: autoScroll ? 'rgba(5, 150, 105, 0.2)' : '#161f30',
                    color: autoScroll ? '#34d399' : '#64748b',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  title="Auto scroll to bottom on new logs"
                >
                  {autoScroll ? 'AUTO-SCROLL: ON' : 'AUTO-SCROLL: OFF'}
                </button>

                <button
                  onClick={handleDownloadLogs}
                  style={{
                    backgroundColor: '#161f30',
                    color: '#94a3b8',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    padding: '3px 6px',
                    cursor: 'pointer'
                  }}
                  title="Download Raw Terminal Log"
                >
                  <Download size={13} />
                </button>

                <button
                  onClick={handleClearLogs}
                  style={{
                    backgroundColor: '#161f30',
                    color: '#f87171',
                    border: '1px solid #2d3748',
                    borderRadius: '6px',
                    padding: '3px 6px',
                    cursor: 'pointer'
                  }}
                  title="Clear Console Buffer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div style={{
              flex: 1,
              padding: '16px 18px',
              overflowY: 'auto',
              maxHeight: '440px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: '0.78rem',
              lineHeight: '1.6',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {filteredLogs.length === 0 ? (
                <div style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>
                  No logs matching filter <code>"{logFilter}"</code>. Start the bot to stream live telemetry.
                </div>
              ) : (
                filteredLogs.map((log, idx) => {
                  const style = getLogLevelStyle(log.level);
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ color: '#64748b', userSelect: 'none', minWidth: '65px' }}>
                        [{log.timestamp}]
                      </span>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        backgroundColor: style.bg,
                        color: style.color,
                        border: style.border,
                        minWidth: '55px',
                        textAlign: 'center'
                      }}>
                        {log.level}
                      </span>
                      {log.symbol && log.symbol !== "SYSTEM" && (
                        <span style={{ color: '#38bdf8', fontWeight: '600' }}>
                          [{log.symbol}]
                        </span>
                      )}
                      <span style={{ color: '#e2e8f0', wordBreak: 'break-word', flex: 1 }}>
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
              {/* Blinking green cursor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#10b981' }}>
                <span>&gt;</span>
                <span className="terminal-cursor" style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '14px',
                  backgroundColor: '#10b981',
                  animation: 'pulse 1s infinite'
                }} />
              </div>
              <div ref={logsEndRef} />
            </div>

            {/* Terminal Status Footer */}
            <div style={{
              padding: '6px 18px',
              backgroundColor: '#0c121e',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              color: '#64748b',
              fontFamily: 'monospace'
            }}>
              <span>STATUS: {isRunning ? 'TELEMETRY STREAM ACTIVE' : 'ENGINE IDLE'}</span>
              <span>FEED LATENCY: 12ms • TIMEZONE: ASIA/KOLKATA</span>
            </div>
          </div>
        )}

        {/* ── RIGHT: Previous Trades History Ledger ────────────────────── */}
        {(activeBottomView === "DUAL" || activeBottomView === "TRADES") && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
            minHeight: '440px'
          }}>
            <div>
              {/* Table Header & Scope Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#111827' }}>
                    Trade History & Executions
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Verified paper fills logged to <code>data/trade_history.csv</code>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Scope filter: Current Symbol vs All Symbols */}
                  <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '3px', borderRadius: '10px' }}>
                    <button
                      onClick={() => setTradeScope("ALL")}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        backgroundColor: tradeScope === "ALL" ? '#059669' : 'transparent',
                        color: tradeScope === "ALL" ? '#ffffff' : '#6b7280',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      All ({allFills.length})
                    </button>
                    <button
                      onClick={() => setTradeScope("SYMBOL")}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        backgroundColor: tradeScope === "SYMBOL" ? '#059669' : 'transparent',
                        color: tradeScope === "SYMBOL" ? '#ffffff' : '#6b7280',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {symbol} ({symbolFills.length})
                    </button>
                  </div>

                  <button
                    onClick={handleExportTradesCSV}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                    title="Export Trades to CSV"
                  >
                    <Download size={13} />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Real Trades Table */}
              <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#ffffff', zIndex: 1 }}>
                    <tr style={{ color: '#9ca3af', borderBottom: '1px solid #f3f4f6', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '8px 10px' }}>Order / ID</th>
                      <th style={{ padding: '8px 10px' }}>Symbol</th>
                      <th style={{ padding: '8px 10px' }}>Action</th>
                      <th style={{ padding: '8px 10px' }}>Shares</th>
                      <th style={{ padding: '8px 10px' }}>Price</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Cash Impact</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFills.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '32px 12px', textAlign: 'center', color: '#9ca3af' }}>
                          No paper fills found for {tradeScope === "SYMBOL" ? symbol : "any symbol"}. Run or start the bot to execute simulated orders.
                        </td>
                      </tr>
                    ) : (
                      activeFills.slice().reverse().map((trade, idx) => {
                        const isBuy = trade.Action?.includes("BUY");
                        const isShort = trade.Action?.includes("SHORT");
                        const isCover = trade.Action?.includes("COVER");
                        const isSquareOff = trade.Action?.includes("SQUARE_OFF");

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f9fafb', transition: 'background-color 0.15s ease' }}>
                            <td style={{ padding: '12px 10px' }}>
                              <div style={{ fontWeight: '700', color: '#111827' }}>
                                {trade.id || `TRD-${1000 + idx}`}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                {trade.Date || trade.Timestamp?.slice(0, 10)} {trade.Time ? `• ${trade.Time}` : ''}
                              </div>
                            </td>

                            <td style={{ padding: '12px 10px', fontWeight: '700', color: '#111827' }}>
                              {trade.Symbol}
                            </td>

                            <td style={{ padding: '12px 10px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                backgroundColor: isBuy
                                  ? '#e6f4ea'
                                  : (isShort ? '#fef2f2' : (isCover ? '#eff6ff' : '#fef3c7')),
                                color: isBuy
                                  ? '#059669'
                                  : (isShort ? '#dc2626' : (isCover ? '#2563eb' : '#d97706'))
                              }}>
                                {trade.Action}
                              </span>
                            </td>

                            <td style={{ padding: '12px 10px', color: '#374151', fontWeight: '600' }}>
                              {trade.Shares} shs
                            </td>

                            <td style={{ padding: '12px 10px', fontWeight: '700', color: '#111827' }}>
                              {currency}{Number(trade.Execution_Price || 0).toFixed(2)}
                            </td>

                            <td style={{
                              padding: '12px 10px',
                              textAlign: 'right',
                              fontWeight: '800',
                              color: String(trade.Amount || trade.Cash_Change).startsWith('+') ? '#059669' : '#dc2626'
                            }}>
                              {trade.Amount || trade.Cash_Change}
                            </td>

                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                color: '#059669'
                              }}>
                                <CheckCircle2 size={13} color="#059669" />
                                {trade.Status || "FILLED"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Summary Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid #f3f4f6',
              paddingTop: '14px',
              fontSize: '0.78rem',
              color: '#6b7280'
            }}>
              <div>
                Total Logged Executions: <b style={{ color: '#111827' }}>{allFills.length}</b>
              </div>
              <span
                onClick={onNavigateToBacktest}
                style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '700', cursor: 'pointer' }}
              >
                Open Strategy Backtester ↗
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

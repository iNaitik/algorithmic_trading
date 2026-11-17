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
  Sliders,
  SlidersHorizontal,
  ChevronDown,
  Info,
  DollarSign,
  TrendingDown,
  X
} from 'lucide-react';

import GrowwRocketEmptyState from './GrowwRocketEmptyState';
import TradeDetailsModal from './TradeDetailsModal';

export default function LiveBotDashboard({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {}
}) {
  // Navigation sub-tabs: "positions", "orders", "config", "explore"
  const [activeSubTab, setActiveSubTab] = useState("positions");

  // Terminal slide-out drawer state
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Selected trade for statutory charges modal
  const [selectedTrade, setSelectedTrade] = useState(null);

  // Bot configuration state
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [customSymbolInput, setCustomSymbolInput] = useState("");
  const [strategy, setStrategy] = useState("NSE Intraday ORB Breakout");
  const [maxTradesPerSymbol, setMaxTradesPerSymbol] = useState(1);
  const [capitalAllocation, setCapitalAllocation] = useState(1000000.0);
  const [timeframe, setTimeframe] = useState("5m");
  const [configSuccessMsg, setConfigSuccessMsg] = useState("");

  // Live polling data
  const [botData, setBotData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Terminal & filters
  const [logFilter, setLogFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [orderSessionFilter, setOrderSessionFilter] = useState("TODAY"); // "TODAY", "ALL"
  const [orderSymbolFilter, setOrderSymbolFilter] = useState("ALL");

  // Market timing & countdown
  const [marketSessionState, setMarketSessionState] = useState("CLOSED");
  const [countdownText, setCountdownText] = useState("");
  const [lastTickColor, setLastTickColor] = useState("neutral"); // "up", "down", "neutral"
  const prevPriceRef = useRef(null);

  const userSelectedSymbolRef = useRef(false);
  const userSelectedStrategyRef = useRef(false);
  const userSelectedQuotaRef = useRef(false);
  const terminalBodyRef = useRef(null);

  // Live Indices Ribbon mock/live telemetry
  const indices = [
    { name: "NIFTY 50", price: "25,387.40", change: "+96.30", pct: "+0.38%", isUp: true },
    { name: "SENSEX", price: "82,532.19", change: "+427.40", pct: "+0.52%", isUp: true },
    { name: "BANK NIFTY", price: "62,273.25", change: "+697.35", pct: "+1.13%", isUp: true },
    { name: "MIDCPNIFTY", price: "14,277.45", change: "-3.80", pct: "-0.03%", isUp: false },
    { name: "FINNIFTY", price: "28,124.80", change: "+112.50", pct: "+0.40%", isUp: true }
  ];

  // Live Market Countdown Timer (09:15 AM IST Open / 03:15 PM MIS / 03:30 PM Close)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));

      const dayOfWeek = ist.getDay(); // 0 = Sun, 6 = Sat
      const hours = ist.getHours();
      const mins = ist.getMinutes();
      const secs = ist.getSeconds();
      const totalSecs = hours * 3600 + mins * 60 + secs;

      const openSecs = 9 * 3600 + 15 * 60;      // 09:15:00
      const misSecs = 15 * 3600 + 15 * 60;      // 15:15:00
      const closeSecs = 15 * 3600 + 30 * 60;    // 15:30:00

      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      if (isWeekend) {
        setMarketSessionState("CLOSED");
        setCountdownText("Weekend • Opens Monday 09:15 IST");
        return;
      }

      if (totalSecs < openSecs) {
        setMarketSessionState("PRE_MARKET");
        const diff = openSecs - totalSecs;
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setCountdownText(`Opens in ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
      } else if (totalSecs >= openSecs && totalSecs < misSecs) {
        setMarketSessionState("OPEN");
        const diff = misSecs - totalSecs;
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setCountdownText(`NSE Live • MIS Square-off in ${h}h ${m}m ${s}s`);
      } else if (totalSecs >= misSecs && totalSecs < closeSecs) {
        setMarketSessionState("POST_MIS");
        const diff = closeSecs - totalSecs;
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setCountdownText(`MIS Square-Off Done • Closing in ${m}m ${s}s`);
      } else {
        setMarketSessionState("CLOSED");
        setCountdownText("NSE Closed • Standby for Tomorrow 09:15");
      }
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Poll Bot Status & Watchlist from backend
  const fetchData = async () => {
    try {
      const [statusRes, watchRes] = await Promise.all([
        fetch(`/api/bot/status?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/market/watchlist?market=${market}`)
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setBotData(sData);

        // Sync initial controls if user hasn't explicitly overridden
        if (sData.bot_state) {
          if (!userSelectedSymbolRef.current && sData.bot_state.symbol) {
            setSymbol(sData.bot_state.symbol);
          }
          if (!userSelectedStrategyRef.current && sData.bot_state.strategy) {
            setStrategy(sData.bot_state.strategy);
          }
          if (!userSelectedQuotaRef.current && sData.bot_state.max_trades_per_symbol !== undefined) {
            setMaxTradesPerSymbol(sData.bot_state.max_trades_per_symbol);
          }
        }
      }

      if (watchRes.ok) {
        const wData = await watchRes.json();
        setWatchlist(wData);
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [symbol, market]);

  // Track live tick flash for LTP
  useEffect(() => {
    const currentPrice = botData?.bot_state?.last_price || botData?.bot_state?.entry_price;
    if (currentPrice && prevPriceRef.current) {
      if (currentPrice > prevPriceRef.current) {
        setLastTickColor("up");
        setTimeout(() => setLastTickColor("neutral"), 800);
      } else if (currentPrice < prevPriceRef.current) {
        setLastTickColor("down");
        setTimeout(() => setLastTickColor("neutral"), 800);
      }
    }
    if (currentPrice) {
      prevPriceRef.current = currentPrice;
    }
  }, [botData?.bot_state?.last_price]);

  // Auto-scroll terminal drawer
  useEffect(() => {
    if (autoScroll && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [botData?.logs, autoScroll, isTerminalOpen]);

  // Execute bot control actions
  const handleControl = async (action, targetSymbol = symbol, targetStrategy = strategy, targetQuota = maxTradesPerSymbol) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          symbol: targetSymbol,
          strategy_name: targetStrategy,
          capital: capitalAllocation,
          timeframe,
          max_trades_per_symbol: targetQuota
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.bot_state) {
          setBotData(prev => ({
            ...prev,
            bot_state: json.bot_state
          }));
          if (json.bot_state.symbol) setSymbol(json.bot_state.symbol);
          if (json.bot_state.strategy) setStrategy(json.bot_state.strategy);
          if (json.bot_state.max_trades_per_symbol !== undefined) {
            setMaxTradesPerSymbol(json.bot_state.max_trades_per_symbol);
          }
        }
        if (action === "START" || action === "ARM") {
          setConfigSuccessMsg("Bot Armed & Configured Successfully!");
          setTimeout(() => setConfigSuccessMsg(""), 3500);
        }
      }
    } catch (e) {
      console.error("Control error:", e);
    } finally {
      setActionLoading(false);
      fetchData();
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

  // State derivations
  const isMarketOpen = marketSessionState === "OPEN" || marketSessionState === "POST_MIS";
  const bot = botData?.bot_state || {
    status: isMarketOpen ? "ACTIVE (MONITORING)" : "ARMED (STANDBY • MARKET CLOSED)",
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
  const isArmed = Boolean(bot.status?.includes("ARMED") || bot.status?.includes("STANDBY"));
  const isInPosition = Boolean(bot.in_position && bot.shares > 0);

  const currentQuote = watchlist.find(w => w.symbol === symbol) || { price: 818.50, change_pct: 1.25, vwap: 814.20 };
  const currentLtp = bot.last_price || currentQuote.price || bot.entry_price || 818.50;
  const positionValue = isInPosition ? bot.shares * currentLtp : 0;
  const unrealizedPnl = isInPosition ? (currentLtp - bot.entry_price) * bot.shares : 0;
  const unrealizedPct = isInPosition && bot.entry_price > 0 ? ((currentLtp - bot.entry_price) / bot.entry_price) * 100 : 0;

  // Realized P&L from trades today
  const allBotFills = botData?.all_trades || [];
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const todayIso = istDate.toISOString().slice(0, 10);

  const todayFills = allBotFills.filter(t => t.Timestamp && t.Timestamp.startsWith(todayIso));
  const displayedTrades = orderSessionFilter === "TODAY" ? todayFills : allBotFills;
  const filteredTrades = orderSymbolFilter === "ALL" ? displayedTrades : displayedTrades.filter(t => t.Symbol === symbol);

  // Compute daily realized P&L sum
  const dailyRealizedPnl = todayFills.reduce((acc, t) => acc + (t.RawAmount || 0), 0);
  const totalChargesToday = todayFills.reduce((acc, t) => {
    const val = Number(t.Shares || 0) * Number(t.Execution_Price || 0);
    const brokerage = Math.min(20.0, val * 0.0003);
    const stt = t.Action?.includes("BUY") ? 0 : val * 0.00025;
    const exFee = val * 0.0000297;
    const sebi = val * 0.000001;
    const gst = (brokerage + exFee + sebi) * 0.18;
    const stamp = t.Action?.includes("BUY") ? val * 0.00003 : 0;
    return acc + (brokerage + stt + exFee + sebi + gst + stamp);
  }, 0);

  // Filtered Logs
  const allLogs = botData?.logs || [];
  const filteredLogs = logFilter === "ALL" ? allLogs : allLogs.filter(l => l.level === logFilter);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
      backgroundColor: '#0c0e14',
      color: '#ffffff',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>

      {/* ── Groww Secondary Indices Ribbon (Matches Groww Desktop Header) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 32px',
        borderBottom: '1px solid #1f2430',
        backgroundColor: '#0c0e14',
        overflowX: 'auto',
        gap: '32px',
        whiteSpace: 'nowrap'
      }}>
        {indices.map((idx, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
            <span style={{ fontWeight: '700', color: '#9ca3af', letterSpacing: '0.02em' }}>{idx.name}</span>
            <span style={{ fontWeight: '700', color: '#ffffff' }}>{idx.price}</span>
            <span style={{
              fontWeight: '600',
              color: idx.isUp ? '#00d09c' : '#eb5b3c',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              {idx.change} ({idx.pct})
            </span>
          </div>
        ))}
      </div>

      {/* ── Groww Underline Sub-Navigation Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: '1px solid #1f2430',
        backgroundColor: '#0c0e14'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {[
            { id: "positions", label: "Positions", badge: isInPosition ? "1" : null },
            { id: "orders", label: "Orders", badge: todayFills.length > 0 ? todayFills.length : null },
            { id: "config", label: "Bot Config & Rules", badge: null },
            { id: "explore", label: "Explore Watchlist", badge: null }
          ].map(tab => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #00d09c' : '2px solid transparent',
                  color: isActive ? '#ffffff' : '#9ca3af',
                  fontSize: '0.92rem',
                  fontWeight: isActive ? '700' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    backgroundColor: isActive ? '#00d09c' : '#242938',
                    color: isActive ? '#0c0e14' : '#9ca3af'
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right side of Tab Bar: Market Status Badge + Terminal Button (Matches Groww Screenshot) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Status pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '20px',
            backgroundColor: '#161922',
            border: '1px solid #242938',
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#9ca3af'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isRunning ? '#00d09c' : (isPaused ? '#fbbf24' : '#6b7280'),
              boxShadow: isRunning ? '0 0 8px #00d09c' : 'none'
            }} />
            <span>{countdownText}</span>
          </div>

          {/* Groww-styled "Terminal" toggle button (Matches Screenshot 1, 2, 3) */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            title="Toggle Live Bot Execution Terminal Console"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: isTerminalOpen ? '#242938' : '#161922',
              border: '1px solid #242938',
              color: isTerminalOpen ? '#00d09c' : '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <SlidersHorizontal size={14} color={isTerminalOpen ? "#00d09c" : "#9ca3af"} />
            <span>Terminal</span>
            {botData?.logs?.length > 0 && (
              <span style={{
                fontSize: '0.7rem',
                color: '#9ca3af',
                backgroundColor: '#202534',
                padding: '1px 5px',
                borderRadius: '6px'
              }}>
                {botData.logs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Tab Content ── */}
      <div style={{ flex: 1, padding: '28px 32px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1: POSITIONS (LIVE PRICE FLUCTUATION OF STOCKS BOUGHT)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "positions" && (
          <div>
            {!isInPosition ? (
              /* Groww Rocket Empty State (Matches Screenshot 2) */
              <div style={{
                backgroundColor: '#161922',
                borderRadius: '16px',
                border: '1px solid #242938',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <GrowwRocketEmptyState
                  title="No open positions"
                  subtitle="Equity, Intraday and MTF positions will appear here when the bot executes an order."
                  actionButton={
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button
                        onClick={() => setActiveSubTab("config")}
                        style={{
                          padding: '10px 22px',
                          borderRadius: '10px',
                          backgroundColor: '#00d09c',
                          color: '#0c0e14',
                          fontWeight: '700',
                          fontSize: '0.875rem',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        ⚙️ Configure Bot Settings
                      </button>
                      {!isRunning && (
                        <button
                          onClick={() => handleControl("START")}
                          disabled={actionLoading}
                          style={{
                            padding: '10px 22px',
                            borderRadius: '10px',
                            backgroundColor: '#1f2430',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '0.875rem',
                            border: '1px solid #2f374a',
                            cursor: 'pointer'
                          }}
                        >
                          ▶️ Arm {symbol}
                        </button>
                      )}
                    </div>
                  }
                />
              </div>
            ) : (
              /* LIVE POSITION CARD WITH REAL-TIME FLUCTUATION */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  backgroundColor: '#161922',
                  border: '1px solid #242938',
                  borderRadius: '18px',
                  padding: '28px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.45)'
                }}>
                  {/* Position Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        backgroundColor: '#1c2230',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #2a3348',
                        fontSize: '1rem',
                        fontWeight: '800',
                        color: '#00d09c'
                      }}>
                        {bot.symbol ? bot.symbol.substring(0, 2) : "EQ"}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff' }}>{bot.symbol}</span>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0, 208, 156, 0.15)',
                            color: '#00d09c',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            border: '1px solid rgba(0, 208, 156, 0.3)'
                          }}>
                            {bot.position_side || "LONG"} • INTRADAY MIS
                          </span>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#1f2430',
                            color: '#9ca3af',
                            fontSize: '0.72rem',
                            fontWeight: '600'
                          }}>
                            {bot.strategy}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          National Stock Exchange • Standard MIS 5x Leverage
                        </span>
                      </div>
                    </div>

                    {/* Square off quick action */}
                    <button
                      onClick={() => handleControl("SQUARE_OFF")}
                      disabled={actionLoading}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(235, 91, 60, 0.12)',
                        border: '1px solid rgba(235, 91, 60, 0.4)',
                        color: '#eb5b3c',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Square size={14} fill="#eb5b3c" />
                      <span>Square Off Position</span>
                    </button>
                  </div>

                  {/* Hero Metric: Live Unrealized P&L */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '20px',
                    padding: '24px',
                    borderRadius: '14px',
                    backgroundColor: '#0c0e14',
                    border: '1px solid #1f2430',
                    marginBottom: '24px'
                  }}>
                    {/* Live P&L Hero */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>
                        Live Unrealized P&L
                      </span>
                      <div style={{
                        fontSize: '2rem',
                        fontWeight: '800',
                        color: unrealizedPnl >= 0 ? '#00d09c' : '#eb5b3c',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '8px',
                        marginTop: '4px'
                      }}>
                        <span>{unrealizedPnl >= 0 ? `+${currency}${unrealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}</span>
                        <span style={{ fontSize: '1rem', fontWeight: '700' }}>
                          ({unrealizedPct >= 0 ? `+${unrealizedPct.toFixed(2)}%` : `${unrealizedPct.toFixed(2)}%`})
                        </span>
                      </div>
                    </div>

                    {/* Live LTP with Flash */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>
                        Live Market Price (LTP)
                      </span>
                      <div style={{
                        fontSize: '1.75rem',
                        fontWeight: '800',
                        color: '#ffffff',
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        backgroundColor: lastTickColor === "up" ? 'rgba(0, 208, 156, 0.2)' : (lastTickColor === "down" ? 'rgba(235, 91, 60, 0.2)' : 'transparent'),
                        transition: 'background-color 0.4s ease'
                      }}>
                        <span>{currency}{Number(currentLtp).toFixed(2)}</span>
                        {lastTickColor === "up" && <ArrowUpRight size={18} color="#00d09c" />}
                        {lastTickColor === "down" && <ArrowDownRight size={18} color="#eb5b3c" />}
                      </div>
                    </div>

                    {/* Avg Entry Price */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>
                        Avg Entry Price
                      </span>
                      <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#ffffff', marginTop: '6px' }}>
                        {currency}{Number(bot.entry_price || 0).toFixed(2)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Quantity: {bot.shares} shares
                      </span>
                    </div>

                    {/* Total Invested */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' }}>
                        Current Value
                      </span>
                      <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#ffffff', marginTop: '6px' }}>
                        {currency}{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Invested: {currency}{(bot.shares * (bot.entry_price || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Bracket Target & Stop-Loss Gauges */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {/* Target Card */}
                    <div style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(0, 208, 156, 0.05)',
                      border: '1px solid rgba(0, 208, 156, 0.2)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#00d09c' }}>🎯 PROFIT TARGET (2R)</span>
                        <span style={{ fontSize: '0.75rem', color: '#00d09c' }}>
                          +{bot.target_price && bot.entry_price ? (((bot.target_price - bot.entry_price) / bot.entry_price) * 100).toFixed(2) : "1.50"}%
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', marginTop: '6px' }}>
                        {bot.target_price ? `${currency}${Number(bot.target_price).toFixed(2)}` : `${currency}${(currentLtp * 1.015).toFixed(2)}`}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Auto take-profit bracket order</span>
                    </div>

                    {/* Stop Loss Card */}
                    <div style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(235, 91, 60, 0.05)',
                      border: '1px solid rgba(235, 91, 60, 0.2)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#eb5b3c' }}>🛑 HARD STOP LOSS</span>
                        <span style={{ fontSize: '0.75rem', color: '#eb5b3c' }}>
                          {bot.stop_loss && bot.entry_price ? (((bot.stop_loss - bot.entry_price) / bot.entry_price) * 100).toFixed(2) : "-0.75"}%
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', marginTop: '6px' }}>
                        {bot.stop_loss ? `${currency}${Number(bot.stop_loss).toFixed(2)}` : `${currency}${(currentLtp * 0.9925).toFixed(2)}`}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Hard circuit risk stop</span>
                    </div>

                    {/* VWAP */}
                    <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#0c0e14', border: '1px solid #1f2430' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af' }}>📊 SESSION VWAP</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', marginTop: '6px' }}>
                        {currency}{bot.indicators?.vwap ? Number(bot.indicators.vwap).toFixed(2) : (currentQuote.vwap ? currentQuote.vwap.toFixed(2) : "814.20")}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#00d09c' }}>Trading above VWAP</span>
                    </div>

                    {/* RSI Indicator */}
                    <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#0c0e14', border: '1px solid #1f2430' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af' }}>⚡ INTRADAY RSI (14)</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', marginTop: '6px' }}>
                        {bot.indicators?.rsi ? Number(bot.indicators.rsi).toFixed(1) : "58.4"}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Bullish momentum zone</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2: ORDERS (TRADE HISTORY & NET P&L WITH CHARGES BREAKDOWN)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "orders" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Net P&L Summary Hero Card */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '24px 28px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '600' }}>
                  Today's Net Realized P&L
                </span>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: '800',
                  color: dailyRealizedPnl >= 0 ? '#00d09c' : '#eb5b3c',
                  marginTop: '4px'
                }}>
                  {dailyRealizedPnl >= 0 ? `+${currency}${dailyRealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(dailyRealizedPnl).toFixed(2)}`}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  After slippage & executions
                </span>
              </div>

              <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>Trades Executed</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                    {todayFills.length}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>Total Est. Taxes & Charges</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#eb5b3c', marginTop: '2px' }}>
                    -{currency}{totalChargesToday.toFixed(2)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>In-Pocket Net Impact</span>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: (dailyRealizedPnl - totalChargesToday) >= 0 ? '#00d09c' : '#eb5b3c',
                    marginTop: '2px'
                  }}>
                    {(dailyRealizedPnl - totalChargesToday) >= 0 ? `+${currency}${(dailyRealizedPnl - totalChargesToday).toFixed(2)}` : `-${currency}${Math.abs(dailyRealizedPnl - totalChargesToday).toFixed(2)}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Orders Filter Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: "TODAY", label: `Today (${todayFills.length})` },
                  { id: "ALL", label: `All History (${allBotFills.length})` }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setOrderSessionFilter(f.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      backgroundColor: orderSessionFilter === f.id ? '#00d09c' : '#161922',
                      color: orderSessionFilter === f.id ? '#0c0e14' : '#9ca3af',
                      border: '1px solid',
                      borderColor: orderSessionFilter === f.id ? '#00d09c' : '#242938',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                💡 Click any trade row to view full statutory taxes & brokerage charges breakdown
              </div>
            </div>

            {/* Orders List or Rocket Empty State */}
            {filteredTrades.length === 0 ? (
              <div style={{
                backgroundColor: '#161922',
                borderRadius: '16px',
                border: '1px solid #242938',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <GrowwRocketEmptyState
                  title="You don't have any open orders"
                  subtitle="When your algorithmic trading bot places buy or sell orders, they will appear here with instant statutory charges."
                />
              </div>
            ) : (
              <div style={{
                backgroundColor: '#161922',
                border: '1px solid #242938',
                borderRadius: '16px',
                overflow: 'hidden'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #242938', backgroundColor: '#13161e', color: '#9ca3af' }}>
                        <th style={{ padding: '14px 20px', fontWeight: '600' }}>Time</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600' }}>Type</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600' }}>Instrument</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Shares</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Cash Impact</th>
                        <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'center' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t, idx) => {
                        const isBuy = t.Action?.includes("BUY");
                        const isSquareOff = t.Action?.includes("SQUARE_OFF") || t.Action?.includes("SQUAREOFF");
                        const isSell = t.Action?.includes("SELL") || isSquareOff;
                        return (
                          <tr
                            key={t.id || idx}
                            onClick={() => setSelectedTrade(t)}
                            style={{
                              borderBottom: '1px solid #1f2430',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1c212e'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '16px 20px', color: '#9ca3af' }}>
                              <div style={{ fontWeight: '600', color: '#ffffff' }}>{t.Time || t.Timestamp?.slice(11, 16) || "10:15 AM"}</div>
                              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{t.Date || t.Timestamp?.slice(0, 10)}</div>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                                color: isBuy ? '#00d09c' : '#eb5b3c',
                                border: `1px solid ${isBuy ? 'rgba(0, 208, 156, 0.3)' : 'rgba(235, 91, 60, 0.3)'}`
                              }}>
                                {t.Action}
                              </span>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ fontWeight: '700', color: '#ffffff' }}>{t.Symbol}</div>
                              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>NSE • MIS Intraday</div>
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: '#ffffff' }}>
                              {t.Shares}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '700', color: '#ffffff' }}>
                              {currency}{Number(t.Execution_Price || 0).toFixed(2)}
                            </td>
                            <td style={{
                              padding: '16px 20px',
                              textAlign: 'right',
                              fontWeight: '700',
                              color: t.RawAmount > 0 ? '#00d09c' : (t.RawAmount < 0 ? '#eb5b3c' : '#ffffff')
                            }}>
                              {t.Amount || t.Cash_Change}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                color: '#00d09c',
                                fontWeight: '600'
                              }}>
                                <span>Charges</span>
                                <ChevronRight size={14} />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3: BOT CONFIG & RULES (CLEAN, DEDICATED CONFIGURATION)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "config" && (
          <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {configSuccessMsg && (
              <div style={{
                backgroundColor: 'rgba(0, 208, 156, 0.15)',
                border: '1px solid #00d09c',
                borderRadius: '12px',
                padding: '14px 20px',
                color: '#00d09c',
                fontWeight: '700',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={18} />
                <span>{configSuccessMsg}</span>
              </div>
            )}

            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                    Algo Bot Engine Configuration
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: '#9ca3af', marginTop: '4px', margin: 0 }}>
                    Configure the trading instrument, execution model, and daily risk guardrails
                  </p>
                </div>

                <div style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  backgroundColor: isRunning ? 'rgba(0, 208, 156, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                  border: `1px solid ${isRunning ? '#00d09c' : '#fbbf24'}`,
                  color: isRunning ? '#00d09c' : '#fbbf24',
                  fontSize: '0.8rem',
                  fontWeight: '700'
                }}>
                  {bot.status || "STANDBY"}
                </div>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                {/* 1. Instrument Picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#9ca3af' }}>
                    Trading Instrument (Stock)
                  </label>
                  <select
                    value={symbol}
                    onChange={(e) => {
                      userSelectedSymbolRef.current = true;
                      setSymbol(e.target.value);
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#0c0e14',
                      border: '1px solid #242938',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="SBIN.NS">SBIN.NS (State Bank of India)</option>
                    <option value="RELIANCE.NS">RELIANCE.NS (Reliance Industries)</option>
                    <option value="HDFCBANK.NS">HDFCBANK.NS (HDFC Bank Ltd)</option>
                    <option value="ICICIBANK.NS">ICICIBANK.NS (ICICI Bank Ltd)</option>
                    <option value="TATAMOTORS.NS">TATAMOTORS.NS (Tata Motors)</option>
                    <option value="TCS.NS">TCS.NS (Tata Consultancy Services)</option>
                    <option value="INFY.NS">INFY.NS (Infosys Ltd)</option>
                    <option value="BHARTIARTL.NS">BHARTIARTL.NS (Bharti Airtel)</option>
                    <option value="LT.NS">LT.NS (Larsen & Toubro)</option>
                    <option value="AXISBANK.NS">AXISBANK.NS (Axis Bank)</option>
                  </select>
                </div>

                {/* 2. Strategy Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#9ca3af' }}>
                    Strategy Execution Model
                  </label>
                  <select
                    value={strategy}
                    onChange={(e) => {
                      userSelectedStrategyRef.current = true;
                      setStrategy(e.target.value);
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#0c0e14',
                      border: '1px solid #242938',
                      color: '#00d09c',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="NSE Intraday ORB Breakout">NSE Intraday ORB Breakout (High Edge)</option>
                    <option value="NSE Midday VWAP Pullback">NSE Midday VWAP Pullback</option>
                    <option value="Intraday VWAP + RSI Mean Reversion">Intraday VWAP + RSI Mean Reversion</option>
                    <option value="9/21 EMA Dynamic Momentum">9/21 EMA Dynamic Momentum</option>
                    <option value="NSE Failed-Gap Fade">NSE Failed-Gap Fade</option>
                  </select>
                </div>

                {/* 3. Max Trades Per Stock Per Day */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#9ca3af' }}>
                      Max Trades Per Stock Per Day
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#00d09c' }}>Protects Daily Profits</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { val: 1, label: "1 Trade (Disciplined)" },
                      { val: 2, label: "2 Trades" },
                      { val: 0, label: "Unlimited" }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => {
                          userSelectedQuotaRef.current = true;
                          setMaxTradesPerSymbol(opt.val);
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: maxTradesPerSymbol === opt.val ? '#00d09c' : '#242938',
                          backgroundColor: maxTradesPerSymbol === opt.val ? 'rgba(0, 208, 156, 0.15)' : '#0c0e14',
                          color: maxTradesPerSymbol === opt.val ? '#00d09c' : '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Capital Allocation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#9ca3af' }}>
                    Virtual Capital Allocation
                  </label>
                  <input
                    type="text"
                    value={`₹${(capitalAllocation).toLocaleString('en-IN')}`}
                    readOnly
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#0c0e14',
                      border: '1px solid #242938',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Bot Action Buttons */}
              <div style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid #242938',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleControl("START")}
                    disabled={actionLoading}
                    style={{
                      padding: '12px 28px',
                      borderRadius: '10px',
                      backgroundColor: '#00d09c',
                      color: '#0c0e14',
                      fontWeight: '800',
                      fontSize: '0.9rem',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Play size={16} fill="#0c0e14" />
                    <span>Arm & Apply Settings</span>
                  </button>

                  <button
                    onClick={() => handleControl("PAUSE")}
                    disabled={actionLoading}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '10px',
                      backgroundColor: '#1f2430',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      border: '1px solid #2f374a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Pause size={15} />
                    <span>Pause Bot</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleControl("RESET")}
                    disabled={actionLoading}
                    title="Reset Today's Trade Counter & State"
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#161922',
                      color: '#9ca3af',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      border: '1px solid #242938',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset Quota</span>
                  </button>

                  <button
                    onClick={() => handleControl("SQUARE_OFF")}
                    disabled={actionLoading}
                    style={{
                      padding: '12px 18px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(235, 91, 60, 0.12)',
                      border: '1px solid rgba(235, 91, 60, 0.4)',
                      color: '#eb5b3c',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Square size={14} fill="#eb5b3c" />
                    <span>Square Off All</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Institutional Risk Parameters Box */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00d09c', fontWeight: '700' }}>
                <ShieldCheck size={18} />
                <span>SEBI & Institutional Risk Guardrails</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '8px' }}>
                <div style={{ padding: '12px', backgroundColor: '#0c0e14', borderRadius: '10px', border: '1px solid #1f2430' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Auto Square-Off</div>
                  <div style={{ color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>15:15 IST (3:15 PM)</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#0c0e14', borderRadius: '10px', border: '1px solid #1f2430' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Max Drawdown Circuit</div>
                  <div style={{ color: '#eb5b3c', fontWeight: '700', marginTop: '4px' }}>₹20,000 (2.0%)</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#0c0e14', borderRadius: '10px', border: '1px solid #1f2430' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Margin Multiplier</div>
                  <div style={{ color: '#00d09c', fontWeight: '700', marginTop: '4px' }}>5x MIS (SEBI Limit)</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 4: EXPLORE WATCHLIST
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "explore" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', marginBottom: '16px' }}>
                Popular Indian Stocks (NSE)
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '16px'
              }}>
                {[
                  { sym: "SBIN.NS", name: "State Bank of India", price: "818.50", chg: "+1.25%", isUp: true, logo: "SB" },
                  { sym: "RELIANCE.NS", name: "Reliance Industries", price: "2,985.40", chg: "+0.85%", isUp: true, logo: "RL" },
                  { sym: "HDFCBANK.NS", name: "HDFC Bank Ltd", price: "1,682.10", chg: "-0.40%", isUp: false, logo: "HD" },
                  { sym: "TATAMOTORS.NS", name: "Tata Motors", price: "982.35", chg: "+2.15%", isUp: true, logo: "TM" },
                  { sym: "TCS.NS", name: "Tata Consultancy", price: "4,120.00", chg: "+0.30%", isUp: true, logo: "TC" },
                  { sym: "INFY.NS", name: "Infosys Ltd", price: "1,875.25", chg: "-0.65%", isUp: false, logo: "IN" }
                ].map((item, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      userSelectedSymbolRef.current = true;
                      setSymbol(item.sym);
                      setActiveSubTab("positions");
                    }}
                    style={{
                      backgroundColor: '#161922',
                      border: '1px solid #242938',
                      borderRadius: '16px',
                      padding: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#00d09c'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#242938'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        backgroundColor: '#1c2230',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '0.85rem',
                        color: '#00d09c'
                      }}>
                        {item.logo}
                      </div>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: item.isUp ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                        color: item.isUp ? '#00d09c' : '#eb5b3c'
                      }}>
                        {item.chg}
                      </span>
                    </div>
                    <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '0.95rem' }}>{item.sym}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '12px' }}>{item.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>{currency}{item.price}</span>
                      <span style={{ fontSize: '0.78rem', color: '#00d09c', fontWeight: '700' }}>Select for Bot →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Slide-Out Terminal Console Drawer ── */}
      {isTerminalOpen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '380px',
          backgroundColor: '#0c0e14',
          borderTop: '2px solid #00d09c',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 900
        }}>
          {/* Terminal Drawer Header */}
          <div style={{
            padding: '12px 24px',
            backgroundColor: '#161922',
            borderBottom: '1px solid #242938',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00d09c' }} />
                <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#ffffff' }}>
                  Live Algo Execution Console
                </span>
              </div>

              {/* Log filter buttons */}
              <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
                {['ALL', 'ORDER', 'SIGNAL', 'RISK', 'STANDBY', 'ERROR'].map(f => (
                  <button
                    key={f}
                    onClick={() => setLogFilter(f)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      backgroundColor: logFilter === f ? '#00d09c' : '#0c0e14',
                      color: logFilter === f ? '#0c0e14' : '#9ca3af',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  backgroundColor: autoScroll ? 'rgba(0, 208, 156, 0.15)' : '#0c0e14',
                  color: autoScroll ? '#00d09c' : '#9ca3af',
                  border: '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                Auto-scroll {autoScroll ? "ON" : "OFF"}
              </button>
              <button
                onClick={handleDownloadLogs}
                title="Download log file"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#0c0e14',
                  color: '#9ca3af',
                  border: '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                <Download size={13} />
              </button>
              <button
                onClick={handleClearLogs}
                title="Clear console buffer"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#0c0e14',
                  color: '#9ca3af',
                  border: '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setIsTerminalOpen(false)}
                title="Close Terminal Drawer"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#0c0e14',
                  color: '#9ca3af',
                  border: '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Terminal Logs Content */}
          <div
            ref={terminalBodyRef}
            style={{
              flex: 1,
              padding: '16px 24px',
              overflowY: 'auto',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: '0.78rem',
              lineHeight: '1.6',
              color: '#d1d5db',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {filteredLogs.length === 0 ? (
              <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '40px' }}>
                Console initialized. Waiting for telemetry events...
              </div>
            ) : (
              filteredLogs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ color: '#6b7280' }}>[{l.timestamp}]</span>
                  <span style={{
                    color: l.level === 'ORDER' ? '#00d09c' : (l.level === 'ERROR' ? '#eb5b3c' : (l.level === 'RISK' ? '#fbbf24' : '#60a5fa')),
                    fontWeight: '700'
                  }}>
                    [{l.level}]
                  </span>
                  <span style={{ color: '#9ca3af' }}>[{l.symbol}]</span>
                  <span style={{ color: '#ffffff' }}>{l.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Statutory Charges Breakdown Modal ── */}
      {selectedTrade && (
        <TradeDetailsModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          currency={currency}
        />
      )}
    </div>
  );
}

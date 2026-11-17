import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
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
  SlidersHorizontal,
  ChevronDown,
  Info,
  DollarSign,
  X,
  ExternalLink,
  Plus,
  Briefcase,
  Zap,
  BarChart2
} from 'lucide-react';

import GrowwRocketEmptyState from './GrowwRocketEmptyState';
import TradeDetailsModal from './TradeDetailsModal';
import InstrumentModal from './InstrumentModal';

export default function LiveBotDashboard({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {},
  onNavigateToScanner = () => {},
  onNavigateToMatrix = () => {}
}) {
  // Navigation sub-tabs: "explore", "holdings", "positions", "orders", "watchlist", "config"
  const [activeSubTab, setActiveSubTab] = useState("explore");

  // Terminal slide-out drawer state
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Modals state
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [selectedInstrument, setSelectedInstrument] = useState(null);

  // Bot configuration state
  const [symbol, setSymbol] = useState("SBIN.NS");
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

  // Live Market Indices Ticker Tape (Matches Groww Desktop Header)
  const indices = [
    { name: "NIFTY 50", price: "25,387.40", change: "+96.30", pct: "+0.38%", isUp: true },
    { name: "SENSEX", price: "82,532.19", change: "+427.40", pct: "+0.52%", isUp: true },
    { name: "BANK NIFTY", price: "62,273.25", change: "+697.35", pct: "+1.13%", isUp: true },
    { name: "MIDCPNIFTY", price: "14,277.45", change: "-3.80", pct: "-0.03%", isUp: false },
    { name: "FINNIFTY", price: "28,124.80", change: "+112.50", pct: "+0.40%", isUp: true }
  ];

  // Popular Stocks Data (4 cards per row)
  const popularStocks = [
    { sym: "SBIN.NS", name: "State Bank of India", price: "818.50", chg: "+1.25%", isUp: true, logo: "SB" },
    { sym: "RELIANCE.NS", name: "Reliance Industries", price: "2,985.40", chg: "+0.85%", isUp: true, logo: "RL" },
    { sym: "HDFCBANK.NS", name: "HDFC Bank Ltd", price: "1,682.10", chg: "-0.40%", isUp: false, logo: "HD" },
    { sym: "TATAMOTORS.NS", name: "Tata Motors Ltd", price: "982.35", chg: "+2.15%", isUp: true, logo: "TM" },
    { sym: "TCS.NS", name: "Tata Consultancy Services", price: "4,120.00", chg: "+0.30%", isUp: true, logo: "TC" },
    { sym: "INFY.NS", name: "Infosys Ltd", price: "1,875.25", chg: "-0.65%", isUp: false, logo: "IN" },
    { sym: "BHARTIARTL.NS", name: "Bharti Airtel Ltd", price: "1,610.80", chg: "+1.40%", isUp: true, logo: "BA" },
    { sym: "ICICIBANK.NS", name: "ICICI Bank Ltd", price: "1,245.50", chg: "+0.95%", isUp: true, logo: "IC" }
  ];

  // Popular Bonds Data (4 cards per row)
  const popularBonds = [
    { sym: "GS2033", name: "Govt of India 7.18% 2033", yieldRate: "7.18% YTM", price: "100.25", chg: "+0.05%", isUp: true, logo: "GOI" },
    { sym: "REC2029", name: "REC Ltd AAA 7.65%", yieldRate: "7.65% YTM", price: "101.50", chg: "+0.12%", isUp: true, logo: "REC" },
    { sym: "NHAI2031", name: "NHAI Tax Free 7.39%", yieldRate: "5.45% (TF)", price: "118.40", chg: "+0.08%", isUp: true, logo: "NHAI" },
    { sym: "PFC2030", name: "PFC Ltd AAA 7.72%", yieldRate: "7.72% YTM", price: "102.10", chg: "-0.04%", isUp: false, logo: "PFC" }
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
          setConfigSuccessMsg(`Bot Armed & Running on ${targetSymbol}`);
          setTimeout(() => setConfigSuccessMsg(""), 3500);
        } else if (action === "PAUSE") {
          setConfigSuccessMsg("Bot Paused Execution");
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

  const isRunning = Boolean(bot.status?.includes("ACTIVE") || bot.status?.includes("IN POSITION"));
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

  // Handle single Play / Pause toggle
  const handleTogglePlayPause = () => {
    if (isRunning) {
      handleControl("PAUSE");
    } else {
      handleControl("START");
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
      backgroundColor: '#080A0B',
      color: '#F1F3F4'
    }}>

      {/* ── ROW 2: Groww Underline Sub-Navigation Bar (Matches Screenshot 1 & 4) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: '1px solid #252A2C',
        backgroundColor: '#080A0B'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {[
            { id: "explore", label: "Explore" },
            { id: "holdings", label: "Holdings" },
            { id: "positions", label: "Positions", badge: isInPosition ? "1" : null },
            { id: "orders", label: "Orders", badge: todayFills.length > 0 ? todayFills.length : null },
            { id: "watchlist", label: "Watchlist" },
            { id: "config", label: "Bot Config", badge: isRunning ? "RUNNING" : null }
          ].map(tab => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`groww-subtab ${isActive ? 'groww-subtab-active' : 'groww-subtab-inactive'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    backgroundColor: tab.badge === "RUNNING" ? 'rgba(0, 208, 156, 0.15)' : '#252A2C',
                    color: tab.badge === "RUNNING" ? '#00D09C' : '#92999C'
                  }}>
                    {tab.badge}
                  </span>
                )}
                {/* Clean Underline Indicator (as seen in Groww screenshot) */}
                {isActive && <div className="groww-subtab-indicator" />}
              </button>
            );
          })}
        </div>

        {/* Right side of Sub-Nav: Status Badge & Terminal Console Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Market Timing Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '20px',
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#92999C'
          }}>
            <span
              className={isRunning ? "pulse-mint-dot" : ""}
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isRunning ? '#00D09C' : (isPaused ? '#F59E0B' : '#626A6E')
              }}
            />
            <span>{countdownText}</span>
          </div>

          {/* Groww "Terminal" Button (Matches Screenshot 1, 2, 3) */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            title="Toggle Live Algo Terminal Console"
            className="btn-groww-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              backgroundColor: isTerminalOpen ? '#252A2C' : '#151819',
              color: isTerminalOpen ? '#00D09C' : '#F1F3F4'
            }}
          >
            <SlidersHorizontal size={14} color={isTerminalOpen ? "#00D09C" : "#92999C"} />
            <span>Terminal</span>
            {botData?.logs?.length > 0 && (
              <span style={{
                fontSize: '0.68rem',
                color: '#92999C',
                backgroundColor: '#101314',
                padding: '1px 5px',
                borderRadius: '6px'
              }}>
                {botData.logs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── ROW 3: Groww Market Indices Ticker Tape (Placed Directly Below Sub-Nav) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 32px',
        borderBottom: '1px solid #252A2C',
        backgroundColor: '#080A0B',
        overflowX: 'auto',
        gap: '36px',
        whiteSpace: 'nowrap'
      }}>
        {indices.map((idx, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
            <span style={{ fontWeight: '700', color: '#92999C' }}>{idx.name}</span>
            <span style={{ fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">{idx.price}</span>
            <span style={{
              fontWeight: '600',
              color: idx.isUp ? '#00D09C' : '#EB5B3C',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }} className="font-tabular">
              {idx.change} ({idx.pct})
            </span>
          </div>
        ))}
      </div>

      {/* ── Main Canvas ── */}
      <div style={{ flex: 1, padding: '28px 32px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 1: EXPLORE (TWO-COLUMN LAYOUT MATCHING SCREENSHOT 1 & 4)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "explore" && (
          <div className="groww-explore-grid" style={{ display: 'grid', gridTemplateColumns: '72% 28%', gap: '32px' }}>
            
            {/* ── Left Column (72% width) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* SECTION A: Popular Stocks & ETFs */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00D09C' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#00D09C', letterSpacing: '0.04em' }}>LIVE</span>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: 0, marginLeft: '4px' }}>
                      Popular Indian Stocks & ETFs
                    </h2>
                  </div>
                  <span
                    onClick={() => setActiveSubTab("watchlist")}
                    style={{ fontSize: '0.825rem', color: '#00D09C', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>See more</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

                {/* 4 Cards Per Row Grid */}
                <div className="groww-cards-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px'
                }}>
                  {popularStocks.slice(0, 4).map((stk, i) => (
                    <div
                      key={i}
                      className="groww-stock-card"
                      onClick={() => setSelectedInstrument(stk)}
                    >
                      {/* Company Logo Badge */}
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '0.9rem',
                        color: '#00D09C'
                      }}>
                        {stk.logo}
                      </div>

                      {/* Stock Name */}
                      <div style={{ margin: '14px 0 6px 0' }}>
                        <div style={{ fontWeight: '700', color: '#F1F3F4', fontSize: '0.92rem' }}>{stk.sym}</div>
                        <div style={{ fontSize: '0.75rem', color: '#92999C', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {stk.name}
                        </div>
                      </div>

                      {/* Price & Change Underneath */}
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                          {currency}{stk.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          color: stk.isUp ? '#00D09C' : '#EB5B3C',
                          marginTop: '2px'
                        }} className="font-tabular">
                          {stk.chg}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION B: Popular Bonds */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={18} color="#92999C" />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                      Popular Bonds & Fixed Income
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.825rem', color: '#00D09C', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>See more</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

                {/* 4 Cards Per Row Grid */}
                <div className="groww-cards-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px'
                }}>
                  {popularBonds.map((bnd, i) => (
                    <div
                      key={i}
                      className="groww-stock-card"
                      onClick={() => setSelectedInstrument({ sym: bnd.sym, name: bnd.name, price: bnd.price, chg: bnd.chg, isUp: bnd.isUp, logo: bnd.logo })}
                    >
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '0.8rem',
                        color: '#5367FF'
                      }}>
                        {bnd.logo}
                      </div>

                      <div style={{ margin: '14px 0 6px 0' }}>
                        <div style={{ fontWeight: '700', color: '#F1F3F4', fontSize: '0.92rem' }}>{bnd.sym}</div>
                        <div style={{ fontSize: '0.75rem', color: '#92999C' }}>
                          {bnd.yieldRate}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                          {currency}{bnd.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          color: bnd.isUp ? '#00D09C' : '#EB5B3C',
                          marginTop: '2px'
                        }} className="font-tabular">
                          {bnd.chg}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION C: Trending Automated Trading Instruments */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={18} color="#00D09C" />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                      Active Scanner Momentum Equities
                    </h2>
                  </div>
                  <span
                    onClick={onNavigateToScanner}
                    style={{ fontSize: '0.825rem', color: '#00D09C', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>Morning Scanner</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

                <div className="groww-cards-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px'
                }}>
                  {popularStocks.slice(4, 8).map((stk, i) => (
                    <div
                      key={i}
                      className="groww-stock-card"
                      onClick={() => setSelectedInstrument(stk)}
                    >
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '0.9rem',
                        color: '#00D09C'
                      }}>
                        {stk.logo}
                      </div>

                      <div style={{ margin: '14px 0 6px 0' }}>
                        <div style={{ fontWeight: '700', color: '#F1F3F4', fontSize: '0.92rem' }}>{stk.sym}</div>
                        <div style={{ fontSize: '0.75rem', color: '#92999C', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {stk.name}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                          {currency}{stk.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          color: stk.isUp ? '#00D09C' : '#EB5B3C',
                          marginTop: '2px'
                        }} className="font-tabular">
                          {stk.chg}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right Column (28% width) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* SUBSECTION A: Your Investments (Matches Screenshot 1) */}
              <div style={{
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                    Your investments
                  </h3>
                  <span
                    onClick={() => setActiveSubTab("holdings")}
                    style={{ fontSize: '0.78rem', color: '#00D09C', fontWeight: '700', cursor: 'pointer' }}
                  >
                    View details
                  </span>
                </div>

                {!isInPosition && todayFills.length === 0 ? (
                  /* Clean Empty State Illustration */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '36px 12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ width: '120px', height: '90px', marginBottom: '14px', opacity: 0.85 }}>
                      <svg viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                        <rect x="20" y="20" width="100" height="60" rx="8" fill="#101314" stroke="#252A2C" strokeWidth="1.5" />
                        <circle cx="50" cy="45" r="8" fill="#00D09C" opacity="0.3" />
                        <line x1="70" y1="40" x2="105" y2="40" stroke="#252A2C" strokeWidth="2" strokeLinecap="round" />
                        <line x1="70" y1="48" x2="95" y2="48" stroke="#252A2C" strokeWidth="2" strokeLinecap="round" />
                        <path d="M35 70L55 55L75 62L105 45" stroke="#00D09C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#F1F3F4' }}>
                      You haven't invested yet
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#92999C', marginTop: '4px' }}>
                      Arm the algorithmic bot to begin autonomous intraday trading.
                    </p>
                    <button
                      onClick={() => setActiveSubTab("config")}
                      className="btn-groww-primary"
                      style={{ marginTop: '16px', fontSize: '0.8rem', padding: '8px 18px' }}
                    >
                      Configure & Arm Bot
                    </button>
                  </div>
                ) : (
                  /* Active Portfolio Summary */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #252A2C' }}>
                      <span style={{ fontSize: '0.82rem', color: '#92999C' }}>Stocks & F&O Balance</span>
                      <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                        {currency}{(bot.cash || 1000000.0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #252A2C' }}>
                      <span style={{ fontSize: '0.82rem', color: '#92999C' }}>Current Position Value</span>
                      <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                        {currency}{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.82rem', color: '#92999C' }}>Today's Total P&L</span>
                      <span style={{
                        fontSize: '0.92rem',
                        fontWeight: '800',
                        color: (dailyRealizedPnl + unrealizedPnl) >= 0 ? '#00D09C' : '#EB5B3C'
                      }} className="font-tabular">
                        {(dailyRealizedPnl + unrealizedPnl) >= 0 ? `+${currency}${(dailyRealizedPnl + unrealizedPnl).toFixed(2)}` : `-${currency}${Math.abs(dailyRealizedPnl + unrealizedPnl).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SUBSECTION B: Products & Tools */}
              <div style={{
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                  Products & Tools
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: "⚡ Morning Breakout Screener", desc: "09:16 AM Volume & Gap Scanner", action: onNavigateToScanner },
                    { label: "📊 Strategy Studio Backtester", desc: "Multi-year simulation & slippage", action: onNavigateToBacktest },
                    { label: "🔬 Factor Matrix Optimizer", desc: "Cross-asset multi-timeframe grid", action: onNavigateToMatrix },
                    { label: "📱 Telegram Mobile Alerts", desc: "Instant trade execution pushes", action: () => {} }
                  ].map((tool, i) => (
                    <div
                      key={i}
                      onClick={tool.action}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1c2022';
                        e.currentTarget.style.borderColor = '#00D09C';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#101314';
                        e.currentTarget.style.borderColor = '#252A2C';
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>{tool.label}</div>
                        <div style={{ fontSize: '0.72rem', color: '#92999C' }}>{tool.desc}</div>
                      </div>
                      <ChevronRight size={14} color="#92999C" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 2: HOLDINGS
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "holdings" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '16px',
              padding: '24px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#92999C' }}>Total Portfolio Value</span>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                  {currency}{(bot.cash + positionValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#92999C' }}>Invested Amount</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                    {currency}{(bot.shares * (bot.entry_price || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#92999C' }}>Available Cash</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }} className="font-tabular">
                    {currency}{bot.cash?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {!isInPosition ? (
              <div style={{
                backgroundColor: '#151819',
                borderRadius: '16px',
                border: '1px solid #252A2C',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <GrowwRocketEmptyState
                  title="No holdings available"
                  subtitle="You do not have any open delivery or intraday holdings at this moment."
                />
              </div>
            ) : (
              <div style={{
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                borderRadius: '16px',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#101314', color: '#92999C', borderBottom: '1px solid #252A2C' }}>
                      <th style={{ padding: '14px 20px', fontWeight: '600' }}>Instrument</th>
                      <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Avg Price</th>
                      <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>LTP</th>
                      <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Current Value</th>
                      <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #252A2C' }}>
                      <td style={{ padding: '16px 20px', fontWeight: '700', color: '#F1F3F4' }}>
                        {bot.symbol} <span style={{ fontSize: '0.72rem', color: '#00D09C', marginLeft: '6px' }}>MIS</span>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#F1F3F4' }} className="font-tabular">{bot.shares}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#F1F3F4' }} className="font-tabular">{currency}{Number(bot.entry_price || 0).toFixed(2)}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#F1F3F4' }} className="font-tabular">{currency}{Number(currentLtp).toFixed(2)}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#F1F3F4' }} className="font-tabular">{currency}{positionValue.toFixed(2)}</td>
                      <td style={{
                        padding: '16px 20px',
                        textAlign: 'right',
                        fontWeight: '700',
                        color: unrealizedPnl >= 0 ? '#00D09C' : '#EB5B3C'
                      }} className="font-tabular">
                        {unrealizedPnl >= 0 ? `+${currency}${unrealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 3: POSITIONS (LIVE PRICE FLUCTUATION OF STOCKS BOUGHT)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "positions" && (
          <div>
            {!isInPosition ? (
              /* Groww Rocket Empty State (Matches Screenshot 2) */
              <div style={{
                backgroundColor: '#151819',
                borderRadius: '16px',
                border: '1px solid #252A2C',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <GrowwRocketEmptyState
                  title="No open positions"
                  subtitle="Equity, Intraday and MTF positions will appear here."
                  actionButton={
                    <button
                      onClick={() => setActiveSubTab("config")}
                      className="btn-groww-primary"
                      style={{ marginTop: '16px' }}
                    >
                      ⚙️ Configure & Arm Bot
                    </button>
                  }
                />
              </div>
            ) : (
              /* LIVE POSITION CARD WITH REAL-TIME FLUCTUATION */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  backgroundColor: '#151819',
                  border: '1px solid #252A2C',
                  borderRadius: '18px',
                  padding: '28px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}>
                  {/* Position Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        backgroundColor: '#101314',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #252A2C',
                        fontSize: '1rem',
                        fontWeight: '800',
                        color: '#00D09C'
                      }}>
                        {bot.symbol ? bot.symbol.substring(0, 2) : "EQ"}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4' }}>{bot.symbol}</span>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0, 208, 156, 0.12)',
                            color: '#00D09C',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            border: '1px solid rgba(0, 208, 156, 0.28)'
                          }}>
                            {bot.position_side || "LONG"} • INTRADAY MIS
                          </span>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#101314',
                            color: '#92999C',
                            fontSize: '0.72rem',
                            fontWeight: '600'
                          }}>
                            {bot.strategy}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#626A6E' }}>
                          National Stock Exchange • Standard MIS 5x Leverage
                        </span>
                      </div>
                    </div>

                    {/* Square off quick action */}
                    <button
                      onClick={() => handleControl("SQUARE_OFF")}
                      disabled={actionLoading}
                      className="btn-groww-danger"
                    >
                      <Square size={14} fill="#EB5B3C" />
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
                    backgroundColor: '#080A0B',
                    border: '1px solid #252A2C',
                    marginBottom: '24px'
                  }}>
                    {/* Live P&L Hero */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                        Live Unrealized P&L
                      </span>
                      <div style={{
                        fontSize: '2rem',
                        fontWeight: '800',
                        color: unrealizedPnl >= 0 ? '#00D09C' : '#EB5B3C',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '8px',
                        marginTop: '4px'
                      }} className="font-tabular">
                        <span>{unrealizedPnl >= 0 ? `+${currency}${unrealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}</span>
                        <span style={{ fontSize: '1rem', fontWeight: '700' }}>
                          ({unrealizedPct >= 0 ? `+${unrealizedPct.toFixed(2)}%` : `${unrealizedPct.toFixed(2)}%`})
                        </span>
                      </div>
                    </div>

                    {/* Live LTP with Flash */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                        Live Market Price (LTP)
                      </span>
                      <div style={{
                        fontSize: '1.75rem',
                        fontWeight: '800',
                        color: '#F1F3F4',
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        backgroundColor: lastTickColor === "up" ? 'rgba(0, 208, 156, 0.2)' : (lastTickColor === "down" ? 'rgba(235, 91, 60, 0.2)' : 'transparent'),
                        transition: 'background-color 0.4s ease'
                      }} className="font-tabular">
                        <span>{currency}{Number(currentLtp).toFixed(2)}</span>
                        {lastTickColor === "up" && <ArrowUpRight size={18} color="#00D09C" />}
                        {lastTickColor === "down" && <ArrowDownRight size={18} color="#EB5B3C" />}
                      </div>
                    </div>

                    {/* Avg Entry Price */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                        Avg Entry Price
                      </span>
                      <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {currency}{Number(bot.entry_price || 0).toFixed(2)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
                        Quantity: {bot.shares} shares
                      </span>
                    </div>

                    {/* Total Invested */}
                    <div>
                      <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                        Current Value
                      </span>
                      <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {currency}{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
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
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#00D09C' }}>🎯 PROFIT TARGET (2R)</span>
                        <span style={{ fontSize: '0.75rem', color: '#00D09C' }}>
                          +{bot.target_price && bot.entry_price ? (((bot.target_price - bot.entry_price) / bot.entry_price) * 100).toFixed(2) : "1.50"}%
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {bot.target_price ? `${currency}${Number(bot.target_price).toFixed(2)}` : `${currency}${(currentLtp * 1.015).toFixed(2)}`}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Auto take-profit bracket order</span>
                    </div>

                    {/* Stop Loss Card */}
                    <div style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(235, 91, 60, 0.05)',
                      border: '1px solid rgba(235, 91, 60, 0.2)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#EB5B3C' }}>🛑 HARD STOP LOSS</span>
                        <span style={{ fontSize: '0.75rem', color: '#EB5B3C' }}>
                          {bot.stop_loss && bot.entry_price ? (((bot.stop_loss - bot.entry_price) / bot.entry_price) * 100).toFixed(2) : "-0.75"}%
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {bot.stop_loss ? `${currency}${Number(bot.stop_loss).toFixed(2)}` : `${currency}${(currentLtp * 0.9925).toFixed(2)}`}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Hard circuit risk stop</span>
                    </div>

                    {/* VWAP */}
                    <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#080A0B', border: '1px solid #252A2C' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92999C' }}>📊 SESSION VWAP</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {currency}{bot.indicators?.vwap ? Number(bot.indicators.vwap).toFixed(2) : (currentQuote.vwap ? currentQuote.vwap.toFixed(2) : "814.20")}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#00D09C' }}>Trading above VWAP</span>
                    </div>

                    {/* RSI Indicator */}
                    <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#080A0B', border: '1px solid #252A2C' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92999C' }}>⚡ INTRADAY RSI (14)</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px' }} className="font-tabular">
                        {bot.indicators?.rsi ? Number(bot.indicators.rsi).toFixed(1) : "58.4"}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#92999C' }}>Bullish momentum zone</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 4: ORDERS (TRADE HISTORY & NET P&L WITH CHARGES BREAKDOWN)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "orders" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Net P&L Summary Hero Card */}
            <div style={{
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '16px',
              padding: '24px 28px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>
                  Today's Net Realized P&L
                </span>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: '800',
                  color: dailyRealizedPnl >= 0 ? '#00D09C' : '#EB5B3C',
                  marginTop: '4px'
                }} className="font-tabular">
                  {dailyRealizedPnl >= 0 ? `+${currency}${dailyRealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(dailyRealizedPnl).toFixed(2)}`}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
                  After slippage & execution
                </span>
              </div>

              <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#626A6E', fontWeight: '600' }}>Trades Executed</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                    {todayFills.length}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#626A6E', fontWeight: '600' }}>Total Est. Taxes & Charges</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#EB5B3C', marginTop: '2px' }} className="font-tabular">
                    -{currency}{totalChargesToday.toFixed(2)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#626A6E', fontWeight: '600' }}>In-Pocket Net Impact</span>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: (dailyRealizedPnl - totalChargesToday) >= 0 ? '#00D09C' : '#EB5B3C',
                    marginTop: '2px'
                  }} className="font-tabular">
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
                  { id: "ALL", label: `All Orders (${allBotFills.length})` }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setOrderSessionFilter(f.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      backgroundColor: orderSessionFilter === f.id ? '#00D09C' : '#151819',
                      color: orderSessionFilter === f.id ? '#080A0B' : '#92999C',
                      border: '1px solid',
                      borderColor: orderSessionFilter === f.id ? '#00D09C' : '#252A2C',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#626A6E' }}>
                💡 Click any trade row to view full statutory taxes & brokerage charges breakdown
              </div>
            </div>

            {/* Orders List or Rocket Empty State (Matches Screenshot 3) */}
            {filteredTrades.length === 0 ? (
              <div style={{
                backgroundColor: '#151819',
                borderRadius: '16px',
                border: '1px solid #252A2C',
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
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                borderRadius: '16px',
                overflow: 'hidden'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #252A2C', backgroundColor: '#101314', color: '#92999C' }}>
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
                        return (
                          <tr
                            key={t.id || idx}
                            onClick={() => setSelectedTrade(t)}
                            style={{
                              borderBottom: '1px solid #252A2C',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1c2022'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '16px 20px', color: '#92999C' }}>
                              <div style={{ fontWeight: '600', color: '#F1F3F4' }}>{t.Time || t.Timestamp?.slice(11, 16) || "10:15 AM"}</div>
                              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>{t.Date || t.Timestamp?.slice(0, 10)}</div>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
                                color: isBuy ? '#00D09C' : '#EB5B3C',
                                border: `1px solid ${isBuy ? 'rgba(0, 208, 156, 0.28)' : 'rgba(235, 91, 60, 0.28)'}`
                              }}>
                                {t.Action}
                              </span>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ fontWeight: '700', color: '#F1F3F4' }}>{t.Symbol}</div>
                              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>NSE • MIS Intraday</div>
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                              {t.Shares}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                              {currency}{Number(t.Execution_Price || 0).toFixed(2)}
                            </td>
                            <td style={{
                              padding: '16px 20px',
                              textAlign: 'right',
                              fontWeight: '700',
                              color: t.RawAmount > 0 ? '#00D09C' : (t.RawAmount < 0 ? '#EB5B3C' : '#F1F3F4')
                            }} className="font-tabular">
                              {t.Amount || t.Cash_Change}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                color: '#00D09C',
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
            VIEW 5: WATCHLIST
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "watchlist" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                My Watchlist ({watchlist.length || popularStocks.length} Stocks)
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#92999C' }}>
                Click any stock to inspect chart, statistics, or select for trading
              </span>
            </div>

            <div style={{
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '16px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#101314', color: '#92999C', borderBottom: '1px solid #252A2C' }}>
                    <th style={{ padding: '14px 20px', fontWeight: '600' }}>Company / Symbol</th>
                    <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'right' }}>Change</th>
                    <th style={{ padding: '14px 20px', fontWeight: '600', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(watchlist.length > 0 ? watchlist : popularStocks).map((item, idx) => {
                    const sym = item.symbol || item.sym;
                    const price = item.price || "818.50";
                    const isUp = item.change_pct ? item.change_pct >= 0 : item.isUp;
                    const chgText = item.change_pct ? `${isUp ? '+' : ''}${item.change_pct.toFixed(2)}%` : item.chg;

                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedInstrument(item)}
                        style={{
                          borderBottom: '1px solid #252A2C',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1c2022'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: '700', color: '#F1F3F4' }}>{sym}</div>
                          <div style={{ fontSize: '0.72rem', color: '#92999C' }}>{item.name || "National Stock Exchange"}</div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                          {currency}{price}
                        </td>
                        <td style={{
                          padding: '16px 20px',
                          textAlign: 'right',
                          fontWeight: '700',
                          color: isUp ? '#00D09C' : '#EB5B3C'
                        }} className="font-tabular">
                          {chgText}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              userSelectedSymbolRef.current = true;
                              setSymbol(sym);
                              setActiveSubTab("config");
                            }}
                            className="btn-groww-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          >
                            <span>Select for Bot</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 6: BOT CONFIG & RULES (SINGLE DYNAMIC PLAY/PAUSE BUTTON)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "config" && (
          <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {configSuccessMsg && (
              <div style={{
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                border: '1px solid #00D09C',
                borderRadius: '12px',
                padding: '14px 20px',
                color: '#00D09C',
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
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                    Algo Bot Engine Configuration
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: '#92999C', marginTop: '4px', margin: 0 }}>
                    Configure the trading instrument, strategy rules, and execution controls
                  </p>
                </div>

                <div style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  backgroundColor: isRunning ? 'rgba(0, 208, 156, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${isRunning ? '#00D09C' : '#F59E0B'}`,
                  color: isRunning ? '#00D09C' : '#F59E0B',
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
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
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
                      backgroundColor: '#080A0B',
                      border: '1px solid #252A2C',
                      color: '#F1F3F4',
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
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
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
                      backgroundColor: '#080A0B',
                      border: '1px solid #252A2C',
                      color: '#00D09C',
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
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                      Max Trades Per Stock Per Day
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#00D09C' }}>Protects Daily Profits</span>
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
                          borderColor: maxTradesPerSymbol === opt.val ? '#00D09C' : '#252A2C',
                          backgroundColor: maxTradesPerSymbol === opt.val ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: maxTradesPerSymbol === opt.val ? '#00D09C' : '#F1F3F4',
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
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                    Virtual Capital Allocation
                  </label>
                  <input
                    type="text"
                    value={`₹${(capitalAllocation).toLocaleString('en-IN')}`}
                    readOnly
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: '#080A0B',
                      border: '1px solid #252A2C',
                      color: '#F1F3F4',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Bot Action Buttons — Note: Single Play/Pause Button as Requested */}
              <div style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid #252A2C',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                {/* Left: Dynamic Single Play / Pause Button */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={handleTogglePlayPause}
                    disabled={actionLoading}
                    className={isRunning ? "btn-groww-pause" : "btn-groww-primary"}
                    style={{
                      padding: '12px 28px',
                      fontSize: '0.9rem',
                      fontWeight: '800'
                    }}
                  >
                    {isRunning ? (
                      <>
                        <Pause size={17} />
                        <span>Pause Bot ({symbol})</span>
                      </>
                    ) : (
                      <>
                        <Play size={17} fill="#080A0B" />
                        <span>Start Bot ({symbol})</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Right: Reset & Square Off All Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleControl("RESET")}
                    disabled={actionLoading}
                    title="Reset Today's Trade Counter & State"
                    className="btn-groww-secondary"
                  >
                    <RotateCcw size={14} />
                    <span>Reset Quota</span>
                  </button>

                  <button
                    onClick={() => handleControl("SQUARE_OFF")}
                    disabled={actionLoading}
                    className="btn-groww-danger"
                  >
                    <Square size={14} fill="#EB5B3C" />
                    <span>Square Off All</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Institutional Risk Parameters Box */}
            <div style={{
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00D09C', fontWeight: '700' }}>
                <ShieldCheck size={18} />
                <span>SEBI & Institutional Risk Guardrails</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '8px' }}>
                <div style={{ padding: '12px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                  <div style={{ color: '#626A6E', fontSize: '0.75rem' }}>Auto Square-Off</div>
                  <div style={{ color: '#F1F3F4', fontWeight: '700', marginTop: '4px' }}>15:15 IST (3:15 PM)</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                  <div style={{ color: '#626A6E', fontSize: '0.75rem' }}>Max Drawdown Circuit</div>
                  <div style={{ color: '#EB5B3C', fontWeight: '700', marginTop: '4px' }}>₹20,000 (2.0%)</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                  <div style={{ color: '#626A6E', fontSize: '0.75rem' }}>Margin Multiplier</div>
                  <div style={{ color: '#00D09C', fontWeight: '700', marginTop: '4px' }}>5x MIS (SEBI Limit)</div>
                </div>
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
          backgroundColor: '#080A0B',
          borderTop: '2px solid #00D09C',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 900
        }}>
          {/* Terminal Drawer Header */}
          <div style={{
            padding: '12px 24px',
            backgroundColor: '#151819',
            borderBottom: '1px solid #252A2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00D09C' }} />
                <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#F1F3F4' }}>
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
                      backgroundColor: logFilter === f ? '#00D09C' : '#080A0B',
                      color: logFilter === f ? '#080A0B' : '#92999C',
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
                className="btn-groww-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                Auto-scroll {autoScroll ? "ON" : "OFF"}
              </button>
              <button
                onClick={handleDownloadLogs}
                title="Download log file"
                className="btn-groww-secondary"
                style={{ padding: '4px 8px' }}
              >
                <Download size={13} />
              </button>
              <button
                onClick={handleClearLogs}
                title="Clear console buffer"
                className="btn-groww-secondary"
                style={{ padding: '4px 8px' }}
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setIsTerminalOpen(false)}
                title="Close Terminal Drawer"
                className="btn-groww-secondary"
                style={{ padding: '4px 8px' }}
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
              <div style={{ color: '#626A6E', textAlign: 'center', marginTop: '40px' }}>
                Console initialized. Waiting for telemetry events...
              </div>
            ) : (
              filteredLogs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ color: '#626A6E' }}>[{l.timestamp}]</span>
                  <span style={{
                    color: l.level === 'ORDER' ? '#00D09C' : (l.level === 'ERROR' ? '#EB5B3C' : (l.level === 'RISK' ? '#F59E0B' : '#60a5fa')),
                    fontWeight: '700'
                  }}>
                    [{l.level}]
                  </span>
                  <span style={{ color: '#92999C' }}>[{l.symbol}]</span>
                  <span style={{ color: '#F1F3F4' }}>{l.message}</span>
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

      {/* ── Instrument Details Modal (Spec Section 10) ── */}
      {selectedInstrument && (
        <InstrumentModal
          instrument={selectedInstrument}
          onClose={() => setSelectedInstrument(null)}
          onSelectForBot={(targetSym) => {
            userSelectedSymbolRef.current = true;
            setSymbol(targetSym);
            setActiveSubTab("config");
          }}
          onBacktest={(targetSym) => {
            onNavigateToBacktest(targetSym);
          }}
          currency={currency}
        />
      )}
    </div>
  );
}

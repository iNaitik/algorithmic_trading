import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Lock,
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
  BarChart2,
  Globe
} from 'lucide-react';

import GrowwRocketEmptyState from './GrowwRocketEmptyState';
import TradeDetailsModal from './TradeDetailsModal';
import InstrumentModal from './InstrumentModal';
import CompanyLogo from './CompanyLogo';
import OverviewDashboard from './OverviewDashboard';
import BacktesterView from './BacktesterView';
import MorningScannerView from './MorningScannerView';
import FactorMatrixView from './FactorMatrixView';
import TradeJournal from './TradeJournal';
import ExecutionMonitorView from './ExecutionMonitorView';
import { computeRoundTrips } from '../utils/tradeUtils';

export default function LiveBotDashboard({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {},
  onNavigateToScanner = () => {},
  onNavigateToMatrix = () => {},
  marketDefs = null,
  strategiesList = [],
  backtestResult = null,
  onRunBacktest = () => {}
}) {
  // Navigation sub-tabs: "overview", "explore", "holdings", "positions", "orders", "watchlist", "quant", "automation"
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [ordersViewMode, setOrdersViewMode] = useState("monitor"); // "monitor" (Execution Monitor) or "history" (Trades Journal)
  const [quantSubTool, setQuantSubTool] = useState("scanner"); // "scanner", "studio", "matrix", "journal"

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
  const [stopLossPct, setStopLossPct] = useState(0.8);
  const [takeProfitMultiple, setTakeProfitMultiple] = useState(2.0);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(2.0);
  const [configSuccessMsg, setConfigSuccessMsg] = useState("");
  const [configErrorMsg, setConfigErrorMsg] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  // Quant Lab - Strategy Studio isolated state
  const [quantMarket, setQuantMarket] = useState(market || "INDIA");
  const [quantSymbol, setQuantSymbol] = useState(symbol || "SBIN.NS");
  const [quantCustomSymbol, setQuantCustomSymbol] = useState("");
  const [quantInterval, setQuantInterval] = useState(timeframe || "5m");
  const [quantLookbackDays, setQuantLookbackDays] = useState(60);
  const [quantCapitalInput, setQuantCapitalInput] = useState(market === "INDIA" ? "10L" : "100k");
  const [quantInitialCapital, setQuantInitialCapital] = useState(market === "INDIA" ? 1000000.0 : 100000.0);
  const [quantStrategy, setQuantStrategy] = useState(strategy || "NSE Intraday ORB Breakout");
  const [quantLoading, setQuantLoading] = useState(false);
  const [quantErrorMsg, setQuantErrorMsg] = useState(null);
  const [quantBacktestResult, setQuantBacktestResult] = useState(backtestResult);

  // Parse capital allocation string dynamically for Strategy Studio
  useEffect(() => {
    let parsed = quantMarket === "INDIA" ? 1000000.0 : 100000.0;
    const raw = (quantCapitalInput || "").trim().toLowerCase();
    if (raw.endsWith('cr') || raw.endsWith('crore') || raw.endsWith('crores')) {
      const v = parseFloat(raw.replace(/crores|crore|cr/g, ''));
      if (!isNaN(v)) parsed = v * 10000000.0;
    } else if (raw.endsWith('l') || raw.endsWith('lakh') || raw.endsWith('lakhs')) {
      const v = parseFloat(raw.replace(/lakhs|lakh|l/g, ''));
      if (!isNaN(v)) parsed = v * 100000.0;
    } else if (raw.endsWith('k')) {
      const v = parseFloat(raw.replace(/k/g, ''));
      if (!isNaN(v)) parsed = v * 1000.0;
    } else if (raw.endsWith('m') || raw.endsWith('million')) {
      const v = parseFloat(raw.replace(/million|m/g, ''));
      if (!isNaN(v)) parsed = v * 1000000.0;
    } else {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) parsed = v;
    }
    setQuantInitialCapital(parsed);
  }, [quantCapitalInput, quantMarket]);

  // Sync initial backtestResult from parent if provided
  useEffect(() => {
    if (backtestResult && !quantBacktestResult) {
      setQuantBacktestResult(backtestResult);
    }
  }, [backtestResult]);

  // Handle Strategy Studio market switch
  const handleQuantMarketChange = (m) => {
    setQuantMarket(m);
    setQuantCustomSymbol("");
    if (m === "INDIA") {
      setQuantSymbol("SBIN.NS");
      setQuantCapitalInput("10L");
      setQuantInterval("5m");
      setQuantLookbackDays(60);
      setQuantStrategy("NSE Intraday ORB Breakout");
    } else if (m === "US") {
      setQuantSymbol("AAPL");
      setQuantCapitalInput("100k");
      setQuantInterval("1d");
      setQuantLookbackDays(365);
      setQuantStrategy("SMA Crossover");
    } else if (m === "FOREX") {
      setQuantSymbol("EUR/USD");
      setQuantCapitalInput("100k");
      setQuantInterval("1h");
      setQuantLookbackDays(60);
      setQuantStrategy("London Handoff Momentum");
    }
  };

  // Run Strategy Studio Backtest action
  const handleRunQuantBacktest = async (targetSym) => {
    setQuantLoading(true);
    setQuantErrorMsg(null);
    try {
      const activeSym = (targetSym || quantCustomSymbol.trim() || quantSymbol).trim();
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: quantMarket,
          symbol: activeSym,
          interval: quantInterval,
          lookback_days: Number(quantLookbackDays),
          initial_capital: quantInitialCapital,
          strategy_name: quantStrategy
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Backtest execution failed");
      }

      const data = await res.json();
      setQuantBacktestResult(data);
    } catch (err) {
      setQuantErrorMsg(err.message || "Failed to execute backtest");
    } finally {
      setQuantLoading(false);
    }
  };

  // Live polling data
  const [botData, setBotData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const isFetchingRef = useRef(false);

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
  const userSelectedCapitalRef = useRef(false);
  const userSelectedTimeframeRef = useRef(false);
  const userSelectedSlRef = useRef(false);
  const userSelectedTpRef = useRef(false);
  const userSelectedDdRef = useRef(false);
  const terminalBodyRef = useRef(null);

  // Live Market Indices Ticker Tape (Matches Groww Desktop Header & Screenshot 1, 5)
  const indices = [
    { name: "NIFTY", price: "25,387.40", change: "96.30 (0.38%)", isUp: true },
    { name: "SENSEX", price: "82,532.19", change: "427.40 (0.52%)", isUp: true },
    { name: "BANKNIFTY", price: "62,273.25", change: "697.35 (1.13%)", isUp: true },
    { name: "MIDCPNIFTY", price: "14,277.45", change: "-3.80 (0.03%)", isUp: false },
    { name: "FINNIFTY", price: "28,124.80", change: "112.50 (0.40%)", isUp: true }
  ];

  // Popular US & Global Stocks Data (Matches Groww Desktop Screenshot 1 & 5)
  const popularUSStocks = [
    { sym: "NVDA", name: "NVIDIA", price: "156.12", chg: "0.00 (0.00%)", isUp: true, curr: "$" },
    { sym: "SPY", name: "State Street SPDR S&P 500", price: "740.06", chg: "-1.16 (0.16%)", isUp: false, curr: "$" },
    { sym: "MU", name: "Micron Technology", price: "709.57", chg: "-9.76 (1.36%)", isUp: false, curr: "$" },
    { sym: "AMD", name: "Advanced Micro Devices", price: "501.71", chg: "-2.30 (0.46%)", isUp: false, curr: "$" }
  ];

  // Popular Indian Stocks Data (4 cards per row, official vector logos)
  const popularStocks = [
    { sym: "SBIN.NS", name: "State Bank of India", price: "818.50", chg: "+10.15 (1.25%)", isUp: true, curr: "₹" },
    { sym: "RELIANCE.NS", name: "Reliance Industries", price: "2,985.40", chg: "+25.10 (0.85%)", isUp: true, curr: "₹" },
    { sym: "HDFCBANK.NS", name: "HDFC Bank Ltd", price: "1,682.10", chg: "-6.75 (0.40%)", isUp: false, curr: "₹" },
    { sym: "TATAMOTORS.NS", name: "Tata Motors Ltd", price: "982.35", chg: "+20.70 (2.15%)", isUp: true, curr: "₹" },
    { sym: "TCS.NS", name: "Tata Consultancy Services", price: "4,120.00", chg: "+12.35 (0.30%)", isUp: true, curr: "₹" },
    { sym: "INFY.NS", name: "Infosys Ltd", price: "1,875.25", chg: "-12.20 (0.65%)", isUp: false, curr: "₹" },
    { sym: "BHARTIARTL.NS", name: "Bharti Airtel Ltd", price: "1,610.80", chg: "+22.40 (1.40%)", isUp: true, curr: "₹" },
    { sym: "ICICIBANK.NS", name: "ICICI Bank Ltd", price: "1,245.50", chg: "+11.75 (0.95%)", isUp: true, curr: "₹" }
  ];

  // Popular Bonds Data (Matches Groww Desktop Screenshot 1)
  const popularBonds = [
    { sym: "MUTHOOT", name: "Muthoot Finance AAA", yieldRate: "8.25% YTM", price: "1,024.50", chg: "+0.15%", isUp: true },
    { sym: "INDEL", name: "Indel Money Senior Secured", yieldRate: "9.10% YTM", price: "1,012.00", chg: "+0.18%", isUp: true },
    { sym: "PAISALO", name: "Paisalo Digital NCD", yieldRate: "9.85% YTM", price: "1,005.75", chg: "+0.22%", isUp: true },
    { sym: "GS2033", name: "Govt of India 7.18% 2033", yieldRate: "7.18% YTM", price: "100.25", chg: "+0.05%", isUp: true }
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

  // Poll Bot Status & Watchlist from backend with concurrency guard
  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const [statusRes, watchRes] = await Promise.all([
        fetch(`/api/bot/status?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/market/watchlist?market=${market}`)
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setBotData(sData);
        setIsConnected(true);
        setLastSyncTime(sData.ist_time || new Date().toLocaleTimeString('en-IN', { hour12: false }));

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
          if (!userSelectedCapitalRef.current && sData.bot_state.capital !== undefined) {
            setCapitalAllocation(sData.bot_state.capital);
          }
          if (!userSelectedTimeframeRef.current && sData.bot_state.timeframe) {
            setTimeframe(sData.bot_state.timeframe);
          }
          if (!userSelectedSlRef.current && sData.bot_state.stop_loss_pct !== undefined) {
            setStopLossPct(sData.bot_state.stop_loss_pct);
          }
          if (!userSelectedTpRef.current && sData.bot_state.take_profit_multiple !== undefined) {
            setTakeProfitMultiple(sData.bot_state.take_profit_multiple);
          }
          if (!userSelectedDdRef.current && sData.bot_state.max_drawdown_pct !== undefined) {
            setMaxDrawdownPct(sData.bot_state.max_drawdown_pct);
          }
        }
      } else {
        setIsConnected(false);
      }

      if (watchRes.ok) {
        const wData = await watchRes.json();
        setWatchlist(wData);
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
      setIsConnected(false);
    } finally {
      isFetchingRef.current = false;
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
    if (actionLoading) return;
    setActionLoading(true);
    setConfigErrorMsg("");
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          symbol: targetSymbol,
          strategy_name: targetStrategy,
          capital: Number(capitalAllocation),
          timeframe,
          max_trades_per_symbol: Number(targetQuota),
          stop_loss_pct: Number(stopLossPct),
          take_profit_multiple: Number(takeProfitMultiple),
          max_drawdown_pct: Number(maxDrawdownPct)
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
        } else if (action === "RESET") {
          setConfigSuccessMsg("Trade quota and daily state reset.");
          setTimeout(() => setConfigSuccessMsg(""), 3500);
        } else if (action === "SQUARE_OFF") {
          setConfigSuccessMsg("Emergency position liquidation completed.");
          setTimeout(() => setConfigSuccessMsg(""), 3500);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setConfigErrorMsg(errJson.detail || "Operation failed");
        setTimeout(() => setConfigErrorMsg(""), 5000);
      }
    } catch (e) {
      console.error("Control error:", e);
      setConfigErrorMsg(e.message || "Failed to contact execution server");
      setTimeout(() => setConfigErrorMsg(""), 5000);
    } finally {
      setActionLoading(false);
      fetchData();
    }
  };

  // Dedicated configuration save handler
  const handleSaveConfig = async () => {
    if (configSaving) return;
    setConfigSaving(true);
    setConfigErrorMsg("");
    setConfigSuccessMsg("");
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "CONFIG",
          symbol,
          strategy_name: strategy,
          capital: Number(capitalAllocation),
          timeframe,
          max_trades_per_symbol: Number(maxTradesPerSymbol),
          stop_loss_pct: Number(stopLossPct),
          take_profit_multiple: Number(takeProfitMultiple),
          max_drawdown_pct: Number(maxDrawdownPct)
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.bot_state) {
          setBotData(prev => ({
            ...prev,
            bot_state: json.bot_state
          }));
        }
        userSelectedSymbolRef.current = false;
        userSelectedStrategyRef.current = false;
        userSelectedQuotaRef.current = false;
        userSelectedCapitalRef.current = false;
        userSelectedTimeframeRef.current = false;
        userSelectedSlRef.current = false;
        userSelectedTpRef.current = false;
        userSelectedDdRef.current = false;
        setConfigSuccessMsg("Configuration saved and applied to paper execution engine.");
        setTimeout(() => setConfigSuccessMsg(""), 4000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setConfigErrorMsg(errJson.detail || "Failed to save configuration");
        setTimeout(() => setConfigErrorMsg(""), 6000);
      }
    } catch (e) {
      setConfigErrorMsg(e.message || "Network error saving configuration");
      setTimeout(() => setConfigErrorMsg(""), 6000);
    } finally {
      setConfigSaving(false);
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

  // Quant Lab Trade Journal - Reconciled Round Trips & Open Inventory
  const [journalSource, setJournalSource] = useState("auto"); // "auto", "live", "backtest"

  const adaptedLiveRoundTrips = useMemo(() => {
    if (!allBotFills || allBotFills.length === 0) return [];
    const { pairedTrades } = computeRoundTrips(allBotFills);
    return (pairedTrades || []).map((pt, idx) => ({
      id: pt.id || `LIVE-${idx + 1}`,
      symbol: pt.symbol || "UNKNOWN",
      placed_at: pt.entryTime || pt.entryDate || "N/A",
      exited_at: pt.exitTime || pt.exitDate || "N/A",
      side: pt.side || "LONG",
      entry_price: Number(pt.entryPrice || 0),
      exit_price: Number(pt.exitPrice || 0),
      shares: Number(pt.shares || 0),
      gross_pnl: Number(pt.grossPnl || 0),
      fees: Number(pt.fees || 0),
      net_pnl: Number(pt.netPnl || 0),
      pnl_pct: Number(pt.returnPct || 0),
      is_win: Number(pt.netPnl || 0) >= 0
    }));
  }, [allBotFills]);

  const openPositionsList = useMemo(() => {
    if (!allBotFills || allBotFills.length === 0) return [];
    const { openLongs, openShorts } = computeRoundTrips(allBotFills);
    const open = [];

    Object.entries(openLongs || {}).forEach(([sym, entries]) => {
      (entries || []).forEach((e, idx) => {
        if (e.remainingShares > 0.0001) {
          open.push({
            id: `OPEN-L-${sym}-${idx}`,
            symbol: sym,
            side: "LONG",
            placed_at: e.Timestamp || e.Time || "N/A",
            entry_price: Number(e.price || e.Execution_Price || 0),
            shares: Number(e.remainingShares || 0),
            original_shares: Number(e.originalShares || e.Shares || 0),
            status: "OPEN"
          });
        }
      });
    });

    Object.entries(openShorts || {}).forEach(([sym, entries]) => {
      (entries || []).forEach((e, idx) => {
        if (e.remainingShares > 0.0001) {
          open.push({
            id: `OPEN-S-${sym}-${idx}`,
            symbol: sym,
            side: "SHORT",
            placed_at: e.Timestamp || e.Time || "N/A",
            entry_price: Number(e.price || e.Execution_Price || 0),
            shares: Number(e.remainingShares || 0),
            original_shares: Number(e.originalShares || e.Shares || 0),
            status: "OPEN"
          });
        }
      });
    });

    return open;
  }, [allBotFills]);

  const unmatchedExitsList = useMemo(() => {
    if (!allBotFills || allBotFills.length === 0) return [];
    const { unmatchedExits } = computeRoundTrips(allBotFills);
    return unmatchedExits || [];
  }, [allBotFills]);

  // Filtered Logs
  const allLogs = botData?.logs || [];
  const filteredLogs = logFilter === "ALL" ? allLogs : allLogs.filter(l => l.level === logFilter);

  // Handle single Play / Pause toggle
  const handleTogglePlayPause = () => {
    if (bot.daily_drawdown_locked && !isRunning) {
      setConfigErrorMsg("Cannot start bot: Daily drawdown circuit breaker is active. Execution locked until next trading day.");
      return;
    }
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

      {/* ── ROW 2: Groww Underline Sub-Navigation Bar (Matches Screenshot 1, 2, 3, 5) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: '1px solid #202426',
        backgroundColor: '#080A0B',
        position: 'relative'
      }}>
        {/* Left Sub-Nav Tabs with Clean White Underline Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {[
            { id: "overview", label: "Overview" },
            { id: "explore", label: "Explore" },
            { id: "holdings", label: "Holdings" },
            { id: "positions", label: "Positions" },
            { id: "orders", label: "Orders" },
            { id: "watchlist", label: "Watchlist" },
            { id: "quant", label: "Quant Lab" },
            { id: "automation", label: "Automation" }
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
                  padding: '14px 2px',
                  background: 'transparent',
                  border: 'none',
                  color: isActive ? '#FFFFFF' : '#92999C',
                  fontSize: '0.92rem',
                  fontWeight: isActive ? '600' : '500',
                  cursor: 'pointer',
                  position: 'relative',
                  letterSpacing: '-0.01em',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.color = '#92999C';
                }}
              >
                <span>{tab.label}</span>
                {/* Clean Solid White Underline Indicator (Arrow 2 & Groww Screenshot 1, 2, 3) */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2.5px',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '1px'
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Right side of Sub-Nav: Terminal Console Pill Button (Matches Groww Screenshot 1, 2, 3) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            title="Toggle Live Algo Terminal Console"
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: '500',
              borderRadius: '8px',
              backgroundColor: isTerminalOpen ? '#202528' : '#121516',
              border: '1px solid #252A2C',
              color: isTerminalOpen ? '#00D09C' : '#F1F3F4',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <SlidersHorizontal size={14} color={isTerminalOpen ? "#00D09C" : "#92999C"} />
            <span>Terminal</span>
          </button>
        </div>
      </div>

      {/* ── ROW 3: Groww Market Indices Ticker Tape (Directly Below Sub-Nav, Matches Screenshot 1 & 5) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 32px',
        borderBottom: '1px solid #202426',
        backgroundColor: '#080A0B',
        gap: '24px'
      }}>
        {/* Horizontally scrollable indices with NO scrollbar */}
        <div
          className="no-scrollbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '36px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {indices.map((idx, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: '600', color: '#92999C' }}>{idx.name}</span>
              <span style={{ fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">{idx.price}</span>
              <span style={{
                fontWeight: '600',
                color: idx.isUp ? '#00D09C' : '#EB5B3C'
              }} className="font-tabular">
                {idx.change}
              </span>
            </div>
          ))}
        </div>

        {/* Subtle Market Filter / Globe Button (Matches Screenshot 1 & 5) */}
        <div
          title="Market: NSE India"
          style={{
            padding: '5px 7px',
            borderRadius: '6px',
            backgroundColor: '#121516',
            border: '1px solid #202426',
            color: '#92999C',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <Globe size={13} color="#92999C" />
        </div>
      </div>

      {/* ── Main Canvas ── */}
      <div style={{ flex: 1, padding: '28px 32px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 0: OVERVIEW (ALGORITHMIC TRADING COMMAND CENTER)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "overview" && (
          <OverviewDashboard
            botData={botData}
            currentLtp={currentLtp}
            currency={currency}
            actionLoading={actionLoading}
            isConnected={isConnected}
            lastSyncTime={lastSyncTime}
            onNavigate={(tab) => {
              if (tab === "automation") setActiveSubTab("automation");
              else if (tab === "orders") setActiveSubTab("orders");
              else if (tab === "positions") setActiveSubTab("positions");
              else if (tab === "quant") {
                setActiveSubTab("quant");
                setQuantSubTool("scanner");
              } else setActiveSubTab(tab);
            }}
            onControl={handleControl}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 1: EXPLORE (TWO-COLUMN LAYOUT MATCHING SCREENSHOT 1 & 4)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "explore" && (
          <div className="groww-explore-grid" style={{ display: 'grid', gridTemplateColumns: '72% 28%', gap: '32px' }}>
            
            {/* ── Left Column (72% width) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* SECTION A: Popular US Stocks & ETFs (Matches Groww Desktop Screenshot 1 & 5) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00D09C' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#00D09C', letterSpacing: '0.04em' }}>LIVE</span>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#F1F3F4', margin: 0, marginLeft: '4px' }}>
                      Popular US Stocks & ETFs
                    </h2>
                  </div>
                  <span
                    onClick={() => setActiveSubTab("watchlist")}
                    style={{ fontSize: '0.8rem', color: '#00D09C', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>See more</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

                {/* 4 Cards Per Row Grid with Real Company Logos */}
                <div className="groww-cards-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px'
                }}>
                  {popularUSStocks.map((stk, i) => (
                    <div
                      key={i}
                      className="groww-stock-card"
                      onClick={() => setSelectedInstrument(stk)}
                    >
                      {/* Company Logo Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <CompanyLogo symbol={stk.sym} name={stk.name} size={38} />
                      </div>

                      {/* Stock Name */}
                      <div style={{ margin: '8px 0 2px 0' }}>
                        <div style={{ fontWeight: '500', color: '#F1F3F4', fontSize: '0.88rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {stk.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#92999C' }}>
                          {stk.sym}
                        </div>
                      </div>

                      {/* Price & Change Underneath */}
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                          {stk.curr}{stk.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '500',
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

              {/* SECTION B: Popular Indian Stocks */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={16} color="#00D09C" />
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#F1F3F4', margin: 0 }}>
                      Popular Indian Stocks
                    </h2>
                  </div>
                  <span
                    onClick={() => setActiveSubTab("watchlist")}
                    style={{ fontSize: '0.8rem', color: '#00D09C', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>See more</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <CompanyLogo symbol={stk.sym} name={stk.name} size={38} />
                      </div>

                      <div style={{ margin: '8px 0 2px 0' }}>
                        <div style={{ fontWeight: '500', color: '#F1F3F4', fontSize: '0.88rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {stk.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#92999C' }}>
                          {stk.sym}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                          {stk.curr || currency}{stk.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '500',
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

              {/* SECTION C: Popular Bonds (Matches Groww Desktop Screenshot 1) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={16} color="#92999C" />
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#F1F3F4', margin: 0 }}>
                      Popular Bonds
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#00D09C', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>See more</span>
                    <ChevronRight size={14} />
                  </span>
                </div>

                <div className="groww-cards-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px'
                }}>
                  {popularBonds.map((bnd, i) => (
                    <div
                      key={i}
                      className="groww-stock-card"
                      onClick={() => setSelectedInstrument({ sym: bnd.sym, name: bnd.name, price: bnd.price, chg: bnd.chg, isUp: bnd.isUp })}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <CompanyLogo symbol={bnd.sym} name={bnd.name} size={38} />
                      </div>

                      <div style={{ margin: '8px 0 2px 0' }}>
                        <div style={{ fontWeight: '500', color: '#F1F3F4', fontSize: '0.88rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {bnd.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#92999C' }}>
                          {bnd.yieldRate}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                          ₹{bnd.price}
                        </div>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: '500',
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
            </div>

            {/* ── Right Column (28% width) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* SUBSECTION A: Your Investments (Matches Groww Desktop Screenshot 1) */}
              <div style={{
                backgroundColor: '#121516',
                border: '1px solid #202426',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: '#F1F3F4', margin: 0 }}>
                    Your investments
                  </h3>
                  <span
                    onClick={() => setActiveSubTab("holdings")}
                    style={{ fontSize: '0.75rem', color: '#00D09C', fontWeight: '600', cursor: 'pointer' }}
                  >
                    View details
                  </span>
                </div>

                {!isInPosition && todayFills.length === 0 ? (
                  /* Clean Empty State with Two Figures and Foliage (Matches Groww Screenshot 1) */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px 8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ width: '130px', height: '75px', marginBottom: '12px' }}>
                      <svg viewBox="0 0 140 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                        {/* Dark card screen */}
                        <rect x="25" y="10" width="90" height="55" rx="6" fill="#090B0D" stroke="#1F2428" strokeWidth="1.2" />
                        <rect x="35" y="20" width="28" height="4" rx="2" fill="#00D09C" opacity="0.8" />
                        <line x1="35" y1="30" x2="58" y2="30" stroke="#252A2C" strokeWidth="2" strokeLinecap="round" />
                        <line x1="35" y1="38" x2="50" y2="38" stroke="#252A2C" strokeWidth="2" strokeLinecap="round" />
                        {/* Minimal green foliage */}
                        <path d="M98 55C98 42 108 38 108 38C108 38 106 48 101 55Z" fill="#00D09C" opacity="0.6" />
                        <path d="M103 55C103 46 112 43 112 43C112 43 110 50 106 55Z" fill="#00B5EC" opacity="0.5" />
                        {/* Two figures silhouettes */}
                        <circle cx="70" cy="35" r="5" fill="#E2E8F0" />
                        <path d="M64 55C64 47 67 43 70 43C73 43 76 47 76 55Z" fill="#94A3B8" />
                        <circle cx="85" cy="37" r="4.5" fill="#E2E8F0" />
                        <path d="M79 55C79 48 82 45 85 45C88 45 91 48 91 55Z" fill="#64748B" />
                      </svg>
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: '500', color: '#F1F3F4', marginBottom: '4px' }}>
                      You haven't invested yet
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#92999C', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                      Arm the algorithmic bot to begin autonomous intraday trading.
                    </p>
                    <button
                      onClick={() => setActiveSubTab("config")}
                      className="btn-groww-primary"
                      style={{ fontSize: '0.82rem', padding: '9px 18px', borderRadius: '8px', width: '100%', justifyContent: 'center' }}
                    >
                      Configure & Arm Bot
                    </button>
                  </div>
                ) : (
                  /* Active Portfolio Summary */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #202426' }}>
                      <span style={{ fontSize: '0.8rem', color: '#92999C' }}>Stocks & F&O Balance</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                        {currency}{(bot.cash || 1000000.0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #202426' }}>
                      <span style={{ fontSize: '0.8rem', color: '#92999C' }}>Current Position Value</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#F1F3F4' }} className="font-tabular">
                        {currency}{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: '#92999C' }}>Today's Total P&L</span>
                      <span style={{
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        color: (dailyRealizedPnl + unrealizedPnl) >= 0 ? '#00D09C' : '#EB5B3C'
                      }} className="font-tabular">
                        {(dailyRealizedPnl + unrealizedPnl) >= 0 ? `+${currency}${(dailyRealizedPnl + unrealizedPnl).toFixed(2)}` : `-${currency}${Math.abs(dailyRealizedPnl + unrealizedPnl).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SUBSECTION B: Products & Tools (Matches Groww Desktop Screenshot 1) */}
              <div style={{
                backgroundColor: '#121516',
                border: '1px solid #202426',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: '#F1F3F4', margin: 0 }}>
                  Products & Tools
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* IPO Row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#151819',
                    border: '1px solid #202426'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#101314', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00D09C' }}>
                        <Zap size={15} />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#F1F3F4' }}>IPO</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(0, 208, 156, 0.12)', color: '#00D09C', border: '1px solid rgba(0, 208, 156, 0.25)' }}>
                      2 open
                    </span>
                  </div>

                  {/* Algo Trading Engine Status Item */}
                  <div
                    onClick={() => setActiveSubTab("config")}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#151819',
                      border: '1px solid #202426',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#151819'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#101314', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isRunning ? '#00D09C' : '#92999C' }}>
                        <Activity size={15} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#F1F3F4' }}>Algo Trading Engine</div>
                        <div style={{ fontSize: '0.70rem', color: isRunning ? '#00D09C' : '#92999C' }}>
                          {isRunning ? "ACTIVE • RUNNING" : "STANDBY"}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#626A6E" />
                  </div>

                  {/* Morning Scanner */}
                  <div
                    onClick={onNavigateToScanner}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#151819',
                      border: '1px solid #202426',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#151819'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#101314', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5367FF' }}>
                        <Zap size={15} />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#F1F3F4' }}>Morning Scanner</span>
                    </div>
                    <ChevronRight size={14} color="#626A6E" />
                  </div>

                  {/* Strategy Studio */}
                  <div
                    onClick={() => onNavigateToBacktest("SBIN.NS")}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#151819',
                      border: '1px solid #202426',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#151819'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#101314', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00D09C' }}>
                        <BarChart2 size={15} />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#F1F3F4' }}>Strategy Studio</span>
                    </div>
                    <ChevronRight size={14} color="#626A6E" />
                  </div>
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
              /* Groww Rocket Empty State for Holdings (Clean, Unboxed) */
              <GrowwRocketEmptyState
                title="No holdings available"
                subtitle="You do not have any open delivery or intraday holdings at this moment."
              />
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Groww Rocket Empty State (Matches Screenshot 2: Clean, unboxed) */}
                <GrowwRocketEmptyState
                  title="No open positions"
                  subtitle="Equity, Intraday and MTF positions will appear here"
                />

                {/* Live Bot Execution Status Card */}
                <div style={{
                  marginTop: '28px',
                  maxWidth: '560px',
                  width: '100%',
                  backgroundColor: '#151819',
                  border: '1px solid #252A2C',
                  borderRadius: '14px',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: bot.status?.includes("ACTIVE") ? '#00D09C' : '#EB5B3C',
                        boxShadow: bot.status?.includes("ACTIVE") ? '0 0 8px #00D09C' : 'none'
                      }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>
                        Live Bot: {bot.status || "ACTIVE (MONITORING)"}
                      </span>
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 208, 156, 0.1)',
                      color: '#00D09C',
                      fontSize: '0.72rem',
                      fontWeight: '700'
                    }}>
                      {botData?.is_market_open ? "🟢 NSE MARKET LIVE" : "MARKET CLOSED"}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', paddingTop: '10px', borderTop: '1px solid #252A2C' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Active Stock</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>{bot.symbol || symbol}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Live LTP</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }} className="font-tabular">
                        {currency}{Number(currentLtp).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Strategy</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {bot.strategy || strategy}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    fontSize: '0.78rem',
                    color: '#92999C',
                    backgroundColor: '#101314',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚡</span>
                    <span>
                      {bot.status?.includes("PAUSED")
                        ? "Bot is currently PAUSED. Click 'Arm & Apply' in Explore to engage live signals."
                        : "Actively scanning 5m candles. When price breaks out beyond the opening range, the order executes automatically and live P&L tracks here."}
                    </span>
                  </div>
                </div>
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
            VIEW 4: ORDERS (EXECUTION MONITOR & COMPLETED TRADES)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "orders" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* View Mode Switcher Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#101314',
              padding: '6px 12px',
              borderRadius: '12px',
              border: '1px solid #202426'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setOrdersViewMode("monitor")}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    backgroundColor: ordersViewMode === "monitor" ? '#00D09C' : 'transparent',
                    color: ordersViewMode === "monitor" ? '#080A0B' : '#92999C',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Activity size={14} />
                  Execution Monitor (OMS)
                </button>
                <button
                  onClick={() => setOrdersViewMode("history")}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    backgroundColor: ordersViewMode === "history" ? '#00D09C' : 'transparent',
                    color: ordersViewMode === "history" ? '#080A0B' : '#92999C',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={14} />
                  Completed Trades & FIFO Ledger
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>
                {ordersViewMode === "monitor" ? "Real-time Order Lifecycle & Fills" : "Audited FIFO Round-Trip Accounting"}
              </div>
            </div>

            {/* Sub-view 1: Execution Monitor */}
            {ordersViewMode === "monitor" && (
              <ExecutionMonitorView currency={currency} />
            )}

            {/* Sub-view 2: Completed Trades & FIFO Ledger */}
            {ordersViewMode === "history" && (
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

            {/* Orders List or Rocket Empty State (Matches Screenshot 3: Clean, unboxed) */}
            {filteredTrades.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <GrowwRocketEmptyState
                  title="You don't have any open orders"
                  subtitle={orderSessionFilter === "TODAY" ? "No trades executed today yet. Orders placed today will appear here." : "No orders found."}
                />
                {orderSessionFilter === "TODAY" && allBotFills.length > 0 && (
                  <button
                    onClick={() => setOrderSessionFilter("ALL")}
                    style={{
                      marginTop: '16px',
                      padding: '10px 22px',
                      borderRadius: '10px',
                      backgroundColor: '#151819',
                      border: '1px solid #00D09C',
                      color: '#00D09C',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = '#00D09C';
                      e.currentTarget.style.color = '#080A0B';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = '#151819';
                      e.currentTarget.style.color = '#00D09C';
                    }}
                  >
                    <span>View All Past Executed Orders ({allBotFills.length})</span>
                  </button>
                )}
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
            VIEW 6: AUTOMATION (BOT CONFIG & RULES)
            ═══════════════════════════════════════════════════════════════════ */}
        {(activeSubTab === "automation" || activeSubTab === "config") && (
          <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Daily Drawdown Hard Lock Banner */}
            {bot.daily_drawdown_locked && (
              <div style={{
                backgroundColor: 'rgba(235, 91, 60, 0.12)',
                border: '1px solid #EB5B3C',
                borderRadius: '16px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 8px 32px rgba(235, 91, 60, 0.15)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(235, 91, 60, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#EB5B3C'
                  }}>
                    <Lock size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: '#EB5B3C' }}>
                      HARD CIRCUIT BREAKER ACTIVE — EXECUTION LOCKED
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#F1F3F4', marginTop: '3px' }}>
                      {bot.daily_drawdown_lock_reason || "Daily net loss limit hit. Position liquidated; engine locked until next NSE trading session."}
                    </div>
                    {bot.daily_drawdown_locked_at && (
                      <div style={{ fontSize: '0.75rem', color: '#B2B9BC', marginTop: '2px' }}>
                        Triggered at: {bot.daily_drawdown_locked_at} (Survives server restarts)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message Alert */}
            {configErrorMsg && (
              <div style={{
                backgroundColor: 'rgba(235, 91, 60, 0.12)',
                border: '1px solid #EB5B3C',
                borderRadius: '12px',
                padding: '14px 20px',
                color: '#EB5B3C',
                fontWeight: '700',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <AlertTriangle size={18} />
                <span style={{ flex: 1 }}>{configErrorMsg}</span>
                <button
                  type="button"
                  onClick={() => setConfigErrorMsg("")}
                  style={{ background: 'none', border: 'none', color: '#EB5B3C', cursor: 'pointer', padding: 0 }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Success Message Alert */}
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

            {/* Main Configuration Card */}
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
                    Configure the trading instrument, strategy rules, risk parameters, and execution controls
                  </p>
                </div>

                <div style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  backgroundColor: bot.daily_drawdown_locked
                    ? 'rgba(235, 91, 60, 0.15)'
                    : isRunning
                    ? 'rgba(0, 208, 156, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${bot.daily_drawdown_locked ? '#EB5B3C' : isRunning ? '#00D09C' : '#F59E0B'}`,
                  color: bot.daily_drawdown_locked ? '#EB5B3C' : isRunning ? '#00D09C' : '#F59E0B',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {bot.daily_drawdown_locked && <Lock size={12} />}
                  <span>{bot.daily_drawdown_locked ? "CIRCUIT BREAKER LOCKED" : (bot.status || "STANDBY")}</span>
                </div>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                {/* 1. Instrument Picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                    Trading Instrument (NSE Blue-Chip)
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
                    <option value="SBIN.NS">SBIN.NS — State Bank of India</option>
                    <option value="RELIANCE.NS">RELIANCE.NS — Reliance Industries</option>
                    <option value="HDFCBANK.NS">HDFCBANK.NS — HDFC Bank Ltd</option>
                    <option value="ICICIBANK.NS">ICICIBANK.NS — ICICI Bank Ltd</option>
                    <option value="TATAMOTORS.NS">TATAMOTORS.NS — Tata Motors Ltd</option>
                    <option value="TCS.NS">TCS.NS — Tata Consultancy Services</option>
                    <option value="INFY.NS">INFY.NS — Infosys Ltd</option>
                    <option value="BHARTIARTL.NS">BHARTIARTL.NS — Bharti Airtel Ltd</option>
                    <option value="LT.NS">LT.NS — Larsen & Toubro</option>
                    <option value="AXISBANK.NS">AXISBANK.NS — Axis Bank Ltd</option>
                    <option value="KOTAKBANK.NS">KOTAKBANK.NS — Kotak Mahindra Bank</option>
                    <option value="ITC.NS">ITC.NS — ITC Ltd</option>
                    <option value="HINDUNILVR.NS">HINDUNILVR.NS — Hindustan Unilever</option>
                    <option value="BAJFINANCE.NS">BAJFINANCE.NS — Bajaj Finance Ltd</option>
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

                {/* 3. Execution Timeframe */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                    Bar Timeframe
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {["1m", "2m", "5m", "15m", "30m"].map(tf => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => {
                          userSelectedTimeframeRef.current = true;
                          setTimeframe(tf);
                        }}
                        style={{
                          flex: 1,
                          minWidth: '50px',
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: timeframe === tf ? '#00D09C' : '#252A2C',
                          backgroundColor: timeframe === tf ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: timeframe === tf ? '#00D09C' : '#F1F3F4',
                          fontWeight: '700',
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Virtual Capital Allocation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                      Virtual Capital Allocation (₹10k – ₹10Cr)
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#00D09C', fontWeight: '700' }} className="font-tabular">
                      ₹{Number(capitalAllocation || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="10000"
                    max="100000000"
                    step="50000"
                    value={capitalAllocation}
                    onChange={(e) => {
                      userSelectedCapitalRef.current = true;
                      setCapitalAllocation(parseFloat(e.target.value) || 0);
                    }}
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
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {[
                      { label: "1L", val: 100000 },
                      { label: "5L", val: 500000 },
                      { label: "10L", val: 1000000 },
                      { label: "25L", val: 2500000 },
                      { label: "50L", val: 5000000 },
                      { label: "1Cr", val: 10000000 }
                    ].map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          userSelectedCapitalRef.current = true;
                          setCapitalAllocation(chip.val);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: capitalAllocation === chip.val ? '#00D09C' : '#252A2C',
                          backgroundColor: capitalAllocation === chip.val ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: capitalAllocation === chip.val ? '#00D09C' : '#92999C',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Stop-Loss Percentage */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                      Stop-Loss % (0.1% – 10.0%)
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#EB5B3C', fontWeight: '700' }}>
                      {stopLossPct}%
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0.1"
                    max="10.0"
                    step="0.1"
                    value={stopLossPct}
                    onChange={(e) => {
                      userSelectedSlRef.current = true;
                      setStopLossPct(parseFloat(e.target.value) || 0);
                    }}
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
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[0.5, 0.8, 1.0, 1.5, 2.0].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          userSelectedSlRef.current = true;
                          setStopLossPct(val);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: stopLossPct === val ? '#00D09C' : '#252A2C',
                          backgroundColor: stopLossPct === val ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: stopLossPct === val ? '#00D09C' : '#92999C',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {val}%{val === 0.8 ? " (Default)" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Take-Profit Multiple (R:R) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                      Take-Profit Multiple (0.5R – 10.0R)
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#00D09C', fontWeight: '700' }}>
                      {takeProfitMultiple}R
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0.5"
                    max="10.0"
                    step="0.5"
                    value={takeProfitMultiple}
                    onChange={(e) => {
                      userSelectedTpRef.current = true;
                      setTakeProfitMultiple(parseFloat(e.target.value) || 0);
                    }}
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
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[1.5, 2.0, 2.5, 3.0].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          userSelectedTpRef.current = true;
                          setTakeProfitMultiple(val);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: takeProfitMultiple === val ? '#00D09C' : '#252A2C',
                          backgroundColor: takeProfitMultiple === val ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: takeProfitMultiple === val ? '#00D09C' : '#92999C',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {val}R{val === 2.0 ? " (Default)" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7. Max Daily Drawdown % (Hard Circuit Breaker) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#EB5B3C' }}>
                      Max Daily Drawdown % (Circuit Breaker)
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#EB5B3C', fontWeight: '700' }}>
                      {maxDrawdownPct}% (₹{((capitalAllocation || 1000000) * (maxDrawdownPct / 100)).toLocaleString('en-IN')})
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0.5"
                    max="20.0"
                    step="0.5"
                    value={maxDrawdownPct}
                    onChange={(e) => {
                      userSelectedDdRef.current = true;
                      setMaxDrawdownPct(parseFloat(e.target.value) || 0);
                    }}
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
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[1.0, 1.5, 2.0, 3.0, 5.0].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          userSelectedDdRef.current = true;
                          setMaxDrawdownPct(val);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: maxDrawdownPct === val ? '#EB5B3C' : '#252A2C',
                          backgroundColor: maxDrawdownPct === val ? 'rgba(235, 91, 60, 0.12)' : '#080A0B',
                          color: maxDrawdownPct === val ? '#EB5B3C' : '#92999C',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {val}%{val === 2.0 ? " (Hard Stop)" : ""}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>
                    Enforced at runtime. Liquidates active positions & locks session for today once breached.
                  </span>
                </div>

                {/* 8. Max Trades Per Stock Per Day */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#92999C' }}>
                      Max Trades Per Stock Per Day
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#00D09C' }}>Protects Daily Profits</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { val: 1, label: "1 Trade (Disciplined)" },
                      { val: 2, label: "2 Trades" },
                      { val: 3, label: "3 Trades" },
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
                          minWidth: '80px',
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: maxTradesPerSymbol === opt.val ? '#00D09C' : '#252A2C',
                          backgroundColor: maxTradesPerSymbol === opt.val ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                          color: maxTradesPerSymbol === opt.val ? '#00D09C' : '#F1F3F4',
                          fontWeight: '700',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save & Apply Configuration Bar */}
              <div style={{
                marginTop: '28px',
                paddingTop: '20px',
                borderTop: '1px solid #252A2C',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#92999C' }}>
                  Changes are validated strictly by the FastAPI backend before applying.
                </div>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  style={{
                    padding: '11px 24px',
                    borderRadius: '10px',
                    backgroundColor: '#00D09C',
                    color: '#080A0B',
                    border: 'none',
                    fontSize: '0.88rem',
                    fontWeight: '800',
                    cursor: configSaving ? 'not-allowed' : 'pointer',
                    opacity: configSaving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(0, 208, 156, 0.25)'
                  }}
                >
                  {configSaving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>{configSaving ? "Applying Configuration..." : "Save & Apply Configuration"}</span>
                </button>
              </div>

              {/* Bot Action Buttons — Note: Single Play/Pause Button as Requested */}
              <div style={{
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '1px solid #202426',
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
                    disabled={actionLoading || (!isRunning && bot.daily_drawdown_locked)}
                    title={bot.daily_drawdown_locked ? "Locked: Daily Drawdown Limit Reached" : (isRunning ? "Pause Bot" : "Start Bot")}
                    className={isRunning ? "btn-groww-pause" : "btn-groww-primary"}
                    style={{
                      padding: '12px 28px',
                      fontSize: '0.9rem',
                      fontWeight: '800',
                      opacity: (!isRunning && bot.daily_drawdown_locked) ? 0.6 : 1,
                      cursor: (!isRunning && bot.daily_drawdown_locked) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isRunning ? (
                      <>
                        <Pause size={17} />
                        <span>Pause Bot ({symbol})</span>
                      </>
                    ) : (
                      <>
                        {bot.daily_drawdown_locked ? <Lock size={17} color="#EB5B3C" /> : <Play size={17} fill="#080A0B" />}
                        <span>{bot.daily_drawdown_locked ? "Circuit Locked" : `Start Bot (${symbol})`}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Right: Reset & Square Off All Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleControl("RESET")}
                    disabled={actionLoading || bot.in_position || bot.daily_drawdown_locked}
                    title={
                      bot.daily_drawdown_locked
                        ? "Cannot reset quota during active circuit breaker lock"
                        : bot.in_position
                        ? "Square off active position first before resetting"
                        : "Reset Today's Trade Counter & State"
                    }
                    className="btn-groww-secondary"
                    style={{
                      opacity: (bot.in_position || bot.daily_drawdown_locked) ? 0.5 : 1,
                      cursor: (bot.in_position || bot.daily_drawdown_locked) ? 'not-allowed' : 'pointer'
                    }}
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

            {/* Dynamic Institutional Risk Parameters Box */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00D09C', fontWeight: '700' }}>
                  <ShieldCheck size={18} />
                  <span>SEBI & Institutional Risk Guardrails (Live Engine Telemetry)</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#626A6E' }}>
                  Calculated dynamically from multi-leg FIFO trade ledger
                </div>
              </div>

              {(() => {
                const risk = botData?.risk_metrics || {
                  starting_daily_equity: capitalAllocation || 1000000.0,
                  current_equity: capitalAllocation || 1000000.0,
                  daily_realized_pnl: 0.0,
                  unrealized_pnl: 0.0,
                  daily_net_pnl: 0.0,
                  daily_charges: 0.0,
                  max_daily_loss: (capitalAllocation || 1000000.0) * (maxDrawdownPct / 100),
                  remaining_daily_risk: (capitalAllocation || 1000000.0) * (maxDrawdownPct / 100),
                  risk_consumed_pct: 0.0,
                  circuit_breaker_triggered: false,
                  max_drawdown_pct: maxDrawdownPct
                };
                const isTriggered = risk.circuit_breaker_triggered || bot.daily_drawdown_locked;
                const pnlPositive = (risk.daily_net_pnl || 0) >= 0;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginTop: '8px' }}>
                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Day Starting Baseline</div>
                      <div style={{ color: '#F1F3F4', fontWeight: '700', marginTop: '4px', fontSize: '0.92rem' }} className="font-tabular">
                        ₹{Number(risk.starting_daily_equity || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Daily Net P&L (Post-Fees)</div>
                      <div style={{
                        color: pnlPositive ? '#00D09C' : '#EB5B3C',
                        fontWeight: '700',
                        marginTop: '4px',
                        fontSize: '0.92rem'
                      }} className="font-tabular">
                        {pnlPositive ? '+' : ''}₹{Number(risk.daily_net_pnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Max Daily Loss Limit</div>
                      <div style={{ color: '#EB5B3C', fontWeight: '700', marginTop: '4px', fontSize: '0.92rem' }} className="font-tabular">
                        -₹{Number(risk.max_daily_loss || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({risk.max_drawdown_pct}%)
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Remaining Risk Buffer</div>
                      <div style={{
                        color: (risk.remaining_daily_risk || 0) <= 0 ? '#EB5B3C' : '#00D09C',
                        fontWeight: '700',
                        marginTop: '4px',
                        fontSize: '0.92rem'
                      }} className="font-tabular">
                        ₹{Number(Math.max(0, risk.remaining_daily_risk || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Intraday Margin Multiplier</div>
                      <div style={{ color: '#00D09C', fontWeight: '700', marginTop: '4px', fontSize: '0.92rem' }}>
                        5x MIS (SEBI Peak Margin)
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', backgroundColor: '#080A0B', borderRadius: '10px', border: '1px solid #252A2C' }}>
                      <div style={{ color: '#626A6E', fontSize: '0.72rem', fontWeight: '600' }}>Circuit Breaker Guard</div>
                      <div style={{
                        color: isTriggered ? '#EB5B3C' : '#00D09C',
                        fontWeight: '800',
                        marginTop: '4px',
                        fontSize: '0.92rem'
                      }}>
                        {isTriggered ? "TRIGGERED & LOCKED" : "NORMAL (ACTIVE)"}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            VIEW 7: QUANT LAB (STUDIO, SCANNER, MATRIX, JOURNAL)
            ═══════════════════════════════════════════════════════════════════ */}
        {activeSubTab === "quant" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Quant Lab Sub-Tool Switcher */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#121517',
              border: '1px solid #202426',
              borderRadius: '14px',
              padding: '6px 10px',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: "scanner", label: "⚡ Morning Scanner", desc: "09:16 AM Momentum & Breakouts" },
                  { id: "studio", label: "📊 Strategy Studio", desc: "Algorithmic Simulation & Optimization" },
                  { id: "matrix", label: "🔬 Factor Matrix", desc: "Cross-Sectional Combinatorial Grid" },
                  { id: "journal", label: "📜 Trade Journal", desc: "Audited Round-Trip Ledger & MTM" }
                ].map(tool => {
                  const isToolActive = quantSubTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => setQuantSubTool(tool.id)}
                      title={tool.desc}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: isToolActive ? '1px solid #00D09C' : '1px solid transparent',
                        backgroundColor: isToolActive ? 'rgba(0, 208, 156, 0.12)' : 'transparent',
                        color: isToolActive ? '#00D09C' : '#92999C',
                        fontWeight: isToolActive ? '800' : '600',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={e => {
                        if (!isToolActive) e.currentTarget.style.color = '#F1F3F4';
                      }}
                      onMouseLeave={e => {
                        if (!isToolActive) e.currentTarget.style.color = '#92999C';
                      }}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>

              <span style={{ fontSize: '0.74rem', color: '#626A6E', paddingRight: '8px' }}>
                Quantitative Research & Market Intelligence Suite
              </span>
            </div>

            {/* Sub-tool 1: Morning Scanner */}
            {quantSubTool === "scanner" && (
              <MorningScannerView
                onSelectForBacktest={(sym, strat) => {
                  if (sym) {
                    setSymbol(sym);
                    setQuantSymbol(sym);
                    setQuantCustomSymbol("");
                  }
                  if (strat) {
                    setStrategy(strat);
                    setQuantStrategy(strat);
                  }
                  setQuantSubTool("studio");
                  if (onNavigateToBacktest) onNavigateToBacktest(sym);
                  handleRunQuantBacktest(sym);
                }}
                onSelectForBot={(sym) => {
                  if (sym) setSymbol(sym);
                  setActiveSubTab("automation");
                }}
                currency={currency}
              />
            )}

            {/* Sub-tool 2: Strategy Studio */}
            {quantSubTool === "studio" && (
              <div style={{ minHeight: '680px', display: 'flex' }}>
                <BacktesterView
                  marketDefs={marketDefs}
                  strategiesList={strategiesList}
                  selectedMarket={quantMarket}
                  setSelectedMarket={handleQuantMarketChange}
                  symbol={quantSymbol}
                  setSymbol={setQuantSymbol}
                  customSymbol={quantCustomSymbol}
                  setCustomSymbol={setQuantCustomSymbol}
                  interval={quantInterval}
                  setInterval={setQuantInterval}
                  lookbackDays={quantLookbackDays}
                  setLookbackDays={setQuantLookbackDays}
                  capitalInput={quantCapitalInput}
                  setCapitalInput={setQuantCapitalInput}
                  initialCapital={quantInitialCapital}
                  selectedStrategy={quantStrategy}
                  setSelectedStrategy={setQuantStrategy}
                  loading={quantLoading}
                  backtestResult={quantBacktestResult}
                  errorMsg={quantErrorMsg}
                  onRunBacktest={() => handleRunQuantBacktest()}
                />
              </div>
            )}

            {/* Sub-tool 3: Factor Matrix */}
            {quantSubTool === "matrix" && (
              <FactorMatrixView
                onSelectCombination={(combo) => {
                  if (combo.asset) {
                    setSymbol(combo.asset);
                    setQuantSymbol(combo.asset);
                    setQuantCustomSymbol("");
                  }
                  if (combo.strategy) {
                    setStrategy(combo.strategy);
                    setQuantStrategy(combo.strategy);
                  }
                  if (combo.timeframe) {
                    setTimeframe(combo.timeframe);
                    setQuantInterval(combo.timeframe);
                  }
                  setQuantSubTool("studio");
                }}
                currency={currency}
              />
            )}

            {/* Sub-tool 4: Trade Journal */}
            {quantSubTool === "journal" && (() => {
              const backtestTrades = quantBacktestResult?.trades || backtestResult?.trades || [];
              const effectiveJournalSource = journalSource === "auto"
                ? (backtestTrades.length > 0 ? "backtest" : "live")
                : journalSource;

              const activeJournalTrades = effectiveJournalSource === "backtest"
                ? backtestTrades
                : adaptedLiveRoundTrips;

              const activeOpenPositions = effectiveJournalSource === "live"
                ? openPositionsList
                : [];

              const activeUnmatchedExits = effectiveJournalSource === "live"
                ? unmatchedExitsList
                : [];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Source Switcher Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#121517',
                    border: '1px solid #202426',
                    borderRadius: '14px',
                    padding: '12px 20px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#F1F3F4', margin: 0, letterSpacing: '-0.01em' }}>
                        Institutional Trade Journal & Ledger
                      </h3>
                      <p style={{ fontSize: '0.74rem', color: '#92999C', margin: '2px 0 0 0' }}>
                        Reconciled multi-leg execution ledger matched with regulatory fee schedules
                      </p>
                    </div>

                    {/* Source Switcher Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: '#080A0B',
                      padding: '3px',
                      borderRadius: '10px',
                      border: '1px solid #202426',
                      gap: '4px'
                    }}>
                      <button
                        onClick={() => setJournalSource("live")}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: effectiveJournalSource === "live" ? '700' : '500',
                          backgroundColor: effectiveJournalSource === "live" ? '#00D09C' : 'transparent',
                          color: effectiveJournalSource === "live" ? '#080A0B' : '#92999C',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        🔴 Live Bot Ledger ({adaptedLiveRoundTrips.length})
                      </button>
                      <button
                        onClick={() => setJournalSource("backtest")}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: effectiveJournalSource === "backtest" ? '700' : '500',
                          backgroundColor: effectiveJournalSource === "backtest" ? '#00D09C' : 'transparent',
                          color: effectiveJournalSource === "backtest" ? '#080A0B' : '#92999C',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        🧪 Strategy Backtest ({backtestTrades.length})
                      </button>
                    </div>
                  </div>

                  <TradeJournal
                    trades={activeJournalTrades}
                    openPositions={activeOpenPositions}
                    unmatchedExits={activeUnmatchedExits}
                    currency={currency}
                  />
                </div>
              );
            })()}
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

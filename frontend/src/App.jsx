import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Search,
  Bell,
  ChevronDown,
  Sparkles,
  Layers,
  BarChart2,
  Zap,
  FileText,
  ShieldCheck,
  Activity
} from 'lucide-react';

import LiveBotDashboard from './components/LiveBotDashboard';
import BacktesterView from './components/BacktesterView';
import FactorMatrixView from './components/FactorMatrixView';
import MorningScannerView from './components/MorningScannerView';
import TelegramModal from './components/TelegramModal';
import TradeJournal from './components/TradeJournal';
import GrowwUserProfileDropdown from './components/GrowwUserProfileDropdown';

export default function App() {
  // Clear any legacy terminal edition from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem("terminal_edition");
    } catch (e) {}
  }, []);

  // Primary Groww navigation category: "stocks", "fno", "mutual_funds", "backtester", "scanner", "matrix", "risk"
  const [activeCategory, setActiveCategory] = useState("stocks");
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isQuantDropdownOpen, setIsQuantDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Market & API definitions
  const [marketDefs, setMarketDefs] = useState(null);
  const [strategiesList, setStrategiesList] = useState([]);

  // Form selections for Backtester
  const [selectedMarket, setSelectedMarket] = useState("INDIA");
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [customSymbol, setCustomSymbol] = useState("");
  const [interval, setInterval] = useState("5m");
  const [lookbackDays, setLookbackDays] = useState(60);
  const [capitalInput, setCapitalInput] = useState("10L");
  const [initialCapital, setInitialCapital] = useState(1000000.0);
  const [selectedStrategy, setSelectedStrategy] = useState("NSE Intraday ORB Breakout");

  // Backtest execution state
  const [loading, setLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Fetch market definitions and strategies on mount
  useEffect(() => {
    const initData = async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          fetch('/api/markets'),
          fetch('/api/strategies')
        ]);
        if (mRes.ok) setMarketDefs(await mRes.json());
        if (sRes.ok) setStrategiesList(await sRes.json());
      } catch (err) {
        console.error("Failed to initialize:", err);
      }
    };
    initData();
  }, []);

  // Parse starting capital dynamically
  useEffect(() => {
    const raw = capitalInput.trim().toLowerCase().replace(/,/g, '').replace(/[₹$]/g, '');
    let parsed = selectedMarket === "INDIA" ? 1000000.0 : 100000.0;

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
      if (!isNaN(v)) parsed = v * 100000.0;
    } else {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) parsed = v;
    }
    setInitialCapital(parsed);
  }, [capitalInput, selectedMarket]);

  // Handle market change
  const handleMarketChange = (m) => {
    setSelectedMarket(m);
    if (m === "INDIA") {
      setSymbol("SBIN.NS");
      setCapitalInput("10L");
      setInterval("5m");
      setLookbackDays(60);
      setSelectedStrategy("NSE Intraday ORB Breakout");
    } else if (m === "US") {
      setSymbol("AAPL");
      setCapitalInput("100k");
      setInterval("1d");
      setLookbackDays(365);
      setSelectedStrategy("SMA Crossover");
    } else if (m === "FOREX") {
      setSymbol("EUR/USD");
      setCapitalInput("100k");
      setInterval("1h");
      setLookbackDays(60);
      setSelectedStrategy("London Handoff Momentum");
    }
  };

  // Run Backtest action
  const runBacktest = async (targetSym) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: selectedMarket,
          symbol: targetSym || customSymbol.trim() || symbol,
          interval,
          lookback_days: Number(lookbackDays),
          initial_capital: initialCapital,
          strategy_name: selectedStrategy
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Backtest execution failed");
      }

      const data = await res.json();
      setBacktestResult(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (strategiesList.length > 0 && !backtestResult) {
      runBacktest();
    }
  }, [strategiesList]);

  const currentMarketDef = marketDefs?.markets.find(m => m.id === selectedMarket);
  const currency = currentMarketDef?.currency || (selectedMarket === "INDIA" ? "₹" : "$");

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#080A0B',
      color: '#F1F3F4',
      fontFamily: "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>

      {/* ── ROW 1: Persistent Groww Header Navigation (Matches Groww Desktop) ── */}
      <header style={{
        height: '68px',
        backgroundColor: '#080A0B',
        borderBottom: '1px solid #202426',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        gap: '28px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        {/* Left: Groww Brand Emblem + Primary Trading Categories (Matches Screenshot 1 & 5) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {/* Groww Iconic Circular Emblem */}
          <div
            onClick={() => setActiveCategory("stocks")}
            title="Groww Home"
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
          >
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <defs>
                <linearGradient id="growwGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00D09C" />
                  <stop offset="100%" stopColor="#00B5EC" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="20" r="19" fill="url(#growwGrad)" />
              {/* Groww dynamic diagonal slash */}
              <path d="M12 26L28 14M28 14H18M28 14V24" stroke="#080A0B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Primary Navigation Links (Matches Screenshot 1 & 5: Clean text, NO green pills!) */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {[
              { id: "stocks", label: "Stocks" },
              { id: "fno", label: "F&O" },
              { id: "mutual_funds", label: "Mutual Funds" }
            ].map(tab => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  style={{
                    padding: '8px 0',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isActive ? '#FFFFFF' : '#92999C',
                    fontSize: '1rem',
                    fontWeight: isActive ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                    letterSpacing: '-0.01em'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#92999C';
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            {/* Quant Tools Dropdown (Preserving Backtester, Scanner, Factor Matrix) */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsQuantDropdownOpen(!isQuantDropdownOpen)}
                style={{
                  padding: '8px 0',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: ['scanner', 'backtester', 'matrix', 'journal', 'risk'].includes(activeCategory) ? '#FFFFFF' : '#92999C',
                  fontSize: '1rem',
                  fontWeight: ['scanner', 'backtester', 'matrix', 'journal', 'risk'].includes(activeCategory) ? '700' : '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color 0.15s ease',
                  letterSpacing: '-0.01em'
                }}
                onMouseEnter={(e) => {
                  if (!['scanner', 'backtester', 'matrix', 'journal', 'risk'].includes(activeCategory)) {
                    e.currentTarget.style.color = '#FFFFFF';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!['scanner', 'backtester', 'matrix', 'journal', 'risk'].includes(activeCategory)) {
                    e.currentTarget.style.color = '#92999C';
                  }
                }}
              >
                <span>Quant Lab</span>
                <ChevronDown size={14} />
              </button>

              {isQuantDropdownOpen && (
                <>
                  <div
                    onClick={() => setIsQuantDropdownOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '46px',
                    left: 0,
                    width: '230px',
                    backgroundColor: '#151819',
                    border: '1px solid #252A2C',
                    borderRadius: '12px',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                    padding: '6px',
                    zIndex: 999,
                    animation: 'fadeIn 0.15s ease-out'
                  }}>
                    {[
                      { id: "scanner", label: "⚡ Morning Scanner", icon: Zap },
                      { id: "backtester", label: "📊 Strategy Studio", icon: BarChart2 },
                      { id: "matrix", label: "🔬 Factor Matrix", icon: Layers },
                      { id: "journal", label: "📜 Trade Journal", icon: FileText },
                      { id: "risk", label: "🛡️ Risk Controls", icon: ShieldCheck }
                    ].map(item => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setActiveCategory(item.id);
                            setIsQuantDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: activeCategory === item.id ? '#00D09C' : '#F1F3F4',
                            backgroundColor: activeCategory === item.id ? 'rgba(0, 208, 156, 0.12)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            if (activeCategory !== item.id) e.currentTarget.style.backgroundColor = '#1c2022';
                          }}
                          onMouseLeave={e => {
                            if (activeCategory !== item.id) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <Icon size={16} color={activeCategory === item.id ? "#00D09C" : "#92999C"} />
                          <span>{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>

        {/* Center: Universal Search Bar (Matches Groww: "Search Groww.... Ctrl+K") */}
        <div style={{ flex: 1, maxWidth: '440px', position: 'relative' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '24px',
            padding: '8px 16px',
            gap: '10px',
            transition: 'border-color 0.2s ease'
          }}>
            <Search size={16} color="#92999C" />
            <input
              type="text"
              placeholder="Search Groww... (e.g. SBIN, ORB, Reliance)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#F1F3F4',
                fontSize: '0.85rem'
              }}
            />
            <span style={{
              fontSize: '0.7rem',
              color: '#626A6E',
              backgroundColor: '#101314',
              padding: '2px 6px',
              borderRadius: '6px',
              fontWeight: '600'
            }}>
              Ctrl+K
            </span>
          </div>
        </div>

        {/* Right: Quick Tools, Telegram Bell, User Profile Avatar (Matches Screenshot 1 & 4) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
          {/* Quick Scanner Pulse Trigger */}
          <button
            onClick={() => setActiveCategory(activeCategory === "scanner" ? "stocks" : "scanner")}
            title="Quick Scanner Pulse"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#92999C',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
            onMouseLeave={e => e.currentTarget.style.color = '#92999C'}
          >
            <Activity size={19} />
          </button>

          {/* Telegram Alerts Trigger */}
          <button
            onClick={() => setIsTelegramOpen(true)}
            title="Configure Telegram Mobile Notifications"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#92999C',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
            onMouseLeave={e => e.currentTarget.style.color = '#92999C'}
          >
            <Bell size={19} />
          </button>

          {/* User Profile Avatar with dropdown trigger (Matches Groww Screenshot 4) */}
          <div
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            title="Naitik Seth • Groww Account"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#1E2328',
              border: '1.5px solid #363C40',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              color: '#F1F3F4',
              fontSize: '0.88rem',
              cursor: 'pointer',
              position: 'relative',
              transition: 'transform 0.15s ease, border-color 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.borderColor = '#00D09C';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1.0)';
              e.currentTarget.style.borderColor = '#363C40';
            }}
          >
            N
          </div>

          {/* Groww User Profile Dropdown */}
          <GrowwUserProfileDropdown
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            userName="Naitik Seth"
            userEmail="sethnaitikgg77@gmail.com"
            balance={1000000.0}
            onNavigateToOrders={() => {
              setActiveCategory("stocks");
              setIsProfileOpen(false);
            }}
            onOpenSettings={() => {
              setActiveCategory("risk");
              setIsProfileOpen(false);
            }}
          />
        </div>
      </header>

      {/* ── Main View Switcher ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* VIEW: STOCKS (Live Paper Bot & Groww Explore / Positions / Orders / Watchlist) */}
        {(activeCategory === "stocks" || activeCategory === "fno" || activeCategory === "mutual_funds") && (
          <LiveBotDashboard
            market={selectedMarket}
            currency={currency}
            onNavigateToBacktest={(sym) => {
              if (sym) setSymbol(sym);
              setActiveCategory("backtester");
              setTimeout(() => runBacktest(sym), 100);
            }}
            onNavigateToScanner={() => setActiveCategory("scanner")}
            onNavigateToMatrix={() => setActiveCategory("matrix")}
          />
        )}

        {/* VIEW: STRATEGY STUDIO BACKTESTER */}
        {activeCategory === "backtester" && (
          <BacktesterView
            marketDefs={marketDefs}
            strategiesList={strategiesList}
            selectedMarket={selectedMarket}
            setSelectedMarket={handleMarketChange}
            symbol={symbol}
            setSymbol={setSymbol}
            customSymbol={customSymbol}
            setCustomSymbol={setCustomSymbol}
            interval={interval}
            setInterval={setInterval}
            lookbackDays={lookbackDays}
            setLookbackDays={setLookbackDays}
            capitalInput={capitalInput}
            setCapitalInput={setCapitalInput}
            initialCapital={initialCapital}
            selectedStrategy={selectedStrategy}
            setSelectedStrategy={setSelectedStrategy}
            loading={loading}
            backtestResult={backtestResult}
            errorMsg={errorMsg}
            onRunBacktest={() => runBacktest()}
          />
        )}

        {/* VIEW: MORNING SCANNER */}
        {activeCategory === "scanner" && (
          <MorningScannerView
            onSelectForBacktest={(sym, strat) => {
              setSymbol(sym);
              if (strat) setSelectedStrategy(strat);
              setActiveCategory("backtester");
              setTimeout(() => runBacktest(sym), 100);
            }}
            onSelectForBot={(sym) => {
              setSymbol(sym);
              setActiveCategory("stocks");
            }}
            currency={currency}
          />
        )}

        {/* VIEW: FACTOR MATRIX */}
        {activeCategory === "matrix" && (
          <FactorMatrixView
            onSelectCombination={(combo) => {
              setSymbol(combo.asset);
              setSelectedStrategy(combo.strategy);
              setInterval(combo.timeframe);
              setActiveCategory("backtester");
              setTimeout(() => runBacktest(combo.asset), 100);
            }}
            currency={currency}
          />
        )}

        {/* VIEW: TRADE JOURNAL */}
        {activeCategory === "journal" && (
          <div style={{ padding: '28px 32px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
            <TradeJournal
              trades={backtestResult?.trades || []}
              currency={currency}
            />
          </div>
        )}

        {/* VIEW: RISK GUARDRAILS */}
        {activeCategory === "risk" && (
          <div style={{ padding: '36px', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
            <div style={{
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <ShieldCheck size={24} color="#00D09C" />
                <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                  Institutional Risk Controls & SEBI Compliance
                </h2>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#92999C', marginBottom: '24px' }}>
                Automated circuit breakers, intraday MIS margin limits, and mandatory square-off rules enforcing strict capital preservation.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#080A0B', borderRadius: '12px', border: '1px solid #252A2C' }}>
                  <span style={{ color: '#92999C', fontWeight: '600' }}>3:15 PM Auto Square-Off</span>
                  <span style={{ color: '#00D09C', fontWeight: '800' }}>ENABLED (NSE Intraday MIS)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#080A0B', borderRadius: '12px', border: '1px solid #252A2C' }}>
                  <span style={{ color: '#92999C', fontWeight: '600' }}>Max Daily Drawdown Stop</span>
                  <span style={{ color: '#EB5B3C', fontWeight: '800' }}>₹20,000 (2.0% Hard Circuit)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#080A0B', borderRadius: '12px', border: '1px solid #252A2C' }}>
                  <span style={{ color: '#92999C', fontWeight: '600' }}>Peak Margin Leverage</span>
                  <span style={{ color: '#00D09C', fontWeight: '800' }}>5x MIS (SEBI Compliant)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#080A0B', borderRadius: '12px', border: '1px solid #252A2C' }}>
                  <span style={{ color: '#92999C', fontWeight: '600' }}>Survivorship & Calendar Filters</span>
                  <span style={{ color: '#00D09C', fontWeight: '800' }}>Active (F&O Ban / Earnings Filter)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Telegram Push Notification Settings Modal */}
      <TelegramModal
        isOpen={isTelegramOpen}
        onClose={() => setIsTelegramOpen(false)}
      />
    </div>
  );
}

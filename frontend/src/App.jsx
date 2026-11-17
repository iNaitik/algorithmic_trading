import React, { useState, useEffect } from 'react';
import {
  Activity,
  BarChart2,
  Layers,
  FileText,
  ShieldCheck,
  Settings,
  TrendingUp,
  Search,
  Bell,
  Sliders,
  ChevronDown,
  Moon,
  Sparkles
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

  // Primary Groww navigation category
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard", "backtester", "scanner", "matrix", "journal", "risk"
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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
  const runBacktest = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: selectedMarket,
          symbol: customSymbol.trim() || symbol,
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

  // Groww Top Navigation Items
  const growwNavTabs = [
    { id: "dashboard", label: "Stocks", badge: "BOT" },
    { id: "scanner", label: "Morning Scanner", badge: "⚡" },
    { id: "backtester", label: "Backtester", badge: null },
    { id: "matrix", label: "Factor Matrix", badge: null },
    { id: "journal", label: "Trade Journal", badge: null },
    { id: "risk", label: "Risk Guardrails", badge: null }
  ];

  const currentMarketDef = marketDefs?.markets.find(m => m.id === selectedMarket);
  const currency = currentMarketDef?.currency || (selectedMarket === "INDIA" ? "₹" : "$");

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#0c0e14',
      color: '#ffffff',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>

      {/* ── Groww Main Header Bar (Matches Groww Desktop Screenshot 1 & 4) ── */}
      <header style={{
        height: '70px',
        backgroundColor: '#0c0e14',
        borderBottom: '1px solid #1f2430',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        gap: '24px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        {/* Left: Groww Iconic Logo + Category Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Groww Iconic Brand Logo */}
          <div
            onClick={() => setActiveTab("dashboard")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer'
            }}
          >
            {/* Groww Teal Circular Emblem */}
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#00d09c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0, 208, 156, 0.4)'
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#0c0e14" strokeWidth="2.5" />
                <path d="M12 7V12L15.5 14" stroke="#0c0e14" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Groww
            </span>
          </div>

          {/* Primary Nav Category Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {growwNavTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '24px',
                    border: 'none',
                    backgroundColor: isActive ? 'rgba(0, 208, 156, 0.12)' : 'transparent',
                    color: isActive ? '#00d09c' : '#9ca3af',
                    fontSize: '0.9rem',
                    fontWeight: isActive ? '700' : '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '8px',
                      fontSize: '0.68rem',
                      fontWeight: '800',
                      backgroundColor: isActive ? '#00d09c' : '#242938',
                      color: isActive ? '#0c0e14' : '#00d09c'
                    }}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Center: Universal Search Bar (Matches Groww Screenshot: "Search Groww.... Ctrl+K") */}
        <div style={{ flex: 1, maxWidth: '440px', position: 'relative' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#161922',
            border: '1px solid #242938',
            borderRadius: '24px',
            padding: '8px 16px',
            gap: '10px'
          }}>
            <Search size={16} color="#9ca3af" />
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
                color: '#ffffff',
                fontSize: '0.85rem'
              }}
            />
            <span style={{
              fontSize: '0.7rem',
              color: '#6b7280',
              backgroundColor: '#202534',
              padding: '2px 6px',
              borderRadius: '6px',
              fontWeight: '600'
            }}>
              Ctrl+K
            </span>
          </div>
        </div>

        {/* Right: Market Pill, Telegram Modal Button, Notifications & User Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative' }}>
          {/* Market selector pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: '#161922',
            borderRadius: '16px',
            border: '1px solid #242938',
            fontSize: '0.78rem',
            fontWeight: '700',
            color: '#00d09c'
          }}>
            <span>🇮🇳 NSE</span>
          </div>

          {/* Telegram Push Alerts Button */}
          <button
            onClick={() => setIsTelegramOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '20px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00d09c',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: '1px solid rgba(0, 208, 156, 0.3)',
              cursor: 'pointer'
            }}
          >
            📱 Telegram
          </button>

          {/* Notification Bell */}
          <div
            onClick={() => setIsTelegramOpen(true)}
            title="Telegram Alert Settings"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#161922',
              border: '1px solid #242938',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Bell size={16} color="#9ca3af" />
          </div>

          {/* User Profile Avatar with dropdown trigger (Matches Groww Screenshot 4) */}
          <div
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            title="Naitik Seth • Groww Account"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#1c2230',
              border: '2px solid #00d09c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              color: '#00d09c',
              fontSize: '0.9rem',
              cursor: 'pointer',
              position: 'relative'
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
              setActiveTab("dashboard");
              setIsProfileOpen(false);
            }}
            onOpenSettings={() => {
              setActiveTab("risk");
              setIsProfileOpen(false);
            }}
          />
        </div>
      </header>

      {/* ── Main Canvas ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* VIEW 1: DASHBOARD (LIVE PAPER BOT - GROWW THEME) */}
        {activeTab === "dashboard" && (
          <LiveBotDashboard
            market={selectedMarket}
            currency={currency}
            onNavigateToBacktest={() => setActiveTab("backtester")}
          />
        )}

        {/* VIEW 2: STRATEGY BACKTESTER */}
        {activeTab === "backtester" && (
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
            onRunBacktest={runBacktest}
          />
        )}

        {/* VIEW 3: MORNING SCANNER */}
        {activeTab === "scanner" && (
          <MorningScannerView
            onSelectForBacktest={(sym, strat) => {
              setSymbol(sym);
              if (strat) setSelectedStrategy(strat);
              setActiveTab("backtester");
              setTimeout(runBacktest, 100);
            }}
            onSelectForBot={(sym) => {
              setSymbol(sym);
              setActiveTab("dashboard");
            }}
            currency={currency}
          />
        )}

        {/* VIEW 4: FACTOR MATRIX */}
        {activeTab === "matrix" && (
          <FactorMatrixView
            onSelectCombination={(combo) => {
              setSymbol(combo.asset);
              setSelectedStrategy(combo.strategy);
              setInterval(combo.timeframe);
              setActiveTab("backtester");
              setTimeout(runBacktest, 100);
            }}
            currency={currency}
          />
        )}

        {/* VIEW 5: TRADE JOURNAL */}
        {activeTab === "journal" && (
          <div style={{ padding: '28px 36px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
            <TradeJournal
              trades={backtestResult?.trades || []}
              currency={currency}
            />
          </div>
        )}

        {/* VIEW 6: RISK GUARDRAILS */}
        {activeTab === "risk" && (
          <div style={{ padding: '36px', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <ShieldCheck size={24} color="#00d09c" />
                <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                  Institutional Risk Controls & SEBI Compliance
                </h2>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '24px' }}>
                Automated circuit breakers, intraday MIS margin limits, and mandatory square-off rules enforcing strict capital preservation.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#0c0e14', borderRadius: '12px', border: '1px solid #1f2430' }}>
                  <span style={{ color: '#9ca3af', fontWeight: '600' }}>3:15 PM Auto Square-Off</span>
                  <span style={{ color: '#00d09c', fontWeight: '800' }}>ENABLED (NSE Intraday MIS)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#0c0e14', borderRadius: '12px', border: '1px solid #1f2430' }}>
                  <span style={{ color: '#9ca3af', fontWeight: '600' }}>Max Daily Drawdown Stop</span>
                  <span style={{ color: '#eb5b3c', fontWeight: '800' }}>₹20,000 (2.0% Hard Circuit)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#0c0e14', borderRadius: '12px', border: '1px solid #1f2430' }}>
                  <span style={{ color: '#9ca3af', fontWeight: '600' }}>Peak Margin Leverage</span>
                  <span style={{ color: '#00d09c', fontWeight: '800' }}>5x MIS (SEBI Compliant)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#0c0e14', borderRadius: '12px', border: '1px solid #1f2430' }}>
                  <span style={{ color: '#9ca3af', fontWeight: '600' }}>Survivorship & Calendar Filters</span>
                  <span style={{ color: '#00d09c', fontWeight: '800' }}>Active (F&O Ban / Earnings Filter)</span>
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

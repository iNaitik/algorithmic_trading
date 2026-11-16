import React, { useState, useEffect } from 'react';
import {
  Activity,
  BarChart2,
  Layers,
  FileText,
  ShieldCheck,
  Settings,
  HelpCircle,
  TrendingUp,
  Search,
  Bell,
  Calendar,
  Plus
} from 'lucide-react';

import LiveBotDashboard from './components/LiveBotDashboard';
import BacktesterView from './components/BacktesterView';
import FactorMatrixView from './components/FactorMatrixView';
import MorningScannerView from './components/MorningScannerView';
import TelegramModal from './components/TelegramModal';
import TradeJournal from './components/TradeJournal';
import BloombergTerminalApp from './bloomberg/BloombergTerminalApp';

export default function App() {
  // Terminal Edition Mode: 'classic' | 'bloomberg'
  const [terminalMode, setTerminalMode] = useState(() => {
    return localStorage.getItem("terminal_edition") || "classic";
  });

  // Hotkey listener for F12 to switch terminal mode
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        setTerminalMode(prev => {
          const next = prev === "classic" ? "bloomberg" : "classic";
          localStorage.setItem("terminal_edition", next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  // Navigation active tab: 'dashboard', 'backtester', 'matrix', 'journal', 'risk'
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);

  // Global search
  const [searchQuery, setSearchQuery] = useState("");

  // Market & API definitions
  const [marketDefs, setMarketDefs] = useState(null);
  const [strategiesList, setStrategiesList] = useState([]);

  // Form selections for Backtester
  const [selectedMarket, setSelectedMarket] = useState("INDIA");
  const [symbol, setSymbol] = useState("RELIANCE.NS");
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
      if (!isNaN(v)) parsed = v * 1000000.0;
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
      setSymbol("RELIANCE.NS");
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

  // Quixotic Top Navigation Pills
  const topNavTabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "backtester", label: "Strategy Backtester" },
    { id: "matrix", label: "Factor Matrix" },
    { id: "scanner", label: "⚡ Morning Scanner" },
    { id: "journal", label: "Trade Journal" },
    { id: "risk", label: "Risk Guardrails" }
  ];

  const currentMarketDef = marketDefs?.markets.find(m => m.id === selectedMarket);
  const currency = currentMarketDef?.currency || (selectedMarket === "INDIA" ? "₹" : "$");

  // Render Bloomberg Terminal if selected
  if (terminalMode === "bloomberg") {
    return (
      <BloombergTerminalApp
        onSwitchToClassic={() => {
          setTerminalMode("classic");
          localStorage.setItem("terminal_edition", "classic");
        }}
        initialTab={activeTab === "backtester" ? "backtest" : (activeTab === "scanner" ? "scanner" : (activeTab === "matrix" ? "matrix" : "bot"))}
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f2f4f7', color: '#111827', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* ── Left Slim Floating Icon Rail (Matches Quixotic Left Rail) ── */}
      <aside className="app-sidebar" style={{
        width: '74px',
        minWidth: '74px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 0',
        zIndex: 50
      }}>
        {/* Top Floating App Icon */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div
            onClick={() => setActiveTab("dashboard")}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              cursor: 'pointer'
            }}
          >
            {/* 4 dots logo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
            </div>
          </div>

          {/* Icon Navigation Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {[
              { id: "dashboard", icon: Activity, title: "Live Paper Bot" },
              { id: "backtester", icon: BarChart2, title: "Strategy Backtester" },
              { id: "matrix", icon: Layers, title: "Factor Matrix" },
              { id: "journal", icon: FileText, title: "Trade Journal" },
              { id: "risk", icon: ShieldCheck, title: "Risk Controls" }
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.title}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: isActive ? '#e6f4ea' : 'transparent',
                    color: isActive ? '#059669' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={20} color={isActive ? '#059669' : '#9ca3af'} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Settings Button */}
        <button
          onClick={() => setActiveTab("risk")}
          title="Risk & Settings"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <Settings size={20} color="#9ca3af" />
        </button>
      </aside>

      {/* ── Main Canvas ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── Quixotic Top Navigation Bar ─────────────────────────────── */}
        <header className="app-header" style={{
          height: '74px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          gap: '24px'
        }}>
          {/* Logo Brand: Quixotic */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#e6f4ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #059669'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#059669' }}>Q</span>
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.02em' }}>
              Quixotic <span style={{ color: '#059669', fontSize: '0.85rem' }}>Quant</span>
            </span>
          </div>

          {/* Center: Rounded Navigation Pills Bar */}
          <div className="app-nav-pills" style={{
            display: 'flex',
            backgroundColor: '#f3f4f6',
            padding: '4px',
            borderRadius: '16px',
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            {topNavTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                  color: activeTab === tab.id ? '#111827' : '#6b7280',
                  fontSize: '0.825rem',
                  fontWeight: activeTab === tab.id ? '700' : '500',
                  boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right: Search, Notification Bell, User Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '600',
              color: '#4b5563'
            }}>
              <span>{selectedMarket === "INDIA" ? "🇮🇳 NSE" : (selectedMarket === "US" ? "🇺🇸 US" : "💱 FX")}</span>
            </div>

            <button
              onClick={() => setIsTelegramOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '10px',
                backgroundColor: '#e6f4ea',
                color: '#059669',
                fontSize: '0.75rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              📱 Telegram Alerts
            </button>

            {/* Bloomberg Terminal Pro Mode Switcher */}
            <button
              onClick={() => {
                setTerminalMode("bloomberg");
                localStorage.setItem("terminal_edition", "bloomberg");
              }}
              title="Launch Bloomberg Terminal Pro Frontend (Hot-key: F12)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 13px',
                borderRadius: '10px',
                backgroundColor: '#05070a',
                color: '#ff9900',
                border: '1px solid #ff9900',
                fontSize: '0.75rem',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(255, 153, 0, 0.25)',
                fontFamily: "'JetBrains Mono', Consolas, monospace",
                letterSpacing: '0.02em'
              }}
            >
              🖥️ Bloomberg Pro [F12]
            </button>

            <div
              onClick={() => setIsTelegramOpen(true)}
              title="Configure Telegram Mobile Notifications"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Bell size={17} color="#4b5563" />
            </div>

            {/* User Profile Avatar with green status ring */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#e6f4ea',
              border: '2px solid #059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              color: '#059669',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}>
              N
            </div>
          </div>
        </header>

        {/* ── Dynamic Main View Canvas ─────────────────────────────────── */}
        <div className="app-content-area" style={{ flex: 1, overflowY: 'auto' }}>
          {/* VIEW 1: DASHBOARD (Live Paper Bot) */}
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

          {/* VIEW 3: FACTOR MATRIX */}
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

          {/* VIEW: MORNING SCANNER */}
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

          {/* VIEW 4: TRADE JOURNAL */}
          {activeTab === "journal" && (
            <div style={{ padding: '24px 36px' }}>
              <TradeJournal
                trades={backtestResult?.trades || []}
                currency={currency}
              />
            </div>
          )}

          {/* VIEW 5: RISK GUARDRAILS */}
          {activeTab === "risk" && (
            <div style={{ padding: '24px 36px', maxWidth: '750px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04)' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '18px', color: '#111827' }}>
                  Institutional Risk Controls & SEBI Compliance
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#6b7280' }}>3:15 PM Auto Square-Off</span>
                    <span style={{ color: '#059669', fontWeight: '700' }}>ENABLED (NSE Intraday MIS)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#6b7280' }}>Max Daily Drawdown Stop</span>
                    <span style={{ color: '#dc2626', fontWeight: '700' }}>₹20,000 (2.0% Hard Circuit)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#6b7280' }}>Peak Margin Leverage</span>
                    <span style={{ color: '#2563eb', fontWeight: '700' }}>5x MIS (SEBI Compliant)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Survivorship & Calendar Filters</span>
                    <span style={{ color: '#059669', fontWeight: '700' }}>Active (F&O Ban / Earnings)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Push Notification Settings Modal */}
      <TelegramModal
        isOpen={isTelegramOpen}
        onClose={() => setIsTelegramOpen(false)}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import './bloomberg.css';
import BloombergBotMonitor from './BloombergBotMonitor';
import BloombergBacktest from './BloombergBacktest';
import BloombergScanner from './BloombergScanner';
import BloombergMatrix from './BloombergMatrix';
import BloombergLogs from './BloombergLogs';
import BloombergRisk from './BloombergRisk';
import TelegramModal from '../components/TelegramModal';

export default function BloombergTerminalApp({
  onSwitchToClassic = () => {},
  initialTab = "bot"
}) {
  // Navigation active tab: 'bot', 'backtest', 'matrix', 'scanner', 'logs', 'risk', 'help'
  const [activeTab, setActiveTab] = useState(initialTab);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdFeedback, setCmdFeedback] = useState(null);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Clocks
  const [istTime, setIstTime] = useState("");
  const [utcTime, setUtcTime] = useState("");

  // Market & API State shared with backtest/bot
  const [marketDefs, setMarketDefs] = useState(null);
  const [strategiesList, setStrategiesList] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState("INDIA");
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [customSymbol, setCustomSymbol] = useState("");
  const [interval, setInterval] = useState("5m");
  const [lookbackDays, setLookbackDays] = useState(60);
  const [capitalInput, setCapitalInput] = useState("10L");
  const [initialCapital, setInitialCapital] = useState(1000000.0);
  const [selectedStrategy, setSelectedStrategy] = useState("NSE Intraday ORB Breakout");

  // Backtest execution
  const [loading, setLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Live Clocks updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // UTC time
      setUtcTime(now.toISOString().substring(11, 19) + " UTC");

      // IST time (UTC + 5:30)
      const istDate = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
      setIstTime(istDate.toTimeString().substring(0, 8) + " IST");
    };
    updateTime();
    const intervalId = setInterval(updateTime, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Initialize Market & Strategies definitions
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
        console.error("Failed to init Bloomberg Terminal metadata:", err);
      }
    };
    initData();
  }, []);

  // Parse capital
  useEffect(() => {
    const raw = capitalInput.trim().toLowerCase().replace(/,/g, '').replace(/[₹$]/g, '');
    let parsed = selectedMarket === "INDIA" ? 1000000.0 : 100000.0;
    if (raw.endsWith('cr') || raw.endsWith('crore')) {
      const v = parseFloat(raw.replace(/crores|crore|cr/g, ''));
      if (!isNaN(v)) parsed = v * 10000000.0;
    } else if (raw.endsWith('l') || raw.endsWith('lakh')) {
      const v = parseFloat(raw.replace(/lakhs|lakh|l/g, ''));
      if (!isNaN(v)) parsed = v * 100000.0;
    } else if (raw.endsWith('k')) {
      const v = parseFloat(raw.replace(/k/g, ''));
      if (!isNaN(v)) parsed = v * 1000.0;
    } else {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) parsed = v;
    }
    setInitialCapital(parsed);
  }, [capitalInput, selectedMarket]);

  // Backtest runner
  const runBacktest = async (targetSymbol = null, targetStrategy = null) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const sym = targetSymbol || customSymbol.trim() || symbol;
      const strat = targetStrategy || selectedStrategy;
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: selectedMarket,
          symbol: sym,
          interval,
          lookback_days: Number(lookbackDays),
          initial_capital: initialCapital,
          strategy_name: strat
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

  // Keyboard shortcut listener for F1 - F12
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setActiveTab("bot");
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveTab("backtest");
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab("matrix");
      } else if (e.key === 'F5') {
        e.preventDefault();
        setActiveTab("scanner");
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveTab("logs");
      } else if (e.key === 'F7') {
        e.preventDefault();
        setActiveTab("risk");
      } else if (e.key === 'F12') {
        e.preventDefault();
        onSwitchToClassic();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSwitchToClassic]);

  // Execute Bloomberg Command Line
  const handleExecuteCommand = async (e) => {
    if (e) e.preventDefault();
    const cmd = cmdInput.trim().toUpperCase();
    if (!cmd) return;

    setCmdInput("");
    setCmdFeedback(`> ${cmd} EXECUTED`);
    setTimeout(() => setCmdFeedback(null), 3000);

    // Route commands
    if (cmd === "HELP" || cmd === "F1") {
      setShowHelpModal(true);
    } else if (cmd === "BOT" || cmd === "LIVE" || cmd === "F2") {
      setActiveTab("bot");
    } else if (cmd === "BT" || cmd === "BACKTEST" || cmd === "F3") {
      setActiveTab("backtest");
      runBacktest();
    } else if (cmd === "MATRIX" || cmd === "F4") {
      setActiveTab("matrix");
    } else if (cmd === "SCAN" || cmd === "RADAR" || cmd === "F5") {
      setActiveTab("scanner");
    } else if (cmd === "LOGS" || cmd === "AUDIT" || cmd === "F6") {
      setActiveTab("logs");
    } else if (cmd === "RISK" || cmd === "F7") {
      setActiveTab("risk");
    } else if (cmd === "CLASSIC" || cmd === "EXIT" || cmd === "F12") {
      onSwitchToClassic();
    } else if (cmd === "ARM" || cmd === "START") {
      try {
        await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: "START", symbol, strategy_name: selectedStrategy, capital: initialCapital })
        });
        setActiveTab("bot");
      } catch (err) {}
    } else if (cmd === "PAUSE") {
      try {
        await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: "PAUSE", symbol, strategy_name: selectedStrategy, capital: initialCapital })
        });
        setActiveTab("bot");
      } catch (err) {}
    } else if (cmd === "SQOFF" || cmd === "FLAT") {
      try {
        await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: "SQUARE_OFF", symbol, strategy_name: selectedStrategy, capital: initialCapital })
        });
        setActiveTab("bot");
      } catch (err) {}
    } else {
      // Treat as symbol query (e.g. "RELIANCE", "SBIN", "INFY", "AAPL")
      const candidate = cmd.includes(".") ? cmd : `${cmd}.NS`;
      setSymbol(candidate);
      setCustomSymbol(candidate);
      setActiveTab("backtest");
      runBacktest(candidate);
    }
  };

  const currency = selectedMarket === "INDIA" ? "₹" : "$";

  return (
    <div className="bbg-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── TOP ICONIC BLOOMBERG COMMAND BAR ── */}
      <div style={{
        backgroundColor: '#020408',
        borderBottom: '2px solid #ff9900',
        padding: '6px 12px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Left: Brand + Command Line Prompt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              backgroundColor: '#ff9900',
              color: '#000000',
              fontWeight: '900',
              fontSize: '0.75rem',
              padding: '2px 6px',
              borderRadius: '2px'
            }}>
              BLOOMBERG
            </span>
            <span style={{ color: '#00e5ff', fontWeight: '800', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
              TERMINAL PRO
            </span>
          </div>

          {/* Interactive Command Line Input */}
          <form onSubmit={handleExecuteCommand} style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '1 1 260px', maxWidth: '420px' }}>
            <span style={{ color: '#ff9900', fontWeight: '900', fontSize: '0.8rem' }}>&gt;</span>
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              placeholder="TYPE TICKER OR CMD (E.G. RELIANCE, BT, SCAN, ARM)..."
              className="bbg-cmd-input"
              style={{ width: '100%', fontSize: '0.75rem', padding: '3px 8px' }}
            />
            <button
              type="submit"
              style={{
                backgroundColor: '#ff9900',
                border: 'none',
                color: '#000000',
                fontWeight: '900',
                fontSize: '0.72rem',
                padding: '3px 10px',
                borderRadius: '2px',
                cursor: 'pointer'
              }}
            >
              &lt;GO&gt;
            </button>
          </form>

          {cmdFeedback && (
            <span style={{ fontSize: '0.7rem', color: '#00ff66', fontWeight: '700' }}>
              {cmdFeedback}
            </span>
          )}
        </div>

        {/* Center/Right: Exchange Status, Clocks, Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
            <span style={{ color: '#00ff66', fontWeight: '800' }}>● NSE MIS LIVE</span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ color: '#ffaa00', fontWeight: '700' }}>{istTime}</span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ color: '#94a3b8' }}>{utcTime}</span>
          </div>

          {/* Telegram Alert Button */}
          <button
            onClick={() => setIsTelegramOpen(true)}
            className="bbg-fkey-btn"
            style={{ fontSize: '0.7rem', borderColor: '#00e5ff', color: '#00e5ff' }}
          >
            📱 TELEGRAM
          </button>

          {/* RETURN TO CLASSIC UI BUTTON */}
          <button
            onClick={onSwitchToClassic}
            className="bbg-fkey-btn"
            style={{
              backgroundColor: '#1e293b',
              borderColor: '#475569',
              color: '#f8fafc',
              fontSize: '0.72rem',
              fontWeight: '800',
              padding: '4px 10px'
            }}
            title="Switch back to original Quixotic light theme"
          >
            ⚡ EXIT TO CLASSIC UI [F12]
          </button>
        </div>
      </div>

      {/* ── BLOOMBERG FUNCTION KEY RIBBON (F1 - F12) ── */}
      <div style={{
        backgroundColor: '#0a0f19',
        borderBottom: '1px solid #1e293b',
        padding: '3px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto'
      }}>
        {[
          { id: 'help', num: 'F1', label: 'HELP' },
          { id: 'bot', num: 'F2', label: 'LIVE BOT COCKPIT' },
          { id: 'backtest', num: 'F3', label: 'BACKTEST STUDIO' },
          { id: 'matrix', num: 'F4', label: 'FACTOR MATRIX' },
          { id: 'scanner', num: 'F5', label: 'MORNING SCANNER' },
          { id: 'logs', num: 'F6', label: 'AUDIT LOGS' },
          { id: 'risk', num: 'F7', label: 'RISK LIMITS' }
        ].map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'help') setShowHelpModal(true);
                else setActiveTab(item.id);
              }}
              className={`bbg-fkey-btn ${isActive ? 'active' : ''}`}
            >
              <span className="bbg-fkey-num">{item.num}</span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          <button
            onClick={onSwitchToClassic}
            className="bbg-fkey-btn"
            style={{ color: '#ff9900' }}
          >
            <span className="bbg-fkey-num">F12</span>
            <span>CLASSIC UI</span>
          </button>
        </div>
      </div>

      {/* ── ACTIVE MODULE VIEWPORT ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* VIEW 1: LIVE BOT COCKPIT (F2) */}
        {activeTab === "bot" && (
          <BloombergBotMonitor
            market={selectedMarket}
            currency={currency}
            onNavigateToBacktest={() => setActiveTab("backtest")}
            onSelectSymbol={(sym) => {
              setSymbol(sym);
              setCustomSymbol(sym);
            }}
          />
        )}

        {/* VIEW 2: STRATEGY BACKTEST STUDIO (F3) */}
        {activeTab === "backtest" && (
          <BloombergBacktest
            marketDefs={marketDefs}
            strategiesList={strategiesList}
            selectedMarket={selectedMarket}
            setSelectedMarket={setSelectedMarket}
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
            onSelectForBot={(sym, strat) => {
              setSymbol(sym);
              if (strat) setSelectedStrategy(strat);
              setActiveTab("bot");
            }}
          />
        )}

        {/* VIEW 3: FACTOR MATRIX (F4) */}
        {activeTab === "matrix" && (
          <BloombergMatrix
            currency={currency}
            onSelectCombination={(combo) => {
              setSymbol(combo.asset);
              setCustomSymbol(combo.asset);
              setSelectedStrategy(combo.strategy);
              setInterval(combo.timeframe);
              setActiveTab("backtest");
              setTimeout(() => runBacktest(combo.asset, combo.strategy), 100);
            }}
          />
        )}

        {/* VIEW 4: MORNING SCANNER (F5) */}
        {activeTab === "scanner" && (
          <BloombergScanner
            currency={currency}
            onSelectForBacktest={(sym, strat) => {
              setSymbol(sym);
              setCustomSymbol(sym);
              if (strat) setSelectedStrategy(strat);
              setActiveTab("backtest");
              setTimeout(() => runBacktest(sym, strat), 100);
            }}
            onSelectForBot={(sym) => {
              setSymbol(sym);
              setCustomSymbol(sym);
              setActiveTab("bot");
            }}
          />
        )}

        {/* VIEW 5: AUDIT LOGS (F6) */}
        {activeTab === "logs" && (
          <BloombergLogs />
        )}

        {/* VIEW 6: RISK LIMITS (F7) */}
        {activeTab === "risk" && (
          <BloombergRisk
            currency={currency}
            onOpenTelegram={() => setIsTelegramOpen(true)}
          />
        )}
      </div>

      {/* ── Help Modal Overlay ── */}
      {showHelpModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="bbg-panel" style={{ maxWidth: '640px', width: '100%', border: '2px solid #ff9900' }}>
            <div className="bbg-panel-header" style={{ padding: '10px 14px' }}>
              <span>BLOOMBERG TERMINAL // COMMAND CHEAT-SHEET</span>
              <button
                onClick={() => setShowHelpModal(false)}
                className="bbg-fkey-btn"
                style={{ borderColor: '#ff3344', color: '#ff3344' }}
              >
                &lt;CLOSE [ESC]&gt;
              </button>
            </div>
            <div style={{ padding: '16px', fontSize: '0.75rem', lineHeight: '1.6' }}>
              <div style={{ color: '#ff9900', fontWeight: '800', marginBottom: '8px' }}>
                TERMINAL COMMAND PROMPT SYNTAX:
              </div>
              <ul style={{ listStyle: 'none', paddingLeft: 0, marginBottom: '16px', color: '#cbd5e1' }}>
                <li>• <strong style={{ color: '#00e5ff' }}>[TICKER] &lt;GO&gt;</strong> — Loads stock into backtester (e.g. <code>RELIANCE &lt;GO&gt;</code>, <code>SBIN &lt;GO&gt;</code>)</li>
                <li>• <strong style={{ color: '#00e5ff' }}>BOT &lt;GO&gt;</strong> or <strong>F2</strong> — Opens Live Bot Cockpit</li>
                <li>• <strong style={{ color: '#00e5ff' }}>BT &lt;GO&gt;</strong> or <strong>F3</strong> — Runs Strategy Backtest</li>
                <li>• <strong style={{ color: '#00e5ff' }}>MATRIX &lt;GO&gt;</strong> or <strong>F4</strong> — Opens Factor Matrix</li>
                <li>• <strong style={{ color: '#00e5ff' }}>SCAN &lt;GO&gt;</strong> or <strong>F5</strong> — Opens 09:16 AM Morning Scanner</li>
                <li>• <strong style={{ color: '#00e5ff' }}>LOGS &lt;GO&gt;</strong> or <strong>F6</strong> — Opens Audit Logs</li>
                <li>• <strong style={{ color: '#00e5ff' }}>ARM &lt;GO&gt;</strong> / <strong>START &lt;GO&gt;</strong> — Arms Live Engine</li>
                <li>• <strong style={{ color: '#00e5ff' }}>PAUSE &lt;GO&gt;</strong> — Pauses Live Engine</li>
                <li>• <strong style={{ color: '#00e5ff' }}>SQOFF &lt;GO&gt;</strong> — Immediately squares off all open positions</li>
                <li>• <strong style={{ color: '#00e5ff' }}>CLASSIC &lt;GO&gt;</strong> or <strong>F12</strong> — Return to Classic Quixotic UI</li>
              </ul>
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', color: '#64748b', fontSize: '0.7rem' }}>
                Press <strong>F12</strong> anytime to toggle between the Bloomberg Terminal and the original Quixotic light theme.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Modal */}
      <TelegramModal
        isOpen={isTelegramOpen}
        onClose={() => setIsTelegramOpen(false)}
      />
    </div>
  );
}

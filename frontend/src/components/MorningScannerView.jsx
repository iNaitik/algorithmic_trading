import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Target,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Sliders,
  Filter,
  BarChart2,
  Layers,
  ArrowRight,
  Bot,
  Calendar,
  Globe,
  Radio,
  Search,
  LayoutGrid,
  List,
  Sparkles,
  AlertCircle,
  Activity,
  Award,
  ChevronRight,
  Terminal,
  Cpu,
  Flame,
  Compass,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Maximize2
} from 'lucide-react';

export default function MorningScannerView({
  onSelectForBacktest = () => {},
  onSelectForBot = () => {},
  currency = "₹"
}) {
  const [selectedMarket, setSelectedMarket] = useState("INDIA"); // "INDIA", "US", "FOREX"
  const [snapshotMode, setSnapshotMode] = useState("916_OPEN"); // "916_OPEN", "LIVE"
  const [scanData, setScanData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("ALL"); // ALL, LONGS, SHORTS, HIGHRVOL, GAPS
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("ALPHA"); // ALPHA, RVOL, CHANGE, GAP
  const [viewMode, setViewMode] = useState("TABLE"); // "TABLE", "GRID"
  const [armingSymbol, setArmingSymbol] = useState(null);
  const [clockTime, setClockTime] = useState("");

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      setClockTime(ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch scanner telemetry
  const fetchScan = async (force = false, market = selectedMarket, mode = snapshotMode) => {
    setLoading(true);
    try {
      if (force) {
        const res = await fetch('/api/scanner/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ market, snapshot_mode: mode })
        });
        if (res.ok) {
          const json = await res.json();
          setScanData(json);
        }
      } else {
        const res = await fetch(`/api/scanner/morning?market=${market}&snapshot_mode=${mode}`);
        if (res.ok) {
          const json = await res.json();
          setScanData(json);
        }
      }
    } catch (e) {
      console.error("Scanner fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScan(false, selectedMarket, snapshotMode);
  }, [selectedMarket, snapshotMode]);

  // One-click Direct Arm Live Bot
  const handleArmBot = async (symbol, strategyName) => {
    setArmingSymbol(symbol);
    try {
      await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "START",
          symbol,
          strategy_name: strategyName || "NSE Midday VWAP Pullback",
          capital: 1000000.0
        })
      });
      onSelectForBot(symbol);
    } catch (e) {
      console.error("Arm bot error:", e);
      onSelectForBot(symbol);
    } finally {
      setArmingSymbol(null);
    }
  };

  const stocks = scanData?.stocks || [];
  const breadth = scanData?.market_breadth || {};
  const topLong = scanData?.top_longs?.[0] || null;
  const topShort = scanData?.top_shorts?.[0] || null;
  const currentCurrency = scanData?.currency || (selectedMarket === "INDIA" ? "₹" : (selectedMarket === "US" ? "$" : ""));

  // Filter and sort stocks
  const processedStocks = useMemo(() => {
    let list = stocks.filter(s => {
      const q = searchQuery.toUpperCase().trim();
      const matchQuery = !q || s.symbol.includes(q) || s.name.toUpperCase().includes(q) || (s.sector && s.sector.toUpperCase().includes(q));
      if (!matchQuery) return false;

      if (filterType === "LONGS") return s.setup_action === "BUY" || s.setup_action === "BUY ON RETEST";
      if (filterType === "SHORTS") return s.setup_action === "SELL / SHORT";
      if (filterType === "HIGHRVOL") return s.rvol >= 1.0;
      if (filterType === "GAPS") return Math.abs(s.gap_pct) >= 0.5;
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === "ALPHA") return (b.alpha_score || 0) - (a.alpha_score || 0);
      if (sortBy === "RVOL") return (b.rvol || 0) - (a.rvol || 0);
      if (sortBy === "CHANGE") return (b.change_pct || 0) - (a.change_pct || 0);
      if (sortBy === "GAP") return Math.abs(b.gap_pct || 0) - Math.abs(a.gap_pct || 0);
      return 0;
    });
  }, [stocks, searchQuery, filterType, sortBy]);

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: stocks.length,
      longs: stocks.filter(s => s.setup_action === "BUY" || s.setup_action === "BUY ON RETEST").length,
      shorts: stocks.filter(s => s.setup_action === "SELL / SHORT").length,
      highRvol: stocks.filter(s => s.rvol >= 1.0).length,
      gaps: stocks.filter(s => Math.abs(s.gap_pct) >= 0.5).length
    };
  }, [stocks]);

  const advancers = breadth.advancers || 0;
  const decliners = breadth.decliners || 0;
  const totalBreadth = advancers + decliners || 1;
  const advancePct = Math.round((advancers / totalBreadth) * 100);

  return (
    <div style={{
      backgroundColor: '#06080f',
      color: '#f1f5f9',
      minHeight: '100%',
      padding: '24px 32px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>

      {/* ── 1. ULTIMATE COMMAND HUD HEADER ───────────────────────────────── */}
      <div style={{
        background: 'radial-gradient(ellipse at top left, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0) 70%), #0b0f19',
        borderRadius: '24px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '22px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle Top Ambient Gradient Line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)',
          opacity: 0.8
        }} />

        {/* Left: Brand Identity & Live Radar Signal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            position: 'relative',
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 78, 59, 0.6) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)'
          }}>
            <Zap size={24} />
            <span style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981'
            }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: '1.6rem',
                fontWeight: '900',
                letterSpacing: '-0.03em',
                color: '#ffffff',
                margin: 0
              }}>
                Breakout Alpha Radar
              </h1>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: '800',
                padding: '3px 10px',
                borderRadius: '20px',
                backgroundColor: scanData?.is_market_open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: scanData?.is_market_open ? '#34d399' : '#fbbf24',
                border: `1px solid ${scanData?.is_market_open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: scanData?.is_market_open ? '#10b981' : '#f59e0b',
                  boxShadow: scanData?.is_market_open ? '0 0 8px #10b981' : 'none'
                }} />
                {scanData?.market_status || "NSE LIVE FEED"}
              </span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '4px',
              fontSize: '0.78rem',
              color: '#94a3b8'
            }}>
              <span>09:16 AM Volume Surge Discovery</span>
              <span>•</span>
              <span>15-Min ORB Channels</span>
              <span>•</span>
              <span style={{ color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace" }}>
                IST {clockTime || "09:16:00 AM"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Controls, Market Switcher, Rescan Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Market Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            {[
              { id: "INDIA", label: "🇮🇳 NSE India" },
              { id: "US", label: "🇺🇸 US Equities" },
              { id: "FOREX", label: "🌍 Forex" }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m.id)}
                style={{
                  padding: '7px 15px',
                  borderRadius: '10px',
                  fontSize: '0.76rem',
                  fontWeight: selectedMarket === m.id ? '800' : '600',
                  border: 'none',
                  backgroundColor: selectedMarket === m.id ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  color: selectedMarket === m.id ? '#34d399' : '#94a3b8',
                  borderBottom: selectedMarket === m.id ? '2px solid #10b981' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode Selector */}
          {selectedMarket !== "FOREX" && (
            <div style={{
              display: 'flex',
              backgroundColor: '#0f172a',
              padding: '4px',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                onClick={() => setSnapshotMode("916_OPEN")}
                style={{
                  padding: '7px 13px',
                  borderRadius: '10px',
                  fontSize: '0.74rem',
                  fontWeight: snapshotMode === "916_OPEN" ? '800' : '600',
                  border: 'none',
                  backgroundColor: snapshotMode === "916_OPEN" ? '#059669' : 'transparent',
                  color: snapshotMode === "916_OPEN" ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Zap size={13} />
                <span>09:16 AM Snapshot</span>
              </button>
              <button
                onClick={() => setSnapshotMode("LIVE")}
                style={{
                  padding: '7px 13px',
                  borderRadius: '10px',
                  fontSize: '0.74rem',
                  fontWeight: snapshotMode === "LIVE" ? '800' : '600',
                  border: 'none',
                  backgroundColor: snapshotMode === "LIVE" ? '#059669' : 'transparent',
                  color: snapshotMode === "LIVE" ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Activity size={13} />
                <span>Live Intraday</span>
              </button>
            </div>
          )}

          {/* Instant Trigger Button */}
          <button
            onClick={() => fetchScan(true, selectedMarket, snapshotMode)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 18px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '800',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Evaluating..." : "Scan Market Flow"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. INSTITUTIONAL MARKET INTELLIGENCE STRIP (4 METRICS) ───────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Metric 1: Advance / Decline Breadth Spectrum */}
        <div style={{
          backgroundColor: '#0b0f19',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '18px 22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Market Sentiment Breadth
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: advancePct >= 50 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: advancePct >= 50 ? '#34d399' : '#f43f5e',
              border: `1px solid ${advancePct >= 50 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
            }}>
              Ratio {breadth.advance_decline_ratio || (advancers / (decliners || 1)).toFixed(1)}x
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '10px 0 6px 0' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
              ▲ {advancers}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>vs</span>
            <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f43f5e', fontFamily: "'JetBrains Mono', monospace" }}>
              ▼ {decliners}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: 'auto', fontWeight: '700' }}>
              {advancePct}% Bullish Flow
            </span>
          </div>

          {/* Neon Breadth Flow Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: '#270e17', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${advancePct}%`,
              height: '100%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 12px #10b981',
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }} />
          </div>
        </div>

        {/* Metric 2: Average RVOL Surge Multiplier */}
        <div style={{
          backgroundColor: '#0b0f19',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '18px 22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Volume Surge Velocity
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}>
              INSTITUTIONAL
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '10px 0 4px 0' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: '900', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
              {breadth.avg_rvol || 1.1}x
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Relative to 20-Day Avg Volume
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Aggressive morning liquidity injection
          </div>
        </div>

        {/* Metric 3: Dominant Sector Leadership */}
        <div style={{
          backgroundColor: '#0b0f19',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '18px 22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Dominant Sector Velocity
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.3)'
            }}>
              ALPHA ROTATION
            </span>
          </div>

          <div style={{
            fontSize: '1.3rem',
            fontWeight: '900',
            color: '#34d399',
            margin: '10px 0 4px 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {breadth.dominant_sector || "Banking & Financials"}
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Highest concentration of qualified breakouts
          </div>
        </div>

        {/* Metric 4: Scheduler Daemon & Telemetry Bar */}
        <div style={{
          backgroundColor: '#0b0f19',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '18px 22px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Lifecycle Daemon Health
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '800',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              ACTIVE DAEMON
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 4px 0' }}>
            <Clock size={18} color="#10b981" />
            <span style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
              {scanData?.next_scheduled_scan || "09:16 AM IST"}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Candle As-Of: <b style={{ color: '#94a3b8' }}>{scanData?.latest_bar_time || "09:15 AM"}</b>
          </div>
        </div>
      </div>

      {/* ── 3. FEATURED BREAKOUT SPOTLIGHT PODIUM (DUAL HERO ASSETS) ────── */}
      <div className="quant-grid-split" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
      }}>
        {/* Spotlight Card 1: Prime Long Breakout Asset */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.25) 0%, rgba(11, 15, 25, 0.95) 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          boxShadow: '0 15px 40px rgba(16, 185, 129, 0.15)',
          padding: '26px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Top Edge Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '120px',
            height: '2px',
            backgroundColor: '#10b981',
            boxShadow: '0 0 12px #10b981'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)'
                }}>
                  ⚡ PRIME LONG BREAKOUT
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#10b981',
                  color: '#06080f'
                }}>
                  Rank #1 Pick
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '800',
                padding: '3px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                RVOL {topLong?.rvol || 1.2}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '18px' }}>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.03em' }}>
                  {topLong ? topLong.symbol : "Scanning Breakouts..."}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '2px' }}>
                  {topLong ? `${topLong.name} • ${topLong.sector}` : "Evaluating morning opening surge"}
                </div>
              </div>

              {topLong && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topLong.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.82rem',
                    fontWeight: '800',
                    color: '#34d399',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginTop: '2px'
                  }}>
                    <ArrowUpRight size={14} />
                    <span>{topLong.change_pct >= 0 ? '+' : ''}{topLong.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Target 2R, Stop Loss, and Strategy Specification */}
            {topLong && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginTop: '20px',
                padding: '14px 16px',
                borderRadius: '14px',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#34d399', marginTop: '3px' }}>{topLong.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Target 2R</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#6ee7b7', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topLong.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#fca5a5', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topLong.stop_loss}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          {topLong && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '16px',
              marginTop: '18px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Strategy: <b style={{ color: '#ffffff' }}>{topLong.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topLong.symbol, topLong.suggested_strategy)}
                  style={{
                    padding: '8px 15px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#e2e8f0',
                    fontSize: '0.76rem',
                    fontWeight: '700',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Backtest Studio ↗
                </button>
                <button
                  onClick={() => handleArmBot(topLong.symbol, topLong.suggested_strategy)}
                  disabled={armingSymbol === topLong.symbol}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {armingSymbol === topLong.symbol ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Bot size={13} />
                  )}
                  <span>Arm Live Bot ⚡</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Spotlight Card 2: Prime Short Breakdown Asset */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(76, 17, 34, 0.25) 0%, rgba(11, 15, 25, 0.95) 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          boxShadow: '0 15px 40px rgba(244, 63, 94, 0.15)',
          padding: '26px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Top Edge Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '120px',
            height: '2px',
            backgroundColor: '#f43f5e',
            boxShadow: '0 0 12px #f43f5e'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(244, 63, 94, 0.2)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.4)'
                }}>
                  🔻 PRIME SHORT BREAKDOWN
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#f43f5e',
                  color: '#ffffff'
                }}>
                  Rank #1 Pick
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '800',
                padding: '3px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                border: '1px solid rgba(244, 63, 94, 0.3)'
              }}>
                RVOL {topShort?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '18px' }}>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.03em' }}>
                  {topShort ? topShort.symbol : "No Active Breakdown"}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '2px' }}>
                  {topShort ? `${topShort.name} • ${topShort.sector}` : "Market displaying neutral or bullish morning flow"}
                </div>
              </div>

              {topShort && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topShort.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.82rem',
                    fontWeight: '800',
                    color: '#fb7185',
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    marginTop: '2px'
                  }}>
                    <ArrowDownRight size={14} />
                    <span>{topShort.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Target 2R, Stop Loss, and Strategy Specification */}
            {topShort && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginTop: '20px',
                padding: '14px 16px',
                borderRadius: '14px',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#fb7185', marginTop: '3px' }}>{topShort.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Target 2R</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#6ee7b7', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topShort.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#fca5a5', marginTop: '3px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {currentCurrency}{topShort.stop_loss}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          {topShort && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '16px',
              marginTop: '18px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Strategy: <b style={{ color: '#ffffff' }}>{topShort.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topShort.symbol, topShort.suggested_strategy)}
                  style={{
                    padding: '8px 15px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#e2e8f0',
                    fontSize: '0.76rem',
                    fontWeight: '700',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Backtest Studio ↗
                </button>
                <button
                  onClick={() => handleArmBot(topShort.symbol, topShort.suggested_strategy)}
                  disabled={armingSymbol === topShort.symbol}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(244, 63, 94, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {armingSymbol === topShort.symbol ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Bot size={13} />
                  )}
                  <span>Arm Short Bot</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. ADVANCED SCREENER TOOLBAR (FILTERS, SEARCH, SORT, VIEW) ───── */}
      <div style={{
        backgroundColor: '#0b0f19',
        borderRadius: '18px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '14px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Filter Pills with Counts */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: "ALL", label: "All Equities", count: counts.all },
            { id: "LONGS", label: "🟢 Long Breakouts", count: counts.longs },
            { id: "SHORTS", label: "🔴 Short Breakdowns", count: counts.shorts },
            { id: "HIGHRVOL", label: "⚡ High RVOL (>1.0x)", count: counts.highRvol },
            { id: "GAPS", label: "🎯 Gap Plays (>0.5%)", count: counts.gaps }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: filterType === f.id ? '800' : '600',
                border: filterType === f.id ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: filterType === f.id ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                color: filterType === f.id ? '#34d399' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{f.label}</span>
              <span style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                borderRadius: '5px',
                backgroundColor: filterType === f.id ? 'rgba(16, 185, 129, 0.4)' : '#1e293b',
                color: filterType === f.id ? '#ffffff' : '#94a3b8'
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Right Search, Sort, View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Instant Search Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '7px 14px'
          }}>
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search ticker, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '0.78rem',
                width: '190px',
                color: '#ffffff',
                fontFamily: 'inherit'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '700' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                fontSize: '0.76rem',
                fontWeight: '700',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              <option value="ALPHA">Alpha Score</option>
              <option value="RVOL">RVOL (Surge)</option>
              <option value="CHANGE">% Change</option>
              <option value="GAP">Gap %</option>
            </select>
          </div>

          {/* View Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <button
              onClick={() => setViewMode("TABLE")}
              title="Data Ledger View"
              style={{
                padding: '6px 9px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === "TABLE" ? '#1e293b' : 'transparent',
                color: viewMode === "TABLE" ? '#10b981' : '#64748b',
                cursor: 'pointer'
              }}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode("GRID")}
              title="Cards Grid View"
              style={{
                padding: '6px 9px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === "GRID" ? '#1e293b' : 'transparent',
                color: viewMode === "GRID" ? '#10b981' : '#64748b',
                cursor: 'pointer'
              }}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. MAIN CONTENT: OBSIDIAN DATA LEDGER (TABLE) OR CARDS GRID ── */}
      {viewMode === "TABLE" ? (
        <div style={{
          backgroundColor: '#0b0f19',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{
                  backgroundColor: '#080c14',
                  color: '#64748b',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  textTransform: 'uppercase',
                  fontSize: '0.67rem',
                  letterSpacing: '0.06em',
                  fontWeight: '800'
                }}>
                  <th style={{ padding: '14px 20px' }}>Instrument & Sector</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Change %</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Opening Gap %</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center' }}>RVOL</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>VWAP</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center' }}>15m ORB Channel</th>
                  <th style={{ padding: '14px 20px' }}>Setup Signal</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Target (2R) / SL</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center' }}>Quick Action</th>
                </tr>
              </thead>
              <tbody>
                {processedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                      <AlertCircle size={32} color="#64748b" style={{ margin: '0 auto 10px' }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#94a3b8' }}>No instruments match the selected filter</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>Try switching filter tabs or clearing your search term</div>
                    </td>
                  </tr>
                ) : (
                  processedStocks.map((stock) => {
                    const isLong = stock.setup_action === "BUY" || stock.setup_action === "BUY ON RETEST";
                    const isShort = stock.setup_action === "SELL / SHORT";
                    const isArming = armingSymbol === stock.symbol;

                    return (
                      <tr
                        key={stock.symbol}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0e1526'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {/* Ticker & Sector */}
                        <td style={{ padding: '15px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '900', color: '#ffffff', fontSize: '0.9rem' }}>
                              {stock.symbol}
                            </span>
                            <span style={{
                              fontSize: '0.62rem',
                              fontWeight: '800',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              Score: {stock.alpha_score || 85}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                            {stock.name} • <span style={{ color: '#94a3b8', fontWeight: '600' }}>{stock.sector}</span>
                          </div>
                        </td>

                        {/* Price */}
                        <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: '900', color: '#ffffff', fontSize: '0.9rem', fontFamily: "'JetBrains Mono', monospace" }}>
                          {currentCurrency}{stock.price.toFixed(2)}
                        </td>

                        {/* Change % */}
                        <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: '900', fontFamily: "'JetBrains Mono', monospace" }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            color: stock.change_pct >= 0 ? '#34d399' : '#fb7185'
                          }}>
                            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                          </span>
                        </td>

                        {/* Opening Gap % */}
                        <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: '800', fontFamily: "'JetBrains Mono', monospace", color: stock.gap_pct >= 0 ? '#34d399' : '#fb7185' }}>
                          {stock.gap_pct >= 0 ? '+' : ''}{stock.gap_pct}%
                        </td>

                        {/* RVOL Badge */}
                        <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '900',
                            fontFamily: "'JetBrains Mono', monospace",
                            backgroundColor: stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: stock.rvol >= 1.2 ? '#34d399' : (stock.rvol >= 0.9 ? '#e2e8f0' : '#f43f5e'),
                            border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`
                          }}>
                            {stock.rvol}x
                          </span>
                        </td>

                        {/* VWAP */}
                        <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                          <div style={{ fontWeight: '800', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
                            {currentCurrency}{stock.vwap}
                          </div>
                          <span style={{ fontSize: '0.64rem', fontWeight: '800', color: stock.is_above_vwap ? '#34d399' : '#fb7185' }}>
                            {stock.is_above_vwap ? '▲ Above' : '▼ Below'}
                          </span>
                        </td>

                        {/* 15m ORB Channel */}
                        <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                            H: {stock.orb_high} | L: {stock.orb_low}
                          </div>
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: '800',
                            color: stock.orb_status === 'BREAKOUT_HIGH' ? '#34d399' : (stock.orb_status === 'BREAKDOWN_LOW' ? '#fb7185' : '#64748b')
                          }}>
                            {stock.orb_status === 'BREAKOUT_HIGH' ? '⚡ High Breakout' : (stock.orb_status === 'BREAKDOWN_LOW' ? '🔻 Low Breakdown' : 'Inside Range')}
                          </span>
                        </td>

                        {/* Setup Signal */}
                        <td style={{ padding: '15px 20px' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            backgroundColor: isLong ? 'rgba(16, 185, 129, 0.15)' : (isShort ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
                            color: isLong ? '#34d399' : (isShort ? '#fb7185' : '#94a3b8'),
                            border: `1px solid ${isLong ? 'rgba(16, 185, 129, 0.35)' : (isShort ? 'rgba(244, 63, 94, 0.35)' : 'rgba(255, 255, 255, 0.08)')}`
                          }}>
                            {stock.setup_signal}
                          </span>
                          <div style={{ fontSize: '0.67rem', color: '#64748b', marginTop: '3px' }}>
                            {stock.suggested_strategy.replace('NSE ', '')}
                          </div>
                        </td>

                        {/* Levels */}
                        <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                          <div style={{ color: '#34d399', fontWeight: '900', fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace" }}>
                            TP: {currentCurrency}{stock.target_2r}
                          </div>
                          <div style={{ color: '#fb7185', fontSize: '0.72rem', fontWeight: '800', fontFamily: "'JetBrains Mono', monospace" }}>
                            SL: {currentCurrency}{stock.stop_loss}
                          </div>
                        </td>

                        {/* Quick Deploy Actions */}
                        <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                              disabled={isArming}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                background: isLong ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : (isShort ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : '#1e293b'),
                                color: '#ffffff',
                                fontSize: '0.74rem',
                                fontWeight: '800',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Arm live bot on this instrument immediately"
                            >
                              {isArming ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <Bot size={12} />
                              )}
                              <span>Arm</span>
                            </button>

                            <button
                              onClick={() => onSelectForBacktest(stock.symbol, stock.suggested_strategy)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                backgroundColor: '#1e293b',
                                color: '#cbd5e1',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                border: '1px solid #334155',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Open in Strategy Backtester Studio"
                            >
                              <span>Studio</span>
                              <ChevronRight size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visual Cards Grid View */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {processedStocks.map((stock) => {
            const isLong = stock.setup_action === "BUY" || stock.setup_action === "BUY ON RETEST";
            const isShort = stock.setup_action === "SELL / SHORT";
            const isArming = armingSymbol === stock.symbol;

            return (
              <div
                key={stock.symbol}
                style={{
                  backgroundColor: '#0b0f19',
                  borderRadius: '20px',
                  padding: '20px',
                  border: isLong ? '1px solid rgba(16, 185, 129, 0.35)' : (isShort ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)'),
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 15px 40px rgba(0, 0, 0, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#ffffff' }}>
                        {stock.symbol}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {stock.name} • {stock.sector}
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 9px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '900',
                      fontFamily: "'JetBrains Mono', monospace",
                      backgroundColor: stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                      color: stock.rvol >= 1.2 ? '#34d399' : '#94a3b8',
                      border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.4)' : '#334155'}`
                    }}>
                      RVOL {stock.rvol}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '14px' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ffffff', fontFamily: "'JetBrains Mono', monospace" }}>
                      {currentCurrency}{stock.price.toFixed(2)}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '0.8rem',
                      fontWeight: '900',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: stock.change_pct >= 0 ? '#34d399' : '#fb7185'
                    }}>
                      {stock.change_pct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span>{stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%</span>
                    </div>
                  </div>

                  {/* Quantitative Attributes Matrix */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginTop: '14px',
                    padding: '12px',
                    borderRadius: '12px',
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '0.72rem',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    <div>
                      <span style={{ color: '#64748b' }}>VWAP: </span>
                      <b style={{ color: '#ffffff' }}>{stock.vwap}</b>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Gap: </span>
                      <b style={{ color: stock.gap_pct >= 0 ? '#34d399' : '#fb7185' }}>{stock.gap_pct}%</b>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Target: </span>
                      <b style={{ color: '#34d399' }}>{stock.target_2r}</b>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Stop: </span>
                      <b style={{ color: '#fb7185' }}>{stock.stop_loss}</b>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 9px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: '800',
                      backgroundColor: isLong ? 'rgba(16, 185, 129, 0.15)' : (isShort ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
                      color: isLong ? '#34d399' : (isShort ? '#fb7185' : '#94a3b8'),
                      border: `1px solid ${isLong ? 'rgba(16, 185, 129, 0.35)' : (isShort ? 'rgba(244, 63, 94, 0.35)' : 'rgba(255, 255, 255, 0.08)')}`
                    }}>
                      {stock.setup_signal}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                  <button
                    onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                    disabled={isArming}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px',
                      borderRadius: '10px',
                      background: isLong ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : (isShort ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : '#1e293b'),
                      color: '#ffffff',
                      fontSize: '0.76rem',
                      fontWeight: '800',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {isArming ? <RefreshCw size={12} className="animate-spin" /> : <Bot size={12} />}
                    <span>Arm Live Bot</span>
                  </button>

                  <button
                    onClick={() => onSelectForBacktest(stock.symbol, stock.suggested_strategy)}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      border: '1px solid #334155',
                      cursor: 'pointer'
                    }}
                  >
                    Studio
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

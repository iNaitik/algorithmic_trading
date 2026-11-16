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
  Cpu
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
      backgroundColor: '#070a12',
      color: '#f8fafc',
      minHeight: '100%',
      padding: '24px 32px',
      fontFamily: "'JetBrains Mono', 'Plus Jakarta Sans', monospace",
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>

      {/* ── 1. Top SaaS Obsidian Header ─────────────────────────────────── */}
      <div style={{
        backgroundColor: '#0c121e',
        borderRadius: '20px',
        border: '1px solid #1e293b',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Title & Pulse Beacon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 78, 59, 0.4) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)'
          }}>
            <Cpu size={24} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: '1.45rem',
                fontWeight: '800',
                letterSpacing: '-0.02em',
                color: '#ffffff',
                margin: 0,
                fontFamily: "'Plus Jakarta Sans', sans-serif"
              }}>
                Breakout Flow Screener
              </h1>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: '700',
                padding: '3px 10px',
                borderRadius: '20px',
                backgroundColor: scanData?.is_market_open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: scanData?.is_market_open ? '#34d399' : '#fbbf24',
                border: `1px solid ${scanData?.is_market_open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: scanData?.is_market_open ? '#10b981' : '#f59e0b',
                  boxShadow: scanData?.is_market_open ? '0 0 8px #10b981' : 'none'
                }} />
                {scanData?.market_status || "LIVE FLOW ARMED"}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '3px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Quant Volume Velocity (RVOL) • 15m ORB Channel Breakouts • Automated 09:16 AM Engine
            </div>
          </div>
        </div>

        {/* Global Toolbar: Market Pills, Mode, Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Market Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#111827',
            padding: '3px',
            borderRadius: '12px',
            border: '1px solid #1f2937'
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
                  padding: '6px 14px',
                  borderRadius: '9px',
                  fontSize: '0.75rem',
                  fontWeight: selectedMarket === m.id ? '700' : '600',
                  border: 'none',
                  backgroundColor: selectedMarket === m.id ? '#1e293b' : 'transparent',
                  color: selectedMarket === m.id ? '#10b981' : '#94a3b8',
                  boxShadow: selectedMarket === m.id ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          {selectedMarket !== "FOREX" && (
            <div style={{
              display: 'flex',
              backgroundColor: '#111827',
              padding: '3px',
              borderRadius: '12px',
              border: '1px solid #1f2937'
            }}>
              <button
                onClick={() => setSnapshotMode("916_OPEN")}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  fontSize: '0.72rem',
                  fontWeight: snapshotMode === "916_OPEN" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "916_OPEN" ? '#059669' : 'transparent',
                  color: snapshotMode === "916_OPEN" ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Zap size={12} />
                <span>09:16 AM Snapshot</span>
              </button>
              <button
                onClick={() => setSnapshotMode("LIVE")}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  fontSize: '0.72rem',
                  fontWeight: snapshotMode === "LIVE" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "LIVE" ? '#059669' : 'transparent',
                  color: snapshotMode === "LIVE" ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Activity size={12} />
                <span>Live Intraday</span>
              </button>
            </div>
          )}

          {/* Rescan Button */}
          <button
            onClick={() => fetchScan(true, selectedMarket, snapshotMode)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Scanning..." : "Rescan Flow"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Top 4 Cyber-Quant Metric Cards ─────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Metric 1: Advancers / Decliners Breadth */}
        <div style={{
          backgroundColor: '#0c121e',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Market Sentiment Breadth
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: advancePct >= 50 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: advancePct >= 50 ? '#34d399' : '#f43f5e',
              border: `1px solid ${advancePct >= 50 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
            }}>
              A/D {breadth.advance_decline_ratio || (advancers / (decliners || 1)).toFixed(1)}x
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px 0' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: '800', color: '#10b981' }}>
              ▲ {advancers}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>vs</span>
            <span style={{ fontSize: '1.45rem', fontWeight: '800', color: '#f43f5e' }}>
              ▼ {decliners}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
              {advancePct}% Bullish
            </span>
          </div>

          {/* Dual Flow Neon Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: '#33131c', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${advancePct}%`,
              height: '100%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981',
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Metric 2: Average RVOL Surge Multiplier */}
        <div style={{
          backgroundColor: '#0c121e',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Volume Surge Velocity
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}>
              INSTITUTIONAL
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 4px 0' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: '800', color: '#ffffff' }}>
              {breadth.avg_rvol || 1.1}x
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Avg Relative Volume
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Calculated against 20-day historical opening volume
          </div>
        </div>

        {/* Metric 3: Dominant Sector Velocity */}
        <div style={{
          backgroundColor: '#0c121e',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Dominant Sector Flow
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.3)'
            }}>
              ROTATION
            </span>
          </div>

          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#34d399', margin: '8px 0 4px 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {breadth.dominant_sector || "Banking & Financials"}
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Highest concentration of morning breakouts
          </div>
        </div>

        {/* Metric 4: Scheduler & Daemon Health */}
        <div style={{
          backgroundColor: '#0c121e',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Scheduler Daemon
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              ARMED 09:16
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0 4px 0' }}>
            <Clock size={16} color="#10b981" />
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff' }}>
              {scanData?.next_scheduled_scan || "09:16 AM IST"}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Candle As-Of: <b style={{ color: '#94a3b8' }}>{scanData?.latest_bar_time || "09:15 AM"}</b>
          </div>
        </div>
      </div>

      {/* ── 3. Dual Spotlight Hero Cards (Cyber Emerald vs Electric Rose) ─ */}
      <div className="quant-grid-split" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
      }}>
        {/* Card A: Prime Long Breakout (Cyber Emerald) */}
        <div style={{
          background: 'linear-gradient(135deg, #0b1517 0%, #0d1e1a 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          boxShadow: '0 8px 30px rgba(16, 185, 129, 0.15)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)'
                }}>
                  ⚡ PRIME LONG BREAKOUT
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  backgroundColor: '#10b981',
                  color: '#070a12'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.72rem',
                fontWeight: '800',
                padding: '3px 9px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                RVOL {topLong?.rvol || 1.2}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {topLong ? topLong.symbol : "Scanning Breakouts..."}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  {topLong ? `${topLong.name} • ${topLong.sector}` : "Awaiting morning volume surge"}
                </div>
              </div>

              {topLong && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#ffffff' }}>
                    {currentCurrency}{topLong.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    color: '#34d399',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginTop: '2px'
                  }}>
                    <ArrowUpRight size={13} />
                    <span>{topLong.change_pct >= 0 ? '+' : ''}{topLong.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signal & Target Box */}
            {topLong && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#34d399', marginTop: '3px' }}>{topLong.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#6ee7b7', marginTop: '3px' }}>
                    {currentCurrency}{topLong.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fca5a5', marginTop: '3px' }}>
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
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Strategy: <b style={{ color: '#ffffff' }}>{topLong.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topLong.symbol, topLong.suggested_strategy)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Backtest ↗
                </button>
                <button
                  onClick={() => handleArmBot(topLong.symbol, topLong.suggested_strategy)}
                  disabled={armingSymbol === topLong.symbol}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {armingSymbol === topLong.symbol ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Bot size={13} />
                  )}
                  <span>Arm Live Bot</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card B: Prime Short Breakdown (Electric Rose) */}
        <div style={{
          background: 'linear-gradient(135deg, #180c12 0%, #201016 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(244, 63, 94, 0.35)',
          boxShadow: '0 8px 30px rgba(244, 63, 94, 0.15)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            backgroundColor: 'rgba(244, 63, 94, 0.12)',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(244, 63, 94, 0.2)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.4)'
                }}>
                  🔻 PRIME SHORT BREAKDOWN
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  backgroundColor: '#f43f5e',
                  color: '#ffffff'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.72rem',
                fontWeight: '800',
                padding: '3px 9px',
                borderRadius: '8px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                border: '1px solid rgba(244, 63, 94, 0.3)'
              }}>
                RVOL {topShort?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {topShort ? topShort.symbol : "No Active Breakdown"}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  {topShort ? `${topShort.name} • ${topShort.sector}` : "Market displaying neutral or bullish opening flow"}
                </div>
              </div>

              {topShort && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#ffffff' }}>
                    {currentCurrency}{topShort.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    color: '#fb7185',
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    marginTop: '2px'
                  }}>
                    <ArrowDownRight size={13} />
                    <span>{topShort.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signal & Target Box */}
            {topShort && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fb7185', marginTop: '3px' }}>{topShort.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#6ee7b7', marginTop: '3px' }}>
                    {currentCurrency}{topShort.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fca5a5', marginTop: '3px' }}>
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
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Strategy: <b style={{ color: '#ffffff' }}>{topShort.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topShort.symbol, topShort.suggested_strategy)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Backtest ↗
                </button>
                <button
                  onClick={() => handleArmBot(topShort.symbol, topShort.suggested_strategy)}
                  disabled={armingSymbol === topShort.symbol}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(244, 63, 94, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
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

      {/* ── 4. Screener Controls Toolbar (Filters, Search, View) ───────── */}
      <div style={{
        backgroundColor: '#0c121e',
        borderRadius: '16px',
        border: '1px solid #1e293b',
        padding: '12px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
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
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.74rem',
                fontWeight: filterType === f.id ? '700' : '600',
                border: filterType === f.id ? '1px solid #10b981' : '1px solid #1f2937',
                backgroundColor: filterType === f.id ? 'rgba(16, 185, 129, 0.2)' : '#111827',
                color: filterType === f.id ? '#34d399' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{f.label}</span>
              <span style={{
                fontSize: '0.66rem',
                padding: '1px 5px',
                borderRadius: '5px',
                backgroundColor: filterType === f.id ? 'rgba(16, 185, 129, 0.35)' : '#1f2937',
                color: filterType === f.id ? '#ffffff' : '#94a3b8'
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Right Controls: Search, Sort, View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '10px',
            padding: '6px 12px'
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
                width: '180px',
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

          {/* Sort Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #1f2937',
                backgroundColor: '#111827',
                color: '#e2e8f0',
                fontSize: '0.74rem',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              <option value="ALPHA">Alpha Score</option>
              <option value="RVOL">RVOL (Highest)</option>
              <option value="CHANGE">% Change</option>
              <option value="GAP">Gap %</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: '#111827',
            padding: '3px',
            borderRadius: '9px',
            border: '1px solid #1f2937'
          }}>
            <button
              onClick={() => setViewMode("TABLE")}
              title="Table View"
              style={{
                padding: '5px 8px',
                borderRadius: '7px',
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
                padding: '5px 8px',
                borderRadius: '7px',
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

      {/* ── 5. Main Content: Obsidian Table or Dark Cards Grid ─────────── */}
      {viewMode === "TABLE" ? (
        <div style={{
          backgroundColor: '#0c121e',
          borderRadius: '20px',
          border: '1px solid #1e293b',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#090d16', color: '#64748b', borderBottom: '1px solid #1e293b', textTransform: 'uppercase', fontSize: '0.66rem', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 18px' }}>Instrument & Sector</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Change %</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Gap %</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>RVOL</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>VWAP</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>15m ORB Channel</th>
                  <th style={{ padding: '12px 18px' }}>Setup Signal</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Target / SL</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>Deploy</th>
                </tr>
              </thead>
              <tbody>
                {processedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                      <AlertCircle size={28} color="#64748b" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#94a3b8' }}>No instruments match current filter criteria</div>
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
                          borderBottom: '1px solid #131b2c',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#11192a'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {/* Ticker & Sector */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.88rem' }}>
                              {stock.symbol}
                            </span>
                            <span style={{
                              fontSize: '0.62rem',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              Score: {stock.alpha_score || 85}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                            {stock.name} • <span style={{ color: '#94a3b8' }}>{stock.sector}</span>
                          </div>
                        </td>

                        {/* Price */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800', color: '#ffffff', fontSize: '0.88rem' }}>
                          {currentCurrency}{stock.price.toFixed(2)}
                        </td>

                        {/* Change % */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            color: stock.change_pct >= 0 ? '#34d399' : '#fb7185'
                          }}>
                            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                          </span>
                        </td>

                        {/* Gap % */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '700', color: stock.gap_pct >= 0 ? '#34d399' : '#fb7185' }}>
                          {stock.gap_pct >= 0 ? '+' : ''}{stock.gap_pct}%
                        </td>

                        {/* RVOL Badge */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            backgroundColor: stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: stock.rvol >= 1.2 ? '#34d399' : (stock.rvol >= 0.9 ? '#e2e8f0' : '#f43f5e'),
                            border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`
                          }}>
                            {stock.rvol}x
                          </span>
                        </td>

                        {/* VWAP */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: '#ffffff' }}>{currentCurrency}{stock.vwap}</div>
                          <span style={{ fontSize: '0.64rem', fontWeight: '700', color: stock.is_above_vwap ? '#34d399' : '#fb7185' }}>
                            {stock.is_above_vwap ? '▲ Above VWAP' : '▼ Below VWAP'}
                          </span>
                        </td>

                        {/* 15m ORB Channel */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            H: {stock.orb_high} | L: {stock.orb_low}
                          </div>
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: '700',
                            color: stock.orb_status === 'BREAKOUT_HIGH' ? '#34d399' : (stock.orb_status === 'BREAKDOWN_LOW' ? '#fb7185' : '#64748b')
                          }}>
                            {stock.orb_status === 'BREAKOUT_HIGH' ? '⚡ High Breakout' : (stock.orb_status === 'BREAKDOWN_LOW' ? '🔻 Low Breakdown' : 'Inside Range')}
                          </span>
                        </td>

                        {/* Setup Signal */}
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            backgroundColor: isLong ? 'rgba(16, 185, 129, 0.15)' : (isShort ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
                            color: isLong ? '#34d399' : (isShort ? '#fb7185' : '#94a3b8'),
                            border: `1px solid ${isLong ? 'rgba(16, 185, 129, 0.3)' : (isShort ? 'rgba(244, 63, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)')}`
                          }}>
                            {stock.setup_signal}
                          </span>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '3px' }}>
                            {stock.suggested_strategy.replace('NSE ', '')}
                          </div>
                        </td>

                        {/* Levels */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ color: '#34d399', fontWeight: '800', fontSize: '0.75rem' }}>
                            TP: {currentCurrency}{stock.target_2r}
                          </div>
                          <div style={{ color: '#fb7185', fontSize: '0.7rem', fontWeight: '700' }}>
                            SL: {currentCurrency}{stock.stop_loss}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                              disabled={isArming}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 10px',
                                borderRadius: '7px',
                                background: isLong ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : (isShort ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : '#1e293b'),
                                color: '#ffffff',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Arm live bot on this instrument immediately"
                            >
                              {isArming ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : (
                                <Bot size={11} />
                              )}
                              <span>Arm</span>
                            </button>

                            <button
                              onClick={() => onSelectForBacktest(stock.symbol, stock.suggested_strategy)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                backgroundColor: '#1e293b',
                                color: '#cbd5e1',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                border: '1px solid #334155',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Open in Strategy Backtester Studio"
                            >
                              <span>Studio</span>
                              <ChevronRight size={11} />
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
        /* Dark Cyber Cards Grid View */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '18px'
        }}>
          {processedStocks.map((stock) => {
            const isLong = stock.setup_action === "BUY" || stock.setup_action === "BUY ON RETEST";
            const isShort = stock.setup_action === "SELL / SHORT";
            const isArming = armingSymbol === stock.symbol;

            return (
              <div
                key={stock.symbol}
                style={{
                  backgroundColor: '#0c121e',
                  borderRadius: '16px',
                  padding: '18px',
                  border: isLong ? '1px solid rgba(16, 185, 129, 0.3)' : (isShort ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid #1e293b'),
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff' }}>
                        {stock.symbol}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {stock.name} • {stock.sector}
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: '800',
                      backgroundColor: stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                      color: stock.rvol >= 1.2 ? '#34d399' : '#94a3b8',
                      border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(16, 185, 129, 0.4)' : '#334155'}`
                    }}>
                      RVOL {stock.rvol}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ffffff' }}>
                      {currentCurrency}{stock.price.toFixed(2)}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.76rem',
                      fontWeight: '800',
                      color: stock.change_pct >= 0 ? '#34d399' : '#fb7185'
                    }}>
                      {stock.change_pct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      <span>{stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%</span>
                    </div>
                  </div>

                  {/* Matrix Attributes */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginTop: '12px',
                    padding: '10px',
                    borderRadius: '10px',
                    backgroundColor: '#111827',
                    border: '1px solid #1f2937',
                    fontSize: '0.7rem'
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

                  <div style={{ marginTop: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      fontSize: '0.66rem',
                      fontWeight: '700',
                      backgroundColor: isLong ? 'rgba(16, 185, 129, 0.15)' : (isShort ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
                      color: isLong ? '#34d399' : (isShort ? '#fb7185' : '#94a3b8'),
                      border: `1px solid ${isLong ? 'rgba(16, 185, 129, 0.3)' : (isShort ? 'rgba(244, 63, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)')}`
                    }}>
                      {stock.setup_signal}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                  <button
                    onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                    disabled={isArming}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '8px',
                      borderRadius: '8px',
                      background: isLong ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : (isShort ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : '#1e293b'),
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: '700',
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
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                      fontSize: '0.74rem',
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

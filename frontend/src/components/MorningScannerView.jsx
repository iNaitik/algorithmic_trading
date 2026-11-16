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
  ChevronRight
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
  const totalBreath = advancers + decliners || 1;
  const advancePct = Math.round((advancers / totalBreath) * 100);

  return (
    <div className="quant-dashboard-container" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      padding: '24px 32px',
      maxWidth: '1440px',
      margin: '0 auto',
      fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif"
    }}>

      {/* ── 1. Top SaaS Header & Command Toolbar ───────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#e6f4ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.15)'
            }}>
              <Zap size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>
                  Morning Breakout & Flow Screener
                </h1>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  padding: '3px 9px',
                  borderRadius: '20px',
                  backgroundColor: scanData?.is_market_open ? '#e6f4ea' : '#fef3c7',
                  color: scanData?.is_market_open ? '#059669' : '#b45309',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: scanData?.is_market_open ? '#059669' : '#d97706',
                    boxShadow: scanData?.is_market_open ? '0 0 6px #059669' : 'none'
                  }} />
                  {scanData?.market_status || "Session Active"}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '2px', margin: 0 }}>
                Autonomous 09:16 AM Opening Surge, Relative Volume (RVOL), and 15m ORB Channel Breakouts
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls: Market Tabs & Manual Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Market Selector Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f3f4f6',
            padding: '3px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
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
                  fontSize: '0.78rem',
                  fontWeight: selectedMarket === m.id ? '700' : '600',
                  border: 'none',
                  backgroundColor: selectedMarket === m.id ? '#ffffff' : 'transparent',
                  color: selectedMarket === m.id ? '#059669' : '#6b7280',
                  boxShadow: selectedMarket === m.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Snapshot Mode Switcher */}
          {selectedMarket !== "FOREX" && (
            <div style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              padding: '3px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setSnapshotMode("916_OPEN")}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  fontSize: '0.74rem',
                  fontWeight: snapshotMode === "916_OPEN" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "916_OPEN" ? '#059669' : 'transparent',
                  color: snapshotMode === "916_OPEN" ? '#ffffff' : '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Zap size={12} />
                <span>09:16 AM Opening</span>
              </button>
              <button
                onClick={() => setSnapshotMode("LIVE")}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  fontSize: '0.74rem',
                  fontWeight: snapshotMode === "LIVE" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "LIVE" ? '#059669' : 'transparent',
                  color: snapshotMode === "LIVE" ? '#ffffff' : '#6b7280',
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

          {/* Trigger Scan Button */}
          <button
            onClick={() => fetchScan(true, selectedMarket, snapshotMode)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '12px',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '700',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 10px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Scanning..." : "Rescan Now"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Top 4 SaaS Breadth & Market Flow Metrics Ribbon ─────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Metric 1: Advance / Decline Breadth */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Market Sentiment Breadth
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: advancePct >= 50 ? '#e6f4ea' : '#fee2e2',
              color: advancePct >= 50 ? '#059669' : '#dc2626'
            }}>
              A/D {breadth.advance_decline_ratio || (advancers / (decliners || 1)).toFixed(1)}x
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px 0' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#059669' }}>
              ▲ {advancers}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: '600' }}>vs</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#dc2626' }}>
              ▼ {decliners}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280', marginLeft: 'auto' }}>
              {advancePct}% Bullish
            </span>
          </div>

          {/* Multi-color Flow Progress Bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: '#fee2e2', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${advancePct}%`,
              height: '100%',
              backgroundColor: '#059669',
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Metric 2: Relative Volume Accumulation */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Volume Surge Velocity
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              SURGE DETECTED
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '8px 0 4px 0' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827' }}>
              {breadth.avg_rvol || 1.1}x
            </span>
            <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: '600' }}>
              Average RVOL
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: '#6b7280' }}>
            Relative to 20-day historical opening volume
          </div>
        </div>

        {/* Metric 3: Dominant Sector Momentum */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Leading Sector Velocity
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: '#f3f4f6',
              color: '#374151'
            }}>
              ROTATION
            </span>
          </div>

          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669', margin: '8px 0 4px 0' }}>
            {breadth.dominant_sector || "Banking & Financials"}
          </div>

          <div style={{ fontSize: '0.74rem', color: '#6b7280' }}>
            Highest concentration of morning breakouts
          </div>
        </div>

        {/* Metric 4: Scheduler & Cron Daemon Status */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Next Scheduled Scan
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              DAEMON ARMED
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0 4px 0' }}>
            <Clock size={18} color="#059669" />
            <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#111827' }}>
              {scanData?.next_scheduled_scan || "09:16 AM IST"}
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: '#6b7280' }}>
            Candle As-Of: <b style={{ color: '#111827' }}>{scanData?.latest_bar_time || "09:15 AM"}</b>
          </div>
        </div>
      </div>

      {/* ── 3. Dual Spotlight Hero Breakouts (Long vs Short) ───────────── */}
      <div className="quant-grid-split" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
      }}>
        {/* Card A: Top Long Breakout Spotlight */}
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          borderRadius: '20px',
          padding: '24px',
          color: '#ffffff',
          boxShadow: '0 8px 24px -4px rgba(5, 150, 105, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Background Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            pointerEvents: 'none'
          }} />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  ⚡ PRIME LONG BREAKOUT
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  backgroundColor: '#ffffff',
                  color: '#059669',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '800',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                padding: '3px 9px',
                borderRadius: '8px'
              }}>
                RVOL {topLong?.rvol || 1.2}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
                  {topLong ? topLong.symbol : "Scanning Breakouts..."}
                </div>
                <div style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '2px' }}>
                  {topLong ? `${topLong.name} • ${topLong.sector}` : "Awaiting morning volume surge"}
                </div>
              </div>

              {topLong && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                    {currentCurrency}{topLong.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    marginTop: '2px'
                  }}>
                    <ArrowUpRight size={13} />
                    <span>{topLong.change_pct >= 0 ? '+' : ''}{topLong.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signal & Target Matrix */}
            {topLong && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.12)'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', marginTop: '2px' }}>{topLong.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', marginTop: '2px', color: '#a7f3d0' }}>
                    {currentCurrency}{topLong.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', marginTop: '2px', color: '#fecaca' }}>
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
              borderTop: '1px solid rgba(255,255,255,0.2)',
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', opacity: 0.9 }}>
                Strategy: <b>{topLong.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topLong.symbol, topLong.suggested_strategy)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    border: '1px solid rgba(255,255,255,0.3)',
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
                    padding: '7px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    color: '#059669',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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

        {/* Card B: Top Short Breakdown Spotlight */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '24px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  🔻 PRIME SHORT BREAKDOWN
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '800',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                padding: '3px 9px',
                borderRadius: '8px'
              }}>
                RVOL {topShort?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em' }}>
                  {topShort ? topShort.symbol : "No Active Short Breakdown"}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '2px' }}>
                  {topShort ? `${topShort.name} • ${topShort.sector}` : "Market displaying positive or neutral opening flow"}
                </div>
              </div>

              {topShort && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827' }}>
                    {currentCurrency}{topShort.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    marginTop: '2px'
                  }}>
                    <ArrowDownRight size={13} />
                    <span>{topShort.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signal & Target Matrix */}
            {topShort && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '18px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: '#f9fafb',
                border: '1px solid #f3f4f6'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>{topShort.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                    {currentCurrency}{topShort.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>
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
              borderTop: '1px solid #f3f4f6',
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
                Strategy: <b style={{ color: '#111827' }}>{topShort.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topShort.symbol, topShort.suggested_strategy)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    border: '1px solid #d1d5db',
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
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
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

      {/* ── 4. Screener Controls Bar (Filter Chips, Search, Sort, View) ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '12px 18px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: "ALL", label: "All Assets", count: counts.all },
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
                borderRadius: '9px',
                fontSize: '0.76rem',
                fontWeight: filterType === f.id ? '700' : '600',
                border: 'none',
                backgroundColor: filterType === f.id ? '#059669' : '#f3f4f6',
                color: filterType === f.id ? '#ffffff' : '#4b5563',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{f.label}</span>
              <span style={{
                fontSize: '0.68rem',
                padding: '1px 5px',
                borderRadius: '6px',
                backgroundColor: filterType === f.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                color: filterType === f.id ? '#ffffff' : '#374151'
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Right Search & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '6px 12px'
          }}>
            <Search size={14} color="#9ca3af" />
            <input
              type="text"
              placeholder="Search ticker, company, sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '0.78rem',
                width: '200px',
                color: '#111827'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '600' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                color: '#111827',
                fontSize: '0.76rem',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALPHA">Alpha Score</option>
              <option value="RVOL">RVOL (Highest)</option>
              <option value="CHANGE">% Change</option>
              <option value="GAP">Gap %</option>
            </select>
          </div>

          {/* Table vs Grid Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f3f4f6',
            padding: '3px',
            borderRadius: '9px',
            border: '1px solid #e5e7eb'
          }}>
            <button
              onClick={() => setViewMode("TABLE")}
              title="Table View"
              style={{
                padding: '5px 8px',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: viewMode === "TABLE" ? '#ffffff' : 'transparent',
                color: viewMode === "TABLE" ? '#059669' : '#6b7280',
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
                backgroundColor: viewMode === "GRID" ? '#ffffff' : 'transparent',
                color: viewMode === "GRID" ? '#059669' : '#6b7280',
                cursor: 'pointer'
              }}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Main Content: Table View vs Cards Grid View ─────────────── */}
      {viewMode === "TABLE" ? (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 18px' }}>Instrument & Sector</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Change %</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Open Gap %</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>RVOL</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>VWAP</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>15m ORB Channel</th>
                  <th style={{ padding: '12px 18px' }}>Setup Signal</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right' }}>Target (2R) / SL</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center' }}>Quick Deploy</th>
                </tr>
              </thead>
              <tbody>
                {processedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                      <AlertCircle size={28} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>No instruments match the selected criteria</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>Try switching filters or clearing your search term</div>
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
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {/* Ticker & Sector */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: '800', color: '#111827', fontSize: '0.88rem' }}>
                              {stock.symbol}
                            </div>
                            <span style={{
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '5px',
                              backgroundColor: '#e6f4ea',
                              color: '#059669'
                            }}>
                              Score: {stock.alpha_score || 85}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>
                            {stock.name} • <span style={{ color: '#4b5563', fontWeight: '600' }}>{stock.sector}</span>
                          </div>
                        </td>

                        {/* Price */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800', color: '#111827', fontSize: '0.88rem' }}>
                          {currentCurrency}{stock.price.toFixed(2)}
                        </td>

                        {/* Change % */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            color: stock.change_pct >= 0 ? '#059669' : '#dc2626'
                          }}>
                            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                          </span>
                        </td>

                        {/* Open Gap % */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '700', color: stock.gap_pct >= 0 ? '#059669' : '#dc2626' }}>
                          {stock.gap_pct >= 0 ? '+' : ''}{stock.gap_pct}%
                        </td>

                        {/* RVOL Badge */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '7px',
                            fontSize: '0.74rem',
                            fontWeight: '800',
                            backgroundColor: stock.rvol >= 1.2 ? '#e6f4ea' : (stock.rvol >= 0.9 ? '#f3f4f6' : '#fff1f2'),
                            color: stock.rvol >= 1.2 ? '#059669' : (stock.rvol >= 0.9 ? '#374151' : '#be123c')
                          }}>
                            {stock.rvol}x
                          </span>
                        </td>

                        {/* VWAP */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: '#111827' }}>{currentCurrency}{stock.vwap}</div>
                          <span style={{ fontSize: '0.66rem', fontWeight: '700', color: stock.is_above_vwap ? '#059669' : '#dc2626' }}>
                            {stock.is_above_vwap ? '▲ Above VWAP' : '▼ Below VWAP'}
                          </span>
                        </td>

                        {/* 15m ORB Channel */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                            H: {stock.orb_high} | L: {stock.orb_low}
                          </div>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            color: stock.orb_status === 'BREAKOUT_HIGH' ? '#059669' : (stock.orb_status === 'BREAKDOWN_LOW' ? '#dc2626' : '#9ca3af')
                          }}>
                            {stock.orb_status === 'BREAKOUT_HIGH' ? '⚡ High Breakout' : (stock.orb_status === 'BREAKDOWN_LOW' ? '🔻 Low Breakdown' : 'Inside Range')}
                          </span>
                        </td>

                        {/* Setup Signal */}
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            backgroundColor: isLong ? '#e6f4ea' : (isShort ? '#fee2e2' : '#f3f4f6'),
                            color: isLong ? '#059669' : (isShort ? '#dc2626' : '#4b5563')
                          }}>
                            {stock.setup_signal}
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '3px' }}>
                            Strategy: {stock.suggested_strategy.replace('NSE ', '')}
                          </div>
                        </td>

                        {/* Target & SL */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ color: '#059669', fontWeight: '800', fontSize: '0.76rem' }}>
                            TP: {currentCurrency}{stock.target_2r}
                          </div>
                          <div style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: '700' }}>
                            SL: {currentCurrency}{stock.stop_loss}
                          </div>
                        </td>

                        {/* Quick Actions */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                              disabled={isArming}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 11px',
                                borderRadius: '8px',
                                backgroundColor: isLong ? '#059669' : (isShort ? '#dc2626' : '#111827'),
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
                                backgroundColor: '#f3f4f6',
                                color: '#374151',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                border: '1px solid #e5e7eb',
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
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '18px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.03)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#111827' }}>
                        {stock.symbol}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                        {stock.name} • {stock.sector}
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      backgroundColor: stock.rvol >= 1.2 ? '#e6f4ea' : '#f3f4f6',
                      color: stock.rvol >= 1.2 ? '#059669' : '#374151'
                    }}>
                      RVOL {stock.rvol}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827' }}>
                      {currentCurrency}{stock.price.toFixed(2)}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.78rem',
                      fontWeight: '800',
                      color: stock.change_pct >= 0 ? '#059669' : '#dc2626'
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
                    backgroundColor: '#f9fafb',
                    fontSize: '0.72rem'
                  }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>VWAP: </span>
                      <b style={{ color: '#111827' }}>{stock.vwap}</b>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Gap: </span>
                      <b style={{ color: stock.gap_pct >= 0 ? '#059669' : '#dc2626' }}>{stock.gap_pct}%</b>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Target: </span>
                      <b style={{ color: '#059669' }}>{stock.target_2r}</b>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Stop: </span>
                      <b style={{ color: '#dc2626' }}>{stock.stop_loss}</b>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      backgroundColor: isLong ? '#e6f4ea' : (isShort ? '#fee2e2' : '#f3f4f6'),
                      color: isLong ? '#059669' : (isShort ? '#dc2626' : '#4b5563')
                    }}>
                      {stock.setup_signal}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
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
                      backgroundColor: isLong ? '#059669' : (isShort ? '#dc2626' : '#111827'),
                      color: '#ffffff',
                      fontSize: '0.75rem',
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
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      border: '1px solid #e5e7eb',
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

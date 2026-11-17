import React, { useState, useEffect, useMemo } from 'react';
import CompanyLogo from './CompanyLogo';
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
  const [filterType, setFilterType] = useState("ALL"); // ALL, LONGS, SHORTS, HIGHRVOL, GAPS, HIGHEDGE
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
          strategy_name: strategyName || "NSE Intraday ORB Breakout",
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
      if (filterType === "HIGHEDGE") return (s.hist_pf >= 1.2 || s.edge_tier?.startsWith('A')) && s.whipsaw_risk !== "CRITICAL";
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
      gaps: stocks.filter(s => Math.abs(s.gap_pct) >= 0.5).length,
      highEdge: stocks.filter(s => (s.hist_pf >= 1.2 || s.edge_tier?.startsWith('A')) && s.whipsaw_risk !== "CRITICAL").length
    };
  }, [stocks]);

  const advancers = breadth.advancers || 0;
  const decliners = breadth.decliners || 0;
  const totalBreath = advancers + decliners || 1;
  const advancePct = Math.round((advancers / totalBreath) * 100);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      padding: '28px 32px',
      maxWidth: '1440px',
      margin: '0 auto',
      width: '100%',
      backgroundColor: '#080A0B',
      color: '#F1F3F4',
      fontFamily: "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>

      {/* ── 1. Top Header & Command Toolbar ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid #252A2C',
        paddingBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              border: '1px solid rgba(0, 208, 156, 0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D09C',
              boxShadow: '0 4px 14px rgba(0, 208, 156, 0.2)'
            }}>
              <Zap size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#F1F3F4', letterSpacing: '-0.02em', margin: 0 }}>
                  Morning Breakout & Flow Screener
                </h1>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  backgroundColor: scanData?.is_market_open ? 'rgba(0, 208, 156, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: scanData?.is_market_open ? '#00D09C' : '#F59E0B',
                  border: `1px solid ${scanData?.is_market_open ? 'rgba(0, 208, 156, 0.28)' : 'rgba(245, 158, 11, 0.28)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span
                    className={scanData?.is_market_open ? "pulse-mint-dot" : ""}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: scanData?.is_market_open ? '#00D09C' : '#F59E0B'
                    }}
                  />
                  {scanData?.market_status || "Session Active"}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#92999C', marginTop: '4px', margin: 0 }}>
                Autonomous 09:16 AM Opening Surge, Relative Volume (RVOL), and 15m ORB Channel Breakouts
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls: Market Tabs, Snapshot & Rescan Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Market Selector Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#151819',
            padding: '3px',
            borderRadius: '12px',
            border: '1px solid #252A2C'
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
                  backgroundColor: selectedMarket === m.id ? 'rgba(0, 208, 156, 0.14)' : 'transparent',
                  color: selectedMarket === m.id ? '#00D09C' : '#92999C',
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
              backgroundColor: '#151819',
              padding: '3px',
              borderRadius: '12px',
              border: '1px solid #252A2C'
            }}>
              <button
                onClick={() => setSnapshotMode("916_OPEN")}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  fontSize: '0.74rem',
                  fontWeight: snapshotMode === "916_OPEN" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "916_OPEN" ? '#00D09C' : 'transparent',
                  color: snapshotMode === "916_OPEN" ? '#080A0B' : '#92999C',
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
                  backgroundColor: snapshotMode === "LIVE" ? '#00D09C' : 'transparent',
                  color: snapshotMode === "LIVE" ? '#080A0B' : '#92999C',
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
            className="btn-groww-primary"
            style={{
              padding: '8px 18px',
              fontSize: '0.82rem'
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Scanning..." : "Rescan Now"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Top 4 Market Breadth Metrics Ribbon ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Metric 1: Advance / Decline Breadth */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'transform 0.15s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Market Sentiment Breadth
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: advancePct >= 50 ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
              color: advancePct >= 50 ? '#00D09C' : '#EB5B3C'
            }}>
              A/D {breadth.advance_decline_ratio || (advancers / (decliners || 1)).toFixed(1)}x
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px 0' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#00D09C' }} className="font-tabular">
              ▲ {advancers}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#626A6E', fontWeight: '600' }}>vs</span>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#EB5B3C' }} className="font-tabular">
              ▼ {decliners}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#92999C', marginLeft: 'auto' }}>
              {advancePct}% Bullish
            </span>
          </div>

          {/* Two-Tone Flow Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(235, 91, 60, 0.25)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${advancePct}%`,
              height: '100%',
              backgroundColor: '#00D09C',
              borderRadius: '3px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Metric 2: Relative Volume Accumulation */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Volume Surge Velocity
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C'
            }}>
              SURGE ACTIVE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '8px 0 4px 0' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
              {breadth.avg_rvol || 1.1}x
            </span>
            <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600' }}>
              Average RVOL
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: '#626A6E' }}>
            Relative to 20-day opening surge window
          </div>
        </div>

        {/* Metric 3: Dominant Sector Momentum */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Leading Sector Velocity
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: '#101314',
              color: '#92999C'
            }}>
              ROTATION
            </span>
          </div>

          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#00D09C', margin: '8px 0 4px 0' }}>
            {breadth.dominant_sector || "Banking & Financials"}
          </div>

          <div style={{ fontSize: '0.74rem', color: '#626A6E' }}>
            Highest concentration of morning breakouts
          </div>
        </div>

        {/* Metric 4: Scheduler & Daemon Status */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Next Scheduled Scan
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C'
            }}>
              DAEMON ARMED
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0 4px 0' }}>
            <Clock size={18} color="#00D09C" />
            <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#F1F3F4' }}>
              {scanData?.next_scheduled_scan || "09:16 AM IST"}
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: '#626A6E' }}>
            Candle As-Of: <b style={{ color: '#F1F3F4' }}>{scanData?.latest_bar_time || "09:15 AM"}</b>
          </div>
        </div>
      </div>

      {/* ── 3. Dual Spotlight Hero Breakouts (Prime Long vs Prime Short) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>
        {/* Card A: Top Long Breakout Spotlight */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #202426',
          borderTop: '3px solid #00D09C',
          color: '#F1F3F4',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  backgroundColor: 'rgba(0, 208, 156, 0.12)',
                  color: '#00D09C',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  ⚡ PRIME LONG BREAKOUT
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  backgroundColor: '#00D09C',
                  color: '#080A0B',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '700',
                backgroundColor: '#101314',
                color: '#00D09C',
                border: '1px solid rgba(0, 208, 156, 0.28)',
                padding: '3px 9px',
                borderRadius: '8px'
              }}>
                RVOL {topLong?.rvol || 1.2}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {topLong && <CompanyLogo symbol={topLong.symbol} name={topLong.name} size={38} />}
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#F1F3F4' }}>
                    {topLong ? topLong.symbol : "Scanning Breakouts..."}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#92999C', marginTop: '2px' }}>
                    {topLong ? `${topLong.name} • ${topLong.sector}` : "Awaiting morning volume surge"}
                  </div>
                </div>
              </div>

              {topLong && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                    {currentCurrency}{topLong.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    color: '#00D09C',
                    marginTop: '2px'
                  }} className="font-tabular">
                    <ArrowUpRight size={14} />
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
                backgroundColor: '#080A0B',
                border: '1px solid #252A2C'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#00D09C', marginTop: '2px' }}>{topLong.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', marginTop: '2px', color: '#00D09C' }} className="font-tabular">
                    {currentCurrency}{topLong.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', marginTop: '2px', color: '#EB5B3C' }} className="font-tabular">
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
              borderTop: '1px solid #252A2C',
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#92999C' }}>
                Strategy: <b style={{ color: '#F1F3F4' }}>{topLong.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topLong.symbol, topLong.suggested_strategy)}
                  className="btn-groww-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  Backtest ↗
                </button>
                <button
                  onClick={() => handleArmBot(topLong.symbol, topLong.suggested_strategy)}
                  disabled={armingSymbol === topLong.symbol}
                  className="btn-groww-primary"
                  style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                >
                  {armingSymbol === topLong.symbol ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Bot size={12} />
                  )}
                  <span>Arm Live Bot</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card B: Top Short Breakdown Spotlight */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #202426',
          borderTop: '3px solid #EB5B3C',
          color: '#F1F3F4',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  backgroundColor: 'rgba(235, 91, 60, 0.12)',
                  color: '#EB5B3C',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  🔻 PRIME SHORT BREAKDOWN
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  backgroundColor: '#EB5B3C',
                  color: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: '6px'
                }}>
                  Rank #1
                </span>
              </div>

              <span style={{
                fontSize: '0.74rem',
                fontWeight: '700',
                backgroundColor: '#101314',
                color: '#EB5B3C',
                border: '1px solid rgba(235, 91, 60, 0.28)',
                padding: '3px 9px',
                borderRadius: '8px'
              }}>
                RVOL {topShort?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {topShort && <CompanyLogo symbol={topShort.symbol} name={topShort.name} size={38} />}
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#F1F3F4' }}>
                    {topShort ? topShort.symbol : "No Active Short Breakdown"}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#92999C', marginTop: '2px' }}>
                    {topShort ? `${topShort.name} • ${topShort.sector}` : "Market displaying positive opening momentum"}
                  </div>
                </div>
              </div>

              {topShort && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                    {currentCurrency}{topShort.price.toFixed(2)}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    color: '#EB5B3C',
                    marginTop: '2px'
                  }} className="font-tabular">
                    <ArrowDownRight size={14} />
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
                backgroundColor: '#080A0B',
                border: '1px solid #252A2C'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Setup Signal</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#EB5B3C', marginTop: '2px' }}>{topShort.setup_signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Target 2R</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#00D09C', marginTop: '2px' }} className="font-tabular">
                    {currentCurrency}{topShort.target_2r}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '700' }}>Stop Loss</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#EB5B3C', marginTop: '2px' }} className="font-tabular">
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
              borderTop: '1px solid #252A2C',
              paddingTop: '14px',
              marginTop: '16px'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#92999C' }}>
                Strategy: <b style={{ color: '#F1F3F4' }}>{topShort.suggested_strategy.replace('NSE ', '')}</b>
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onSelectForBacktest(topShort.symbol, topShort.suggested_strategy)}
                  className="btn-groww-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  Backtest ↗
                </button>
                <button
                  onClick={() => handleArmBot(topShort.symbol, topShort.suggested_strategy)}
                  disabled={armingSymbol === topShort.symbol}
                  className="btn-groww-danger"
                  style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                >
                  {armingSymbol === topShort.symbol ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Bot size={12} />
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
        backgroundColor: '#151819',
        borderRadius: '16px',
        padding: '14px 20px',
        border: '1px solid #252A2C'
      }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: "ALL", label: "All Assets", count: counts.all },
            { id: "HIGHEDGE", label: "🏆 High Conviction Edge", count: counts.highEdge },
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
                fontSize: '0.76rem',
                fontWeight: filterType === f.id ? '700' : '600',
                border: '1px solid',
                borderColor: filterType === f.id ? '#00D09C' : '#252A2C',
                backgroundColor: filterType === f.id ? 'rgba(0, 208, 156, 0.14)' : '#080A0B',
                color: filterType === f.id ? '#00D09C' : '#92999C',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{f.label}</span>
              <span style={{
                fontSize: '0.68rem',
                padding: '1px 5px',
                borderRadius: '6px',
                backgroundColor: filterType === f.id ? 'rgba(0, 208, 156, 0.25)' : '#151819',
                color: filterType === f.id ? '#00D09C' : '#626A6E'
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Right Search, Sort & View Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#080A0B',
            border: '1px solid #252A2C',
            borderRadius: '10px',
            padding: '6px 12px'
          }}>
            <Search size={14} color="#92999C" />
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
                width: '180px',
                color: '#F1F3F4'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ border: 'none', background: 'none', color: '#92999C', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #252A2C',
                backgroundColor: '#080A0B',
                color: '#F1F3F4',
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
            backgroundColor: '#080A0B',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #252A2C'
          }}>
            <button
              onClick={() => setViewMode("TABLE")}
              title="Table View"
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === "TABLE" ? 'rgba(0, 208, 156, 0.15)' : 'transparent',
                color: viewMode === "TABLE" ? '#00D09C' : '#92999C',
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
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === "GRID" ? 'rgba(0, 208, 156, 0.15)' : 'transparent',
                color: viewMode === "GRID" ? '#00D09C' : '#92999C',
                cursor: 'pointer'
              }}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Main Content: Table View vs Cards Grid View ── */}
      {viewMode === "TABLE" ? (
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          border: '1px solid #252A2C',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#101314', color: '#92999C', borderBottom: '1px solid #252A2C', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '14px 18px' }}>Instrument & Sector</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Change %</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Open Gap %</th>
                  <th style={{ padding: '14px 18px', textAlign: 'center' }}>RVOL</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>VWAP</th>
                  <th style={{ padding: '14px 18px', textAlign: 'center' }}>15m ORB Channel</th>
                  <th style={{ padding: '14px 18px' }}>Setup Signal</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Target (2R) / SL</th>
                  <th style={{ padding: '14px 18px', textAlign: 'center' }}>Quick Action</th>
                </tr>
              </thead>
              <tbody>
                {processedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: '#92999C' }}>
                      <AlertCircle size={28} color="#92999C" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#F1F3F4' }}>No instruments match the selected criteria</div>
                      <div style={{ fontSize: '0.78rem', color: '#626A6E', marginTop: '2px' }}>Try switching filters or clearing your search term</div>
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
                          borderBottom: '1px solid #252A2C',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1c2022'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {/* Ticker & Sector */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: '800', color: '#F1F3F4', fontSize: '0.88rem' }}>
                              {stock.symbol}
                            </div>
                            <span style={{
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '5px',
                              backgroundColor: 'rgba(0, 208, 156, 0.12)',
                              color: '#00D09C'
                            }}>
                              Score: {stock.alpha_score || 85}
                            </span>
                            {stock.hist_wr && (
                              <span style={{
                                fontSize: '0.64rem',
                                fontWeight: '800',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                backgroundColor: stock.whipsaw_risk === 'LOW' ? 'rgba(0, 208, 156, 0.12)' : (stock.whipsaw_risk === 'CRITICAL' ? 'rgba(235, 91, 60, 0.12)' : 'rgba(245, 158, 11, 0.12)'),
                                color: stock.whipsaw_risk === 'LOW' ? '#00D09C' : (stock.whipsaw_risk === 'CRITICAL' ? '#EB5B3C' : '#F59E0B'),
                                border: `1px solid ${stock.whipsaw_risk === 'LOW' ? 'rgba(0, 208, 156, 0.28)' : (stock.whipsaw_risk === 'CRITICAL' ? 'rgba(235, 91, 60, 0.28)' : 'rgba(245, 158, 11, 0.28)')}`
                              }}>
                                {stock.whipsaw_risk === 'CRITICAL' ? '⚠️ Whipsaw Risk' : `Tier ${stock.edge_tier} (${stock.hist_wr}% WR)`}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#92999C', marginTop: '2px' }}>
                            {stock.name} • <span style={{ color: '#F1F3F4', fontWeight: '500' }}>{stock.sector}</span>
                          </div>
                        </td>

                        {/* Price */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800', color: '#F1F3F4', fontSize: '0.88rem' }} className="font-tabular">
                          {currentCurrency}{stock.price.toFixed(2)}
                        </td>

                        {/* Change % */}
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '800' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            color: stock.change_pct >= 0 ? '#00D09C' : '#EB5B3C'
                          }} className="font-tabular">
                            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                          </span>
                        </td>

                        {/* Open Gap % */}
                        <td style={{
                          padding: '14px 18px',
                          textAlign: 'right',
                          fontWeight: '700',
                          color: stock.gap_pct >= 0 ? '#00D09C' : '#EB5B3C'
                        }} className="font-tabular">
                          {stock.gap_pct >= 0 ? '+' : ''}{stock.gap_pct}%
                        </td>

                        {/* RVOL Badge */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '7px',
                            fontSize: '0.74rem',
                            fontWeight: '800',
                            backgroundColor: stock.rvol >= 1.2 ? 'rgba(0, 208, 156, 0.12)' : (stock.rvol >= 0.9 ? '#101314' : 'rgba(235, 91, 60, 0.12)'),
                            color: stock.rvol >= 1.2 ? '#00D09C' : (stock.rvol >= 0.9 ? '#F1F3F4' : '#EB5B3C'),
                            border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(0, 208, 156, 0.28)' : '#252A2C'}`
                          }} className="font-tabular">
                            {stock.rvol}x
                          </span>
                        </td>

                        {/* VWAP */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">{currentCurrency}{stock.vwap}</div>
                          <span style={{ fontSize: '0.66rem', fontWeight: '700', color: stock.is_above_vwap ? '#00D09C' : '#EB5B3C' }}>
                            {stock.is_above_vwap ? '▲ Above VWAP' : '▼ Below VWAP'}
                          </span>
                        </td>

                        {/* 15m ORB Channel */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.72rem', color: '#92999C' }} className="font-tabular">
                            H: {stock.orb_high} | L: {stock.orb_low}
                          </div>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            color: stock.orb_status === 'BREAKOUT_HIGH' ? '#00D09C' : (stock.orb_status === 'BREAKDOWN_LOW' ? '#EB5B3C' : '#626A6E')
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
                            backgroundColor: isLong ? 'rgba(0, 208, 156, 0.12)' : (isShort ? 'rgba(235, 91, 60, 0.12)' : '#101314'),
                            color: isLong ? '#00D09C' : (isShort ? '#EB5B3C' : '#92999C'),
                            border: `1px solid ${isLong ? 'rgba(0, 208, 156, 0.28)' : (isShort ? 'rgba(235, 91, 60, 0.28)' : '#252A2C')}`
                          }}>
                            {stock.setup_signal}
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#92999C', marginTop: '3px' }}>
                            {stock.suggested_strategy.replace('NSE ', '')}
                          </div>
                        </td>

                        {/* Target & SL */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ color: '#00D09C', fontWeight: '800', fontSize: '0.76rem' }} className="font-tabular">
                            TP: {currentCurrency}{stock.target_2r}
                          </div>
                          <div style={{ color: '#EB5B3C', fontSize: '0.72rem', fontWeight: '700' }} className="font-tabular">
                            SL: {currentCurrency}{stock.stop_loss}
                          </div>
                        </td>

                        {/* Quick Actions */}
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                              disabled={isArming}
                              className={isLong ? "btn-groww-primary" : "btn-groww-danger"}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                borderRadius: '8px'
                              }}
                              title="Arm live paper bot on this stock"
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
                              className="btn-groww-secondary"
                              style={{
                                padding: '6px 10px',
                                fontSize: '0.75rem',
                                borderRadius: '8px'
                              }}
                              title="Open in Strategy Studio"
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
                className="groww-stock-card"
                style={{
                  minHeight: '230px',
                  gap: '14px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#F1F3F4' }}>
                        {stock.symbol}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#92999C' }}>
                        {stock.name} • {stock.sector}
                      </div>
                      {stock.hist_wr && (
                        <div style={{ marginTop: '5px' }}>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: '800',
                            padding: '2px 6px',
                            borderRadius: '5px',
                            backgroundColor: stock.whipsaw_risk === 'LOW' ? 'rgba(0, 208, 156, 0.12)' : (stock.whipsaw_risk === 'CRITICAL' ? 'rgba(235, 91, 60, 0.12)' : 'rgba(245, 158, 11, 0.12)'),
                            color: stock.whipsaw_risk === 'LOW' ? '#00D09C' : (stock.whipsaw_risk === 'CRITICAL' ? '#EB5B3C' : '#F59E0B'),
                            border: `1px solid ${stock.whipsaw_risk === 'LOW' ? 'rgba(0, 208, 156, 0.28)' : (stock.whipsaw_risk === 'CRITICAL' ? 'rgba(235, 91, 60, 0.28)' : 'rgba(245, 158, 11, 0.28)')}`
                          }}>
                            {stock.whipsaw_risk === 'CRITICAL' ? '⚠️ Whipsaw Risk' : `Tier ${stock.edge_tier} (${stock.hist_wr}% WR)`}
                          </span>
                        </div>
                      )}
                    </div>

                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      backgroundColor: stock.rvol >= 1.2 ? 'rgba(0, 208, 156, 0.12)' : '#101314',
                      color: stock.rvol >= 1.2 ? '#00D09C' : '#92999C',
                      border: `1px solid ${stock.rvol >= 1.2 ? 'rgba(0, 208, 156, 0.28)' : '#252A2C'}`
                    }} className="font-tabular">
                      RVOL {stock.rvol}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                      {currentCurrency}{stock.price.toFixed(2)}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.78rem',
                      fontWeight: '800',
                      color: stock.change_pct >= 0 ? '#00D09C' : '#EB5B3C'
                    }} className="font-tabular">
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
                    backgroundColor: '#080A0B',
                    border: '1px solid #252A2C',
                    fontSize: '0.72rem'
                  }}>
                    <div>
                      <span style={{ color: '#92999C' }}>VWAP: </span>
                      <b style={{ color: '#F1F3F4' }} className="font-tabular">{stock.vwap}</b>
                    </div>
                    <div>
                      <span style={{ color: '#92999C' }}>Gap: </span>
                      <b style={{ color: stock.gap_pct >= 0 ? '#00D09C' : '#EB5B3C' }} className="font-tabular">{stock.gap_pct}%</b>
                    </div>
                    <div>
                      <span style={{ color: '#92999C' }}>Target: </span>
                      <b style={{ color: '#00D09C' }} className="font-tabular">{stock.target_2r}</b>
                    </div>
                    <div>
                      <span style={{ color: '#92999C' }}>Stop: </span>
                      <b style={{ color: '#EB5B3C' }} className="font-tabular">{stock.stop_loss}</b>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      backgroundColor: isLong ? 'rgba(0, 208, 156, 0.12)' : (isShort ? 'rgba(235, 91, 60, 0.12)' : '#101314'),
                      color: isLong ? '#00D09C' : (isShort ? '#EB5B3C' : '#92999C'),
                      border: `1px solid ${isLong ? 'rgba(0, 208, 156, 0.28)' : (isShort ? 'rgba(235, 91, 60, 0.28)' : '#252A2C')}`
                    }}>
                      {stock.setup_signal}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #252A2C', paddingTop: '10px' }}>
                  <button
                    onClick={() => handleArmBot(stock.symbol, stock.suggested_strategy)}
                    disabled={isArming}
                    className={isLong ? "btn-groww-primary" : "btn-groww-danger"}
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.75rem',
                      justifyContent: 'center'
                    }}
                  >
                    {isArming ? <RefreshCw size={12} className="animate-spin" /> : <Bot size={12} />}
                    <span>Arm Live Bot</span>
                  </button>

                  <button
                    onClick={() => onSelectForBacktest(stock.symbol, stock.suggested_strategy)}
                    className="btn-groww-secondary"
                    style={{
                      padding: '8px 12px',
                      fontSize: '0.75rem'
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

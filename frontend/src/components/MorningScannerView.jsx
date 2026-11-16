import React, { useState, useEffect } from 'react';
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
  Radio
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

  const stocks = scanData?.stocks || [];
  const breadth = scanData?.market_breadth || {};
  const topLong = scanData?.top_longs?.[0] || null;
  const topShort = scanData?.top_shorts?.[0] || null;

  const currentCurrency = scanData?.currency || (selectedMarket === "INDIA" ? "₹" : (selectedMarket === "US" ? "$" : ""));

  // Filter logic
  const filteredStocks = stocks.filter(s => {
    const query = searchQuery.toUpperCase();
    const matchQuery = s.symbol.includes(query) || s.name.toUpperCase().includes(query) || (s.sector && s.sector.toUpperCase().includes(query));
    if (!matchQuery) return false;

    if (filterType === "LONGS") return s.setup_action === "BUY" || s.setup_action === "BUY ON RETEST";
    if (filterType === "SHORTS") return s.setup_action === "SELL / SHORT";
    if (filterType === "HIGHRVOL") return s.rvol >= 1.0;
    if (filterType === "GAPS") return Math.abs(s.gap_pct) >= 0.7;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '28px 36px', maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* ── Page Header Banner ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.02em' }}>
              Multi-Market Opening & Intraday Scanner
            </h1>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 9px',
              borderRadius: '20px',
              backgroundColor: '#e6f4ea',
              color: '#059669',
              letterSpacing: '0.04em'
            }}>
              {selectedMarket === "INDIA" ? "NSE MIS 09:16 AM" : (selectedMarket === "US" ? "US EQUITIES 09:31 AM ET" : "FOREX 24/5 ANYTIME")}
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
            Automated Relative Volume (RVOL), 15m ORB Breakouts, VWAP Reversals & Gap Setups
          </p>
        </div>

        {/* Scan Status & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => fetchScan(true, selectedMarket, snapshotMode)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '12px',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '700',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              transition: 'background-color 0.15s'
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Scan {selectedMarket} Now</span>
          </button>
        </div>
      </div>

      {/* ── Market & Snapshot Mode Control Bar ──────────────────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '18px',
        padding: '16px 22px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* Market Selector Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Market:
          </span>
          <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '3px', borderRadius: '10px' }}>
            {[
              { id: "INDIA", label: "🇮🇳 NSE India", sub: "09:16 AM Auto" },
              { id: "US", label: "🇺🇸 US Equities", sub: "09:31 AM ET" },
              { id: "FOREX", label: "🌍 Forex", sub: "24/5 Any Time" }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: selectedMarket === m.id ? '700' : '500',
                  border: 'none',
                  backgroundColor: selectedMarket === m.id ? '#ffffff' : 'transparent',
                  color: selectedMarket === m.id ? '#059669' : '#6b7280',
                  boxShadow: selectedMarket === m.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Snapshot Mode (Opening vs Live) */}
        {selectedMarket !== "FOREX" ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Snapshot Mode:
            </span>
            <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '3px', borderRadius: '10px' }}>
              <button
                onClick={() => setSnapshotMode("916_OPEN")}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: snapshotMode === "916_OPEN" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "916_OPEN" ? '#059669' : 'transparent',
                  color: snapshotMode === "916_OPEN" ? '#ffffff' : '#6b7280',
                  cursor: 'pointer'
                }}
              >
                ⚡ {selectedMarket === "INDIA" ? "09:16 AM Opening" : "09:31 AM Opening"}
              </button>
              <button
                onClick={() => setSnapshotMode("LIVE")}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: snapshotMode === "LIVE" ? '700' : '500',
                  border: 'none',
                  backgroundColor: snapshotMode === "LIVE" ? '#059669' : 'transparent',
                  color: snapshotMode === "LIVE" ? '#ffffff' : '#6b7280',
                  cursor: 'pointer'
                }}
              >
                🔄 Live Intraday (Fetch Anytime)
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={14} className="animate-pulse" />
            Continuous 24/5 Live Session Ingestion
          </div>
        )}

        {/* Timestamp & Schedule Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.72rem' }}>
          <div style={{
            padding: '4px 10px',
            borderRadius: '8px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            fontWeight: '600'
          }}>
            📅 Session: <strong>{scanData?.session_date || "Live"}</strong>
          </div>

          <div style={{
            padding: '4px 10px',
            borderRadius: '8px',
            backgroundColor: '#e6f4ea',
            color: '#059669',
            fontWeight: '700'
          }}>
            🕒 Candle As-Of: <strong>{scanData?.latest_bar_time || "Evaluating..."}</strong>
          </div>

          <div style={{
            padding: '4px 10px',
            borderRadius: '8px',
            backgroundColor: scanData?.is_market_open ? '#e6f4ea' : '#fef2f2',
            color: scanData?.is_market_open ? '#059669' : '#dc2626',
            fontWeight: '700'
          }}>
            {scanData?.market_status || "Session Status"}
          </div>
        </div>
      </div>

      {/* ── Scheduled Cron Banner ──────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        padding: '10px 18px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
          <Clock size={14} color="#059669" />
          <span>
            Automated Cron Scheduler: <strong>{scanData?.next_scheduled_scan || "Every weekday 09:16 AM IST"}</strong>.
          </span>
          <span style={{ color: '#94a3b8' }}>•</span>
          <span style={{ color: '#64748b' }}>
            Snapshot preserved automatically; click <strong>"Live Intraday"</strong> to evaluate subsequent market hours anytime!
          </span>
        </div>

        <span style={{
          fontSize: '0.7rem',
          fontWeight: '700',
          padding: '2px 8px',
          borderRadius: '6px',
          backgroundColor: '#e6f4ea',
          color: '#059669'
        }}>
          Scheduler Daemon: Active
        </span>
      </div>

      {/* ── Top 3 Quixotic Hero Cards ──────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr minmax(300px, 340px)',
        gap: '20px'
      }}>
        {/* Card 1: Emerald Hero Card (Top Long Breakout) */}
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #007a4d 100%)',
          borderRadius: '20px',
          padding: '24px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '230px',
          boxShadow: '0 8px 24px -4px rgba(5, 150, 105, 0.35)',
          position: 'relative'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.9 }}>
                ⚡ Prime Long Breakout
              </span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                fontWeight: '700'
              }}>
                RVOL {topLong?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '10px' }}>
              {topLong ? topLong.symbol : (topShort ? "Bearish Opening Flow" : "Scanning Universe...")}
            </div>
            <div style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '2px' }}>
              {topLong ? `${topLong.name} • ${topLong.sector}` : "Market opened with widespread selling; check Short Breakdowns"}
            </div>

            {topLong ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: '800' }}>
                  {currentCurrency}{topLong.price.toFixed(2)}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  color: '#059669',
                  fontSize: '0.75rem',
                  fontWeight: '800'
                }}>
                  <ArrowUpRight size={13} />
                  {topLong.change_pct >= 0 ? '+' : ''}{topLong.change_pct}%
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '12px', fontStyle: 'italic' }}>
                No opening long breakouts qualify RVOL &gt; 1.0 threshold
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: '12px',
            marginTop: '12px'
          }}>
            <div>
              <div style={{ fontSize: '0.68rem', opacity: 0.8 }}>Target (2R) / SL</div>
              <div style={{ fontSize: '0.82rem', fontWeight: '700' }}>
                {topLong ? `${currentCurrency}${topLong.target_2r} / ${currentCurrency}${topLong.stop_loss}` : "N/A"}
              </div>
            </div>

            {topLong && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => onSelectForBacktest(topLong.symbol, topLong.suggested_strategy)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: '#059669',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Backtest →
                </button>
                <button
                  onClick={() => onSelectForBot(topLong.symbol)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Deploy 🤖
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Market Breadth & Sector Velocity */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '22px 26px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
                Market Breadth & Flow Velocity
              </span>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Directional sentiment across {selectedMarket} universe</div>
            </div>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '8px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              {breadth.dominant_sector || "Active"}
            </span>
          </div>

          {/* Advance / Decline Bar */}
          <div style={{ margin: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', marginBottom: '6px' }}>
              <span style={{ color: '#059669' }}>▲ {breadth.advancers || 0} Advancers</span>
              <span style={{ color: '#dc2626' }}>▼ {breadth.decliners || 0} Decliners</span>
            </div>
            <div style={{ width: '100%', height: '10px', backgroundColor: '#fee2e2', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
              <div style={{
                height: '100%',
                width: `${Math.round(((breadth.advancers || 1) / ((breadth.advancers || 1) + (breadth.decliners || 1))) * 100)}%`,
                backgroundColor: '#059669',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          {/* Sector leaders */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Avg Market RVOL</div>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827' }}>
                {breadth.avg_rvol || 1.0}x
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Leading Sector</div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#059669' }}>
                {breadth.dominant_sector || "Technology"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>A/D Ratio</div>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827' }}>
                {breadth.advance_decline_ratio || 1.0}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Prime Short / Breakdown Pick */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          padding: '22px 24px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🔻 Prime Short Breakdown
              </span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontWeight: '700'
              }}>
                RVOL {topShort?.rvol || 1.0}x
              </span>
            </div>

            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#111827', marginTop: '10px' }}>
              {topShort?.symbol || "None"}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '2px' }}>
              {topShort?.name || "No short breakdowns active"}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#111827' }}>
                {currentCurrency}{topShort?.price?.toFixed(2) || "0.00"}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                <ArrowDownRight size={13} />
                {topShort?.change_pct || 0}%
              </span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Target / SL</div>
              <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151' }}>
                {currentCurrency}{topShort?.target_2r} / {currentCurrency}{topShort?.stop_loss}
              </div>
            </div>

            {topShort && (
              <button
                onClick={() => onSelectForBacktest(topShort.symbol, topShort.suggested_strategy)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Backtest →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Pills & Search Bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: "ALL", label: `All Scanned Assets (${stocks.length})` },
            { id: "LONGS", label: "🟢 Prime Longs" },
            { id: "SHORTS", label: "🔴 Prime Shorts" },
            { id: "HIGHRVOL", label: "⚡ High RVOL (>1.0x)" },
            { id: "GAPS", label: "🎯 Gap Plays (>0.7%)" }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '0.78rem',
                fontWeight: filterType === f.id ? '700' : '500',
                border: 'none',
                backgroundColor: filterType === f.id ? '#059669' : '#ffffff',
                color: filterType === f.id ? '#ffffff' : '#4b5563',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <input
          type="text"
          placeholder="Filter by symbol, company, or sector..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '7px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            fontSize: '0.78rem',
            width: '280px',
            outline: 'none',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* ── Scanned Equities Ledger Table ──────────────────────────────── */}
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
                <th style={{ padding: '12px 18px', textAlign: 'center' }}>ORB Range</th>
                <th style={{ padding: '12px 18px' }}>Setup Signal</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Stop / 2R Target</th>
                <th style={{ padding: '12px 18px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    No instruments matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock) => {
                  const isLong = stock.setup_action === "BUY" || stock.setup_action === "BUY ON RETEST";
                  const isShort = stock.setup_action === "SELL / SHORT";

                  return (
                    <tr
                      key={stock.symbol}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Ticker & Sector */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: '700', color: '#111827', fontSize: '0.85rem' }}>
                          {stock.symbol}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                          {stock.name} • <span style={{ color: '#059669', fontWeight: '600' }}>{stock.sector}</span>
                        </div>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '700', color: '#111827' }}>
                        {currentCurrency}{stock.price.toFixed(2)}
                      </td>

                      {/* Change % */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '700', color: stock.change_pct >= 0 ? '#059669' : '#dc2626' }}>
                        {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct}%
                      </td>

                      {/* Open Gap % */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '600', color: stock.gap_pct >= 0 ? '#059669' : '#dc2626' }}>
                        {stock.gap_pct >= 0 ? '+' : ''}{stock.gap_pct}%
                      </td>

                      {/* RVOL Badge */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: '800',
                          backgroundColor: stock.rvol >= 1.2 ? '#e6f4ea' : (stock.rvol >= 0.8 ? '#f3f4f6' : '#fff1f2'),
                          color: stock.rvol >= 1.2 ? '#059669' : (stock.rvol >= 0.8 ? '#374151' : '#be123c')
                        }}>
                          {stock.rvol}x
                        </span>
                      </td>

                      {/* VWAP */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: '#374151' }}>{currentCurrency}{stock.vwap}</div>
                        <span style={{ fontSize: '0.65rem', fontWeight: '700', color: stock.is_above_vwap ? '#059669' : '#dc2626' }}>
                          {stock.is_above_vwap ? '▲ Above' : '▼ Below'}
                        </span>
                      </td>

                      {/* 15m ORB Range */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                          H: {currentCurrency}{stock.orb_high} | L: {currentCurrency}{stock.orb_low}
                        </div>
                        <span style={{
                          fontSize: '0.65rem',
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
                          backgroundColor: isLong ? '#e6f4ea' : (isShort ? '#fef2f2' : '#f3f4f6'),
                          color: isLong ? '#059669' : (isShort ? '#dc2626' : '#4b5563')
                        }}>
                          {stock.setup_signal}
                        </span>
                        <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '2px' }}>
                          Strategy: {stock.suggested_strategy.replace('NSE ', '')}
                        </div>
                      </td>

                      {/* Levels */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ color: '#059669', fontWeight: '700', fontSize: '0.75rem' }}>
                          Target: {currentCurrency}{stock.target_2r}
                        </div>
                        <div style={{ color: '#dc2626', fontSize: '0.7rem' }}>
                          SL: {currentCurrency}{stock.stop_loss}
                        </div>
                      </td>

                      {/* 1-Click Action Buttons */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => onSelectForBacktest(stock.symbol, stock.suggested_strategy)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              borderRadius: '7px',
                              backgroundColor: '#059669',
                              color: '#ffffff',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                            title="Open in Backtester Studio"
                          >
                            Studio <ArrowRight size={11} />
                          </button>

                          <button
                            onClick={() => onSelectForBot(stock.symbol)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              borderRadius: '7px',
                              backgroundColor: '#f3f4f6',
                              color: '#374151',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                            title="Deploy to Live Bot Monitor"
                          >
                            <Bot size={11} />
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

    </div>
  );
}

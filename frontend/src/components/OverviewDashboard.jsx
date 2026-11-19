import React from 'react';
import CompanyLogo from './CompanyLogo';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  Cpu,
  Layers,
  Zap,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Sliders,
  FileText,
  Database,
  Wifi,
  Square,
  Radio,
  Play,
  Pause,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Info,
  Lock,
  AlertTriangle
} from 'lucide-react';
import { computePortfolioMetrics } from '../utils/tradeUtils';

export default function OverviewDashboard({
  botData,
  currentLtp = 0,
  currency = "₹",
  actionLoading = false,
  isConnected = true,
  lastSyncTime = null,
  onNavigate = () => {},
  onControl = () => {}
}) {
  // If no backend data has arrived yet, display a professional Groww-styled loading skeleton
  if (!botData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 0' }}>
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <RefreshCw size={22} color="#00D09C" className="animate-spin" />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
              Connecting to Algorithmic Execution Core...
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#92999C' }}>
              Fetching real-time order book, bot state and trade ledger from FastAPI backend
            </span>
          </div>
        </div>
      </div>
    );
  }

  const bot = botData?.bot_state || {};
  const allBotFills = botData?.all_trades || [];
  const isMarketOpen = botData?.is_market_open ?? false;
  const istTime = botData?.ist_time || "";
  const initialBaseCapital = 1000000.0;

  // Compute mathematically verified portfolio metrics from backend state and paired trade ledger
  const metrics = computePortfolioMetrics(botData, currentLtp, initialBaseCapital);

  const {
    isInPosition,
    shares,
    entryPrice,
    ltp,
    investedCapital,
    positionValue,
    availableCash,
    totalPortfolioValue,
    unrealizedPnl,
    unrealizedPct,
    pairedTrades,
    todayPaired,
    todayRealizedPnl,
    todayFees,
    allTimeRealizedPnl,
    allTimeFees,
    combinedTodayPnl,
    todayPnlPct,
    combinedAllTimePnl,
    overallReturnPct,
    equityPoints
  } = metrics;

  // Strategy status & display
  const activeStatus = bot.status || botData?.active_status || "ARMED (STANDBY • MARKET CLOSED)";
  const isEngineActive = activeStatus.includes("ACTIVE");
  const isEngineStandby = activeStatus.includes("STANDBY") || activeStatus.includes("ARMED");
  const isEnginePaused = activeStatus.includes("PAUSED") || activeStatus.includes("STOPPED");

  // Calculate SVG sparkline bounds for equity curve
  const minEquity = Math.min(...equityPoints.map(p => p.equity), initialBaseCapital * 0.995);
  const maxEquity = Math.max(...equityPoints.map(p => p.equity), initialBaseCapital * 1.005);
  const range = maxEquity - minEquity || 1;

  const svgWidth = 480;
  const svgHeight = 110;
  const pointsString = equityPoints.map((p, idx) => {
    const x = (idx / (equityPoints.length - 1 || 1)) * (svgWidth - 20) + 10;
    const y = svgHeight - 15 - ((p.equity - minEquity) / range) * (svgHeight - 30);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const baselineY = svgHeight - 15 - ((initialBaseCapital - minEquity) / range) * (svgHeight - 30);
  const isProfitable = (equityPoints[equityPoints.length - 1]?.equity || initialBaseCapital) >= initialBaseCapital;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>

      {/* ── DAILY DRAWDOWN CIRCUIT BREAKER LOCK BANNER ── */}
      {bot.daily_drawdown_locked && (
        <div style={{
          backgroundColor: 'rgba(235, 91, 60, 0.12)',
          border: '1px solid #EB5B3C',
          borderRadius: '16px',
          padding: '18px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 8px 32px rgba(235, 91, 60, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: 'rgba(235, 91, 60, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EB5B3C'
            }}>
              <Lock size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#EB5B3C' }}>
                HARD CIRCUIT BREAKER ACTIVE — DAILY RISK LIMIT BREACHED
              </div>
              <div style={{ fontSize: '0.8rem', color: '#F1F3F4', marginTop: '2px' }}>
                {bot.daily_drawdown_lock_reason || "Daily net loss limit hit. Position liquidated; engine locked until next NSE trading session."}
              </div>
              {bot.daily_drawdown_locked_at && (
                <div style={{ fontSize: '0.74rem', color: '#B2B9BC', marginTop: '2px' }}>
                  Locked at: {bot.daily_drawdown_locked_at} (Survives server restarts)
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("automation")}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#EB5B3C',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Review Risk Settings
          </button>
        </div>
      )}

      {/* ── TOP HERO COMMAND BANNER ── */}
      <div style={{
        backgroundColor: '#151819',
        border: '1px solid #252A2C',
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: '#101314',
            border: '1px solid #252A2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Cpu size={20} color="#00D09C" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#F1F3F4', margin: 0, letterSpacing: '-0.01em' }}>
                Command Center Overview
              </h1>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                color: '#00D09C',
                border: '1px solid rgba(0, 208, 156, 0.25)'
              }}>
                PAPER SIMULATION
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#92999C', margin: '3px 0 0 0' }}>
              Real-time portfolio liquidity, automated strategy execution telemetry, and statutory accounting
            </p>
          </div>
        </div>

        {/* Status Indicators & Fast Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Market Status Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: '#101314',
            border: '1px solid #252A2C',
            fontSize: '0.78rem',
            fontWeight: '600',
            color: isMarketOpen ? '#00D09C' : '#92999C'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isMarketOpen ? '#00D09C' : '#EB5B3C',
              boxShadow: isMarketOpen ? '0 0 8px #00D09C' : 'none'
            }} />
            <span>{isMarketOpen ? "NSE LIVE" : "NSE CLOSED"}</span>
            <span style={{ color: '#626A6E', fontSize: '0.72rem' }}>• {istTime || "15:30 IST"}</span>
          </div>

          {/* Telemetry Health Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: '#101314',
            border: '1px solid #252A2C',
            fontSize: '0.78rem',
            fontWeight: '600',
            color: isConnected ? '#00D09C' : '#EB5B3C'
          }}>
            <Radio size={13} color={isConnected ? '#00D09C' : '#EB5B3C'} />
            <span>{isConnected ? `SYNCED ${lastSyncTime || istTime || '2s'}` : "DISCONNECTED"}</span>
          </div>

          <button
            onClick={() => onNavigate("automation")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#1C2022',
              border: '1px solid #2F3538',
              color: '#F1F3F4',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#252B2E'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1C2022'}
          >
            <Sliders size={14} color="#00D09C" />
            <span>Bot Automation</span>
          </button>
        </div>
      </div>

      {/* ── 1. PORTFOLIO SUMMARY CARDS (4-CARD GRID) ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
            Portfolio Capital & Liquidity
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
            Base Capital: {currency}10,00,000.00 • Reconciled via Cash + Position MTM
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Total Portfolio Capital */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '124px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>Total Portfolio Capital</span>
              <span style={{
                fontSize: '0.68rem',
                color: '#00D09C',
                backgroundColor: 'rgba(0, 208, 156, 0.08)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: '700'
              }}>
                RECONCILED
              </span>
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: '#F1F3F4',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{totalPortfolioValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
              Available Cash + Current Position Value
            </span>
          </div>

          {/* Card 2: Available Capital */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '124px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>Available Capital</span>
              <span style={{
                fontSize: '0.7rem',
                color: '#00D09C',
                backgroundColor: 'rgba(0, 208, 156, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: '700'
              }}>
                Free Margin
              </span>
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: '#00D09C',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
              Ready for immediate intraday margin allocation
            </span>
          </div>

          {/* Card 3: Invested Capital */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '124px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>Invested Capital</span>
              <span style={{ fontSize: '0.7rem', color: isInPosition ? '#00D09C' : '#626A6E', fontWeight: '700' }}>
                {isInPosition ? `${bot.position_side || "LONG"} EXPOSURE` : "FLAT"}
              </span>
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: isInPosition ? '#F1F3F4' : '#626A6E',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{investedCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
              {isInPosition ? `${shares} shares held in ${bot.symbol}` : "0% allocated • Max 50% risk cap per trade"}
            </span>
          </div>

          {/* Card 4: Current Position Value */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '124px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>Current Position Value</span>
              {isInPosition && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  color: unrealizedPnl >= 0 ? '#00D09C' : '#EB5B3C'
                }} className="font-tabular">
                  {unrealizedPnl >= 0 ? `+${currency}${unrealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}
                </span>
              )}
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: isInPosition ? '#F1F3F4' : '#626A6E',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{positionValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
              {isInPosition ? `Marked to LTP: ${currency}${Number(ltp).toFixed(2)}` : "No open position to mark-to-market"}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. PERFORMANCE & EQUITY CURVE (TWO-COLUMN SECTION) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 1fr) minmax(360px, 1.4fr)',
        gap: '20px'
      }}>
        {/* Performance Metrics Hero Card */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '20px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.8rem', color: '#92999C', fontWeight: '600' }}>
                Today's Net Realized & Unrealized P&L
              </span>
              <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Net after all statutory fees</span>
            </div>

            <div style={{
              fontSize: '2.4rem',
              fontWeight: '800',
              color: combinedTodayPnl >= 0 ? '#00D09C' : '#EB5B3C',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: '12px'
            }} className="font-tabular">
              <span>{combinedTodayPnl >= 0 ? `+${currency}${combinedTodayPnl.toFixed(2)}` : `-${currency}${Math.abs(combinedTodayPnl).toFixed(2)}`}</span>
              <span style={{ fontSize: '1.05rem', fontWeight: '700' }}>
                ({todayPnlPct >= 0 ? `+${todayPnlPct.toFixed(2)}%` : `${todayPnlPct.toFixed(2)}%`})
              </span>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '14px',
            paddingTop: '16px',
            borderTop: '1px solid #252A2C'
          }}>
            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Today's Paired Trades</span>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                {todayPaired.length} round-trips
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>All-Time Ledger Returns</span>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: combinedAllTimePnl >= 0 ? '#00D09C' : '#EB5B3C',
                marginTop: '2px'
              }} className="font-tabular">
                {combinedAllTimePnl >= 0 ? `+${currency}${combinedAllTimePnl.toFixed(2)}` : `-${currency}${Math.abs(combinedAllTimePnl).toFixed(2)}`}
                <span style={{ fontSize: '0.8rem', fontWeight: '600', marginLeft: '6px' }}>
                  ({overallReturnPct >= 0 ? `+${overallReturnPct.toFixed(2)}%` : `${overallReturnPct.toFixed(2)}%`})
                </span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Completed Round-Trips</span>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                {pairedTrades.length} trades ({allBotFills.length} fills)
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Statutory Taxes & Charges</span>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#EB5B3C', marginTop: '2px' }} className="font-tabular">
                -{currency}{allTimeFees.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onNavigate("orders")}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '8px',
                backgroundColor: '#1C2022',
                border: '1px solid #2F3538',
                color: '#F1F3F4',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>View Trade Ledger</span>
              <ChevronRight size={14} color="#92999C" />
            </button>
            <button
              onClick={() => onNavigate("quant")}
              style={{
                padding: '9px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                border: '1px solid rgba(0, 208, 156, 0.28)',
                color: '#00D09C',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Zap size={14} />
              <span>Quant Studio</span>
            </button>
          </div>
        </div>

        {/* Portfolio Equity Progression Sparkline */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
                Portfolio Equity Curve
              </h3>
              <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
                Net sequential balance across {pairedTrades.length} completed round-trips (Base: {currency}10,00,000)
              </span>
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: isProfitable ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
              color: isProfitable ? '#00D09C' : '#EB5B3C'
            }}>
              {isProfitable ? "PROFITABLE" : "DRAWDOWN"}
            </span>
          </div>

          {/* Responsive SVG Curve */}
          <div style={{ width: '100%', height: '120px', margin: '14px 0', position: 'relative' }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isProfitable ? "#00D09C" : "#EB5B3C"} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={isProfitable ? "#00D09C" : "#EB5B3C"} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Baseline at ₹10,00,000 */}
              <line
                x1="0"
                y1={baselineY}
                x2={svgWidth}
                y2={baselineY}
                stroke="#252A2C"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />

              {/* Filled Area */}
              <polygon
                points={`10,${baselineY} ${pointsString} ${svgWidth - 10},${baselineY}`}
                fill="url(#equityGrad)"
              />

              {/* Main Curve Line */}
              <polyline
                points={pointsString}
                fill="none"
                stroke={isProfitable ? "#00D09C" : "#EB5B3C"}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#626A6E' }}>
            <span>Starting Capital: {currency}10.00L</span>
            <span>Current: {currency}{(equityPoints[equityPoints.length - 1]?.equity / 100000).toFixed(2)}L</span>
          </div>
        </div>
      </div>

      {/* ── 3. ACTIVE STRATEGY ENGINE & TRADING ACTIVITY ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.4fr)',
        gap: '20px'
      }}>
        {/* Active Strategy Card */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '18px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                Armed Strategy Engine
              </span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: isEngineActive ? 'rgba(0, 208, 156, 0.12)' : (isEnginePaused ? 'rgba(235, 91, 60, 0.12)' : 'rgba(255, 184, 0, 0.12)'),
                color: isEngineActive ? '#00D09C' : (isEnginePaused ? '#EB5B3C' : '#FFB800'),
                border: '1px solid',
                borderColor: isEngineActive ? 'rgba(0, 208, 156, 0.28)' : (isEnginePaused ? 'rgba(235, 91, 60, 0.28)' : 'rgba(255, 184, 0, 0.28)')
              }}>
                {activeStatus}
              </span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: '8px 0 4px 0' }}>
              {bot.strategy || botData?.active_strategy || "NSE Intraday ORB Breakout"}
            </h3>

            {/* Trading Mode Transparency Notice */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              marginTop: '10px'
            }}>
              <ShieldCheck size={15} color="#00D09C" />
              <div style={{ fontSize: '0.75rem', color: '#92999C' }}>
                Execution Mode: <strong style={{ color: '#F1F3F4' }}>Paper Trading (Simulated NSE MIS)</strong>
                <div style={{ fontSize: '0.68rem', color: '#626A6E', marginTop: '1px' }}>
                  Simulated fills with real NSE L1 tick feed, 0.05% slippage & full statutory charges
                </div>
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            padding: '14px',
            backgroundColor: '#101314',
            borderRadius: '12px',
            border: '1px solid #202426'
          }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Stock</span>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                {bot.symbol || "SBIN.NS"}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Timeframe</span>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                {bot.timeframe || "5m"}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Daily Quota</span>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }}>
                {bot.max_trades_per_symbol ?? 1} trade/day
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onControl(isEnginePaused ? "START" : "PAUSE")}
              disabled={actionLoading || (isEnginePaused && bot.daily_drawdown_locked)}
              title={bot.daily_drawdown_locked ? "Locked: Daily Drawdown Limit Reached" : (isEnginePaused ? "Arm & Resume Bot" : "Pause Bot")}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: (isEnginePaused && !bot.daily_drawdown_locked) ? '#00D09C' : '#1C2022',
                color: (isEnginePaused && !bot.daily_drawdown_locked) ? '#080A0B' : '#F1F3F4',
                border: '1px solid',
                borderColor: (isEnginePaused && !bot.daily_drawdown_locked) ? '#00D09C' : '#2F3538',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: (actionLoading || (isEnginePaused && bot.daily_drawdown_locked)) ? 'not-allowed' : 'pointer',
                opacity: (actionLoading || (isEnginePaused && bot.daily_drawdown_locked)) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              {actionLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : isEnginePaused ? (
                bot.daily_drawdown_locked ? <Lock size={14} color="#EB5B3C" /> : <Play size={14} fill="#080A0B" />
              ) : (
                <Pause size={14} />
              )}
              <span>
                {actionLoading
                  ? "Updating..."
                  : bot.daily_drawdown_locked
                  ? "Circuit Locked"
                  : (isEnginePaused ? "Arm & Resume Bot" : "Pause Bot")}
              </span>
            </button>

            <button
              onClick={() => onNavigate("automation")}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: '#101314',
                border: '1px solid #252A2C',
                color: '#92999C',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
              onMouseLeave={e => e.currentTarget.style.color = '#92999C'}
            >
              Configure
            </button>
          </div>
        </div>

        {/* Live Position / Execution Status */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
                Live Exposure & Recent Executions
              </h3>
              <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
                Real-time position monitoring or latest fill records
              </span>
            </div>
            <button
              onClick={() => onNavigate("positions")}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#00D09C',
                fontSize: '0.78rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>Positions Tab</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {isInPosition ? (
            /* Open Position Highlight */
            <div style={{
              margin: '16px 0',
              padding: '18px 20px',
              borderRadius: '12px',
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CompanyLogo symbol={bot.symbol || "SBIN.NS"} size={36} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: '#F1F3F4' }}>{bot.symbol}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 208, 156, 0.12)',
                      color: '#00D09C'
                    }}>
                      {bot.position_side || "LONG"} MIS
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
                    {shares} shares @ {currency}{entryPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Live Unrealized P&L</span>
                <div style={{
                  fontSize: '1.25rem',
                  fontWeight: '800',
                  color: unrealizedPnl >= 0 ? '#00D09C' : '#EB5B3C',
                  marginTop: '2px'
                }} className="font-tabular">
                  {unrealizedPnl >= 0 ? `+${currency}${unrealizedPnl.toFixed(2)}` : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', marginLeft: '6px' }}>
                    ({unrealizedPct >= 0 ? `+${unrealizedPct.toFixed(2)}%` : `${unrealizedPct.toFixed(2)}%`})
                  </span>
                </div>
              </div>

              <button
                onClick={() => onControl("SQUARE_OFF")}
                disabled={actionLoading}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(235, 91, 60, 0.12)',
                  border: '1px solid rgba(235, 91, 60, 0.28)',
                  color: '#EB5B3C',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Square size={12} fill="#EB5B3C" />
                <span>{actionLoading ? "Squaring Off..." : "Square Off"}</span>
              </button>
            </div>
          ) : (
            /* Flat Exposure Notice with Recent Paired/Fills Preview */
            <div style={{ margin: '14px 0' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: '#101314',
                border: '1px solid #202426',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00D09C' }} />
                  <span style={{ fontSize: '0.82rem', color: '#F1F3F4', fontWeight: '600' }}>
                    Flat Exposure • No Active Positions Open
                  </span>
                </div>
                <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
                  Monitoring {bot.symbol || "SBIN.NS"}
                </span>
              </div>

              {/* Latest 3 executions table snippet */}
              {allBotFills.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ color: '#626A6E', borderBottom: '1px solid #202426' }}>
                        <th style={{ padding: '6px 8px' }}>Time</th>
                        <th style={{ padding: '6px 8px' }}>Action</th>
                        <th style={{ padding: '6px 8px' }}>Instrument</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cash Flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBotFills.slice(-3).reverse().map((f, i) => {
                        const isBuy = f.Action?.includes("BUY");
                        const isExit = f.Action?.includes("SELL") || f.Action?.includes("COVER") || f.Action?.includes("SQUARE");
                        return (
                          <tr key={f.id || i} style={{ borderBottom: '1px solid #1a1e20' }}>
                            <td style={{ padding: '8px 8px', color: '#92999C' }}>{f.Time || f.Timestamp?.slice(11, 16)}</td>
                            <td style={{ padding: '8px 8px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                backgroundColor: isExit ? 'rgba(0, 208, 156, 0.12)' : (isBuy ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)'),
                                color: isExit ? '#00D09C' : (isBuy ? '#00D09C' : '#EB5B3C')
                              }}>
                                {f.Action}
                              </span>
                            </td>
                            <td style={{ padding: '8px 8px', fontWeight: '700', color: '#F1F3F4' }}>{f.Symbol}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', color: '#F1F3F4' }} className="font-tabular">
                              {currency}{Number(f.Execution_Price || 0).toFixed(2)}
                            </td>
                            <td style={{
                              padding: '8px 8px',
                              textAlign: 'right',
                              fontWeight: '700',
                              color: f.RawAmount >= 0 ? '#00D09C' : '#92999C'
                            }} className="font-tabular">
                              {f.Amount || `${currency}${f.RawAmount}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#626A6E',
                  fontSize: '0.8rem'
                }}>
                  No executions recorded yet in current trading session.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <span
              onClick={() => onNavigate("orders")}
              style={{ fontSize: '0.76rem', color: '#00D09C', cursor: 'pointer', fontWeight: '600' }}
            >
              Full Order Ledger & Charges Breakdown ({allBotFills.length} total) →
            </span>
          </div>
        </div>
      </div>

      {/* ── 4. SYSTEM HEALTH & CONNECTIVITY (3-CARD GRID) ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
            System Status & Connectivity Health
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
            Subsystem operational telemetry and connectivity gates
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Market Data Connectivity */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wifi size={16} color={isConnected ? "#00D09C" : "#EB5B3C"} />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>Market Data Feed</span>
              </div>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: isConnected ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
                color: isConnected ? '#00D09C' : '#EB5B3C'
              }}>
                {isConnected ? "CONNECTED" : "OFFLINE"}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Gateway: <strong style={{ color: '#F1F3F4' }}>Yahoo Finance (yfinance L1 Real-Time)</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Strategy evaluation: 15s • UI telemetry poll: 2s non-blocking
            </div>
          </div>

          {/* Card 2: Broker Connectivity */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} color="#00D09C" />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>Execution Broker</span>
              </div>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                color: '#00D09C'
              }}>
                PAPER SIMULATION
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Settlement: <strong style={{ color: '#F1F3F4' }}>NSE Intraday MIS (5x Leverage Model)</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Regulatory charges: STT (0.025%), SEBI fee, Stamp duty, 18% GST
            </div>
          </div>

          {/* Card 3: Trading Engine Status */}
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color={isEngineActive ? "#00D09C" : "#FFB800"} />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>Engine Daemon</span>
              </div>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: isEngineActive ? 'rgba(0, 208, 156, 0.12)' : 'rgba(255, 184, 0, 0.12)',
                color: isEngineActive ? '#00D09C' : '#FFB800'
              }}>
                {isEngineActive ? "MONITORING" : (isEnginePaused ? "PAUSED" : "STANDBY")}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Lifecycle: <strong style={{ color: '#F1F3F4' }}>15:15 IST Mandatory MIS Auto-Square-Off</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Interactive Telegram Push Gateway: Active
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

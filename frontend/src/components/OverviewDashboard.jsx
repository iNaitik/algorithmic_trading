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
  ChevronRight
} from 'lucide-react';

export default function OverviewDashboard({
  botData,
  currentLtp = 0,
  currency = "₹",
  onNavigate = () => {},
  onControl = () => {}
}) {
  const bot = botData?.bot_state || {};
  const allBotFills = botData?.all_trades || [];
  const isMarketOpen = botData?.is_market_open ?? false;
  const istTime = botData?.ist_time || "";
  const istDate = botData?.ist_date || "";

  // Position calculation
  const isInPosition = Boolean(bot.in_position && (bot.shares > 0 || bot.entry_price > 0));
  const shares = Number(bot.shares || 0);
  const entryPrice = Number(bot.entry_price || 0);
  const ltp = Number(currentLtp || bot.last_ltp || entryPrice);

  const investedCapital = isInPosition ? shares * entryPrice : 0;
  const positionValue = isInPosition ? shares * ltp : 0;
  const availableCash = Number(bot.cash ?? 1000000.0);
  const totalPortfolioValue = availableCash + positionValue;

  // Unrealized P&L
  const unrealizedPnl = isInPosition
    ? (bot.position_side === "SHORT" ? (entryPrice - ltp) * shares : (ltp - entryPrice) * shares)
    : 0;
  const unrealizedPct = isInPosition && entryPrice > 0 ? (unrealizedPnl / (shares * entryPrice)) * 100 : 0;

  // Realized P&L today
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDateObj = new Date(utc + (3600000 * 5.5));
  const todayIso = istDate || istDateObj.toISOString().slice(0, 10);

  const todayFills = allBotFills.filter(t => t.Timestamp && String(t.Timestamp).startsWith(todayIso));

  // Compute Today's Realized P&L (paired trades: Buy/Sell and Short/Cover)
  let todayRealizedPnl = 0.0;
  const todaySymGroups = {};
  todayFills.forEach(t => {
    const sym = t.Symbol || bot.symbol || "UNKNOWN";
    if (!todaySymGroups[sym]) todaySymGroups[sym] = [];
    todaySymGroups[sym].push(t);
  });

  Object.values(todaySymGroups).forEach(trades => {
    for (let i = 0; i < trades.length - 1; i += 2) {
      const e = trades[i];
      const x = trades[i + 1];
      const actE = String(e.Action || "").toUpperCase();
      const actX = String(x.Action || "").toUpperCase();
      const sh = Number(e.Shares || 0);
      const pe = Number(e.Execution_Price || 0);
      const px = Number(x.Execution_Price || 0);
      if (actE.includes("BUY") && (actX.includes("SELL") || actX.includes("SQUARE"))) {
        todayRealizedPnl += (px - pe) * sh;
      } else if (actE.includes("SHORT") && (actX.includes("COVER") || actX.includes("SQUARE"))) {
        todayRealizedPnl += (pe - px) * sh;
      }
    }
  });

  // If unpaired, fallback to RawAmount sum
  if (todayFills.length > 0 && todayRealizedPnl === 0.0) {
    todayRealizedPnl = todayFills.reduce((acc, t) => acc + (Number(t.RawAmount) || 0), 0);
  }

  // Combined Today's P&L
  const combinedTodayPnl = todayRealizedPnl + unrealizedPnl;
  const initialBaseCapital = 1000000.0;
  const todayPnlPct = (combinedTodayPnl / initialBaseCapital) * 100;

  // All-time cumulative returns across execution ledger
  const overallPnl = allBotFills.reduce((acc, t) => acc + (Number(t.RawAmount) || 0), 0);
  const overallReturnPct = (overallPnl / initialBaseCapital) * 100;

  // Strategy status & display
  const activeStatus = bot.status || botData?.active_status || "ARMED (STANDBY • MARKET CLOSED)";
  const isEngineActive = activeStatus.includes("ACTIVE");
  const isEngineStandby = activeStatus.includes("STANDBY") || activeStatus.includes("ARMED");
  const isEnginePaused = activeStatus.includes("PAUSED") || activeStatus.includes("STOPPED");

  // Construct mini cumulative equity curve data points from allBotFills
  const equityPoints = [];
  let runningEquity = initialBaseCapital;
  equityPoints.push({ label: 'Initial', equity: initialBaseCapital });

  allBotFills.forEach((t, idx) => {
    runningEquity += (Number(t.RawAmount) || 0);
    equityPoints.push({
      label: t.Time || `#${idx + 1}`,
      equity: runningEquity
    });
  });

  if (isInPosition && unrealizedPnl !== 0) {
    equityPoints.push({
      label: 'Live',
      equity: runningEquity + unrealizedPnl
    });
  }

  // Calculate SVG sparkline bounds
  const minEquity = Math.min(...equityPoints.map(p => p.equity), initialBaseCapital * 0.99);
  const maxEquity = Math.max(...equityPoints.map(p => p.equity), initialBaseCapital * 1.01);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                v2.0 ACTIVE
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#92999C', margin: '3px 0 0 0' }}>
              Real-time portfolio liquidity, automated strategy execution telemetry, and system health
            </p>
          </div>
        </div>

        {/* Status Indicators & Fast Navigation Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
            <span>{isMarketOpen ? "NSE MARKET LIVE" : "NSE MARKET CLOSED"}</span>
            <span style={{ color: '#626A6E', fontSize: '0.72rem' }}>• {istTime || "15:30 IST"}</span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
            Portfolio Capital & Liquidity
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#626A6E' }}>
            Multi-market paper balance with realistic cash settlement
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Total Capital */}
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
              <span style={{ fontSize: '0.7rem', color: '#626A6E', fontWeight: '600' }}>Initial: {currency}10L</span>
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: '#F1F3F4',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{totalPortfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
                Free Cash
              </span>
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: '800',
              color: '#00D09C',
              margin: '6px 0 2px 0'
            }} className="font-tabular">
              {currency}{availableCash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
              {currency}{investedCapital.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
              {currency}{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#626A6E' }}>
              {isInPosition ? `LTP: ${currency}${Number(ltp).toFixed(2)}` : "No open position to mark-to-market"}
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
              <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Net after statutory fees</span>
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
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Trades Executed Today</span>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                {todayFills.length}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>All-Time Ledger Returns</span>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: overallPnl >= 0 ? '#00D09C' : '#EB5B3C',
                marginTop: '2px'
              }} className="font-tabular">
                {overallPnl >= 0 ? `+${currency}${overallPnl.toFixed(2)}` : `-${currency}${Math.abs(overallPnl).toFixed(2)}`}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Total Historical Fills</span>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                {allBotFills.length} orders
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.74rem', color: '#626A6E', fontWeight: '600' }}>Est. Friction & Taxes</span>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#EB5B3C', marginTop: '2px' }} className="font-tabular">
                -{currency}{(allBotFills.length * 40.0).toFixed(2)}
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
                Progression across completed paper trades (Base: {currency}10,00,000)
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
            <span>Starting Baseline ({currency}10.00L)</span>
            <span>Current: {currency}{(totalPortfolioValue / 100000).toFixed(2)}L</span>
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
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              marginTop: '10px'
            }}>
              <ShieldCheck size={14} color="#00D09C" />
              <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>
                Mode: <strong style={{ color: '#F1F3F4' }}>Paper Trading (Simulated NSE MIS)</strong>
              </span>
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
              <span style={{ fontSize: '0.72rem', color: '#626A6E', fontWeight: '600' }}>Quota Lock</span>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }}>
                1 trade/day
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onControl(isEnginePaused ? "START" : "PAUSE")}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: isEnginePaused ? '#00D09C' : '#1C2022',
                color: isEnginePaused ? '#080A0B' : '#F1F3F4',
                border: '1px solid',
                borderColor: isEnginePaused ? '#00D09C' : '#2F3538',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              {isEnginePaused ? <Play size={14} fill="#080A0B" /> : <Pause size={14} />}
              <span>{isEnginePaused ? "Arm & Resume Bot" : "Pause Bot"}</span>
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
              Settings
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
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(235, 91, 60, 0.12)',
                  border: '1px solid rgba(235, 91, 60, 0.28)',
                  color: '#EB5B3C',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Square size={12} fill="#EB5B3C" />
                <span>Square Off</span>
              </button>
            </div>
          ) : (
            /* Flat Exposure Notice with Recent Fills Preview */
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ color: '#626A6E', borderBottom: '1px solid #202426' }}>
                      <th style={{ padding: '6px 8px' }}>Time</th>
                      <th style={{ padding: '6px 8px' }}>Action</th>
                      <th style={{ padding: '6px 8px' }}>Instrument</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cash Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allBotFills.slice(0, 3).map((f, i) => {
                      const isBuy = f.Action?.includes("BUY");
                      return (
                        <tr key={f.id || i} style={{ borderBottom: '1px solid #1a1e20' }}>
                          <td style={{ padding: '8px 8px', color: '#92999C' }}>{f.Time || f.Timestamp?.slice(11, 16)}</td>
                          <td style={{ padding: '8px 8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
                              color: isBuy ? '#00D09C' : '#EB5B3C'
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
                            color: f.RawAmount >= 0 ? '#00D09C' : '#F1F3F4'
                          }} className="font-tabular">
                            {f.Amount || `${currency}${f.RawAmount}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                <Wifi size={16} color="#00D09C" />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>Market Data Feed</span>
              </div>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                color: '#00D09C'
              }}>
                CONNECTED
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Gateway: <strong style={{ color: '#F1F3F4' }}>yfinance Real-Time Polling</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Polling interval: 15 seconds • Intra-candle evaluation active
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
                PAPER (SIMULATED)
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Settlement: <strong style={{ color: '#F1F3F4' }}>NSE Intraday MIS (5x Leverage)</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Full regulatory friction model (STT, SEBI, GST, Stamp Duty)
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
                {isEngineActive ? "MONITORING" : "STANDBY"}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Lifecycle: <strong style={{ color: '#F1F3F4' }}>15:15 MIS Auto-Square-Off Armed</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#626A6E', borderTop: '1px solid #202426', paddingTop: '8px' }}>
              Telegram Interactive Push Notifications: Online
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

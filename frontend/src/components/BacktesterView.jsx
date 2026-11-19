import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Sliders,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ChevronDown,
  ShieldCheck,
  Zap,
  Clock,
  DollarSign
} from 'lucide-react';

import CandleChart from './CandleChart';
import EquityChart from './EquityChart';
import StatutoryFeeCard from './StatutoryFeeCard';
import TradeJournal from './TradeJournal';

export default function BacktesterView({
  marketDefs,
  strategiesList = [],
  selectedMarket = "INDIA",
  setSelectedMarket = () => {},
  symbol = "SBIN.NS",
  setSymbol = () => {},
  customSymbol = "",
  setCustomSymbol = () => {},
  interval = "5m",
  setInterval = () => {},
  lookbackDays = 60,
  setLookbackDays = () => {},
  capitalInput = "10L",
  setCapitalInput = () => {},
  initialCapital = 1000000.0,
  selectedStrategy = "NSE Intraday ORB Breakout",
  setSelectedStrategy = () => {},
  loading = false,
  backtestResult = null,
  errorMsg = null,
  onRunBacktest = () => {}
}) {
  const [subView, setSubView] = useState("CHART"); // "CHART", "EQUITY", "FEES", "JOURNAL"

  const currentMarketDef = marketDefs?.markets.find(m => m.id === selectedMarket);
  const currency = currentMarketDef?.currency || (selectedMarket === "INDIA" ? "₹" : "$");
  const filteredStrategies = strategiesList.filter(s => s.market === selectedMarket || s.market === "ALL");
  const summary = backtestResult?.summary;
  const isNetWin = summary && summary.net_pnl >= 0;

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      overflow: 'hidden',
      height: 'calc(100vh - 72px)',
      backgroundColor: '#080A0B',
      color: '#F1F3F4',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* ── Left Parameter Studio Control Panel ── */}
      <aside style={{
        width: '320px',
        minWidth: '320px',
        maxWidth: '320px',
        backgroundColor: '#121517',
        borderRight: '1px solid #202426',
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto'
      }}>
        {/* Panel Title */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #202426',
          paddingBottom: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              border: '1px solid rgba(0, 208, 156, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D09C'
            }}>
              <Sliders size={15} />
            </div>
            <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#F1F3F4', letterSpacing: '-0.01em' }}>
              Strategy Studio
            </span>
          </div>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            padding: '2px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 208, 156, 0.1)',
            color: '#00D09C',
            border: '1px solid rgba(0, 208, 156, 0.2)'
          }}>
            Simulation
          </span>
        </div>

        {/* 1. Target Market */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            1. Target Market
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
            {[
              { id: "INDIA", flag: "🇮🇳", label: "NSE" },
              { id: "US", flag: "🇺🇸", label: "US Tech" },
              { id: "FOREX", flag: "💱", label: "Forex" }
            ].map(m => {
              const isSelected = selectedMarket === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMarket(m.id)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid #00D09C' : '1px solid #202426',
                    backgroundColor: isSelected ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                    color: isSelected ? '#00D09C' : '#92999C',
                    fontWeight: '700',
                    fontSize: '0.74rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{m.flag}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Ticker Symbol */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              2. Ticker Symbol
            </label>
            <span style={{ fontSize: '0.72rem', color: '#00D09C', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              {customSymbol || symbol}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
            {currentMarketDef?.presets.slice(0, 6).map(p => {
              const isPresetActive = symbol === p.ticker && !customSymbol;
              return (
                <button
                  key={p.ticker}
                  onClick={() => { setSymbol(p.ticker); setCustomSymbol(""); }}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: isPresetActive ? '700' : '500',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    backgroundColor: isPresetActive ? 'rgba(0, 208, 156, 0.14)' : '#080A0B',
                    color: isPresetActive ? '#00D09C' : '#92999C',
                    border: isPresetActive ? '1px solid #00D09C' : '1px solid #202426',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.ticker.replace('.NS', '')}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            placeholder="Or custom ticker (e.g. SBIN)..."
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 12px',
              backgroundColor: '#080A0B',
              border: '1px solid #202426',
              borderRadius: '8px',
              color: '#F1F3F4',
              fontSize: '0.8rem',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* 3. Timeframe */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            3. Candle Interval
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
            {["1m", "2m", "5m", "15m", "30m", "1h", "1d"].map(tf => {
              const isTfActive = interval === tf;
              return (
                <button
                  key={tf}
                  onClick={() => {
                    setInterval(tf);
                    if (tf === "1m" || tf === "2m") setLookbackDays(7);
                    else if (tf === "1d") setLookbackDays(365);
                    else setLookbackDays(60);
                  }}
                  style={{
                    padding: '6px 2px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    borderRadius: '6px',
                    backgroundColor: isTfActive ? '#00D09C' : '#080A0B',
                    color: isTfActive ? '#080A0B' : '#92999C',
                    border: isTfActive ? '1px solid #00D09C' : '1px solid #202426',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Lookback Period */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              4. Lookback Period
            </label>
            <span style={{ fontSize: '0.75rem', color: '#F1F3F4', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {lookbackDays} Days
            </span>
          </div>
          <input
            type="range"
            min="1"
            max={interval === "1m" || interval === "2m" ? "7" : (interval === "1d" ? "730" : "60")}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            style={{ width: '100%', marginTop: '8px', accentColor: '#00D09C' }}
          />
        </div>

        {/* 5. Starting Capital */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              5. Starting Capital
            </label>
            <span style={{ fontSize: '0.72rem', color: '#00D09C', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {currency}{initialCapital.toLocaleString()} {selectedMarket === "INDIA" && initialCapital >= 100000 ? `(${(initialCapital / 100000).toFixed(1)}L)` : ''}
            </span>
          </div>
          <input
            type="text"
            placeholder={selectedMarket === "INDIA" ? "e.g. 10L, 5L, 25L, 1Cr, or 1000000" : "e.g. 100k, 50k"}
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 12px',
              backgroundColor: '#080A0B',
              border: '1px solid #202426',
              borderRadius: '8px',
              color: '#F1F3F4',
              fontSize: '0.8rem',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* 6. Trading Strategy */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            6. Quantitative Strategy
          </label>
          <div style={{ position: 'relative', marginTop: '6px' }}>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: '#080A0B',
                border: '1px solid #202426',
                borderRadius: '8px',
                color: '#00D09C',
                fontWeight: '700',
                fontSize: '0.78rem',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                boxSizing: 'border-box'
              }}
            >
              {filteredStrategies.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            <ChevronDown size={14} color="#92999C" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Run Button */}
        <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
          <button
            onClick={onRunBacktest}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              backgroundColor: loading ? '#202426' : '#00D09C',
              color: loading ? '#92999C' : '#080A0B',
              fontWeight: '800',
              fontSize: '0.82rem',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(0, 208, 156, 0.25)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid #92999C',
                  borderTopColor: '#00D09C',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <span>EXECUTING SIMULATION...</span>
              </>
            ) : (
              <>
                <Play size={14} fill="#080A0B" />
                <span>RUN STRATEGY SIMULATION</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main Backtest View Canvas ── */}
      <main style={{
        flex: 1,
        padding: '20px 28px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        {errorMsg && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(235, 91, 60, 0.12)',
            border: '1px solid #EB5B3C',
            color: '#EB5B3C',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <b>Simulation Error:</b> {errorMsg}
          </div>
        )}

        {/* Top 4 KPI Metric Ribbon (Groww + Bloomberg Workstation) */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '14px'
          }}>
            {/* KPI 1: Net P&L */}
            <div style={{
              backgroundColor: '#121517',
              border: '1px solid #202426',
              borderRadius: '14px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                  Net Strategy P&L
                </span>
                <span style={{
                  padding: '2px 7px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  backgroundColor: isNetWin ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                  color: isNetWin ? '#00D09C' : '#EB5B3C',
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {summary.total_return_pct >= 0 ? '+' : ''}{summary.total_return_pct}%
                </span>
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '800',
                color: isNetWin ? '#00D09C' : '#EB5B3C',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {summary.net_pnl >= 0 ? '+' : ''}{currency}{Number(summary.net_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#626A6E' }}>
                {summary.net_pnl_formatted || "Realized in-hand balance"}
              </span>
            </div>

            {/* KPI 2: Final Equity */}
            <div style={{
              backgroundColor: '#121517',
              border: '1px solid #202426',
              borderRadius: '14px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                Final Portfolio Equity
              </span>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '800',
                color: '#F1F3F4',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {currency}{Number(summary.final_equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#626A6E' }}>
                Baseline: {currency}{Number(initialCapital).toLocaleString()}
              </span>
            </div>

            {/* KPI 3: Win Rate */}
            <div style={{
              backgroundColor: '#121517',
              border: '1px solid #202426',
              borderRadius: '14px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                  Win Rate
                </span>
                <span style={{ fontSize: '0.7rem', color: '#60A5FA', fontWeight: '700' }}>
                  PF: {summary.profit_factor || 0}
                </span>
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '800',
                color: summary.win_rate >= 50 ? '#00D09C' : '#EB5B3C',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {summary.win_rate}%
              </div>
              <span style={{ fontSize: '0.7rem', color: '#626A6E' }}>
                {summary.winning_trades}W / {summary.losing_trades}L ({summary.total_trades} Trades)
              </span>
            </div>

            {/* KPI 4: Sharpe Ratio */}
            <div style={{
              backgroundColor: '#121517',
              border: '1px solid #202426',
              borderRadius: '14px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
                  Risk Factor
                </span>
                <span style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: '700' }}>
                  Fee: -{currency}{Number(summary.total_charges || 0).toFixed(0)}
                </span>
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '800',
                color: summary.sharpe_ratio > 0 ? '#00D09C' : '#EB5B3C',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {summary.sharpe_ratio} <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Sharpe</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#626A6E' }}>
                Gross Trading P&L: {currency}{Number(summary.gross_trading_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Workspace View Switcher Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #202426',
          paddingBottom: '10px',
          alignItems: 'center'
        }}>
          {[
            { id: "CHART", label: "📊 Candlestick Chart & Fills" },
            { id: "EQUITY", label: "📈 Equity Progression" },
            { id: "FEES", label: "📑 Statutory Cost Schedule" },
            { id: "JOURNAL", label: `📜 Trade Journal (${summary?.total_trades || 0})` }
          ].map(tab => {
            const isTabActive = subView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubView(tab.id)}
                style={{
                  padding: '7px 16px',
                  fontSize: '0.78rem',
                  fontWeight: isTabActive ? '700' : '500',
                  borderRadius: '8px',
                  border: isTabActive ? '1px solid #00D09C' : '1px solid #202426',
                  backgroundColor: isTabActive ? 'rgba(0, 208, 156, 0.12)' : '#121517',
                  color: isTabActive ? '#00D09C' : '#92999C',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* View 1: Candlestick Chart View */}
        {subView === "CHART" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <CandleChart
              candles={backtestResult?.candles || []}
              markers={backtestResult?.trade_markers || []}
              indicators={backtestResult?.indicators || {}}
              symbol={customSymbol || symbol}
              interval={interval}
              currency={currency}
            />
            {summary?.charges_breakdown?.total > 0 && (
              <StatutoryFeeCard
                breakdown={summary.charges_breakdown}
                currency={currency}
              />
            )}
          </div>
        )}

        {/* View 2: Equity Progression View */}
        {subView === "EQUITY" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <EquityChart
              equityCurve={backtestResult?.equity_curve || []}
              initialCapital={initialCapital}
              currency={currency}
            />
          </div>
        )}

        {/* View 3: Statutory Costs Schedule View */}
        {subView === "FEES" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {summary?.charges_breakdown?.total > 0 ? (
              <StatutoryFeeCard
                breakdown={summary.charges_breakdown}
                currency={currency}
              />
            ) : (
              <div style={{
                backgroundColor: '#121517',
                border: '1px solid #202426',
                borderRadius: '16px',
                padding: '36px',
                textAlign: 'center',
                color: '#92999C'
              }}>
                Run a simulation to generate itemized statutory brokerage and SEBI charges.
              </div>
            )}
          </div>
        )}

        {/* View 4: Trade Journal View */}
        {subView === "JOURNAL" && (
          <TradeJournal
            trades={backtestResult?.trades || []}
            currency={currency}
          />
        )}
      </main>
    </div>
  );
}

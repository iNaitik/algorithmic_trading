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
  ChevronDown
} from 'lucide-react';

import CandleChart from './CandleChart';
import EquityChart from './EquityChart';
import StatutoryFeeCard from './StatutoryFeeCard';
import TradeJournal from './TradeJournal';

export default function BacktesterView({
  marketDefs,
  strategiesList,
  selectedMarket,
  setSelectedMarket,
  symbol,
  setSymbol,
  customSymbol,
  setCustomSymbol,
  interval,
  setInterval,
  lookbackDays,
  setLookbackDays,
  capitalInput,
  setCapitalInput,
  initialCapital,
  selectedStrategy,
  setSelectedStrategy,
  loading,
  backtestResult,
  errorMsg,
  onRunBacktest
}) {
  const [subView, setSubView] = useState("CHART");

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
      height: 'calc(100vh - 70px)',
      backgroundColor: '#0c0e14',
      color: '#ffffff'
    }}>
      {/* ── Left Parameter Studio Control Panel ───────────────────────── */}
      <aside style={{
        width: '320px',
        minWidth: '320px',
        backgroundColor: '#161922',
        borderRight: '1px solid #242938',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #242938', paddingBottom: '14px' }}>
          <Sliders size={18} color="#00d09c" />
          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>
            Strategy Studio
          </span>
        </div>

        {/* 1. Target Market */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
            1. Target Market
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
            {[
              { id: "INDIA", flag: "🇮🇳", label: "NSE" },
              { id: "US", flag: "🇺🇸", label: "US Tech" },
              { id: "FOREX", flag: "💱", label: "Forex" }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m.id)}
                style={{
                  padding: '7px 4px',
                  borderRadius: '10px',
                  border: selectedMarket === m.id ? '1px solid #00d09c' : '1px solid #242938',
                  backgroundColor: selectedMarket === m.id ? 'rgba(0, 208, 156, 0.15)' : '#0c0e14',
                  color: selectedMarket === m.id ? '#00d09c' : '#9ca3af',
                  fontWeight: '700',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <span>{m.flag}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Ticker Symbol */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
              2. Ticker Symbol
            </label>
            <span style={{ fontSize: '0.7rem', color: '#00d09c', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              {customSymbol || symbol}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {currentMarketDef?.presets.slice(0, 6).map(p => (
              <button
                key={p.ticker}
                onClick={() => { setSymbol(p.ticker); setCustomSymbol(""); }}
                style={{
                  fontSize: '0.68rem',
                  fontWeight: '600',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: symbol === p.ticker && !customSymbol ? 'rgba(0, 208, 156, 0.15)' : '#0c0e14',
                  color: symbol === p.ticker && !customSymbol ? '#00d09c' : '#9ca3af',
                  border: symbol === p.ticker && !customSymbol ? '1px solid #00d09c' : '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                {p.ticker.replace('.NS', '')}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Or custom ticker (e.g. SBIN)..."
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#0c0e14',
              border: '1px solid #242938',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
        </div>

        {/* 3. Timeframe */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
            3. Candle Interval
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
            {["1m", "2m", "5m", "15m", "30m", "1h", "1d"].map(tf => (
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
                  backgroundColor: interval === tf ? '#00d09c' : '#0c0e14',
                  color: interval === tf ? '#0c0e14' : '#9ca3af',
                  border: interval === tf ? '1px solid #00d09c' : '1px solid #242938',
                  cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Lookback Period */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
              4. Lookback Period
            </label>
            <span style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '700' }}>
              {lookbackDays} Days
            </span>
          </div>
          <input
            type="range"
            min="1"
            max={interval === "1m" || interval === "2m" ? "7" : (interval === "1d" ? "730" : "60")}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            style={{ width: '100%', marginTop: '6px', accentColor: '#00d09c' }}
          />
        </div>

        {/* 5. Starting Capital */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
              5. Starting Capital
            </label>
            <span style={{ fontSize: '0.7rem', color: '#00d09c', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {currency}{initialCapital.toLocaleString()} {selectedMarket === "INDIA" && initialCapital >= 100000 ? `(${(initialCapital / 100000).toFixed(2)}L)` : ''}
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
              padding: '8px 10px',
              backgroundColor: '#0c0e14',
              border: '1px solid #242938',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
        </div>

        {/* 6. Trading Strategy */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>
            6. Quantitative Strategy
          </label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#0c0e14',
              border: '1px solid #242938',
              borderRadius: '8px',
              color: '#00d09c',
              fontWeight: '600',
              fontSize: '0.8rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {filteredStrategies.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Run Button */}
        <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
          <button
            onClick={onRunBacktest}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: loading ? '#242938' : '#00d09c',
              color: loading ? '#9ca3af' : '#0c0e14',
              fontWeight: '800',
              fontSize: '0.85rem',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(0, 208, 156, 0.3)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <Play size={14} fill={loading ? "#9ca3af" : "#0c0e14"} />
            {loading ? "EXECUTING SIMULATION..." : "RUN STRATEGY SIMULATION"}
          </button>
        </div>
      </aside>

      {/* ── Main Backtest View Canvas ─────────────────────────────────── */}
      <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {errorMsg && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(235, 91, 60, 0.15)',
            border: '1px solid #eb5b3c',
            color: '#eb5b3c',
            fontSize: '0.85rem'
          }}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div style={{
            padding: '16px 20px',
            borderRadius: '16px',
            backgroundColor: '#161922',
            border: '1px solid #00d09c',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              minWidth: '24px',
              border: '3px solid #242938',
              borderTopColor: '#00d09c',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#ffffff' }}>
                Executing Quantitative Simulation for {customSymbol || symbol} ({interval})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                Calculating indicators for {selectedStrategy} and applying statutory friction...
              </span>
            </div>
          </div>
        )}

        {/* Groww 4 KPI Cards */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            {/* Card 1: Net P&L */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '600' }}>
                  Net Strategy P&L
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  backgroundColor: isNetWin ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                  color: isNetWin ? '#00d09c' : '#eb5b3c'
                }}>
                  {summary.total_return_pct >= 0 ? '+' : ''}{summary.total_return_pct}%
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: isNetWin ? '#00d09c' : '#eb5b3c' }}>
                {summary.net_pnl >= 0 ? '+' : ''}{currency}{summary.net_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                {summary.net_pnl_formatted}
              </span>
            </div>

            {/* Card 2: Final Equity */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '600' }}>
                Final Portfolio Equity
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#ffffff' }}>
                {currency}{summary.final_equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                {summary.final_equity_formatted}
              </span>
            </div>

            {/* Card 3: Win Rate */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '600' }}>
                Win Rate
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: summary.win_rate >= 50 ? '#00d09c' : '#eb5b3c' }}>
                {summary.win_rate} %
              </div>
              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                {summary.winning_trades}W / {summary.losing_trades}L ({summary.total_trades} Trades)
              </span>
            </div>

            {/* Card 4: Sharpe Ratio */}
            <div style={{
              backgroundColor: '#161922',
              border: '1px solid #242938',
              borderRadius: '16px',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: '600' }}>
                Sharpe Ratio
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: summary.sharpe_ratio > 0 ? '#00d09c' : '#eb5b3c' }}>
                {summary.sharpe_ratio}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                Profit Factor: <b style={{ color: '#ffffff' }}>{summary.profit_factor}</b> • Fee: -{currency}{summary.total_charges.toFixed(0)}
              </span>
            </div>
          </div>
        )}

        {/* View Toggle Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #242938', paddingBottom: '10px' }}>
          {[
            { id: "CHART", label: "📊 Candlestick Chart & Fills" },
            { id: "EQUITY", label: "📈 Portfolio Equity Curve" },
            { id: "JOURNAL", label: `📜 Trade Journal (${summary?.total_trades || 0})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id)}
              style={{
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: '700',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: subView === tab.id ? '#00d09c' : '#161922',
                color: subView === tab.id ? '#0c0e14' : '#9ca3af',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {subView === "CHART" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

        {subView === "EQUITY" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <EquityChart
              equityCurve={backtestResult?.equity_curve || []}
              initialCapital={initialCapital}
              currency={currency}
            />
          </div>
        )}

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

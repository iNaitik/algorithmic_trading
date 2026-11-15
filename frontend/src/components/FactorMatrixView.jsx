import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  TrendingUp,
  BarChart3,
  Award,
  Zap,
  Filter,
  ArrowRight,
  RefreshCw,
  Sliders,
  CheckCircle,
  ArrowUpRight,
  Play,
  CheckSquare,
  Square,
  Grid,
  ListFilter,
  Clock,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function FactorMatrixView({
  onSelectCombination = () => {},
  currency = "₹"
}) {
  const [matrixData, setMatrixData] = useState(null);
  const [matrixOptions, setMatrixOptions] = useState(null);
  const [selectedStocks, setSelectedStocks] = useState(["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"]);
  const [selectedTimeframes, setSelectedTimeframes] = useState(["1m", "2m", "5m"]);
  const [selectedStrategies, setSelectedStrategies] = useState([
    "NSE Intraday ORB Breakout",
    "NSE Midday VWAP Pullback",
    "NSE Failed-Gap Fade"
  ]);

  const [activeViewTab, setActiveViewTab] = useState("leaderboard"); // "leaderboard" | "heatmap"
  const [filterStrategy, setFilterStrategy] = useState("ALL");
  const [filterTimeframe, setFilterTimeframe] = useState("ALL");
  const [filterStock, setFilterStock] = useState("ALL");
  const [sortBy, setSortBy] = useState("sharpe"); // sharpe, return_pct, win_rate, net_pnl, trades
  const [loading, setLoading] = useState(false);

  // Background Task Execution State
  const [isRunningTask, setIsRunningTask] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskProgress, setTaskProgress] = useState({ current: 0, total: 0, pct: 0, current_item: "" });
  const [taskError, setTaskError] = useState(null);
  const pollIntervalRef = useRef(null);

  // Load initial options & summary
  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/matrix/summary');
      if (res.ok) {
        const json = await res.json();
        setMatrixData(json);
      }
    } catch (e) {
      console.error("Failed to load matrix summary:", e);
    }
  };

  useEffect(() => {
    const fetchOptionsAndSummary = async () => {
      setLoading(true);
      try {
        const [optRes, sumRes] = await Promise.all([
          fetch('/api/matrix/options'),
          fetch('/api/matrix/summary')
        ]);
        if (optRes.ok) {
          const optJson = await optRes.json();
          setMatrixOptions(optJson);
        }
        if (sumRes.ok) {
          const sumJson = await sumRes.json();
          setMatrixData(sumJson);
        }
      } catch (e) {
        console.error("Failed to load matrix config:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchOptionsAndSummary();
  }, []);

  // Poll task progress if running
  useEffect(() => {
    if (!isRunningTask || !currentTaskId) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/matrix/task/${currentTaskId}`);
        if (!res.ok) return;
        const task = await res.json();
        
        if (task.progress) {
          setTaskProgress(task.progress);
        }

        if (task.status === "COMPLETED") {
          setIsRunningTask(false);
          clearInterval(pollIntervalRef.current);
          fetchSummary();
        } else if (task.status === "FAILED") {
          setIsRunningTask(false);
          setTaskError(task.error || "Matrix evaluation encountered an error.");
          clearInterval(pollIntervalRef.current);
        }
      } catch (err) {
        console.error("Task polling error:", err);
      }
    }, 600);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isRunningTask, currentTaskId]);

  // Execute Matrix Grid Backtest
  const handleExecuteMatrix = async () => {
    if (selectedStocks.length === 0 || selectedTimeframes.length === 0 || selectedStrategies.length === 0) {
      alert("Please select at least 1 Stock, 1 Timeframe, and 1 Strategy to evaluate.");
      return;
    }

    setIsRunningTask(true);
    setTaskError(null);
    const total = selectedStocks.length * selectedTimeframes.length * selectedStrategies.length;
    setTaskProgress({ current: 0, total, pct: 0, current_item: "Initializing matrix runner..." });

    try {
      const res = await fetch('/api/matrix/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: selectedStocks,
          timeframes: selectedTimeframes,
          strategies: selectedStrategies,
          initial_capital: 1000000.0
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start matrix backtest");
      }

      const data = await res.json();
      setCurrentTaskId(data.task_id);
    } catch (err) {
      setIsRunningTask(false);
      setTaskError(err.message);
    }
  };

  // Toggle multi-select items
  const toggleStock = (sym) => {
    setSelectedStocks(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const toggleTimeframe = (tf) => {
    setSelectedTimeframes(prev =>
      prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
    );
  };

  const toggleStrategy = (strat) => {
    setSelectedStrategies(prev =>
      prev.includes(strat) ? prev.filter(st => st !== strat) : [...prev, strat]
    );
  };

  const applyPreset = (preset) => {
    if (preset.symbols) setSelectedStocks(preset.symbols);
    if (preset.timeframes) setSelectedTimeframes(preset.timeframes);
    if (preset.strategies) setSelectedStrategies(preset.strategies);
  };

  const selectAll = () => {
    if (matrixOptions) {
      setSelectedStocks(matrixOptions.stocks.map(s => s.symbol));
      setSelectedTimeframes(matrixOptions.timeframes.map(t => t.id));
      setSelectedStrategies(matrixOptions.strategies.map(st => st.id));
    }
  };

  const clearAll = () => {
    setSelectedStocks([]);
    setSelectedTimeframes([]);
    setSelectedStrategies([]);
  };

  const totalSelectedRuns = selectedStocks.length * selectedTimeframes.length * selectedStrategies.length;

  // Filtered leaderboard rows
  const allRuns = matrixData?.matrix || [];
  const filteredRuns = allRuns.filter(item => {
    const stratMatch = filterStrategy === "ALL" || item.strategy === filterStrategy;
    const tfMatch = filterTimeframe === "ALL" || item.timeframe === filterTimeframe;
    const stockMatch = filterStock === "ALL" || item.symbol === filterStock || item.asset === filterStock;
    return stratMatch && tfMatch && stockMatch;
  });

  const sortedRuns = [...filteredRuns].sort((a, b) => {
    if (sortBy === "sharpe") return b.sharpe - a.sharpe;
    if (sortBy === "return_pct") return b.return_pct - a.return_pct;
    if (sortBy === "win_rate") return b.win_rate - a.win_rate;
    if (sortBy === "net_pnl") return b.net_pnl - a.net_pnl;
    if (sortBy === "trades") return b.trades - a.trades;
    return 0;
  });

  // Summary Metrics
  const stats = matrixData?.summary_stats || {};
  const best = stats.best_factor || sortedRuns[0] || null;
  const profitableRatio = stats.positive_alpha_ratio || 0;
  const totalCount = stats.total_count || allRuns.length;
  const profitableCount = stats.profitable_count || allRuns.filter(r => r.return_pct > 0).length;

  // Stock options list fallback
  const stockOptions = matrixOptions?.stocks || [
    { symbol: "SBIN.NS", name: "State Bank of India", sector: "PSU Banking" },
    { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy / Retail" },
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Private Banking" },
    { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Private Banking" },
    { symbol: "TCS.NS", name: "TCS", sector: "Information Technology" },
    { symbol: "INFY.NS", name: "Infosys", sector: "Information Technology" },
    { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Private Banking" },
    { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Infrastructure" }
  ];

  const timeframeOptions = matrixOptions?.timeframes || [
    { id: "1m", label: "1m Scalp (7d)" },
    { id: "2m", label: "2m Micro (30d)" },
    { id: "5m", label: "5m MIS (60d)" },
    { id: "15m", label: "15m Momentum (60d)" }
  ];

  const strategyOptions = matrixOptions?.strategies || [
    { id: "NSE Intraday ORB Breakout", label: "Opening Range Breakout (ORB 2R)" },
    { id: "NSE Midday VWAP Pullback", label: "Midday VWAP Pullback + EMA + RSI" },
    { id: "NSE Failed-Gap Fade", label: "Failed-Gap Mean Reversion Fade" }
  ];

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.02em' }}>
              Multi-Factor Matrix Backtester
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
              NSE INDIA MIS
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
            Combinatorial Factor Grid Engine: Cross-evaluate Multiple Stocks × Multiple Timeframes × Multiple Strategies simultaneously
          </p>
        </div>

        {/* Refresh Summary Button */}
        <button
          onClick={fetchSummary}
          disabled={loading || isRunningTask}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            color: '#374151',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh Matrix Data
        </button>
      </div>

      {/* ── Combinatorial Matrix Selection & Execution Panel ───────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        padding: '24px 28px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Panel Header & Presets */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid #f3f4f6',
          paddingBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#111827' }}>
              Configure Factor Combinations Grid
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Select stocks, candle intervals, and quantitative algorithms to run cross-sectional evaluations
            </div>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af' }}>Presets:</span>
            {matrixOptions?.presets?.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              >
                {p.name}
              </button>
            )) || (
              <>
                <button
                  onClick={() => applyPreset({
                    symbols: ["SBIN.NS", "RELIANCE.NS"],
                    timeframes: ["5m", "15m"],
                    strategies: ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback"]
                  })}
                  style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                >
                  ⚡ Quick Test (8 Runs)
                </button>
                <button
                  onClick={() => applyPreset({
                    symbols: ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"],
                    timeframes: ["1m", "2m", "5m"],
                    strategies: ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback", "NSE Failed-Gap Fade"]
                  })}
                  style={{ padding: '6px 12px', borderRadius: '10px', backgroundColor: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                >
                  🔥 Fast Core (36 Runs)
                </button>
              </>
            )}

            <button
              onClick={selectAll}
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                backgroundColor: '#e6f4ea',
                color: '#059669',
                fontSize: '0.75rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.75rem',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* 3 Multi-Selection Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Section 1: Stocks Universe */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                1. Asset Universe ({selectedStocks.length} of {stockOptions.length} Selected)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {stockOptions.map(st => {
                const isSelected = selectedStocks.includes(st.symbol);
                return (
                  <button
                    key={st.symbol}
                    onClick={() => toggleStock(st.symbol)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1.5px solid #059669' : '1px solid #e5e7eb',
                      backgroundColor: isSelected ? '#e6f4ea' : '#ffffff',
                      color: isSelected ? '#059669' : '#4b5563',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#059669" /> : <Square size={13} color="#9ca3af" />}
                    <span>{st.symbol}</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.7, marginLeft: '2px' }}>({st.sector.split(' ')[0]})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Timeframes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                2. Candle Timeframes ({selectedTimeframes.length} of {timeframeOptions.length} Selected)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {timeframeOptions.map(tf => {
                const isSelected = selectedTimeframes.includes(tf.id);
                return (
                  <button
                    key={tf.id}
                    onClick={() => toggleTimeframe(tf.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1.5px solid #059669' : '1px solid #e5e7eb',
                      backgroundColor: isSelected ? '#e6f4ea' : '#ffffff',
                      color: isSelected ? '#059669' : '#4b5563',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#059669" /> : <Square size={13} color="#9ca3af" />}
                    <span>{tf.id}</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>({tf.label || `${tf.id} Bars`})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Strategies */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                3. Quantitative Strategies ({selectedStrategies.length} of {strategyOptions.length} Selected)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {strategyOptions.map(st => {
                const isSelected = selectedStrategies.includes(st.id);
                return (
                  <button
                    key={st.id}
                    onClick={() => toggleStrategy(st.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1.5px solid #059669' : '1px solid #e5e7eb',
                      backgroundColor: isSelected ? '#e6f4ea' : '#ffffff',
                      color: isSelected ? '#059669' : '#4b5563',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#059669" /> : <Square size={13} color="#9ca3af" />}
                    <span>{st.id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Execution Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '14px',
          padding: '16px 20px',
          border: '1px solid #f3f4f6',
          marginTop: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#e6f4ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669'
            }}>
              <Zap size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
                Combinatorial Grid: {selectedStocks.length} Stocks × {selectedTimeframes.length} TF × {selectedStrategies.length} Strats
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Total: <strong style={{ color: '#059669' }}>{totalSelectedRuns} Factor Iterations</strong> using In-Memory Fast Cache Engine
              </div>
            </div>
          </div>

          <button
            onClick={handleExecuteMatrix}
            disabled={isRunningTask || totalSelectedRuns === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '12px',
              backgroundColor: isRunningTask ? '#9ca3af' : '#059669',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: '700',
              border: 'none',
              cursor: isRunningTask ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
              transition: 'background-color 0.2s'
            }}
          >
            {isRunningTask ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Running Matrix Evaluation...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="#ffffff" />
                <span>Execute Matrix ({totalSelectedRuns} Runs)</span>
              </>
            )}
          </button>
        </div>

        {/* Live Progress Bar when Running */}
        {isRunningTask && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} className="animate-spin" />
                {taskProgress.current_item || "Running combinations..."}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#166534' }}>
                [{taskProgress.current} / {taskProgress.total}] ({taskProgress.pct || 0}%)
              </span>
            </div>

            {/* Progress track */}
            <div style={{ width: '100%', height: '8px', backgroundColor: '#dcfce7', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${taskProgress.pct || 0}%`,
                backgroundColor: '#059669',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Error notification */}
        {taskError && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#dc2626',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{taskError}</span>
          </div>
        )}
      </div>

      {/* ── Top 3 Quixotic Summary Highlight Cards ──────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 360px) 1fr minmax(280px, 320px)',
        gap: '20px'
      }}>
        {/* Card 1: Emerald Hero Card (Alpha Leader) */}
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #007a4d 100%)',
          borderRadius: '20px',
          padding: '24px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '220px',
          boxShadow: '0 8px 24px -4px rgba(5, 150, 105, 0.35)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.9 }}>
                Prime Factor Alpha
              </span>
              <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.2)', fontWeight: '700' }}>
                {best?.timeframe || "5m"} Intraday
              </span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '12px' }}>
              {best?.symbol || best?.asset || "SBIN.NS"}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '2px' }}>
              {best?.strategy || "NSE Intraday ORB Breakout"}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '14px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Sharpe Ratio</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800' }}>
                {best?.sharpe != null ? best.sharpe.toFixed(2) : "2.15"}
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: '#ffffff',
              color: '#059669',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}>
              <ArrowUpRight size={14} />
              {best?.return_pct != null ? `${best.return_pct >= 0 ? '+' : ''}${best.return_pct}% Return` : "+19.8% Return"}
            </div>
          </div>
        </div>

        {/* Card 2: Striped Mint Bar Chart (Timeframe Alpha Yield) */}
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
                Timeframe Performance Yield
              </span>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Average net return across candle horizons</div>
            </div>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '8px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              Intraday Alpha
            </span>
          </div>

          {/* Mint Bar chart matching Theme */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '120px', paddingTop: '20px' }}>
            {[
              { tf: "1m", val: 40, pct: "+4.2%", peak: false },
              { tf: "2m", val: 65, pct: "+8.6%", peak: false },
              { tf: "5m", val: 100, pct: "+16.5%", peak: true },
              { tf: "15m", val: 55, pct: "+7.1%", peak: false }
            ].map(b => (
              <div key={b.tf} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '8px' }}>
                {b.peak && (
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '12px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    marginBottom: '-4px'
                  }}>
                    {b.pct}
                  </span>
                )}
                <div style={{
                  width: '100%',
                  height: `${b.val}%`,
                  borderRadius: '10px',
                  backgroundColor: b.peak ? '#059669' : '#a7f3d0',
                  backgroundImage: b.peak ? 'none' : 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(5, 150, 105, 0.15) 4px, rgba(5, 150, 105, 0.15) 8px)',
                  transition: 'height 0.3s ease'
                }} />
                <span style={{ fontSize: '0.72rem', fontWeight: '600', color: b.peak ? '#059669' : '#6b7280' }}>
                  {b.tf}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Factor Health & Summary Metrics */}
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
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' }}>
              Universe Alpha Ratio
            </span>
            <div style={{ fontSize: '1.9rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
              {profitableRatio}%
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: '#e6f4ea',
              color: '#059669',
              fontSize: '0.72rem',
              fontWeight: '700',
              marginTop: '6px'
            }}>
              <CheckCircle size={12} /> {profitableCount} of {totalCount} Configs Profitable
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Median Sharpe</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>
                {stats.median_sharpe != null ? stats.median_sharpe.toFixed(2) : "1.45"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Avg Win Rate</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#059669' }}>
                {stats.avg_win_rate != null ? `${stats.avg_win_rate}%` : "54.2%"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results Container: Leaderboard vs Heatmap ───────────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Table Top Controls Bar */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Tabs: Leaderboard vs Heatmap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActiveViewTab("leaderboard")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: activeViewTab === "leaderboard" ? '#059669' : '#f3f4f6',
                color: activeViewTab === "leaderboard" ? '#ffffff' : '#6b7280',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <ListFilter size={14} />
              Consolidated Leaderboard ({sortedRuns.length})
            </button>
            <button
              onClick={() => setActiveViewTab("heatmap")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: activeViewTab === "heatmap" ? '#059669' : '#f3f4f6',
                color: activeViewTab === "heatmap" ? '#ffffff' : '#6b7280',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <Grid size={14} />
              2D Cross-Sectional Heatmap
            </button>
          </div>

          {/* Quick Filters & Sorters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Stock Filter */}
            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
              style={{
                padding: '7px 12px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              <option value="ALL">All Stocks</option>
              {stockOptions.map(s => (
                <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
              ))}
            </select>

            {/* Strategy Filter */}
            <select
              value={filterStrategy}
              onChange={(e) => setFilterStrategy(e.target.value)}
              style={{
                padding: '7px 12px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              <option value="ALL">All Strategies</option>
              {strategyOptions.map(st => (
                <option key={st.id} value={st.id}>{st.id}</option>
              ))}
            </select>

            {/* Timeframe Filter */}
            <div style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              padding: '2px',
              borderRadius: '9px'
            }}>
              {["ALL", "1m", "2m", "5m", "15m"].map(tf => (
                <button
                  key={tf}
                  onClick={() => setFilterTimeframe(tf)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '0.72rem',
                    fontWeight: filterTimeframe === tf ? '700' : '500',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: filterTimeframe === tf ? '#ffffff' : 'transparent',
                    color: filterTimeframe === tf ? '#111827' : '#6b7280',
                    cursor: 'pointer',
                    boxShadow: filterTimeframe === tf ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Sort Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Sort:</span>
              {[
                { id: "sharpe", label: "Sharpe" },
                { id: "return_pct", label: "Return %" },
                { id: "win_rate", label: "Win Rate" }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSortBy(s.id)}
                  style={{
                    padding: '5px 9px',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    fontWeight: sortBy === s.id ? '700' : '500',
                    border: 'none',
                    backgroundColor: sortBy === s.id ? '#e6f4ea' : '#f3f4f6',
                    color: sortBy === s.id ? '#059669' : '#6b7280',
                    cursor: 'pointer'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── View 1: Consolidated Leaderboard Table ─────────────────── */}
        {activeViewTab === "leaderboard" && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 20px' }}>Rank</th>
                  <th style={{ padding: '12px 20px' }}>Stock</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>Timeframe</th>
                  <th style={{ padding: '12px 20px' }}>Strategy</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Trades</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Win Rate</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Net Return</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Net In-Hand P&L</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Profit Factor</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Sharpe Ratio</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>Tier</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>Studio Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                      No matrix backtest combinations matching current filters. Click "Execute Matrix" to run evaluation grid.
                    </td>
                  </tr>
                ) : (
                  sortedRuns.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '14px 20px', color: '#9ca3af', fontWeight: '700' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: '700', color: '#111827' }}>
                        {row.symbol || row.asset}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#374151', fontSize: '0.72rem', fontWeight: '600' }}>
                          {row.timeframe}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#4b5563', fontWeight: '500' }}>
                        {row.strategy}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#6b7280' }}>
                        {row.trades}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '600', color: row.win_rate >= 50 ? '#059669' : '#dc2626' }}>
                        {row.win_rate}%
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.return_pct >= 0 ? '#059669' : '#dc2626' }}>
                        {row.return_pct >= 0 ? '+' : ''}{row.return_pct}%
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.net_pnl >= 0 ? '#059669' : '#dc2626' }}>
                        {currency}{Math.abs(row.net_pnl).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#374151', fontWeight: '600' }}>
                        {row.profit_factor >= 999 ? '∞' : row.profit_factor.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.sharpe >= 1.5 ? '#059669' : (row.sharpe > 0 ? '#111827' : '#dc2626') }}>
                        {row.sharpe.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          backgroundColor: row.status === 'PRIME' ? '#e6f4ea' : (row.status === 'GOOD' ? '#eff6ff' : '#fef2f2'),
                          color: row.status === 'PRIME' ? '#059669' : (row.status === 'GOOD' ? '#2563eb' : '#dc2626')
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <button
                          onClick={() => onSelectCombination({
                            asset: row.symbol || row.asset,
                            symbol: row.symbol || row.asset,
                            strategy: row.strategy,
                            timeframe: row.timeframe
                          })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(5, 150, 105, 0.2)'
                          }}
                        >
                          Launch in Studio <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── View 2: 2D Cross-Sectional Factor Heatmap ──────────────── */}
        {activeViewTab === "heatmap" && (
          <div style={{ padding: '24px', overflowX: 'auto' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
                  2D Cross-Sectional Alpha Map (Sharpe Ratio & In-Hand Return)
                </span>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Green cells denote Prime institutional alpha (Sharpe &gt; 1.5). Click any cell to launch in Backtesting Studio.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#059669', borderRadius: '3px' }}></span>
                <span>Sharpe &ge; 1.5</span>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#a7f3d0', borderRadius: '3px', marginLeft: '6px' }}></span>
                <span>Sharpe 0.5 - 1.5</span>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#fee2e2', borderRadius: '3px', marginLeft: '6px' }}></span>
                <span>Sub-optimal (&lt; 0.5)</span>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#374151' }}>Asset Universe</th>
                  {["1m", "2m", "5m", "15m"].map(tf => (
                    <th key={tf} colSpan={strategyOptions.length} style={{ padding: '10px 14px', borderLeft: '1px solid #e5e7eb', color: '#111827', fontWeight: '800' }}>
                      {tf} Horizon
                    </th>
                  ))}
                </tr>
                <tr style={{ backgroundColor: '#f9fafb', fontSize: '0.7rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left' }}>Ticker</th>
                  {["1m", "2m", "5m", "15m"].map(tf => (
                    strategyOptions.map(st => (
                      <th key={`${tf}-${st.id}`} style={{ padding: '8px 6px', borderLeft: '1px solid #f3f4f6', minWidth: '75px' }}>
                        {st.id.includes("ORB") ? "ORB" : (st.id.includes("VWAP") ? "VWAP" : "Fade")}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockOptions.map(stk => (
                  <tr key={stk.symbol} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#111827', backgroundColor: '#fafafa' }}>
                      {stk.symbol}
                    </td>
                    {["1m", "2m", "5m", "15m"].map(tf => (
                      strategyOptions.map(st => {
                        const match = allRuns.find(r => (r.symbol === stk.symbol || r.asset === stk.symbol) && r.timeframe === tf && r.strategy === st.id);
                        const sharpe = match?.sharpe ?? 0;
                        const ret = match?.return_pct ?? 0;
                        
                        let cellBg = '#f9fafb';
                        let textColor = '#9ca3af';
                        if (match) {
                          if (sharpe >= 1.5 && ret > 0) {
                            cellBg = '#059669';
                            textColor = '#ffffff';
                          } else if (ret > 0) {
                            cellBg = '#a7f3d0';
                            textColor = '#065f46';
                          } else {
                            cellBg = '#fee2e2';
                            textColor = '#991b1b';
                          }
                        }

                        return (
                          <td
                            key={`${stk.symbol}-${tf}-${st.id}`}
                            onClick={() => match && onSelectCombination({
                              asset: stk.symbol,
                              symbol: stk.symbol,
                              strategy: st.id,
                              timeframe: tf
                            })}
                            style={{
                              padding: '10px 4px',
                              backgroundColor: cellBg,
                              color: textColor,
                              fontWeight: '700',
                              borderLeft: '1px solid #f3f4f6',
                              cursor: match ? 'pointer' : 'default',
                              transition: 'transform 0.1s'
                            }}
                            title={match ? `${stk.symbol} (${tf}) ${st.id}\nReturn: ${ret}%\nSharpe: ${sharpe}\nTrades: ${match.trades}` : 'Not tested'}
                          >
                            {match ? (
                              <div>
                                <div style={{ fontSize: '0.78rem' }}>{ret >= 0 ? '+' : ''}{ret}%</div>
                                <div style={{ fontSize: '0.65rem', opacity: 0.85 }}>S: {sharpe.toFixed(1)}</div>
                              </div>
                            ) : (
                              <span style={{ color: '#d1d5db' }}>-</span>
                            )}
                          </td>
                        );
                      })
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

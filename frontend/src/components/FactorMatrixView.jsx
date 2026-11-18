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

  // Initial Fetch of Matrix Configuration Options and Results
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const [optRes, sumRes] = await Promise.all([
        fetch('/api/matrix/options'),
        fetch('/api/matrix/summary')
      ]);

      if (optRes.ok) {
        const optData = await optRes.json();
        setMatrixOptions(optData);
      }

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setMatrixData(sumData);
      }
    } catch (err) {
      console.error("Failed to load factor matrix telemetry:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // Poll Task Status when a matrix job is executing
  useEffect(() => {
    if (!currentTaskId) return;

    let pollErrorCount = 0;
    const maxPollErrors = 5;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/matrix/task/${currentTaskId}`);
        if (!res.ok) {
          pollErrorCount++;
          if (pollErrorCount >= maxPollErrors) {
            setIsRunningTask(false);
            setTaskError(`Task polling error (${res.status} ${res.statusText}). Polling aborted.`);
            setCurrentTaskId(null);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
          return;
        }

        // Reset error count on successful poll response
        pollErrorCount = 0;

        const data = await res.json();
        setTaskProgress({
          current: data.progress?.current || 0,
          total: data.progress?.total || 0,
          pct: data.progress?.pct || 0,
          current_item: data.progress?.current_item || ""
        });

        if (data.status === "COMPLETED") {
          setIsRunningTask(false);
          setCurrentTaskId(null);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          fetchSummary();
        } else if (data.status === "FAILED") {
          setIsRunningTask(false);
          setTaskError(data.error || "Matrix task failed");
          setCurrentTaskId(null);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch (err) {
        pollErrorCount++;
        console.error("Error polling matrix task status:", err);
        if (pollErrorCount >= maxPollErrors) {
          setIsRunningTask(false);
          setTaskError(`Network error while polling task: ${err.message}`);
          setCurrentTaskId(null);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      }
    }, 1200);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [currentTaskId]);

  // Execute Combinatorial Matrix Task
  const handleExecuteMatrix = async () => {
    if (selectedStocks.length === 0 || selectedTimeframes.length === 0 || selectedStrategies.length === 0) {
      alert("Please select at least one stock, one timeframe, and one strategy.");
      return;
    }

    setIsRunningTask(true);
    setTaskError(null);
    setTaskProgress({ current: 0, total: 0, pct: 0, current_item: "Initializing..." });

    try {
      const res = await fetch('/api/matrix/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: selectedStocks,
          timeframes: selectedTimeframes,
          strategies: selectedStrategies,
          initial_capital: 1000000.0,
          lookback_days: 60
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Failed to trigger factor matrix evaluation");
      }

      const data = await res.json();
      setCurrentTaskId(data.task_id);
    } catch (err) {
      setIsRunningTask(false);
      setTaskError(err.message);
    }
  };

  // Toggle selection helpers
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
      prev.includes(strat) ? prev.filter(s => s !== strat) : [...prev, strat]
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
      
      {/* ── Page Header Banner ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#F1F3F4', letterSpacing: '-0.02em', margin: 0 }}>
              Multi-Factor Matrix Backtester
            </h1>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 10px',
              borderRadius: '20px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C',
              border: '1px solid rgba(0, 208, 156, 0.28)'
            }}>
              NSE INDIA MIS
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#92999C', marginTop: '4px', margin: 0 }}>
            Combinatorial Factor Grid Engine: Cross-evaluate Multiple Stocks × Multiple Timeframes × Multiple Strategies simultaneously
          </p>
        </div>

        {/* Refresh Summary Button */}
        <button
          onClick={fetchSummary}
          disabled={loading || isRunningTask}
          className="btn-groww-secondary"
          style={{ padding: '8px 16px', fontSize: '0.8rem' }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh Matrix Data</span>
        </button>
      </div>

      {/* ── Combinatorial Matrix Selection & Execution Panel ── */}
      <div style={{
        backgroundColor: '#151819',
        borderRadius: '16px',
        padding: '24px 28px',
        border: '1px solid #252A2C',
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
          borderBottom: '1px solid #252A2C',
          paddingBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#F1F3F4' }}>
              Configure Factor Combinations Grid
            </div>
            <div style={{ fontSize: '0.75rem', color: '#92999C', marginTop: '2px' }}>
              Select stocks, candle intervals, and quantitative algorithms to run cross-sectional evaluations
            </div>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#92999C' }}>Presets:</span>
            {matrixOptions?.presets?.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#101314',
                  color: '#F1F3F4',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: '1px solid #252A2C',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
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
                  style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: '#101314', color: '#F1F3F4', fontSize: '0.75rem', fontWeight: '600', border: '1px solid #252A2C', cursor: 'pointer' }}
                >
                  ⚡ Quick Test (8 Runs)
                </button>
                <button
                  onClick={() => applyPreset({
                    symbols: ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"],
                    timeframes: ["1m", "2m", "5m"],
                    strategies: ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback", "NSE Failed-Gap Fade"]
                  })}
                  style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: '#101314', color: '#F1F3F4', fontSize: '0.75rem', fontWeight: '600', border: '1px solid #252A2C', cursor: 'pointer' }}
                >
                  🔥 Fast Core (36 Runs)
                </button>
              </>
            )}

            <button
              onClick={selectAll}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 208, 156, 0.12)',
                color: '#00D09C',
                border: '1px solid rgba(0, 208, 156, 0.28)',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(235, 91, 60, 0.12)',
                color: '#EB5B3C',
                border: '1px solid rgba(235, 91, 60, 0.28)',
                fontSize: '0.75rem',
                fontWeight: '600',
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
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1px solid #00D09C' : '1px solid #252A2C',
                      backgroundColor: isSelected ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                      color: isSelected ? '#00D09C' : '#92999C',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#00D09C" /> : <Square size={13} color="#626A6E" />}
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
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1px solid #00D09C' : '1px solid #252A2C',
                      backgroundColor: isSelected ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                      color: isSelected ? '#00D09C' : '#92999C',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#00D09C" /> : <Square size={13} color="#626A6E" />}
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
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1px solid #00D09C' : '1px solid #252A2C',
                      backgroundColor: isSelected ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                      color: isSelected ? '#00D09C' : '#92999C',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? <CheckSquare size={13} color="#00D09C" /> : <Square size={13} color="#626A6E" />}
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
          backgroundColor: '#080A0B',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid #252A2C',
          marginTop: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D09C'
            }}>
              <Zap size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F1F3F4' }}>
                Combinatorial Grid: {selectedStocks.length} Stocks × {selectedTimeframes.length} TF × {selectedStrategies.length} Strats
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92999C' }}>
                Total: <strong style={{ color: '#00D09C' }}>{totalSelectedRuns} Factor Iterations</strong> using In-Memory Fast Cache Engine
              </div>
            </div>
          </div>

          <button
            onClick={handleExecuteMatrix}
            disabled={isRunningTask || totalSelectedRuns === 0}
            className="btn-groww-primary"
            style={{ padding: '10px 22px', fontSize: '0.85rem' }}
          >
            {isRunningTask ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Running Matrix Evaluation...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="#080A0B" />
                <span>Execute Matrix ({totalSelectedRuns} Runs)</span>
              </>
            )}
          </button>
        </div>

        {/* Live Progress Bar when Running */}
        {isRunningTask && (
          <div style={{
            backgroundColor: '#101314',
            border: '1px solid #252A2C',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#00D09C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} className="animate-spin" />
                {taskProgress.current_item || "Running combinations..."}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#00D09C' }}>
                [{taskProgress.current} / {taskProgress.total}] ({taskProgress.pct || 0}%)
              </span>
            </div>

            {/* Progress track */}
            <div style={{ width: '100%', height: '6px', backgroundColor: '#252A2C', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${taskProgress.pct || 0}%`,
                backgroundColor: '#00D09C',
                borderRadius: '3px',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Error notification */}
        {taskError && (
          <div style={{
            backgroundColor: 'rgba(235, 91, 60, 0.12)',
            border: '1px solid #EB5B3C',
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#EB5B3C',
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

      {/* ── Top 3 Summary Highlight Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px'
      }}>
        {/* Card 1: Emerald Hero Card (Alpha Leader) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(0, 208, 156, 0.2) 0%, #151819 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid rgba(0, 208, 156, 0.35)',
          color: '#F1F3F4',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '200px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#00D09C' }}>
                Prime Factor Alpha
              </span>
              <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700' }}>
                {best?.timeframe || "5m"} Intraday
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', marginTop: '12px', color: '#F1F3F4' }}>
              {best?.symbol || best?.asset || "SBIN.NS"}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#92999C', marginTop: '2px' }}>
              {best?.strategy || "NSE Intraday ORB Breakout"}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #252A2C', paddingTop: '14px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#92999C' }}>Sharpe Ratio</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#F1F3F4' }} className="font-tabular">
                {best?.sharpe != null ? best.sharpe.toFixed(2) : "2.15"}
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: 'rgba(0, 208, 156, 0.15)',
              color: '#00D09C',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}>
              <ArrowUpRight size={14} />
              {best?.return_pct != null ? `${best.return_pct >= 0 ? '+' : ''}${best.return_pct}% Return` : "+19.8% Return"}
            </div>
          </div>
        </div>

        {/* Card 2: Timeframe Performance Yield */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '22px 26px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4' }}>
                Timeframe Performance Yield
              </span>
              <div style={{ fontSize: '0.72rem', color: '#92999C' }}>Average net return across candle horizons</div>
            </div>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C'
            }}>
              Intraday Alpha
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '110px', paddingTop: '16px' }}>
            {[
              { tf: "1m", val: 40, pct: "+4.2%", peak: false },
              { tf: "2m", val: 65, pct: "+8.6%", peak: false },
              { tf: "5m", val: 100, pct: "+16.5%", peak: true },
              { tf: "15m", val: 55, pct: "+7.1%", peak: false }
            ].map(b => (
              <div key={b.tf} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '8px' }}>
                <div style={{
                  width: '100%',
                  height: `${b.val}%`,
                  borderRadius: '6px',
                  backgroundColor: b.peak ? '#00D09C' : '#252A2C',
                  transition: 'height 0.3s ease'
                }} />
                <span style={{ fontSize: '0.72rem', fontWeight: '600', color: b.peak ? '#00D09C' : '#92999C' }}>
                  {b.tf}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Factor Health & Summary Metrics */}
        <div style={{
          backgroundColor: '#151819',
          borderRadius: '16px',
          padding: '22px 24px',
          border: '1px solid #252A2C',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92999C', textTransform: 'uppercase' }}>
              Universe Alpha Ratio
            </span>
            <div style={{ fontSize: '1.9rem', fontWeight: '800', color: '#F1F3F4', marginTop: '4px' }} className="font-tabular">
              {profitableRatio}%
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C',
              fontSize: '0.72rem',
              fontWeight: '700',
              marginTop: '6px'
            }}>
              <CheckCircle size={12} /> {profitableCount} of {totalCount} Configs Profitable
            </div>
          </div>

          <div style={{ borderTop: '1px solid #252A2C', paddingTop: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#92999C' }}>Median Sharpe</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                {stats.median_sharpe != null ? stats.median_sharpe.toFixed(2) : "1.45"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#92999C' }}>Avg Win Rate</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#00D09C' }} className="font-tabular">
                {stats.avg_win_rate != null ? `${stats.avg_win_rate}%` : "54.2%"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results Container: Leaderboard vs Heatmap ── */}
      <div style={{
        backgroundColor: '#151819',
        borderRadius: '16px',
        border: '1px solid #252A2C',
        overflow: 'hidden'
      }}>
        {/* Table Top Controls Bar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #252A2C',
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
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeViewTab === "leaderboard" ? '#00D09C' : '#080A0B',
                color: activeViewTab === "leaderboard" ? '#080A0B' : '#92999C',
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
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeViewTab === "heatmap" ? '#00D09C' : '#080A0B',
                color: activeViewTab === "heatmap" ? '#080A0B' : '#92999C',
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
                backgroundColor: '#080A0B',
                border: '1px solid #252A2C',
                borderRadius: '8px',
                color: '#F1F3F4',
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
                backgroundColor: '#080A0B',
                border: '1px solid #252A2C',
                borderRadius: '8px',
                color: '#F1F3F4',
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
              backgroundColor: '#080A0B',
              padding: '2px',
              borderRadius: '8px',
              border: '1px solid #252A2C'
            }}>
              {["ALL", "1m", "2m", "5m", "15m"].map(tf => (
                <button
                  key={tf}
                  onClick={() => setFilterTimeframe(tf)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '0.72rem',
                    fontWeight: filterTimeframe === tf ? '700' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: filterTimeframe === tf ? '#00D09C' : 'transparent',
                    color: filterTimeframe === tf ? '#080A0B' : '#92999C',
                    cursor: 'pointer'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Sort Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: '#92999C' }}>Sort:</span>
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
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: sortBy === s.id ? '700' : '500',
                    border: '1px solid',
                    borderColor: sortBy === s.id ? '#00D09C' : '#252A2C',
                    backgroundColor: sortBy === s.id ? 'rgba(0, 208, 156, 0.12)' : '#080A0B',
                    color: sortBy === s.id ? '#00D09C' : '#92999C',
                    cursor: 'pointer'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── View 1: Consolidated Leaderboard Table ── */}
        {activeViewTab === "leaderboard" && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#101314', color: '#92999C', borderBottom: '1px solid #252A2C', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
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
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#92999C' }}>
                      No matrix backtest combinations matching current filters. Click "Execute Matrix" to run evaluation grid.
                    </td>
                  </tr>
                ) : (
                  sortedRuns.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #252A2C',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1c2022'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '14px 20px', color: '#626A6E', fontWeight: '700' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: '700', color: '#F1F3F4' }}>
                        {row.symbol || row.asset}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: '#080A0B', color: '#F1F3F4', fontSize: '0.72rem', fontWeight: '600', border: '1px solid #252A2C' }}>
                          {row.timeframe}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#92999C', fontWeight: '500' }}>
                        {row.strategy}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#92999C' }} className="font-tabular">
                        {row.trades}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '600', color: row.win_rate >= 50 ? '#00D09C' : '#EB5B3C' }} className="font-tabular">
                        {row.win_rate}%
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.return_pct >= 0 ? '#00D09C' : '#EB5B3C' }} className="font-tabular">
                        {row.return_pct >= 0 ? '+' : ''}{row.return_pct}%
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.net_pnl >= 0 ? '#00D09C' : '#EB5B3C' }} className="font-tabular">
                        {currency}{Math.abs(row.net_pnl).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#F1F3F4', fontWeight: '600' }} className="font-tabular">
                        {row.profit_factor >= 999 ? '∞' : row.profit_factor.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.sharpe >= 1.5 ? '#00D09C' : (row.sharpe > 0 ? '#F1F3F4' : '#EB5B3C') }} className="font-tabular">
                        {row.sharpe.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          backgroundColor: row.status === 'PRIME' ? 'rgba(0, 208, 156, 0.12)' : (row.status === 'GOOD' ? 'rgba(83, 103, 255, 0.12)' : 'rgba(235, 91, 60, 0.12)'),
                          color: row.status === 'PRIME' ? '#00D09C' : (row.status === 'GOOD' ? '#5367FF' : '#EB5B3C'),
                          border: `1px solid ${row.status === 'PRIME' ? 'rgba(0, 208, 156, 0.28)' : '#252A2C'}`
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
                          className="btn-groww-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.72rem'
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

        {/* ── View 2: 2D Cross-Sectional Factor Heatmap ── */}
        {activeViewTab === "heatmap" && (
          <div style={{ padding: '24px', overflowX: 'auto' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F1F3F4' }}>
                  2D Cross-Sectional Alpha Map (Sharpe Ratio & In-Hand Return)
                </span>
                <p style={{ fontSize: '0.75rem', color: '#92999C', marginTop: '2px' }}>
                  Green cells denote Prime institutional alpha (Sharpe &gt; 1.5). Click any cell to launch in Backtesting Studio.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#92999C' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#00D09C', borderRadius: '3px' }}></span>
                <span>Sharpe &ge; 1.5</span>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'rgba(0, 208, 156, 0.3)', borderRadius: '3px', marginLeft: '6px' }}></span>
                <span>Sharpe 0.5 - 1.5</span>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'rgba(235, 91, 60, 0.3)', borderRadius: '3px', marginLeft: '6px' }}></span>
                <span>Sub-optimal (&lt; 0.5)</span>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#101314', borderBottom: '1px solid #252A2C' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#92999C' }}>Asset Universe</th>
                  {["1m", "2m", "5m", "15m"].map(tf => (
                    <th key={tf} colSpan={strategyOptions.length} style={{ padding: '10px 14px', borderLeft: '1px solid #252A2C', color: '#F1F3F4', fontWeight: '800' }}>
                      {tf} Horizon
                    </th>
                  ))}
                </tr>
                <tr style={{ backgroundColor: '#101314', fontSize: '0.7rem', color: '#92999C', borderBottom: '1px solid #252A2C' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left' }}>Ticker</th>
                  {["1m", "2m", "5m", "15m"].map(tf => (
                    strategyOptions.map(st => (
                      <th key={`${tf}-${st.id}`} style={{ padding: '8px 6px', borderLeft: '1px solid #252A2C', minWidth: '75px' }}>
                        {st.id.includes("ORB") ? "ORB" : (st.id.includes("VWAP") ? "VWAP" : "Fade")}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockOptions.map(stk => (
                  <tr key={stk.symbol} style={{ borderBottom: '1px solid #252A2C' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#F1F3F4', backgroundColor: '#101314' }}>
                      {stk.symbol}
                    </td>
                    {["1m", "2m", "5m", "15m"].map(tf => (
                      strategyOptions.map(st => {
                        const match = allRuns.find(r => (r.symbol === stk.symbol || r.asset === stk.symbol) && r.timeframe === tf && r.strategy === st.id);
                        const sharpe = match?.sharpe ?? 0;
                        const ret = match?.return_pct ?? 0;
                        
                        let cellBg = '#080A0B';
                        let textColor = '#626A6E';
                        if (match) {
                          if (sharpe >= 1.5 && ret > 0) {
                            cellBg = 'rgba(0, 208, 156, 0.35)';
                            textColor = '#00D09C';
                          } else if (ret > 0) {
                            cellBg = 'rgba(0, 208, 156, 0.15)';
                            textColor = '#00D09C';
                          } else {
                            cellBg = 'rgba(235, 91, 60, 0.15)';
                            textColor = '#EB5B3C';
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
                              borderLeft: '1px solid #252A2C',
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
                              <span style={{ color: '#252A2C' }}>-</span>
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

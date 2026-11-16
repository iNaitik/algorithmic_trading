import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

export default function BloombergChart({
  candles = [],
  markers = [],
  indicators = {},
  symbol = "RELIANCE.NS",
  interval = "5m",
  currency = "₹",
  height = 420
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const vwapSeriesRef = useRef(null);

  const [hoverData, setHoverData] = useState(null);
  const [showVwap, setShowVwap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;

    // Bloomberg Terminal Dark Palette
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#070a10' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', Consolas, monospace",
      },
      grid: {
        vertLines: { color: '#141c2c' },
        horzLines: { color: '#141c2c' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#ff9900',
          width: 1,
          style: 3,
          labelBackgroundColor: '#ff9900',
        },
        horzLine: {
          color: '#ff9900',
          width: 1,
          style: 3,
          labelBackgroundColor: '#ff9900',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Candlestick Series (Cyber Lime Up / Red Down)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00ff66',
      downColor: '#ff3344',
      borderVisible: false,
      wickUpColor: '#00ff66',
      wickDownColor: '#ff3344',
    });
    candleSeriesRef.current = candleSeries;

    // Volume Histogram Series (Cyan tinted)
    const volumeSeries = chart.addHistogramSeries({
      color: '#00e5ff30',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // VWAP Line Series (Amber Gold)
    const vwapSeries = chart.addLineSeries({
      color: '#ff9900',
      lineWidth: 2,
      priceLineVisible: false,
      title: 'VWAP',
    });
    vwapSeriesRef.current = vwapSeries;

    // Subscribe to crosshair move for real-time OHLCV terminal banner
    chart.subscribeCrosshairMove(param => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > height
      ) {
        setHoverData(null);
      } else {
        const candle = param.seriesData.get(candleSeries);
        const volume = param.seriesData.get(volumeSeries);
        if (candle) {
          setHoverData({
            time: param.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: volume ? volume.value : null
          });
        }
      }
    });

    // Handle responsive container resize
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: height
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height]);

  // Synchronize Candles & Volume Data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles || candles.length === 0) return;

    try {
      // Sort and deduplicate candles
      const sortedCandles = [...candles]
        .map(c => ({
          time: typeof c.time === 'string' ? Math.floor(new Date(c.time).getTime() / 1000) : Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0)
        }))
        .filter(c => !isNaN(c.time) && !isNaN(c.open) && !isNaN(c.close))
        .sort((a, b) => a.time - b.time);

      // Deduplicate strictly identical timestamps
      const uniqueCandles = [];
      const seenTimes = new Set();
      for (const c of sortedCandles) {
        if (!seenTimes.has(c.time)) {
          seenTimes.add(c.time);
          uniqueCandles.push(c);
        }
      }

      if (uniqueCandles.length > 0) {
        candleSeriesRef.current.setData(uniqueCandles);

        const volumeData = uniqueCandles.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(0, 255, 102, 0.25)' : 'rgba(255, 51, 68, 0.25)'
        }));
        volumeSeriesRef.current.setData(volumeData);

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }
    } catch (err) {
      console.warn("BloombergChart candles feed error:", err);
    }
  }, [candles]);

  // Synchronize VWAP Indicator
  useEffect(() => {
    if (!vwapSeriesRef.current) return;
    if (!showVwap || !indicators?.vwap || indicators.vwap.length === 0) {
      vwapSeriesRef.current.setData([]);
      return;
    }

    try {
      const vwapData = indicators.vwap
        .map(v => ({
          time: typeof v.time === 'string' ? Math.floor(new Date(v.time).getTime() / 1000) : Number(v.time),
          value: Number(v.value)
        }))
        .filter(v => !isNaN(v.time) && !isNaN(v.value))
        .sort((a, b) => a.time - b.time);

      const uniqueVwap = [];
      const seenTimes = new Set();
      for (const item of vwapData) {
        if (!seenTimes.has(item.time)) {
          seenTimes.add(item.time);
          uniqueVwap.push(item);
        }
      }

      vwapSeriesRef.current.setData(uniqueVwap);
    } catch (err) {
      console.warn("BloombergChart VWAP feed error:", err);
    }
  }, [indicators?.vwap, showVwap]);

  // Synchronize Trade Execution Markers
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (!showMarkers || !markers || markers.length === 0) {
      candleSeriesRef.current.setMarkers([]);
      return;
    }

    try {
      const chartMarkers = markers
        .map(m => {
          const isBuy = m.position === 'belowBar' || (m.text && m.text.includes("BUY")) || (m.shape === 'arrowUp');
          return {
            time: typeof m.time === 'string' ? Math.floor(new Date(m.time).getTime() / 1000) : Number(m.time),
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#00ff66' : '#ff3344',
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: m.text || (isBuy ? 'BUY' : 'SELL'),
            size: 1
          };
        })
        .filter(m => !isNaN(m.time))
        .sort((a, b) => a.time - b.time);

      candleSeriesRef.current.setMarkers(chartMarkers);
    } catch (err) {
      console.warn("BloombergChart markers error:", err);
    }
  }, [markers, showMarkers]);

  // Last known quote for top telemetry
  const latestCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  const displayData = hoverData || latestCandle;
  const isUp = displayData ? displayData.close >= displayData.open : true;

  return (
    <div style={{ position: 'relative', width: '100%', backgroundColor: '#070a10', border: '1px solid #1e293b' }}>
      {/* Top Bloomberg Chart Telemetry Ribbon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        backgroundColor: '#0d131f',
        borderBottom: '1px solid #1e293b',
        fontSize: '0.72rem',
        color: '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#ff9900', fontWeight: '800', letterSpacing: '0.04em' }}>
            {symbol} [{interval.toUpperCase()}]
          </span>
          {displayData && (
            <div style={{ display: 'flex', gap: '10px', color: '#e2e8f0' }}>
              <span>O: <strong style={{ color: '#00e5ff' }}>{currency}{displayData.open?.toFixed(2)}</strong></span>
              <span>H: <strong style={{ color: '#00e5ff' }}>{currency}{displayData.high?.toFixed(2)}</strong></span>
              <span>L: <strong style={{ color: '#00e5ff' }}>{currency}{displayData.low?.toFixed(2)}</strong></span>
              <span>C: <strong style={{ color: isUp ? '#00ff66' : '#ff3344' }}>{currency}{displayData.close?.toFixed(2)}</strong></span>
              {displayData.volume != null && (
                <span>VOL: <strong style={{ color: '#ff9900' }}>{Math.round(displayData.volume).toLocaleString()}</strong></span>
              )}
            </div>
          )}
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowVwap(!showVwap)}
            style={{
              background: showVwap ? 'rgba(255, 153, 0, 0.2)' : '#101622',
              border: `1px solid ${showVwap ? '#ff9900' : '#1e293b'}`,
              color: showVwap ? '#ff9900' : '#64748b',
              padding: '2px 8px',
              fontSize: '0.68rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            VWAP
          </button>
          <button
            onClick={() => setShowMarkers(!showMarkers)}
            style={{
              background: showMarkers ? 'rgba(0, 229, 255, 0.2)' : '#101622',
              border: `1px solid ${showMarkers ? '#00e5ff' : '#1e293b'}`,
              color: showMarkers ? '#00e5ff' : '#64748b',
              padding: '2px 8px',
              fontSize: '0.68rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            SIGNALS
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />
    </div>
  );
}

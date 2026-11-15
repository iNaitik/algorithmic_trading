import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { BarChart2, Eye, EyeOff, Layers, Filter } from 'lucide-react';

export default function CandleChart({
  candles = [],
  markers = [],
  indicators = {},
  symbol = "RELIANCE.NS",
  interval = "5m",
  currency = "₹"
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const vwapSeriesRef = useRef(null);

  const [hoverData, setHoverData] = useState(null);
  const [showVwap, setShowVwap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showMarkerText, setShowMarkerText] = useState(true);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;

    // Quixotic Clean Light Palette
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontSize: 12,
        fontFamily: "'Inter', sans-serif",
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#059669',
          width: 1,
          style: 3,
          labelBackgroundColor: '#059669',
        },
        horzLine: {
          color: '#059669',
          width: 1,
          style: 3,
          labelBackgroundColor: '#059669',
        },
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: interval.includes("m") || interval.includes("h"),
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series (Emerald Up / Crimson Down)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#059669',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#059669',
      wickDownColor: '#dc2626',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#a7f3d0',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Set Candlestick Data
    if (candles && candles.length > 0) {
      candleSeries.setData(candles);

      const volumeData = candles.map((c) => ({
        time: c.time,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)',
      }));
      volumeSeries.setData(volumeData);
    }

    // 3. Optional VWAP Overlay
    if (indicators && indicators.vwap && indicators.vwap.length > 0 && showVwap) {
      const vwapSeries = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        title: 'VWAP',
        priceLineVisible: false,
      });
      vwapSeries.setData(indicators.vwap);
      vwapSeriesRef.current = vwapSeries;
    }

    // 4. Trade Markers (Clear BUY / SHORT / EXIT signals)
    if (markers && markers.length > 0 && showMarkers) {
      // Map markers according to showMarkerText preference
      const cleanMarkers = markers.map(m => ({
        ...m,
        text: showMarkerText ? m.text : "" // If false, renders only the clean arrow icon!
      }));
      candleSeries.setMarkers(cleanMarkers);
    }

    // Crosshair hover tracking
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setHoverData(null);
      } else {
        const candle = param.seriesData.get(candleSeries);
        const vol = param.seriesData.get(volumeSeries);
        if (candle) {
          setHoverData({
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: vol ? vol.value : null,
          });
        }
      }
    });

    if (candles && candles.length > 0) {
      try {
        chart.timeScale().fitContent();
      } catch (e) {
        console.warn("fitContent warning:", e);
      }
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
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
  }, [candles, markers, indicators, showVwap, showMarkers, showMarkerText]);

  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const currentView = hoverData || latestCandle;

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '20px',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Chart Top Toolbar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Ticker & Live Price Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.01em' }}>
              {symbol}
            </span>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '2px 8px',
              backgroundColor: '#e6f4ea',
              color: '#059669',
              borderRadius: '6px'
            }}>
              {interval}
            </span>
          </div>

          {currentView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: '#6b7280' }}>O: <b style={{ color: '#111827' }}>{currency}{currentView.open?.toFixed(2)}</b></span>
              <span style={{ color: '#6b7280' }}>H: <b style={{ color: '#059669' }}>{currency}{currentView.high?.toFixed(2)}</b></span>
              <span style={{ color: '#6b7280' }}>L: <b style={{ color: '#dc2626' }}>{currency}{currentView.low?.toFixed(2)}</b></span>
              <span style={{ color: '#6b7280' }}>C: <b style={{ color: currentView.close >= currentView.open ? '#059669' : '#dc2626' }}>{currency}{currentView.close?.toFixed(2)}</b></span>
              {currentView.volume != null && (
                <span style={{ color: '#6b7280' }}>Vol: <b style={{ color: '#059669' }}>{currentView.volume.toLocaleString()}</b></span>
              )}
            </div>
          )}
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {indicators && indicators.vwap && (
            <button
              onClick={() => setShowVwap(!showVwap)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '5px 10px',
                borderRadius: '8px',
                backgroundColor: showVwap ? '#fef3c7' : '#f3f4f6',
                color: showVwap ? '#d97706' : '#6b7280',
                border: 'none',
              }}
            >
              VWAP
            </button>
          )}

          <button
            onClick={() => setShowMarkers(!showMarkers)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '5px 10px',
              borderRadius: '8px',
              backgroundColor: showMarkers ? '#e6f4ea' : '#f3f4f6',
              color: showMarkers ? '#059669' : '#6b7280',
              border: 'none',
            }}
          >
            Signals ({markers.length})
          </button>

          {showMarkers && (
            <button
              onClick={() => setShowMarkerText(!showMarkerText)}
              title="Toggle between Text Labels and Clean Arrows"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '5px 10px',
                borderRadius: '8px',
                backgroundColor: showMarkerText ? '#f3f4f6' : '#e6f4ea',
                color: showMarkerText ? '#4b5563' : '#059669',
                border: '1px solid #e5e7eb',
              }}
            >
              {showMarkerText ? "Arrow Only" : "Show Labels"}
            </button>
          )}
        </div>
      </div>

      {/* Canvas Mount */}
      <div style={{ position: 'relative', width: '100%', height: '480px' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        {candles.length === 0 && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            color: '#6b7280'
          }}>
            <BarChart2 size={38} color="#059669" />
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
              Chart Ready & Standing By
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Click <b style={{ color: '#059669' }}>"RUN STRATEGY SIMULATION"</b> to render price candles & signals.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

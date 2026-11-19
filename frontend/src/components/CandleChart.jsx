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

    // Dark Fintech TradingView Canvas
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#0D1114' },
        textColor: '#92999C',
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: '#1A1E22' },
        horzLines: { color: '#1A1E22' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#00D09C',
          width: 1,
          style: 3,
          labelBackgroundColor: '#00D09C',
        },
        horzLine: {
          color: '#00D09C',
          width: 1,
          style: 3,
          labelBackgroundColor: '#00D09C',
        },
      },
      rightPriceScale: {
        borderColor: '#202426',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#202426',
        timeVisible: interval.includes("m") || interval.includes("h"),
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series (Groww Mint Up #00D09C / Crimson Down #EB5B3C)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00D09C',
      downColor: '#EB5B3C',
      borderVisible: false,
      wickUpColor: '#00D09C',
      wickDownColor: '#EB5B3C',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#263137',
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
        color: c.close >= c.open ? 'rgba(0, 208, 156, 0.35)' : 'rgba(235, 91, 60, 0.35)',
      }));
      volumeSeries.setData(volumeData);
    }

    // 3. Optional VWAP Overlay
    if (indicators && indicators.vwap && indicators.vwap.length > 0 && showVwap) {
      const vwapSeries = chart.addLineSeries({
        color: '#F59E0B',
        lineWidth: 2,
        title: 'VWAP',
        priceLineVisible: false,
      });
      vwapSeries.setData(indicators.vwap);
      vwapSeriesRef.current = vwapSeries;
    }

    // 4. Trade Markers (Clear BUY / SHORT / EXIT signals)
    if (markers && markers.length > 0 && showMarkers) {
      const cleanMarkers = markers.map(m => ({
        ...m,
        text: showMarkerText ? m.text : ""
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
        const volume = param.seriesData.get(volumeSeries);
        if (candle) {
          setHoverData({
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: volume ? volume.value : null,
          });
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, markers, indicators, interval, showVwap, showMarkers, showMarkerText]);

  // Current display data: hover or last bar
  const lastBar = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  const currentView = hoverData || lastBar;

  return (
    <div style={{
      backgroundColor: '#121517',
      border: '1px solid #202426',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header & HUD bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #202426',
        backgroundColor: '#151819',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Symbol & OHLC Values */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#F1F3F4', letterSpacing: '-0.01em' }}>
              {symbol}
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C',
              border: '1px solid rgba(0, 208, 156, 0.25)',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {interval}
            </span>
          </div>

          {currentView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: '#92999C' }}>O: <b style={{ color: '#F1F3F4' }}>{currency}{currentView.open?.toFixed(2)}</b></span>
              <span style={{ color: '#92999C' }}>H: <b style={{ color: '#00D09C' }}>{currency}{currentView.high?.toFixed(2)}</b></span>
              <span style={{ color: '#92999C' }}>L: <b style={{ color: '#EB5B3C' }}>{currency}{currentView.low?.toFixed(2)}</b></span>
              <span style={{ color: '#92999C' }}>C: <b style={{ color: currentView.close >= currentView.open ? '#00D09C' : '#EB5B3C' }}>{currency}{currentView.close?.toFixed(2)}</b></span>
              {currentView.volume != null && (
                <span style={{ color: '#92999C' }}>Vol: <b style={{ color: '#60A5FA' }}>{Number(currentView.volume).toLocaleString()}</b></span>
              )}
            </div>
          )}
        </div>

        {/* Indicator & Marker Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {indicators && indicators.vwap && (
            <button
              onClick={() => setShowVwap(!showVwap)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: showVwap ? 'rgba(245, 158, 11, 0.15)' : '#080A0B',
                color: showVwap ? '#F59E0B' : '#92999C',
                border: showVwap ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #202426',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              VWAP
            </button>
          )}

          <button
            onClick={() => setShowMarkers(!showMarkers)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '8px',
              backgroundColor: showMarkers ? 'rgba(0, 208, 156, 0.15)' : '#080A0B',
              color: showMarkers ? '#00D09C' : '#92999C',
              border: showMarkers ? '1px solid rgba(0, 208, 156, 0.35)' : '1px solid #202426',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Signals ({markers.length})
          </button>

          {showMarkers && (
            <button
              onClick={() => setShowMarkerText(!showMarkerText)}
              title="Toggle between Text Labels and Clean Arrows"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: '600',
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: '#080A0B',
                color: '#92999C',
                border: '1px solid #202426',
                cursor: 'pointer'
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
            backgroundColor: 'rgba(13, 17, 20, 0.95)',
            color: '#92999C'
          }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              border: '1px solid rgba(0, 208, 156, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D09C'
            }}>
              <BarChart2 size={26} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4' }}>
              Chart Ready & Standing By
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C' }}>
              Click <b style={{ color: '#00D09C' }}>"RUN STRATEGY SIMULATION"</b> in the studio to generate candles and markers.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

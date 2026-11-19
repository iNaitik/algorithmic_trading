import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { TrendingUp } from 'lucide-react';

export default function EquityChart({
  equityCurve = [],
  initialCapital = 1000000.0,
  currency = "₹"
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 320,
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
      },
      timeScale: {
        borderColor: '#202426',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // Groww Mint / Crimson Area Series
    const isProfitable = equityCurve.length > 0 && equityCurve[equityCurve.length - 1].equity >= initialCapital;
    const topColor = isProfitable ? 'rgba(0, 208, 156, 0.35)' : 'rgba(235, 91, 60, 0.35)';
    const bottomColor = isProfitable ? 'rgba(0, 208, 156, 0.0)' : 'rgba(235, 91, 60, 0.0)';
    const lineColor = isProfitable ? '#00D09C' : '#EB5B3C';

    const areaSeries = chart.addAreaSeries({
      topColor,
      bottomColor,
      lineColor,
      lineWidth: 2,
    });

    if (equityCurve && equityCurve.length > 0) {
      const formattedData = equityCurve.map((pt) => ({
        time: pt.time,
        value: pt.equity,
      }));
      areaSeries.setData(formattedData);

      // Baseline at initial capital
      const baselineSeries = chart.addLineSeries({
        color: '#626A6E',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        title: 'Initial Capital',
      });
      const baselineData = equityCurve.map((pt) => ({
        time: pt.time,
        value: initialCapital,
      }));
      baselineSeries.setData(baselineData);

      if (formattedData.length > 0) {
        try {
          chart.timeScale().fitContent();
        } catch (e) {
          console.warn("fitContent warning:", e);
        }
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
  }, [equityCurve, initialCapital]);

  return (
    <div style={{
      backgroundColor: '#121517',
      border: '1px solid #202426',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #202426',
        backgroundColor: '#151819',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={16} color="#00D09C" />
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F1F3F4' }}>
            Portfolio Equity Curve (In-Hand Cash + Open Mark-to-Market)
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#92999C', fontFamily: "'JetBrains Mono', monospace" }}>
          Baseline Capital: {currency}{Number(initialCapital || 0).toLocaleString()}
        </span>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '320px' }} />
    </div>
  );
}

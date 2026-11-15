import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

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
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontSize: 12,
        fontFamily: "'Inter', sans-serif",
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      rightPriceScale: {
        borderColor: '#e5e7eb',
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // Quixotic Emerald Area Series
    const isProfitable = equityCurve.length > 0 && equityCurve[equityCurve.length - 1].equity >= initialCapital;
    const topColor = isProfitable ? 'rgba(5, 150, 105, 0.35)' : 'rgba(220, 38, 38, 0.35)';
    const bottomColor = isProfitable ? 'rgba(5, 150, 105, 0.0)' : 'rgba(220, 38, 38, 0.0)';
    const lineColor = isProfitable ? '#059669' : '#dc2626';

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
        color: '#9ca3af',
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
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '20px',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
          📈 Portfolio Equity Curve (In-Hand Cash + Open Mark-to-Market)
        </span>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}>
          Baseline: {currency}{initialCapital.toLocaleString()}
        </span>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '320px' }} />
    </div>
  );
}

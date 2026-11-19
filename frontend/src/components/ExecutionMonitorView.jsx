import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Filter,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  X,
  ExternalLink,
  ChevronRight,
  Layers,
  ShieldCheck,
  TrendingUp,
  FileText,
  Percent,
  Play
} from 'lucide-react';

export default function ExecutionMonitorView({ currency = "₹" }) {
  const [orders, setOrders] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterSide, setFilterSide] = useState("ALL");
  const [filterSymbol, setFilterSymbol] = useState("");

  // Modals & Drawers
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Submit Order Form State
  const [submitSymbol, setSubmitSymbol] = useState("SBIN.NS");
  const [submitSide, setSubmitSide] = useState("BUY");
  const [submitType, setSubmitType] = useState("LIMIT");
  const [submitQty, setSubmitQty] = useState(100);
  const [submitLimitPrice, setSubmitLimitPrice] = useState(815.0);
  const [submitStrategy, setSubmitStrategy] = useState("NSE Intraday ORB Breakout");
  const [submitError, setSubmitError] = useState(null);

  // Fetch orders and execution metrics
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [ordersRes, metricsRes] = await Promise.all([
        fetch('/api/orders?limit=100'),
        fetch('/api/execution/metrics')
      ]);

      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(oData.orders || []);
      }
      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        setMetrics(mData);
      }
      setErrorMsg(null);
    } catch (err) {
      console.error("Execution monitor fetch error:", err);
      setErrorMsg("Failed to connect to Execution Monitor API.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => {
      fetchData(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // If selectedOrder is open, keep its details updated on refresh
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.order_id === selectedOrder.order_id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders]);

  // Handle Cancel Order
  const handleCancelOrder = async (orderId) => {
    if (!window.confirm(`Are you sure you want to cancel order ${orderId}?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: "Cancelled by user from Execution Monitor" })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Failed to cancel order.");
      } else {
        fetchData(true);
      }
    } catch (err) {
      alert("Error cancelling order: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Simulate Fill Step (for pending / partially filled orders)
  const handleSimulateFillStep = async (order, customQty = null, customPrice = null) => {
    setActionLoading(true);
    try {
      const qtyToFill = customQty || Math.min(order.remaining_quantity, Math.ceil(order.requested_quantity / 2));
      const fillPrice = customPrice || order.limit_price || 800.0;

      const res = await fetch(`/api/orders/${order.order_id}/fill-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qtyToFill,
          price: fillPrice
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Fill step failed.");
      } else {
        fetchData(true);
      }
    } catch (err) {
      alert("Error executing fill step: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Submit Order
  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setActionLoading(true);
    try {
      const payload = {
        symbol: submitSymbol.trim().toUpperCase(),
        side: submitSide,
        order_type: submitType,
        quantity: parseInt(submitQty, 10),
        limit_price: submitType === "LIMIT" ? parseFloat(submitLimitPrice) : null,
        strategy_name: submitStrategy,
        idempotency_key: `PAPER-UI-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.detail || "Submission failed.");
      } else {
        setIsSubmitModalOpen(false);
        fetchData(true);
        if (data.order) setSelectedOrder(data.order);
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    let bg = "#252A2C";
    let color = "#92999C";
    let icon = <Clock size={12} />;

    switch (status) {
      case "FILLED":
        bg = "rgba(0, 208, 156, 0.12)";
        color = "#00D09C";
        icon = <CheckCircle2 size={12} />;
        break;
      case "PARTIALLY_FILLED":
        bg = "rgba(59, 130, 246, 0.14)";
        color = "#60A5FA";
        icon = <Percent size={12} />;
        break;
      case "PENDING":
        bg = "rgba(255, 176, 32, 0.12)";
        color = "#FFB020";
        icon = <Clock size={12} />;
        break;
      case "CANCELLED":
        bg = "rgba(146, 153, 156, 0.12)";
        color = "#92999C";
        icon = <X size={12} />;
        break;
      case "REJECTED":
        bg = "rgba(235, 91, 60, 0.12)";
        color = "#EB5B3C";
        icon = <XCircle size={12} />;
        break;
      case "EXPIRED":
        bg = "rgba(168, 85, 247, 0.12)";
        color = "#C084FC";
        icon = <AlertTriangle size={12} />;
        break;
      default:
        break;
    }

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '0.73rem',
        fontWeight: '700',
        backgroundColor: bg,
        color: color,
        letterSpacing: '0.02em',
        textTransform: 'uppercase'
      }}>
        {icon}
        {status?.replace('_', ' ')}
      </span>
    );
  };

  // Side Badge Helper
  const renderSideBadge = (side) => {
    const isBuy = side === "BUY" || side === "COVER";
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '0.72rem',
        fontWeight: '700',
        backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
        color: isBuy ? '#00D09C' : '#EB5B3C'
      }}>
        {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {side}
      </span>
    );
  };

  // Filtered Orders
  const filteredOrders = orders.filter(o => {
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterSide !== "ALL" && o.side !== filterSide) return false;
    if (filterSymbol.trim() && !o.symbol.toLowerCase().includes(filterSymbol.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* ── ROW 1: Header & Control Bar ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        paddingBottom: '4px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', margin: 0, letterSpacing: '-0.02em' }}>
              Execution Monitor
            </h2>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              color: '#00D09C',
              border: '1px solid rgba(0, 208, 156, 0.25)'
            }}>
              PAPER OMS ACTIVE
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#92999C', margin: '4px 0 0 0' }}>
            Real-time simulated order lifecycle, partial fills, state transitions, and FIFO reconciliation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: '#151819',
              border: '1px solid #252A2C',
              color: '#F1F3F4',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: refreshing ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} color="#92999C" />
            Refresh
          </button>

          <button
            onClick={() => setIsSubmitModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#00D09C',
              border: 'none',
              color: '#080A0B',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 208, 156, 0.25)'
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Place Paper Order
          </button>
        </div>
      </div>

      {/* ── ROW 2: Summary Metrics Cards Bar (Objective 6) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px'
      }}>
        {/* Total Orders */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
            Submitted
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#F1F3F4', marginTop: '4px' }} className="font-tabular">
            {metrics?.total_orders ?? orders.length}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Total requests</span>
        </div>

        {/* Filled Orders */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#00D09C', fontWeight: '600', textTransform: 'uppercase' }}>
            Filled
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#00D09C', marginTop: '4px' }} className="font-tabular">
            {metrics?.filled_orders ?? 0}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>100% Executed</span>
        </div>

        {/* Partially Filled */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#60A5FA', fontWeight: '600', textTransform: 'uppercase' }}>
            Partial Fills
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#60A5FA', marginTop: '4px' }} className="font-tabular">
            {metrics?.partially_filled_orders ?? 0}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Active in-flight</span>
        </div>

        {/* Pending Orders */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#FFB020', fontWeight: '600', textTransform: 'uppercase' }}>
            Pending
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#FFB020', marginTop: '4px' }} className="font-tabular">
            {metrics?.pending_orders ?? 0}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Resting in book</span>
        </div>

        {/* Cancelled Orders */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
            Cancelled
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#92999C', marginTop: '4px' }} className="font-tabular">
            {metrics?.cancelled_orders ?? 0}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Manual/auto stopped</span>
        </div>

        {/* Rejected Orders */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#EB5B3C', fontWeight: '600', textTransform: 'uppercase' }}>
            Rejected
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#EB5B3C', marginTop: '4px' }} className="font-tabular">
            {metrics?.rejected_orders ?? 0}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Risk/fund bounds</span>
        </div>

        {/* Total Executed Qty & Avg Price */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', textTransform: 'uppercase' }}>
            Executed Shares
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#F1F3F4', marginTop: '4px' }} className="font-tabular">
            {(metrics?.total_executed_qty ?? 0).toLocaleString()}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>
            Avg: {currency}{metrics?.average_execution_price?.toFixed(2) ?? "0.00"}
          </span>
        </div>

        {/* Modeled Charges & Slippage */}
        <div style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '12px',
          padding: '14px 16px'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#EB5B3C', fontWeight: '600', textTransform: 'uppercase' }}>
            Statutory Friction
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#EB5B3C', marginTop: '4px' }} className="font-tabular">
            -{currency}{(metrics?.total_charges ?? 0).toFixed(2)}
          </div>
          <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>
            Slippage: {currency}{(metrics?.total_slippage ?? 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── ROW 3: Filter & Search Controls ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        backgroundColor: '#101314',
        border: '1px solid #202426',
        borderRadius: '12px',
        padding: '10px 16px'
      }}>
        {/* Left: Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
          <Search size={14} color="#626A6E" />
          <input
            type="text"
            placeholder="Filter by symbol (e.g. SBIN, TCS)..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#F1F3F4',
              fontSize: '0.82rem',
              width: '100%'
            }}
          />
          {filterSymbol && (
            <button
              onClick={() => setFilterSymbol("")}
              style={{ background: 'none', border: 'none', color: '#626A6E', cursor: 'pointer', padding: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Right: Status & Side dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#626A6E', fontWeight: '600' }}>Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                color: '#F1F3F4',
                fontSize: '0.78rem',
                borderRadius: '6px',
                padding: '4px 8px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_FILLED">Partially Filled</option>
              <option value="FILLED">Filled</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#626A6E', fontWeight: '600' }}>Side:</span>
            <select
              value={filterSide}
              onChange={(e) => setFilterSide(e.target.value)}
              style={{
                backgroundColor: '#151819',
                border: '1px solid #252A2C',
                color: '#F1F3F4',
                fontSize: '0.78rem',
                borderRadius: '6px',
                padding: '4px 8px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="SHORT">SHORT</option>
              <option value="COVER">COVER</option>
            </select>
          </div>

          <span style={{ fontSize: '0.75rem', color: '#626A6E', marginLeft: '4px' }}>
            Showing <b>{filteredOrders.length}</b> of <b>{orders.length}</b>
          </span>
        </div>
      </div>

      {/* ── ROW 4: Orders Table ── */}
      <div style={{
        backgroundColor: '#151819',
        border: '1px solid #252A2C',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#92999C' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '0.88rem' }}>Loading paper orders from OMS...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#92999C' }}>
            <FileText size={32} color="#363C40" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '0.92rem', fontWeight: '600', color: '#F1F3F4', margin: '0 0 4px 0' }}>
              No orders found
            </p>
            <p style={{ fontSize: '0.8rem', color: '#626A6E', margin: '0 0 16px 0' }}>
              {orders.length === 0
                ? "No paper orders have been submitted yet. Place a new paper order to get started!"
                : "No orders match your filter criteria."}
            </p>
            {orders.length === 0 && (
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#00D09C',
                  border: 'none',
                  color: '#080A0B',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Place First Order
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#101314', borderBottom: '1px solid #202426', color: '#626A6E', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Time</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Order ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Symbol</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Side</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Req / Filled</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Avg Fill Price</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600' }}>Strategy</th>
                  <th style={{ padding: '12px 16px', fontWeight: '600', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const createdTime = order.created_at ? order.created_at.substring(11, 19) : "";
                  const canCancel = order.status === "PENDING" || order.status === "PARTIALLY_FILLED";
                  const canSimulate = order.status === "PENDING" || order.status === "PARTIALLY_FILLED";

                  return (
                    <tr
                      key={order.order_id}
                      onClick={() => setSelectedOrder(order)}
                      style={{
                        borderBottom: '1px solid #1E2325',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Time */}
                      <td style={{ padding: '12px 16px', color: '#92999C', whiteSpace: 'nowrap' }} className="font-tabular">
                        {createdTime}
                      </td>

                      {/* Order ID */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#60A5FA' }}>
                        {order.order_id}
                      </td>

                      {/* Symbol */}
                      <td style={{ padding: '12px 16px', fontWeight: '700', color: '#F1F3F4' }}>
                        {order.symbol}
                      </td>

                      {/* Side */}
                      <td style={{ padding: '12px 16px' }}>
                        {renderSideBadge(order.side)}
                      </td>

                      {/* Type */}
                      <td style={{ padding: '12px 16px', color: '#92999C', fontWeight: '600' }}>
                        {order.order_type}
                        {order.order_type === "LIMIT" && (
                          <div style={{ fontSize: '0.7rem', color: '#626A6E' }}>
                            @{currency}{order.limit_price?.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Req / Filled */}
                      <td style={{ padding: '12px 16px' }} className="font-tabular">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#F1F3F4' }}>
                            {order.filled_quantity}
                          </span>
                          <span style={{ color: '#626A6E' }}>/ {order.requested_quantity}</span>
                        </div>
                        {order.requested_quantity > 0 && (
                          <div style={{
                            width: '60px',
                            height: '3px',
                            backgroundColor: '#252A2C',
                            borderRadius: '2px',
                            marginTop: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${(order.filled_quantity / order.requested_quantity) * 100}%`,
                              height: '100%',
                              backgroundColor: order.status === "FILLED" ? '#00D09C' : '#60A5FA'
                            }} />
                          </div>
                        )}
                      </td>

                      {/* Avg Fill Price */}
                      <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '700' }} className="font-tabular">
                        {order.filled_quantity > 0 ? `${currency}${order.average_price.toFixed(2)}` : "—"}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        {renderStatusBadge(order.status)}
                      </td>

                      {/* Strategy */}
                      <td style={{ padding: '12px 16px', color: '#92999C', fontSize: '0.75rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.strategy_name || "Manual Execution"}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {canSimulate && (
                            <button
                              onClick={() => handleSimulateFillStep(order)}
                              title="Simulate partial fill step"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                color: '#60A5FA',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              Fill Step
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => handleCancelOrder(order.order_id)}
                              title="Cancel remaining order quantity"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(235, 91, 60, 0.12)',
                                border: '1px solid rgba(235, 91, 60, 0.25)',
                                color: '#EB5B3C',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            title="View order details and fill timeline"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#202426',
                              border: 'none',
                              color: '#92999C',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL 1: Order Details Drawer / Modal (Objective 6) ── */}
      {selectedOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #202426',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#F1F3F4' }}>
                  {selectedOrder.symbol}
                </span>
                {renderSideBadge(selectedOrder.side)}
                {renderStatusBadge(selectedOrder.status)}
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#92999C',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Order ID & Source Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#101314',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #202426',
                fontSize: '0.75rem'
              }}>
                <span style={{ color: '#92999C' }}>
                  Order ID: <b style={{ fontFamily: 'monospace', color: '#60A5FA' }}>{selectedOrder.order_id}</b>
                </span>
                <span style={{ color: '#00D09C', fontWeight: '700' }}>
                  SOURCE: {selectedOrder.execution_source}
                </span>
              </div>

              {/* Rejection / Cancellation Alert Box (if applicable) */}
              {(selectedOrder.rejection_reason || selectedOrder.status === "CANCELLED") && (
                <div style={{
                  backgroundColor: selectedOrder.status === "REJECTED" ? 'rgba(235, 91, 60, 0.1)' : 'rgba(146, 153, 156, 0.1)',
                  border: `1px solid ${selectedOrder.status === "REJECTED" ? 'rgba(235, 91, 60, 0.3)' : 'rgba(146, 153, 156, 0.3)'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  {selectedOrder.status === "REJECTED" ? <AlertTriangle size={18} color="#EB5B3C" /> : <X size={18} color="#92999C" />}
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: selectedOrder.status === "REJECTED" ? '#EB5B3C' : '#92999C' }}>
                      {selectedOrder.status === "REJECTED" ? "Order Rejection Details:" : "Cancellation Details:"}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#F1F3F4', marginTop: '2px' }}>
                      {selectedOrder.rejection_reason || "Order cancelled by client before full execution."}
                    </div>
                  </div>
                </div>
              )}

              {/* Parameters Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px'
              }}>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Type</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                    {selectedOrder.order_type}
                  </div>
                </div>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Requested Qty</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                    {selectedOrder.requested_quantity}
                  </div>
                </div>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Filled Qty</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }} className="font-tabular">
                    {selectedOrder.filled_quantity}
                  </div>
                </div>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Remaining Qty</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: selectedOrder.remaining_quantity > 0 ? '#FFB020' : '#626A6E', marginTop: '2px' }} className="font-tabular">
                    {selectedOrder.remaining_quantity}
                  </div>
                </div>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Limit Price</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }} className="font-tabular">
                    {selectedOrder.limit_price ? `${currency}${selectedOrder.limit_price.toFixed(2)}` : "MARKET"}
                  </div>
                </div>
                <div style={{ backgroundColor: '#101314', padding: '10px 12px', borderRadius: '8px', border: '1px solid #202426' }}>
                  <span style={{ fontSize: '0.68rem', color: '#626A6E', textTransform: 'uppercase' }}>Weighted Avg Price</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#00D09C', marginTop: '2px' }} className="font-tabular">
                    {selectedOrder.filled_quantity > 0 ? `${currency}${selectedOrder.average_price.toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>

              {/* Individual Execution Fills Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
                    Execution Fills ({selectedOrder.fills?.length || 0})
                  </h4>
                  {(selectedOrder.status === "PENDING" || selectedOrder.status === "PARTIALLY_FILLED") && (
                    <button
                      onClick={() => handleSimulateFillStep(selectedOrder)}
                      disabled={actionLoading}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 208, 156, 0.12)',
                        border: '1px solid rgba(0, 208, 156, 0.25)',
                        color: '#00D09C',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      + Simulate Partial Fill
                    </button>
                  )}
                </div>

                {(!selectedOrder.fills || selectedOrder.fills.length === 0) ? (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: '#101314',
                    borderRadius: '8px',
                    border: '1px solid #202426',
                    color: '#626A6E',
                    fontSize: '0.78rem'
                  }}>
                    No fills executed yet. Order is resting in order book.
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#101314',
                    borderRadius: '8px',
                    border: '1px solid #202426',
                    overflow: 'hidden'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #202426', color: '#626A6E' }}>
                          <th style={{ padding: '8px 12px' }}>Fill ID</th>
                          <th style={{ padding: '8px 12px' }}>Time</th>
                          <th style={{ padding: '8px 12px' }}>Shares</th>
                          <th style={{ padding: '8px 12px' }}>Fill Price</th>
                          <th style={{ padding: '8px 12px' }}>Slippage</th>
                          <th style={{ padding: '8px 12px' }}>Charges</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.fills.map(fill => (
                          <tr key={fill.fill_id} style={{ borderBottom: '1px solid #1E2325' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#60A5FA' }}>
                              {fill.fill_id}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#92999C' }}>
                              {fill.timestamp ? fill.timestamp.substring(11, 19) : ""}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: '700', color: '#F1F3F4' }} className="font-tabular">
                              {fill.quantity}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: '700', color: '#00D09C' }} className="font-tabular">
                              {currency}{fill.price?.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#92999C' }} className="font-tabular">
                              {currency}{fill.slippage?.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#EB5B3C' }} className="font-tabular">
                              -{currency}{fill.charges?.total_charges?.toFixed(2) || "0.00"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* State Transition History Section */}
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4', margin: '0 0 8px 0' }}>
                  State Transition History
                </h4>
                <div style={{
                  backgroundColor: '#101314',
                  borderRadius: '8px',
                  border: '1px solid #202426',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  {selectedOrder.history?.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.74rem' }}>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#00D09C',
                        marginTop: '5px'
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#F1F3F4' }}>
                            {step.from_status ? `${step.from_status} → ${step.to_status}` : step.to_status}
                          </span>
                          <span style={{ color: '#626A6E', fontSize: '0.68rem' }} className="font-tabular">
                            {step.timestamp ? step.timestamp.substring(11, 19) : ""}
                          </span>
                        </div>
                        {step.reason && (
                          <div style={{ color: '#92999C', marginTop: '2px', fontSize: '0.7rem' }}>
                            {step.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #202426',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#101314'
            }}>
              <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>
                Strategy: {selectedOrder.strategy_name || "Manual"}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                {(selectedOrder.status === "PENDING" || selectedOrder.status === "PARTIALLY_FILLED") && (
                  <button
                    onClick={() => handleCancelOrder(selectedOrder.order_id)}
                    disabled={actionLoading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(235, 91, 60, 0.12)',
                      border: '1px solid rgba(235, 91, 60, 0.25)',
                      color: '#EB5B3C',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel Order
                  </button>
                )}
                <button
                  onClick={() => setSelectedOrder(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#252A2C',
                    border: 'none',
                    color: '#F1F3F4',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Place New Paper Order Modal ── */}
      {isSubmitModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#151819',
            border: '1px solid #252A2C',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
          }}>
            <form onSubmit={handleSubmitOrder}>
              {/* Header */}
              <div style={{
                padding: '18px 24px',
                borderBottom: '1px solid #202426',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                    Submit Paper Order
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#92999C' }}>
                    Simulate real-time OMS lifecycle and statutory friction
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#92999C', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {submitError && (
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(235, 91, 60, 0.1)',
                    border: '1px solid rgba(235, 91, 60, 0.3)',
                    color: '#EB5B3C',
                    fontSize: '0.78rem'
                  }}>
                    {submitError}
                  </div>
                )}

                {/* Symbol & Side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      SYMBOL (NSE)
                    </label>
                    <input
                      type="text"
                      value={submitSymbol}
                      onChange={(e) => setSubmitSymbol(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#F1F3F4',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      SIDE
                    </label>
                    <select
                      value={submitSide}
                      onChange={(e) => setSubmitSide(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#F1F3F4',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                      <option value="SHORT">SHORT</option>
                      <option value="COVER">COVER</option>
                    </select>
                  </div>
                </div>

                {/* Type & Quantity */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      ORDER TYPE
                    </label>
                    <select
                      value={submitType}
                      onChange={(e) => setSubmitType(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#F1F3F4',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    >
                      <option value="LIMIT">LIMIT</option>
                      <option value="MARKET">MARKET</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      QUANTITY
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={submitQty}
                      onChange={(e) => setSubmitQty(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#F1F3F4',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                </div>

                {/* Limit Price (if LIMIT order) */}
                {submitType === "LIMIT" && (
                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#92999C', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      LIMIT PRICE ({currency})
                    </label>
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={submitLimitPrice}
                      onChange={(e) => setSubmitLimitPrice(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#101314',
                        border: '1px solid #252A2C',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#F1F3F4',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid #202426',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                backgroundColor: '#101314'
              }}>
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#202426',
                    border: 'none',
                    color: '#92999C',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#00D09C',
                    border: 'none',
                    color: '#080A0B',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {actionLoading ? "Submitting..." : "Submit Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

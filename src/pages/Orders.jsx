import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import PayPal from '../components/PayPal';
import './Orders.css';

const FYGARO_PAGE_URL = 'https://www.fygaro.com/en/pb/f8b6be5a-aae5-40e9-bb58-71fb84d5bc9c/';
const FYGARO_JWT_URL  = 'https://createfygarojwt-zpqyzkrqza-uc.a.run.app';

const STATUS_PRIORITY = { 'Payment Pending': 0, 'Complete': 1, 'Cancelled': 2 };

// Normalise field name: new orders use lowercase 'status', old site used 'Status'
function getStatus(order) {
  return order.status || order.Status || '';
}

function statusBadge(status) {
  if (status === 'Payment Pending')            return 'pending';
  if (status === 'Complete' || status === 'Completed') return 'new';
  if (status === 'Cancelled')                  return 'cancelled';
  return 'stock';
}

export default function Orders() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  // Per-order UI state: paypalOrderNo = orderNumber string when inline PayPal is open
  const [processing,   setProcessing]   = useState(false);
  const [paypalOrderNo, setPaypalOrderNo] = useState('');

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    async function loadOrders() {
      const snap = await getDocs(collection(db, 'Users', user.uid, 'Orders'));
      const list = await Promise.all(snap.docs.map(async d => {
        const itemsSnap = await getDocs(collection(db, 'Users', user.uid, 'Orders', d.id, 'Items'));
        return {
          id: d.id,
          ...d.data(),
          items: itemsSnap.docs.map(i => ({ id: i.id, ...i.data() })),
        };
      }));

      // Sort: Payment Pending first, then by createdAt desc
      list.sort((a, b) => {
        const pa = STATUS_PRIORITY[getStatus(a)] ?? 1;
        const pb = STATUS_PRIORITY[getStatus(b)] ?? 1;
        if (pa !== pb) return pa - pb;
        const ta = a.createdAt?.toMillis?.() ?? a.Timestamp?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? b.Timestamp?.toMillis?.() ?? 0;
        return tb - ta;
      });

      setOrders(list);
      setLoading(false);
    }
    loadOrders();
  }, [user]);

  // ── Fygaro pay ────────────────────────────────────────────────────────────
  const handleFygaro = async (orderNumber, amount) => {
    setProcessing(true);
    try {
      const res = await fetch(FYGARO_JWT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount, orderNumber }),
      });
      const { token } = await res.json();
      localStorage.setItem('pendingOrder', JSON.stringify({ orderNumber, amount }));
      window.location.href = `${FYGARO_PAGE_URL}?jwt=${token}`;
    } catch (err) {
      console.error('Fygaro error', err);
      alert('Payment setup failed. Please try again.');
      setProcessing(false);
    }
  };

  // ── PayPal pay ────────────────────────────────────────────────────────────
  const handlePayPal = (orderNumber, amount) => {
    localStorage.setItem('pendingOrder', JSON.stringify({ orderNumber, amount }));
    setPaypalOrderNo(orderNumber);
  };

  const handlePayPalApproved = (orderNumber) => {
    navigate(`/order-confirmation?orderNumber=${orderNumber}&method=PayPal`);
  };

  // ── Cancel order ──────────────────────────────────────────────────────────
  const handleCancel = async (orderNumber) => {
    if (!window.confirm('Cancel this order?')) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'Users', user.uid, 'Orders', orderNumber), { status: 'Cancelled' });
      // Best-effort delete from PendingOrders (may fail under old rules — that's OK)
      try { await deleteDoc(doc(db, 'PendingOrders', orderNumber)); } catch (_) {}
      // Clear localStorage and notify Header / CartDrawer via custom event
      localStorage.removeItem('pendingOrder');
      window.dispatchEvent(new CustomEvent('pendingOrderChange', { detail: null }));
      setOrders(prev => prev.map(o =>
        o.id === orderNumber ? { ...o, status: 'Cancelled' } : o
      ));
    } catch (err) {
      console.error('Cancel error', err);
      alert('Failed to cancel order. Please try again.');
    }
    setProcessing(false);
  };

  if (!user || user.isAnonymous) {
    return (
      <div className="orders-page container page-content">
        <div className="orders-signin">
          <p>Please <Link to="/signin">sign in</Link> to view your orders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-page container page-content">
      <h1 className="orders-title">My Orders</h1>

      {loading ? (
        <div className="spinner" />
      ) : orders.length === 0 ? (
        <div className="orders-empty">
          <p>No orders yet.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>Shop Now</Link>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => {
            const status     = getStatus(order);
            const isPending  = status === 'Payment Pending';
            const dateTs     = order.createdAt?.toDate?.() ?? order.Timestamp?.toDate?.();
            const dateStr    = dateTs ? dateTs.toLocaleDateString() : '';
            const showPayPal = paypalOrderNo === order.id;

            return (
              <div key={order.id} className={`order-card${isPending ? ' order-card--pending' : ''}`}>
                <div className="order-header">
                  <div>
                    <p className="order-id">Order #{order.id.slice(-8).toUpperCase()}</p>
                    {dateStr && <p className="order-date">{dateStr}</p>}
                  </div>
                  <div className="order-meta">
                    <span className={`badge badge-${statusBadge(status)}`}>
                      {status || '—'}
                    </span>
                    <span className="order-total">TT${Number(order.amount || order.Total || 0).toFixed(2)}</span>
                  </div>
                </div>

                {(order.DeliveryName || order.DeliveryAddress1) && (
                  <div className="order-delivery">
                    <p className="order-delivery-name">{order.DeliveryName}</p>
                    <p className="order-delivery-addr">
                      {[order.DeliveryAddress1, order.DeliveryAddress2, order.DeliveryCity]
                        .filter(Boolean).join(', ')}
                    </p>
                    {order.DeliveryTelNumber && (
                      <p className="order-delivery-tel">{order.DeliveryTelNumber}</p>
                    )}
                  </div>
                )}

                <div className="order-items">
                  {order.items.map(item => (
                    <div key={item.id} className="order-item">
                      {item.JerseyImgFront && (
                        <img src={item.JerseyImgFront} alt={item.Team} className="order-thumb" />
                      )}
                      <div>
                        <p className="order-item-name">{item.Team}</p>
                        <p className="order-item-details">
                          {[item.Cut, item.Sleeve, item.Variant, item.Size && `Size ${item.Size}`, item.Quantity && `Qty ${item.Quantity}`].filter(Boolean).join(' · ')}
                        </p>
                        {item.PlayerName && (
                          <p className="order-item-print">{item.PlayerName} #{item.PlayerNumber}</p>
                        )}
                      </div>
                      <span className="order-item-price">
                        TT${((item.Price || 0) * (item.Quantity || 1)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {isPending && (
                  <div className="order-pay-section">
                    {showPayPal ? (
                      <div className="paypal-wrap">
                        <p className="paypal-note">
                          Remember to set currency to <strong>USD</strong> to avoid extra fees.
                        </p>
                        <PayPal
                          totalTTD={order.amount}
                          orderNumber={order.id}
                          onApproved={() => handlePayPalApproved(order.id)}
                        />
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: 8 }}
                          onClick={() => setPaypalOrderNo('')}
                        >
                          Back
                        </button>
                      </div>
                    ) : (
                      <div className="order-pay-buttons">
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={processing}
                          onClick={() => handleFygaro(order.id, order.amount)}
                        >
                          Pay with Card (Linx)
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={processing}
                          onClick={() => handlePayPal(order.id, order.amount)}
                        >
                          Pay with PayPal
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={processing}
                          onClick={() => handleCancel(order.id)}
                        >
                          Cancel Order
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

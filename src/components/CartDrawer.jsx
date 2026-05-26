import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import './CartDrawer.css';

export default function CartDrawer() {
  const { items, subtotal, discount, total, count, open, setOpen, removeItem, updateQty, clearCart } = useCart();
  const navigate = useNavigate();

  const [pendingOrder, setPendingOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pendingOrder') || 'null'); }
    catch { return null; }
  });
  useEffect(() => {
    const handler = (e) => setPendingOrder(e.detail);
    window.addEventListener('pendingOrderChange', handler);
    return () => window.removeEventListener('pendingOrderChange', handler);
  }, []);

  const handleCheckout = () => {
    setOpen(false);
    navigate('/checkout');
  };

  return (
    <>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`cart-drawer${open ? ' open' : ''}`}>
        <div className="drawer-header">
          <h2>Cart {count > 0 && <span className="drawer-count">{count}</span>}</h2>
          <div className="drawer-header-actions">
            {items.length > 0 && (
              <button className="drawer-clear" onClick={clearCart}>Clear cart</button>
            )}
            <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close cart">✕</button>
          </div>
        </div>

        <div className="drawer-items">
          {items.length === 0 ? (
            <p className="drawer-empty">Your cart is empty.</p>
          ) : (
            items.map(item => (
              <div key={item.id} className="drawer-item">
                {item.JerseyImgFront && (
                  <img src={item.JerseyImgFront} alt={item.Team} className="drawer-thumb" />
                )}
                <div className="drawer-item-info">
                  <p className="drawer-item-name">{item.Team}</p>
                  <p className="drawer-item-details">
                    {item.Cut} · {item.Sleeve} · {item.Variant} · Size {item.Size}
                  </p>
                  {item.PlayerName && (
                    <p className="drawer-item-print">
                      {item.PlayerName} #{item.PlayerNumber}
                      <span className="print-fee-note"> · +$100 print</span>
                    </p>
                  )}
                  <div className="drawer-item-row">
                    <div className="qty-ctrl">
                      <button onClick={() => updateQty(item.id, item.Quantity - 1)}>−</button>
                      <span>{item.Quantity}</span>
                      <button onClick={() => updateQty(item.id, item.Quantity + 1)}>+</button>
                    </div>
                    <span className="drawer-item-price">${((item.Price || 0) * item.Quantity).toFixed(2)}</span>
                    <button className="drawer-remove" onClick={() => removeItem(item.id)} aria-label="Remove">✕</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {pendingOrder && (
          <button
            className="drawer-pending"
            onClick={() => { setOpen(false); navigate('/checkout'); }}
          >
            <span className="drawer-pending__label">⚠ Unpaid order</span>
            <span className="drawer-pending__cta">
              TT${Number(pendingOrder.amount).toFixed(2)} — Complete payment →
            </span>
          </button>
        )}

        {items.length > 0 && (
          <div className="drawer-footer">
            {discount > 0 ? (
              <>
                <div className="drawer-total drawer-subtotal">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="drawer-total drawer-discount">
                  <span>Discount</span>
                  <span>−${discount.toFixed(2)}</span>
                </div>
                <div className="drawer-total drawer-total--bold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="drawer-total">
                <span>Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
            )}
            <button className="btn btn-green btn-full" onClick={handleCheckout}>
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

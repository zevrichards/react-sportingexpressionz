import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, setDoc, collection, getDocs,
  writeBatch, serverTimestamp, query, where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import PayPal from '../components/PayPal';
import './Checkout.css';

const TTD_TO_USD = 6.78;

const DELIVERY_FEE = 50;
// Fygaro payment page — configured in the Fygaro dashboard
const FYGARO_PAGE_URL  = 'https://www.fygaro.com/en/pb/f8b6be5a-aae5-40e9-bb58-71fb84d5bc9c/';
const FYGARO_JWT_URL   = 'https://createfygarojwt-zpqyzkrqza-uc.a.run.app';
const MANUAL_ORDER_URL = 'https://manualordercomplete-zpqyzkrqza-uc.a.run.app';

export default function Checkout() {
  const { items, subtotal, discount: saleDiscount, total, removeItem, updateQty, clearCart } = useCart();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  // ── Contact form ─────────────────────────────────────────────────────────
  const [contact, setContact] = useState({
    name: '', address1: '', address2: '', city: '', tel: '', telConfirm: '', email: '',
  });
  const [telError,     setTelError]     = useState('');
  const [savingInfo,   setSavingInfo]   = useState(false);
  const [infoSaved,    setInfoSaved]    = useState(false);
  const [contactReady, setContactReady] = useState(false);

  // Anonymous / legacy accounts have no auth email — collect one at checkout
  // so the order receipt has somewhere to go.
  const needsEmail = !user?.email;

  // ── Promo code ───────────────────────────────────────────────────────────
  const [promoInput,   setPromoInput]   = useState('');
  const [promoApplied, setPromoApplied] = useState(null); // { code, description, discount }
  const [promoError,   setPromoError]   = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // ── Payment state ────────────────────────────────────────────────────────
  const [processing,    setProcessing]    = useState(false);
  const [showPayPal,    setShowPayPal]    = useState(false);
  const [pendingOrderNo, setPendingOrderNo] = useState('');

  // ── Resume unpaid order ───────────────────────────────────────────────────
  // { orderNumber, amount } — set when a pending order is found in localStorage
  const [resumeOrder,   setResumeOrder]   = useState(null);
  const [resumeChecked, setResumeChecked] = useState(false);

  // ── Derived totals ───────────────────────────────────────────────────────
  const hasOutOfStock = items.some(i => i.isOutOfStock);
  const hasCustom     = items.some(i => i.PlayerName);
  const outOfStockFee = hasOutOfStock ? 70 : 0;
  const promoDiscount = promoApplied ? promoApplied.discount : 0;
  const grandTotal    = total + DELIVERY_FEE + outOfStockFee - promoDiscount;

  // COD disabled when cart has custom-printed or out-of-stock items
  const codDisabled = hasCustom || hasOutOfStock;

  // ── Auto-load saved contact info ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'Users', user.uid)).then(snap => {
      if (snap.exists()) {
        const c = snap.data().Contact;
        if (c) {
          setContact({
            name:       c.name     || '',
            address1:   c.address1 || '',
            address2:   c.address2 || '',
            city:       c.city     || '',
            tel:        c.tel      || '',
            telConfirm: c.tel      || '',
            email:      c.email    || '',
          });
        }
      }
      setContactReady(true);
    });
  }, [user]);

  // ── Check for an abandoned pending order ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem('pendingOrder');
    if (!stored) { setResumeChecked(true); return; }
    try {
      const { orderNumber, amount } = JSON.parse(stored);
      // Check the user's own Orders sub-collection — accessible under all rule
      // configs and immune to UID changes caused by linkWithPopup vs signInWithPopup.
      getDoc(doc(db, 'Users', user.uid, 'Orders', orderNumber))
        .then(snap => {
          if (snap.exists() && snap.data().status === 'Payment Pending') {
            setResumeOrder({ orderNumber, amount });
          } else {
            localStorage.removeItem('pendingOrder');
          }
          setResumeChecked(true);
        })
        .catch(() => {
          // Can't verify — show the resume UI optimistically. The worst case
          // is a stale entry; the payment attempt will fail gracefully.
          setResumeOrder({ orderNumber, amount });
          setResumeChecked(true);
        });
    } catch {
      localStorage.removeItem('pendingOrder');
      setResumeChecked(true);
    }
  }, [user]);

  const setField = (key, value) => {
    setContact(prev => ({ ...prev, [key]: value }));
    if (key === 'tel' || key === 'telConfirm') setTelError('');
    setInfoSaved(false);
  };

  // ── Validate contact ─────────────────────────────────────────────────────
  function validateContact() {
    if (!contact.name || !contact.address1 || !contact.city || !contact.tel) {
      setTelError('Please fill in all required fields.');
      return false;
    }
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      setTelError('Please enter a valid email address — it\'s where your order receipt will be sent.');
      return false;
    }
    if (
      contact.tel.length !== 7 ||
      contact.tel.startsWith('868') ||
      contact.tel.startsWith('1868')
    ) {
      setTelError('Please enter a valid 7-digit local number (without the 868 area code).');
      return false;
    }
    if (contact.tel !== contact.telConfirm) {
      setTelError('Telephone numbers do not match.');
      return false;
    }
    return true;
  }

  // ── Save contact info ─────────────────────────────────────────────────────
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!validateContact()) return;
    setTelError('');
    setSavingInfo(true);
    try {
      await setDoc(doc(db, 'Users', user.uid), {
        Contact: {
          name:     contact.name,
          address1: contact.address1,
          address2: contact.address2,
          city:     contact.city,
          tel:      contact.tel,
          email:    user.email || contact.email,
        },
      }, { merge: true });
      setInfoSaved(true);
    } catch (err) {
      console.error('Failed to save contact info:', err);
    }
    setSavingInfo(false);
  };

  // ── Apply promo code ──────────────────────────────────────────────────────
  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError('');
    setPromoLoading(true);

    try {
      const snap = await getDocs(
        query(collection(db, 'PromoCodes'), where('Code', '==', code))
      );
      if (snap.empty) {
        setPromoError('No matching promo code found.');
        setPromoLoading(false);
        return;
      }
      const promoDoc  = snap.docs[0];
      const promoData = promoDoc.data();

      // Validate
      if ((promoData.Quantity ?? 0) <= 0) {
        setPromoError('This promo code has expired.');
        setPromoLoading(false);
        return;
      }
      if (promoData.Price >= total) {
        setPromoError('This code cannot be applied to your current order.');
        setPromoLoading(false);
        return;
      }
      if (promoData.Description === 'Free Shipping' && outOfStockFee === 0) {
        setPromoError('This code requires an out-of-stock item in your cart.');
        setPromoLoading(false);
        return;
      }

      setPromoApplied({ code, description: promoData.Description, discount: promoData.Price });
      setPromoInput('');
    } catch (err) {
      setPromoError('Failed to apply promo code. Please try again.');
    }
    setPromoLoading(false);
  };

  // ── Create pending order + clear cart ────────────────────────────────────
  // Writes the order to two locations:
  //   PendingOrders/{orderNumber}        — top-level, so server-side webhook
  //                                        handlers can look it up by order number
  //                                        without knowing the user UID.
  //   Users/{uid}/Orders/{orderNumber}   — user-scoped, for order history and
  //                                        the resume-unpaid-order check.
  // Cart items are copied to the order subcollection here but the cart itself
  // is NOT cleared — the fulfillOrder Cloud Function clears it after payment
  // is confirmed, preventing cart loss if the payment tab is closed early.
  async function createPendingOrder() {
    const orderNumber = Date.now().toString();
    const shippingMsg = hasOutOfStock
      ? 'Your order contains items that are not in stock and will have to be ordered. ' +
        'SportingExpressionz cannot guarantee shipping times due to congested global shipping lanes and customs delays. ' +
        'Please allow up to 3–5 weeks for delivery.'
      : '';

    const orderData = {
      status:       'Payment Pending',
      createdAt:    serverTimestamp(),
      orderNumber,
      amount:       Number(grandTotal),
      userId:       user.uid,
      email:        user.email || contact.email || '',
      PromoCode:    promoApplied?.code || null,
      ShippingMsg:  shippingMsg,
      DeliveryName:     contact.name,
      DeliveryAddress1: contact.address1,
      DeliveryAddress2: contact.address2 || '-',
      DeliveryCity:     contact.city,
      DeliveryTelNumber: contact.tel,
    };

    // PendingOrders (top-level, for webhook lookup)
    await setDoc(doc(db, 'PendingOrders', orderNumber), {
      ...orderData,
      userId: user.uid,
    });

    // Users/{uid}/Orders/{orderNumber}
    const orderRef = doc(db, 'Users', user.uid, 'Orders', orderNumber);
    await setDoc(orderRef, orderData);

    // Copy cart items to the order subcollection.
    // Cart is NOT cleared here — the server-side webhook (fulfillOrder) handles
    // that after payment is confirmed, so the cart stays intact until then.
    const cartSnap = await getDocs(collection(db, 'Users', user.uid, 'Cart'));
    const batch    = writeBatch(db);
    for (const cartDoc of cartSnap.docs) {
      batch.set(
        doc(db, 'Users', user.uid, 'Orders', orderNumber, 'Items', cartDoc.id),
        cartDoc.data()
      );
    }
    await batch.commit();

    return orderNumber;
  }

  // ── Fygaro ────────────────────────────────────────────────────────────────
  const handleFygaro = async () => {
    if (!validateContact()) return;
    setProcessing(true);
    try {
      // Save latest contact info
      await setDoc(doc(db, 'Users', user.uid), { Contact: { name: contact.name, address1: contact.address1, address2: contact.address2, city: contact.city, tel: contact.tel, email: user.email || contact.email } }, { merge: true });

      const orderNumber = await createPendingOrder();

      const res   = await fetch(FYGARO_JWT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: grandTotal, orderNumber }),
      });
      const { token } = await res.json();
      // Save before redirect so user can resume if they close the payment page
      localStorage.setItem('pendingOrder', JSON.stringify({ orderNumber, amount: grandTotal }));
      window.location.href = `${FYGARO_PAGE_URL}?jwt=${token}`;
    } catch (err) {
      console.error('Fygaro error', err);
      alert('Payment setup failed. Please try again.');
      setProcessing(false);
    }
  };

  // ── PayPal ────────────────────────────────────────────────────────────────
  const handlePayPal = async () => {
    if (!validateContact()) return;
    setProcessing(true);
    try {
      await setDoc(doc(db, 'Users', user.uid), { Contact: { name: contact.name, address1: contact.address1, address2: contact.address2, city: contact.city, tel: contact.tel, email: user.email || contact.email } }, { merge: true });
      const orderNumber = await createPendingOrder();
      // Save so user can resume if they close the tab before approving PayPal
      localStorage.setItem('pendingOrder', JSON.stringify({ orderNumber, amount: grandTotal }));
      setPendingOrderNo(orderNumber);
      setShowPayPal(true);
    } catch (err) {
      console.error('PayPal setup error', err);
      alert('Payment setup failed. Please try again.');
    }
    setProcessing(false);
  };

  const handlePayPalApproved = () => {
    navigate(`/order-confirmation?orderNumber=${pendingOrderNo}&method=PayPal`);
  };

  // ── COD ───────────────────────────────────────────────────────────────────
  const handleCOD = async () => {
    if (!validateContact()) return;
    setProcessing(true);
    try {
      await setDoc(doc(db, 'Users', user.uid), { Contact: { name: contact.name, address1: contact.address1, address2: contact.address2, city: contact.city, tel: contact.tel, email: user.email || contact.email } }, { merge: true });
      const orderNumber = await createPendingOrder();

      const idToken = await user.getIdToken();
      await fetch(MANUAL_ORDER_URL, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderNumber, amount: grandTotal, COD: true }),
      });

      navigate(`/order-confirmation?orderNumber=${orderNumber}&method=COD`);
    } catch (err) {
      console.error('COD error', err);
      alert('Order submission failed. Please try again.');
      setProcessing(false);
    }
  };

  // ── Resume handlers ───────────────────────────────────────────────────────
  const handleResumeFygaro = async () => {
    setProcessing(true);
    try {
      const res = await fetch(FYGARO_JWT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: resumeOrder.amount, orderNumber: resumeOrder.orderNumber }),
      });
      const { token } = await res.json();
      window.location.href = `${FYGARO_PAGE_URL}?jwt=${token}`;
    } catch (err) {
      console.error('Fygaro resume error', err);
      alert('Payment setup failed. Please try again.');
      setProcessing(false);
    }
  };

  const handleResumePayPal = () => {
    setPendingOrderNo(resumeOrder.orderNumber);
    setShowPayPal(true);
    setProcessing(true);
  };

  const handleDiscardResume = () => {
    localStorage.removeItem('pendingOrder');
    setResumeOrder(null);
    navigate('/');
  };

  // ── Empty cart guard ──────────────────────────────────────────────────────
  if (items.length === 0 && !processing) {
    // Still checking localStorage / Firestore
    if (!resumeChecked) {
      return (
        <div className="checkout-page container page-content">
          <div className="spinner" style={{ margin: '80px auto' }} />
        </div>
      );
    }

    // Unpaid pending order found — offer to resume or discard
    if (resumeOrder) {
      return (
        <div className="checkout-page container page-content">
          <h1 className="checkout-title">Complete Your Order</h1>
          <div className="resume-card">
            <p className="resume-heading">You have an unpaid order</p>
            <p className="resume-order-no">
              Order #{resumeOrder.orderNumber.slice(-8).toUpperCase()}
            </p>
            <p className="resume-amount">TT${Number(resumeOrder.amount).toFixed(2)}</p>

            {showPayPal ? (
              <div className="paypal-wrap">
                <p className="paypal-note">
                  Remember to set currency to <strong>USD</strong> to avoid extra fees.
                </p>
                <PayPal
                  totalTTD={resumeOrder.amount}
                  orderNumber={resumeOrder.orderNumber}
                  onApproved={() => navigate(
                    `/order-confirmation?orderNumber=${resumeOrder.orderNumber}&method=PayPal`
                  )}
                />
                <button
                  className="btn btn-outline btn-full"
                  style={{ marginTop: 12 }}
                  onClick={() => { setShowPayPal(false); setProcessing(false); }}
                >
                  ← Back
                </button>
              </div>
            ) : (
              <div className="payment-buttons">
                <button
                  className="pay-btn pay-btn--fygaro"
                  disabled={processing}
                  onClick={handleResumeFygaro}
                >
                  <span className="pay-btn__label">
                    {processing ? 'Processing…' : 'Pay with Local Debit / Credit Card (Linx)'}
                  </span>
                  <span className="pay-btn__amount">TT${Number(resumeOrder.amount).toFixed(2)}</span>
                </button>
                <button
                  className="pay-btn pay-btn--paypal"
                  disabled={processing}
                  onClick={handleResumePayPal}
                >
                  <span className="pay-btn__label">Pay with PayPal</span>
                  <span className="pay-btn__amount">
                    US${(Number(resumeOrder.amount) / TTD_TO_USD).toFixed(2)}
                  </span>
                </button>
                <button className="resume-discard-btn" onClick={handleDiscardResume}>
                  Discard order and start over →
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Truly empty
    return (
      <div className="checkout-page container page-content">
        <div className="checkout-empty">
          <p>Your cart is empty.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>Back to Shop</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page container page-content">
      <h1 className="checkout-title">Checkout</h1>

      <div className="checkout-layout">

        {/* ── Order summary ───────────────────────────────────────────── */}
        <div className="checkout-summary">
          <div className="summary-header">
            <h2>Order Summary</h2>
            <button className="clear-cart-btn" onClick={clearCart}>Clear cart</button>
          </div>

          {items.map(item => (
            <div key={item.id} className="summary-item">
              {item.JerseyImgFront && (
                <img src={item.JerseyImgFront} alt={item.Team} className="summary-thumb" />
              )}
              <div className="summary-info">
                <p className="summary-name">{item.Team}</p>
                <p className="summary-details">
                  {item.Cut} · {item.Sleeve} · {item.Variant} · Size {item.Size}
                </p>
                {item.PlayerName && (
                  <p className="summary-print">
                    {item.PlayerName} #{item.PlayerNumber}
                    <span className="summary-print-fee"> · +$100 print</span>
                  </p>
                )}
                {item.isOutOfStock && (
                  <p className="summary-oos">Ships in 3–4 weeks (+$70 shipping)</p>
                )}
                <div className="summary-item-controls">
                  <div className="qty-ctrl">
                    <button onClick={() => updateQty(item.id, item.Quantity - 1)}>−</button>
                    <span>{item.Quantity}</span>
                    <button onClick={() => updateQty(item.id, item.Quantity + 1)}>+</button>
                  </div>
                  <button className="summary-remove" onClick={() => removeItem(item.id)}>Remove</button>
                </div>
              </div>
              <span className="summary-price">${((item.Price || 0) * item.Quantity).toFixed(2)}</span>
            </div>
          ))}

          <hr className="divider" />

          {/* Promo code */}
          {promoApplied ? (
            <div className="promo-applied">
              <span>🎉 <strong>{promoApplied.code}</strong> — {promoApplied.description}</span>
              <button className="promo-remove" onClick={() => setPromoApplied(null)}>Remove</button>
            </div>
          ) : (
            <div className="promo-row">
              <input
                className="promo-input"
                type="text"
                placeholder="Promo code"
                value={promoInput}
                onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
              />
              <button
                className="btn btn-outline promo-btn"
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoInput.trim()}
              >
                {promoLoading ? '…' : 'Apply'}
              </button>
            </div>
          )}
          {promoError && <p className="promo-error">{promoError}</p>}

          <hr className="divider" />

          {/* Fee rows */}
          <div className="summary-fee-row">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {saleDiscount > 0 && (
            <div className="summary-fee-row summary-discount-row">
              <span>Discount</span>
              <span>−${saleDiscount.toFixed(2)}</span>
            </div>
          )}
          {hasOutOfStock && (
            <div className="summary-fee-row summary-oos-fee">
              <span>Out-of-stock shipping</span>
              <span>+$70.00</span>
            </div>
          )}
          <div className="summary-fee-row">
            <span>Standard Delivery</span>
            <span>+${DELIVERY_FEE.toFixed(2)}</span>
          </div>
          {promoApplied && (
            <div className="summary-fee-row summary-promo-row">
              <span>Promo ({promoApplied.code})</span>
              <span>−${promoApplied.discount.toFixed(2)}</span>
            </div>
          )}
          <hr className="divider" />
          <div className="summary-total">
            <span>Total</span>
            <span>${grandTotal.toFixed(2)}</span>
          </div>

          {hasOutOfStock && (
            <div className="notice notice-warning" style={{ marginTop: 16 }}>
              Your cart contains items that are <strong>out of stock</strong> and will need
              to be ordered. Please allow <strong>3–4 weeks for delivery.</strong>{' '}
              SportingExpressionz cannot guarantee shipping times due to congested global
              shipping lanes and customs delays.
            </div>
          )}
        </div>

        {/* ── Contact + Payment ────────────────────────────────────────── */}
        <div className="checkout-right">

          {/* Contact & delivery form */}
          <div className="checkout-contact">
            <h2>Contact &amp; Delivery</h2>
            {!contactReady ? (
              <div className="spinner" style={{ margin: '24px 0' }} />
            ) : (
              <form onSubmit={handleSaveContact} className="contact-form">
                {needsEmail && (
                  <div className="form-group">
                    <label className="form-label">
                      Email Address <span className="req">*</span>
                      <span className="label-hint"> — your order receipt will be sent here</span>
                    </label>
                    <input type="email" className="form-input" value={contact.email}
                      onChange={e => setField('email', e.target.value)}
                      placeholder="you@example.com" required />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Full Name <span className="req">*</span></label>
                  <input type="text" className="form-input" value={contact.name}
                    onChange={e => setField('name', e.target.value)} placeholder="First and last name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Address Line 1 <span className="req">*</span></label>
                  <input type="text" className="form-input" value={contact.address1}
                    onChange={e => setField('address1', e.target.value)} placeholder="Street address, P.O. Box" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Address Line 2 <span className="label-hint">(optional)</span></label>
                  <input type="text" className="form-input" value={contact.address2}
                    onChange={e => setField('address2', e.target.value)} placeholder="Apt, Suite, Building" />
                </div>
                <div className="form-group">
                  <label className="form-label">City / Town <span className="req">*</span></label>
                  <input type="text" className="form-input" value={contact.city}
                    onChange={e => setField('city', e.target.value)} placeholder="City" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Telephone Number <span className="req">*</span></label>
                  <input type="tel" className="form-input" value={contact.tel}
                    onChange={e => setField('tel', e.target.value.replace(/\D/g, ''))}
                    placeholder="7 digits, eg. 620-1234" maxLength={7} required />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Confirm Telephone <span className="req">*</span>
                    <span className="label-hint"> — re-enter to confirm</span>
                  </label>
                  <input type="tel"
                    className={`form-input${telError ? ' input-error' : ''}`}
                    value={contact.telConfirm}
                    onChange={e => setField('telConfirm', e.target.value.replace(/\D/g, ''))}
                    placeholder="Re-enter telephone number" maxLength={7} required />
                  {telError && <p className="field-error">{telError}</p>}
                  <p className="tel-hint">A correct telephone number is critical — wrong numbers result in failed deliveries.</p>
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={savingInfo}>
                  {savingInfo ? 'Saving…' : 'Save Delivery Info'}
                </button>
                {infoSaved && <p className="info-saved-msg">✓ Delivery info saved</p>}
              </form>
            )}
          </div>

          {/* Payment */}
          <div className="checkout-payment">
            <h2>Payment</h2>

            {showPayPal ? (
              <div className="paypal-wrap">
                <p className="paypal-note">
                  Remember to set currency to <strong>USD</strong> to avoid extra fees.
                </p>
                <PayPal
                  totalTTD={grandTotal}
                  orderNumber={pendingOrderNo}
                  onApproved={handlePayPalApproved}
                />
                <button className="btn btn-outline btn-full" style={{ marginTop: 12 }}
                  onClick={() => { setShowPayPal(false); setProcessing(false); }}>
                  ← Back
                </button>
              </div>
            ) : (
              <div className="payment-buttons">
                {/* Fygaro — local debit/credit */}
                <button
                  className="pay-btn pay-btn--fygaro"
                  disabled={processing}
                  onClick={handleFygaro}
                >
                  <span className="pay-btn__label">
                    {processing ? 'Processing…' : 'Pay with Local Debit / Credit Card (Linx)'}
                  </span>
                  <span className="pay-btn__amount">TT${grandTotal.toFixed(2)}</span>
                </button>

                {/* PayPal */}
                <button
                  className="pay-btn pay-btn--paypal"
                  disabled={processing}
                  onClick={handlePayPal}
                >
                  <span className="pay-btn__label">Pay with PayPal</span>
                  <span className="pay-btn__amount">US${(grandTotal / 6.78).toFixed(2)}</span>
                </button>

                {/* COD */}
                {codDisabled ? (
                  <button
                    className="pay-btn pay-btn--cod pay-btn--disabled"
                    onClick={() => alert(
                      'Customized or out-of-stock orders must be paid in advance.\n\n' +
                      'Please pay via Linx/PayPal or contact us on Instagram to arrange a bank transfer.'
                    )}
                  >
                    <span className="pay-btn__label">Cash on Delivery</span>
                    <span className="pay-btn__note">Not available for custom / out-of-stock items</span>
                  </button>
                ) : (
                  <button
                    className="pay-btn pay-btn--cod"
                    disabled={processing}
                    onClick={handleCOD}
                  >
                    <span className="pay-btn__label">
                      {processing ? 'Processing…' : 'Cash on Delivery'}
                    </span>
                    <span className="pay-btn__amount">TT${grandTotal.toFixed(2)}</span>
                  </button>
                )}

                <p className="payment-logos">
                  Accepted: Visa · Mastercard · Linx · PayPal
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

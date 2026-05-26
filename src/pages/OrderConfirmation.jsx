import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './OrderConfirmation.css';

export default function OrderConfirmation() {
  const [params] = useSearchParams();
  const orderNumber = params.get('orderNumber') || '—';
  const method      = params.get('method')      || '';
  const { user }    = useAuth();

  const isCOD       = method === 'COD';
  const isAnonymous = user?.isAnonymous ?? false;

  // Clear any pending order from localStorage — payment is complete
  useEffect(() => {
    localStorage.removeItem('pendingOrder');
  }, []);

  return (
    <div className="confirmation-page container page-content">
      <div className="confirmation-card">
        <div className="confirmation-icon">✓</div>

        <h1 className="confirmation-title">
          {isCOD ? 'Order Placed!' : 'Payment Received!'}
        </h1>

        <p className="confirmation-subtitle">
          Thank you for your order. A receipt has been sent to your email address.
        </p>

        <div className="confirmation-order">
          <span className="confirmation-order__label">Order Number</span>
          <span className="confirmation-order__number">{orderNumber}</span>
        </div>

        {isCOD && (
          <div className="confirmation-notice">
            <strong>Cash on Delivery</strong> — please have the exact amount ready for
            the courier. Your order will be prepared and delivered within the estimated
            window provided at checkout.
          </div>
        )}

        {isAnonymous && (
          <div className="confirmation-notice confirmation-notice--account">
            <strong>Want to track this order?</strong> Create an account to view your order
            history and get status updates.{' '}
            <Link to={`/register`}>Create an account →</Link>
          </div>
        )}

        <div className="confirmation-actions">
          {!isAnonymous && (
            <Link to="/orders" className="btn btn-primary">View My Orders</Link>
          )}
          <Link to="/" className="btn btn-outline">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}

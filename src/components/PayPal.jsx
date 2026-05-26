import { useRef, useEffect } from 'react';

const TTD_TO_USD = 6.78;

/**
 * Renders the PayPal buttons for a given order.
 * Requires the PayPal SDK script in index.html.
 *
 * Props:
 *   totalTTD    — order total in TTD
 *   orderNumber — used as PayPal custom_id so the webhook can match it
 *   onApproved  — callback after successful capture
 */
export default function PayPal({ totalTTD, orderNumber, onApproved }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!window.paypal || !containerRef.current) return;

    const usd = (totalTTD / TTD_TO_USD).toFixed(2);

    const buttons = window.paypal.Buttons({
      createOrder: (_data, actions) =>
        actions.order.create({
          intent: 'CAPTURE',
          purchase_units: [{
            description: 'SportingExpressionz',
            custom_id:   orderNumber,
            amount: { currency_code: 'USD', value: usd },
          }],
        }),
      onApprove: async (_data, actions) => {
        await actions.order.capture();
        onApproved();
      },
      onError: (err) => {
        console.error('PayPal error', err);
        alert('PayPal encountered an error. Please try again or choose a different payment method.');
      },
    });

    buttons.render(containerRef.current);
    return () => { try { buttons.close(); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} />;
}

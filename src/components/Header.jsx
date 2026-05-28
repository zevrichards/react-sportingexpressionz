import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import CartDrawer from './CartDrawer';
import './Header.css';

export default function Header() {
  const { user } = useAuth();
  const { count, setOpen, saleNotice } = useCart();
  const navigate  = useNavigate();
  const location  = useLocation();
  const sport     = new URLSearchParams(location.search).get('sport') || 'Football';
  const sportEmoji = { Football: '⚽', F1: '🏎️', Basketball: '🏀' }[sport] ?? '⚽';
  const [mobileOpen, setMobileOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const [pendingOrder, setPendingOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pendingOrder') || 'null'); }
    catch { return null; }
  });
  useEffect(() => {
    const handler = (e) => setPendingOrder(e.detail);
    window.addEventListener('pendingOrderChange', handler);
    return () => window.removeEventListener('pendingOrderChange', handler);
  }, []);

  const isGuest = user?.isAnonymous;

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <>
      {/* Top utility bar */}
      <div className="header-topbar">
        <div className="container topbar-inner">
          {saleNotice && <span className="topbar-msg topbar-sale">{saleNotice}</span>}
          <div className="topbar-links">
            {pendingOrder && (
              <Link to="/checkout" className="topbar-pending">
                ⚠ Unpaid order — TT${Number(pendingOrder.amount).toFixed(2)}
              </Link>
            )}
            {isGuest || !user ? (
              <>
                <Link to="/signin">Sign In</Link>
                <Link to="/register">Register</Link>
              </>
            ) : (
              <>
                <Link to="/orders">My Orders</Link>
                {user.email === 'sportingexpressionztt@gmail.com' && (
                  <Link to="/admin">Admin</Link>
                )}
                <button onClick={handleSignOut} className="topbar-signout">Sign Out</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main header */}
      <header className="header">
        <div className="container header-inner">
          {/* Hamburger (mobile) */}
          <button className="hamburger" onClick={() => setMobileOpen(v => !v)} aria-label="Menu">
            <span /><span /><span />
          </button>

          {/* Logo */}
          <Link to="/" className="logo">
            {sportEmoji} <span>Sporting</span>Expressionz
          </Link>

          {/* Nav */}
          <nav className={`header-nav${mobileOpen ? ' open' : ''}`}>
            <NavLink to="/" end onClick={() => setMobileOpen(false)}>Shop</NavLink>
            <NavLink to="/customize" onClick={() => setMobileOpen(false)}>Customize</NavLink>
            <NavLink to="/reviews" onClick={() => setMobileOpen(false)}>Reviews</NavLink>
          </nav>

          {/* Actions */}
          <div className="header-actions">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="cart-btn" onClick={() => setOpen(true)} aria-label="Cart">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {count > 0 && <span className="cart-count">{count}</span>}
            </button>
          </div>
        </div>
      </header>

      <CartDrawer />
    </>
  );
}

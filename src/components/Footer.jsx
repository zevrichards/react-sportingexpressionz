import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">⚽ SportingExpressionz</span>
          <p>Custom printed sporting jerseys with authentic league fonts.</p>
        </div>
        <div className="footer-links">
          <strong>Shop</strong>
          <Link to="/">All Jerseys</Link>
          <Link to="/customize">Customize</Link>
          <Link to="/reviews">Reviews</Link>
        </div>
        <div className="footer-links">
          <strong>Account</strong>
          <Link to="/signin">Sign In</Link>
          <Link to="/register">Register</Link>
          <Link to="/orders">My Orders</Link>
        </div>
        <div className="footer-links">
          <strong>Legal</strong>
          <a href="https://www.termsfeed.com/live/00c6b083-aa1c-453d-9efe-0bd27f824410" target="_blank" rel="noreferrer">Privacy Policy</a>
          <Link to="/data-deletion">Data Deletion Policy</Link>
          <a href="https://www.termsfeed.com/live/2da60c43-2f3b-4cb3-8a7b-d8d676450ca9" target="_blank" rel="noreferrer">Return &amp; Refund Policy</a>
        </div>
        <div className="footer-links">
          <strong>Follow Us</strong>
          <a href="https://www.instagram.com/sportingexpressionz" target="_blank" rel="noreferrer" className="footer-social">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.31.975.975 1.247 2.242 1.309 3.608.058 1.265.07 1.645.07 4.849s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.31 3.608-.975.975-2.242 1.247-3.608 1.309-1.265.058-1.645.07-4.849.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.31-.975-.975-1.247-2.242-1.309-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.31-3.608.975-.975 2.242-1.247 3.608-1.309C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            Instagram
          </a>
          <a href="https://www.facebook.com/sportingexpressionz" target="_blank" rel="noreferrer" className="footer-social">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
            Facebook
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} SportingExpressionz. All rights reserved.</span>
      </div>
    </footer>
  );
}

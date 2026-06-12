import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Customize from './pages/Customize';
import SignIn from './pages/SignIn';
import Register from './pages/Register';
import Orders from './pages/Orders';
import Checkout from './pages/Checkout';
import Reviews from './pages/Reviews';
import OrderConfirmation from './pages/OrderConfirmation';
import Admin from './pages/Admin';
import DataDeletion from './pages/DataDeletion';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <ScrollToTop />
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header />
            <Routes>
              <Route path="/"          element={<Home />} />
              <Route path="/customize" element={<Customize />} />
              <Route path="/signin"    element={<SignIn />} />
              <Route path="/register"  element={<Register />} />
              <Route path="/orders"    element={<Orders />} />
              <Route path="/checkout"  element={<Checkout />} />
              <Route path="/reviews"            element={<Reviews />} />
              <Route path="/order-confirmation" element={<OrderConfirmation />} />
              <Route path="/admin"             element={<Admin />} />
              <Route path="/data-deletion"    element={<DataDeletion />} />
            </Routes>
            <Footer />
          </div>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

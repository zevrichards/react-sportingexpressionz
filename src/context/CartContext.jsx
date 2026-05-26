import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  collection, doc, getDocs, setDoc, deleteDoc, updateDoc, onSnapshot, getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

// ── Discount engine ────────────────────────────────────────────────────────────
// Items are treated as individual line items (Quantity does NOT multiply eligibility).
// Prices are never mutated — the discount is a separate derived value.
//
// The $100 print/customization fee is excluded from all discount calculations:
// customers always pay full price for the print service regardless of any sale.
const PRINT_FEE = 100;
const jerseyBase = item => (item.Price || 0) - (item.PlayerName ? PRINT_FEE : 0);

function computeDiscount(items, config) {
  if (!config?.saleType || items.length === 0) return 0;

  if (config.saleType === 'BOGOF') {
    // Sort by base jersey price (excl. print fee) most-expensive first.
    // Every 2nd item (cheaper of each pair) is free — at its base price only.
    const sorted = [...items].sort((a, b) => jerseyBase(b) - jerseyBase(a));
    let discount = 0;
    for (let i = 1; i < sorted.length; i += 2) {
      discount += jerseyBase(sorted[i]) * (sorted[i].Quantity || 1);
    }
    return discount;
  }

  if (config.saleType === 'BOGOHO') {
    const bogoPrice = config.bogoPrice || 200;
    // Eligibility and discount based on base jersey price, not including print fee
    const eligible = items.filter(it => jerseyBase(it) >= bogoPrice);
    return Math.floor(eligible.length / 2) * (bogoPrice / 2);
  }

  return 0;
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items,      setItems]      = useState([]);
  const [open,       setOpen]       = useState(false);
  const [saleConfig, setSaleConfig] = useState(null);

  // Load SiteConfig once on mount
  useEffect(() => {
    getDoc(doc(db, 'SiteConfig', 'global'))
      .then(snap => { if (snap.exists()) setSaleConfig(snap.data()); })
      .catch(() => {/* rules may restrict unauthenticated reads — silent fail */});
  }, []);

  useEffect(() => {
    if (!user) return;
    const cartRef = collection(db, 'Users', user.uid, 'Cart');
    const unsub = onSnapshot(cartRef, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  const addItem = useCallback(async (jersey) => {
    if (!user) return;
    const id = [jersey.Team, jersey.Cut, jersey.Sleeve, jersey.Variant, jersey.Size, jersey.PlayerName, jersey.PlayerNumber]
      .join('-').replace(/\s+/g, '_');
    const ref = doc(db, 'Users', user.uid, 'Cart', id);
    const existing = items.find(i => i.id === id);
    if (existing) {
      await updateDoc(ref, { Quantity: existing.Quantity + 1 });
    } else {
      await setDoc(ref, { ...jersey, Quantity: 1 });
    }
    setOpen(true);
  }, [user, items]);

  const removeItem = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'Users', user.uid, 'Cart', id));
  }, [user]);

  const updateQty = useCallback(async (id, qty) => {
    if (!user) return;
    if (qty < 1) return removeItem(id);
    await updateDoc(doc(db, 'Users', user.uid, 'Cart', id), { Quantity: qty });
  }, [user, removeItem]);

  const clearCart = useCallback(async () => {
    if (!user) return;
    const cartRef = collection(db, 'Users', user.uid, 'Cart');
    const snap = await getDocs(cartRef);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }, [user]);

  const subtotal   = items.reduce((sum, i) => sum + (i.Price || 0) * i.Quantity, 0);
  const discount   = computeDiscount(items, saleConfig);
  const total      = subtotal - discount;
  const count      = items.reduce((sum, i) => sum + i.Quantity, 0);
  const saleType   = saleConfig?.saleType   || null;
  const saleNotice = saleConfig?.saleNotice || '';

  return (
    <CartContext.Provider value={{
      items, subtotal, discount, total, count, open, setOpen,
      addItem, removeItem, updateQty, clearCart,
      saleType, saleNotice,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);

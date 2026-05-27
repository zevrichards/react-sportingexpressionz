import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  linkWithCredential, linkWithPopup, linkWithRedirect,
  EmailAuthProvider, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, signInWithCredential,
  getRedirectResult,
} from 'firebase/auth';

const IS_DEV = import.meta.env.DEV;
import {
  collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const AuthContext = createContext(null);

// ── Cart merge ───────────────────────────────────────────────────────────────
// Phase 1 (call BEFORE sign-in, while auth.uid == anonUid):
//   Read and delete the anonymous cart docs. Returns the items so they can be
//   written to the new account in phase 2.
async function readAndClearAnonCart(anonUid) {
  const snap = await getDocs(collection(db, 'Users', anonUid, 'Cart'));
  if (snap.empty) return [];
  const items = snap.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));
  await Promise.all(items.map(item => deleteDoc(item.ref)));
  return items;
}

// Phase 2 (call AFTER sign-in, while auth.uid == targetUid):
//   Write the captured items into the new account's cart.
async function writeCartToAccount(items, targetUid) {
  if (!items.length) return;
  await Promise.all(items.map(async item => {
    const targetRef = doc(db, 'Users', targetUid, 'Cart', item.id);
    const existing  = await getDoc(targetRef);
    if (existing.exists()) {
      await updateDoc(targetRef, { Quantity: existing.data().Quantity + item.data.Quantity });
    } else {
      await setDoc(targetRef, item.data);
    }
  }));
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    let cancelled  = false;
    let unsub      = null;

    async function init() {
      if (!IS_DEV) {
        // Prod: wait for auth state to load from persistence, then check for
        // any pending Google redirect result (getRedirectResult needs the auth
        // state loaded first or it returns null immediately).
        await new Promise(resolve => {
          const once = onAuthStateChanged(auth, () => { once(); resolve(); });
        });
        if (cancelled) return;
        try {
          await getRedirectResult(auth);
        } catch (err) {
          if (err.code === 'auth/credential-already-in-use') {
            // In Firebase 9, err.credential is always undefined —
            // the credential must be extracted via credentialFromError().
            const credential  = GoogleAuthProvider.credentialFromError(err);
            const currentUser = auth.currentUser;
            if (currentUser?.isAnonymous) {
              const anonUid   = currentUser.uid;
              const anonItems = await readAndClearAnonCart(anonUid);
              await signInWithCredential(auth, credential);
              await writeCartToAccount(anonItems, auth.currentUser.uid);
            } else {
              await signInWithCredential(auth, credential);
            }
          }
        }
        if (cancelled) return;
      }

      unsub = onAuthStateChanged(auth, async (u) => {
        if (u) {
          setUser(u);
        } else {
          const cred = await signInAnonymously(auth);
          setUser(cred.user);
        }
      });
    }

    init();
    return () => { cancelled = true; unsub?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Email / password sign-in ─────────────────────────────────────────────
  // If the current session is anonymous, we try to *link* the credential so
  // the UID stays the same (cart is preserved automatically).  If the email
  // already belongs to an existing account we fall back to a normal sign-in
  // and merge the anonymous cart across.
  const signIn = useCallback(async (email, password) => {
    const currentUser = auth.currentUser;
    const credential  = EmailAuthProvider.credential(email, password);

    if (currentUser?.isAnonymous) {
      try {
        await linkWithCredential(currentUser, credential);
        return; // UID unchanged — cart preserved
      } catch (err) {
        if (
          err.code === 'auth/email-already-in-use' ||
          err.code === 'auth/credential-already-in-use'
        ) {
          // Phase 1: snapshot + delete anon cart while still auth.uid == anonUid
          const anonUid   = currentUser.uid;
          const anonItems = await readAndClearAnonCart(anonUid);
          // Phase 2: sign in (auth.uid changes) then write cart to new account
          const result = await signInWithEmailAndPassword(auth, email, password);
          await writeCartToAccount(anonItems, result.user.uid);
          return result;
        }
        throw err;
      }
    }

    return signInWithEmailAndPassword(auth, email, password);
  }, []);

  // ── Email / password registration ────────────────────────────────────────
  const register = useCallback(async (email, password) => {
    const currentUser = auth.currentUser;
    const credential  = EmailAuthProvider.credential(email, password);

    if (currentUser?.isAnonymous) {
      try {
        await linkWithCredential(currentUser, credential);
        return; // UID unchanged — cart preserved
      } catch (err) {
        // auth/email-already-in-use: email taken, user should sign in
        throw err;
      }
    }

    return createUserWithEmailAndPassword(auth, email, password);
  }, []);

  // ── Google sign-in ───────────────────────────────────────────────────────
  // Dev: popup (redirect session storage is lost on Chrome localhost).
  // Prod: redirect (popup blocked by mobile browsers — Safari, Instagram, etc.).
  // Result is handled by the getRedirectResult effect above on the next page load.
  const signInWithGoogle = useCallback(async () => {
    const provider    = new GoogleAuthProvider();
    const currentUser = auth.currentUser;

    if (IS_DEV) {
      if (currentUser?.isAnonymous) {
        try {
          return await linkWithPopup(currentUser, provider);
        } catch (err) {
          if (err.code === 'auth/credential-already-in-use') {
            const anonUid   = currentUser.uid;
            const anonItems = await readAndClearAnonCart(anonUid);
            const result    = await signInWithPopup(auth, provider);
            await writeCartToAccount(anonItems, result.user.uid);
            return result;
          }
          if (err.code === 'auth/popup-closed-by-user' ||
              err.code === 'auth/cancelled-popup-request') return;
          throw err;
        }
      }
      return signInWithPopup(auth, provider);
    }

    // Prod: redirect (result handled by getRedirectResult in init)
    return currentUser?.isAnonymous
      ? linkWithRedirect(currentUser, provider)
      : signInWithRedirect(auth, provider);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signIn, register, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

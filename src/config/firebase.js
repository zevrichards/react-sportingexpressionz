import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAoLPgkbTcasp-gN19mu8O3H-EjxE-kzNw",
  // Dev: use the default firebaseapp.com auth domain. The custom domain
  // (soccerexpressionz.com) hosts the old live site — Firebase v9's redirect
  // relay cannot pass the OAuth result back to localhost across origins.
  // Prod: use the custom domain as normal.
  authDomain: import.meta.env.DEV
    ? "soccerexpressionz-test.firebaseapp.com"
    : "soccerexpressionz.com",
  projectId: "soccerexpressionz-test",
  storageBucket: "soccerexpressionz-test.appspot.com",
  messagingSenderId: "950374214946",
  appId: "1:950374214946:web:78a3c35563b9927cabc97b",
  measurementId: "G-M7X8NJNW0L"
};

const app = initializeApp(firebaseConfig);

// initializeAuth sets persistence and the popup/redirect resolver synchronously.
// getAuth() in Firebase 12 no longer attaches a popupRedirectResolver by default,
// which causes linkWithPopup / signInWithPopup to fail with _getIdTokenResponse errors.
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = getFirestore(app);
export const storage = getStorage(app);

export const GlobalJerseyPrice = {
  Custom: 150,
  Youth: 300,
  Womens: 350,
  MensShort: 350,
  MensLong: 400,
};

export const FONT_MAP = {
  // 'Juventus':         { fontFamily: 'SerieAFont',       color: 'black',   namePosition: 'top' },
  // 'PSG':              { fontFamily: 'Ligue1Font',        color: 'white',   namePosition: 'top' },
  // 'Real Madrid':      { fontFamily: 'RealMadridCupFont', color: '#4b5fa8', namePosition: 'top' },
  // 'Barcelona':        { fontFamily: 'LaLigaFont',        color: 'yellow',  namePosition: 'top' },
  // 'Manchester City':  { fontFamily: 'ManCityFont',       color: 'white',   namePosition: 'top' },
  // 'Manchester United':{ fontFamily: 'ManUtdFont',        color: 'white',   namePosition: 'top' },
  // 'Liverpool':        { fontFamily: 'LiverpoolCupFont',  color: 'white',   namePosition: 'top' },
  // 'Chelsea':          { fontFamily: 'ChelseaCupFont',    color: 'white',   namePosition: 'top' },
  // 'Arsenal':          { fontFamily: 'ArsenalFont',       color: 'white',   namePosition: 'top' },
  'Bayern Munich':    { fontFamily: 'BasicFont',         color: 'white',   namePosition: 'bottom' },
  'Borussia Dortmund':{ fontFamily: 'BundesligaFont',    color: 'black',   namePosition: 'bottom' },
};

export const DEFAULT_FONT = { fontFamily: 'BasicFont', color: 'white', namePosition: 'top' };

export const SPORT_COLLECTIONS = {
  Football: 'Leagues',
  F1: 'F1',
  Basketball: 'Basketball',
};

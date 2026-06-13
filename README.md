# react-sportingexpressionz

A React e-commerce application for ordering custom-printed sports jerseys — an AI-assisted rewrite and front end redesign of the original [soccerexpressionz | https://soccerexpressionz.netlfiy.app ](https://github.com/zevrichards/soccerexpressionz) project. Live at [sportingexpressionz.com](https://sportingexpressionz.com).

> **Before/After:** The original site was built entirely without AI assistance using Create React App and W3.CSS. This rewrite migrated to Vite, modernised the component architecture, redesigned the UI from scratch, and expanded scope from football only to multi-sport. AI tooling was used to accelerate the front end redesign and caught several bugs in the process — the core business logic and data model carried over from the original.

## What it does

- Browse and customise jerseys by sport, league, team, cut, sleeve, variant and size
- Real-time jersey image preview (front and back) with personalised name, number and font
- Shopping cart with quantity management, promo code support and sale pricing
- Dual payment integration — PayPal (international) and Fygaro (local TTD payments)
- Firebase Authentication (email/password, Google sign-in, anonymous cart preservation)
- Order management with pending order resume and manual order recovery
- Admin panel for stock, pricing and order management
- Customer reviews
- Server-side order fulfilment via Firebase Cloud Functions

## Tech stack

- React (Vite)
- Firebase — Firestore, Authentication, Cloud Functions, Hosting
- PayPal JS SDK
- Fygaro payment integration (JWT-based)
- react-router-dom v6

## Context

Built as a real production e-commerce store targeting the Trinidad & Tobago market. The rewrite expanded the original football-only store to cover multiple sports, introduced a fully redesigned UI, and migrated order fulfilment from client-side to server-side Cloud Functions for better reliability and security.

## Running locally

```bash
npm install
npm run dev
```

Requires a Firebase project configured in `src/config/firebase.js` and a `.env` file with the appropriate environment variables. Cloud Functions require their own `.env` in the `/functions` directory.

import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, getDocs, addDoc, query, orderBy, where, limit, startAfter } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import './Reviews.css';

const PAGE_SIZE = 5;

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function StarRating({ value, onChange }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`star${n <= value ? ' filled' : ''}`}
          onClick={() => onChange && onChange(n)}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >★</button>
      ))}
    </div>
  );
}

function ReviewCard({ review }) {
  const date = new Date(review.Date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <div className="review-card">
      <div className="review-header">
        <div className="review-avatar">{review.CustomerName?.[0]?.toUpperCase() || '?'}</div>
        <div>
          <p className="review-author">{review.CustomerName}</p>
          <p className="review-date">{date}</p>
        </div>
        {review.Rating && <StarRating value={review.Rating} />}
      </div>
      <p className="review-text">{review.ReviewText}</p>
      {review.ReviewImg && (
        <img src={review.ReviewImg} alt="Review" className="review-img" />
      )}
    </div>
  );
}

export default function Reviews() {
  const { user } = useAuth();
  const [reviews,     setReviews]     = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [page,        setPage]        = useState(0); // increments after each load so observer reconnects
  const lastDocRef  = useRef(null);
  const sentinelRef = useRef(null);

  // Form state
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [rating,   setRating]   = useState(5);
  const [text,     setText]     = useState('');
  const [imgFile,  setImgFile]  = useState(null);
  const [imgError, setImgError] = useState('');
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [promoMsg,   setPromoMsg]   = useState('');
  const [formError,  setFormError]  = useState('');

  const isAnonymous = !user || user.isAnonymous;

  // ── Load a page of reviews ────────────────────────────────────────────────
  const loadPage = useCallback(async (after = null) => {
    const constraints = [orderBy('Date', 'desc'), limit(PAGE_SIZE)];
    if (after) constraints.push(startAfter(after));
    const snap = await getDocs(query(collection(db, 'Reviews'), ...constraints));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
    setHasMore(snap.docs.length === PAGE_SIZE);
    return docs;
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadPage(null).then(docs => {
      setReviews(docs);
      setLoadingList(false);
    });
  }, [loadPage]);

  // ── IntersectionObserver — same pattern as Home: page increments after each
  //    load so the observer reconnects and immediately fires if sentinel is
  //    still visible, chaining pages as long as content fits the screen.
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        setLoadingMore(true);
        loadPage(lastDocRef.current).then(more => {
          setReviews(prev => [...prev, ...more]);
          setPage(p => p + 1);   // triggers observer reconnect
          setLoadingMore(false);
        });
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [page, hasMore, loadingMore, loadPage]);

  // ── Image file handler ────────────────────────────────────────────────────
  const handleImgChange = (e) => {
    const file = e.target.files[0];
    if (file && ALLOWED_TYPES.includes(file.type)) {
      setImgFile(file);
      setImgError('');
    } else {
      setImgFile(null);
      setImgError('Please select a valid JPG, PNG, or WebP image.');
    }
  };

  // ── Generate & store promo code ───────────────────────────────────────────
  async function generatePromoCode(recipientEmail) {
    // Check if this email already received a review promo
    const existing = await getDocs(
      query(collection(db, 'PromoCodes'), where('Email', '==', recipientEmail))
    );
    if (!existing.empty) {
      return { alreadyHas: true };
    }
    const chars = '0123456789ABCDEF';
    const suffix = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 16)]).join('');
    const code = `ZREV50$${suffix}`;
    await addDoc(collection(db, 'PromoCodes'), {
      Code: code,
      Description: '$50 OFF',
      Price: 50,
      Quantity: 1,
      Email: recipientEmail,
    });
    // Queue email via Firebase Trigger Email extension
    await addDoc(collection(db, 'mail'), {
      to: recipientEmail,
      cc: 'sportingexpressionztt@gmail.com',
      template: { name: 'promocode', data: { promocode: code } },
    });
    return { alreadyHas: false, code };
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const recipientEmail = isAnonymous ? email : user.email;
    if (isAnonymous && (!recipientEmail.includes('@') || !recipientEmail.includes('.'))) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!imgFile) {
      setFormError('Please attach an image of your jersey.');
      return;
    }

    setSubmitting(true);

    try {
      // Upload image to Firebase Storage
      const storageRef = ref(storage, `review-images/${Date.now()}_${imgFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, imgFile);

      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });

      const imgURL = await getDownloadURL(uploadTask.snapshot.ref);

      // Save review to Firestore
      const newReview = {
        Date: Date.now(),
        CustomerName: name,
        ReviewText: text,
        ReviewImg: imgURL,
        Rating: rating,
        userId: user?.uid ?? null,
      };
      await addDoc(collection(db, 'Reviews'), newReview);

      // Generate promo code
      const promo = await generatePromoCode(recipientEmail);
      if (promo.alreadyHas) {
        setPromoMsg('Thank you! You have already received a promo code for a previous review.');
      } else {
        setPromoMsg(`As a thank you, a $50 promo code (${promo.code}) has been emailed to ${recipientEmail}!`);
      }

      // Prepend to local list
      setReviews(prev => [{ id: Date.now().toString(), ...newReview }, ...prev]);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setFormError('Something went wrong. Please try again.');
    }

    setSubmitting(false);
  };

  return (
    <div className="reviews-page container page-content">
      <h1 className="reviews-title">Customer Reviews</h1>

      <div className="reviews-layout">
        {/* ── Submit form ──────────────────────────────────────────── */}
        <div className="review-form-col">
          <div className="review-form-card">
            <h2>Leave a Review</h2>
            <p className="review-form-sub">Share a photo of your jersey and get a <strong>$50 promo code</strong>!</p>

            {submitted ? (
              <div className="review-success">
                <span className="review-success-icon">✓</span>
                <p>Thank you for your review!</p>
                {promoMsg && <p className="promo-msg">{promoMsg}</p>}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="review-form">
                <div className="form-group">
                  <label className="form-label">Your Name</label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. John D." />
                </div>

                {isAnonymous && (
                  <div className="form-group">
                    <label className="form-label">Email <span className="label-hint">(for your promo code)</span></label>
                    <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="email@example.com" />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Rating</label>
                  <StarRating value={rating} onChange={setRating} />
                </div>

                <div className="form-group">
                  <label className="form-label">Review</label>
                  <textarea
                    className="form-input review-textarea"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    required
                    rows={4}
                    placeholder="Tell us about your experience..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Jersey Photo <span className="label-hint">(JPG / PNG)</span></label>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImgChange} required className="file-input" />
                  {imgError && <p className="field-error">{imgError}</p>}
                </div>

                {submitting && (
                  <div className="upload-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span>{progress}%</span>
                  </div>
                )}

                {formError && <p className="auth-error">{formError}</p>}

                <button className="btn btn-green btn-full" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Review list ──────────────────────────────────────────── */}
        <div className="review-list-col">
          {loadingList ? (
            <div className="spinner" />
          ) : reviews.length === 0 ? (
            <p className="reviews-empty">No reviews yet — be the first!</p>
          ) : (
            <div className="review-list">
              {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
            </div>
          )}

          {/* Sentinel always in DOM so the observer attaches on first render */}
          <div ref={sentinelRef} className="review-sentinel">
            {loadingMore && <div className="spinner" />}
            {!hasMore && reviews.length > 0 && (
              <p className="reviews-end">All reviews loaded</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

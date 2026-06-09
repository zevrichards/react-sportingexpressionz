import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, addDoc, doc, deleteDoc, updateDoc, setDoc, getDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, SPORT_COLLECTIONS } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

const ADMIN_EMAIL = 'sportingexpressionztt@gmail.com';

const TABS = [
  { id: 'addjersey',  label: 'Add Jersey' },
  { id: 'players',   label: 'Players' },
  { id: 'tracking',  label: 'Tracking' },
  { id: 'promos',    label: 'Promo Codes' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'sale',      label: 'Sale Prices' },
  { id: 'stock',     label: 'Stock Cleanup' },
];

const SIZES       = ['S', 'M', 'L', 'XL', '2XL', 'Any'];
const YOUTH_SIZES = ['XXS (16)', 'XS (18)', 'S (20)', 'M (22)', 'L (24)', 'XL (26)', '2XL (28)'];

const SPORT_LIST = [
  { key: 'Football',   label: 'Football',   emoji: '⚽' },
  { key: 'F1',         label: 'F1',         emoji: '🏎️' },
  { key: 'Basketball', label: 'Basketball', emoji: '🏀' },
];

// ── helpers ────────────────────────────────────────────────────────────────────
function genPromoCode() {
  const chars = '0123456789ABCDEF';
  const suffix = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 16)]).join('');
  return `ZREV50$${suffix}`;
}

// ── Sport tab strip (shared) ──────────────────────────────────────────────────
function SportTabs({ sport, setSport }) {
  return (
    <div className="sport-tabs" style={{ marginBottom: 20 }}>
      {SPORT_LIST.map(s => (
        <button
          key={s.key}
          className={`sport-tab${sport === s.key ? ' active' : ''}`}
          onClick={() => setSport(s.key)}
        >
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Add Jersey
// ══════════════════════════════════════════════════════════════════════════════
function AddJerseyTab() {
  const [sport,         setSport]         = useState('Football');
  const [leagueOptions, setLeagueOptions] = useState([]);
  const [leagueInput,   setLeagueInput]   = useState('');
  const [teamOptions,   setTeamOptions]   = useState([]);
  const [teamInput,     setTeamInput]     = useState('');
  const [cut,           setCut]           = useState('Mens');
  const [sleeve,        setSleeve]        = useState('Short');
  const [variantDrop,   setVariantDrop]   = useState('Home');
  const [variantCustom, setVariantCustom] = useState('Home');
  const [hasSale,       setHasSale]       = useState(false);
  const [salePrice,     setSalePrice]     = useState('');
  const [fontColor,     setFontColor]     = useState('#ffffff');
  const [namePosition,  setNamePosition]  = useState('top');
  const [sizes,         setSizes]         = useState({}); // { size: qty }
  const [frontFile,     setFrontFile]     = useState(null);
  const [backFile,      setBackFile]      = useState(null);
  const [msg,           setMsg]           = useState('');
  const [saving,        setSaving]        = useState(false);

  const VARIANT_PRESETS = ['Home', 'Away', '3rd', 'Any'];
  const rootCol = SPORT_COLLECTIONS[sport] || 'Leagues';

  // Load leagues when sport changes
  useEffect(() => {
    setLeagueOptions([]);
    setLeagueInput('');
    setTeamOptions([]);
    setTeamInput('');
    getDocs(collection(db, rootCol)).then(snap => {
      const list = snap.docs.map(d => d.data().League || d.id).sort();
      setLeagueOptions(list);
      if (list.length) setLeagueInput(list[0]);
    });
  }, [rootCol]);

  // Load teams when league changes
  useEffect(() => {
    if (!leagueInput) return;
    setTeamOptions([]);
    setTeamInput('');
    getDocs(collection(db, rootCol, leagueInput, 'Teams')).then(snap => {
      const list = snap.docs.map(d => d.data().Team || d.id).sort();
      setTeamOptions(list);
      if (list.length) setTeamInput(list[0]);
    });
  }, [rootCol, leagueInput]);

  const toggleSize = (size) => {
    setSizes(prev => {
      const next = { ...prev };
      if (next[size] !== undefined) { delete next[size]; }
      else { next[size] = 0; }
      return next;
    });
  };

  const setSizeQty = (size, qty) => {
    setSizes(prev => ({ ...prev, [size]: qty }));
  };

  const handleVariantDropChange = (val) => {
    setVariantDrop(val);
    if (VARIANT_PRESETS.includes(val)) setVariantCustom(val);
  };

  const handleVariantCustomChange = (val) => {
    setVariantCustom(val);
    if (!VARIANT_PRESETS.includes(val)) setVariantDrop('');
    else setVariantDrop(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const league  = leagueInput.trim();
    const team    = teamInput.trim();
    const variant = variantCustom.trim() || variantDrop;

    if (!league || !team || !variant) { setMsg('League, team, and variant are required.'); return; }
    if (!frontFile) { setMsg('Front image is required.'); return; }

    setSaving(true);
    setMsg('Saving hierarchy…');

    try {
      // Write hierarchy with merge:true
      const leagueRef = doc(db, rootCol, league);
      await setDoc(leagueRef, { League: league }, { merge: true });

      const teamRef = doc(db, rootCol, league, 'Teams', team);
      await setDoc(teamRef, { Team: team }, { merge: true });

      const cutRef = doc(db, rootCol, league, 'Teams', team, 'Cuts', cut);
      await setDoc(cutRef, { Cut: cut }, { merge: true });

      const sleeveData = { Sleeve: sleeve };
      if (hasSale && salePrice) sleeveData.SalePrice = Number(salePrice);
      const sleeveRef = doc(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves', sleeve);
      await setDoc(sleeveRef, sleeveData, { merge: true });

      const variantRef = doc(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves', sleeve, 'Variants', variant);
      await setDoc(variantRef, {
        Variant: variant,
        FontColor:    fontColor    || '#ffffff',
        NamePosition: namePosition || 'top',
      }, { merge: true });

      // Write sizes
      setMsg('Writing sizes…');
      for (const [size, qty] of Object.entries(sizes)) {
        const sizeRef = doc(variantRef, 'Sizes', size);
        await setDoc(sizeRef, { Size: size, StockQuantity: Number(qty) }, { merge: true });
      }

      // Upload front image
      setMsg('Uploading front image…');
      const frontPath = `jersey-images/${league}/${team}/${frontFile.name}`;
      const frontRef  = ref(storage, frontPath);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(frontRef, frontFile);
        task.on('state_changed', null, reject, resolve);
      });
      const frontURL = await getDownloadURL(frontRef);
      await updateDoc(variantRef, { JerseyImgFront: frontURL });

      // Upload back image (optional)
      if (backFile) {
        setMsg('Uploading back image…');
        const backPath = `jersey-images/${league}/${team}/${backFile.name}`;
        const backStorageRef = ref(storage, backPath);
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(backStorageRef, backFile);
          task.on('state_changed', null, reject, resolve);
        });
        const backURL = await getDownloadURL(backStorageRef);
        await updateDoc(variantRef, { JerseyImgBack: backURL });
      }

      setMsg(`✓ Jersey added: ${league} / ${team} / ${cut} / ${sleeve} / ${variant}`);
      setSizes({});
      setFrontFile(null);
      setBackFile(null);
      // Reset file inputs by clearing their values
      document.querySelectorAll('.add-jersey-file-input').forEach(el => { el.value = ''; });
    } catch (err) {
      console.error(err);
      setMsg('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Add Jersey</h2>
      <SportTabs sport={sport} setSport={setSport} />

      <form onSubmit={handleSubmit} className="add-jersey-form">

        {/* League row */}
        <div className="add-jersey-row">
          <div className="form-group">
            <label className="form-label">Year (select)</label>
            <select className="form-input" value={leagueInput}
              onChange={e => setLeagueInput(e.target.value)}>
              {leagueOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Year (or type new)</label>
            <input className="form-input" value={leagueInput}
              onChange={e => setLeagueInput(e.target.value)}
              placeholder="e.g. Premier League" />
          </div>
        </div>

        {/* Team row */}
        <div className="add-jersey-row">
          <div className="form-group">
            <label className="form-label">Team (select)</label>
            <select className="form-input" value={teamInput}
              onChange={e => setTeamInput(e.target.value)}>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Team (or type new)</label>
            <input className="form-input" value={teamInput}
              onChange={e => setTeamInput(e.target.value)}
              placeholder="e.g. Arsenal" />
          </div>
        </div>

        {/* Cut */}
        <div className="form-group add-jersey-half">
          <label className="form-label">Cut</label>
          <select className="form-input" value={cut} onChange={e => setCut(e.target.value)}>
            {['Mens', 'Womens', 'Youth', 'Any'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Sleeve */}
        <div className="form-group add-jersey-half">
          <label className="form-label">Sleeve</label>
          <select className="form-input" value={sleeve} onChange={e => setSleeve(e.target.value)}>
            {['Short', 'Long', 'Any'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Variant */}
        <div className="add-jersey-row">
          <div className="form-group">
            <label className="form-label">Variant (preset)</label>
            <select className="form-input" value={variantDrop} onChange={e => handleVariantDropChange(e.target.value)}>
              <option value="">— custom —</option>
              {VARIANT_PRESETS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Variant (custom)</label>
            <input className="form-input" value={variantCustom}
              onChange={e => handleVariantCustomChange(e.target.value)}
              placeholder="e.g. Home" />
          </div>
        </div>

        {/* Font colour + name position */}
        <div className="add-jersey-row">
          <div className="form-group">
            <label className="form-label">
              Font Colour
              <span className="label-hint"> (name &amp; number on back)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                value={fontColor}
                onChange={e => setFontColor(e.target.value)}
                style={{ width: 44, height: 38, padding: 2, border: '1.5px solid var(--clr-border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
              />
              <input
                className="form-input"
                type="text"
                value={fontColor}
                onChange={e => setFontColor(e.target.value)}
                placeholder="#ffffff"
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              Name Position
              <span className="label-hint"> (top = standard, bottom = Bundesliga)</span>
            </label>
            <div className="select-wrapper">
              <select className="form-input" value={namePosition}
                onChange={e => setNamePosition(e.target.value)}>
                <option value="top">Top (standard — just below collar)</option>
                <option value="bottom">Bottom (Bundesliga — above hem)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sale price */}
        <div className="sale-toggle-row">
          <label className="sale-toggle-label">
            <input type="checkbox" checked={hasSale} onChange={e => setHasSale(e.target.checked)} />
            Sale Price
          </label>
          {hasSale && (
            <input className="form-input sale-price-input" type="number" min={0}
              value={salePrice} onChange={e => setSalePrice(e.target.value)}
              placeholder="e.g. 250" />
          )}
        </div>

        {/* Sizes */}
        <div className="form-group">
          <label className="form-label">Sizes (check to add quantity)</label>
          <div className="size-qty-grid">
            {(cut === 'Youth' ? YOUTH_SIZES : SIZES).map(size => {
              const active = sizes[size] !== undefined;
              return (
                <div key={size} className={`size-qty-row${active ? ' active' : ''}`}
                  onClick={() => toggleSize(size)}>
                  <span className="size-qty-label">{size}</span>
                  {active && (
                    <input
                      className="size-qty-input"
                      type="number"
                      min={0}
                      value={sizes[size]}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setSizeQty(size, e.target.valueAsNumber || 0)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Images */}
        <div className="form-group">
          <label className="form-label">Back Image (optional)</label>
          <input type="file" className="form-input add-jersey-file-input" accept="image/*"
            onChange={e => setBackFile(e.target.files[0] || null)} />
        </div>
        <div className="form-group">
          <label className="form-label">Front Image (required)</label>
          <input type="file" className="form-input add-jersey-file-input" accept="image/*"
            onChange={e => setFrontFile(e.target.files[0] || null)} />
        </div>

        {msg && <p className={`admin-msg${msg.startsWith('Error') ? ' admin-msg--warn' : ''}`}>{msg}</p>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add Jersey'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Players
// ══════════════════════════════════════════════════════════════════════════════
function PlayersTab() {
  const [teamInput,  setTeamInput]  = useState('');
  const [textarea,   setTextarea]   = useState('');
  const [teams,      setTeams]      = useState([]); // [{ id, count }]
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  const loadTeams = useCallback(async () => {
    const snap = await getDocs(collection(db, 'Players'));
    const list = snap.docs.map(d => ({
      id: d.id,
      count: (d.data().players || []).length,
    })).sort((a, b) => a.id.localeCompare(b.id));
    setTeams(list);
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const handleSave = async (e) => {
    e.preventDefault();
    const team = teamInput.trim().toUpperCase();
    if (!team) { setMsg('Team name is required.'); return; }

    const players = textarea
      .split('\n')
      .map(line => line.trim().toUpperCase())
      .filter(Boolean)
      .map(line => {
        const lastComma = line.lastIndexOf(',');
        if (lastComma === -1) return { name: line, number: '' };
        return {
          name:   line.slice(0, lastComma).trim(),
          number: line.slice(lastComma + 1).trim(),
        };
      })
      .filter(p => p.name);

    setSaving(true);
    setMsg('');
    try {
      await setDoc(doc(db, 'Players', team), { players });
      setMsg(`✓ Saved ${players.length} players for ${team}.`);
      await loadTeams();
    } catch (err) {
      console.error(err);
      setMsg('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleLoadTeam = async (teamId) => {
    const snap = await getDoc(doc(db, 'Players', teamId));
    if (!snap.exists()) return;
    const players = snap.data().players || [];
    setTeamInput(teamId);
    setTextarea(players.map(p => `${p.name}, ${p.number}`).join('\n'));
  };

  const handleDelete = async (teamId) => {
    if (!window.confirm(`Delete all players for ${teamId}?`)) return;
    await deleteDoc(doc(db, 'Players', teamId));
    setTeams(prev => prev.filter(t => t.id !== teamId));
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Manage Players</h2>
      <p className="admin-hint">Paste one player per line as <code>NAME, NUMBER</code>. Saved to <code>Players/{'{team}'}</code>.</p>

      <form onSubmit={handleSave} className="admin-form" style={{ maxWidth: 560 }}>
        <div className="form-group">
          <label className="form-label">Team Name</label>
          <input className="form-input" value={teamInput}
            onChange={e => setTeamInput(e.target.value.toUpperCase())}
            placeholder="e.g. ARSENAL" />
        </div>
        <div className="form-group">
          <label className="form-label">Players (NAME, NUMBER per line)</label>
          <textarea
            className="form-input players-textarea"
            rows={10}
            value={textarea}
            onChange={e => setTextarea(e.target.value.toUpperCase())}
            placeholder={"RONALDO, 7\nMESSI, 10\nMBAPÉ, 9"}
          />
        </div>

        {msg && <p className={`admin-msg${msg.startsWith('Error') ? ' admin-msg--warn' : ''}`}>{msg}</p>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Players'}
        </button>
      </form>

      {teams.length > 0 && (
        <>
          <h2 className="admin-section-title" style={{ marginTop: 40 }}>Saved Teams</h2>
          <table className="admin-table">
            <thead>
              <tr><th>Team</th><th>Players</th><th></th></tr>
            </thead>
            <tbody>
              {teams.map(t => (
                <tr key={t.id}>
                  <td>
                    <button className="players-team-link" onClick={() => handleLoadTeam(t.id)}>
                      {t.id}
                    </button>
                  </td>
                  <td>{t.count}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Tracking
// ══════════════════════════════════════════════════════════════════════════════
function TrackingTab() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'tracking'), orderBy('completedAt', 'desc')));
    setDeliveries(snap.docs.map(d => ({ id: d.id, trackingURL: '', ...d.data() })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = (id, field, value) =>
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));

  const handleSend = async (delivery) => {
    if (!delivery.trackingURL.trim()) {
      alert('Please enter a tracking URL before sending.');
      return;
    }
    await addDoc(collection(db, 'mail'), {
      to: delivery.Email,
      cc: ADMIN_EMAIL,
      template: {
        name: 'tracking',
        data: {
          orderNumber:       delivery.orderNumber,
          DeliveryName:      delivery.DeliveryName,
          DeliveryTelNumber: delivery.DeliveryTelNumber,
          trackingURL:       delivery.trackingURL,
          Email:             delivery.Email,
        },
      },
    });
    await deleteDoc(doc(db, 'tracking', delivery.id));
    setDeliveries(prev => prev.filter(d => d.id !== delivery.id));
    alert('Tracking email sent!');
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this delivery from the list without sending?')) return;
    await deleteDoc(doc(db, 'tracking', id));
    setDeliveries(prev => prev.filter(d => d.id !== id));
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Pending Deliveries</h2>
      {deliveries.length === 0 ? (
        <p className="admin-empty">No pending deliveries.</p>
      ) : (
        <div className="tracking-list">
          {deliveries.map(d => (
            <div key={d.id} className="tracking-card">
              <div className="tracking-meta">
                <span className="tracking-order">#{d.orderNumber?.slice(-8).toUpperCase()}</span>
                <span className="tracking-name">{d.DeliveryName}</span>
                <span className="tracking-tel">{d.DeliveryTelNumber}</span>
              </div>
              <div className="tracking-fields">
                <div className="form-group">
                  <label className="form-label">Customer Email</label>
                  <input
                    className="form-input"
                    value={d.Email}
                    onChange={e => updateField(d.id, 'Email', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tracking URL</label>
                  <input
                    className="form-input"
                    placeholder="https://..."
                    value={d.trackingURL}
                    onChange={e => updateField(d.id, 'trackingURL', e.target.value)}
                  />
                </div>
              </div>
              <div className="tracking-actions">
                <button className="btn btn-primary btn-sm" onClick={() => handleSend(d)}>
                  Send Tracking Email
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(d.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Promo Codes
// ══════════════════════════════════════════════════════════════════════════════
function PromosTab() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');

  const [codes,       setCodes]       = useState([]);
  const [codesLoading, setCodesLoading] = useState(true);

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    const snap = await getDocs(collection(db, 'PromoCodes'));
    setCodes(snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.Code || '').localeCompare(b.Code || '')));
    setCodesLoading(false);
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setMsg('');
    const target = email.trim().toLowerCase();
    if (!target) return;
    setLoading(true);

    const existing = await getDocs(query(collection(db, 'PromoCodes'), where('Email', '==', target)));
    if (!existing.empty) {
      setMsg(`⚠ ${target} already has a promo code: ${existing.docs[0].data().Code}`);
      setLoading(false);
      return;
    }

    const code = genPromoCode();
    await addDoc(collection(db, 'PromoCodes'), {
      Code: code, Description: '$50 OFF', Price: 50, Quantity: 1, Email: target,
    });
    await addDoc(collection(db, 'mail'), {
      to: target,
      cc: ADMIN_EMAIL,
      template: { name: 'promocode', data: { promocode: code } },
    });
    setMsg(`✓ Promo code ${code} sent to ${target}`);
    setEmail('');
    loadCodes();
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this promo code?')) return;
    await deleteDoc(doc(db, 'PromoCodes', id));
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Issue Promo Code</h2>
      <form onSubmit={handleGenerate} className="admin-form">
        <div className="form-group">
          <label className="form-label">Customer Email</label>
          <input
            className="form-input"
            type="email"
            required
            placeholder="customer@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        {msg && <p className={`admin-msg${msg.startsWith('⚠') ? ' admin-msg--warn' : ''}`}>{msg}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? 'Generating…' : 'Generate & Send ($50 OFF)'}
        </button>
      </form>

      <h2 className="admin-section-title" style={{ marginTop: 40 }}>All Promo Codes</h2>
      {codesLoading ? <div className="spinner" /> : (
        <table className="admin-table">
          <thead>
            <tr><th>Code</th><th>Description</th><th>Value</th><th>Qty Left</th><th>Email</th><th></th></tr>
          </thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.id}>
                <td><code>{c.Code}</code></td>
                <td>{c.Description}</td>
                <td>TT${c.Price}</td>
                <td>{c.Quantity}</td>
                <td>{c.Email || '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={6} className="admin-empty">No promo codes.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Discounts (BOGOF / BOGOHO / cart sale notice)
// ══════════════════════════════════════════════════════════════════════════════
function DiscountsTab() {
  const [saleType,   setSaleType]   = useState('');    // '' | 'BOGOF' | 'BOGOHO'
  const [bogoPrice,  setBogoPrice]  = useState(200);
  const [saleNotice, setSaleNotice] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  useEffect(() => {
    getDoc(doc(db, 'SiteConfig', 'global')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSaleType(d.saleType   || '');
        setBogoPrice(d.bogoPrice || 200);
        setSaleNotice(d.saleNotice || '');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await setDoc(doc(db, 'SiteConfig', 'global'), {
        saleType:   saleType   || null,
        bogoPrice:  Number(bogoPrice),
        saleNotice: saleNotice.trim(),
      }, { merge: true });
      setMsg('✓ Saved. Changes are live immediately.');
    } catch (err) {
      console.error(err);
      setMsg('Error saving — check console.');
    }
    setSaving(false);
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Cart Discounts</h2>
      <p className="admin-hint">
        Configure an automatic cart discount. The discount is applied as a separate line — item prices
        are never modified. Changes take effect immediately for all visitors.
      </p>

      <form onSubmit={handleSave} className="admin-form">

        <div className="form-group">
          <label className="form-label">Discount Type</label>
          <select
            className="form-input"
            value={saleType}
            onChange={e => setSaleType(e.target.value)}
          >
            <option value="">None — no automatic discount</option>
            <option value="BOGOF">BOGOF — Buy One Get One Free</option>
            <option value="BOGOHO">BOGOHO — Buy One Get One Half Off</option>
          </select>
        </div>

        {saleType === 'BOGOF' && (
          <div className="admin-hint discount-rule-hint">
            Items are sorted by price (highest first). In each pair the cheaper item is free.
            <br />e.g. cart [TT$300, TT$250, TT$200, TT$150] → TT$250 and TT$150 are free.
          </div>
        )}

        {saleType === 'BOGOHO' && (
          <>
            <div className="form-group">
              <label className="form-label">Minimum qualifying price (TT$)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={bogoPrice}
                onChange={e => setBogoPrice(e.target.valueAsNumber)}
              />
            </div>
            <div className="admin-hint discount-rule-hint">
              Items priced at or above TT${bogoPrice} qualify. For every 2 qualifying items,
              one gets half off (TT${(bogoPrice / 2).toFixed(2)} discount per pair).
            </div>
          </>
        )}

        <div className="form-group" style={{ marginTop: 28 }}>
          <label className="form-label">
            Topbar Notice
            <span className="label-hint"> — shown in the site header when not empty</span>
          </label>
          <input
            className="form-input"
            type="text"
            maxLength={100}
            placeholder="e.g. 🔥 Buy One Get One FREE on all jerseys!"
            value={saleNotice}
            onChange={e => setSaleNotice(e.target.value)}
          />
        </div>

        {msg && <p className={`admin-msg${msg.startsWith('Error') ? ' admin-msg--warn' : ''}`}>{msg}</p>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Sale Prices
// ══════════════════════════════════════════════════════════════════════════════
function SalePriceTab() {
  const [sport,      setSport]      = useState('Football');
  const [leagues,    setLeagues]    = useState([]);
  const [league,     setLeague]     = useState('');
  const [salePrice,  setSalePrice]  = useState(150);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState('');

  const rootCol = SPORT_COLLECTIONS[sport] || 'Leagues';

  useEffect(() => {
    setLeagues([]);
    setLeague('');
    getDocs(collection(db, rootCol)).then(snap => {
      const list = snap.docs.map(d => d.data().League || d.id).sort();
      setLeagues(list);
      if (list.length) setLeague(list[0]);
    });
  }, [rootCol]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Set sale price to TT$${salePrice} for ALL jerseys in "${league}"?`)) return;
    setLoading(true);
    setMsg('');
    let updated = 0;
    try {
      const teamsSnap = await getDocs(collection(db, rootCol, league, 'Teams'));
      for (const team of teamsSnap.docs) {
        const cutsSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts'));
        for (const cut of cutsSnap.docs) {
          const sleevesSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts', cut.id, 'Sleeves'));
          for (const sleeve of sleevesSnap.docs) {
            await updateDoc(doc(db, rootCol, league, 'Teams', team.id, 'Cuts', cut.id, 'Sleeves', sleeve.id), {
              SalePrice: Number(salePrice),
            });
            updated++;
          }
        }
      }
      setMsg(`✓ Updated ${updated} sleeve records in "${league}".`);
    } catch (err) {
      console.error(err);
      setMsg('Error updating prices — check console.');
    }
    setLoading(false);
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Bulk Sale Price Update</h2>
      <p className="admin-hint">Sets the sale price on every sleeve entry for the selected league/season.</p>
      <SportTabs sport={sport} setSport={setSport} />
      <form onSubmit={handleUpdate} className="admin-form">
        <div className="form-group">
          <label className="form-label">Year</label>
          <select className="form-input" value={league} onChange={e => setLeague(e.target.value)}>
            {leagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Sale Price (TT$)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            value={salePrice}
            onChange={e => setSalePrice(e.target.valueAsNumber)}
          />
        </div>
        {msg && <p className={`admin-msg${msg.startsWith('Error') ? ' admin-msg--warn' : ''}`}>{msg}</p>}
        <button className="btn btn-primary" disabled={loading || !league}>
          {loading ? 'Updating…' : 'Apply Sale Price'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Stock Cleanup
// ══════════════════════════════════════════════════════════════════════════════
function StockCleanupTab() {
  const [sport,    setSport]    = useState('Football');
  const [leagues,  setLeagues]  = useState([]);
  const [league,   setLeague]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState('');

  const rootCol = SPORT_COLLECTIONS[sport] || 'Leagues';

  useEffect(() => {
    setLeagues([]);
    setLeague('');
    getDocs(collection(db, rootCol)).then(snap => {
      const list = snap.docs.map(d => d.data().League || d.id).sort();
      setLeagues(list);
      if (list.length) setLeague(list[0]);
    });
  }, [rootCol]);

  const handleCleanup = async (e) => {
    e.preventDefault();
    if (!window.confirm(
      `This will permanently delete all Size documents with StockQuantity = 0 in "${league}", ` +
      `then cascade-delete any Variants / Sleeves / Cuts / Teams that are left empty.\n\nContinue?`
    )) return;

    setLoading(true);
    setMsg('');
    let deletedSizes = 0, deletedVariants = 0, deletedSleeves = 0, deletedCuts = 0, deletedTeams = 0;

    try {
      const teamsSnap = await getDocs(collection(db, rootCol, league, 'Teams'));

      for (const team of teamsSnap.docs) {
        const cutsSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts'));
        let remainingCuts = cutsSnap.docs.length;

        for (const cut of cutsSnap.docs) {
          const sleevesSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts', cut.id, 'Sleeves'));
          let remainingSleeves = sleevesSnap.docs.length;

          for (const sleeve of sleevesSnap.docs) {
            const variantsSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts', cut.id, 'Sleeves', sleeve.id, 'Variants'));
            let remainingVariants = variantsSnap.docs.length;

            for (const variant of variantsSnap.docs) {
              const sizesSnap = await getDocs(collection(db, rootCol, league, 'Teams', team.id, 'Cuts', cut.id, 'Sleeves', sleeve.id, 'Variants', variant.id, 'Sizes'));
              let remainingSizes = sizesSnap.docs.length;

              // ── 1. Delete zero-stock sizes ──────────────────────────────────
              for (const size of sizesSnap.docs) {
                if ((size.data().StockQuantity ?? 0) === 0) {
                  await deleteDoc(size.ref);
                  deletedSizes++;
                  remainingSizes--;
                }
              }

              // ── 2. Variant is now empty → delete it ─────────────────────────
              if (remainingSizes === 0) {
                await deleteDoc(variant.ref);
                deletedVariants++;
                remainingVariants--;
              }
            }

            // ── 3. Sleeve is now empty → delete it ──────────────────────────
            if (remainingVariants === 0) {
              await deleteDoc(sleeve.ref);
              deletedSleeves++;
              remainingSleeves--;
            }
          }

          // ── 4. Cut is now empty → delete it ─────────────────────────────
          if (remainingSleeves === 0) {
            await deleteDoc(cut.ref);
            deletedCuts++;
            remainingCuts--;
          }
        }

        // ── 5. Team is now empty → delete it ──────────────────────────────
        if (remainingCuts === 0) {
          await deleteDoc(team.ref);
          deletedTeams++;
        }
      }

      const parts = [];
      if (deletedSizes)    parts.push(`${deletedSizes} size${deletedSizes    !== 1 ? 's' : ''}`);
      if (deletedVariants) parts.push(`${deletedVariants} variant${deletedVariants !== 1 ? 's' : ''}`);
      if (deletedSleeves)  parts.push(`${deletedSleeves} sleeve${deletedSleeves  !== 1 ? 's' : ''}`);
      if (deletedCuts)     parts.push(`${deletedCuts} cut${deletedCuts      !== 1 ? 's' : ''}`);
      if (deletedTeams)    parts.push(`${deletedTeams} team${deletedTeams    !== 1 ? 's' : ''}`);

      setMsg(parts.length
        ? `✓ Removed: ${parts.join(', ')} from "${league}".`
        : `✓ Nothing to remove in "${league}" — all sizes already have stock.`
      );
    } catch (err) {
      console.error(err);
      setMsg('Error during cleanup — check console.');
    }
    setLoading(false);
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Remove Zero-Stock Entries</h2>
      <p className="admin-hint">
        Deletes all Size documents where <code>StockQuantity = 0</code>, then cascades up in a single
        pass to remove any Variant / Sleeve / Cut / Team that becomes empty as a result.
      </p>
      <SportTabs sport={sport} setSport={setSport} />
      <form onSubmit={handleCleanup} className="admin-form">
        <div className="form-group">
          <label className="form-label">Year</label>
          <select className="form-input" value={league} onChange={e => setLeague(e.target.value)}>
            {leagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {msg && <p className={`admin-msg${msg.startsWith('Error') ? ' admin-msg--warn' : ''}`}>{msg}</p>}
        <button className="btn btn-primary" disabled={loading || !league}>
          {loading ? 'Running…' : 'Run Cleanup'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Admin page
// ══════════════════════════════════════════════════════════════════════════════
export default function Admin() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [tab, setTab] = useState('addjersey');

  // Guard — redirect non-admins
  const isAdmin = user && !user.isAnonymous && user.email === ADMIN_EMAIL;
  useEffect(() => {
    if (user === undefined) return; // still loading
    if (!isAdmin) navigate('/');
  }, [user, isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="admin-page container page-content">
      <h1 className="admin-title">Admin</h1>

      <div className="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`admin-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'addjersey'  && <AddJerseyTab />}
      {tab === 'players'    && <PlayersTab />}
      {tab === 'tracking'   && <TrackingTab />}
      {tab === 'promos'     && <PromosTab />}
      {tab === 'discounts'  && <DiscountsTab />}
      {tab === 'sale'       && <SalePriceTab />}
      {tab === 'stock'      && <StockCleanupTab />}
    </div>
  );
}

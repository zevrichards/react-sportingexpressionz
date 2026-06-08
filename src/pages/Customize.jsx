import { useEffect, useReducer, useCallback, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db, GlobalJerseyPrice, FONT_MAP, DEFAULT_FONT, SPORT_COLLECTIONS } from '../config/firebase';
import { useCart } from '../context/CartContext';
import JerseyPreview from '../components/JerseyPreview';
import './Customize.css';

const initialState = {
  league: '', team: '', cut: '', sleeve: '', variant: '', size: '',
  playerName: 'ANY NAME', playerNumber: '00', playerNote: '',
  customizeEnabled: false,
  leagueOptions:   [],
  teamOptions: [], cutOptions: [], sleeveOptions: [], variantOptions: [],
  // sizeOptions: [{ value, label, stockQty }]
  sizeOptions: [],
  salePrice:   undefined,
  stockQty:    null,   // stock for the currently selected size
  imgFront: '',
  imgBack:  '',
  fontColor:    null,   // from variant doc (FontColor field)
  namePosition: null,   // from variant doc (NamePosition field)
  loading:  true,
  addedMsg: false,
  relatedJerseys: [],   // same team in other leagues
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, ...action.payload };
    default:    return state;
  }
}

function SelectField({ label, value, options, onChange, disabled }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="select-wrapper">
        <select
          className="form-select"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || options.length === 0}
        >
          {options.map(o => (
            <option
              key={o.value}
              value={o.value}
              disabled={false}
            >
              {o.label}{o.stockQty === 0 ? ' — Out of Stock' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Single cascading loader ───────────────────────────────────────────────────
async function loadCascade(rootCol, league, team = null, cut = null, sleeve = null) {
  // 1. Teams
  const teamSnap   = await getDocs(collection(db, rootCol, league, 'Teams'));
  const teamOptions = teamSnap.docs.map(d => ({ value: d.data().Team || d.id, label: d.data().Team || d.id }));
  const resolvedTeam = team && teamOptions.some(o => o.value === team)
    ? team : teamOptions[teamOptions.length - 1]?.value || '';

  // 2. Cuts
  const cutSnap   = await getDocs(collection(db, rootCol, league, 'Teams', resolvedTeam, 'Cuts'));
  const cutOptions = cutSnap.docs.map(d => ({ value: d.data().Cut, label: d.data().Cut }));
  const resolvedCut = cut && cutOptions.some(o => o.value === cut)
    ? cut : cutOptions[cutOptions.length - 1]?.value || '';

  // 3. Sleeves
  const sleeveSnap   = await getDocs(
    collection(db, rootCol, league, 'Teams', resolvedTeam, 'Cuts', resolvedCut, 'Sleeves')
  );
  const sleeveOptions = sleeveSnap.docs.map(d => ({
    value: d.data().Sleeve, label: d.data().Sleeve, salePrice: d.data().SalePrice,
  }));
  const resolvedSleeve = sleeve && sleeveOptions.some(o => o.value === sleeve)
    ? sleeve : sleeveOptions[sleeveOptions.length - 1]?.value || '';
  const salePrice = sleeveOptions.find(o => o.value === resolvedSleeve)?.salePrice;

  // 4. Variants
  const variantSnap   = await getDocs(
    collection(db, rootCol, league, 'Teams', resolvedTeam, 'Cuts', resolvedCut, 'Sleeves', resolvedSleeve, 'Variants')
  );
  const variantOptions = variantSnap.docs.map(d => ({ value: d.data().Variant, label: d.data().Variant }));
  const resolvedVariant = variantOptions[0]?.value || '';

  // 5. Sizes + images + overlay config from the resolved Variant doc
  let sizeOptions  = [];
  let imgFront     = '';
  let imgBack      = '';
  let fontColor    = null;
  let namePosition = null;
  if (resolvedVariant) {
    const variantDoc = variantSnap.docs.find(d => d.data().Variant === resolvedVariant);
    if (variantDoc) {
      const vd      = variantDoc.data();
      imgFront      = vd.JerseyImgFront  || '';
      imgBack       = vd.JerseyImgBack   || '';
      fontColor     = vd.FontColor       || null;
      namePosition  = vd.NamePosition    || null;
      const sizeSnap = await getDocs(collection(variantDoc.ref, 'Sizes'));
      sizeOptions = sizeSnap.docs.map(d => ({
        value:    d.data().Size,
        label:    d.data().Size,
        stockQty: d.data().StockQuantity ?? 0,
      }));
    }
  }

  const firstSize  = sizeOptions[0];
  return {
    teamOptions, team: resolvedTeam,
    cutOptions,  cut:  resolvedCut,
    sleeveOptions, sleeve: resolvedSleeve, salePrice,
    variantOptions, variant: resolvedVariant,
    sizeOptions,
    size:     firstSize?.value || '',
    stockQty: firstSize?.stockQty ?? null,
    imgFront, imgBack, fontColor, namePosition,
  };
}

// ── Load same team in other leagues (related jerseys) ────────────────────────
async function loadRelated(rootCol, currentLeague, team) {
  if (!team) return [];
  try {
    const leagueSnap   = await getDocs(collection(db, rootCol));
    const otherLeagues = leagueSnap.docs
      .map(d => d.data().League || d.id)
      .filter(l => l !== currentLeague)
      .slice(0, 8); // cap to avoid too many parallel requests

    // Fetch all leagues in parallel
    const settled = await Promise.allSettled(
      otherLeagues.map(async (league) => {
        const teamSnap = await getDocs(collection(db, rootCol, league, 'Teams'));
        const teamDoc  = teamSnap.docs.find(d => (d.data().Team || d.id) === team);
        if (!teamDoc) return null;

        const cutSnap = await getDocs(collection(db, rootCol, league, 'Teams', team, 'Cuts'));
        if (!cutSnap.docs.length) return null;
        const cut = cutSnap.docs[0].data().Cut;

        const sleeveSnap = await getDocs(collection(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves'));
        if (!sleeveSnap.docs.length) return null;
        const sleeve = sleeveSnap.docs[0].data().Sleeve;

        const variantSnap = await getDocs(collection(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves', sleeve, 'Variants'));
        if (!variantSnap.docs.length) return null;
        const vd = variantSnap.docs[0].data();

        return { league, team, cut, sleeve, variant: vd.Variant, imgFront: vd.JerseyImgFront || '' };
      })
    );

    return settled
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .slice(0, 4);
  } catch (_) { return []; }
}

// ── Load players for a given team from the global Players collection ──────────
async function loadPlayers(team) {
  if (!team) return [];
  try {
    const snap = await getDoc(doc(db, 'Players', team));
    if (snap.exists()) return snap.data().players || [];
  } catch (_) { /* ignore */ }
  return [];
}

export default function Customize() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const set = useCallback((payload) => dispatch({ type: 'SET', payload }), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate          = useNavigate();
  const { addItem }    = useCart();
  const [playerOptions, setPlayerOptions] = useState([]);

  const sport   = searchParams.get('sport') || 'Football';
  const rootCol = SPORT_COLLECTIONS[sport] || 'Leagues';

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    set({ loading: true });

    async function init() {
      const lgSnap = await getDocs(collection(db, rootCol));
      const leagueOptions = lgSnap.docs.map(d => ({
        value: d.data().League || d.id,
        label: d.data().League || d.id,
      }));

      const urlLeague  = searchParams.get('league');
      const urlTeam    = searchParams.get('team');
      const urlCut     = searchParams.get('cut');
      const urlSleeve  = searchParams.get('sleeve');
      const urlVariant = searchParams.get('variant');
      const urlSize    = searchParams.get('size');

      const startLeague = urlLeague && leagueOptions.some(o => o.value === urlLeague)
        ? urlLeague : leagueOptions[0]?.value || '';

      if (!startLeague) { set({ leagueOptions, loading: false }); return; }

      const cascade = await loadCascade(rootCol, startLeague, urlTeam, urlCut, urlSleeve);

      // Load players + related jerseys for the resolved team
      const resolvedTeam = urlTeam || cascade.team;
      const sizeMatch = urlSize && cascade.sizeOptions.find(o => o.value === urlSize);

      // Show the jersey immediately — don't wait for players or related jerseys
      set({
        leagueOptions, league: startLeague,
        ...cascade,
        ...(urlVariant ? { variant: urlVariant } : {}),
        ...(sizeMatch  ? { size: sizeMatch.value, stockQty: sizeMatch.stockQty ?? null } : {}),
        loading: false,
      });

      // Load players + related jerseys in the background
      const [players, relatedJerseys] = await Promise.all([
        loadPlayers(resolvedTeam),
        loadRelated(rootCol, startLeague, resolvedTeam),
      ]);
      setPlayerOptions(players);
      set({ relatedJerseys });
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootCol]);

  // ── Sync URL whenever selection changes ───────────────────────────────────
  useEffect(() => {
    if (state.loading || !state.league) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);  // preserves sport= if present
      if (state.league)  next.set('league',  state.league);  else next.delete('league');
      if (state.team)    next.set('team',    state.team);    else next.delete('team');
      if (state.cut)     next.set('cut',     state.cut);     else next.delete('cut');
      if (state.sleeve)  next.set('sleeve',  state.sleeve);  else next.delete('sleeve');
      if (state.variant) next.set('variant', state.variant); else next.delete('variant');
      if (state.size)    next.set('size',    state.size);    else next.delete('size');
      return next;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.league, state.team, state.cut, state.sleeve, state.variant, state.size, state.loading]);

  // ── League change ─────────────────────────────────────────────────────────
  const handleLeagueChange = useCallback(async (val) => {
    set({ league: val, loading: true });
    const cascade = await loadCascade(rootCol, val);
    const players = await loadPlayers(cascade.team);
    setPlayerOptions(players);
    set({ ...cascade, loading: false });
  }, [set, rootCol]);

  // ── Team change ───────────────────────────────────────────────────────────
  const handleTeamChange = useCallback(async (val) => {
    set({ team: val, loading: true });
    const cascade = await loadCascade(rootCol, state.league, val);
    set({ ...cascade, relatedJerseys: [], loading: false });

    // Players + related load in the background
    const [players, relatedJerseys] = await Promise.all([
      loadPlayers(val),
      loadRelated(rootCol, state.league, val),
    ]);
    setPlayerOptions(players);
    set({ relatedJerseys });
  }, [set, rootCol, state.league]);

  // ── Cut change ────────────────────────────────────────────────────────────
  const handleCutChange = useCallback(async (val) => {
    set({ cut: val, loading: true });
    const cascade = await loadCascade(rootCol, state.league, state.team, val);
    set({ ...cascade, loading: false });
  }, [set, rootCol, state.league, state.team]);

  // ── Sleeve change ─────────────────────────────────────────────────────────
  const handleSleeveChange = useCallback(async (val) => {
    const salePrice = state.sleeveOptions.find(o => o.value === val)?.salePrice;
    set({ sleeve: val, salePrice, loading: true });

    const variantSnap = await getDocs(
      collection(db, rootCol, state.league, 'Teams', state.team, 'Cuts', state.cut, 'Sleeves', val, 'Variants')
    );
    const variantOptions = variantSnap.docs.map(d => ({ value: d.data().Variant, label: d.data().Variant }));
    const firstVariant   = variantOptions[0]?.value || '';

    let sizeOptions  = [];
    let imgFront     = '';
    let imgBack      = '';
    let fontColor    = null;
    let namePosition = null;
    if (firstVariant) {
      const variantDoc = variantSnap.docs.find(d => d.data().Variant === firstVariant);
      if (variantDoc) {
        const vd      = variantDoc.data();
        imgFront      = vd.JerseyImgFront  || '';
        imgBack       = vd.JerseyImgBack   || '';
        fontColor     = vd.FontColor       || null;
        namePosition  = vd.NamePosition    || null;
        const sizeSnap = await getDocs(collection(variantDoc.ref, 'Sizes'));
        sizeOptions = sizeSnap.docs.map(d => ({
          value: d.data().Size, label: d.data().Size,
          stockQty: d.data().StockQuantity ?? 0,
        }));
      }
    }

    const firstSize = sizeOptions[0];
    set({
      variantOptions, variant: firstVariant,
      sizeOptions,
      size:     firstSize?.value || '',
      stockQty: firstSize?.stockQty ?? null,
      imgFront, imgBack, fontColor, namePosition, loading: false,
    });
  }, [set, rootCol, state.league, state.team, state.cut, state.sleeveOptions]);

  // ── Variant change ────────────────────────────────────────────────────────
  const handleVariantChange = useCallback(async (val) => {
    set({ variant: val, loading: true });
    const variantSnap = await getDocs(
      collection(db, rootCol, state.league, 'Teams', state.team, 'Cuts', state.cut, 'Sleeves', state.sleeve, 'Variants')
    );
    const variantDoc = variantSnap.docs.find(d => d.data().Variant === val);
    let sizeOptions  = [];
    let imgFront     = '';
    let imgBack      = '';
    let fontColor    = null;
    let namePosition = null;
    if (variantDoc) {
      const vd      = variantDoc.data();
      imgFront      = vd.JerseyImgFront || '';
      imgBack       = vd.JerseyImgBack  || '';
      fontColor     = vd.FontColor      || null;
      namePosition  = vd.NamePosition   || null;
      const sizeSnap = await getDocs(collection(variantDoc.ref, 'Sizes'));
      sizeOptions = sizeSnap.docs.map(d => ({
        value: d.data().Size, label: d.data().Size,
        stockQty: d.data().StockQuantity ?? 0,
      }));
    }
    const firstSize = sizeOptions[0];
    set({
      sizeOptions,
      size:     firstSize?.value || '',
      stockQty: firstSize?.stockQty ?? null,
      imgFront, imgBack, fontColor, namePosition, loading: false,
    });
  }, [set, rootCol, state.league, state.team, state.cut, state.sleeve]);

  // ── Size change ───────────────────────────────────────────────────────────
  const handleSizeChange = useCallback((val) => {
    const sizeObj = state.sizeOptions.find(o => o.value === val);
    set({ size: val, stockQty: sizeObj?.stockQty ?? null });
  }, [set, state.sizeOptions]);

  // ── Name / number input ───────────────────────────────────────────────────
  const handleNameChange   = (e) => set({ playerName:   e.target.value.toUpperCase().replace(/[^A-Z0-9 .''-]/g, '').slice(0, 12) });
  const handleNumberChange = (e) => set({ playerNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) });

  const fontConfig      = FONT_MAP[state.team] ?? DEFAULT_FONT;
  const notCustomizable = ['Badges and Patches', 'Inter Miami'].includes(state.team);

  // ── Price ─────────────────────────────────────────────────────────────────
  const PRINT_FEE = 100; // added when name & number print is enabled

  // Full (non-sale) price based on cut — always used as the crossed-out original
  const jerseyPrice = (() => {
    if (state.league === 'Your Custom Jersey')         return GlobalJerseyPrice.Custom;
    const c = state.cut.toLowerCase();
    if (c.includes('youth'))                           return GlobalJerseyPrice.Youth;
    if (c.includes('womens') || c.includes("women's")) return GlobalJerseyPrice.Womens;
    if (c.includes('long'))                            return GlobalJerseyPrice.MensLong;
    return GlobalJerseyPrice.MensShort;
  })();

  // Effective base price — sale price when available, otherwise full price
  const basePrice  = state.salePrice ?? jerseyPrice;

  const printEnabled = state.customizeEnabled && !notCustomizable;
  const finalPrice   = basePrice + (printEnabled ? PRINT_FEE : 0);

  const isOutOfStock = state.stockQty !== null && state.stockQty === 0;

  // ── Add to cart ───────────────────────────────────────────────────────────
  const handleAddToCart = async () => {
    if (!state.size) return;
    await addItem({
      League: state.league, Team: state.team,
      Cut: state.cut, Sleeve: state.sleeve, Variant: state.variant, Size: state.size,
      PlayerName:    state.customizeEnabled ? state.playerName   : '',
      PlayerNumber:  state.customizeEnabled ? state.playerNumber : '',
      PlayerNote:    state.playerNote,
      Price:         finalPrice,
      isOutOfStock,
      JerseyImgFront: state.imgFront,
      JerseyImgBack:  state.imgBack,
    });
    set({ addedMsg: true });
    setTimeout(() => set({ addedMsg: false }), 3000);
  };

  const handleRelatedClick = useCallback(async (r) => {
    // Update the URL immediately (for sharing / back-button)
    const params = new URLSearchParams();
    if (sport !== 'Football') params.set('sport', sport);
    params.set('league',  r.league);
    params.set('team',    r.team);
    params.set('cut',     r.cut);
    params.set('sleeve',  r.sleeve);
    params.set('variant', r.variant);
    navigate(`/customize?${params.toString()}`, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Load data directly — do not rely on init effect re-running
    set({ loading: true, relatedJerseys: [] });
    const cascade = await loadCascade(rootCol, r.league, r.team, r.cut, r.sleeve);
    set({
      league: r.league,
      leagueOptions: state.leagueOptions,
      ...cascade,
      loading: false,
    });

    // Players + related load in the background
    const [players, relatedJerseys] = await Promise.all([
      loadPlayers(r.team),
      loadRelated(rootCol, r.league, r.team),
    ]);
    setPlayerOptions(players);
    set({ relatedJerseys });
  }, [set, rootCol, sport, navigate, state.leagueOptions]);

  return (
    <div className="customize-page container page-content">
      <div className="customize-layout">

        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div className="preview-col">
          <JerseyPreview
            league={state.league}  team={state.team}
            cut={state.cut}        sleeve={state.sleeve}  variant={state.variant}
            rootCol={rootCol}
            fontColor={state.fontColor}
            namePosition={state.namePosition}
            playerName={state.customizeEnabled   ? state.playerName   : ''}
            playerNumber={state.customizeEnabled ? state.playerNumber : ''}
          />
        </div>

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div className="controls-col">
          <div className="controls-header">
            <div className="controls-title-row">
              <h1 className="controls-title">{state.team || 'Custom Jersey'}</h1>
              {state.variant && (
                <button
                  className="share-btn"
                  title="Copy share link"
                  onClick={() => {
                    const url = `${window.location.origin}/og/customize${window.location.search}`;
                    navigator.clipboard.writeText(url).then(() => {
                      const btn = document.activeElement;
                      const orig = btn.textContent;
                      btn.textContent = 'Copied!';
                      setTimeout(() => { btn.textContent = orig; }, 1800);
                    });
                  }}
                >
                  🔗 Share
                </button>
              )}
            </div>
            <div className="price-display">
              {state.salePrice ? (
                <>
                  <span className="price-sale">${state.salePrice}</span>
                  <span className="price-original">${jerseyPrice}</span>
                </>
              ) : (
                <span>${jerseyPrice}</span>
              )}
              {printEnabled && (
                <span className="print-fee-badge">+${PRINT_FEE} print = <strong>${finalPrice}</strong></span>
              )}
            </div>
          </div>

          <hr className="divider" />

          {state.loading ? (
            <div className="spinner" />
          ) : (
            <>
              <div className="selects-grid">
                <SelectField label="Year"    value={state.league}  options={state.leagueOptions}  onChange={handleLeagueChange} />
                <SelectField label="Team"    value={state.team}    options={state.teamOptions}    onChange={handleTeamChange} />
                <SelectField label="Cut"     value={state.cut}     options={state.cutOptions}     onChange={handleCutChange} />
                <SelectField label="Sleeve"  value={state.sleeve}  options={state.sleeveOptions}  onChange={handleSleeveChange} />
                <SelectField label="Variant" value={state.variant} options={state.variantOptions} onChange={handleVariantChange} />
                <SelectField label="Size"    value={state.size}    options={state.sizeOptions}    onChange={handleSizeChange} />
              </div>

              {/* Stock info */}
              {state.stockQty !== null && (
                <p className={`stock-info${state.stockQty === 0 ? ' stock-zero' : ''}`}>
                  {state.stockQty > 0
                    ? `${state.stockQty} left in stock`
                    : 'Out of Stock for this size'}
                </p>
              )}

              {/* Out-of-stock notice */}
              {isOutOfStock && (
                <div className="notice notice-warning">
                  <strong>This item is currently out of stock.</strong> Please allow 3–4 weeks
                  for delivery. An additional <strong>$70 shipping fee</strong> will be applied
                  to this order. SportingExpressionz cannot guarantee shipping times due to
                  congested global shipping lanes and customs delays.
                </div>
              )}

              {!notCustomizable && (
                <div className="customize-section">
                  <label className="toggle-label">
                    <input type="checkbox" checked={state.customizeEnabled}
                      onChange={e => set({ customizeEnabled: e.target.checked })} />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                    <span>Add Name &amp; Number Print</span>
                  </label>

                  {state.customizeEnabled && (
                    <div className="name-number-inputs">
                      {/* Quick fill from Players collection */}
                      {playerOptions.length > 0 && (
                        <div className="form-group">
                          <label className="form-label">Quick fill</label>
                          <select className="form-select" defaultValue=""
                            onChange={e => {
                              const p = playerOptions.find(p => p.name === e.target.value);
                              if (p) set({ playerName: p.name, playerNumber: p.number });
                            }}>
                            <option value="" disabled>— Select player —</option>
                            {playerOptions.map(p => (
                              <option key={p.name} value={p.name}>{p.name} #{p.number}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="form-group">
                        <label className="form-label">Player Name <span className="label-hint">(max 12 chars)</span></label>
                        <input type="text" className="form-input" value={state.playerName}
                          onChange={handleNameChange} placeholder="ANY NAME" maxLength={12} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Number</label>
                        <input type="text" className="form-input" value={state.playerNumber}
                          onChange={handleNumberChange} placeholder="00" maxLength={2} />
                      </div>
                      <div className="form-group name-note">
                        <label className="form-label">Special Instructions <span className="label-hint">(optional)</span></label>
                        <input type="text" className="form-input" value={state.playerNote}
                          onChange={e => set({ playerNote: e.target.value })}
                          placeholder="e.g. specific font, patch requests…" maxLength={100} />
                      </div>
                      <div className="font-preview-label">
                        Preview font: <strong>{fontConfig.fontFamily}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="add-to-cart-area">
                {!state.size && <p className="no-size-msg">Select a size to continue</p>}
                <button
                  className="btn btn-green btn-full add-cart-btn"
                  onClick={handleAddToCart}
                  disabled={!state.size}
                >
                  Add to Cart — ${finalPrice}{isOutOfStock ? ' + $70 shipping' : ''}
                </button>
                {state.addedMsg && <p className="added-msg">✓ Added to cart!</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Related jerseys ───────────────────────────────────────────── */}
      {state.relatedJerseys.length > 0 && (
        <div className="related-section">
          <h2 className="related-title">You may also be interested in</h2>
          <div className="related-grid">
            {state.relatedJerseys.map(r => (
              <button
                key={r.league}
                className="related-card"
                onClick={() => handleRelatedClick(r)}
              >
                {r.imgFront
                  ? <img src={r.imgFront} alt={`${r.team} ${r.league}`} className="related-img" />
                  : <div className="related-img-placeholder" />
                }
                <div className="related-info">
                  <span className="related-team">{r.team}</span>
                  <span className="related-league">{r.league}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

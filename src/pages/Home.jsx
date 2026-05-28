import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db, GlobalJerseyPrice, SPORT_COLLECTIONS } from '../config/firebase';
import './Home.css';

function calcPrice(cut, salePrice) {
  if (salePrice) return salePrice;
  const c = (cut || '').toLowerCase();
  if (c.includes('youth'))                            return GlobalJerseyPrice.Youth;
  if (c.includes('womens') || c.includes("women's")) return GlobalJerseyPrice.Womens;
  if (c.includes('long'))                             return GlobalJerseyPrice.MensLong;
  return GlobalJerseyPrice.MensShort;
}

const BATCH_SIZE   = 3;
const CUT_ORDER    = ['Mens', 'Womens', 'Youth'];
const SLEEVE_ORDER = ['Short', 'Long'];
const SIZE_ORDER   = ['XXS','XS','S','M','L','XL','XXL','XXXL','Any'];

// These (league, team) pairs always load first and are never hidden by the
// in-stock filter — they are print-on-demand and carry no StockQuantity.
const PRIORITY_TEAMS = [
  { league: 'Your Custom Jersey', team: 'Name+Number Print' },
];
const isPriorityTeam = ({ league, team }) =>
  PRIORITY_TEAMS.some(p => p.league === league && p.team === team);

const SPORTS = [
  { key: 'Football',   label: 'Football',    emoji: '⚽' },
  { key: 'F1',         label: 'F1',          emoji: '🏎️' },
  { key: 'Basketball', label: 'Basketball',  emoji: '🏀' },
];

// ── Phase 1: load jersey structure only (fast — no Sizes reads) ───────────
async function loadTeamJerseys(rootCol, league, team) {
  const jerseys = [];
  const cutSnap = await getDocs(collection(db, rootCol, league, 'Teams', team, 'Cuts'));

  await Promise.all(cutSnap.docs.map(async cutDoc => {
    const cut = cutDoc.data().Cut;
    const sleeveSnap = await getDocs(
      collection(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves')
    );

    await Promise.all(sleeveSnap.docs.map(async sleeveDoc => {
      const sleeve    = sleeveDoc.data().Sleeve;
      const salePrice = sleeveDoc.data().SalePrice;
      const variantSnap = await getDocs(
        collection(db, rootCol, league, 'Teams', team, 'Cuts', cut, 'Sleeves', sleeve, 'Variants')
      );

      variantSnap.docs.forEach(vd => {
        jerseys.push({
          league, team, cut, sleeve,
          variant:        vd.data().Variant,
          imgFront:       vd.data().JerseyImgFront,
          price:          calcPrice(cut, salePrice || undefined),
          salePrice:      salePrice || undefined,
          totalStock:     null,   // populated in phase 2
          hasStock:       null,   // null = "not yet known" — never filtered out
          availableSizes: [],
          id: `${league}-${team}-${cut}-${sleeve}-${vd.data().Variant}`,
          _variantRef:    vd.ref, // used by phase 2 only
        });
      });
    }));
  }));

  return jerseys;
}

// ── Phase 2: hydrate stock info in the background ─────────────────────────
async function loadStockInfo(jerseys) {
  return Promise.all(jerseys.map(async j => {
    const sizeSnap       = await getDocs(collection(j._variantRef, 'Sizes'));
    const sizes          = sizeSnap.docs.map(sd => sd.data());
    const totalStock     = sizes.reduce((s, d) => s + (d.StockQuantity || 0), 0);
    return {
      ...j,
      totalStock,
      hasStock:       totalStock > 0,
      availableSizes: sizes.map(d => d.Size).filter(Boolean),
    };
  }));
}

// ── Jersey card ───────────────────────────────────────────────────────────────
function JerseyCard({ sport, league, team, cut, sleeve, variant, imgFront, price, salePrice, hasStock, availableSizes }) {
  const navigate = useNavigate();
  const params   = new URLSearchParams({ sport, league, team, cut, sleeve, variant });
  return (
    <div className="jersey-card" onClick={() => navigate(`/customize?${params}`)}>
      <div className="card-img-wrap">
        {imgFront
          ? <img src={imgFront} alt={`${team} ${cut}`} loading="lazy" />
          : <div className="card-img-placeholder">⚽</div>}
        <div className="card-hover-overlay"><span>Customize</span></div>
        {hasStock && <span className="badge badge-stock">In Stock</span>}
      </div>
      <div className="card-body">
        <p className="card-league">{league}</p>
        <h3 className="card-title">{team}</h3>
        <p className="card-details">{cut} · {sleeve} · {variant}</p>
        {availableSizes?.length > 0 && (
          <p className="card-sizes">{availableSizes.join(' · ')}</p>
        )}
        <div className="card-price">
          {salePrice ? (
            <>
              <span className="price-sale">${salePrice}</span>
              <span className="price-original">${calcPrice(cut)}</span>
              <span className="badge badge-sale">Sale</span>
            </>
          ) : (
            <span>${price}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter chip button ────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button className={`filter-btn${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Home() {
  const [leagues,       setLeagues]       = useState([]);
  // teamsByLeague: { leagueName: [{ name, tags }] }
  const [teamsByLeague, setTeamsByLeague] = useState({});
  const [jerseys,       setJerseys]       = useState([]);
  const [cursor,        setCursor]        = useState(0);
  const [initLoading,   setInitLoading]   = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [hasMore,       setHasMore]       = useState(true);

  // In-stock filter — defaults to on
  const [inStockOnly, setInStockOnly] = useState(false);

  // Local input state — debounced to URL
  const [searchInput, setSearchInput] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const sport          = searchParams.get('sport') || 'Football';
  const rootCol        = SPORT_COLLECTIONS[sport] || 'Leagues';
  const selectedLeague = searchParams.get('league') || '';
  const searchQuery    = searchParams.get('search') || '';
  const selectedCut    = searchParams.get('cut')    || '';
  const selectedSleeve = searchParams.get('sleeve') || '';
  const selectedSize   = searchParams.get('size')   || '';

  const sentinelRef   = useRef(null);
  const generationRef = useRef(0);
  const debounceRef   = useRef(null); // kept so clearAll can cancel it immediately

  // Sync URL search → local input on first render / URL navigation
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps — run only when URL changes externally

  // ── Debounce: update URL after 300 ms of no typing ───────────────────────
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (searchInput.trim()) next.set('search', searchInput.trim());
        else next.delete('search');
        return next;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── Parse search terms (comma-separated) ─────────────────────────────────
  const searchTerms = useMemo(() =>
    searchQuery.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  [searchQuery]);

  // ── Build ordered queue from teamsByLeague + current filters ─────────────
  const queue = useMemo(() => {
    const q = [];
    for (const league of leagues) {
      if (selectedLeague && league !== selectedLeague) continue;
      const teams = teamsByLeague[league] || [];
      for (const teamObj of teams) {
        const name   = teamObj.name;
        const tags   = teamObj.tags || [];
        if (searchTerms.length > 0) {
          const nameLc = name.toLowerCase();
          const tagsLc = tags.map(t => t.toLowerCase());
          const match  = searchTerms.some(term =>
            nameLc.includes(term) || tagsLc.some(tag => tag.includes(term))
          );
          if (!match) continue;
        }
        q.push({ league, team: name });
      }
    }
    // Lift priority entries to the front, then everything else.
    return [...q.filter(isPriorityTeam), ...q.filter(e => !isPriorityTeam(e))];
  }, [leagues, teamsByLeague, selectedLeague, searchTerms]);

  // ── Derive available filter values from loaded jerseys ───────────────────
  const availableCuts = useMemo(() =>
    [...new Set(jerseys.map(j => j.cut))].sort(), [jerseys]);
  const availableSleeves = useMemo(() =>
    [...new Set(jerseys.map(j => j.sleeve))].sort(), [jerseys]);
  const availableSizes = useMemo(() => {
    const s = new Set();
    jerseys.forEach(j => j.availableSizes?.forEach(sz => s.add(sz)));
    // Sort by conventional size order
    const order = ['XXS','XS','S','M','L','XL','XXL','XXXL','Any'];
    return [...s].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [jerseys]);

  // ── Apply display-only filters (cut/sleeve/size/stock) ──────────────────
  const visibleJerseys = useMemo(() =>
    jerseys.filter(j => {
      // hasStock === null means stock info is still loading — never hide those cards.
      // Priority (print-on-demand) teams are always shown regardless of toggle.
      if (inStockOnly && j.hasStock === false && !isPriorityTeam(j)) return false;
      if (selectedCut    && j.cut    !== selectedCut)                  return false;
      if (selectedSleeve && j.sleeve !== selectedSleeve)               return false;
      if (selectedSize   && !j.availableSizes?.includes(selectedSize)) return false;
      return true;
    }),
  [jerseys, inStockOnly, selectedCut, selectedSleeve, selectedSize]);

  // ── Load a batch starting at fromCursor ──────────────────────────────────
  const loadBatch = useCallback(async (fromCursor, currentQueue, gen, currentRootCol) => {
    const slice = currentQueue.slice(fromCursor, fromCursor + BATCH_SIZE);
    if (slice.length === 0) { setHasMore(false); setLoadingMore(false); return; }

    // Phase 1 — structure only; cards appear immediately
    const results = await Promise.all(slice.map(({ league, team }) => loadTeamJerseys(currentRootCol, league, team)));
    if (generationRef.current !== gen) return;
    const flat = results.flat();
    setJerseys(prev => [...prev, ...flat]);
    setCursor(fromCursor + slice.length);
    setHasMore(fromCursor + slice.length < currentQueue.length);
    setLoadingMore(false);

    // Phase 2 — hydrate stock info in the background; cards update in place
    const withStock = await loadStockInfo(flat);
    if (generationRef.current !== gen) return;
    setJerseys(prev => {
      const stockById = Object.fromEntries(withStock.map(j => [j.id, j]));
      return prev.map(j => stockById[j.id] ?? j);
    });
  }, []);

  // ── 1. Initial load: leagues + team metadata (re-runs when sport changes) ─
  useEffect(() => {
    setInitLoading(true);
    setJerseys([]);
    setLeagues([]);
    setTeamsByLeague({});
    setCursor(0);
    generationRef.current++; // invalidate any in-flight loadBatch calls

    async function init() {
      const lgSnap = await getDocs(collection(db, rootCol));
      const lgList = lgSnap.docs.map(d => d.data().League || d.id);
      setLeagues(lgList);

      const entries = await Promise.all(
        lgSnap.docs.map(async lgDoc => {
          const league   = lgDoc.data().League || lgDoc.id;
          const teamSnap = await getDocs(collection(db, rootCol, league, 'Teams'));
          const teams    = teamSnap.docs.map(d => ({
            name: d.data().Team || d.id,
            tags: d.data().Tags || [],   // Tags array on team doc (optional)
          }));
          return [league, teams];
        })
      );
      setTeamsByLeague(Object.fromEntries(entries));
      setInitLoading(false);
    }
    init();
  }, [rootCol]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Reset + load first batch whenever queue or initLoading changes ─────
  useEffect(() => {
    if (initLoading) return;
    if (queue.length === 0) { setJerseys([]); setHasMore(false); return; }

    const gen = ++generationRef.current;
    setJerseys([]);
    setCursor(0);
    setHasMore(true);
    setLoadingMore(true);
    loadBatch(0, queue, gen, rootCol);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, initLoading]);

  // ── 3. IntersectionObserver — trigger next batch ──────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        setLoadingMore(true);
        loadBatch(cursor, queue, generationRef.current, rootCol);
      }
    }, { rootMargin: '300px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadingMore, queue, loadBatch, rootCol]);

  // ── URL helpers ───────────────────────────────────────────────────────────
  const setParam = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }, [setSearchParams]);

  const handleSportChange = useCallback((newSport) => {
    clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearchParams({ sport: newSport });
  }, [setSearchParams]);

  const sidebarTeams = selectedLeague ? (teamsByLeague[selectedLeague] || []) : [];

  // When no queue-level filter is active, show the full static option lists so
  // customers see every cut / sleeve / size immediately without waiting for
  // jerseys to load.  Once a league or search narrows the queue, switch to only
  // the options present in the loaded results.
  const noQueueFilter  = !selectedLeague && !searchQuery;
  const displayCuts    = noQueueFilter ? CUT_ORDER    : availableCuts;
  const displaySleeves = noQueueFilter ? SLEEVE_ORDER : availableSleeves;
  const displaySizes   = noQueueFilter
    ? [...SIZE_ORDER, ...availableSizes.filter(s => !SIZE_ORDER.includes(s))]
    : availableSizes;

  const activeFilters = [
    selectedLeague && { key: 'league',  label: selectedLeague },
    searchQuery    && { key: 'search',  label: `"${searchQuery}"` },
    selectedCut    && { key: 'cut',     label: selectedCut },
    selectedSleeve && { key: 'sleeve',  label: selectedSleeve },
    selectedSize   && { key: 'size',    label: `Size ${selectedSize}` },
  ].filter(Boolean);

  return (
    <>
      {/* ── Sport tab strip ───────────────────────────────────────────────── */}
      <div className="sport-tab-row container">
        {SPORTS.map(s => (
          <button
            key={s.key}
            className={`sport-tab-btn${sport === s.key ? ' active' : ''}`}
            onClick={() => handleSportChange(s.key)}
          >
            <span>{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="home-layout container page-content">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="filter-sidebar">
          <h2 className="sidebar-title">Filter</h2>

          {/* Year — left column on mobile */}
          <div className="filter-col filter-col--year">
            <div className="filter-section">
              <p className="filter-heading">Year</p>
              <FilterChip label="All Years" active={!selectedLeague} onClick={() => setParam('league', '')} />
              {leagues.map(lg => (
                <FilterChip key={lg} label={lg} active={selectedLeague === lg}
                  onClick={() => setParam('league', lg)} />
              ))}
            </div>
          </div>

          {/* Cut / Sleeve / Size / Team — right column on mobile */}
          <div className="filter-col filter-col--rest">
            {/* Team (drill-down when league selected) */}
            {sidebarTeams.length > 0 && (
              <div className="filter-section">
                <p className="filter-heading">Team</p>
                <FilterChip label="All Teams" active={!searchQuery} onClick={() => {
                  setSearchInput('');
                  setParam('search', '');
                }} />
                {sidebarTeams.map(t => (
                  <FilterChip key={t.name} label={t.name}
                    active={searchTerms.length === 1 && searchTerms[0] === t.name.toLowerCase()}
                    onClick={() => {
                      setSearchInput(t.name);
                      setParam('search', t.name);
                    }} />
                ))}
              </div>
            )}

            {/* Cut */}
            {displayCuts.length > 0 && (
              <div className="filter-section">
                <p className="filter-heading">Cut</p>
                <FilterChip label="All Cuts" active={!selectedCut} onClick={() => setParam('cut', '')} />
                {displayCuts.map(c => (
                  <FilterChip key={c} label={c} active={selectedCut === c}
                    onClick={() => setParam('cut', c)} />
                ))}
              </div>
            )}

            {/* Sleeve */}
            {displaySleeves.length > 0 && (
              <div className="filter-section">
                <p className="filter-heading">Sleeve</p>
                <FilterChip label="All Sleeves" active={!selectedSleeve} onClick={() => setParam('sleeve', '')} />
                {displaySleeves.map(s => (
                  <FilterChip key={s} label={s} active={selectedSleeve === s}
                    onClick={() => setParam('sleeve', s)} />
                ))}
              </div>
            )}

            {/* Size */}
            {displaySizes.length > 0 && (
              <div className="filter-section">
                <p className="filter-heading">Size</p>
                <FilterChip label="All Sizes" active={!selectedSize} onClick={() => setParam('size', '')} />
                <div className="size-chip-row">
                  {displaySizes.map(sz => (
                    <button key={sz}
                      className={`size-chip${selectedSize === sz ? ' active' : ''}`}
                      onClick={() => setParam('size', sz)}>
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Grid area ────────────────────────────────────────────────── */}
        <main className="jersey-grid-area">

          {/* Search bar */}
          <div className="search-bar-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="search-bar"
              type="text"
              placeholder="Search teams… e.g. Barcelona, Argentina"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="search-clear" onClick={() => { clearTimeout(debounceRef.current); setSearchInput(''); setParam('search', ''); }}>
                ✕
              </button>
            )}
          </div>

          {/* In-stock toggle */}
          <div className="stock-toggle-wrap">
            <button
              className={`stock-toggle${inStockOnly ? ' on' : ''}`}
              onClick={() => setInStockOnly(v => !v)}
              aria-pressed={inStockOnly}
            >
              <span className="stock-toggle-track">
                <span className="stock-toggle-thumb" />
              </span>
              <span className="stock-toggle-label">
                In Stock Only
              </span>
            </button>
          </div>

          {/* Active filter pills */}
          {activeFilters.length > 0 && (
            <div className="active-filters">
              {activeFilters.map(f => (
                <span key={f.key} className="active-filter-pill">
                  {f.label}
                  <button onClick={() => {
                    if (f.key === 'search') clearTimeout(debounceRef.current);
                    setParam(f.key, '');
                    // searchInput will be reset by the sync effect when searchQuery becomes ''
                  }}>✕</button>
                </span>
              ))}
              <button className="clear-all-btn" onClick={() => {
                clearTimeout(debounceRef.current);
                // Build cleared params directly from the render-closure value —
                // do NOT call setSearchInput here; the sync effect below will
                // reset the input once searchQuery becomes '', which avoids
                // re-arming the debounce and causing a second partial update.
                const next = new URLSearchParams(searchParams);
                ['league', 'search', 'cut', 'sleeve', 'size'].forEach(k => next.delete(k));
                setSearchParams(next, { replace: true });
              }}>Clear all</button>
            </div>
          )}

          {/* Grid header */}
          <div className="grid-header">
            <h1 className="grid-title">
              {searchQuery   ? `Results for "${searchQuery}"` :
               selectedLeague ? selectedLeague : 'All Jerseys'}
            </h1>
            {visibleJerseys.length > 0 && (
              <span className="grid-count">
                {visibleJerseys.length}{hasMore ? '+' : ''} items
              </span>
            )}
          </div>

          {initLoading ? (
            <div className="spinner" />
          ) : (
            <>
              {visibleJerseys.length > 0 && (
                <div className="jersey-grid">
                  {visibleJerseys.map(j => <JerseyCard key={j.id} sport={sport} {...j} />)}
                </div>
              )}

              {/* Always-rendered sentinel — must stay outside all conditionals */}
              <div ref={sentinelRef} className="sentinel">
                {loadingMore && <div className="load-more-indicator"><div className="spinner" /></div>}
                {!hasMore && !loadingMore && visibleJerseys.length === 0 && jerseys.length > 0 && (
                  <p className="grid-empty">No jerseys match your current filters.</p>
                )}
                {!hasMore && !loadingMore && jerseys.length === 0 && !initLoading && (
                  <p className="grid-empty">No jerseys found.</p>
                )}
                {!hasMore && visibleJerseys.length > 0 && (
                  <p className="end-of-feed">You've seen all jerseys</p>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

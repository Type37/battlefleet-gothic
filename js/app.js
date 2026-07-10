/* ═══════════════════════════════════════════════════════════════
   BATTLEFLEET GOTHIC : FLEET REGISTRY
   Vanilla JS. No dependencies. localStorage persistence.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── Constants ─────────────────────────────────────────────── */
const STORE_KEY = 'bfg-fleets';
const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π'];
const CAT_ORDER = ['Fleet Commander','Battleship','Grand Cruiser','Battlecruiser','Heavy Cruiser','Cruiser','Light Cruiser','Escort'];
const CRUISER_CATS = new Set(['Cruiser','Battlecruiser','Light Cruiser','Heavy Cruiser','Grand Cruiser']);
const CAT_TITLES = {
  'Fleet Commander':  'An admiral or character who leads the fleet — required above 750 pts, gives command re-rolls',
  'Battleship':        'The largest, most heavily-gunned hull in a fleet — needs 3 cruiser-class escorts per battleship',
  'Grand Cruiser':      'A rare, oversized cruiser hull — counts as a cruiser for the battleship escort requirement',
  'Battlecruiser':      'A cruiser built for speed over armour — counts as a cruiser for the battleship escort requirement',
  'Heavy Cruiser':      'A cruiser with reinforced armament or armour over the standard pattern — counts as a cruiser',
  'Cruiser':            'The backbone of most fleets — balanced firepower and durability',
  'Light Cruiser':      'A cheaper, lighter cruiser hull — counts as a cruiser for the battleship escort requirement',
  'Escort':             'Small, cheap ships bought in squadrons of 2 to 6 — screen capital ships and hunt ordnance',
};

const FACTION_META = {
  'Imperial Navy':               { icon: 'imperial-navy.svg', color: 'var(--f-imperial)', short: 'Imperial Navy' },
  'Chaos':                       { icon: 'chaos.svg',         color: 'var(--f-chaos)',    short: 'Chaos' },
  'Space Marines':               { icon: 'space-marines.svg', color: 'var(--f-marines)',  short: 'Space Marines' },
  'Adeptus Mechanicus':          { icon: 'mechanicus.svg',    color: 'var(--f-mech)',     short: 'Adeptus Mechanicus' },
  'Inquisition':                 { icon: 'inquisition.svg',   color: 'var(--f-inq)',      short: 'Inquisition' },
  'Eldar Corsairs':              { icon: 'eldar.svg',         color: 'var(--f-eldar)',    short: 'Eldar Corsairs' },
  'Dark Eldar Pirate Fleet List':{ icon: 'dark-eldar.svg',    color: 'var(--f-deldar)',   short: 'Dark Eldar' },
  'Orks':                        { icon: 'orks.svg',          color: 'var(--f-orks)',     short: 'Orks' },
  'Necrons':                     { icon: 'necrons.svg',       color: 'var(--f-necrons)',  short: 'Necrons' },
  'Tyranid Hive Fleet List':     { icon: 'tyranids.svg',      color: 'var(--f-nids)',     short: 'Tyranids' },
  'Tau Fleet':                   { icon: 'tau.svg',           color: 'var(--f-tau)',      short: 'Tau' },
  'Pirates and Wolf Packs':      { icon: 'pirates.svg',       color: 'var(--f-pirates)',  short: 'Pirates & Wolf Packs' },
  'Armada Imperialis':           { icon: 'armada.svg',        color: 'var(--f-armada)',   short: 'Armada Imperialis' },
};
function fmeta(faction) {
  return FACTION_META[faction] || { icon: 'armada.svg', color: 'var(--bone-dim)', short: faction };
}
function fstyle(faction) {
  // Path is relative to app.css (where --fi is consumed by the mask rule), so ../ escapes /css.
  const m = fmeta(faction);
  return `--fi:url('../assets/icons/${m.icon}');--fc:${m.color}`;
}

// Per-stat glyph + plain-English meaning, shown as an icon (always visible) with
// the explanation on hover/focus — no permanent paragraph of rules text.
const STAT_ICONS = {
  Speed:   '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="4,4 20,12 4,20 8,12"/></svg>',
  Turns:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v5h-5"/></svg>',
  // Void shields are a projected energy field, not a physical shield plate —
  // concentric arcs over the hull read as a force-field bubble, not heraldry.
  Shields: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3.5 14.5a8.5 8.5 0 0 1 17 0" stroke-width="2"/><path d="M6.5 15.5a5.5 5.5 0 0 1 11 0" stroke-width="1.7" opacity=".75"/><path d="M9.5 16.5a2.5 2.5 0 0 1 5 0" stroke-width="1.4" opacity=".55"/><line x1="3" y1="19.5" x2="21" y2="19.5" stroke-width="2"/></svg>',
  // Riveted hull plate bands — reads as armored ship hull, not a brick wall.
  Armour:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="3" width="19" height="18" rx="2"/><line x1="2.5" y1="9" x2="21.5" y2="9"/><line x1="2.5" y1="15" x2="21.5" y2="15"/><circle cx="6" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r=".9" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r=".9" fill="currentColor" stroke="none"/></svg>',
  Turrets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><line x1="12" y1="2" x2="12" y2="6.5"/><line x1="12" y1="17.5" x2="12" y2="22"/><line x1="2" y1="12" x2="6.5" y2="12"/><line x1="17.5" y1="12" x2="22" y2="12"/></svg>',
  Hits:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/></svg>',
};
const STAT_TITLES = {
  Speed:   'Speed — how far the ship moves each turn',
  Turns:   'Turns — sharpest turn the ship can make in one move',
  Shields: 'Shields — blocks one hit each, recharges every turn',
  Armour:  'Armour — roll needed to score a hit on this ship',
  Turrets: 'Turrets — shoots down incoming torpedoes and bombers',
  Hits:    'Hits — damage the ship can take before it is crippled',
};

/* ── Fire arc diagrams ─────────────────────────────────────────
   Matches the rulebook's own fire-arc template: a top-down hull outline
   split by corner-to-corner diagonals into Front/Left/Right/Rear
   quadrants, with the arcs a weapon can fire into shaded solid. */
const ARC_QUADRANT_POINTS = {
  Front: '5,4 19,4 12,12',
  Left:  '5,4 5,20 12,12',
  Right: '19,4 19,20 12,12',
  Rear:  '5,20 19,20 12,12',
};
function arcQuadrants(raw) {
  const s = (raw || '').toLowerCase();
  if (!s || s === '-' || s === 'n/a') return [];
  if (s.includes('all')) return ['Front', 'Left', 'Right', 'Rear'];
  return ['Front', 'Left', 'Right', 'Rear'].filter(q => s.includes(q.toLowerCase()));
}
function arcIconSvg(raw) {
  const on = new Set(arcQuadrants(raw));
  if (!on.size) return '';
  const shaded = Object.entries(ARC_QUADRANT_POINTS)
    .filter(([q]) => on.has(q))
    .map(([, pts]) => `<polygon points="${pts}" fill="currentColor"/>`).join('');
  return `<svg viewBox="0 0 24 24">
    ${shaded}
    <polygon points="5,4 19,4 19,20 5,20" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".65"/>
    <path d="M5,4 L19,20 M19,4 L5,20" stroke="currentColor" stroke-width=".8" opacity=".35"/>
    <polygon points="9,4 15,4 12,.5" fill="currentColor"/>
  </svg>`;
}
function arcTitle(raw) {
  const q = arcQuadrants(raw);
  if (!q.length) return raw || 'No firing arc listed';
  if (q.length === 4) return 'Fires in any direction';
  return `Fires into the ${q.join(' / ')} arc${q.length > 1 ? 's' : ''} (shaded, bow marked at top)`;
}

/* ── Critical Hits Table — straight from the rulebook (2D6), used on both
   the per-ship crit track and the printed quick-reference sheet. ─────── */
const CRIT_TABLE = [
  { roll: 2,  extra: '',    loc: 'Dorsal Armament',    effect: "Dorsal weapons may not fire until repaired." },
  { roll: 3,  extra: '',    loc: 'Starboard Armament', effect: "Starboard (right) weapons may not fire until repaired." },
  { roll: 4,  extra: '',    loc: 'Port Armament',      effect: "Port (left) weapons may not fire until repaired." },
  { roll: 5,  extra: '',    loc: 'Prow Armament',      effect: "Prow weapons may not fire until repaired." },
  { roll: 6,  extra: '+1',  loc: 'Engine Room',        effect: "Ship may not turn until repaired." },
  { roll: 7,  extra: '',    loc: 'Fire!',              effect: "Roll to extinguish each End Phase — unrepaired, it causes 1 extra damage and keeps burning." },
  { roll: 8,  extra: '+1',  loc: 'Thrusters',          effect: "Speed reduced by 10cm until repaired." },
  { roll: 9,  extra: '',    loc: 'Bridge Smashed',     effect: "Leadership reduced by 3, cannot be repaired. Flagship: Fleet Commander re-rolls are lost." },
  { roll: 10, extra: '',    loc: 'Shields Collapse',   effect: "Shield strength reduced to zero, cannot be repaired." },
  { roll: 11, extra: '+D3', loc: 'Hull Breach',        effect: "A huge gash is torn in the hull." },
  { roll: 12, extra: '+D6', loc: 'Bulkhead Collapse',  effect: "Whole compartments crumple." },
];

/* ── State ─────────────────────────────────────────────────── */
let DB = null;
let ART = new Set();   // ship ids that have extracted illustrations
let fleets = [];
let activeFleet = null;          // index into fleets[]
let state = 'home';              // 'home' | 'fleet'
let pickerCategory = 'All';
let pickerSearch = '';
let wizStep = 1;
let wizDraft = {};               // { faction, fleetList }

const $ = id => document.getElementById(id);
const app = document.getElementById('app');

/* ── Storage ───────────────────────────────────────────────── */
function loadFleets() {
  try { fleets = JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch (e) { fleets = []; }
}
function saveFleets() {
  localStorage.setItem(STORE_KEY, JSON.stringify(fleets));
}
function getFleet() { return activeFleet != null ? fleets[activeFleet] : null; }

/* ── Fleet-list constraints ────────────────────────────────── */
// Fleet lists constrain by broad category; Light/Heavy Cruiser count as "Cruiser".
const CAT_TO_CONSTRAINT = { 'Light Cruiser': 'Cruiser', 'Heavy Cruiser': 'Cruiser' };
function constraintCat(cat) { return CAT_TO_CONSTRAINT[cat] || cat; }
function getFleetList(fleet) {
  const fac = DB.factions[fleet.faction];
  if (!fac || !fac.fleetLists) return null;
  return fac.fleetLists.find(l => l.name === fleet.fleetList) || null;
}
function categoryLimits(fleet) {
  const fl = getFleetList(fleet);
  const out = {};
  if (!fl) return out;
  fl.categories.forEach(c => {
    const lim = {};
    (c.constraints || []).forEach(k => {
      if (k.type === 'min' && !isNaN(k.value)) lim.min = k.value;
      if (k.type === 'max' && !isNaN(k.value)) lim.max = k.value;
    });
    out[c.name] = lim;
  });
  return out;
}
function disallowedCats(fleet) {
  const lim = categoryLimits(fleet);
  const s = new Set();
  for (const c in lim) if (lim[c].max === 0) s.add(c);
  return s;
}
function countByConstraintCat(fleet, cat) {
  return fleet.ships.filter(sl => {
    const s = shipDef(sl.shipId);
    return s && constraintCat(s.category) === cat;
  }).length;
}

/* ── Points & validation ───────────────────────────────────── */
function shipDef(id) { return DB.ships[id]; }
function slotPts(slot) {
  const s = shipDef(slot.shipId);
  if (!s) return 0;
  const upg = (slot.upgrades || []).reduce((a, u) => a + (u.pts || 0), 0);
  return (s.pts + upg) * (slot.qty || 1);
}
function sqdPts(sqd) {
  const s = shipDef(sqd.shipId);
  if (!s) return 0;
  const upg = (sqd.upgrades || []).reduce((a, u) => a + (u.pts || 0), 0);
  return s.pts * sqd.count + upg;
}
function fleetTotalPts(fleet) {
  let t = fleet.commander ? fleet.commander.pts : 0;
  fleet.ships.forEach(sl => t += slotPts(sl));
  fleet.squadrons.forEach(sq => t += sqdPts(sq));
  return t;
}
function countCruisers(fleet) {
  return fleet.ships.filter(sl => {
    const s = shipDef(sl.shipId);
    return s && CRUISER_CATS.has(s.category);
  }).length;
}
function countBattleships(fleet) {
  return fleet.ships.filter(sl => {
    const s = shipDef(sl.shipId);
    return s && s.category === 'Battleship';
  }).length;
}
function validateFleet(fleet) {
  const issues = [];
  const total = fleetTotalPts(fleet);
  if (total === 0 && !fleet.commander) return issues;   // silence on empty fleet
  const fac = DB.factions[fleet.faction];
  const hasCommanders = fac && fac.ships.some(id => {
    const s = DB.ships[id];
    return s && s.category === 'Fleet Commander';
  });
  if (total > 750 && !fleet.commander && hasCommanders) {
    issues.push({ type: 'err', msg: 'A Fleet Commander is required for fleets above 750 pts.' });
  }
  const bs = countBattleships(fleet), cr = countCruisers(fleet);
  if (bs > 0 && cr < bs * 3) {
    issues.push({ type: 'err', msg: `${bs} battleship${bs>1?'s':''} require${bs>1?'':'s'} ${bs*3} cruisers; add ${bs*3 - cr} more.`, affectsCategory: 'Battleship' });
  }
  fleet.squadrons.forEach(sq => {
    const s = shipDef(sq.shipId);
    if (!s) return;
    if (sq.count < 2) issues.push({ type: 'warn', msg: `${s.name} squadron needs at least 2 ships (currently ${sq.count}).` });
    if (sq.count > 6) issues.push({ type: 'warn', msg: `${s.name} squadron exceeds the maximum of 6 ships (${sq.count}).` });
  });
  // Fleet-list category caps (e.g. Gothic Sector allows max 12 cruisers)
  const limits = categoryLimits(fleet);
  for (const cat in limits) {
    const lim = limits[cat];
    if (lim.max === 0) continue; // enforced by hiding from picker
    const n = countByConstraintCat(fleet, cat);
    if (lim.max != null && n > lim.max) {
      issues.push({ type: 'warn', msg: `${fleet.fleetList} allows at most ${lim.max} ${cat}${lim.max === 1 ? '' : 's'} (you have ${n}).` });
    }
    if (lim.min != null && lim.min > 0 && n < lim.min) {
      issues.push({ type: 'warn', msg: `${fleet.fleetList} requires at least ${lim.min} ${cat}${lim.min === 1 ? '' : 's'} (you have ${n}).` });
    }
  }
  if (total > fleet.limit) {
    issues.push({ type: 'warn', msg: `Fleet exceeds its ${fleet.limit} pt limit by ${total - fleet.limit} pts.` });
  }
  return issues;
}
function battleshipsInvalid(fleet) {
  const bs = countBattleships(fleet);
  return bs > 0 && countCruisers(fleet) < bs * 3;
}
function ptsSplit(fleet) {
  let invalid = 0;
  if (battleshipsInvalid(fleet)) {
    fleet.ships.forEach(sl => {
      const s = shipDef(sl.shipId);
      if (s && s.category === 'Battleship') invalid += slotPts(sl);
    });
  }
  return { valid: fleetTotalPts(fleet) - invalid, invalid };
}

/* ── Helpers ───────────────────────────────────────────────── */
function shipArt(id) { return ART.has(id) ? `images/ships/${id}.webp` : null; }
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function statsRun(ship) {
  const st = ship.stats || {};
  const bits = [];
  if (st.Hits)    bits.push(`<b>${escHtml(st.Hits)}</b> Hits`);
  if (st.Shields) bits.push(`<b>${escHtml(st.Shields)}</b> Shields`);
  if (st.Armour)  bits.push(`Armour <b>${escHtml(st.Armour)}</b>`);
  if (!bits.length) return escHtml(ship.category);
  return bits.join('<span class="stat-sep"></span>');
}
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ── Theme (light default; dark by explicit choice only) ─────── */
// Icon shows the theme a click switches TO, not the current one.
const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  dark:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
};
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const next = theme === 'dark' ? 'light' : 'dark';
  $('theme-toggle-icon').innerHTML = THEME_ICONS[next];
  $('btn-theme-toggle').setAttribute('aria-label', `Switch to ${next} mode`);
}
function setTheme(theme) {
  applyTheme(theme);
  try { localStorage.setItem('bfg-theme', theme); } catch (e) {}
}
function initTheme() { applyTheme(currentTheme()); }

/* ── Overlay focus management ──────────────────────────────── */
let lastFocus = null;
function focusablesIn(el) {
  return [...el.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(x => !x.hidden && x.offsetParent !== null);
}
function openOverlayEl(el) {
  lastFocus = document.activeElement;
  el.hidden = false;
  const f = focusablesIn(el.querySelector('.overlay-sheet') || el);
  if (f.length) f[0].focus();
}
function closeOverlayEl(el) {
  if (el.hidden) return;
  el.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const open = [document.getElementById('overlay-export'), document.getElementById('modal-upgrades')]
    .find(o => o && !o.hidden);
  if (!open) return;
  const list = focusablesIn(open.querySelector('.overlay-sheet') || open);
  if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ── State machine ─────────────────────────────────────────── */
function setState(s) {
  state = s;
  app.dataset.state = s;
  const onFleet = s === 'fleet';

  $('mast-brand').hidden   = onFleet;
  $('mast-fleet').hidden   = !onFleet;
  $('mast-pts').hidden     = !onFleet;
  $('mast-actions').hidden = !onFleet;
  $('fleet-menu-dropdown').hidden = true;

  $('home-content').hidden  = onFleet;
  $('fleet-content').hidden = !onFleet;

  $('registry-wizard').hidden = onFleet;
  $('registry-picker').hidden = !onFleet;
  $('registry-mobile-title').textContent = onFleet ? 'Add Ship' : 'New Fleet';

  app.classList.remove('registry-open');

  document.querySelectorAll('#bottom-nav .nav-item').forEach(n => {
    n.classList.toggle('active', (n.dataset.nav === 'home' && !onFleet));
  });

  if (onFleet) renderFleet(); else renderHome();
}
function openRegistryMobile() {
  app.classList.add('registry-open');
}
function closeRegistryMobile() {
  app.classList.remove('registry-open');
}

/* ── Home render ───────────────────────────────────────────── */
function renderHome() {
  const idx = $('fleet-index');
  $('empty-fleets').hidden = fleets.length > 0;
  idx.innerHTML = fleets.map((f, i) => {
    const m = fmeta(f.faction);
    return `
    <button class="fleet-row" data-open="${i}" style="${fstyle(f.faction)}">
      <span class="fleet-row-emblem"></span>
      <span class="fleet-row-main">
        <span class="fleet-row-name">${escHtml(f.name)}</span>
        <span class="fleet-row-sub">${escHtml(m.short)}${f.fleetList ? ` (${escHtml(f.fleetList)})` : ''}</span>
      </span>
      <span class="fleet-row-pts"><b>${fleetTotalPts(f)}</b><span>of ${f.limit} pts</span></span>
    </button>`;
  }).join('');
}

/* ── Fleet render ──────────────────────────────────────────── */
function renderFleet() {
  const fleet = getFleet();
  if (!fleet) { setState('home'); return; }
  const m = fmeta(fleet.faction);

  $('fleet-name-display').textContent = fleet.name;
  $('fleet-faction-display').textContent = m.short + (fleet.fleetList ? ` (${fleet.fleetList})` : '');
  $('picker-faction-label').textContent = m.short;

  // pts tracker
  const total = fleetTotalPts(fleet);
  const split = ptsSplit(fleet);
  $('pts-used').textContent = total;
  $('pts-limit').textContent = fleet.limit;
  const rem = fleet.limit - total;
  $('pts-remaining').textContent = rem >= 0 ? `${rem} remaining` : `${-rem} over`;
  $('mast-pts').classList.toggle('over-limit', total > fleet.limit);
  const pctV = Math.min(100, (split.valid / fleet.limit) * 100);
  const pctI = Math.min(100 - pctV, (split.invalid / fleet.limit) * 100);
  $('pts-valid-bar').style.width = pctV + '%';
  $('pts-invalid-bar').style.width = pctI + '%';

  // validation
  const issues = validateFleet(fleet);
  $('validation-panel').innerHTML = issues.map(i => `
    <div class="vitem ${i.type}"><span class="vitem-glyph">${i.type === 'err' ? '✕' : '⚠'}</span><span>${escHtml(i.msg)}</span></div>
  `).join('');

  renderManifest(fleet);
  renderPicker(fleet);
}

function renderManifest(fleet) {
  const body = $('fleet-body');
  const bsInvalid = battleshipsInvalid(fleet);
  let html = '';

  // Commander
  if (fleet.commander) {
    const c = shipDef(fleet.commander.shipId);
    html += `<div class="man-band"><span>Fleet Commander</span><span class="man-band-pts">${fleet.commander.pts} pts</span></div>`;
    html += `
    <div class="ship-row" data-kind="cmd">
      <div class="ship-row-top">
        <div class="ship-row-main">
          <div class="ship-row-name">${escHtml(fleet.commander.name || (c ? c.name : 'Commander'))}</div>
          <div class="ship-row-stats">${c ? escHtml(c.name) : ''}</div>
        </div>
        <div class="ship-row-pts">${fleet.commander.pts}<small>pts</small></div>
        <button class="row-x" data-remove-cmd aria-label="Remove commander" title="Relieve this commander of duty">✕</button>
      </div>
    </div>`;
  }

  // Capital ships by category
  const byCat = {};
  fleet.ships.forEach((sl, i) => {
    const s = shipDef(sl.shipId);
    if (!s) return;
    (byCat[s.category] = byCat[s.category] || []).push({ sl, i, s });
  });

  for (const cat of CAT_ORDER) {
    if (cat === 'Fleet Commander' || cat === 'Escort' || !byCat[cat]) continue;
    const group = byCat[cat];
    const catPts = group.reduce((a, g) => a + slotPts(g.sl), 0);
    html += `<div class="man-band" title="${escHtml(CAT_TITLES[cat] || '')}"><span>${escHtml(cat)}s</span><span class="man-band-count">×${group.length}</span><span class="man-band-pts">${catPts} pts</span></div>`;

    // greek indices per shipId
    const seen = {};
    group.forEach(g => {
      const dupes = group.filter(x => x.sl.shipId === g.sl.shipId).length;
      let suffix = '';
      if (dupes > 1) {
        seen[g.sl.shipId] = (seen[g.sl.shipId] || 0);
        suffix = `<span class="greek" title="One of ${dupes} ${g.s.name} in this fleet — the letter just tells them apart, it has no rules effect">${GREEK[seen[g.sl.shipId] % GREEK.length]}</span>`;
        seen[g.sl.shipId]++;
      }
      const invalid = bsInvalid && g.s.category === 'Battleship';
      const upgTags = (g.sl.upgrades || []).map(u =>
        `<span class="upg-tag">${escHtml(u.name)}${u.pts > 0 ? ` +${u.pts}` : u.pts < 0 ? ` ${u.pts}` : ''}</span>`).join('');
      html += `
      <div class="ship-row ${invalid ? 'invalid' : ''}" data-slot="${g.i}">
        <button class="ship-row-top" data-toggle aria-expanded="false">
          <span class="ship-row-main">
            <span class="ship-row-name">${escHtml(g.s.name)}${suffix}</span>
            <span class="ship-row-stats">${statsRun(g.s)}</span>
            ${invalid ? '<span class="ship-row-flag" title="Every battleship needs 3 cruiser-class ships in the fleet to be legal — add more cruisers or remove a battleship">⚠ Needs cruiser escort</span>' : ''}
          </span>
          <span class="ship-row-pts">${slotPts(g.sl)}<small>pts</small></span>
        </button>
        <div class="ship-detail"><div class="ship-detail-pad">
          ${shipDetailHtml(g.s)}
          ${upgTags ? `<div style="margin-top:6px">${upgTags}</div>` : ''}
          <div class="detail-actions">
            ${g.s.upgrades && g.s.upgrades.length ? `<button class="chip-btn" data-upgrades="${g.i}">Upgrades</button>` : ''}
            <button class="chip-btn" data-remove="${g.i}">Remove Ship</button>
          </div>
        </div></div>
      </div>`;
    });
  }

  // Escort squadrons
  if (fleet.squadrons.length) {
    const sqPts = fleet.squadrons.reduce((a, sq) => a + sqdPts(sq), 0);
    html += `<div class="man-band"><span>Escort Squadrons</span><span class="man-band-count">×${fleet.squadrons.length}</span><span class="man-band-pts">${sqPts} pts</span></div>`;
    fleet.squadrons.forEach((sq, i) => {
      const s = shipDef(sq.shipId);
      if (!s) return;
      const bad = sq.count < 2 || sq.count > 6;
      html += `
      <div class="ship-row" data-sqd="${i}">
        <div class="ship-row-top">
          <button class="ship-row-main row-toggle" data-toggle aria-expanded="false">
            <span class="ship-row-name" style="display:block">${escHtml(s.name)}</span>
            <span class="ship-row-stats" style="display:block">${statsRun(s)}</span>
            ${bad ? `<span class="ship-row-flag" style="display:block" title="Squadrons must have between 2 and 6 ships to be legal">⚠ Squadrons field 2–6 ships</span>` : ''}
          </button>
          <span class="sqd-step">
            <button class="sqd-btn" data-sqd-dec="${i}" ${sq.count <= 1 ? 'disabled' : ''} aria-label="Remove one ship from squadron" title="Remove one ship">−</button>
            <span class="sqd-count" aria-label="Ships in squadron" title="Ships in this squadron">${sq.count}</span>
            <button class="sqd-btn" data-sqd-inc="${i}" ${sq.count >= 6 ? 'disabled' : ''} aria-label="Add one ship to squadron" title="Add one ship">+</button>
          </span>
          <span class="ship-row-pts">${sqdPts(sq)}<small>pts</small></span>
          <button class="row-x" data-remove-sqd="${i}" aria-label="Remove squadron" title="Disband this squadron">✕</button>
        </div>
        <div class="ship-detail"><div class="ship-detail-pad">${shipDetailHtml(s)}</div></div>
      </div>`;
    });
  }

  if (!html) {
    html = `<div class="empty-state">
      <div class="empty-rule"></div>
      <div class="empty-title">No ships yet</div>
      <div class="empty-sub">Add your first ship from the panel on the right (or the <b>Add</b> button below on mobile). Start with a Fleet Commander and capital ships, then escorts.</div>
      <div class="empty-rule"></div>
    </div>`;
  }
  body.innerHTML = html;
}

function shipDetailHtml(ship) {
  let html = '';
  const art = shipArt(ship.id);
  if (art) html += `<img class="ship-art" src="${art}" alt="${escHtml(ship.name)}" loading="lazy">`;
  const st = ship.stats || {};
  const cells = [
    ['Speed', st.Speed], ['Turns', st.Turns], ['Shields', st.Shields],
    ['Armour', st.Armour], ['Turrets', st.Turrets], ['Hits', st.Hits],
  ].filter(c => c[1]);
  if (cells.length) {
    html += `<div class="stat-strip">${cells.map(c => `
      <div class="stat-cell" title="${escHtml(STAT_TITLES[c[0]] || c[0])}">
        <span class="stat-cell-icon" aria-hidden="true">${STAT_ICONS[c[0]] || ''}</span>
        <span class="stat-cell-text"><b>${escHtml(c[1])}</b><span>${c[0]}</span></span>
      </div>`).join('')}</div>`;
  }
  if (ship.armament && ship.armament.length) {
    html += `<table class="arm-table">
      <thead><tr>
        <th title="Name of the weapon battery, lance, or ordnance system">Armament</th>
        <th title="How far the weapon reaches, or how fast ordnance moves">Range / Speed</th>
        <th title="Firepower: dice rolled for a weapons battery. Strength: dice rolled for a torpedo salvo">FP / Str</th>
        <th title="Which side(s) of the ship this weapon can fire into">Arc</th>
      </tr></thead>
      <tbody>${ship.armament.map(a => {
        const arcSvg = arcIconSvg(a['Fire Arc']);
        return `
        <tr><td>${escHtml(a.name)}</td><td>${escHtml(a['Range/Speed'] || '-')}</td><td>${escHtml(a['Firepower/Str'] || '-')}</td>
          <td class="arc-cell" title="${escHtml(arcTitle(a['Fire Arc']))}">
            ${arcSvg ? `<span class="arc-icon" aria-hidden="true">${arcSvg}</span>` : ''}<span class="arc-label">${escHtml(a['Fire Arc'] || '-')}</span>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
  if (ship.specialRules && ship.specialRules.length) {
    html += ship.specialRules.map(r =>
      `<div class="rule-block"><b>${escHtml(r.name)}</b><p>${escHtml(r.effects || '')}</p></div>`).join('');
  }
  return html || '<p class="wiz-note">No additional data for this ship.</p>';
}

/* ── Picker render ─────────────────────────────────────────── */
function pickerShips(fleet) {
  const fac = DB.factions[fleet.faction];
  if (!fac) return [];
  const blocked = disallowedCats(fleet);
  return fac.ships.map(id => DB.ships[id]).filter(s =>
    s && !blocked.has(constraintCat(s.category)));
}
function renderPicker(fleet) {
  const ships = pickerShips(fleet);
  const cats = CAT_ORDER.filter(c => ships.some(s => s.category === c));

  // tabs
  const tabs = ['All', ...cats];
  if (!tabs.includes(pickerCategory)) pickerCategory = 'All';
  $('picker-tabs').innerHTML = tabs.map(t =>
    `<button class="cat-tab ${t === pickerCategory ? 'active' : ''}" data-tab="${escHtml(t)}" role="tab" aria-selected="${t === pickerCategory}" title="${escHtml(CAT_TITLES[t] || 'Every ship available to this fleet list')}">${escHtml(t === 'All' ? 'All' : t + 's')}</button>`
  ).join('');

  // rows
  const q = pickerSearch.trim().toLowerCase();
  let pool = ships;
  if (pickerCategory !== 'All') pool = pool.filter(s => s.category === pickerCategory);
  if (q) pool = pool.filter(s => s.name.toLowerCase().includes(q));

  const bsWouldViolate = cat =>
    cat === 'Battleship' && countCruisers(fleet) < (countBattleships(fleet) + 1) * 3;

  const groups = pickerCategory === 'All'
    ? cats.map(c => [c, pool.filter(s => s.category === c)]).filter(g => g[1].length)
    : [[pickerCategory, pool]];

  let html = '';
  for (const [cat, list] of groups) {
    if (!list.length) continue;
    if (pickerCategory === 'All') html += `<div class="pick-cat-head" title="${escHtml(CAT_TITLES[cat] || '')}">${escHtml(cat)}s</div>`;
    list.slice().sort((a, b) => b.pts - a.pts).forEach(s => {
      const warn = bsWouldViolate(s.category);
      html += `
      <div class="pick-row" data-ship="${s.id}">
        <div class="pick-row-top">
          <button class="pick-row-main row-toggle" data-toggle aria-expanded="false">
            <span class="pick-row-name" style="display:block">${escHtml(s.name)}</span>
            <span class="pick-row-stats" style="display:block">${statsRun(s)}</span>
          </button>
          <span class="pick-row-pts">${s.pts}<small style="display:block;font-size:9px;font-weight:400;color:var(--faint);text-align:right;letter-spacing:1px">pts</small></span>
          <button class="pick-add ${warn ? 'warn' : ''}" data-add="${s.id}" aria-label="Add ${escHtml(s.name)}" title="${warn ? 'Adding this ship breaks the battleship ratio; allowed, but flagged' : 'Add to fleet'}">+</button>
        </div>
        <div class="ship-detail"><div class="ship-detail-pad">
          ${warn ? `<div class="pick-warn-box">⚠ Requires ${(countBattleships(fleet)+1)*3} cruisers in the fleet; you can add it anyway and fix this later.</div>` : ''}
          ${shipDetailHtml(s)}
        </div></div>
      </div>`;
    });
  }
  $('picker-body').innerHTML = html || `<div class="pick-none">No ships match.</div>`;
}

/* ── Fleet mutations ───────────────────────────────────────── */
function addShip(shipId) {
  const fleet = getFleet();
  const s = shipDef(shipId);
  if (!fleet || !s) return;

  if (s.category === 'Fleet Commander') {
    const had = !!fleet.commander;
    fleet.commander = { shipId, name: s.name, pts: s.pts, rerolls: 0 };
    showToast(had ? `${s.name} set as Fleet Commander` : `${s.name} added as Fleet Commander`);
  } else if (s.category === 'Escort') {
    const sq = fleet.squadrons.find(x => x.shipId === shipId);
    if (sq) {
      if (sq.count >= 6) { showToast(`A squadron can have at most 6 ships`); return; }
      sq.count++; showToast(`${s.name} added (${sq.count} in squadron)`);
    }
    else { fleet.squadrons.push({ shipId, count: 2, upgrades: [] }); showToast(`${s.name} squadron added (2 ships)`); }
  } else {
    fleet.ships.push({ shipId, qty: 1, upgrades: [], _idx: Date.now() });
    showToast(`${s.name} added`);
  }
  saveFleets();
  renderFleet();
}
function removeShip(i) {
  const fleet = getFleet();
  const s = shipDef(fleet.ships[i]?.shipId);
  fleet.ships.splice(i, 1);
  saveFleets(); renderFleet();
  if (s) showToast(`${s.name} removed`);
}

/* ── Wizard ────────────────────────────────────────────────── */
function wizGoto(step) {
  wizStep = step;
  document.querySelectorAll('.wstep').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('active', n === step);
    el.classList.toggle('done', n < step);
  });
  $('wiz-step-1').hidden = step !== 1;
  $('wiz-step-2').hidden = step !== 2;
  $('wiz-step-3').hidden = step !== 3;
  $('btn-wiz-back').hidden = step === 1;
  const next = $('btn-wiz-next');
  if (step === 1) { next.textContent = 'Continue ›'; next.disabled = !wizDraft.faction; }
  if (step === 2) { next.textContent = 'Continue ›'; next.disabled = !wizDraft.fleetList; }
  if (step === 3) { next.textContent = 'Create Fleet'; next.disabled = false; }
}
function renderWizard() {
  const grid = $('faction-grid');
  grid.innerHTML = Object.entries(DB.factions).map(([name, f]) => {
    const m = fmeta(name);
    return `
    <button class="faction-cell ${wizDraft.faction === name ? 'selected' : ''}" data-faction="${escHtml(name)}" style="${fstyle(name)}">
      <span class="faction-icon"></span>
      <span>
        <span class="faction-cell-name" style="display:block">${escHtml(m.short)}</span>
        <span class="faction-cell-sub" style="display:block">${f.ships.length} classes</span>
      </span>
    </button>`;
  }).join('');
}
function renderWizardLists() {
  const fac = DB.factions[wizDraft.faction];
  const lists = fac ? fac.fleetLists : [];
  const box = $('fleet-list-options');
  if (!lists.length) {
    box.innerHTML = `<p class="wiz-note">This faction has no named fleet lists — you can skip this step.</p>`;
    wizDraft.fleetList = '';
    return;
  }
  box.innerHTML =
    `<p class="wiz-note" style="margin:0 0 12px">Ships offered depend on which list you pick.</p>` +
    lists.map(l => `
    <button class="list-opt ${wizDraft.fleetList === l.name ? 'selected' : ''}" data-list="${escHtml(l.name)}">
      <span class="list-opt-name" style="display:block">${escHtml(l.name)}</span>
    </button>`).join('');
}
function commissionFleet() {
  const name = $('new-fleet-name').value.trim() || 'Unnamed Fleet';
  const limit = parseInt($('new-fleet-pts').value, 10) || 1500;
  fleets.push({
    id: Date.now(),
    name, faction: wizDraft.faction,
    fleetList: wizDraft.fleetList || '',
    limit,
    commander: null, ships: [], squadrons: [],
    created: new Date().toISOString(),
  });
  saveFleets();
  activeFleet = fleets.length - 1;
  wizDraft = {}; $('new-fleet-name').value = '';
  wizGoto(1); renderWizard();
  setState('fleet');
  showToast(`${name} created`);
}

/* ── Export & print ────────────────────────────────────────── */
function exportText(fleet) {
  const m = fmeta(fleet.faction);
  const lines = [];
  lines.push(`${fleet.name.toUpperCase()}`);
  lines.push(`${m.short}${fleet.fleetList ? ' / ' + fleet.fleetList : ''}`);
  lines.push(`${fleetTotalPts(fleet)} / ${fleet.limit} pts`);
  lines.push('═'.repeat(40));
  if (fleet.commander) {
    const c = shipDef(fleet.commander.shipId);
    lines.push('', 'FLEET COMMANDER');
    lines.push(`  ${fleet.commander.name || (c && c.name) || 'Commander'}: ${fleet.commander.pts} pts`);
  }
  const byCat = {};
  fleet.ships.forEach(sl => {
    const s = shipDef(sl.shipId); if (!s) return;
    (byCat[s.category] = byCat[s.category] || []).push(sl);
  });
  for (const cat of CAT_ORDER) {
    if (!byCat[cat]) continue;
    lines.push('', cat.toUpperCase() + 'S');
    const seen = {};
    byCat[cat].forEach(sl => {
      const s = shipDef(sl.shipId);
      const dupes = byCat[cat].filter(x => x.shipId === sl.shipId).length;
      let suffix = '';
      if (dupes > 1) { seen[sl.shipId] = seen[sl.shipId] || 0; suffix = ' ' + GREEK[seen[sl.shipId]++ % GREEK.length]; }
      const upg = (sl.upgrades || []).map(u => `${u.name}${u.pts > 0 ? ` (+${u.pts})` : u.pts < 0 ? ` (${u.pts})` : ''}`).join(', ');
      lines.push(`  ${s.name}${suffix}: ${slotPts(sl)} pts${upg ? `  [${upg}]` : ''}`);
    });
  }
  if (fleet.squadrons.length) {
    lines.push('', 'ESCORT SQUADRONS');
    fleet.squadrons.forEach(sq => {
      const s = shipDef(sq.shipId);
      lines.push(`  ${s.name} ×${sq.count}: ${sqdPts(sq)} pts`);
    });
  }
  lines.push('', '═'.repeat(40), `TOTAL: ${fleetTotalPts(fleet)} pts`);
  return lines.join('\n');
}

function openExport() {
  const fleet = getFleet();
  if (!fleet) { showToast('Open a fleet first'); return; }
  $('export-preview').textContent = exportText(fleet);
  openOverlayEl($('overlay-export'));
}

/* ── Backup file: download & import ────────────────────────── */
function downloadFleet(fleet) {
  const data = { bfg: 1, fleet: fleet };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fleet.name.replace(/[^\w\-]+/g, '_') + '.bfg.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Backup file saved');
}
function importFleetFile(file) {
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const data = JSON.parse(reader.result);
      const f = data.fleet || data;   // accept wrapped or bare fleet
      if (!f || !f.faction || !Array.isArray(f.ships)) throw new Error('shape');
      if (!DB.factions[f.faction]) { showToast('Unknown faction; file may be from a different data version'); return; }
      f.id = Date.now();
      f.ships = f.ships || []; f.squadrons = f.squadrons || [];
      fleets.push(f);
      saveFleets();
      activeFleet = fleets.length - 1;
      setState('fleet');
      showToast(`${f.name || 'Fleet'} imported`);
    } catch (e) {
      showToast('That file is not a valid fleet backup');
    }
  };
  reader.readAsText(file);
}

function printCardHtml(ship, opts) {
  const st = ship.stats || {};
  const hits = Math.min(parseInt(st.Hits, 10) || (ship.category === 'Escort' ? 1 : 1), 16);
  const isEscort = ship.category === 'Escort';
  const cells = [
    ['Speed', st.Speed], ['Turns', st.Turns], ['Shields', st.Shields],
    ['Armour', st.Armour], ['Turrets', st.Turrets],
  ].filter(c => c[1]);
  const upgRules = (opts.upgrades || []).map(u => `<b>${escHtml(u.name)}</b>${u.pts > 0 ? ` (+${u.pts} pts)` : u.pts < 0 ? ` (${u.pts} pts)` : ''}`).join(' / ');
  const rules = (ship.specialRules || []).map(r => `<b>${escHtml(r.name)}:</b> ${escHtml(r.effects || '')}`).join(' ');
  return `
  <div class="pcard">
    <div class="pcard-head">
      <span class="pcard-class">${escHtml(ship.name)}${opts.suffix ? ' ' + opts.suffix : ''}</span>
      <span class="pcard-pts">${opts.pts} pts</span>
    </div>
    <div class="pcard-sub">
      <span>${escHtml(opts.factionShort)}</span>
      <span style="margin-left:auto">${escHtml(opts.fleetName)}</span>
    </div>
    ${shipArt(ship.id) ? `<img class="pcard-art" src="${shipArt(ship.id)}" alt="">` : ''}
    <div class="pcard-body" style="flex-direction:column">
      ${cells.length ? `<div class="pcard-statrow">${cells.map(c =>
        `<div class="pcard-stat"><b>${escHtml(c[1])}</b><span>${c[0]}</span></div>`).join('')}</div>` : ''}
      <div class="pcard-hits">
        <span class="pcard-hits-label">${isEscort ? `Squadron (${opts.count || 1})` : 'Hits'}</span>
        ${Array.from({ length: isEscort ? (opts.count || 1) : hits }, () => '<span class="hit-box"></span>').join('')}
        <span class="pcard-hits-label" style="margin-left:2mm">Ld</span><span class="hit-box" style="border-color:#333"></span>
      </div>
      ${ship.armament && ship.armament.length ? `
      <table class="pcard-arm">
        <thead><tr><th>Armament</th><th>Range/Speed</th><th>FP/Str</th><th>Arc</th></tr></thead>
        <tbody>${ship.armament.map(a => `
          <tr><td>${escHtml(a.name)}</td><td>${escHtml(a['Range/Speed'] || '-')}</td><td>${escHtml(a['Firepower/Str'] || '-')}</td><td class="pcard-arc">${arcIconSvg(a['Fire Arc'])}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
      ${(rules || upgRules) ? `<div class="pcard-rules">${upgRules}${upgRules && rules ? ' / ' : ''}${rules}</div>` : ''}
      ${!isEscort ? `
      <div class="pcard-crit">
        <div class="pcard-crit-label">Critical Damage (2D6, see reference sheet)</div>
        <div class="crit-track">${CRIT_TABLE.map(c => `<span class="crit-cell">${c.roll}${c.extra ? `<i>${c.extra}</i>` : ''}</span>`).join('')}</div>
      </div>` : ''}
    </div>
  </div>`;
}

// One shared page ahead of the ship cards: the full 2D6 critical hits
// table (players need this at the table every game) and a legend for the
// fire-arc diagrams printed on each card.
function buildReferenceSheetHtml() {
  return `<div class="print-reference">
    <h1>Quick Reference</h1>
    <div class="pr-sub">Critical Hits &amp; Fire Arcs</div>
    <h2>Critical Hits Table (2D6)</h2>
    <table class="ref-crit">
      <thead><tr><th>Roll</th><th>Location</th><th>Effect</th></tr></thead>
      <tbody>${CRIT_TABLE.map(c => `
        <tr><td class="ref-roll">${c.roll}${c.extra ? `<span class="ref-extra">${c.extra} dmg</span>` : ''}</td><td class="ref-loc">${escHtml(c.loc)}</td><td>${escHtml(c.effect)}</td></tr>
      `).join('')}</tbody>
    </table>
    <h2>Fire Arcs</h2>
    <div class="ref-arcs">
      ${['Front', 'Left', 'Right', 'Rear'].map(a => `<div class="ref-arc-item">${arcIconSvg(a)}<span>${a}</span></div>`).join('')}
      <div class="ref-arc-item">${arcIconSvg('All Around')}<span>All Around</span></div>
    </div>
    <p class="ref-note">The shaded quadrant(s) show which side of the ship a weapon can fire into — the small triangle marks the bow. "All Around" weapons (mostly turrets) may fire in any direction.</p>
  </div>`;
}

function printCards() {
  const fleet = getFleet();
  if (!fleet) return;
  const short = fmeta(fleet.faction).short;
  const cards = [];
  if (fleet.commander) {
    const c = shipDef(fleet.commander.shipId);
    if (c) cards.push(printCardHtml(c, { pts: fleet.commander.pts, factionShort: short, fleetName: fleet.name }));
  }
  const byId = {};
  fleet.ships.forEach(sl => { byId[sl.shipId] = (byId[sl.shipId] || 0) + 1; });
  const byCat = {};
  fleet.ships.forEach(sl => {
    const s = shipDef(sl.shipId); if (!s) return;
    (byCat[s.category] = byCat[s.category] || []).push(sl);
  });
  const seen = {};
  CAT_ORDER.forEach(cat => {
    (byCat[cat] || []).forEach(sl => {
      const s = shipDef(sl.shipId); if (!s) return;
      let suffix = '';
      if (byId[sl.shipId] > 1) { seen[sl.shipId] = seen[sl.shipId] || 0; suffix = GREEK[seen[sl.shipId]++ % GREEK.length]; }
      cards.push(printCardHtml(s, { pts: slotPts(sl), suffix, upgrades: sl.upgrades, factionShort: short, fleetName: fleet.name }));
    });
  });
  fleet.squadrons.forEach(sq => {
    const s = shipDef(sq.shipId); if (!s) return;
    cards.push(printCardHtml(s, { pts: sqdPts(sq), count: sq.count, factionShort: short, fleetName: fleet.name }));
  });
  $('print-root').innerHTML = buildReferenceSheetHtml() + `<div class="print-grid">${cards.join('')}</div>`;
  window.print();
}

function printRoster() {
  const fleet = getFleet();
  if (!fleet) return;
  const m = fmeta(fleet.faction);
  let html = `<div class="print-roster">
    <h1>${escHtml(fleet.name)}</h1>
    <div class="pr-sub">${escHtml(m.short)}${fleet.fleetList ? ' / ' + escHtml(fleet.fleetList) : ''} (${fleetTotalPts(fleet)} / ${fleet.limit} pts)</div>`;
  if (fleet.commander) {
    const c = shipDef(fleet.commander.shipId);
    html += `<h2>Fleet Commander</h2><table><tr><td>${escHtml(fleet.commander.name || (c && c.name) || '')}</td><td class="pr-pts">${fleet.commander.pts} pts</td></tr></table>`;
  }
  const byCat = {};
  fleet.ships.forEach(sl => {
    const s = shipDef(sl.shipId); if (!s) return;
    (byCat[s.category] = byCat[s.category] || []).push(sl);
  });
  for (const cat of CAT_ORDER) {
    if (!byCat[cat]) continue;
    html += `<h2>${escHtml(cat)}s</h2><table>`;
    const seen = {};
    byCat[cat].forEach(sl => {
      const s = shipDef(sl.shipId);
      const dupes = byCat[cat].filter(x => x.shipId === sl.shipId).length;
      let suffix = '';
      if (dupes > 1) { seen[sl.shipId] = seen[sl.shipId] || 0; suffix = ' ' + GREEK[seen[sl.shipId]++ % GREEK.length]; }
      const upg = (sl.upgrades || []).map(u => u.name).join(', ');
      html += `<tr><td>${escHtml(s.name)}${suffix}${upg ? ` <i>(${escHtml(upg)})</i>` : ''}</td><td class="pr-pts">${slotPts(sl)} pts</td></tr>`;
    });
    html += `</table>`;
  }
  if (fleet.squadrons.length) {
    html += `<h2>Escort Squadrons</h2><table>`;
    fleet.squadrons.forEach(sq => {
      const s = shipDef(sq.shipId);
      html += `<tr><td>${escHtml(s.name)} ×${sq.count}</td><td class="pr-pts">${sqdPts(sq)} pts</td></tr>`;
    });
    html += `</table>`;
  }
  html += `<table><tr class="pr-total"><td>TOTAL</td><td class="pr-pts">${fleetTotalPts(fleet)} pts</td></tr></table></div>`;
  $('print-root').innerHTML = html;
  window.print();
}

/* ── Upgrades modal ────────────────────────────────────────── */
let modalSlotIdx = null;
function openUpgrades(slotIdx) {
  const fleet = getFleet();
  const sl = fleet.ships[slotIdx];
  const s = shipDef(sl.shipId);
  if (!s || !s.upgrades || !s.upgrades.length) return;
  modalSlotIdx = slotIdx;
  renderUpgradeBody();
  openOverlayEl($('modal-upgrades'));
}
function renderUpgradeBody() {
  const fleet = getFleet();
  const sl = fleet.ships[modalSlotIdx];
  const s = shipDef(sl.shipId);
  $('modal-title').textContent = `Upgrades: ${s.name}`;
  $('modal-body').innerHTML = s.upgrades.map((g, gi) => `
    <div class="upg-group">
      <div class="upg-group-name">${escHtml(g.group || 'Options')}</div>
      ${g.options.map(o => {
        const sel = (sl.upgrades || []).some(u => u.id === o.id);
        return `
        <button class="upg-opt ${sel ? 'selected' : ''}" data-upg-id="${o.id}" data-upg-group="${gi}">
          <span class="upg-check"></span>
          <span class="upg-opt-name">${escHtml(o.name)}${o.description ? `<span class="upg-opt-desc" style="display:block">${escHtml(o.description)}</span>` : ''}</span>
          <span class="upg-opt-pts">${o.pts > 0 ? '+' + o.pts : o.pts === 0 ? 'free' : o.pts}</span>
        </button>`;
      }).join('')}
    </div>`).join('');
}
function toggleUpgrade(optId, groupIdx) {
  const fleet = getFleet();
  const sl = fleet.ships[modalSlotIdx];
  const s = shipDef(sl.shipId);
  const group = s.upgrades[groupIdx];
  const opt = group.options.find(o => o.id === optId);
  if (!opt) return;
  sl.upgrades = sl.upgrades || [];
  const had = sl.upgrades.some(u => u.id === optId);
  // options within a group are exclusive, so clear the group first
  const groupIds = new Set(group.options.map(o => o.id));
  sl.upgrades = sl.upgrades.filter(u => !groupIds.has(u.id));
  if (!had) sl.upgrades.push({ id: opt.id, name: opt.name, pts: opt.pts || 0 });
  saveFleets();
  renderUpgradeBody(); // re-render modal in place (keeps focus tracking)
  renderFleet();
}

/* ── Fleet menu actions ────────────────────────────────────── */
function renameFleet() {
  const fleet = getFleet();
  const name = window.prompt('Rename fleet:', fleet.name);
  if (name && name.trim()) {
    fleet.name = name.trim();
    saveFleets(); renderFleet();
  }
}
function duplicateFleet() {
  const fleet = getFleet();
  const copy = JSON.parse(JSON.stringify(fleet));
  copy.id = Date.now();
  copy.name = fleet.name + ' (Copy)';
  copy.created = new Date().toISOString();
  fleets.push(copy);
  saveFleets();
  showToast(`${copy.name} created`);
}
function deleteFleet() {
  const fleet = getFleet();
  if (!window.confirm(`Delete "${fleet.name}"? This cannot be undone.`)) return;
  fleets.splice(activeFleet, 1);
  activeFleet = null;
  saveFleets();
  setState('home');
  showToast('Fleet deleted');
}

/* ── Events ────────────────────────────────────────────────── */
function bindEvents() {
  // masthead
  $('btn-back-home').addEventListener('click', () => { activeFleet = null; setState('home'); });
  $('btn-export').addEventListener('click', openExport);
  $('btn-theme-toggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  $('btn-fleet-menu').addEventListener('click', e => {
    e.stopPropagation();
    $('fleet-menu-dropdown').hidden = !$('fleet-menu-dropdown').hidden;
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.mast-actions')) $('fleet-menu-dropdown').hidden = true;
  });
  $('fleet-menu-rename').addEventListener('click', () => { $('fleet-menu-dropdown').hidden = true; renameFleet(); });
  $('fleet-menu-duplicate').addEventListener('click', () => { $('fleet-menu-dropdown').hidden = true; duplicateFleet(); });
  $('fleet-menu-delete').addEventListener('click', () => { $('fleet-menu-dropdown').hidden = true; deleteFleet(); });

  // home
  $('fleet-index').addEventListener('click', e => {
    const row = e.target.closest('[data-open]');
    if (row) { activeFleet = +row.dataset.open; setState('fleet'); }
  });
  $('btn-new-fleet').addEventListener('click', () => {
    openRegistryMobile();  // no-op visually on desktop (wizard already visible)
    document.querySelector('.registry-inner').scrollTop = 0;
  });

  // registry mobile close
  $('btn-close-registry').addEventListener('click', closeRegistryMobile);

  // bottom nav
  document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'home') { if (state === 'fleet') { activeFleet = null; setState('home'); } closeRegistryMobile(); }
      if (nav === 'add') { openRegistryMobile(); }
      if (nav === 'export') { openExport(); }
    });
  });

  // wizard
  $('faction-grid').addEventListener('click', e => {
    const cell = e.target.closest('[data-faction]');
    if (!cell) return;
    wizDraft.faction = cell.dataset.faction;
    wizDraft.fleetList = undefined;
    renderWizard();
    $('btn-wiz-next').disabled = false;
  });
  $('fleet-list-options').addEventListener('click', e => {
    const opt = e.target.closest('[data-list]');
    if (!opt) return;
    wizDraft.fleetList = opt.dataset.list;
    renderWizardLists();
    $('btn-wiz-next').disabled = false;
  });
  $('btn-wiz-back').addEventListener('click', () => wizGoto(wizStep - 1));
  $('btn-wiz-next').addEventListener('click', () => {
    if (wizStep === 1) {
      renderWizardLists();
      const fac = DB.factions[wizDraft.faction];
      if (!fac || !fac.fleetLists.length) { wizDraft.fleetList = ''; wizGoto(2); $('btn-wiz-next').disabled = false; }
      else wizGoto(2);
    }
    else if (wizStep === 2) wizGoto(3);
    else commissionFleet();
  });
  $('pts-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-pts]');
    if (!chip) return;
    document.querySelectorAll('.pts-chip').forEach(c => c.classList.toggle('active', c === chip));
    $('new-fleet-pts').value = chip.dataset.pts;
  });
  $('new-fleet-pts').addEventListener('input', () => {
    document.querySelectorAll('.pts-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.pts === $('new-fleet-pts').value));
  });

  // picker
  $('picker-tabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    pickerCategory = tab.dataset.tab;
    renderPicker(getFleet());
  });
  $('picker-search').addEventListener('input', e => {
    pickerSearch = e.target.value;
    $('btn-search-clear').hidden = !pickerSearch;
    renderPicker(getFleet());
  });
  $('btn-search-clear').addEventListener('click', () => {
    pickerSearch = '';
    $('picker-search').value = '';
    $('btn-search-clear').hidden = true;
    renderPicker(getFleet());
  });
  $('picker-body').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { addShip(add.dataset.add); return; }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const open = toggle.closest('.pick-row').classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    }
  });

  // manifest
  $('fleet-body').addEventListener('click', e => {
    const t = e.target;
    const removeCmd = t.closest('[data-remove-cmd]');
    if (removeCmd) { getFleet().commander = null; saveFleets(); renderFleet(); showToast('Commander removed'); return; }
    const rem = t.closest('[data-remove]');
    if (rem) { removeShip(+rem.dataset.remove); return; }
    const remSqd = t.closest('[data-remove-sqd]');
    if (remSqd) {
      const fleet = getFleet();
      fleet.squadrons.splice(+remSqd.dataset.removeSqd, 1);
      saveFleets(); renderFleet(); showToast('Squadron removed'); return;
    }
    const inc = t.closest('[data-sqd-inc]');
    if (inc) {
      const sq = getFleet().squadrons[+inc.dataset.sqdInc];
      if (sq.count >= 6) { showToast('Squadrons field at most 6 ships'); return; }
      sq.count++; saveFleets(); renderFleet(); return;
    }
    const dec = t.closest('[data-sqd-dec]');
    if (dec) {
      const sq = getFleet().squadrons[+dec.dataset.sqdDec];
      if (sq.count > 1) { sq.count--; saveFleets(); renderFleet(); }
      return;
    }
    const upg = t.closest('[data-upgrades]');
    if (upg) { openUpgrades(+upg.dataset.upgrades); return; }
    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      const open = toggle.closest('.ship-row').classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    }
  });

  // export overlay
  $('btn-close-export').addEventListener('click', () => closeOverlayEl($('overlay-export')));
  $('overlay-export').addEventListener('click', e => { if (e.target === $('overlay-export')) closeOverlayEl($('overlay-export')); });
  $('btn-print-cards').addEventListener('click', printCards);
  $('btn-print-roster').addEventListener('click', printRoster);
  $('btn-copy-text').addEventListener('click', () => {
    navigator.clipboard.writeText($('export-preview').textContent)
      .then(() => showToast('Fleet list copied'))
      .catch(() => showToast('Copy failed; select the text manually'));
  });
  $('btn-download-fleet').addEventListener('click', () => { const f = getFleet(); if (f) downloadFleet(f); });

  // import (home)
  $('btn-import-fleet').addEventListener('click', () => $('import-file-input').click());
  $('import-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importFleetFile(file);
    e.target.value = '';
  });

  // upgrades modal
  $('modal-close').addEventListener('click', () => closeOverlayEl($('modal-upgrades')));
  $('modal-upgrades').addEventListener('click', e => {
    if (e.target === $('modal-upgrades')) { closeOverlayEl($('modal-upgrades')); return; }
    const opt = e.target.closest('[data-upg-id]');
    if (opt) toggleUpgrade(opt.dataset.upgId, +opt.dataset.upgGroup);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') { trapTab(e); return; }
    if (e.key === 'Escape') {
      closeOverlayEl($('overlay-export'));
      closeOverlayEl($('modal-upgrades'));
      $('fleet-menu-dropdown').hidden = true;
      closeRegistryMobile();
    }
  });
}

/* ── Boot ──────────────────────────────────────────────────── */
async function boot() {
  initTheme();
  try {
    const res = await fetch('data/ship_database.json');
    DB = await res.json();
  } catch (e) {
    DB = null;
  }
  try {
    const ids = await (await fetch('images/ships/manifest.json')).json();
    ART = new Set(ids);
  } catch (e) { ART = new Set(); }
  if (!DB) {
    document.body.innerHTML = `<div style="padding:40px;font-family:serif;text-align:center">
      <h1 style="font-size:22px">Couldn't load ship data</h1>
      <p style="opacity:.7">ship_database.json failed to load; serve this app over HTTP.</p></div>`;
    return;
  }
  loadFleets();
  bindEvents();
  renderWizard();
  wizGoto(1);
  setState('home');
}
boot();

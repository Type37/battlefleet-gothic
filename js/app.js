/* ═══════════════════════════════════════════════════════════════
   BATTLEFLEET GOTHIC — FLEET REGISTRY
   Vanilla JS. No dependencies. localStorage persistence.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── Constants ─────────────────────────────────────────────── */
const STORE_KEY = 'bfg-fleets';
const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π'];
const CAT_ORDER = ['Fleet Commander','Battleship','Grand Cruiser','Battlecruiser','Heavy Cruiser','Cruiser','Light Cruiser','Escort'];
const CRUISER_CATS = new Set(['Cruiser','Battlecruiser','Light Cruiser','Heavy Cruiser','Grand Cruiser']);

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
  const m = fmeta(faction);
  return `--fi:url('assets/icons/${m.icon}');--fc:${m.color}`;
}

/* ── State ─────────────────────────────────────────────────── */
let DB = null;
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
    issues.push({ type: 'err', msg: `${bs} battleship${bs>1?'s':''} require${bs>1?'':'s'} ${bs*3} cruisers — add ${bs*3 - cr} more.`, affectsCategory: 'Battleship' });
  }
  fleet.squadrons.forEach(sq => {
    const s = shipDef(sq.shipId);
    if (!s) return;
    if (sq.count < 2) issues.push({ type: 'warn', msg: `${s.name} squadron needs at least 2 ships (currently ${sq.count}).` });
    if (sq.count > 6) issues.push({ type: 'warn', msg: `${s.name} squadron exceeds the maximum of 6 ships (${sq.count}).` });
  });
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
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function statsRun(ship) {
  const st = ship.stats || {};
  const bits = [];
  if (st.Hits)    bits.push(`<b>${escHtml(st.Hits)}</b> Hits`);
  if (st.Shields) bits.push(`<b>${escHtml(st.Shields)}</b> Shields`);
  if (st.Armour)  bits.push(`Armour <b>${escHtml(st.Armour)}</b>`);
  if (st.Speed)   bits.push(`<b>${escHtml(st.Speed)}</b>`);
  if (!bits.length) return escHtml(ship.category);
  return bits.join('<span class="stat-sep">·</span>');
}
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
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
        <span class="fleet-row-sub">${escHtml(m.short)}${f.fleetList ? ' · ' + escHtml(f.fleetList) : ''}</span>
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
  $('fleet-faction-display').textContent = m.short + (fleet.fleetList ? ' · ' + fleet.fleetList : '');
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
        <button class="row-x" data-remove-cmd aria-label="Remove commander">✕</button>
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
    html += `<div class="man-band"><span>${escHtml(cat)}s</span><span class="man-band-count">×${group.length}</span><span class="man-band-pts">${catPts} pts</span></div>`;

    // greek indices per shipId
    const seen = {};
    group.forEach(g => {
      const dupes = group.filter(x => x.sl.shipId === g.sl.shipId).length;
      let suffix = '';
      if (dupes > 1) {
        seen[g.sl.shipId] = (seen[g.sl.shipId] || 0);
        suffix = `<span class="greek">${GREEK[seen[g.sl.shipId] % GREEK.length]}</span>`;
        seen[g.sl.shipId]++;
      }
      const invalid = bsInvalid && g.s.category === 'Battleship';
      const upgTags = (g.sl.upgrades || []).map(u =>
        `<span class="upg-tag">${escHtml(u.name)}${u.pts ? ` +${u.pts}` : ''}</span>`).join('');
      html += `
      <div class="ship-row ${invalid ? 'invalid' : ''}" data-slot="${g.i}">
        <button class="ship-row-top" data-toggle>
          <span class="ship-row-main">
            <span class="ship-row-name">${escHtml(g.s.name)}${suffix}</span>
            <span class="ship-row-stats">${statsRun(g.s)}</span>
            ${invalid ? '<span class="ship-row-flag">⚠ Needs cruiser escort</span>' : ''}
          </span>
          <span class="ship-row-pts">${slotPts(g.sl)}<small>pts</small></span>
        </button>
        <div class="ship-detail"><div class="ship-detail-pad">
          ${shipDetailHtml(g.s)}
          ${upgTags ? `<div style="margin-top:6px">${upgTags}</div>` : ''}
          <div class="detail-actions">
            ${g.s.upgrades && g.s.upgrades.length ? `<button class="chip-btn" data-upgrades="${g.i}">Refit / Upgrades</button>` : ''}
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
          <button class="ship-row-main" data-toggle style="all:unset;flex:1;min-width:0;cursor:pointer">
            <span class="ship-row-name" style="display:block">${escHtml(s.name)}</span>
            <span class="ship-row-stats" style="display:block">Squadron of <b>${sq.count}</b><span class="stat-sep">·</span>${statsRun(s)}</span>
            ${bad ? `<span class="ship-row-flag" style="display:block">⚠ Squadrons field 2–6 ships</span>` : ''}
          </button>
          <span class="sqd-step">
            <button class="sqd-btn" data-sqd-dec="${i}" ${sq.count <= 1 ? 'disabled' : ''}>−</button>
            <span class="sqd-count">${sq.count}</span>
            <button class="sqd-btn" data-sqd-inc="${i}">+</button>
          </span>
          <span class="ship-row-pts">${sqdPts(sq)}<small>pts</small></span>
          <button class="row-x" data-remove-sqd="${i}" aria-label="Remove squadron">✕</button>
        </div>
        <div class="ship-detail"><div class="ship-detail-pad">${shipDetailHtml(s)}</div></div>
      </div>`;
    });
  }

  if (!html) {
    html = `<div class="empty-state">
      <div class="empty-rule"></div>
      <div class="empty-title">No ships on the manifest</div>
      <div class="empty-sub">Requisition vessels from the naval registry.</div>
      <div class="empty-rule"></div>
    </div>`;
  }
  body.innerHTML = html;
}

function shipDetailHtml(ship) {
  let html = '';
  const st = ship.stats || {};
  const cells = [
    ['Speed', st.Speed], ['Turns', st.Turns], ['Shields', st.Shields],
    ['Armour', st.Armour], ['Turrets', st.Turrets], ['Hits', st.Hits],
  ].filter(c => c[1]);
  if (cells.length) {
    html += `<div class="stat-strip">${cells.map(c =>
      `<div class="stat-cell"><b>${escHtml(c[1])}</b><span>${c[0]}</span></div>`).join('')}</div>`;
  }
  if (ship.armament && ship.armament.length) {
    html += `<table class="arm-table">
      <thead><tr><th>Armament</th><th>Range / Speed</th><th>FP / Str</th><th>Arc</th></tr></thead>
      <tbody>${ship.armament.map(a => `
        <tr><td>${escHtml(a.name)}</td><td>${escHtml(a['Range/Speed'] || '—')}</td><td>${escHtml(a['Firepower/Str'] || '—')}</td><td>${escHtml(a['Fire Arc'] || '—')}</td></tr>
      `).join('')}</tbody>
    </table>`;
  }
  if (ship.specialRules && ship.specialRules.length) {
    html += ship.specialRules.map(r =>
      `<div class="rule-block"><b>${escHtml(r.name)}</b><p>${escHtml(r.effects || '')}</p></div>`).join('');
  }
  return html || '<p class="wiz-note">No further data held in the registry for this class.</p>';
}

/* ── Picker render ─────────────────────────────────────────── */
function pickerShips(fleet) {
  const fac = DB.factions[fleet.faction];
  if (!fac) return [];
  return fac.ships.map(id => DB.ships[id]).filter(Boolean);
}
function renderPicker(fleet) {
  const ships = pickerShips(fleet);
  const cats = CAT_ORDER.filter(c => ships.some(s => s.category === c));

  // tabs
  const tabs = ['All', ...cats];
  if (!tabs.includes(pickerCategory)) pickerCategory = 'All';
  $('picker-tabs').innerHTML = tabs.map(t =>
    `<button class="cat-tab ${t === pickerCategory ? 'active' : ''}" data-tab="${escHtml(t)}" role="tab">${escHtml(t === 'All' ? 'All' : t + 's')}</button>`
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
    if (pickerCategory === 'All') html += `<div class="pick-cat-head">${escHtml(cat)}s</div>`;
    list.slice().sort((a, b) => b.pts - a.pts).forEach(s => {
      const warn = bsWouldViolate(s.category);
      html += `
      <div class="pick-row" data-ship="${s.id}">
        <div class="pick-row-top">
          <button class="pick-row-main" data-toggle style="all:unset;flex:1;min-width:0;cursor:pointer">
            <span class="pick-row-name" style="display:block">${escHtml(s.name)}</span>
            <span class="pick-row-stats" style="display:block">${statsRun(s)}</span>
          </button>
          <span class="pick-row-pts">${s.pts}<small style="display:block;font-size:9px;font-weight:400;color:var(--faint);text-align:right;letter-spacing:1px">pts</small></span>
          <button class="pick-add ${warn ? 'warn' : ''}" data-add="${s.id}" aria-label="Add ${escHtml(s.name)}" title="${warn ? 'Adding this ship breaks the battleship ratio — allowed, but flagged' : 'Add to fleet'}">+</button>
        </div>
        <div class="ship-detail"><div class="ship-detail-pad">
          ${warn ? `<div class="pick-warn-box">⚠ Requires ${(countBattleships(fleet)+1)*3} cruisers in the fleet — you may add it anyway and fix the manifest later.</div>` : ''}
          ${shipDetailHtml(s)}
        </div></div>
      </div>`;
    });
  }
  $('picker-body').innerHTML = html || `<div class="pick-none">No vessels of this class answer the summons.</div>`;
}

/* ── Fleet mutations ───────────────────────────────────────── */
function addShip(shipId) {
  const fleet = getFleet();
  const s = shipDef(shipId);
  if (!fleet || !s) return;

  if (s.category === 'Fleet Commander') {
    const had = !!fleet.commander;
    fleet.commander = { shipId, name: s.name, pts: s.pts, rerolls: 0 };
    showToast(had ? `${s.name} assumes command` : `${s.name} takes command of the fleet`);
  } else if (s.category === 'Escort') {
    const sq = fleet.squadrons.find(x => x.shipId === shipId);
    if (sq) { sq.count++; showToast(`${s.name} joins the squadron (${sq.count})`); }
    else { fleet.squadrons.push({ shipId, count: 2, upgrades: [] }); showToast(`${s.name} squadron formed (2 ships)`); }
  } else {
    fleet.ships.push({ shipId, qty: 1, upgrades: [], _idx: Date.now() });
    showToast(`${s.name} added to the manifest`);
  }
  saveFleets();
  renderFleet();
}
function removeShip(i) {
  const fleet = getFleet();
  const s = shipDef(fleet.ships[i]?.shipId);
  fleet.ships.splice(i, 1);
  saveFleets(); renderFleet();
  if (s) showToast(`${s.name} struck from the manifest`);
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
  if (step === 3) { next.textContent = '✠ Commission Fleet'; next.disabled = false; }
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
    box.innerHTML = `<p class="wiz-note">This registry holds no named fleet lists — the fleet will be chartered unaligned.</p>`;
    wizDraft.fleetList = '';
    return;
  }
  box.innerHTML = lists.map(l => `
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
  showToast(`${name} enters the registry`);
}

/* ── Export & print ────────────────────────────────────────── */
function exportText(fleet) {
  const m = fmeta(fleet.faction);
  const lines = [];
  lines.push(`${fleet.name.toUpperCase()}`);
  lines.push(`${m.short}${fleet.fleetList ? ' — ' + fleet.fleetList : ''}`);
  lines.push(`${fleetTotalPts(fleet)} / ${fleet.limit} pts`);
  lines.push('═'.repeat(40));
  if (fleet.commander) {
    const c = shipDef(fleet.commander.shipId);
    lines.push('', 'FLEET COMMANDER');
    lines.push(`  ${fleet.commander.name || (c && c.name) || 'Commander'} — ${fleet.commander.pts} pts`);
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
      const upg = (sl.upgrades || []).map(u => `${u.name}${u.pts ? ` (+${u.pts})` : ''}`).join(', ');
      lines.push(`  ${s.name}${suffix} — ${slotPts(sl)} pts${upg ? `  [${upg}]` : ''}`);
    });
  }
  if (fleet.squadrons.length) {
    lines.push('', 'ESCORT SQUADRONS');
    fleet.squadrons.forEach(sq => {
      const s = shipDef(sq.shipId);
      lines.push(`  ${s.name} ×${sq.count} — ${sqdPts(sq)} pts`);
    });
  }
  lines.push('', '═'.repeat(40), `TOTAL: ${fleetTotalPts(fleet)} pts`);
  return lines.join('\n');
}

function openExport() {
  const fleet = getFleet();
  if (!fleet) { showToast('Open a fleet first'); return; }
  $('export-preview').textContent = exportText(fleet);
  $('overlay-export').hidden = false;
}

function printCardHtml(ship, opts) {
  const st = ship.stats || {};
  const hits = Math.min(parseInt(st.Hits, 10) || (ship.category === 'Escort' ? 1 : 1), 16);
  const isEscort = ship.category === 'Escort';
  const cells = [
    ['Speed', st.Speed], ['Turns', st.Turns], ['Shields', st.Shields],
    ['Armour', st.Armour], ['Turrets', st.Turrets],
  ].filter(c => c[1]);
  const upgRules = (opts.upgrades || []).map(u => `<b>${escHtml(u.name)}</b>${u.pts ? ` (+${u.pts} pts)` : ''}`).join(' · ');
  const rules = (ship.specialRules || []).map(r => `<b>${escHtml(r.name)}:</b> ${escHtml(r.effects || '')}`).join(' ');
  return `
  <div class="pcard">
    <div class="pcard-head">
      <span class="pcard-class">${escHtml(ship.category)} — ${escHtml(ship.name)}${opts.suffix ? ' ' + opts.suffix : ''}</span>
      <span class="pcard-pts">${opts.pts} pts</span>
    </div>
    <div class="pcard-sub">
      <span>${escHtml(opts.factionShort)}</span>
      <span style="margin-left:auto">${escHtml(opts.fleetName)}</span>
    </div>
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
          <tr><td>${escHtml(a.name)}</td><td>${escHtml(a['Range/Speed'] || '—')}</td><td>${escHtml(a['Firepower/Str'] || '—')}</td><td>${escHtml(a['Fire Arc'] || '—')}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
      ${(rules || upgRules) ? `<div class="pcard-rules">${upgRules}${upgRules && rules ? ' — ' : ''}${rules}</div>` : ''}
      ${!isEscort ? `
      <div class="pcard-crit">
        <div class="pcard-crit-label">Critical Damage</div>
        <div class="crit-track">${[2,3,4,5,6,7,8,9,10].map(n => `<span class="crit-cell">${n}</span>`).join('')}</div>
      </div>` : ''}
    </div>
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
  const seen = {};
  fleet.ships.forEach(sl => {
    const s = shipDef(sl.shipId); if (!s) return;
    let suffix = '';
    if (byId[sl.shipId] > 1) { seen[sl.shipId] = seen[sl.shipId] || 0; suffix = GREEK[seen[sl.shipId]++ % GREEK.length]; }
    cards.push(printCardHtml(s, { pts: slotPts(sl), suffix, upgrades: sl.upgrades, factionShort: short, fleetName: fleet.name }));
  });
  fleet.squadrons.forEach(sq => {
    const s = shipDef(sq.shipId); if (!s) return;
    cards.push(printCardHtml(s, { pts: sqdPts(sq), count: sq.count, factionShort: short, fleetName: fleet.name }));
  });
  $('print-root').innerHTML = `<div class="print-grid">${cards.join('')}</div>`;
  window.print();
}

function printRoster() {
  const fleet = getFleet();
  if (!fleet) return;
  const m = fmeta(fleet.faction);
  let html = `<div class="print-roster">
    <h1>${escHtml(fleet.name)}</h1>
    <div class="pr-sub">${escHtml(m.short)}${fleet.fleetList ? ' · ' + escHtml(fleet.fleetList) : ''} · ${fleetTotalPts(fleet)} / ${fleet.limit} pts</div>`;
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
  $('modal-title').textContent = `Refit — ${s.name}`;
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
  $('modal-upgrades').hidden = false;
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
  // options within a group are exclusive — clear the group first
  const groupIds = new Set(group.options.map(o => o.id));
  sl.upgrades = sl.upgrades.filter(u => !groupIds.has(u.id));
  if (!had) sl.upgrades.push({ id: opt.id, name: opt.name, pts: opt.pts || 0 });
  saveFleets();
  openUpgrades(modalSlotIdx); // re-render modal
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
  showToast(`${copy.name} entered into the registry`);
}
function deleteFleet() {
  const fleet = getFleet();
  if (!window.confirm(`Strike "${fleet.name}" from the registry? This cannot be undone.`)) return;
  fleets.splice(activeFleet, 1);
  activeFleet = null;
  saveFleets();
  setState('home');
  showToast('Fleet struck from the registry');
}

/* ── Events ────────────────────────────────────────────────── */
function bindEvents() {
  // masthead
  $('btn-back-home').addEventListener('click', () => { activeFleet = null; setState('home'); });
  $('btn-export').addEventListener('click', openExport);
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
    if (toggle) toggle.closest('.pick-row').classList.toggle('open');
  });

  // manifest
  $('fleet-body').addEventListener('click', e => {
    const t = e.target;
    const removeCmd = t.closest('[data-remove-cmd]');
    if (removeCmd) { getFleet().commander = null; saveFleets(); renderFleet(); showToast('Commander relieved of duty'); return; }
    const rem = t.closest('[data-remove]');
    if (rem) { removeShip(+rem.dataset.remove); return; }
    const remSqd = t.closest('[data-remove-sqd]');
    if (remSqd) {
      const fleet = getFleet();
      fleet.squadrons.splice(+remSqd.dataset.removeSqd, 1);
      saveFleets(); renderFleet(); showToast('Squadron disbanded'); return;
    }
    const inc = t.closest('[data-sqd-inc]');
    if (inc) { getFleet().squadrons[+inc.dataset.sqdInc].count++; saveFleets(); renderFleet(); return; }
    const dec = t.closest('[data-sqd-dec]');
    if (dec) {
      const sq = getFleet().squadrons[+dec.dataset.sqdDec];
      if (sq.count > 1) { sq.count--; saveFleets(); renderFleet(); }
      return;
    }
    const upg = t.closest('[data-upgrades]');
    if (upg) { openUpgrades(+upg.dataset.upgrades); return; }
    const toggle = t.closest('[data-toggle]');
    if (toggle) toggle.closest('.ship-row').classList.toggle('open');
  });

  // export overlay
  $('btn-close-export').addEventListener('click', () => $('overlay-export').hidden = true);
  $('overlay-export').addEventListener('click', e => { if (e.target === $('overlay-export')) $('overlay-export').hidden = true; });
  $('btn-print-cards').addEventListener('click', printCards);
  $('btn-print-roster').addEventListener('click', printRoster);
  $('btn-copy-text').addEventListener('click', () => {
    navigator.clipboard.writeText($('export-preview').textContent)
      .then(() => showToast('Fleet list copied'))
      .catch(() => showToast('Copy failed — select the text manually'));
  });

  // upgrades modal
  $('modal-close').addEventListener('click', () => $('modal-upgrades').hidden = true);
  $('modal-upgrades').addEventListener('click', e => {
    if (e.target === $('modal-upgrades')) { $('modal-upgrades').hidden = true; return; }
    const opt = e.target.closest('[data-upg-id]');
    if (opt) toggleUpgrade(opt.dataset.upgId, +opt.dataset.upgGroup);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('overlay-export').hidden = true;
      $('modal-upgrades').hidden = true;
      $('fleet-menu-dropdown').hidden = true;
      closeRegistryMobile();
    }
  });
}

/* ── Boot ──────────────────────────────────────────────────── */
async function boot() {
  try {
    const res = await fetch('data/ship_database.json');
    DB = await res.json();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:serif;color:#e6dfca;text-align:center">
      <h1 style="font-size:22px">The registry archives are unreachable</h1>
      <p style="opacity:.7">ship_database.json failed to load — serve this app over HTTP.</p></div>`;
    return;
  }
  loadFleets();
  bindEvents();
  renderWizard();
  wizGoto(1);
  setState('home');
}
boot();

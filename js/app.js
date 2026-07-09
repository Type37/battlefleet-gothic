'use strict';

const GREEK = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π'];

// ── State ────────────────────────────────────────────────────────────────────
let DB = null;           // ship_database.json
let fleets = [];         // saved fleets array
let activeFleet = null;  // index into fleets
let newFleetDraft = {};  // draft during creation

// ── Load data ────────────────────────────────────────────────────────────────
async function loadDB() {
  try {
    const res = await fetch('data/ship_database.json');
    DB = await res.json();
  } catch (e) {
    showToast('Failed to load ship data — check your connection.');
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────
function saveFleets() {
  localStorage.setItem('bfg-fleets', JSON.stringify(fleets));
}

function loadFleets() {
  try {
    const raw = localStorage.getItem('bfg-fleets');
    fleets = raw ? JSON.parse(raw) : [];
  } catch (e) {
    fleets = [];
  }
}

function getActiveFleet() {
  return activeFleet !== null ? fleets[activeFleet] : null;
}

// ── Fleet model ──────────────────────────────────────────────────────────────
function createFleet(name, faction, fleetList, limit) {
  return {
    id:        Date.now(),
    name,
    faction,
    fleetList,
    limit,
    commander: null,
    ships:     [],      // { shipId, qty, upgrades[], note }
    // escorts grouped into squadrons
    squadrons: [],      // { shipId, count, upgrades[] }
    created:   new Date().toISOString(),
  };
}

function fleetTotalPts(fleet) {
  if (!fleet || !DB) return 0;
  let total = 0;
  if (fleet.commander) total += fleet.commander.pts || 0;
  for (const slot of fleet.ships) {
    const ship = DB.ships[slot.shipId];
    if (!ship) continue;
    let shipPts = ship.pts;
    for (const upg of (slot.upgrades || [])) shipPts += upg.pts || 0;
    total += shipPts * (slot.qty || 1);
  }
  for (const sqd of fleet.squadrons) {
    const ship = DB.ships[sqd.shipId];
    if (!ship) continue;
    let shipPts = ship.pts;
    for (const upg of (sqd.upgrades || [])) shipPts += upg.pts || 0;
    total += shipPts * (sqd.count || 1);
  }
  return total;
}

// ── Validation ───────────────────────────────────────────────────────────────
function validateFleet(fleet) {
  if (!fleet || !DB) return [];
  const issues = [];
  const ships = fleet.ships.map(s => DB.ships[s.shipId]).filter(Boolean);

  const battleships    = ships.filter(s => s.category === 'Battleship').length;
  const cruisers       = ships.filter(s => ['Cruiser','Battlecruiser','Light Cruiser','Heavy Cruiser','Grand Cruiser'].includes(s.category)).length;
  const total          = fleetTotalPts(fleet);

  // Fleet Commander required above 750 pts
  if (total > 750 && !fleet.commander) {
    issues.push({ type: 'err', msg: 'Fleet Commander required for fleets above 750 pts' });
  }

  // Battleship ratio: 1 per 3 cruisers
  if (battleships > 0) {
    const required = battleships * 3;
    if (cruisers < required) {
      const need = required - cruisers;
      issues.push({
        type: 'err',
        msg: battleships + (battleships > 1 ? ' Battleships require' : ' Battleship requires') + ' ' + required + ' cruisers — add ' + need + ' more cruiser' + (need > 1 ? 's' : ''),
        affectsCategory: 'Battleship',
      });
    }
  }

  // Escort squadron size (2–6)
  for (const sqd of fleet.squadrons) {
    if (sqd.count < 2) {
      const ship = DB.ships[sqd.shipId];
      issues.push({ type: 'warn', msg: (ship ? ship.name : 'Escort') + ' squadron needs at least 2 ships (currently ' + sqd.count + ')' });
    }
    if (sqd.count > 6) {
      const ship = DB.ships[sqd.shipId];
      issues.push({ type: 'warn', msg: (ship ? ship.name : 'Escort') + ' squadron exceeds maximum of 6 ships (' + sqd.count + ')' });
    }
  }

  return issues;
}

// Which ship ids are "invalid" (part of a ratio violation)
function invalidShipIds(fleet) {
  const issues = validateFleet(fleet);
  const invalid = new Set();
  if (issues.some(i => i.affectsCategory === 'Battleship')) {
    for (const slot of fleet.ships) {
      const ship = DB.ships[slot.shipId];
      if (ship && ship.category === 'Battleship') invalid.add(slot.shipId);
    }
  }
  return invalid;
}

// Points split: valid / invalid
function ptsSplit(fleet) {
  if (!fleet || !DB) return { valid: 0, invalid: 0 };
  const bad = invalidShipIds(fleet);
  let valid = 0, invalid = 0;
  if (fleet.commander) valid += fleet.commander.pts || 0;
  for (const slot of fleet.ships) {
    const ship = DB.ships[slot.shipId];
    if (!ship) continue;
    let p = ship.pts;
    for (const upg of (slot.upgrades || [])) p += upg.pts || 0;
    p *= (slot.qty || 1);
    if (bad.has(slot.shipId)) invalid += p;
    else valid += p;
  }
  for (const sqd of fleet.squadrons) {
    const ship = DB.ships[sqd.shipId];
    if (!ship) continue;
    let p = ship.pts;
    for (const upg of (sqd.upgrades || [])) p += upg.pts || 0;
    valid += p * (sqd.count || 1);
  }
  return { valid, invalid };
}

// ── Canvas silhouette renderer ────────────────────────────────────────────────
const SIL_CACHE = {};

function drawSilhouette(canvas, category, color) {
  const key = category + '_' + color + '_' + canvas.width + 'x' + canvas.height;
  if (SIL_CACHE[key] === 'drawn') return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Ambient glow background
  const grd = ctx.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.4, color + '18');
  grd.addColorStop(0.7, color + '30');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';

  const cx = w / 2, cy = h / 2;

  function hull(pts, alpha, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.globalAlpha = fill ? alpha * 0.15 : 0;
    if (fill) ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (category === 'Battleship') {
    hull([
      [cx + w*.44, cy],
      [cx + w*.18, cy - h*.2],
      [cx - w*.08, cy - h*.22],
      [cx - w*.44, cy - h*.12],
      [cx - w*.46, cy],
      [cx - w*.44, cy + h*.12],
      [cx - w*.08, cy + h*.22],
      [cx + w*.18, cy + h*.2],
    ], .65, true);
    // spine
    ctx.beginPath(); ctx.moveTo(cx + w*.38, cy); ctx.lineTo(cx - w*.3, cy);
    ctx.globalAlpha = .35; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    // prow spike
    ctx.beginPath(); ctx.moveTo(cx + w*.44, cy); ctx.lineTo(cx + w*.5, cy);
    ctx.globalAlpha = .85; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    // engine block
    ctx.globalAlpha = .3;
    ctx.fillRect(cx - w*.48, cy - h*.07, w*.06, h*.14);
    ctx.globalAlpha = 1;
    // turrets
    [[-.08, -.21], [.08, -.21], [-.08, .21], [.08, .21]].forEach(function(o) {
      ctx.beginPath(); ctx.arc(cx + o[0]*w, cy + o[1]*h, .034*w, 0, Math.PI*2);
      ctx.globalAlpha = .5; ctx.fill(); ctx.globalAlpha = 1;
    });

  } else if (category === 'Battlecruiser' || category === 'Grand Cruiser') {
    hull([
      [cx + w*.42, cy],
      [cx + w*.16, cy - h*.18],
      [cx - w*.06, cy - h*.2],
      [cx - w*.42, cy - h*.1],
      [cx - w*.44, cy],
      [cx - w*.42, cy + h*.1],
      [cx - w*.06, cy + h*.2],
      [cx + w*.16, cy + h*.18],
    ], .6, true);
    ctx.beginPath(); ctx.moveTo(cx + w*.36, cy); ctx.lineTo(cx - w*.28, cy);
    ctx.globalAlpha = .3; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(cx + w*.42, cy); ctx.lineTo(cx + w*.47, cy);
    ctx.globalAlpha = .8; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    [[-.06, -.19], [.06, -.19], [-.06, .19], [.06, .19]].forEach(function(o) {
      ctx.beginPath(); ctx.arc(cx + o[0]*w, cy + o[1]*h, .03*w, 0, Math.PI*2);
      ctx.globalAlpha = .45; ctx.fill(); ctx.globalAlpha = 1;
    });

  } else if (category === 'Cruiser' || category === 'Heavy Cruiser') {
    hull([
      [cx + w*.38, cy],
      [cx + w*.14, cy - h*.16],
      [cx - w*.07, cy - h*.18],
      [cx - w*.38, cy - h*.09],
      [cx - w*.4,  cy],
      [cx - w*.38, cy + h*.09],
      [cx - w*.07, cy + h*.18],
      [cx + w*.14, cy + h*.16],
    ], .6, true);
    ctx.beginPath(); ctx.moveTo(cx + w*.32, cy); ctx.lineTo(cx - w*.25, cy);
    ctx.globalAlpha = .3; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(cx + w*.38, cy); ctx.lineTo(cx + w*.44, cy);
    ctx.globalAlpha = .75; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    [[-.04, -.17], [.04, -.17], [-.04, .17], [.04, .17]].forEach(function(o) {
      ctx.beginPath(); ctx.arc(cx + o[0]*w, cy + o[1]*h, .027*w, 0, Math.PI*2);
      ctx.globalAlpha = .4; ctx.fill(); ctx.globalAlpha = 1;
    });

  } else if (category === 'Light Cruiser') {
    hull([
      [cx + w*.34, cy],
      [cx + w*.12, cy - h*.13],
      [cx - w*.06, cy - h*.15],
      [cx - w*.34, cy - h*.07],
      [cx - w*.36, cy],
      [cx - w*.34, cy + h*.07],
      [cx - w*.06, cy + h*.15],
      [cx + w*.12, cy + h*.13],
    ], .55, true);
    ctx.beginPath(); ctx.moveTo(cx + w*.34, cy); ctx.lineTo(cx + w*.4, cy);
    ctx.globalAlpha = .7; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;

  } else {
    // Escort
    hull([
      [cx + w*.3,  cy],
      [cx + w*.08, cy - h*.1],
      [cx - w*.26, cy - h*.07],
      [cx - w*.3,  cy],
      [cx - w*.26, cy + h*.07],
      [cx + w*.08, cy + h*.1],
    ], .5, true);
    ctx.beginPath(); ctx.moveTo(cx + w*.3, cy); ctx.lineTo(cx + w*.36, cy);
    ctx.globalAlpha = .7; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
  }

  SIL_CACHE[key] = 'drawn';
}

// ── Faction colour mapping ────────────────────────────────────────────────────
const FACTION_META = {
  'Imperial Navy':               { color: '#8a2020', icon: '⚓', accent: 'var(--imp)' },
  'Chaos':                       { color: '#5a2a8a', icon: '💀', accent: 'var(--chaos)' },
  'Space Marines':               { color: '#1e3a6a', icon: '⬡', accent: 'var(--sm)' },
  'Adeptus Mechanicus':          { color: '#7a1010', icon: '⚙', accent: 'var(--mech)' },
  'Inquisition':                 { color: '#2a2a7a', icon: '✦', accent: 'var(--inq)' },
  'Eldar Corsairs':              { color: '#1a5a2a', icon: '◈', accent: 'var(--eldar)' },
  'Dark Eldar Pirate Fleet List':{ color: '#5a106a', icon: '☽', accent: 'var(--de)' },
  'Orks':                        { color: '#4a4a10', icon: '⚡', accent: 'var(--ork)' },
  'Necrons':                     { color: '#106a6a', icon: '⬡', accent: 'var(--necron)' },
  'Tyranid Hive Fleet List':     { color: '#6a1a10', icon: '✸', accent: 'var(--nid)' },
  'Tau Fleet':                   { color: '#10406a', icon: '◎', accent: 'var(--tau)' },
  'Pirates and Wolf Packs':      { color: '#4a3a10', icon: '☠', accent: 'var(--pirate)' },
  'Armada Imperialis':           { color: '#8a2020', icon: '⚔', accent: 'var(--heresy)' },
};

function factionMeta(name) {
  return FACTION_META[name] || { color: '#596178', icon: '🚀', accent: 'var(--muted)' };
}

// ── Category colours ──────────────────────────────────────────────────────────
const CAT_COLORS = {
  'Battleship':     '#e08080',
  'Battlecruiser':  '#c070b0',
  'Grand Cruiser':  '#c09040',
  'Cruiser':        '#6090d0',
  'Light Cruiser':  '#60b0b0',
  'Heavy Cruiser':  '#9070c0',
  'Escort':         '#70a070',
  'Fleet Commander':'#c49b3c',
};
function catColor(cat) { return CAT_COLORS[cat] || '#596178'; }

// ── Short display names ───────────────────────────────────────────────────────
function factionShortName(name) {
  return name
    .replace(' Pirate Fleet List', '')
    .replace(' Hive Fleet List', '')
    .replace(' Corsairs', '');
}

// ── Screen navigation ─────────────────────────────────────────────────────────
function isDesktop() {
  return window.matchMedia('(min-width: 900px)').matches;
}

function setActiveFleet(idx) {
  activeFleet = idx;
  document.body.classList.toggle('has-fleet', idx !== null);
}

function showScreen(id) {
  // On desktop with a fleet open, picker is always visible — just re-render it
  if (isDesktop() && id === 'picker' && activeFleet !== null) {
    renderPickerScreen();
    return;
  }
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + id).classList.add('active');
}

function initNav() {
  document.querySelectorAll('[data-back]').forEach(function(btn) {
    btn.addEventListener('click', function() { showScreen(btn.dataset.back); });
  });
  document.querySelectorAll('[data-screen]').forEach(function(el) {
    el.addEventListener('click', function() {
      const target = el.dataset.screen;
      if (target === 'fleet' && activeFleet === null) return;
      if (target === 'export') {
        buildExportScreen();
        showScreen('export');
        return;
      }
      showScreen(target);
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2400);
}

// ── Home screen ───────────────────────────────────────────────────────────────
function renderHomeScreen() {
  const list = document.getElementById('fleet-list');
  const empty = document.getElementById('empty-fleets');
  list.innerHTML = '';

  if (fleets.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  fleets.forEach(function(fleet, idx) {
    const meta  = factionMeta(fleet.faction);
    const total = fleetTotalPts(fleet);
    const split = ptsSplit(fleet);
    const pct   = fleet.limit > 0 ? Math.min(total / fleet.limit * 100, 100) : 0;
    const valPct = fleet.limit > 0 ? Math.min(split.valid / fleet.limit * 100, 100) : 0;
    const invPct = fleet.limit > 0 ? Math.min(split.invalid / fleet.limit * 100, 100) : 0;
    const hasIssues = split.invalid > 0;

    const shipCount = fleet.ships.reduce(function(a, s) { return a + (s.qty || 1); }, 0)
                    + fleet.squadrons.reduce(function(a, s) { return a + (s.count || 0); }, 0);

    const card = document.createElement('div');
    card.className = 'fleet-card';
    card.innerHTML =
      '<div class="fleet-card-stripe" style="background:' + meta.color + '"></div>' +
      '<div class="fleet-card-body">' +
        '<div class="fleet-card-name">' + escHtml(fleet.name) + '</div>' +
        '<div class="fleet-card-meta-row">' + factionShortName(fleet.faction) + ' · ' + (fleet.fleetList || '') + '</div>' +
        '<div class="fleet-card-footer">' +
          '<div class="fleet-card-pts-wrap">' +
            '<div class="fleet-card-pts-label">' +
              '<span>' + total + ' pts</span>' +
              '<span style="color:var(--muted)">/ ' + fleet.limit + '</span>' +
            '</div>' +
            '<div class="mini-bar">' +
              '<div class="mini-bar-fill" style="width:' + valPct + '%;background:' + meta.color + '"></div>' +
              (split.invalid > 0 ? '<div class="mini-bar-fill" style="width:' + invPct + '%;background:#c43c3c"></div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="fleet-card-ships' + (hasIssues ? ' invalid" style="color:var(--warn-text)"' : '"') + '>' +
            (hasIssues ? '⚠ ' : '') + shipCount + ' ship' + (shipCount !== 1 ? 's' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    card.addEventListener('click', function() {
      setActiveFleet(idx);
      renderFleetScreen();
      if (isDesktop()) renderPickerScreen();
      showScreen('fleet');
    });

    list.appendChild(card);
  });
}

// ── New Fleet screen ──────────────────────────────────────────────────────────
function initNewFleetScreen() {
  // Faction grid
  const grid = document.getElementById('faction-grid');
  grid.innerHTML = '';
  if (!DB) return;

  Object.keys(DB.factions).forEach(function(name) {
    const meta = factionMeta(name);
    const listCount = DB.factions[name].fleetLists.length;
    const card = document.createElement('div');
    card.className = 'faction-card';
    card.dataset.faction = name;
    card.innerHTML =
      '<div class="faction-icon" style="background:' + meta.color + '33">' + meta.icon + '</div>' +
      '<div class="faction-name">' + escHtml(factionShortName(name)) + '</div>' +
      '<div class="faction-sub">' + (listCount > 0 ? listCount + ' fleet list' + (listCount > 1 ? 's' : '') : 'Open fleet') + '</div>';

    card.addEventListener('click', function() {
      grid.querySelectorAll('.faction-card').forEach(function(c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      newFleetDraft.faction = name;
      document.getElementById('btn-step1-next').disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById('btn-step1-next').addEventListener('click', function() {
    if (!newFleetDraft.faction) return;
    goNewStep(2);
  });

  document.getElementById('btn-step2-next').addEventListener('click', function() {
    if (!newFleetDraft.fleetList) return;
    goNewStep(3);
  });

  document.getElementById('btn-create-fleet').addEventListener('click', function() {
    const name = document.getElementById('new-fleet-name').value.trim();
    const pts  = parseInt(document.getElementById('new-fleet-pts').value, 10);
    if (!name) { showToast('Enter a fleet name'); return; }
    if (!pts || pts < 100) { showToast('Set a valid points limit'); return; }

    const fleet = createFleet(name, newFleetDraft.faction, newFleetDraft.fleetList || '', pts);
    fleets.push(fleet);
    setActiveFleet(fleets.length - 1);
    saveFleets();
    renderHomeScreen();
    renderFleetScreen();
    if (isDesktop()) renderPickerScreen();
    showScreen('fleet');
    resetNewFleetDraft();
  });

  // Points chips
  document.querySelectorAll('.pts-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.pts-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      document.getElementById('new-fleet-pts').value = chip.dataset.pts;
    });
  });

  document.getElementById('new-fleet-pts').addEventListener('input', function() {
    document.querySelectorAll('.pts-chip').forEach(function(c) { c.classList.remove('active'); });
    document.querySelectorAll('.pts-chip').forEach(function(c) {
      if (c.dataset.pts === this.value) c.classList.add('active');
    }, this);
  });
}

function goNewStep(n) {
  [1,2,3].forEach(function(i) {
    document.getElementById('new-step-' + i).style.display = i === n ? 'block' : 'none';
    const dot = document.querySelector('[data-step="' + i + '"]');
    if (dot) {
      dot.classList.toggle('active', i === n);
      dot.classList.toggle('done', i < n);
    }
  });

  if (n === 2) {
    // Populate fleet lists
    const faction = newFleetDraft.faction;
    const label = document.getElementById('step2-label');
    label.textContent = 'Fleet List — ' + factionShortName(faction);
    const opts = document.getElementById('fleet-list-options');
    opts.innerHTML = '';
    newFleetDraft.fleetList = null;
    document.getElementById('btn-step2-next').disabled = true;

    const lists = DB.factions[faction] ? DB.factions[faction].fleetLists : [];
    if (lists.length === 0) {
      // No fleet lists — skip to step 3
      newFleetDraft.fleetList = 'Open Fleet';
      goNewStep(3);
      return;
    }
    lists.forEach(function(fl) {
      const opt = document.createElement('div');
      opt.className = 'fleet-list-option';
      opt.innerHTML = '<div class="flo-name">' + escHtml(fl.name) + '</div>' +
        '<div class="flo-desc">' + buildFleetListDesc(fl) + '</div>';
      opt.addEventListener('click', function() {
        opts.querySelectorAll('.fleet-list-option').forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        newFleetDraft.fleetList = fl.name;
        document.getElementById('btn-step2-next').disabled = false;
      });
      opts.appendChild(opt);
    });
  }
}

function buildFleetListDesc(fl) {
  // Summarise constraints for display
  const cats = fl.categories || [];
  const parts = [];
  cats.forEach(function(cat) {
    if (cat.name && cat.constraints && cat.constraints.length) {
      parts.push(cat.name);
    }
  });
  return parts.length ? parts.slice(0, 3).join(', ') + (parts.length > 3 ? '…' : '') : 'Standard fleet composition';
}

function resetNewFleetDraft() {
  newFleetDraft = {};
  goNewStep(1);
  document.querySelectorAll('.faction-card').forEach(function(c) { c.classList.remove('selected'); });
  document.getElementById('new-fleet-name').value = '';
  document.getElementById('new-fleet-pts').value = '1500';
  document.querySelectorAll('.pts-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.pts === '1500'); });
  document.getElementById('btn-step1-next').disabled = true;
  document.getElementById('btn-step2-next').disabled = true;
}

// ── Fleet view screen ─────────────────────────────────────────────────────────
function renderFleetScreen() {
  const fleet = getActiveFleet();
  if (!fleet || !DB) return;

  document.getElementById('fleet-name-display').textContent    = fleet.name;
  document.getElementById('fleet-faction-display').textContent = factionShortName(fleet.faction) + ' · ' + (fleet.fleetList || '');

  renderPtsTracker(fleet);
  renderValidationPanel(fleet);
  renderFleetBody(fleet);
}

function renderPtsTracker(fleet) {
  const total = fleetTotalPts(fleet);
  const split = ptsSplit(fleet);
  const limit = fleet.limit;

  const tracker = document.getElementById('pts-tracker');
  tracker.classList.toggle('over-limit', total > limit);

  document.getElementById('pts-used').textContent = total;
  document.getElementById('pts-limit').textContent = ' / ' + limit + ' pts';
  document.getElementById('pts-remaining').textContent =
    total <= limit ? (limit - total) + ' remaining' : (total - limit) + ' over limit';

  const validPct   = limit > 0 ? Math.min(split.valid   / limit * 100, 100) : 0;
  const invalidPct = limit > 0 ? Math.min(split.invalid / limit * 100, 100) : 0;
  document.getElementById('pts-valid-bar').style.width   = validPct + '%';
  document.getElementById('pts-invalid-bar').style.width = invalidPct + '%';

  const legend = document.getElementById('pts-legend');
  if (split.invalid > 0) {
    legend.style.display = 'flex';
    document.getElementById('legend-valid-text').textContent   = 'Valid (' + split.valid + ' pts)';
    document.getElementById('legend-invalid-text').textContent = 'Needs fixing (' + split.invalid + ' pts)';
  } else {
    legend.style.display = 'none';
  }
}

function renderValidationPanel(fleet) {
  const panel = document.getElementById('validation-panel');
  panel.innerHTML = '';
  // Don't show validation until something has been added
  if (fleet.ships.length === 0 && !fleet.commander && fleet.squadrons.length === 0) return;
  const issues = validateFleet(fleet);
  issues.forEach(function(issue) {
    const row = document.createElement('div');
    row.className = 'v-row ' + issue.type;
    row.innerHTML = '<span class="v-icon">' + (issue.type === 'err' ? '✕' : '⚠') + '</span><span>' + escHtml(issue.msg) + '</span>';
    panel.appendChild(row);
  });
}

function renderFleetBody(fleet) {
  const body = document.getElementById('fleet-body');
  body.innerHTML = '';
  const invalid = invalidShipIds(fleet);

  // ── Commander ──
  if (fleet.commander) {
    const sec = document.createElement('div');
    sec.className = 'fleet-section';
    sec.innerHTML = '<div class="fleet-section-header"><div class="fleet-section-name">Fleet Commander</div><div class="fleet-section-count">' + fleet.commander.pts + ' pts</div></div>';
    sec.appendChild(buildCommanderCard(fleet));
    body.appendChild(sec);
  } else if (fleet.limit > 750) {
    // Prompt to add commander
    const sec = document.createElement('div');
    sec.className = 'fleet-section';
    sec.innerHTML = '<div class="fleet-section-header"><div class="fleet-section-name">Fleet Commander</div><div class="fleet-section-count err" style="color:var(--err-text)">Required</div></div>' +
      '<div class="v-row err" style="margin:0 12px 8px;cursor:pointer" id="add-commander-prompt"><span class="v-icon">✕</span><span>No commander — tap to add one</span></div>';
    body.appendChild(sec);
    document.getElementById('add-commander-prompt').addEventListener('click', function() {
      openPickerForCategory('Fleet Commander');
    });
  }

  // ── Ships by category ──
  const SECTION_ORDER = ['Battleship','Battlecruiser','Grand Cruiser','Cruiser','Heavy Cruiser','Light Cruiser'];
  const shipsByCategory = {};
  fleet.ships.forEach(function(slot) {
    const ship = DB.ships[slot.shipId];
    if (!ship) return;
    const cat = ship.category;
    if (!shipsByCategory[cat]) shipsByCategory[cat] = [];
    shipsByCategory[cat].push(slot);
  });

  // Render in order, then any remaining categories
  const rendered = new Set();
  SECTION_ORDER.forEach(function(cat) {
    if (!shipsByCategory[cat]) return;
    rendered.add(cat);
    body.appendChild(buildShipSection(fleet, cat, shipsByCategory[cat], invalid));
  });
  Object.keys(shipsByCategory).forEach(function(cat) {
    if (rendered.has(cat)) return;
    body.appendChild(buildShipSection(fleet, cat, shipsByCategory[cat], invalid));
  });

  // ── Escorts ──
  if (fleet.squadrons.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fleet-section';
    const totalEscorts = fleet.squadrons.reduce(function(a,s) { return a + s.count; }, 0);
    sec.innerHTML = '<div class="fleet-section-header"><div class="fleet-section-name">Escorts</div><div class="fleet-section-count">' + totalEscorts + ' ship' + (totalEscorts !== 1 ? 's' : '') + ' · ' + fleet.squadrons.length + ' sqd</div></div>';
    fleet.squadrons.forEach(function(sqd, idx) {
      sec.appendChild(buildSquadronCard(fleet, sqd, idx));
    });
    body.appendChild(sec);
  }

  // Empty state
  if (fleet.ships.length === 0 && fleet.squadrons.length === 0 && !fleet.commander) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">⚓</div><div class="empty-title">Fleet is empty</div><div class="empty-sub">Tap + to add your first ship</div>';
    body.appendChild(empty);
  }

  // Extra spacing
  const spacer = document.createElement('div');
  spacer.style.height = '24px';
  body.appendChild(spacer);
}

function buildShipSection(fleet, cat, slots, invalid) {
  const sec = document.createElement('div');
  sec.className = 'fleet-section';

  const battleships = cat === 'Battleship';
  const cruiserCount = fleet.ships.filter(function(s) {
    const ship = DB.ships[s.shipId];
    return ship && ['Cruiser','Battlecruiser','Light Cruiser','Heavy Cruiser','Grand Cruiser'].includes(ship.category);
  }).length;
  const bsCount = slots.length;
  const unlocked = Math.floor(cruiserCount / 3);

  let countLabel = slots.length.toString();
  let countClass = 'fleet-section-count';
  if (battleships && bsCount > unlocked) {
    countLabel = bsCount + ' / ' + unlocked + ' unlocked ⚠';
    countClass = 'fleet-section-count err';
  }

  sec.innerHTML = '<div class="fleet-section-header"><div class="fleet-section-name">' + cat + 's</div><div class="' + countClass + '">' + countLabel + '</div></div>';

  // Count how many of each shipId appear so we can show Greek suffixes for duplicates
  const shipIdTotal = {};
  slots.forEach(function(slot) { shipIdTotal[slot.shipId] = (shipIdTotal[slot.shipId] || 0) + 1; });
  const shipIdIdx = {};
  slots.forEach(function(slot) {
    if (!shipIdIdx[slot.shipId]) shipIdIdx[slot.shipId] = 0;
    const greekIdx = shipIdTotal[slot.shipId] > 1 ? shipIdIdx[slot.shipId] : -1;
    shipIdIdx[slot.shipId]++;
    sec.appendChild(buildShipCard(fleet, slot, invalid.has(slot.shipId), greekIdx));
  });
  return sec;
}

function buildCommanderCard(fleet) {
  const cmdr = fleet.commander;
  const card = document.createElement('div');
  card.className = 'commander-card';

  const rerolls = cmdr.rerolls || 2;
  let pips = '';
  for (let i = 0; i < 3; i++) {
    pips += '<div class="reroll-pip' + (i >= rerolls ? ' empty' : '') + '"></div>';
  }

  card.innerHTML =
    '<div class="commander-header">' +
      '<div class="commander-name">' + escHtml(cmdr.name) + '</div>' +
      '<div class="commander-pts">' + cmdr.pts + ' pts</div>' +
      '<button class="sqd-remove" title="Remove commander">✕</button>' +
    '</div>' +
    '<div class="reroll-pips">' + pips + '</div>';

  card.querySelector('.sqd-remove').addEventListener('click', function(e) {
    e.stopPropagation();
    fleet.commander = null;
    saveFleets();
    renderFleetScreen();
  });
  return card;
}

function buildShipCard(fleet, slot, isInvalid, greekIdx) {
  const ship = DB.ships[slot.shipId];
  if (!ship) return document.createTextNode('');

  const cardId = 'ship-card-' + slot.shipId + '-' + slot._idx;
  let shipPts = ship.pts;
  for (const upg of (slot.upgrades || [])) shipPts += upg.pts || 0;

  const card = document.createElement('div');
  card.className = 'ship-card' + (isInvalid ? ' invalid' : '');
  card.id = cardId;

  const color = catColor(ship.category);
  const greekSuffix = (greekIdx >= 0) ? ' ' + (GREEK[greekIdx] || String(greekIdx + 1)) : '';

  let headerHtml =
    '<div class="ship-card-header">' +
      '<div class="ship-thumb">' +
        '<canvas id="sil-' + cardId + '" width="72" height="64"></canvas>' +
      '</div>' +
      '<div class="ship-header-info">' +
        '<div class="ship-title-block">' +
          '<div class="ship-card-title">' + escHtml(ship.name + greekSuffix) + '</div>' +
          '<div class="ship-card-type">' + (ship.stats['Hits'] || '?') + ' Hits · ' + (ship.stats['Shields'] || '?') + ' Shields · ' + (ship.stats['Armour'] || '?') + '</div>' +
        '</div>' +
        '<div class="ship-card-pts">' + shipPts + ' pts</div>' +
        '<div class="ship-chevron">›</div>' +
      '</div>' +
    '</div>';

  // Upgrades preview when collapsed
  let upgChips = '';
  for (const upg of (slot.upgrades || [])) {
    upgChips += '<div class="upgrade-chip special">' + escHtml(upg.name) + '</div>' +
                '<div class="upgrade-chip cost">+' + upg.pts + ' pts</div>';
  }
  if (upgChips) headerHtml += '<div class="ship-upgrades">' + upgChips + '</div>';

  if (isInvalid) {
    headerHtml += '<div class="invalid-badge">⚠ Add more cruisers to make this legal</div>';
  }

  headerHtml += '<div class="ship-detail">' + buildShipDetailHtml(ship, slot) + '</div>';

  card.innerHTML = headerHtml;

  // Toggle expand
  card.querySelector('.ship-card-header').addEventListener('click', function() {
    const detail = card.querySelector('.ship-detail');
    const chev   = card.querySelector('.ship-chevron');
    const open   = detail.classList.contains('open');
    detail.classList.toggle('open', !open);
    chev.classList.toggle('open', !open);
    card.classList.toggle('open', !open);
  });

  // Edit upgrades
  card.querySelector('.btn-edit').addEventListener('click', function(e) {
    e.stopPropagation();
    openUpgradeModal(fleet, slot, ship);
  });

  // Remove
  card.querySelector('.btn-remove').addEventListener('click', function(e) {
    e.stopPropagation();
    fleet.ships = fleet.ships.filter(function(s) { return s !== slot; });
    saveFleets();
    renderFleetScreen();
    showToast(ship.name + ' removed');
  });

  // Draw silhouette after append
  requestAnimationFrame(function() {
    const cv = document.getElementById('sil-' + cardId);
    if (cv) drawSilhouette(cv, ship.category, color);
  });

  return card;
}

function buildShipDetailHtml(ship, slot) {
  const stats = ship.stats || {};

  let statHtml = '<div class="stat-grid">';
  [
    ['Speed',   'Speed'],
    ['Turns',   'Turns'],
    ['Hits',    'Hits'],
    ['Shields', 'Shields'],
    ['Armour',  'Armour'],
    ['Turrets', 'Turrets'],
  ].forEach(function(pair) {
    statHtml += '<div class="stat-cell"><div class="stat-val">' + escHtml(stats[pair[0]] || '—') + '</div><div class="stat-lbl">' + pair[1] + '</div></div>';
  });
  statHtml += '</div>';

  let armHtml = '';
  if (ship.armament && ship.armament.length) {
    armHtml += '<div class="arm-label">Armament</div><table class="arm-table">' +
      '<thead><tr><th>Weapon</th><th>Range</th><th>FP/Str</th><th>Arc</th></tr></thead><tbody>';
    ship.armament.forEach(function(w) {
      armHtml += '<tr><td>' + escHtml(w.name) + '</td><td>' + escHtml(w['Range/Speed'] || w['Range'] || '—') + '</td><td>' + escHtml(w['Firepower/Str'] || w['Str'] || '—') + '</td><td>' + escHtml(w['Fire Arc'] || w['Arc'] || '—') + '</td></tr>';
    });
    armHtml += '</tbody></table>';
  }

  let rulesHtml = '';
  if (ship.specialRules && ship.specialRules.length) {
    rulesHtml = '<div class="special-rules-label">Special Rules</div>';
    ship.specialRules.forEach(function(r) {
      rulesHtml += '<div class="special-rule"><strong>' + escHtml(r.name) + '</strong>' + (r.effects ? ': ' + escHtml(r.effects) : '') + '</div>';
    });
  }

  return statHtml + armHtml + rulesHtml +
    '<div class="ship-actions"><button class="ship-action-btn btn-edit">Edit Upgrades</button><button class="ship-action-btn btn-remove">Remove</button></div>';
}

function buildSquadronCard(fleet, sqd, sqdIdx) {
  const ship = DB.ships[sqd.shipId];
  if (!ship) return document.createElement('div');

  const card = document.createElement('div');
  card.className = 'escort-squadron';

  const stats = ship.stats || {};
  const perShipPts = ship.pts + (sqd.upgrades || []).reduce(function(a, u) { return a + (u.pts||0); }, 0);
  const totalPts = perShipPts * sqd.count;

  const bodyId = 'sqd-body-' + sqdIdx;
  card.innerHTML =
    '<div class="squadron-header">' +
      '<div class="squadron-tag">SQD</div>' +
      '<div class="squadron-name">' + sqd.count + '× ' + escHtml(ship.name) + '</div>' +
      '<div class="squadron-pts">' + totalPts + ' pts</div>' +
      '<div class="ship-chevron open">›</div>' +
    '</div>' +
    '<div class="squadron-body" id="' + bodyId + '">' +
      '<div class="sqd-stat-bar">' +
        '<div class="sqd-stat"><div class="sqd-stat-val">' + escHtml(stats['Speed'] || '—') + '</div><div class="sqd-stat-lbl">Speed</div></div>' +
        '<div class="sqd-stat"><div class="sqd-stat-val">' + escHtml(stats['Hits'] || '—') + '</div><div class="sqd-stat-lbl">Hits</div></div>' +
        '<div class="sqd-stat"><div class="sqd-stat-val">' + escHtml(stats['Shields'] || '—') + '</div><div class="sqd-stat-lbl">Shields</div></div>' +
        '<div class="sqd-stat"><div class="sqd-stat-val">' + escHtml(stats['Armour'] || '—') + '</div><div class="sqd-stat-lbl">Armour</div></div>' +
      '</div>' +
      buildSqdShipRows(sqd, ship, perShipPts, fleet, sqdIdx) +
      '<div class="sqd-footer">' +
        '<button class="sqd-add-btn" data-sqd="' + sqdIdx + '">+ Add ship</button>' +
        (sqd.count > 1 ? '<button class="sqd-add-btn" data-sqd-remove="' + sqdIdx + '">− Remove</button>' : '') +
        '<button class="sqd-add-btn" style="color:var(--err-text)" data-sqd-delete="' + sqdIdx + '">Disband</button>' +
      '</div>' +
    '</div>';

  // Toggle
  card.querySelector('.squadron-header').addEventListener('click', function() {
    const body = document.getElementById(bodyId);
    const chev = card.querySelector('.ship-chevron');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    chev.classList.toggle('open', !open);
  });

  card.querySelector('[data-sqd="' + sqdIdx + '"]').addEventListener('click', function() {
    sqd.count = Math.min(sqd.count + 1, 6);
    saveFleets();
    renderFleetScreen();
  });

  const removeBtn = card.querySelector('[data-sqd-remove="' + sqdIdx + '"]');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      sqd.count = Math.max(sqd.count - 1, 1);
      saveFleets();
      renderFleetScreen();
    });
  }

  card.querySelector('[data-sqd-delete="' + sqdIdx + '"]').addEventListener('click', function() {
    fleet.squadrons.splice(sqdIdx, 1);
    saveFleets();
    renderFleetScreen();
    showToast('Squadron disbanded');
  });

  return card;
}

function buildSqdShipRows(sqd, ship, perShipPts, fleet, sqdIdx) {
  let html = '';
  for (let i = 0; i < sqd.count; i++) {
    html += '<div class="sqd-ship-row"><span class="sqd-ship-name">' + escHtml(ship.name) + ' ' + (i + 1) + '</span><span class="sqd-ship-pts">' + perShipPts + ' pts</span></div>';
  }
  return html;
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function openUpgradeModal(fleet, slot, ship) {
  document.getElementById('modal-title').textContent = ship.name + ' — Upgrades';
  const body = document.getElementById('modal-body');
  body.innerHTML = '';

  if (!ship.upgrades || ship.upgrades.length === 0) {
    body.innerHTML = '<div class="picker-empty">No upgrades available for this ship.</div>';
  } else {
    ship.upgrades.forEach(function(group) {
      const grp = document.createElement('div');
      grp.className = 'upgrade-group';
      grp.innerHTML = '<div class="upgrade-group-name">' + escHtml(group.group) + '</div>';

      group.options.forEach(function(opt) {
        const isSelected = (slot.upgrades || []).some(function(u) { return u.id === opt.id; });
        const el = document.createElement('div');
        el.className = 'upgrade-option' + (isSelected ? ' selected' : '');
        el.innerHTML =
          '<div style="flex:1"><div class="upgrade-option-name">' + escHtml(opt.name) + '</div>' +
          (opt.description ? '<div class="upgrade-option-desc">' + escHtml(opt.description) + '</div>' : '') + '</div>' +
          '<div class="upgrade-option-pts">' + (opt.pts > 0 ? '+' + opt.pts : opt.pts === 0 ? 'Free' : opt.pts) + ' pts</div>' +
          '<div class="upgrade-checkmark">' + (isSelected ? '✓' : '') + '</div>';

        el.addEventListener('click', function() {
          if (!slot.upgrades) slot.upgrades = [];
          const existIdx = slot.upgrades.findIndex(function(u) { return u.id === opt.id; });
          if (existIdx >= 0) {
            slot.upgrades.splice(existIdx, 1);
            el.classList.remove('selected');
            el.querySelector('.upgrade-checkmark').textContent = '';
          } else {
            slot.upgrades.push({ id: opt.id, name: opt.name, pts: opt.pts });
            el.classList.add('selected');
            el.querySelector('.upgrade-checkmark').textContent = '✓';
          }
          saveFleets();
          renderPtsTracker(fleet);
        });
        grp.appendChild(el);
      });
      body.appendChild(grp);
    });
  }

  document.getElementById('modal-upgrades').style.display = 'flex';
}

// ── Ship picker ───────────────────────────────────────────────────────────────
let pickerCategory = 'All';
let pickerSearch   = '';

function openPickerForCategory(cat) {
  if (cat) pickerCategory = cat;
  renderPickerScreen();
  showScreen('picker');
}

function renderPickerScreen() {
  const fleet = getActiveFleet();
  if (!fleet || !DB) return;

  const factionData = DB.factions[fleet.faction];
  if (!factionData) return;

  const allShips = factionData.ships.map(function(id) { return DB.ships[id]; }).filter(Boolean);

  // Build category tabs
  const tabs = document.getElementById('picker-tabs');
  tabs.innerHTML = '';
  const cats = ['All'];
  allShips.forEach(function(s) {
    if (cats.indexOf(s.category) === -1) cats.push(s.category);
  });

  cats.forEach(function(cat) {
    const tab = document.createElement('button');
    tab.className = 'cat-tab' + (cat === pickerCategory ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', function() {
      pickerCategory = cat;
      tabs.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      renderPickerList(allShips, fleet);
    });
    tabs.appendChild(tab);
  });

  // Search
  const searchInput = document.getElementById('picker-search');
  searchInput.value = pickerSearch;
  searchInput.oninput = function() {
    pickerSearch = searchInput.value;
    document.getElementById('btn-search-clear').style.display = pickerSearch ? 'block' : 'none';
    renderPickerList(allShips, fleet);
  };
  document.getElementById('btn-search-clear').onclick = function() {
    pickerSearch = '';
    searchInput.value = '';
    this.style.display = 'none';
    renderPickerList(allShips, fleet);
  };
  document.getElementById('btn-search-clear').style.display = pickerSearch ? 'block' : 'none';

  renderPickerList(allShips, fleet);
}

function renderPickerList(allShips, fleet) {
  const body = document.getElementById('picker-body');
  body.innerHTML = '';

  let ships = allShips;
  if (pickerCategory !== 'All') {
    ships = ships.filter(function(s) { return s.category === pickerCategory; });
  }
  if (pickerSearch) {
    const q = pickerSearch.toLowerCase();
    ships = ships.filter(function(s) { return s.name.toLowerCase().indexOf(q) !== -1; });
  }

  if (ships.length === 0) {
    body.innerHTML = '<div class="picker-empty">No ships found</div>';
    return;
  }

  ships.forEach(function(ship) {
    body.appendChild(buildPickerCard(ship, fleet));
  });
}

function buildPickerCard(ship, fleet) {
  const color  = catColor(ship.category);
  const cardId = 'picker-' + ship.id;

  const card = document.createElement('div');
  card.className = 'picker-card';
  card.id = cardId;

  // Validation warning for this ship type
  const warn = pickerWarn(ship, fleet);

  const headerHtml =
    '<div class="picker-header">' +
      '<div class="picker-thumb">' +
        '<canvas id="pic-sil-' + ship.id + '" width="80" height="68"></canvas>' +
      '</div>' +
      '<div class="picker-info">' +
        '<div class="picker-name-block">' +
          '<div class="picker-title">' + escHtml(ship.name) + '</div>' +
          '<div class="picker-sub">' + ship.category + ' · ' + (ship.stats['Hits'] || '?') + ' Hits · ' + (ship.stats['Shields'] || '?') + ' Shields</div>' +
        '</div>' +
        '<div class="picker-pts">' + ship.pts + '</div>' +
        '<div class="picker-chev">›</div>' +
      '</div>' +
    '</div>';

  const detailHtml =
    '<div class="picker-detail">' +
      '<div class="ship-banner"><canvas id="pic-ban-' + ship.id + '" width="320" height="90"></canvas></div>' +
      buildShipDetailHtml(ship, { upgrades: [] }).replace('<div class="ship-actions"><button class="ship-action-btn btn-edit">Edit Upgrades</button><button class="ship-action-btn btn-remove">Remove</button></div>', '') +
      (warn ? '<div class="picker-warn">⚠ ' + escHtml(warn) + '</div>' : '') +
      '<button class="add-to-fleet-btn' + (warn ? ' warn-btn' : '') + '" data-ship-id="' + ship.id + '">' +
        (ship.category === 'Escort' ? 'Add to Squadron' : 'Add to Fleet') +
        (warn ? ' Anyway' : '') +
      '</button>' +
    '</div>';

  card.innerHTML = headerHtml + detailHtml;

  // Toggle
  card.querySelector('.picker-header').addEventListener('click', function() {
    const detail = card.querySelector('.picker-detail');
    const chev   = card.querySelector('.picker-chev');
    const open   = detail.classList.contains('open');

    // Close others
    document.querySelectorAll('.picker-card').forEach(function(c) {
      if (c !== card) {
        c.querySelector('.picker-detail').classList.remove('open');
        c.querySelector('.picker-chev').classList.remove('open');
        c.classList.remove('open');
      }
    });

    detail.classList.toggle('open', !open);
    chev.classList.toggle('open', !open);
    card.classList.toggle('open', !open);

    if (!open) {
      // Draw banner
      requestAnimationFrame(function() {
        const ban = document.getElementById('pic-ban-' + ship.id);
        if (ban) drawSilhouette(ban, ship.category, color);
      });
    }
  });

  // Add button
  card.querySelector('.add-to-fleet-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    addShipToFleet(fleet, ship);
  });

  // Draw thumbnail silhouette
  requestAnimationFrame(function() {
    const cv = document.getElementById('pic-sil-' + ship.id);
    if (cv) drawSilhouette(cv, ship.category, color);
  });

  return card;
}

function pickerWarn(ship, fleet) {
  if (ship.category === 'Battleship') {
    const cruiserCount = fleet.ships.filter(function(s) {
      const fs = DB.ships[s.shipId];
      return fs && ['Cruiser','Battlecruiser','Light Cruiser','Heavy Cruiser','Grand Cruiser'].includes(fs.category);
    }).length;
    const bsCount = fleet.ships.filter(function(s) {
      const fs = DB.ships[s.shipId];
      return fs && fs.category === 'Battleship';
    }).length;
    const unlocked = Math.floor(cruiserCount / 3);
    if (bsCount >= unlocked) {
      const needed = (bsCount + 1) * 3 - cruiserCount;
      return 'Battleship requires ' + ((bsCount + 1) * 3) + ' cruisers total — you need ' + needed + ' more. You can still add it and fix later.';
    }
  }
  if (ship.category === 'Fleet Commander' && fleet.commander) {
    return 'Fleet already has a commander. Adding this will replace the current one.';
  }
  return null;
}

function addShipToFleet(fleet, ship) {
  if (ship.category === 'Fleet Commander') {
    fleet.commander = { shipId: ship.id, name: ship.name, pts: ship.pts, rerolls: 2 };
    saveFleets();
    renderFleetScreen();
    showScreen('fleet');
    showToast(ship.name + ' set as commander');
    return;
  }

  if (ship.category === 'Escort') {
    // Find existing squadron for this ship type, or create new
    const existing = fleet.squadrons.find(function(s) { return s.shipId === ship.id; });
    if (existing) {
      existing.count = Math.min(existing.count + 1, 6);
    } else {
      fleet.squadrons.push({ shipId: ship.id, count: 1, upgrades: [] });
    }
    saveFleets();
    renderFleetScreen();
    showScreen('fleet');
    showToast(ship.name + ' added to squadron');
    return;
  }

  // Regular ship
  fleet.ships.push({ shipId: ship.id, upgrades: [], qty: 1, _idx: Date.now() });
  saveFleets();
  renderFleetScreen();
  showScreen('fleet');
  showToast(ship.name + ' added');
}

// ── Export screen ─────────────────────────────────────────────────────────────
function buildExportScreen() {
  const fleet = getActiveFleet();
  const selectMsg = document.getElementById('export-select-msg');
  const content   = document.getElementById('export-content');

  if (!fleet) {
    selectMsg.style.display = 'block';
    content.style.display = 'none';
    return;
  }

  selectMsg.style.display = 'none';
  content.style.display = 'block';

  // Share link
  const url = window.location.href.split('#')[0] + '#fleet=' + encodeURIComponent(JSON.stringify({ idx: activeFleet }));
  document.getElementById('btn-copy-link').onclick = function() {
    navigator.clipboard.writeText(url).then(function() {
      showToast('Link copied!');
    }).catch(function() {
      showToast('Could not copy — try manually: ' + url);
    });
  };

  document.getElementById('btn-print').onclick = function() { window.print(); };

  // Preview
  const preview = document.getElementById('export-preview');
  const total = fleetTotalPts(fleet);
  const issues = validateFleet(fleet);

  let html = '<h2>' + escHtml(fleet.name) + '</h2>';
  html += '<div style="color:var(--muted);font-size:12px;margin-bottom:12px">' + factionShortName(fleet.faction) + (fleet.fleetList ? ' · ' + escHtml(fleet.fleetList) : '') + '</div>';

  if (issues.length) {
    html += '<div style="color:var(--warn-text);font-size:12px;margin-bottom:8px">⚠ ' + issues.length + ' validation issue' + (issues.length > 1 ? 's' : '') + '</div>';
  }

  if (fleet.commander) {
    html += '<h3>Fleet Commander</h3>';
    html += '<div class="ex-ship"><span>' + escHtml(fleet.commander.name) + '</span><span>' + fleet.commander.pts + ' pts</span></div>';
  }

  const cats = {};
  fleet.ships.forEach(function(s) {
    const ship = DB.ships[s.shipId];
    if (!ship) return;
    if (!cats[ship.category]) cats[ship.category] = [];
    let pts = ship.pts;
    for (const u of (s.upgrades||[])) pts += u.pts||0;
    cats[ship.category].push({ name: ship.name, pts, upgrades: s.upgrades || [] });
  });

  Object.entries(cats).forEach(function(entry) {
    html += '<h3>' + entry[0] + 's</h3>';
    entry[1].forEach(function(s) {
      const upgText = s.upgrades.length ? ' (' + s.upgrades.map(function(u) { return u.name; }).join(', ') + ')' : '';
      html += '<div class="ex-ship"><span>' + escHtml(s.name) + escHtml(upgText) + '</span><span>' + s.pts + ' pts</span></div>';
    });
  });

  if (fleet.squadrons.length) {
    html += '<h3>Escorts</h3>';
    fleet.squadrons.forEach(function(sqd) {
      const ship = DB.ships[sqd.shipId];
      if (!ship) return;
      const pp = ship.pts + (sqd.upgrades||[]).reduce(function(a,u){return a+(u.pts||0);},0);
      html += '<div class="ex-ship"><span>' + sqd.count + '× ' + escHtml(ship.name) + '</span><span>' + (pp*sqd.count) + ' pts</span></div>';
    });
  }

  html += '<div class="ex-total"><span>Total</span><span>' + total + ' / ' + fleet.limit + ' pts</span></div>';
  preview.innerHTML = html;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadDB();
  loadFleets();
  initNav();
  initNewFleetScreen();
  renderHomeScreen();

  document.getElementById('btn-new-fleet').addEventListener('click', function() {
    resetNewFleetDraft();
    showScreen('new');
  });

  document.getElementById('btn-add-ship').addEventListener('click', function() {
    pickerSearch = '';
    // Preserve last active category tab
    renderPickerScreen();
    showScreen('picker');
  });

  document.getElementById('modal-close').addEventListener('click', function() {
    document.getElementById('modal-upgrades').style.display = 'none';
  });
  document.getElementById('modal-backdrop').addEventListener('click', function() {
    document.getElementById('modal-upgrades').style.display = 'none';
  });

  // ── Fleet options menu (···) ──
  const fleetMenuBtn = document.getElementById('btn-fleet-menu');
  const fleetMenuDropdown = document.getElementById('fleet-menu-dropdown');

  fleetMenuBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    fleetMenuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', function() {
    fleetMenuDropdown.classList.add('hidden');
  });

  document.getElementById('fleet-menu-rename').addEventListener('click', function() {
    fleetMenuDropdown.classList.add('hidden');
    const fleet = getActiveFleet();
    if (!fleet) return;
    const name = window.prompt('Rename fleet:', fleet.name);
    if (name && name.trim()) {
      fleet.name = name.trim();
      saveFleets();
      renderFleetScreen();
      renderHomeScreen();
      showToast('Fleet renamed');
    }
  });

  document.getElementById('fleet-menu-duplicate').addEventListener('click', function() {
    fleetMenuDropdown.classList.add('hidden');
    const fleet = getActiveFleet();
    if (!fleet) return;
    const copy = JSON.parse(JSON.stringify(fleet));
    copy.id = Date.now();
    copy.name = fleet.name + ' (Copy)';
    copy.created = new Date().toISOString();
    fleets.push(copy);
    saveFleets();
    renderHomeScreen();
    showToast('Fleet duplicated');
  });

  document.getElementById('fleet-menu-delete').addEventListener('click', function() {
    fleetMenuDropdown.classList.add('hidden');
    const fleet = getActiveFleet();
    if (!fleet) return;
    if (!window.confirm('Delete "' + fleet.name + '"? This cannot be undone.')) return;
    fleets.splice(activeFleet, 1);
    setActiveFleet(null);
    saveFleets();
    renderHomeScreen();
    showScreen('home');
    showToast('Fleet deleted');
  });
}

document.addEventListener('DOMContentLoaded', init);

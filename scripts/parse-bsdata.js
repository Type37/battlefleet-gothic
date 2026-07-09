#!/usr/bin/env node
/**
 * BSData → ship_database.json
 *
 * Two-pass parse:
 *   Pass 1 — parse Battlefleet_Gothic.gst → build id→entry lookup table
 *   Pass 2 — parse each .cat file:
 *             • top-level selectionEntries that are ships/units
 *             • top-level entryLinks → resolve from GST lookup
 *
 * Run:  node scripts/parse-bsdata.js
 * CI:   called by .github/workflows/sync-data.yml on a schedule
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { DOMParser } = require('@xmldom/xmldom');

const BSDATA_BASE = 'https://raw.githubusercontent.com/BSData/battlefleetgothic/master/';
const OUT_FILE    = path.join(__dirname, '..', 'data', 'ship_database.json');
const LOG_FILE    = path.join(__dirname, '..', 'data', 'sync_log.json');

const CAT_FILES = [
  'Battlefleet_Gothic.gst',
  'Imperium.cat',
  'Chaos.cat',
  'Space Marines.cat',
  'Adeptus_Mechanicus.cat',
  'Inquisition.cat',
  'Eldar.cat',
  'Dark Eldar.cat',
  'Orks.cat',
  'Necron.cat',
  'Tyranid.cat',
  'Tau.cat',
  'Pirates and Wolf Packs.cat',
  'Imperial Heresy Era.cat',
];

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchOnce(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetch(url, retries, backoff) {
  retries = retries || 3;
  backoff = backoff || 2000;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      if (i < retries - 1 && err.message.indexOf('429') !== -1) {
        await new Promise(function(r) { setTimeout(r, backoff * (i + 1)); });
      } else {
        throw err;
      }
    }
  }
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function attr(el, name) {
  return el && el.getAttribute ? (el.getAttribute(name) || '') : '';
}

function childrenNamed(el, tag) {
  const out = [];
  if (!el || !el.childNodes) return out;
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeName === tag) out.push(n);
  }
  return out;
}

function descendantsNamed(el, tag) {
  const out = [];
  if (!el) return out;
  function walk(node) {
    if (!node.childNodes) return;
    for (let i = 0; i < node.childNodes.length; i++) {
      const n = node.childNodes[i];
      if (n.nodeName === tag) out.push(n);
      walk(n);
    }
  }
  walk(el);
  return out;
}

function textContent(el) {
  if (!el) return '';
  let t = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeType === 3) t += n.nodeValue || '';
    else t += textContent(n);
  }
  return t.trim();
}

// ── Profile/cost/category parsing ────────────────────────────────────────────

function parseProfiles(entryEl) {
  const stats = {};
  const armament = [];
  const specialRules = [];

  for (const profileEl of descendantsNamed(entryEl, 'profile')) {
    const typeName = attr(profileEl, 'typeName');
    const profileName = attr(profileEl, 'name');

    if (typeName === 'Unit') {
      for (const c of descendantsNamed(profileEl, 'characteristic')) {
        stats[attr(c, 'name')] = textContent(c);
      }
    } else if (typeName === 'Armament') {
      const weapon = { name: profileName };
      for (const c of descendantsNamed(profileEl, 'characteristic')) {
        weapon[attr(c, 'name')] = textContent(c);
      }
      armament.push(weapon);
    } else if (typeName === 'Special Rule') {
      const effectEl = descendantsNamed(profileEl, 'characteristic').find(function(c) {
        return attr(c, 'name') === 'Effects';
      });
      specialRules.push({ name: profileName, effects: textContent(effectEl || null) });
    } else if (typeName === 'Commander') {
      for (const c of descendantsNamed(profileEl, 'characteristic')) {
        stats[attr(c, 'name')] = textContent(c);
      }
    }
  }

  return { stats, armament, specialRules };
}

function parseCost(entryEl) {
  // Only look at the direct <costs><cost> child — not descendants — to avoid
  // picking up costs from nested upgrade selectionEntries.
  for (const costsEl of childrenNamed(entryEl, 'costs')) {
    for (const costEl of childrenNamed(costsEl, 'cost')) {
      if (attr(costEl, 'name') === 'pts') {
        const v = parseFloat(attr(costEl, 'value'));
        return isNaN(v) ? 0 : v;
      }
    }
  }
  return 0;
}

function parseCategories(entryEl) {
  const cats = [];
  for (const cl of descendantsNamed(entryEl, 'categoryLink')) {
    const n = attr(cl, 'name');
    if (n && cats.indexOf(n) === -1) cats.push(n);
  }
  return cats;
}

function parseConstraints(entryEl) {
  return descendantsNamed(entryEl, 'constraint').map(function(c) {
    return {
      type:  attr(c, 'type'),
      field: attr(c, 'field'),
      scope: attr(c, 'scope'),
      value: parseFloat(attr(c, 'value')),
      id:    attr(c, 'id'),
    };
  });
}

function parseUpgrades(entryEl) {
  const upgrades = [];
  for (const groups of childrenNamed(entryEl, 'selectionEntryGroups')) {
    for (const group of childrenNamed(groups, 'selectionEntryGroup')) {
      const groupName = attr(group, 'name');
      const groupUpgrades = [];
      for (const entries of childrenNamed(group, 'selectionEntries')) {
        for (const entry of childrenNamed(entries, 'selectionEntry')) {
          if (attr(entry, 'hidden') === 'true') continue;
          const { stats, specialRules } = parseProfiles(entry);
          groupUpgrades.push({
            id:   attr(entry, 'id'),
            name: attr(entry, 'name'),
            pts:  parseCost(entry),
            description: (specialRules[0] && specialRules[0].effects) || stats['Description'] || '',
          });
        }
      }
      if (groupUpgrades.length) {
        upgrades.push({ group: groupName, options: groupUpgrades });
      }
    }
  }
  return upgrades;
}

// ── Ship category classification ─────────────────────────────────────────────

// Normalise the raw category names from BSData into clean display categories
const CATEGORY_MAP = {
  'Battleship':       'Battleship',
  'Battlecruiser':    'Battlecruiser',
  'Grand Cruiser':    'Grand Cruiser',
  'Cruiser':          'Cruiser',
  'Light Cruiser':    'Light Cruiser',
  'Heavy Cruiser':    'Heavy Cruiser',
  'Escort':           'Escort',
  'Fleet Commander':  'Fleet Commander',
  'Ordnance':         'Ordnance',
  'Transport':        'Transport',
};

function classifyEntry(entry) {
  // Walk categories looking for a known ship type
  for (const cat of entry.categories) {
    if (CATEGORY_MAP[cat]) return CATEGORY_MAP[cat];
  }
  // Fall back to Type stat if present (e.g. "Cruiser", "Escort/1")
  if (entry.stats && entry.stats['Type']) {
    const t = entry.stats['Type'];
    for (const key of Object.keys(CATEGORY_MAP)) {
      if (t.indexOf(key) !== -1) return CATEGORY_MAP[key];
    }
  }
  return null; // not a selectable ship
}

// ── GST lookup table builder ─────────────────────────────────────────────────

function buildGstLookup(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  const lookup = {}; // id → { name, stats, armament, specialRules, pts, categories, upgrades }

  function walk(node) {
    if (!node.childNodes) return;
    for (let i = 0; i < node.childNodes.length; i++) {
      const n = node.childNodes[i];
      if (n.nodeName === 'selectionEntry') {
        const id = attr(n, 'id');
        if (id) {
          lookup[id] = {
            id,
            name:         attr(n, 'name'),
            type:         attr(n, 'type'),
            pts:          parseCost(n),
            categories:   parseCategories(n),
            upgrades:     parseUpgrades(n),
            ...parseProfiles(n),
          };
        }
      }
      walk(n);
    }
  }
  walk(root);

  return lookup;
}

// ── Force entry (fleet list) parsing ─────────────────────────────────────────

function parseForceEntries(docEl) {
  const forces = [];
  for (const fe of descendantsNamed(docEl, 'forceEntry')) {
    if (attr(fe, 'hidden') === 'true') continue;
    const name = attr(fe, 'name');
    const categories = [];
    const clParent = childrenNamed(fe, 'categoryLinks')[0] || fe;
    for (const cl of childrenNamed(clParent, 'categoryLink')) {
      if (attr(cl, 'hidden') === 'true') continue;
      categories.push({ name: attr(cl, 'name'), constraints: parseConstraints(cl) });
    }
    forces.push({ name, categories });
  }
  return forces;
}

// ── Per-catalogue parser ──────────────────────────────────────────────────────

function parseCatalogue(xml, filename, gstLookup) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const root = doc.documentElement;

  const isGst = filename.endsWith('.gst');
  const catalogueName = attr(root, 'name');
  const entries = [];

  if (isGst) {
    return { catalogueName, isGst: true, entries: [], fleetLists: [] };
  }

  // Helper to turn a parsed entry object into a ship record
  function toShip(raw, overrideName) {
    const name = overrideName || raw.name;
    const cats = raw.categories || [];
    const category = classifyEntry({ categories: cats, stats: raw.stats });
    return {
      id:           raw.id,
      name,
      pts:          raw.pts || 0,
      categories:   cats,
      category:     category || 'Other',
      stats:        raw.stats || {},
      armament:     raw.armament || [],
      specialRules: raw.specialRules || [],
      upgrades:     raw.upgrades || [],
    };
  }

  // --- 1. Direct selectionEntries at the top level (depth 1) ---
  // Note: in .cat files many ships are hidden="true" conditionally (fleet list modifiers reveal them).
  // We include them all here and rely on category classification as the filter.
  function getTopLevelEntries(parent) {
    for (const el of childrenNamed(parent, 'selectionEntries')) {
      for (const entry of childrenNamed(el, 'selectionEntry')) {
        const raw = {
          id:   attr(entry, 'id'),
          name: attr(entry, 'name'),
          type: attr(entry, 'type'),
          pts:  parseCost(entry),
          categories:   parseCategories(entry),
          upgrades:     parseUpgrades(entry),
          ...parseProfiles(entry),
        };
        // Only include if it has ship stats or is a commander
        const cat = classifyEntry(raw);
        if (cat) entries.push(toShip(raw));
      }
    }
  }

  // --- 2. entryLinks at top level → resolve from GST ---
  function getTopLevelLinks(parent) {
    for (const el of childrenNamed(parent, 'entryLinks')) {
      for (const link of childrenNamed(el, 'entryLink')) {
        if (attr(link, 'hidden') === 'true') continue;
        const targetId = attr(link, 'targetId');
        const gstEntry = gstLookup[targetId];
        if (!gstEntry) continue;

        // Use the link's name if different (sometimes localised)
        const linkName = attr(link, 'name');
        const name = linkName || gstEntry.name;

        // Merge pts: entryLink can override cost
        const linkPts = parseCost(link);
        const pts = linkPts !== 0 ? linkPts : gstEntry.pts;

        // Categories come from the link's categoryLinks first, then GST
        const linkCats = parseCategories(link);
        const cats = linkCats.length ? linkCats : gstEntry.categories;

        // Upgrades from link override GST
        const linkUpgrades = parseUpgrades(link);
        const upgrades = linkUpgrades.length ? linkUpgrades : gstEntry.upgrades;

        const merged = {
          id:           gstEntry.id,
          name,
          pts,
          categories:   cats,
          stats:        gstEntry.stats,
          armament:     gstEntry.armament,
          specialRules: gstEntry.specialRules,
          upgrades,
        };

        const cat = classifyEntry(merged);
        if (cat) entries.push(toShip(merged));
      }
    }
  }

  // --- 3. Nested selectionEntries within selectionEntryGroups (e.g. Battleships) ---
  function getNestedGroupEntries(parent) {
    for (const groups of childrenNamed(parent, 'selectionEntryGroups')) {
      for (const group of childrenNamed(groups, 'selectionEntryGroup')) {
        if (attr(group, 'hidden') === 'true') continue;
        for (const el of childrenNamed(group, 'selectionEntries')) {
          for (const entry of childrenNamed(el, 'selectionEntry')) {
            const raw = {
              id:   attr(entry, 'id'),
              name: attr(entry, 'name'),
              type: attr(entry, 'type'),
              pts:  parseCost(entry),
              categories:   parseCategories(entry),
              upgrades:     parseUpgrades(entry),
              ...parseProfiles(entry),
            };
            const cat = classifyEntry(raw);
            if (cat) entries.push(toShip(raw));
          }
        }
        // Also resolve entryLinks inside groups
        getTopLevelLinks(group);
      }
    }
  }

  // --- 4. Deep walk: selectionEntry type="unit" at ANY depth ---
  // Real escort classes (Sword, Cobra, Firestorm…) are nested inside
  // "Escort Squadron" container entries and missed by the passes above.
  function walkAllUnits(node) {
    if (!node.childNodes) return;
    for (let i = 0; i < node.childNodes.length; i++) {
      const n = node.childNodes[i];
      if (n.nodeName === 'selectionEntry') {
        // Some real ships are mislabelled type="upgrade" in BSData (e.g. Chaos
        // Iconoclast/Infidel), so trust the Unit profile, not the type attr —
        // but require the entry's OWN profile (direct profiles element), not a
        // descendant's, so squadron containers don't inherit a child's identity.
        const ownProfiles = childrenNamed(n, 'profiles')[0];
        const ownType = ownProfiles && descendantsNamed(ownProfiles, 'profile')
          .some(function(p) { return attr(p, 'typeName') === 'Unit' || attr(p, 'typeName') === 'Commander'; });
        if (ownType || attr(n, 'type') === 'unit') {
          const raw = {
            id:   attr(n, 'id'),
            name: attr(n, 'name'),
            type: attr(n, 'type'),
            pts:  parseCost(n),
            categories:   parseCategories(n),
            upgrades:     parseUpgrades(n),
            ...parseProfiles(n),
          };
          const cat = classifyEntry(raw);
          if (cat) entries.push(toShip(raw));
        }
      }
      walkAllUnits(n);
    }
  }

  getTopLevelEntries(root);
  getTopLevelLinks(root);
  getNestedGroupEntries(root);
  walkAllUnits(root);

  const fleetLists = parseForceEntries(root);

  // Deduplicate by id
  const seen = new Set();
  const unique = entries.filter(function(e) {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return { catalogueName, isGst: false, entries: unique, fleetLists };
}

// ── Build output database ─────────────────────────────────────────────────────

// Categories that represent actual selectable ships (not entries we should skip)
// 0-pt entries with these names are BSData containers/validation helpers, not ships
const JUNK_NAMES = /^(armour |turns |re-rolls$|validation |the inquisition$|fleet commander$|escort squadron|imperial escort squadron|space marine escort squadron|vanguard escort squadron|escort squardon)/i;

const SHIP_CATEGORIES = [
  'Battleship', 'Battlecruiser', 'Grand Cruiser', 'Cruiser',
  'Light Cruiser', 'Heavy Cruiser', 'Escort', 'Fleet Commander',
  'Transport', 'Other',
];

function buildDatabase(catalogues) {
  const db = {
    version:    new Date().toISOString(),
    bsdataRepo: 'https://github.com/BSData/battlefleetgothic',
    factions:   {},
    ships:      {},
  };

  for (const cat of catalogues) {
    if (cat.isGst) continue;

    const faction = cat.catalogueName;
    db.factions[faction] = {
      fleetLists: cat.fleetLists,
      ships: [],
    };

    const seenNames = new Set();
    for (const entry of cat.entries) {
      if (SHIP_CATEGORIES.indexOf(entry.category) === -1) continue;
      // Skip 0-pt "Escort Squadron" container entries — real escorts always cost pts
      if (entry.category === 'Escort' && !entry.pts) continue;
      // Skip BSData helper/container junk hoisted by the deep walk
      if (!entry.pts && JUNK_NAMES.test(entry.name)) continue;
      // Dedup same-named ships within a faction (top-level entry wins)
      const nameKey = entry.name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      const ship = {
        id:           entry.id,
        name:         entry.name,
        faction:      faction,
        pts:          entry.pts,
        category:     entry.category,
        stats:        entry.stats,
        armament:     entry.armament,
        specialRules: entry.specialRules,
        upgrades:     entry.upgrades,
      };

      db.ships[entry.id] = ship;
      db.factions[faction].ships.push(entry.id);
    }
  }

  return db;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching BSData files...');
  const rawFiles = {};

  for (const file of CAT_FILES) {
    const url = BSDATA_BASE + encodeURIComponent(file);
    console.log('  ' + file);
    try {
      rawFiles[file] = await fetch(url);
      console.log('    downloaded');
    } catch (err) {
      console.error('    FAILED: ' + err.message);
    }
  }

  // Pass 1: build GST lookup
  console.log('\nPass 1: building GST lookup...');
  const gstXml = rawFiles['Battlefleet_Gothic.gst'];
  const gstLookup = gstXml ? buildGstLookup(gstXml) : {};
  console.log('  GST entries indexed: ' + Object.keys(gstLookup).length);

  // Pass 2: parse each catalogue
  console.log('\nPass 2: parsing catalogues...');
  const catalogues = [];
  for (const file of CAT_FILES) {
    const xml = rawFiles[file];
    if (!xml) continue;
    const parsed = parseCatalogue(xml, file, gstLookup);
    catalogues.push(parsed);
    if (!parsed.isGst) {
      console.log('  ' + parsed.catalogueName + ': ' + parsed.entries.length + ' ships, ' + parsed.fleetLists.length + ' fleet lists');
    }
  }

  const db = buildDatabase(catalogues);
  const shipCount = Object.keys(db.ships).length;
  const factionCount = Object.keys(db.factions).length;
  console.log('\nBuilt database: ' + factionCount + ' factions, ' + shipCount + ' ships/units');

  // Print breakdown by faction + category
  for (const [faction, data] of Object.entries(db.factions)) {
    const cats = {};
    data.ships.forEach(function(id) {
      const s = db.ships[id];
      cats[s.category] = (cats[s.category] || 0) + 1;
    });
    console.log('  ' + faction + ': ' + JSON.stringify(cats));
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2));
  console.log('\nWritten: ' + OUT_FILE);

  fs.writeFileSync(LOG_FILE, JSON.stringify({
    synced:   db.version,
    factions: factionCount,
    ships:    shipCount,
    source:   db.bsdataRepo,
  }, null, 2));
}

main().catch(function(err) { console.error(err); process.exit(1); });

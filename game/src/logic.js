/* HEXCLASH — pure game logic (node + browser, no DOM / network).
 * Distance metric: Chebyshev distance on the 8x8 board (diagonals count as 1),
 * so a melee unit with range 1 can hit any of the 8 adjacent tiles.
 * Time: battle.step() advances 100ms. All randomness comes from a seeded
 * mulberry32 RNG passed in or created from a seed — never Math.random.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* ---------------- RNG ---------------- */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var _uid = 0;
  function nextUid() { _uid += 1; return 'u' + _uid; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- Heroes (20, original names) ---------------- */
  var HEROES = [
    // Tier 1 (1g)
    { id: 'pip',     name: 'Pip the Sprout',        tier: 1, cls: 'Bulwark', faction: 'Verdant', hp: 700, attack: 45, range: 1, attackSpeed: 0.7, ability: { name: 'Sprout Mend',   desc: 'Heals self for 30% of max HP.',            kind: 'heal' } },
    { id: 'rusty',   name: 'Rusty the Tin Knight',  tier: 1, cls: 'Blade',   faction: 'Ember',   hp: 650, attack: 55, range: 1, attackSpeed: 0.8, ability: { name: 'Tin Cleave',    desc: 'Hits all adjacent enemies for 150% attack damage.', kind: 'aoe' } },
    { id: 'fizz',    name: 'Fizz the Spark Imp',    tier: 1, cls: 'Arcane',  faction: 'Ember',   hp: 550, attack: 60, range: 3, attackSpeed: 0.9, ability: { name: 'Fireball',      desc: 'Hurls a fireball dealing 200% attack damage.',   kind: 'damage' } },
    { id: 'nib',     name: 'Nib the Cave Rat',      tier: 1, cls: 'Blade',   faction: 'Shadow',  hp: 600, attack: 55, range: 1, attackSpeed: 1.1, ability: { name: 'Sneak Dash',    desc: 'Dashes to the weakest enemy and crits for 150% damage.', kind: 'damage' } },
    { id: 'luma',    name: 'Luma the Glow Moth',    tier: 1, cls: 'Arcane',  faction: 'Frost',   hp: 550, attack: 55, range: 3, attackSpeed: 0.9, ability: { name: 'Frost Bolt',    desc: 'Deals 150% attack damage and slows the target 35% for 3s.', kind: 'damage' } },
    { id: 'bram',    name: 'Bram the Stone Goat',   tier: 1, cls: 'Bulwark', faction: 'Frost',   hp: 700, attack: 45, range: 1, attackSpeed: 0.6, ability: { name: 'Stone Shield',  desc: 'Gains a shield equal to 30% of max HP.',      kind: 'shield' } },
    // Tier 2 (2g)
    { id: 'kira',    name: 'Kira the Swift Fox',    tier: 2, cls: 'Bow',     faction: 'Shadow',  hp: 800, attack: 75, range: 3, attackSpeed: 1.0, ability: { name: 'Multi-Shot',    desc: 'Shoots up to 3 enemies for 120% attack damage each.', kind: 'aoe' } },
    { id: 'durn',    name: 'Durn the Anvil Dwarf',  tier: 2, cls: 'Bulwark', faction: 'Ember',   hp: 900, attack: 65, range: 1, attackSpeed: 0.7, ability: { name: 'Anvil Aura',    desc: 'Allies gain +20 armor for 5s.',              kind: 'buff' } },
    { id: 'mirelle', name: 'Mirelle the Tide Witch',tier: 2, cls: 'Arcane',  faction: 'Frost',   hp: 750, attack: 80, range: 3, attackSpeed: 0.85, ability: { name: 'Tide Wave',    desc: 'A wave hits all enemies for 150% attack damage.', kind: 'aoe' } },
    { id: 'thorn',   name: 'Thorn the Bramble',     tier: 2, cls: 'Blade',   faction: 'Verdant', hp: 850, attack: 70, range: 1, attackSpeed: 0.85, ability: { name: 'Thorn Reflect', desc: 'Reflects 50% of damage taken for 5s.',     kind: 'buff' } },
    { id: 'pippa',   name: 'Pippa the Clockwork Owl',tier: 2, cls: 'Arcane', faction: 'Storm',   hp: 750, attack: 80, range: 3, attackSpeed: 1.0, ability: { name: 'Chain Zap',     desc: 'Zaps a target for 150%, chaining to 2 more for 100%/70%.', kind: 'aoe' } },
    { id: 'gronk',   name: 'Gronk the Moss Troll',  tier: 2, cls: 'Bulwark', faction: 'Verdant', hp: 950, attack: 65, range: 1, attackSpeed: 0.65, ability: { name: 'Moss Regen',   desc: 'Regenerates 5% max HP per second for 5s.',    kind: 'heal' } },
    // Tier 3 (3g)
    { id: 'sable',   name: 'Sable the Night Panther',tier: 3, cls: 'Blade',  faction: 'Shadow',  hp: 1050, attack: 100, range: 1, attackSpeed: 1.1, ability: { name: 'Night Execute', desc: 'Executes an enemy below 30% HP, else deals 250% damage.', kind: 'damage' } },
    { id: 'aurora',  name: 'Aurora the Sky Whale', tier: 3, cls: 'Bow',     faction: 'Frost',   hp: 1000, attack: 95, range: 3, attackSpeed: 0.8, ability: { name: 'Blizzard',      desc: 'Blizzard hits all enemies for 180% damage and slows them 30% for 3s.', kind: 'aoe' } },
    { id: 'cinder',  name: 'Cinder the Ash Phoenix',tier: 3, cls: 'Arcane', faction: 'Ember',   hp: 1000, attack: 105, range: 3, attackSpeed: 0.9, ability: { name: 'Ash Rebirth',   desc: 'Revives once at 50% HP when killed; on cast, a fire nova hits all enemies for 150%.', kind: 'revive' } },
    { id: 'wren',    name: 'Wren the Storm Crow',   tier: 3, cls: 'Bow',     faction: 'Storm',   hp: 1000, attack: 100, range: 3, attackSpeed: 1.1, ability: { name: 'Storm Arrows',  desc: 'Arrows strike up to 4 enemies for 130% attack damage each.', kind: 'aoe' } },
    // Tier 4 (4g)
    { id: 'magnus',  name: 'Magnus the Mountain King',tier: 4, cls: 'Bulwark', faction: 'Ember', hp: 1600, attack: 125, range: 1, attackSpeed: 0.7, ability: { name: 'Ground Slam',  desc: 'Slams the ground: enemies within 2 tiles take 150% damage and are stunned 1.5s.', kind: 'aoe' } },
    { id: 'sylvara', name: 'Sylvara the Thorn Queen',tier: 4, cls: 'Arcane', faction: 'Verdant', hp: 1400, attack: 130, range: 3, attackSpeed: 0.85, ability: { name: 'Root & Poison', desc: 'Roots 3 nearest enemies for 2s and poisons them for 3% max HP/s for 3s.', kind: 'control' } },
    { id: 'zephyr',  name: 'Zephyr the Wind Djinn', tier: 4, cls: 'Arcane', faction: 'Storm',   hp: 1400, attack: 135, range: 3, attackSpeed: 0.95, ability: { name: 'Tornado',       desc: 'A tornado knocks enemies within 2 tiles back 2 tiles and deals 120% damage.', kind: 'control' } },
    // Tier 5 (5g)
    { id: 'oblivion',name: 'Oblivion the Void Dragon',tier: 5, cls: 'Arcane', faction: 'Shadow', hp: 2000, attack: 150, range: 3, attackSpeed: 0.8, ability: { name: 'Void Cataclysm', desc: 'Massive void blast hits all enemies for 250% damage and fears them for 2s.', kind: 'aoe' } }
  ];
  var HERO_MAP = {};
  HEROES.forEach(function (h) { HERO_MAP[h.id] = h; });

  var SHOP_ODDS = {
    3: [75, 20, 5, 0, 0],
    4: [65, 28, 6, 1, 0],
    5: [55, 30, 12, 2, 1],
    6: [45, 33, 17, 4, 1],
    7: [30, 36, 25, 7, 2],
    8: [22, 30, 30, 14, 4],
    9: [15, 25, 30, 20, 10]
  };

  // XP needed to go from current level -> next. Index = current level. L9 max.
  var XP_TABLE = [0, 0, 0, 6, 8, 10, 12, 14, 16, 0];
  function xpToNext(level) {
    if (level >= 9) return Infinity;
    return XP_TABLE[level] || 0;
  }

  /* ---------------- Synergies ---------------- */
  var SYNERGY_DEFS = {
    blade:   { key: 'blade',   name: 'Blade',   type: 'class',   thresholds: [{ count: 2, tier: 1, desc: '+15% attack speed' }, { count: 4, tier: 2, desc: '+30% attack speed' }, { count: 6, tier: 3, desc: '+50% attack speed' }] },
    bow:     { key: 'bow',     name: 'Bow',     type: 'class',   thresholds: [{ count: 2, tier: 1, desc: '+20% attack damage' }, { count: 4, tier: 2, desc: '+40% attack damage' }, { count: 6, tier: 3, desc: '+70% attack damage' }] },
    arcane:  { key: 'arcane',  name: 'Arcane',  type: 'class',   thresholds: [{ count: 2, tier: 1, desc: 'Abilities deal +25% damage' }, { count: 4, tier: 2, desc: 'Abilities deal +50% damage' }, { count: 6, tier: 3, desc: 'Abilities deal +100% damage' }] },
    bulwark: { key: 'bulwark', name: 'Bulwark', type: 'class',   thresholds: [{ count: 2, tier: 1, desc: '+20 armor' }, { count: 4, tier: 2, desc: '+40 armor' }, { count: 6, tier: 3, desc: '+70 armor' }] },
    ember:   { key: 'ember',   name: 'Ember',   type: 'faction', thresholds: [{ count: 2, tier: 1, desc: 'Burn on hit: 5 dps for 3s' }, { count: 4, tier: 2, desc: 'Burn on hit: 12 dps for 3s' }] },
    frost:   { key: 'frost',   name: 'Frost',   type: 'faction', thresholds: [{ count: 2, tier: 1, desc: 'Attackers are slowed 20%' }, { count: 4, tier: 2, desc: 'Attackers are slowed 35%' }] },
    verdant: { key: 'verdant', name: 'Verdant', type: 'faction', thresholds: [{ count: 2, tier: 1, desc: 'Heal 3% max HP per second' }, { count: 4, tier: 2, desc: 'Heal 6% max HP per second' }] },
    shadow:  { key: 'shadow',  name: 'Shadow',  type: 'faction', thresholds: [{ count: 2, tier: 1, desc: '+20% crit chance' }, { count: 4, tier: 2, desc: '+40% crit chance' }] },
    storm:   { key: 'storm',   name: 'Storm',   type: 'faction', thresholds: [{ count: 2, tier: 1, desc: '+15% mana gain' }, { count: 4, tier: 2, desc: '+30% mana gain' }] }
  };

  function heroOfUnit(u) {
    if (!u) return null;
    if (typeof u === 'string') return HERO_MAP[u] || null;
    if (u.heroId && HERO_MAP[u.heroId]) return HERO_MAP[u.heroId];
    if (u.id && HERO_MAP[u.id]) return HERO_MAP[u.id];
    if (u.cls && u.faction) return u; // already hero-like
    return null;
  }

  // Count UNIQUE heroes on board (by heroId).
  function getSynergies(units) {
    var counts = { blade: 0, bow: 0, arcane: 0, bulwark: 0, ember: 0, frost: 0, verdant: 0, shadow: 0, storm: 0 };
    var seen = {};
    (units || []).forEach(function (u) {
      if (!u) return;
      var h = heroOfUnit(u);
      if (!h) return;
      var key = h.id;
      if (seen[key]) return;
      seen[key] = true;
      var c = (h.cls || '').toLowerCase();
      var f = (h.faction || '').toLowerCase();
      if (counts[c] !== undefined) counts[c] += 1;
      if (counts[f] !== undefined) counts[f] += 1;
    });
    var active = [];
    Object.keys(SYNERGY_DEFS).forEach(function (k) {
      var def = SYNERGY_DEFS[k];
      var n = counts[k];
      var best = null;
      def.thresholds.forEach(function (t) { if (n >= t.count) best = t; });
      if (best) active.push({ key: k, name: def.name, count: n, tier: best.tier, desc: best.desc });
    });
    return { counts: counts, active: active };
  }

  function activeTierMap(synergies) {
    var map = {};
    var list = null;
    if (!synergies) return map;
    if (Array.isArray(synergies)) list = synergies;
    else if (Array.isArray(synergies.active)) list = synergies.active;
    (list || []).forEach(function (a) { map[a.key] = a.tier; });
    return map;
  }

  // Computes effective stats from base stats + synergies. Idempotent: always
  // derives from baseAttack/baseAttackSpeed/baseArmor/baseCritChance.
  function applySynergyStats(unit, synergies) {
    if (!unit) return unit;
    if (unit.baseAttack === undefined) unit.baseAttack = unit.attack || 0;
    if (unit.baseAttackSpeed === undefined) unit.baseAttackSpeed = unit.attackSpeed || 1;
    if (unit.baseArmor === undefined) unit.baseArmor = unit.armor || 0;
    if (unit.baseCritChance === undefined) unit.baseCritChance = (unit.critChance !== undefined ? unit.critChance : 0.05);
    var t = activeTierMap(synergies);
    var bowMult = t.bow === 3 ? 1.7 : (t.bow === 2 ? 1.4 : (t.bow === 1 ? 1.2 : 1));
    var bladeMult = t.blade === 3 ? 1.5 : (t.blade === 2 ? 1.3 : (t.blade === 1 ? 1.15 : 1));
    unit.attack = unit.baseAttack * bowMult;
    unit.attackSpeed = unit.baseAttackSpeed * bladeMult;
    unit.armor = unit.baseArmor + (t.bulwark === 3 ? 70 : (t.bulwark === 2 ? 40 : (t.bulwark === 1 ? 20 : 0)));
    unit.critChance = unit.baseCritChance + (t.shadow === 2 ? 0.40 : (t.shadow === 1 ? 0.20 : 0));
    unit.manaGain = t.storm === 2 ? 1.30 : (t.storm === 1 ? 1.15 : 1);
    unit.burnDps = t.ember === 2 ? 12 : (t.ember === 1 ? 5 : 0);
    unit.slowPct = t.frost === 2 ? 0.35 : (t.frost === 1 ? 0.20 : 0);
    unit.regenPct = t.verdant === 2 ? 0.06 : (t.verdant === 1 ? 0.03 : 0);
    unit.arcaneBonus = t.arcane === 3 ? 1.0 : (t.arcane === 2 ? 0.5 : (t.arcane === 1 ? 0.25 : 0));
    return unit;
  }

  /* ---------------- Creeps & opponents ---------------- */
  var CREEP_TYPES = [
    { id: 'slime', name: 'Slime', hp: 400, attack: 30, range: 1, attackSpeed: 0.7 },
    { id: 'bat',   name: 'Bat',   hp: 300, attack: 40, range: 1, attackSpeed: 1.1 },
    { id: 'golem', name: 'Golem', hp: 800, attack: 50, range: 1, attackSpeed: 0.5 }
  ];
  var CREEP_MAP = {};
  CREEP_TYPES.forEach(function (c) { CREEP_MAP[c.id] = c; });

  var OPPONENTS = [
    { name: 'Rook',  color: '#e74c3c' },
    { name: 'Vex',   color: '#9b59b6' },
    { name: 'Mira',  color: '#3498db' },
    { name: 'Odo',   color: '#f39c12' },
    { name: 'Sabre', color: '#1abc9c' },
    { name: 'Pip',   color: '#e67e22' },
    { name: 'Grim',  color: '#7f8c8d' }
  ];

  function shuffledNames(rng) {
    var names = OPPONENTS.map(function (o) { return o.name; });
    for (var i = names.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = names[i]; names[i] = names[j]; names[j] = tmp;
    }
    return names;
  }

  /* ---------------- Units ---------------- */
  function makeUnit(heroId, star, side, x, y) {
    var h = HERO_MAP[heroId] || CREEP_MAP[heroId];
    if (!h) return null;
    var s = star || 1;
    var mult = Math.pow(1.8, s - 1);
    var hp = Math.round(h.hp * mult);
    var unit = {
      uid: nextUid(),
      heroId: heroId,
      name: h.name,
      star: s,
      side: side || 'player',
      x: (x === undefined || x === null) ? 0 : x,
      y: (y === undefined || y === null) ? 0 : y,
      hp: hp,
      maxHp: hp,
      attack: Math.round(h.attack * mult),
      baseAttack: Math.round(h.attack * mult),
      range: h.range,
      attackSpeed: h.attackSpeed,
      baseAttackSpeed: h.attackSpeed,
      mana: 0,
      manaMax: 100,
      alive: true,
      armor: 0,
      baseArmor: 0,
      critChance: 0.05,
      baseCritChance: 0.05,
      burnDps: 0,
      slowPct: 0,
      regenPct: 0,
      manaGain: 1,
      arcaneBonus: 0,
      moveCd: 0,
      atkCd: 0,
      stun: 0,
      root: 0,
      shield: 0,
      reflect: 0,
      reflectUntil: 0,
      regenUntil: 0,
      regenActive: 0,
      reviveUsed: false,
      fearUntil: 0,
      slowUntil: 0,
      slowFactor: 0,
      burnUntil: 0,
      burnDpsActive: 0,
      poisonUntil: 0,
      poisonDps: 0,
      auraArmor: 0,
      auraArmorUntil: 0,
      guaranteedCrit: false
    };
    if (h.cls) unit.cls = h.cls;
    if (h.faction) unit.faction = h.faction;
    if (h.tier) unit.tier = h.tier;
    if (h.ability) unit.ability = h.ability;
    return unit;
  }

  function flattenUnits(input) {
    var out = [];
    if (!input) return out;
    if (Array.isArray(input) && input.length && Array.isArray(input[0])) {
      input.forEach(function (row) { (row || []).forEach(function (u) { if (u) out.push(u); }); });
    } else if (Array.isArray(input)) {
      input.forEach(function (u) { if (u) out.push(u); });
    }
    return out;
  }

  /* ---------------- Game state / economy ---------------- */
  function emptyBoard() {
    var b = [];
    for (var y = 0; y < 8; y++) { var row = []; for (var x = 0; x < 8; x++) row.push(null); b.push(row); }
    return b;
  }

  function createGame(seed) {
    var rng = mulberry32(seed === undefined || seed === null ? ((Date.now() >>> 0) || 1) : seed);
    var state = {
      round: 1, phase: 'prep', prepTimeLeft: 25, gold: 5, xp: 0, level: 3, hp: 100,
      bench: [], board: emptyBoard(), shop: [], locked: false,
      streak: 0, wins: 0, losses: 0,
      opponents: OPPONENTS.map(function (o) { return { name: o.name, color: o.color, hp: 100, alive: true }; }),
      placement: null, best: 0, gamesPlayed: 0, speed: 1, muted: false, paused: false, log: []
    };
    state.opponentQueue = shuffledNames(rng);
    state.currentOpponent = state.opponentQueue[0] || null;
    state.lastWin = false;
    state._bestRecorded = false;
    rollShop(state, rng);
    return state;
  }

  function calcIncome(state, won) {
    var win = 0;
    if (won !== undefined) win = won ? 1 : 0;
    else if (state.lastWin) win = 1;
    else if (state.lastResult === 'win' || state.lastResult === 'player') win = 1;
    var interest = Math.min(5, Math.floor((state.gold || 0) / 10));
    var streak = state.streak || 0;
    var streakBonus = streak >= 3 ? Math.min(3, streak - 2) : 0;
    var base = 5;
    return { base: base, win: win, interest: interest, streakBonus: streakBonus, total: base + win + interest + streakBonus };
  }

  function heroesOfTier(tier) { return HEROES.filter(function (h) { return h.tier === tier; }); }

  function rollShop(state, rng) {
    if (state.locked) return state.shop;
    var r = rng || mulberry32((Date.now() >>> 0) || 1);
    var odds = SHOP_ODDS[state.level] || SHOP_ODDS[3];
    var shop = [];
    for (var i = 0; i < 5; i++) {
      var roll = r() * 100;
      var acc = 0, tier = 1;
      for (var t = 0; t < 5; t++) {
        acc += odds[t];
        if (roll < acc) { tier = t + 1; break; }
        tier = t + 1;
      }
      var pool = heroesOfTier(tier);
      if (!pool.length) pool = heroesOfTier(1);
      shop.push(pool[Math.floor(r() * pool.length)].id);
    }
    state.shop = shop;
    return state.shop;
  }

  function deployedCount(state) {
    var n = 0;
    state.board.forEach(function (row) { row.forEach(function (u) { if (u) n += 1; }); });
    return n;
  }

  function buyHero(state, shopIdx, rng) {
    if (shopIdx === undefined || shopIdx === null || shopIdx < 0 || shopIdx >= 5) return { ok: false, reason: 'invalid shop slot' };
    var heroId = state.shop[shopIdx];
    if (!heroId) return { ok: false, reason: 'shop slot empty' };
    var hero = HERO_MAP[heroId];
    if (!hero) return { ok: false, reason: 'unknown hero' };
    if ((state.gold || 0) < hero.tier) return { ok: false, reason: 'not enough gold' };
    if (state.bench.length >= 9) return { ok: false, reason: 'bench full' };
    state.gold -= hero.tier;
    state.bench.push({ uid: nextUid(), heroId: heroId, star: 1, side: 'player' });
    state.shop[shopIdx] = null;
    state.log.push('Bought ' + hero.name + ' for ' + hero.tier + 'g');
    var combines = combineStars(state);
    return { ok: true, heroId: heroId, combines: combines };
  }

  function sellRefund(heroId, star) {
    var hero = HERO_MAP[heroId];
    if (!hero) return 0;
    return hero.tier * (star === 3 ? 9 : (star === 2 ? 3 : 1));
  }

  function sellHero(state, where) {
    if (where && where.bench !== undefined && where.bench !== null) {
      var i = where.bench;
      var item = state.bench[i];
      if (!item) return { ok: false, reason: 'no hero on bench' };
      var refund = sellRefund(item.heroId, item.star || 1);
      state.bench.splice(i, 1);
      state.gold += refund;
      state.log.push('Sold ' + (HERO_MAP[item.heroId] || {}).name + ' for ' + refund + 'g');
      return { ok: true, refund: refund, gold: state.gold };
    }
    if (where && where.board) {
      var x = where.board.x, y = where.board.y;
      if (y === undefined || x === undefined || !state.board[y] || !state.board[y][x]) return { ok: false, reason: 'no hero on board' };
      var unit = state.board[y][x];
      var r2 = sellRefund(unit.heroId, unit.star || 1);
      state.board[y][x] = null;
      state.gold += r2;
      state.log.push('Sold ' + unit.name + ' for ' + r2 + 'g');
      return { ok: true, refund: r2, gold: state.gold };
    }
    return { ok: false, reason: 'invalid location' };
  }

  function placeHero(state, benchIdx, x, y) {
    var item = state.bench[benchIdx];
    if (!item) return { ok: false, reason: 'no hero on bench' };
    if (x < 0 || x > 7 || y < 0 || y > 7) return { ok: false, reason: 'out of bounds' };
    if (y < 4) return { ok: false, reason: 'must place on player half (rows 4-7)' };
    if (state.board[y][x]) return { ok: false, reason: 'tile occupied' };
    if (deployedCount(state) >= state.level) return { ok: false, reason: 'deployment limit reached' };
    state.bench.splice(benchIdx, 1);
    var unit = makeUnit(item.heroId, item.star || 1, 'player', x, y);
    state.board[y][x] = unit;
    var combines = combineStars(state);
    return { ok: true, unit: unit, combines: combines };
  }

  function recallHero(state, x, y) {
    if (y === undefined || x === undefined || !state.board[y] || !state.board[y][x]) return { ok: false, reason: 'no hero on board' };
    if (state.bench.length >= 9) return { ok: false, reason: 'bench full' };
    var unit = state.board[y][x];
    state.board[y][x] = null;
    state.bench.push({ uid: unit.uid || nextUid(), heroId: unit.heroId, star: unit.star || 1, side: 'player' });
    return { ok: true, heroId: unit.heroId };
  }

  function applyLevelUps(state) {
    var leveled = false;
    while (state.level < 9 && state.xp >= xpToNext(state.level)) {
      state.xp -= xpToNext(state.level);
      state.level += 1;
      leveled = true;
    }
    return leveled;
  }

  function levelUp(state) {
    if (state.level >= 9) return { ok: false, reason: 'max level' };
    if ((state.gold || 0) < 4) return { ok: false, reason: 'not enough gold' };
    state.gold -= 4;
    state.xp += 4;
    var leveled = applyLevelUps(state);
    return { ok: true, level: state.level, xp: state.xp, leveledUp: leveled };
  }

  function addRoundXp(state) {
    state.xp += 2;
    var leveled = applyLevelUps(state);
    return { ok: true, level: state.level, xp: state.xp, leveledUp: leveled };
  }

  // Combine 3 copies of the same hero at the same star (bench-only and
  // board-only groups). HP/attack x1.8 per star-up. Board combines keep the
  // position of the first copy found. Loops until no more triples (9x 1-star
  // -> 3x 2-star -> 1x 3-star). Returns list of combines done.
  function combineStars(state) {
    var done = [];
    var changed = true;
    var guard = 0;
    while (changed && guard < 50) {
      guard += 1;
      changed = false;
      // Bench groups
      var benchGroups = {};
      state.bench.forEach(function (item, idx) {
        var k = item.heroId + ':' + (item.star || 1);
        (benchGroups[k] = benchGroups[k] || []).push(idx);
      });
      var benchKeys = Object.keys(benchGroups);
      for (var bi = 0; bi < benchKeys.length; bi++) {
        var g = benchGroups[benchKeys[bi]];
        if (g.length >= 3 && (state.bench[g[0]].star || 1) < 3) {
          var heroId = state.bench[g[0]].heroId;
          var newStar = (state.bench[g[0]].star || 1) + 1;
          g.slice(0, 3).sort(function (a, b) { return b - a; }).forEach(function (idx) { state.bench.splice(idx, 1); });
          state.bench.push({ uid: nextUid(), heroId: heroId, star: newStar, side: 'player' });
          done.push({ heroId: heroId, star: newStar, fromStar: newStar - 1, where: 'bench' });
          changed = true;
          break;
        }
      }
      if (changed) continue;
      // Board groups
      var boardGroups = {};
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var u = state.board[y][x];
          if (!u) continue;
          var k2 = u.heroId + ':' + (u.star || 1);
          (boardGroups[k2] = boardGroups[k2] || []).push({ x: x, y: y, unit: u });
        }
      }
      var boardKeys = Object.keys(boardGroups);
      for (var ci = 0; ci < boardKeys.length; ci++) {
        var g2 = boardGroups[boardKeys[ci]];
        if (g2.length >= 3 && (g2[0].unit.star || 1) < 3) {
          var keep = g2[0];
          var newStar2 = (keep.unit.star || 1) + 1;
          var hero = HERO_MAP[keep.unit.heroId];
          var mult = Math.pow(1.8, newStar2 - 1);
          for (var ri = 1; ri < 3; ri++) state.board[g2[ri].y][g2[ri].x] = null;
          keep.unit.star = newStar2;
          keep.unit.maxHp = Math.round(hero.hp * mult);
          keep.unit.hp = keep.unit.maxHp;
          keep.unit.attack = Math.round(hero.attack * mult);
          keep.unit.baseAttack = keep.unit.attack;
          done.push({ heroId: keep.unit.heroId, star: newStar2, fromStar: newStar2 - 1, where: 'board', x: keep.x, y: keep.y });
          changed = true;
          break;
        }
      }
    }
    return done;
  }

  function toggleLock(state) {
    state.locked = !state.locked;
    return { ok: true, locked: state.locked };
  }

  function refreshShop(state, rng) {
    if (state.locked) return { ok: false, reason: 'shop locked' };
    if ((state.gold || 0) < 2) return { ok: false, reason: 'not enough gold' };
    state.gold -= 2;
    rollShop(state, rng);
    return { ok: true, shop: state.shop };
  }

  /* ---------------- Combat ---------------- */
  function getArmor(u, timeMs) {
    var a = u.armor || 0;
    if (u.auraArmorUntil && u.auraArmorUntil > timeMs) a += u.auraArmor || 0;
    return a;
  }

  function checkDeath(battle, unit, events) {
    if (unit.hp > 0 || !unit.alive) return false;
    // Cinder revive: once, at 50% HP.
    if (unit.heroId === 'cinder' && !unit.reviveUsed) {
      unit.reviveUsed = true;
      unit.hp = Math.round(unit.maxHp * 0.5);
      unit.alive = true;
      events.push({ type: 'heal', uid: unit.uid, x: unit.x, y: unit.y, targetUid: unit.uid, amount: unit.hp, ability: 'Ash Rebirth' });
      return false;
    }
    unit.hp = 0;
    unit.alive = false;
    events.push({ type: 'death', uid: unit.uid, x: unit.x, y: unit.y, targetUid: unit.uid, amount: 0 });
    return true;
  }

  // Deal damage to victim. opts: {armorApplies, isAbility}. Returns HP damage dealt.
  function dealDamage(battle, attacker, victim, raw, events, opts) {
    if (!victim || !victim.alive) return 0;
    opts = opts || {};
    var amount = raw;
    if (opts.armorApplies !== false) amount = Math.max(1, amount - getArmor(victim, battle.timeMs));
    amount = Math.round(amount);
    if (victim.shield > 0 && amount > 0) {
      var absorbed = Math.min(victim.shield, amount);
      victim.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) {
      victim.hp -= amount;
      victim.mana = Math.min(100, (victim.mana || 0) + 10 * (victim.manaGain || 1));
    }
    events.push({ type: 'damage', uid: attacker ? attacker.uid : null, x: victim.x, y: victim.y, targetUid: victim.uid, amount: amount, ability: opts.ability || null });
    // Thorn reflect (no recursion: reflected damage is applied directly).
    if (attacker && attacker.alive && victim.reflect > 0 && victim.reflectUntil > battle.timeMs && amount > 0) {
      var refl = Math.round(amount * victim.reflect);
      attacker.hp -= refl;
      events.push({ type: 'damage', uid: victim.uid, x: attacker.x, y: attacker.y, targetUid: attacker.uid, amount: refl, ability: 'Thorn Reflect' });
      checkDeath(battle, attacker, events);
    }
    checkDeath(battle, victim, events);
    return amount;
  }

  function healUnit(battle, unit, amount, events, ability) {
    if (!unit.alive) return 0;
    var healed = Math.min(amount, unit.maxHp - unit.hp);
    unit.hp += healed;
    if (healed > 0) events.push({ type: 'heal', uid: unit.uid, x: unit.x, y: unit.y, targetUid: unit.uid, amount: Math.round(healed), ability: ability || null });
    return healed;
  }

  function enemiesOf(battle, unit) { return battle.units.filter(function (u) { return u.alive && u.side !== unit.side; }); }
  function alliesOf(battle, unit) { return battle.units.filter(function (u) { return u.alive && u.side === unit.side; }); }
  function nearestEnemy(battle, unit) {
    var best = null, bestD = Infinity;
    enemiesOf(battle, unit).forEach(function (e) {
      var d = cheb(unit.x, unit.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }
  function occupied(battle, x, y, selfUid) {
    return battle.units.some(function (u) { return u.alive && u.uid !== selfUid && u.x === x && u.y === y; });
  }
  function abilityDamage(unit, mult) { return unit.attack * mult * (1 + (unit.arcaneBonus || 0)); }

  function castAbility(battle, unit, events) {
    var t = battle.timeMs;
    var target = nearestEnemy(battle, unit);
    var id = unit.heroId;
    var dmg, i, list;
    unit.mana = 0;
    var ev = { type: 'cast', uid: unit.uid, x: unit.x, y: unit.y, targetUid: target ? target.uid : null, amount: 0, ability: (unit.ability && unit.ability.name) || id };
    events.push(ev);
    switch (id) {
      case 'pip':
        healUnit(battle, unit, Math.round(unit.maxHp * 0.30), events, 'Sprout Mend');
        break;
      case 'rusty':
        enemiesOf(battle, unit).filter(function (e) { return cheb(unit.x, unit.y, e.x, e.y) <= 1; })
          .forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.5), events, { ability: 'Tin Cleave' }); });
        break;
      case 'fizz':
        if (target) dealDamage(battle, unit, target, abilityDamage(unit, 2.0), events, { ability: 'Fireball' });
        break;
      case 'nib': {
        // Dash to weakest enemy, then crit it for 150%.
        var weak = null;
        enemiesOf(battle, unit).forEach(function (e) { if (!weak || e.hp < weak.hp) weak = e; });
        if (weak) {
          var spots = [];
          for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            var nx = weak.x + dx, ny = weak.y + dy;
            if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && !occupied(battle, nx, ny, unit.uid)) spots.push({ x: nx, y: ny });
          }
          if (spots.length) {
            var spot = spots[0];
            unit.x = spot.x; unit.y = spot.y;
            events.push({ type: 'move', uid: unit.uid, x: unit.x, y: unit.y, targetUid: weak.uid, amount: 0 });
          }
          unit.guaranteedCrit = true;
          dealDamage(battle, unit, weak, abilityDamage(unit, 1.5), events, { ability: 'Sneak Dash' });
          unit.guaranteedCrit = false;
        }
        break;
      }
      case 'luma':
        if (target) {
          dealDamage(battle, unit, target, abilityDamage(unit, 1.5), events, { ability: 'Frost Bolt' });
          if (target.alive) { target.slowUntil = t + 3000; target.slowFactor = 0.35; }
        }
        break;
      case 'bram':
        unit.shield += Math.round(unit.maxHp * 0.30);
        events.push({ type: 'heal', uid: unit.uid, x: unit.x, y: unit.y, targetUid: unit.uid, amount: Math.round(unit.maxHp * 0.30), ability: 'Stone Shield' });
        break;
      case 'kira':
        list = enemiesOf(battle, unit).sort(function (a, b) { return cheb(unit.x, unit.y, a.x, a.y) - cheb(unit.x, unit.y, b.x, b.y); }).slice(0, 3);
        list.forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.2), events, { ability: 'Multi-Shot' }); });
        break;
      case 'durn':
        alliesOf(battle, unit).forEach(function (a) { a.auraArmor = 20; a.auraArmorUntil = t + 5000; });
        break;
      case 'mirelle':
        enemiesOf(battle, unit).forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.5), events, { ability: 'Tide Wave' }); });
        break;
      case 'thorn':
        unit.reflect = 0.5; unit.reflectUntil = t + 5000;
        break;
      case 'pippa': {
        if (target) {
          dealDamage(battle, unit, target, abilityDamage(unit, 1.5), events, { ability: 'Chain Zap' });
          var rest = enemiesOf(battle, unit).filter(function (e) { return e.uid !== target.uid; })
            .sort(function (a, b) { return cheb(target.x, target.y, a.x, a.y) - cheb(target.x, target.y, b.x, b.y); }).slice(0, 2);
          var mults = [1.0, 0.7];
          rest.forEach(function (e, idx) { dealDamage(battle, unit, e, abilityDamage(unit, mults[idx]), events, { ability: 'Chain Zap' }); });
        }
        break;
      }
      case 'gronk':
        unit.regenUntil = t + 5000; unit.regenActive = 0.05;
        break;
      case 'sable': {
        var low = null;
        enemiesOf(battle, unit).forEach(function (e) { if (!low || e.hp < low.hp) low = e; });
        if (low) {
          if (low.hp <= low.maxHp * 0.30) dealDamage(battle, unit, low, 99999, events, { ability: 'Night Execute', armorApplies: false });
          else dealDamage(battle, unit, low, abilityDamage(unit, 2.5), events, { ability: 'Night Execute' });
        }
        break;
      }
      case 'aurora':
        enemiesOf(battle, unit).forEach(function (e) {
          dealDamage(battle, unit, e, abilityDamage(unit, 1.8), events, { ability: 'Blizzard' });
          if (e.alive) { e.slowUntil = t + 3000; e.slowFactor = 0.30; }
        });
        break;
      case 'cinder':
        enemiesOf(battle, unit).forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.5), events, { ability: 'Ash Nova' }); });
        break;
      case 'wren':
        list = enemiesOf(battle, unit).sort(function (a, b) { return cheb(unit.x, unit.y, a.x, a.y) - cheb(unit.x, unit.y, b.x, b.y); }).slice(0, 4);
        list.forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.3), events, { ability: 'Storm Arrows' }); });
        break;
      case 'magnus':
        enemiesOf(battle, unit).filter(function (e) { return cheb(unit.x, unit.y, e.x, e.y) <= 2; })
          .forEach(function (e) { dealDamage(battle, unit, e, abilityDamage(unit, 1.5), events, { ability: 'Ground Slam' }); if (e.alive) e.stun = Math.max(e.stun, 1500); });
        break;
      case 'sylvara': {
        list = enemiesOf(battle, unit).sort(function (a, b) { return cheb(unit.x, unit.y, a.x, a.y) - cheb(unit.x, unit.y, b.x, b.y); }).slice(0, 3);
        list.forEach(function (e) {
          e.root = Math.max(e.root, 2000);
          e.poisonUntil = t + 3000; e.poisonDps = Math.round(e.maxHp * 0.03);
          dealDamage(battle, unit, e, abilityDamage(unit, 1.0), events, { ability: 'Root & Poison' });
        });
        break;
      }
      case 'zephyr':
        enemiesOf(battle, unit).filter(function (e) { return cheb(unit.x, unit.y, e.x, e.y) <= 2; })
          .forEach(function (e) {
            dealDamage(battle, unit, e, abilityDamage(unit, 1.2), events, { ability: 'Tornado' });
            if (!e.alive) return;
            var kx = e.x + 2 * Math.sign(e.x - unit.x || 1);
            var ky = e.y + 2 * Math.sign(e.y - unit.y || 1);
            kx = clamp(kx, 0, 7); ky = clamp(ky, 0, 7);
            if (!occupied(battle, kx, ky, e.uid)) { e.x = kx; e.y = ky; events.push({ type: 'move', uid: e.uid, x: e.x, y: e.y, targetUid: unit.uid, amount: 0 }); }
          });
        break;
      case 'oblivion':
        enemiesOf(battle, unit).forEach(function (e) {
          dealDamage(battle, unit, e, abilityDamage(unit, 2.5), events, { ability: 'Void Cataclysm' });
          if (e.alive) e.fearUntil = t + 2000;
        });
        break;
      default:
        if (target) dealDamage(battle, unit, target, abilityDamage(unit, 1.5), events, { ability: (unit.ability && unit.ability.name) || 'Ability' });
        break;
    }
  }

  function createBattle(playerUnits, enemyUnits, synergiesPlayer, synergiesEnemy, seed) {
    var rng;
    if (typeof seed === 'function') rng = seed;
    else rng = mulberry32(seed === undefined || seed === null ? 1 : seed);
    function prep(list, side, syn) {
      var flat = flattenUnits(list);
      var s = syn || getSynergies(flat);
      return flat.map(function (u, i) {
        var c;
        if (u && u.heroId && (u.hp !== undefined) && u.uid) {
          c = clone(u);
          if (!c.side) c.side = side;
        } else {
          var heroId = (u && (u.heroId || u.id)) || (typeof u === 'string' ? u : null);
          c = makeUnit(heroId, (u && u.star) || 1, side, (u && u.x !== undefined) ? u.x : (side === 'player' ? i % 8 : i % 8), (u && u.y !== undefined) ? u.y : (side === 'player' ? 7 - Math.floor(i / 8) : Math.floor(i / 8)));
        }
        if (c.mana === undefined) c.mana = 0;
        if (c.manaMax === undefined) c.manaMax = 100;
        if (c.atkCd === undefined) c.atkCd = 0;
        if (c.moveCd === undefined) c.moveCd = 0;
        applySynergyStats(c, s);
        return c;
      });
    }
    var units = prep(playerUnits, 'player', synergiesPlayer).concat(prep(enemyUnits, 'enemy', synergiesEnemy));
    return { units: units, tick: 0, timeMs: 0, done: false, winner: null, events: [], suddenDeath: false, rng: rng };
  }

  function battleEndCheck(battle) {
    var pAlive = battle.units.some(function (u) { return u.alive && u.side === 'player'; });
    var eAlive = battle.units.some(function (u) { return u.alive && u.side === 'enemy'; });
    if (!pAlive && !eAlive) { battle.done = true; battle.winner = 'draw'; }
    else if (!eAlive) { battle.done = true; battle.winner = 'player'; }
    else if (!pAlive) { battle.done = true; battle.winner = 'enemy'; }
    return battle.done;
  }

  // Advance 100ms. Returns events generated this step.
  function step(battle) {
    if (battle.done) return [];
    var events = [];
    battle.tick += 1;
    battle.timeMs += 100;
    var t = battle.timeMs;
    if (!battle.suddenDeath && battle.tick >= 300) {
      battle.suddenDeath = true;
      events.push({ type: 'sudden', uid: null, x: null, y: null, targetUid: null, amount: 0 });
    }
    // Per-second tick effects, applied per 100ms step.
    battle.units.forEach(function (u) {
      if (!u.alive) return;
      if (u.burnUntil > t && u.burnDpsActive > 0) {
        u.hp -= u.burnDpsActive * 0.1;
        events.push({ type: 'damage', uid: null, x: u.x, y: u.y, targetUid: u.uid, amount: Math.round(u.burnDpsActive * 0.1), ability: 'Burn' });
      }
      if (u.poisonUntil > t && u.poisonDps > 0) {
        u.hp -= u.poisonDps * 0.1;
        events.push({ type: 'damage', uid: null, x: u.x, y: u.y, targetUid: u.uid, amount: Math.round(u.poisonDps * 0.1), ability: 'Poison' });
      }
      if (u.regenPct > 0) healUnit(battle, u, u.maxHp * u.regenPct * 0.1, events, 'Verdant Regen');
      if (u.regenUntil > t && u.regenActive > 0) healUnit(battle, u, u.maxHp * u.regenActive * 0.1, events, 'Moss Regen');
      if (battle.suddenDeath) u.hp -= u.maxHp * 0.005; // 5% max HP per second
      if (u.hp <= 0) checkDeath(battle, u, events);
    });
    if (battleEndCheck(battle)) { battle.events = battle.events.concat(events); return events; }

    // Unit turns in uid order.
    var order = battle.units.filter(function (u) { return u.alive; }).slice()
      .sort(function (a, b) {
        var na = parseInt(String(a.uid).replace(/\D/g, ''), 10) || 0;
        var nb = parseInt(String(b.uid).replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
    for (var oi = 0; oi < order.length; oi++) {
      var unit = order[oi];
      if (!unit.alive) continue;
      if (unit.stun > 0) { unit.stun = Math.max(0, unit.stun - 100); continue; }
      if (unit.root > 0) { unit.root = Math.max(0, unit.root - 100); continue; }
      if (unit.fearUntil > t) continue;
      unit.atkCd = Math.max(0, (unit.atkCd || 0) - 100);
      unit.moveCd = Math.max(0, (unit.moveCd || 0) - 100);
      if ((unit.mana || 0) >= (unit.manaMax || 100)) { castAbility(battle, unit, events); if (!unit.alive) continue; }
      var target = nearestEnemy(battle, unit);
      if (!target) break;
      var dist = cheb(unit.x, unit.y, target.x, target.y);
      if (dist <= unit.range) {
        if (unit.atkCd <= 0) {
          var slowed = unit.slowUntil > t;
          var effAS = unit.attackSpeed * (slowed ? (1 - (unit.slowFactor || 0)) : 1);
          unit.atkCd = Math.round(1000 / Math.max(0.1, effAS));
          var isCrit = unit.guaranteedCrit || battle.rng() < (unit.critChance || 0);
          var raw = unit.attack * (isCrit ? 2 : 1);
          dealDamage(battle, unit, target, raw, events, { ability: isCrit ? 'Crit' : null });
          unit.mana = Math.min(100, (unit.mana || 0) + 20 * (unit.manaGain || 1));
          // Ember burn on hit.
          if (unit.burnDps > 0 && target.alive) { target.burnDpsActive = unit.burnDps; target.burnUntil = t + 3000; }
          // Frost: victim slows its attacker.
          if (target.alive && target.slowPct > 0) { unit.slowUntil = t + 2000; unit.slowFactor = target.slowPct; }
          if ((unit.mana || 0) >= 100) castAbility(battle, unit, events);
        }
      } else if (unit.moveCd <= 0) {
        // Greedy step reducing Chebyshev distance; avoid occupied tiles.
        var best = null, bestD = dist;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (var di = 0; di < dirs.length; di++) {
          var nx = unit.x + dirs[di][0], ny = unit.y + dirs[di][1];
          if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
          if (occupied(battle, nx, ny, unit.uid)) continue;
          var d = cheb(nx, ny, target.x, target.y);
          if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
        }
        if (best) {
          unit.x = best.x; unit.y = best.y;
          unit.moveCd = 500;
          events.push({ type: 'move', uid: unit.uid, x: unit.x, y: unit.y, targetUid: target.uid, amount: 0 });
        }
      }
      if (battleEndCheck(battle)) break;
    }
    battleEndCheck(battle);
    battle.events = battle.events.concat(events);
    return events;
  }

  function commanderDamage(round, survivingEnemyUnits) {
    var survivors = 0;
    if (typeof survivingEnemyUnits === 'number') survivors = survivingEnemyUnits;
    else if (Array.isArray(survivingEnemyUnits)) survivors = survivingEnemyUnits.filter(function (u) { return u && u.alive !== false; }).length;
    return 2 + survivors + Math.floor((round || 1) / 5);
  }

  /* ---------------- Creeps / opponents ---------------- */
  function isCreepRound(round) { return round % 5 === 0; }

  function buildCreepWave(round) {
    var count = Math.min(8, 3 + Math.floor(round / 5));
    var scale = 1 + 0.2 * Math.floor(round / 5);
    var wave = [];
    for (var i = 0; i < count; i++) {
      var type = CREEP_TYPES[i % CREEP_TYPES.length];
      var u = makeUnit(type.id, 1, 'enemy', (i * 2 + 1) % 8, 1 + Math.floor(i / 4));
      if (!u) continue;
      u.maxHp = Math.round(u.maxHp * scale);
      u.hp = u.maxHp;
      u.attack = Math.round(u.attack * scale);
      u.baseAttack = u.attack;
      wave.push(u);
    }
    return wave;
  }

  function buildOpponentBoard(round, rng) {
    var r = rng || mulberry32((Date.now() >>> 0) || 1);
    var count = Math.min(3 + Math.floor(round / 2), 9);
    var weights = round < 3 ? [70, 25, 5, 0, 0] : (round < 6 ? [50, 30, 15, 5, 0] : [30, 30, 25, 10, 5]);
    var tiles = [];
    for (var y = 0; y < 4; y++) for (var x = 0; x < 8; x++) tiles.push({ x: x, y: y });
    // Shuffle tiles with seeded rng.
    for (var i = tiles.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp; }
    var units = [];
    for (var k = 0; k < count; k++) {
      var roll = r() * 100, acc = 0, tier = 1;
      for (var t = 0; t < 5; t++) { acc += weights[t]; if (roll < acc) { tier = t + 1; break; } tier = t + 1; }
      var pool = heroesOfTier(tier);
      var hero = pool[Math.floor(r() * pool.length)];
      var tile = tiles[k];
      units.push(makeUnit(hero.id, 1, 'enemy', tile.x, tile.y));
    }
    // From round 4+, upgrade 1-2 units to 2-star.
    if (round >= 4 && units.length) {
      var nUp = 1 + (r() < 0.5 ? 1 : 0);
      nUp = Math.min(nUp, units.length);
      for (var u2 = 0; u2 < nUp; u2++) {
        var idx = Math.floor(r() * units.length);
        var uu = units[idx];
        if (uu.star >= 2) continue;
        uu.star = 2;
        uu.maxHp = Math.round(uu.maxHp * 1.8); uu.hp = uu.maxHp;
        uu.attack = Math.round(uu.attack * 1.8); uu.baseAttack = uu.attack;
      }
    }
    return units;
  }

  /* ---------------- Round flow / elimination ---------------- */
  function computePlacement(state) {
    var aliveOpp = (state.opponents || []).filter(function (o) { return o.alive; }).length;
    if (state.hp > 0 && aliveOpp === 0) return 1;
    if (state.hp <= 0) return aliveOpp + 1;
    return null;
  }

  function recordBest(state, storage) {
    var placement = computePlacement(state);
    if (!placement) return state.best;
    state.best = state.best === 0 ? placement : Math.min(state.best, placement);
    state.gamesPlayed = (state.gamesPlayed || 0) + 1;
    var store = storage;
    if (!store) {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          store = { getItem: function (k) { return localStorage.getItem(k); }, setItem: function (k, v) { localStorage.setItem(k, v); } };
        }
      } catch (e) { store = null; }
    }
    if (store && store.setItem) {
      try { store.setItem('hexclash:best', JSON.stringify({ best: state.best, gamesPlayed: state.gamesPlayed })); } catch (e) { /* ignore */ }
    }
    return state.best;
  }

  function checkElimination(state) {
    (state.opponents || []).forEach(function (o) { if (o.hp <= 0) o.alive = false; });
    var placement = computePlacement(state);
    if (placement !== null && state.placement === null) {
      state.placement = placement;
      if (!state._bestRecorded) { state._bestRecorded = true; recordBest(state); }
    }
    return { eliminated: state.hp <= 0, placement: state.placement, playerAlive: state.hp > 0 };
  }

  // battleResult: 'win'|'loss'|'draw'|'player'|'enemy', or
  // {winner:'player'|'enemy'|'draw', survivors:number, survivingEnemyUnits:number|array}
  function nextRound(state, battleResult) {
    var won = false, draw = false, survivors = 0;
    if (typeof battleResult === 'string') {
      won = battleResult === 'win' || battleResult === 'player';
      draw = battleResult === 'draw';
    } else if (battleResult && typeof battleResult === 'object') {
      won = battleResult.winner === 'player' || battleResult.winner === 'win';
      draw = battleResult.winner === 'draw';
      if (typeof battleResult.survivors === 'number') survivors = battleResult.survivors;
      else if (battleResult.survivingEnemyUnits !== undefined) survivors = commanderDamage(0, battleResult.survivingEnemyUnits) - 2; // survivors count
      if (Array.isArray(battleResult.survivingEnemyUnits)) survivors = battleResult.survivingEnemyUnits.filter(function (u) { return u && u.alive !== false; }).length;
      else if (typeof battleResult.survivingEnemyUnits === 'number') survivors = battleResult.survivingEnemyUnits;
    }
    var wasCreep = isCreepRound(state.round);
    // Streak: positive = win streak, negative = loss streak.
    if (won) state.streak = state.streak > 0 ? state.streak + 1 : 1;
    else if (!draw) state.streak = state.streak < 0 ? state.streak - 1 : -1;
    state.lastWin = won;
    state.lastResult = won ? 'win' : (draw ? 'draw' : 'loss');
    var income = calcIncome(state, won);
    var creepBonus = (wasCreep && won) ? 4 : 0;
    state.gold += income.total + creepBonus;
    if (won) state.wins += 1; else if (!draw) state.losses += 1;
    addRoundXp(state);
    // Commander damage to the loser.
    var dmg = commanderDamage(state.round, survivors);
    if (!won && !draw) {
      state.hp = Math.max(0, state.hp - dmg);
    } else if (won && !wasCreep) {
      var opp = (state.opponents || []).find(function (o) { return o.name === state.currentOpponent; });
      if (opp) opp.hp = Math.max(0, opp.hp - dmg);
    }
    state.log.push('Round ' + state.round + ' ' + state.lastResult + ' (+' + (income.total + creepBonus) + 'g)');
    // Advance opponent rotation: face each alive AI once before reshuffle.
    if (!wasCreep && state.opponentQueue) {
      var qi = state.opponentQueue.indexOf(state.currentOpponent);
      if (qi >= 0) state.opponentQueue.splice(qi, 1);
      var aliveNames = (state.opponents || []).filter(function (o) { return o.alive; }).map(function (o) { return o.name; });
      state.opponentQueue = state.opponentQueue.filter(function (n) { return aliveNames.indexOf(n) >= 0; });
      if (!state.opponentQueue.length) {
        var rng = mulberry32((Date.now() >>> 0) || 1);
        state.opponentQueue = shuffledNames(rng).filter(function (n) { return aliveNames.indexOf(n) >= 0; });
      }
      state.currentOpponent = state.opponentQueue[0] || null;
    }
    state.round += 1;
    state.phase = 'prep';
    state.prepTimeLeft = 25;
    var shopRng = mulberry32((Date.now() >>> 0) || 1);
    rollShop(state, shopRng);
    var elim = checkElimination(state);
    return {
      ok: true, won: won, draw: draw, income: income, creepBonus: creepBonus,
      round: state.round, gold: state.gold, hp: state.hp,
      placement: state.placement, currentOpponent: state.currentOpponent,
      isCreep: isCreepRound(state.round), eliminated: elim.eliminated
    };
  }

  /* ---------------- Exports ---------------- */
  var HexLogic = {
    VERSION: VERSION,
    HEROES: HEROES,
    HERO_MAP: HERO_MAP,
    SHOP_ODDS: SHOP_ODDS,
    XP_TABLE: XP_TABLE,
    xpToNext: xpToNext,
    SYNERGY_DEFS: SYNERGY_DEFS,
    OPPONENTS: OPPONENTS,
    CREEP_TYPES: CREEP_TYPES,
    createGame: createGame,
    calcIncome: calcIncome,
    rollShop: rollShop,
    buyHero: buyHero,
    sellHero: sellHero,
    placeHero: placeHero,
    recallHero: recallHero,
    levelUp: levelUp,
    addRoundXp: addRoundXp,
    combineStars: combineStars,
    toggleLock: toggleLock,
    refreshShop: refreshShop,
    makeUnit: makeUnit,
    createBattle: createBattle,
    step: step,
    commanderDamage: commanderDamage,
    isCreepRound: isCreepRound,
    buildCreepWave: buildCreepWave,
    buildOpponentBoard: buildOpponentBoard,
    nextRound: nextRound,
    checkElimination: checkElimination,
    computePlacement: computePlacement,
    recordBest: recordBest,
    getSynergies: getSynergies,
    applySynergyStats: applySynergyStats,
    mulberry32: mulberry32,
    // internal helpers exposed for testing convenience
    _cheb: cheb,
    _deployedCount: deployedCount
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HexLogic;
  if (typeof window !== 'undefined') window.HexLogic = HexLogic;
  if (typeof global !== 'undefined') global.HexLogic = HexLogic;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* HEXCLASH — main.js: game loop + input. Classic script, no imports.
 * Owns game state (HexLogic.createGame), screen state, selection, timers,
 * floaters and the requestAnimationFrame loop. Hit-testing uses the exact
 * rects from HexRender.layout(). Exposes window.HexMain (small debug/test
 * handle) but the game boots itself on DOMContentLoaded.
 */
(function (global) {
  'use strict';

  var G = global;
  var W = 390, H = 700;
  var STEP_MS_1X = 100, STEP_MS_2X = 50;
  var BATTLE_DONE_AUTO_MS = 2500;

  var canvas = null, ctx = null;
  var state = null;
  var screen = 'title'; // title | howto | prep | battle | over
  var inGame = false;
  var selected = null; // {kind:'bench',idx} | {kind:'board',x,y} | {kind:'battle',uid}
  var battle = null;
  var battleAcc = 0;
  var battleResult = null;
  var battleDoneAt = 0;
  var floaters = [];
  var message = null; // {text, untilAnim}
  var animTime = 0;
  var lastTs = 0;
  var hover = { x: -1, y: -1, cell: null, bench: -1, shop: -1 };
  var hudTextCache = '';
  var rafId = 0;

  function Logic() { return G.HexLogic || null; }
  function Render() { return G.HexRender || null; }
  function Audio() { return G.HexAudio || null; }

  function sfx(name) {
    try {
      var A = Audio();
      if (A && typeof A[name] === 'function') A[name]();
    } catch (e) { /* audio is best-effort */ }
  }
  function showMessage(txt, ms) {
    message = { text: String(txt), untilAnim: animTime + (ms || 1800) };
  }
  function upperReason(reason) {
    var map = {
      'not enough gold': 'NOT ENOUGH GOLD',
      'bench full': 'BENCH FULL',
      'shop slot empty': 'ALREADY BOUGHT',
      'invalid shop slot': 'INVALID SLOT',
      'unknown hero': 'UNKNOWN HERO',
      'no hero on bench': 'NO HERO THERE',
      'no hero on board': 'NO HERO THERE',
      'out of bounds': 'OUT OF BOUNDS',
      'must place on player half (rows 4-7)': 'PLACE ON YOUR HALF (BOTTOM 4 ROWS)',
      'tile occupied': 'TILE OCCUPIED',
      'deployment limit reached': 'DEPLOYMENT LIMIT REACHED',
      'shop locked': 'SHOP LOCKED',
      'max level': 'MAX LEVEL',
      'invalid location': 'INVALID LOCATION'
    };
    return map[reason] || String(reason || 'FAILED').toUpperCase();
  }

  /* ---------- persistence of best placement (logic owns the key) ---------- */
  function loadBest() {
    var best = { best: 0, gamesPlayed: 0 };
    try {
      if (typeof G.localStorage !== 'undefined' && G.localStorage) {
        var raw = G.localStorage.getItem('hexclash:best');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed) {
            best.best = parsed.best || 0;
            best.gamesPlayed = parsed.gamesPlayed || 0;
          }
        }
      }
    } catch (e) { /* storage unavailable: fresh record */ }
    return best;
  }
  function applyBest(s) {
    var b = loadBest();
    s.best = b.best;
    s.gamesPlayed = b.gamesPlayed;
  }

  function newGame() {
    var L = Logic();
    state = L.createGame();
    applyBest(state);
    screen = 'prep';
    inGame = true;
    selected = null;
    battle = null;
    battleResult = null;
    battleAcc = 0;
    floaters = [];
    message = null;
    hover.cell = null; hover.bench = -1; hover.shop = -1;
  }

  /* ---------- layout / hit-test helpers ---------- */
  function currentLayout() {
    var R = Render();
    return R ? R.layout(state, uiSnapshot()) : null;
  }
  function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function cellAt(x, y, L) {
    if (!L) return null;
    for (var yy = 0; yy < 8; yy++) {
      for (var xx = 0; xx < 8; xx++) {
        var c = L.cells[yy][xx];
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return { x: xx, y: yy };
      }
    }
    return null;
  }
  function flatBoardUnits() {
    var out = [];
    (state.board || []).forEach(function (row) { (row || []).forEach(function (u) { if (u) out.push(u); }); });
    return out;
  }

  function uiSnapshot() {
    return {
      screen: screen,
      selected: selected,
      hover: hover,
      floaters: floaters,
      battleUnits: battle ? battle.units : null,
      animTime: animTime,
      message: message && animTime < message.untilAnim ? message.text : null,
      battleResult: battleResult,
      suddenDeath: battle ? !!battle.suddenDeath : false,
      battleDone: battle ? !!battle.done : false,
      paused: !!state.paused
    };
  }

  /* ---------- battle flow ---------- */
  function startBattle() {
    var L = Logic();
    if (!L || screen !== 'prep') return;
    sfx('ready');
    var isCreep = L.isCreepRound(state.round);
    var enemyUnits = isCreep ? L.buildCreepWave(state.round) : L.buildOpponentBoard(state.round);
    var playerUnits = flatBoardUnits();
    var synP = L.getSynergies(playerUnits);
    var synE = L.getSynergies(enemyUnits);
    battle = L.createBattle(playerUnits, enemyUnits, synP, synE);
    battleAcc = 0;
    battleResult = null;
    battleDoneAt = 0;
    selected = null;
    floaters = [];
    screen = 'battle';
    sfx(isCreep ? 'creep' : 'battleStart');
    showMessage(isCreep ? 'CREEP WAVE!' : 'BATTLE vs ' + (state.currentOpponent || 'Rival') + '!', 1500);
  }

  function tileCenter(x, y) {
    var R = Render();
    var L = R ? R.layout(state, uiSnapshot()) : null;
    if (L && L.cells[y] && L.cells[y][x]) return { x: L.cells[y][x].cx, y: L.cells[y][x].cy };
    return { x: 195, y: 280 };
  }
  function findBattleUnit(uid) {
    if (!battle) return null;
    for (var i = 0; i < battle.units.length; i++) {
      if (battle.units[i].uid === uid) return battle.units[i];
    }
    return null;
  }

  function handleBattleEvents(events) {
    if (!events || !events.length) return;
    var hitPlayed = false, castPlayed = false, deathPlayed = false;
    events.forEach(function (ev) {
      if (!ev) return;
      if (ev.type === 'damage' && ev.amount > 0) {
        var target = findBattleUnit(ev.targetUid);
        var p = (ev.x !== null && ev.x !== undefined) ? tileCenter(ev.x, ev.y) : { x: 195, y: 280 };
        var toEnemy = target ? target.side === 'enemy' : true;
        floaters.push({
          kind: 'dmg', x: p.x + (Math.random() * 10 - 5), y: p.y - 6,
          text: (ev.ability === 'Crit' ? 'CRIT ' : '') + '-' + ev.amount,
          color: toEnemy ? '#ffd54a' : '#ff6b5e', life: 0, max: 900
        });
        if (target) target._flashUntil = animTime + 180;
        if (!hitPlayed) { sfx('hit'); hitPlayed = true; }
      } else if (ev.type === 'heal' && ev.amount > 0) {
        var hp2 = (ev.x !== null && ev.x !== undefined) ? tileCenter(ev.x, ev.y) : { x: 195, y: 280 };
        floaters.push({ kind: 'heal', x: hp2.x, y: hp2.y - 6, text: '+' + ev.amount, color: '#2ecc71', life: 0, max: 900 });
      } else if (ev.type === 'cast') {
        var cp = (ev.x !== null && ev.x !== undefined) ? tileCenter(ev.x, ev.y) : { x: 195, y: 280 };
        if (ev.ability) {
          floaters.push({ kind: 'cast', x: cp.x, y: cp.y - 26, text: ev.ability, color: '#c58cff', life: 0, max: 1100 });
        }
        if (!castPlayed) { sfx('cast'); castPlayed = true; }
      } else if (ev.type === 'death') {
        var dp = (ev.x !== null && ev.x !== undefined) ? tileCenter(ev.x, ev.y) : { x: 195, y: 280 };
        floaters.push({ kind: 'poof', x: dp.x, y: dp.y, text: '', color: '#b8b8cc', life: 0, max: 500 });
        if (!deathPlayed) { sfx('death'); deathPlayed = true; }
      } else if (ev.type === 'sudden') {
        showMessage('SUDDEN DEATH! Units lose HP every second!', 2000);
      }
    });
  }

  function onBattleDone() {
    var L = Logic();
    var pAlive = 0, eAlive = 0;
    battle.units.forEach(function (u) {
      if (u.alive) { if (u.side === 'player') pAlive++; else eAlive++; }
    });
    var won = battle.winner === 'player';
    var draw = battle.winner === 'draw';
    // Damage is based on surviving units of the winning side.
    var survivors = won ? pAlive : eAlive;
    var dmg = L.commanderDamage(state.round, survivors);
    battleResult = { winner: battle.winner, dmg: dmg, pAlive: pAlive, eAlive: eAlive };
    battleDoneAt = (typeof G.performance !== 'undefined' && G.performance.now) ? G.performance.now() : Date.now();
    if (won) sfx('win');
    else if (!draw) sfx('lose');
    else sfx('click');
  }

  function advanceRound() {
    var L = Logic();
    if (!battle || !battle.done || !battleResult) return;
    var res = L.nextRound(state, {
      winner: battle.winner,
      survivingEnemyUnits: battle.winner === 'player' ? battleResult.pAlive : battleResult.eAlive
    });
    battle = null;
    battleResult = null;
    battleAcc = 0;
    floaters = [];
    selected = null;
    if (state.placement !== null && state.placement !== undefined) {
      // Game over. Logic already recorded the best placement via
      // checkElimination inside nextRound; only record if it did not.
      if (!state._bestRecorded && L.recordBest) {
        try { L.recordBest(state); } catch (e) { /* guarded inside logic */ }
      }
      screen = 'over';
      inGame = false;
      message = null;
    } else {
      screen = 'prep';
      var gain = (res.income ? res.income.total : 0) + (res.creepBonus || 0);
      showMessage('Round ' + res.round + '  •  +' + gain + 'g income', 2000);
    }
  }

  /* ---------- prep actions ---------- */
  function doBuy(idx) {
    var L = Logic();
    var res = L.buyHero(state, idx);
    if (res.ok) {
      sfx('buy');
      if (res.combines && res.combines.length) {
        var c = res.combines[res.combines.length - 1];
        var hero = L.HERO_MAP[c.heroId];
        showMessage('★ UPGRADE! ' + (hero ? hero.name : c.heroId) + ' is now ' + c.star + '-star!', 2200);
        sfx('levelup');
      }
    } else {
      showMessage(upperReason(res.reason));
      sfx('error');
    }
  }
  function doSell() {
    if (!selected) return;
    var L = Logic();
    var res = null;
    if (selected.kind === 'bench') res = L.sellHero(state, { bench: selected.idx });
    else if (selected.kind === 'board') res = L.sellHero(state, { board: { x: selected.x, y: selected.y } });
    else return; // battle inspection has no sell
    if (res && res.ok) {
      sfx('sell');
      showMessage('Sold for +' + res.refund + 'g');
      selected = null;
    } else {
      showMessage(res ? upperReason(res.reason) : 'CANNOT SELL');
      sfx('error');
    }
  }
  function doPlace(benchIdx, x, y) {
    var L = Logic();
    var res = L.placeHero(state, benchIdx, x, y);
    if (res.ok) {
      sfx('place');
      selected = null;
      if (res.combines && res.combines.length) {
        var c = res.combines[res.combines.length - 1];
        var hero = L.HERO_MAP[c.heroId];
        showMessage('★ UPGRADE! ' + (hero ? hero.name : c.heroId) + ' is now ' + c.star + '-star!', 2200);
        sfx('levelup');
      }
    } else {
      showMessage(upperReason(res.reason));
      sfx('error');
    }
  }
  function doRecall(x, y) {
    var L = Logic();
    var res = L.recallHero(state, x, y);
    if (res.ok) {
      sfx('place');
      selected = null;
    } else {
      showMessage(upperReason(res.reason));
      sfx('error');
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    sfx('click');
    showMessage(state.paused ? 'PAUSED' : 'RESUMED', 900);
  }
  function toggleMute() {
    state.muted = !state.muted;
    var A = Audio();
    if (A && A.setMuted) A.setMuted(state.muted);
    if (!state.muted) sfx('click');
    showMessage(state.muted ? 'SOUND OFF' : 'SOUND ON', 900);
  }
  function toggleSpeed() {
    state.speed = state.speed === 2 ? 1 : 2;
    sfx('click');
    showMessage(state.speed === 2 ? 'BATTLE SPEED 2x' : 'BATTLE SPEED 1x', 900);
  }

  /* ---------- input ---------- */
  function toLogical(e) {
    var rect = canvas.getBoundingClientRect();
    var rw = rect.width || W, rh = rect.height || H;
    return {
      x: (e.clientX - rect.left) * (W / rw),
      y: (e.clientY - rect.top) * (H / rh)
    };
  }

  function handleIcons(x, y, L) {
    if (inRect(x, y, L.btnSpeed)) { toggleSpeed(); return true; }
    if (inRect(x, y, L.btnMute)) { toggleMute(); return true; }
    if (inRect(x, y, L.btnPause)) { togglePause(); return true; }
    return false;
  }

  function onTap(e) {
    if (!state || !canvas) return;
    if (e && e.preventDefault) e.preventDefault();
    try { var A = Audio(); if (A && A.init) A.init(); } catch (err) { /* ignore */ }
    var p = toLogical(e);
    var x = p.x, y = p.y;
    var L = currentLayout();
    if (!L) return;

    if (screen === 'title') {
      if (inRect(x, y, L.titlePlay)) {
        sfx('click');
        if (!inGame) { screen = 'prep'; inGame = true; }
        else newGame();
        return;
      }
      if (inRect(x, y, L.titleHowto)) { sfx('click'); screen = 'howto'; return; }
      return;
    }
    if (screen === 'howto') {
      if (inRect(x, y, L.howtoClose) || !inRect(x, y, L.howtoPanel)) {
        sfx('click'); screen = 'title'; return;
      }
      return;
    }
    if (screen === 'over') {
      if (inRect(x, y, L.overAgain)) { sfx('click'); newGame(); return; }
      return;
    }

    // Prep + battle share the icon buttons.
    if (handleIcons(x, y, L)) return;
    if (state.paused) return; // frozen: only the pause icon (handled above) works.

    if (screen === 'battle') {
      if (battle && battle.done && inRect(x, y, L.battleContinue)) {
        sfx('click'); advanceRound(); return;
      }
      // Selected battle-unit panel.
      if (selected && selected.kind === 'battle' && L.panel) {
        if (inRect(x, y, L.panelClose)) { sfx('click'); selected = null; return; }
        if (inRect(x, y, L.panel)) return; // taps inside the panel do nothing else
      }
      var cell = cellAt(x, y, L);
      if (cell && battle) {
        var found = null;
        battle.units.forEach(function (u) {
          if (u.alive && u.x === cell.x && u.y === cell.y) found = u;
        });
        if (found) {
          sfx('click');
          selected = { kind: 'battle', uid: found.uid };
        } else {
          selected = null;
        }
      } else if (!cell) {
        selected = null;
      }
      return;
    }

    // ---- prep screen ----
    // Selected-hero panel buttons first.
    if (selected && L.panel) {
      if (inRect(x, y, L.panelSell)) { doSell(); return; }
      if (inRect(x, y, L.panelClose)) { sfx('click'); selected = null; return; }
    }

    var c = cellAt(x, y, L);
    if (c) {
      var unit = state.board[c.y] && state.board[c.y][c.x];
      if (selected && selected.kind === 'bench') {
        doPlace(selected.idx, c.x, c.y);
        return;
      }
      if (selected && selected.kind === 'board') {
        if (selected.x === c.x && selected.y === c.y) return; // already selected
        if (unit) { sfx('click'); selected = { kind: 'board', x: c.x, y: c.y }; return; }
        selected = null; // tapped an empty tile: deselect
        return;
      }
      if (unit) { sfx('click'); selected = { kind: 'board', x: c.x, y: c.y }; return; }
      selected = null;
      return;
    }
    // Taps inside the panel (not on a button, not on the board) do nothing.
    if (selected && L.panel && inRect(x, y, L.panel)) return;

    // Bench slots.
    for (var i = 0; i < 9; i++) {
      if (inRect(x, y, L.benchSlots[i])) {
        if (selected && selected.kind === 'board') { doRecall(selected.x, selected.y); return; }
        if (state.bench[i]) {
          if (selected && selected.kind === 'bench' && selected.idx === i) selected = null;
          else { sfx('click'); selected = { kind: 'bench', idx: i }; }
        } else {
          selected = null;
        }
        return;
      }
    }

    // Shop cards.
    for (var s = 0; s < 5; s++) {
      if (inRect(x, y, L.shopCards[s])) { doBuy(s); return; }
    }

    // Action buttons.
    if (inRect(x, y, L.btnRefresh)) {
      var r = Logic().refreshShop(state);
      if (r.ok) sfx('refresh');
      else { showMessage(upperReason(r.reason)); sfx('error'); }
      return;
    }
    if (inRect(x, y, L.btnLevelUp)) {
      var lv = Logic().levelUp(state);
      if (lv.ok) {
        sfx('levelup');
        showMessage(lv.leveledUp ? 'LEVEL UP! You are now Lv ' + lv.level : 'XP +4  (' + lv.xp + ' XP)', 1500);
      } else {
        showMessage(upperReason(lv.reason));
        sfx('error');
      }
      return;
    }
    if (inRect(x, y, L.btnLock)) {
      var lk = Logic().toggleLock(state);
      sfx('click');
      showMessage(lk.locked ? 'SHOP LOCKED — same heroes next round' : 'SHOP UNLOCKED', 1500);
      return;
    }
    if (inRect(x, y, L.btnReady)) { startBattle(); return; }

    // Tapped empty space: deselect.
    selected = null;
  }

  function onMove(e) {
    if (!state || !canvas) return;
    var p = toLogical(e);
    hover.x = p.x; hover.y = p.y;
    var L = currentLayout();
    hover.cell = L ? cellAt(p.x, p.y, L) : null;
    hover.bench = -1; hover.shop = -1;
    if (L) {
      for (var i = 0; i < 9; i++) if (inRect(p.x, p.y, L.benchSlots[i])) hover.bench = i;
      for (var s = 0; s < 5; s++) if (inRect(p.x, p.y, L.shopCards[s])) hover.shop = s;
    }
  }

  /* ---------- HUD (DOM bar above the canvas) ---------- */
  function syncHudDom() {
    try {
      var hud = G.document && G.document.getElementById ? G.document.getElementById('hud') : null;
      if (!hud) return;
      var txt = 'HEXCLASH  •  Round ' + state.round +
        '  •  ● ' + state.gold + 'g  •  HP ' + state.hp +
        '  •  Lv ' + state.level +
        (screen === 'battle' ? '  •  BATTLE' : (screen === 'prep' ? '  •  ' + Math.max(0, Math.ceil(state.prepTimeLeft || 0)) + 's' : ''));
      if (txt !== hudTextCache) { hudTextCache = txt; hud.textContent = txt; }
    } catch (e) { /* DOM hud is cosmetic */ }
  }

  /* ---------- main loop ---------- */
  function update(dt) {
    // Floaters age.
    for (var i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life += dt;
      if (floaters[i].life >= floaters[i].max) floaters.splice(i, 1);
    }
    if (message && animTime >= message.untilAnim) message = null;

    if (screen === 'prep') {
      state.prepTimeLeft -= dt / 1000;
      if (state.prepTimeLeft <= 0) {
        state.prepTimeLeft = 0;
        startBattle();
      }
    } else if (screen === 'battle' && battle && !battle.done) {
      battleAcc += dt;
      var interval = state.speed === 2 ? STEP_MS_2X : STEP_MS_1X;
      var guard = 0;
      while (battleAcc >= interval && guard < 20) {
        battleAcc -= interval;
        guard++;
        var events = Logic().step(battle);
        handleBattleEvents(events);
        if (battle.done) break;
      }
      if (battle.done && !battleResult) onBattleDone();
    } else if (screen === 'battle' && battle && battle.done && battleResult) {
      var now = (typeof G.performance !== 'undefined' && G.performance.now) ? G.performance.now() : Date.now();
      if (now - battleDoneAt >= BATTLE_DONE_AUTO_MS) advanceRound();
    }
  }

  function frame(ts) {
    rafId = (typeof G.requestAnimationFrame === 'function')
      ? G.requestAnimationFrame(frame)
      : 0;
    var now = (typeof ts === 'number') ? ts : ((typeof G.performance !== 'undefined' && G.performance.now) ? G.performance.now() : Date.now());
    var dt = lastTs ? now - lastTs : 16;
    lastTs = now;
    if (dt < 0) dt = 0;
    if (dt > 100) dt = 100;
    if (!state.paused) {
      animTime += dt;
      update(dt);
    }
    var R = Render();
    if (R) R.draw(state, uiSnapshot());
    syncHudDom();
  }

  function resizeCanvas() {
    if (!canvas) return;
    var d = (typeof G.devicePixelRatio === 'number' && G.devicePixelRatio > 0) ? G.devicePixelRatio : 1;
    canvas.width = W * d;
    canvas.height = H * d;
  }

  function boot() {
    var doc = G.document;
    if (!doc || !doc.getElementById) return;
    canvas = doc.getElementById('game');
    if (!canvas) return;
    var R = Render();
    if (R && R.init) R.init(canvas);
    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    resizeCanvas();
    var L = Logic();
    if (!L) return;
    state = L.createGame();
    applyBest(state);
    if (canvas.addEventListener) {
      canvas.addEventListener('pointerdown', onTap);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('click', function (e) { /* pointerdown already handled it */ });
    }
    if (typeof G.requestAnimationFrame === 'function') {
      rafId = G.requestAnimationFrame(frame);
    }
  }

  if (typeof G.document !== 'undefined' && G.document && G.document.addEventListener) {
    if (G.document.readyState === 'loading') {
      G.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  // Small handle for debugging / automated smoke tests.
  G.HexMain = {
    boot: boot,
    getState: function () { return state; },
    getScreen: function () { return screen; },
    getBattle: function () { return battle; },
    getSelected: function () { return selected; },
    getFloaters: function () { return floaters; },
    tap: function (x, y) { onTap({ clientX: x, clientY: y, preventDefault: function () {} }); },
    setScreen: function (s) { screen = s; },
    startBattle: startBattle,
    advanceRound: advanceRound,
    newGame: newGame,
    _inRect: inRect,
    _upperReason: upperReason
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

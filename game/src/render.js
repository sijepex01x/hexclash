/* HEXCLASH — render.js: Canvas 2D renderer, logical 390x700, DPR-aware.
 * Classic script, no imports. Exposes window.HexRender = { init, draw, layout, ordinal }.
 * All drawing lives here; no game logic. layout() is the single source of
 * truth for hit-testing: main.js uses the same rects it draws.
 */
(function (global) {
  'use strict';

  var W = 390, H = 700;
  var canvas = null, ctx = null, dpr = 1;
  var FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  var FACTION_COLORS = {
    Ember: '#e25822', Frost: '#56b6e9', Verdant: '#4caf50',
    Shadow: '#9b59b6', Storm: '#f1c40f'
  };
  var TIER_COLORS = { 1: '#9aa0a6', 2: '#2ecc71', 3: '#3498db', 4: '#9b59b6', 5: '#f1c40f' };
  var OPP_COLORS = ['#e74c3c', '#9b59b6', '#3498db', '#f39c12', '#1abc9c', '#e67e22', '#7f8c8d'];

  function Logic() { return global.HexLogic || null; }
  function heroOf(id) {
    var L = Logic();
    if (L && L.HERO_MAP) return L.HERO_MAP[id] || null;
    return null;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function ordinal(n) {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return n + 'th';
  }

  /* ---------- layout: single source of truth for draw + hit-test ---------- */
  function layout(state, ui) {
    ui = ui || {};
    var L = { W: W, H: H };
    L.hud = { x: 0, y: 0, w: 390, h: 64 };
    L.btnSpeed = { x: 254, y: 10, w: 42, h: 44 };
    L.btnMute = { x: 300, y: 10, w: 42, h: 44 };
    L.btnPause = { x: 346, y: 10, w: 42, h: 44 };
    L.banner = { x: 0, y: 64, w: 390, h: 30 };
    var cell = 46, bx = 11, by = 94;
    L.board = { x: bx, y: by, w: cell * 8, h: cell * 8, cell: cell };
    L.cells = [];
    for (var y = 0; y < 8; y++) {
      var row = [];
      for (var x = 0; x < 8; x++) {
        row.push({ x: bx + x * cell, y: by + y * cell, w: cell, h: cell, cx: bx + x * cell + cell / 2, cy: by + y * cell + cell / 2, bx: x, by: y });
      }
      L.cells.push(row);
    }
    L.benchLabel = { x: 8, y: 466, w: 120, h: 14 };
    L.benchSlots = [];
    for (var i = 0; i < 9; i++) {
      L.benchSlots.push({ x: 7 + i * 42, y: 482, w: 40, h: 40, idx: i });
    }
    L.shopLabel = { x: 8, y: 528, w: 200, h: 14 };
    L.shopCards = [];
    for (var s = 0; s < 5; s++) {
      L.shopCards.push({ x: 5 + s * 77, y: 544, w: 72, h: 72, idx: s });
    }
    L.btnRefresh = { x: 5, y: 624, w: 82, h: 44 };
    L.btnLevelUp = { x: 91, y: 624, w: 100, h: 44 };
    L.btnLock = { x: 195, y: 624, w: 62, h: 44 };
    L.btnReady = { x: 261, y: 624, w: 124, h: 44 };
    // Title / how-to / game-over / battle buttons.
    L.titlePlay = { x: 95, y: 296, w: 200, h: 52 };
    L.titleHowto = { x: 95, y: 360, w: 200, h: 48 };
    L.howtoPanel = { x: 20, y: 110, w: 350, h: 470 };
    L.howtoClose = { x: 95, y: 520, w: 200, h: 48 };
    L.overAgain = { x: 95, y: 400, w: 200, h: 52 };
    L.battleContinue = { x: 95, y: 560, w: 200, h: 48 };
    L.battleStatus = { x: 0, y: 468, w: 390, h: 232 };
    // Selected-hero panel (only when something is selected). Buttons sit
    // at the TOP of the panel, over the enemy half of the board, so they
    // can never cover a player-half placement cell (rows 4-7).
    if (ui.selected) {
      L.panel = { x: 15, y: 100, w: 360, h: 330 };
      L.panelSell = { x: 35, y: 112, w: 150, h: 44 };
      L.panelClose = { x: 205, y: 112, w: 150, h: 44 };
    } else {
      L.panel = null; L.panelSell = null; L.panelClose = null;
    }
    return L;
  }

  /* ---------- tiny drawing helpers ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function box(x, y, w, h, fill, stroke, lw) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function text(str, x, y, font, color, align, baseline) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(str, x, y);
  }
  function f(px, bold) { return (bold ? 'bold ' : '') + px + 'px ' + FONT; }
  function starPath(cx, cy, r, points) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var a = (Math.PI * i) / points - Math.PI / 2;
      var px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  // Class glyphs (tiny shapes, no text): Blade=sword triangle, Bow=arc,
  // Arcane=star, Bulwark=shield square.
  function drawGlyph(cls, cx, cy, s, color) {
    ctx.fillStyle = color || '#ffffff';
    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 2;
    if (cls === 'Blade') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.7, cy + s * 0.4); ctx.lineTo(cx - s * 0.7, cy + s * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.5); ctx.stroke();
    } else if (cls === 'Bow') {
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.9, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.8); ctx.lineTo(cx, cy + s * 0.8); ctx.stroke();
    } else if (cls === 'Arcane') {
      starPath(cx, cy, s, 5); ctx.fill();
    } else { // Bulwark: shield square
      rr(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4, 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(cx - s * 0.25, cy - s * 0.25, s * 0.5, s * 0.5);
    }
  }
  function drawLock(cx, cy, s, color) {
    ctx.strokeStyle = color || '#f1c40f'; ctx.fillStyle = color || '#f1c40f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.25, s * 0.45, Math.PI, 0); ctx.stroke();
    rr(cx - s * 0.6, cy - s * 0.2, s * 1.2, s * 0.9, 2); ctx.fill();
  }
  function wrapLines(str, maxW, font) {
    ctx.font = font;
    var words = String(str || '').split(/\s+/);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var trial = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
      else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function shade(hex, amt) {
    // amt -100..100: darken/lighten a #rrggbb color.
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(((n >> 16) & 255) + amt, 0, 255);
    var g = clamp(((n >> 8) & 255) + amt, 0, 255);
    var b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function factionColor(faction) { return FACTION_COLORS[faction] || '#8a8ab0'; }
  function heroColor(hero) { return hero ? factionColor(hero.faction) : '#8a8ab0'; }

  /* ---------- units (blocky Minecraft x sandbox voxel style) ---------- */
  function drawUnit(unit, cx, cy, opts) {
    opts = opts || {};
    var hero = heroOf(unit.heroId) || { cls: unit.cls || 'Blade', faction: unit.faction || 'Ember', tier: unit.tier || 1 };
    var color = heroColor(hero);
    var size = opts.size || 40;
    var k = size / 40;
    var flashing = opts.flashing;
    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 19 * k, 15 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
    // Body (chunky cube).
    box(cx - 13 * k, cy + 2 * k, 26 * k, 16 * k, shade(color, -45), '#0b0b18', 1);
    // Head (chunky cube).
    box(cx - 14 * k, cy - 18 * k, 28 * k, 20 * k, color, '#0b0b18', 2);
    // Head top highlight (voxel bevel).
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(cx - 14 * k, cy - 18 * k, 28 * k, 5 * k);
    // Eyes.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 8 * k, cy - 12 * k, 5 * k, 5 * k);
    ctx.fillRect(cx + 3 * k, cy - 12 * k, 5 * k, 5 * k);
    ctx.fillStyle = '#101024';
    ctx.fillRect(cx - 6 * k, cy - 10 * k, 2.5 * k, 2.5 * k);
    ctx.fillRect(cx + 5 * k, cy - 10 * k, 2.5 * k, 2.5 * k);
    // Class glyph on body.
    drawGlyph(hero.cls, cx, cy + 10 * k, 5.5 * k, '#ffffff');
    // Side outline: green = player, red = enemy.
    if (opts.side) {
      ctx.strokeStyle = unit.side === 'enemy' ? '#e74c3c' : '#2ecc71';
      ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
      ctx.strokeRect(cx - 15 * k, cy - 19 * k, 30 * k, 38 * k);
      ctx.globalAlpha = 1;
    }
    if (flashing) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(cx - 14 * k, cy - 18 * k, 28 * k, 36 * k);
    }
    // Star pips above head.
    var star = unit.star || 1;
    text('★'.repeat(star), cx, cy - 22 * k, f(11, true), '#f1c40f', 'center', 'alphabetic');
    // HP bar (green) + mana bar (blue) under unit.
    var hpFrac = clamp((unit.hp || 0) / Math.max(1, unit.maxHp || 1), 0, 1);
    var manaFrac = clamp((unit.mana || 0) / Math.max(1, unit.manaMax || 100), 0, 1);
    box(cx - 16 * k, cy + 20 * k, 32 * k, 4, '#1c1c30', '#000000', 1);
    ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : (hpFrac > 0.25 ? '#f39c12' : '#e74c3c');
    ctx.fillRect(cx - 16 * k, cy + 20 * k, 32 * k * hpFrac, 4);
    box(cx - 16 * k, cy + 25 * k, 32 * k, 3, '#1c1c30', null, 0);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(cx - 16 * k, cy + 25 * k, 32 * k * manaFrac, 3);
    if (opts.selected) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3;
      ctx.strokeRect(cx - 21 * k, cy - 26 * k, 42 * k, 56 * k);
    }
  }
  // Mini hero face for bench / shop cards.
  function drawFace(hero, x, y, w, h) {
    var color = heroColor(hero);
    box(x, y, w, h, color, '#0b0b18', 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, w, h * 0.25);
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - w * 0.28, cy - h * 0.18, w * 0.16, h * 0.18);
    ctx.fillRect(cx + w * 0.12, cy - h * 0.18, w * 0.16, h * 0.18);
    ctx.fillStyle = '#101024';
    ctx.fillRect(cx - w * 0.22, cy - h * 0.12, w * 0.06, h * 0.08);
    ctx.fillRect(cx + w * 0.18, cy - h * 0.12, w * 0.06, h * 0.08);
    drawGlyph(hero.cls, cx, y + h * 0.78, Math.min(w, h) * 0.14, '#ffffff');
  }

  function drawButton(r, label, bg, fg, disabled) {
    var fill = disabled ? '#3a3a55' : bg;
    rr(r.x, r.y, r.w, r.h, 8); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = disabled ? '#555577' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    text(label, r.x + r.w / 2, r.y + r.h / 2 + 5, f(13, true), disabled ? '#9a9ab8' : (fg || '#ffffff'), 'center', 'alphabetic');
  }
  function drawIconButton(r, label, active) {
    rr(r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = active ? '#f1c40f' : '#23234a'; ctx.fill();
    ctx.strokeStyle = '#3a3a6e'; ctx.lineWidth = 1; ctx.stroke();
    text(label, r.x + r.w / 2, r.y + r.h / 2 + 5, f(13, true), active ? '#101024' : '#e8e8f2', 'center', 'alphabetic');
  }

  /* ---------- screens ---------- */
  function flatBoardUnits(state) {
    var out = [];
    (state.board || []).forEach(function (row) { (row || []).forEach(function (u) { if (u) out.push(u); }); });
    return out;
  }
  function synergiesOf(state) {
    var L = Logic();
    if (L && L.getSynergies) return L.getSynergies(flatBoardUnits(state));
    return { counts: {}, active: [] };
  }
  function opponentName(state) {
    var L = Logic();
    if (L && L.isCreepRound && L.isCreepRound(state.round)) return 'CREEP WAVE';
    return state.currentOpponent || 'Rival';
  }
  function opponentHp(state) {
    var opp = null;
    (state.opponents || []).forEach(function (o) { if (o.name === state.currentOpponent) opp = o; });
    return opp ? opp.hp : null;
  }

  function drawHUD(state, ui, L) {
    box(0, 0, 390, 64, '#141428', '#26264a', 1);
    // Line 1: round, gold, prep/battle timer.
    text('ROUND ' + state.round, 8, 24, f(15, true), '#ffffff', 'left', 'alphabetic');
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(104, 18, 7, 0, Math.PI * 2); ctx.fill();
    text('g', 104, 22, f(11, true), '#101024', 'center', 'alphabetic');
    text(String(state.gold), 116, 24, f(15, true), '#f1c40f', 'left', 'alphabetic');
    var timerText, timerColor = '#ffffff';
    if (ui.screen === 'battle') {
      var bt = ui.battleUnits && ui.battleUnits.length ? null : null;
      timerText = 'BATTLE';
      timerColor = '#ff9d5c';
    } else if (ui.screen === 'prep') {
      var t = Math.max(0, Math.ceil(state.prepTimeLeft || 0));
      timerText = t + 's';
      if (t < 5) timerColor = '#ff5b5b';
    } else {
      timerText = 'HEXCLASH';
      timerColor = '#f1c40f';
    }
    // Centered at x=205, 18px: "BATTLE" at 20px ran into the 1x button at x=254.
    text(timerText, 205, 26, f(18, true), timerColor, 'center', 'alphabetic');
    // Line 2: level + XP bar, commander HP bar.
    text('Lv ' + state.level, 8, 52, f(12, true), '#ffffff', 'left', 'alphabetic');
    var xpNeed = 0, L2 = Logic();
    if (L2 && L2.xpToNext) xpNeed = L2.xpToNext(state.level);
    var xpFrac = (xpNeed && isFinite(xpNeed) && xpNeed > 0) ? clamp(state.xp / xpNeed, 0, 1) : 1;
    box(44, 42, 76, 10, '#1c1c30', '#3a3a6e', 1);
    ctx.fillStyle = '#9b59b6'; ctx.fillRect(44, 42, 76 * xpFrac, 10);
    // Short "5/8" (no " XP" suffix): the full label ran into the HP label at x=158.
    text(isFinite(xpNeed) && xpNeed > 0 ? (state.xp + '/' + xpNeed) : 'MAX', 124, 52, f(11), '#c9c9e0', 'left', 'alphabetic');
    text('HP', 158, 52, f(11, true), '#ffffff', 'left', 'alphabetic');
    box(180, 42, 66, 10, '#1c1c30', '#3a3a6e', 1);
    ctx.fillStyle = state.hp > 50 ? '#2ecc71' : (state.hp > 25 ? '#f39c12' : '#e74c3c');
    ctx.fillRect(180, 42, 66 * clamp(state.hp / 100, 0, 1), 10);
    // Icon buttons top-right (hit targets >= 44px tall).
    drawIconButton(L.btnSpeed, (state.speed === 2 ? '2x' : '1x'), state.speed === 2);
    drawIconButton(L.btnMute, state.muted ? '♪✕' : '♪', state.muted);
    drawIconButton(L.btnPause, state.paused ? '▶' : '❚❚', state.paused);
  }

  function drawBanner(state, ui, L) {
    box(L.banner.x, L.banner.y, L.banner.w, L.banner.h, '#0d0d1e', '#26264a', 1);
    var streak = state.streak || 0;
    var streakTxt = streak > 0 ? '  •  WIN x' + streak : (streak < 0 ? '  •  LOSS x' + (-streak) : '');
    var oppHp = opponentHp(state);
    var txt;
    if (ui.screen === 'battle') {
      txt = 'BATTLE  vs  ' + opponentName(state) + (ui.suddenDeath ? '  •  SUDDEN DEATH!' : '');
    } else {
      txt = 'VS ' + opponentName(state) + (oppHp !== null ? '  (HP ' + oppHp + ')' : '') + streakTxt + '  •  Commander HP ' + state.hp;
    }
    text(txt, 195, 84, f(13, true), ui.suddenDeath ? '#ff5b5b' : '#e8e8f2', 'center', 'alphabetic');
  }

  function drawBoard(state, ui, L, units) {
    var b = L.board;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var c = L.cells[y][x];
        var tint = y < 4 ? 'rgba(231,76,60,0.10)' : 'rgba(46,204,113,0.10)';
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#181830' : '#141428';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = tint;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = '#26264a'; ctx.lineWidth = 1;
        ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      }
    }
    // Deployment highlights when a bench hero is selected.
    if (ui.selected && ui.selected.kind === 'bench') {
      for (var yy = 4; yy < 8; yy++) {
        for (var xx = 0; xx < 8; xx++) {
          if (!state.board[yy][xx]) {
            var cc = L.cells[yy][xx];
            ctx.fillStyle = 'rgba(46,204,113,0.18)';
            ctx.fillRect(cc.x + 2, cc.y + 2, cc.w - 4, cc.h - 4);
          }
        }
      }
    }
    // Hover outline.
    if (ui.hover && ui.hover.cell) {
      var hc = L.cells[ui.hover.cell.y] && L.cells[ui.hover.cell.y][ui.hover.cell.x];
      if (hc) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(hc.x + 1, hc.y + 1, hc.w - 2, hc.h - 2); }
    }
    // Units.
    (units || []).forEach(function (u) {
      if (!u || u.alive === false) return;
      var cell = L.cells[u.y] && L.cells[u.y][u.x];
      if (!cell) return;
      var cx = cell.cx, cy = cell.cy;
      // Smooth slide toward the unit's current tile (battle movement).
      if (ui.screen === 'battle') {
        if (u._rx === undefined) { u._rx = cx; u._ry = cy; }
        u._rx += (cx - u._rx) * 0.35;
        u._ry += (cy - u._ry) * 0.35;
        cx = u._rx; cy = u._ry;
      }
      var isSel = ui.selected && ui.selected.kind === 'board' && ui.selected.x === u.x && ui.selected.y === u.y;
      var isSelBattle = ui.selected && ui.selected.kind === 'battle' && ui.selected.uid === u.uid;
      drawUnit(u, cx, cy, {
        selected: !!(isSel || isSelBattle),
        flashing: ui.animTime < (u._flashUntil || 0),
        side: true
      });
    });
    // Half divider.
    ctx.strokeStyle = 'rgba(241,196,15,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); ctx.stroke();
    text('ENEMY', b.x + 4, b.y + 14, f(11, true), 'rgba(231,76,60,0.9)', 'left', 'alphabetic');
    text('YOU', b.x + 4, b.y + b.h - 6, f(11, true), 'rgba(46,204,113,0.9)', 'left', 'alphabetic');
  }

  function drawBench(state, ui, L) {
    var syn = synergiesOf(state);
    text('BENCH  (' + state.bench.length + '/9)', L.benchLabel.x, L.benchLabel.y + 11, f(11, true), '#c9c9e0', 'left', 'alphabetic');
    // Synergy badges, right-aligned on the bench label row.
    var badges = (syn.active || []).slice(0, 3);
    var bx = 382;
    for (var i = badges.length - 1; i >= 0; i--) {
      var label = badges[i].name + ' ' + badges[i].count;
      ctx.font = f(11, true);
      var bw = ctx.measureText(label).width + 14;
      bx -= bw;
      rr(bx, 464, bw, 16, 8); ctx.fillStyle = '#f1c40f'; ctx.fill();
      text(label, bx + bw / 2, 476, f(11, true), '#101024', 'center', 'alphabetic');
      bx -= 4;
    }
    if ((syn.active || []).length > 3) {
      text('+' + ((syn.active || []).length - 3), bx - 14, 476, f(11, true), '#f1c40f', 'center', 'alphabetic');
    }
    for (var s = 0; s < 9; s++) {
      var r = L.benchSlots[s];
      var item = state.bench[s];
      var isSel = ui.selected && ui.selected.kind === 'bench' && ui.selected.idx === s;
      var isHov = ui.hover && ui.hover.bench === s;
      if (item) {
        var hero = heroOf(item.heroId);
        if (hero) {
          drawFace(hero, r.x, r.y, r.w, r.h);
          rr(r.x, r.y, r.w, r.h, 4);
          ctx.strokeStyle = TIER_COLORS[hero.tier] || '#9aa0a6'; ctx.lineWidth = isSel ? 3 : 2; ctx.stroke();
          text('★'.repeat(item.star || 1), r.x + r.w / 2, r.y + r.h - 2, f(10, true), '#f1c40f', 'center', 'alphabetic');
        }
      } else {
        rr(r.x, r.y, r.w, r.h, 4);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#3a3a6e'; ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);
      }
      if (isSel) { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
      if (isHov) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
    }
  }

  function drawShop(state, ui, L) {
    text(state.locked ? 'SHOP  🔒 LOCKED' : 'SHOP', L.shopLabel.x, L.shopLabel.y + 11, f(11, true), state.locked ? '#f1c40f' : '#c9c9e0', 'left', 'alphabetic');
    text('Tap a card to buy', 300, L.shopLabel.y + 11, f(11), '#8a8ab0', 'right', 'alphabetic');
    for (var s = 0; s < 5; s++) {
      var r = L.shopCards[s];
      var heroId = state.shop[s];
      var isHov = ui.hover && ui.hover.shop === s;
      if (!heroId) {
        rr(r.x, r.y, r.w, r.h, 6);
        ctx.fillStyle = '#1c1c30'; ctx.fill();
        ctx.strokeStyle = '#3a3a6e'; ctx.lineWidth = 1; ctx.stroke();
        text('SOLD', r.x + r.w / 2, r.y + r.h / 2 + 4, f(12, true), '#8a8ab0', 'center', 'alphabetic');
        continue;
      }
      var hero = heroOf(heroId);
      if (!hero) continue;
      rr(r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = '#1c1c30'; ctx.fill();
      ctx.strokeStyle = TIER_COLORS[hero.tier] || '#9aa0a6'; ctx.lineWidth = 3; ctx.stroke();
      drawFace(hero, r.x + 3, r.y + 3, r.w - 6, 34);
      // Name at 10px on two tight lines, price on its own baseline at the
      // card bottom: at 11-12px the 2nd name line collided with the price.
      var lines = wrapLines(hero.name, r.w - 8, f(10, true)).slice(0, 2);
      for (var li = 0; li < lines.length; li++) {
        text(lines[li], r.x + r.w / 2, r.y + 47 + li * 11, f(10, true), '#ffffff', 'center', 'alphabetic');
      }
      text('● ' + hero.tier + 'g', r.x + r.w / 2, r.y + r.h - 3, f(11, true), '#f1c40f', 'center', 'alphabetic');
      if (state.locked) drawLock(r.x + r.w - 12, r.y + 12, 7, '#f1c40f');
      if (isHov) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
    }
  }

  function drawButtons(state, ui, L) {
    drawButton(L.btnRefresh, 'REFRESH 2g', '#23234a', '#ffffff', state.gold < 2 || state.locked);
    var xpNeed = 0, L2 = Logic();
    if (L2 && L2.xpToNext) xpNeed = L2.xpToNext(state.level);
    var maxed = !isFinite(xpNeed) || state.level >= 9;
    drawButton(L.btnLevelUp, maxed ? 'MAX LEVEL' : 'LEVEL UP 4g', '#23234a', '#ffffff', maxed || state.gold < 4);
    drawButton(L.btnLock, state.locked ? 'UNLOCK' : 'LOCK', state.locked ? '#7a5c00' : '#23234a', '#ffffff', false);
    drawButton(L.btnReady, 'READY ▶', '#c0392b', '#ffffff', false);
  }

  function selectedHeroInfo(state, ui) {
    if (!ui.selected) return null;
    var sel = ui.selected, heroId = null, star = 1, where = null;
    if (sel.kind === 'bench') {
      var item = state.bench[sel.idx];
      if (!item) return null;
      heroId = item.heroId; star = item.star || 1; where = { bench: sel.idx };
    } else if (sel.kind === 'board') {
      var u = state.board[sel.y] && state.board[sel.y][sel.x];
      if (!u) return null;
      heroId = u.heroId; star = u.star || 1; where = { board: { x: sel.x, y: sel.y } };
    } else if (sel.kind === 'battle') {
      var bu = null;
      (ui.battleUnits || []).forEach(function (b) { if (b.uid === sel.uid) bu = b; });
      if (!bu) return null;
      heroId = bu.heroId; star = bu.star || 1; where = null;
    }
    var hero = heroOf(heroId);
    if (!hero) return null;
    return { hero: hero, star: star, where: where, heroId: heroId };
  }

  function drawPanel(state, ui, L) {
    var info = selectedHeroInfo(state, ui);
    if (!info || !L.panel) return;
    var p = L.panel, hero = info.hero, star = info.star;
    ctx.fillStyle = 'rgba(5,5,15,0.72)';
    ctx.fillRect(0, 0, W, H);
    rr(p.x, p.y, p.w, p.h, 12);
    ctx.fillStyle = '#1a1a33'; ctx.fill();
    ctx.strokeStyle = TIER_COLORS[hero.tier] || '#9aa0a6'; ctx.lineWidth = 3; ctx.stroke();
    drawFace(hero, p.x + 16, p.y + 68, 64, 64);
    text(hero.name, p.x + 92, p.y + 86, f(18, true), '#ffffff', 'left', 'alphabetic');
    text('★'.repeat(star) + '   ' + hero.cls + '  •  ' + hero.faction, p.x + 92, p.y + 108, f(12, true), '#f1c40f', 'left', 'alphabetic');
    text('Tier ' + hero.tier + '  •  Cost ' + hero.tier + 'g', p.x + 92, p.y + 126, f(12), '#c9c9e0', 'left', 'alphabetic');
    var mult = Math.pow(1.8, star - 1);
    var hp = Math.round(hero.hp * mult), atk = Math.round(hero.attack * mult);
    var stats = [
      'HP  ' + hp, 'ATK  ' + atk,
      'RNG  ' + hero.range, 'AS  ' + hero.attackSpeed.toFixed(2) + '/s'
    ];
    for (var i = 0; i < 4; i++) {
      var sx = p.x + 16 + (i % 2) * 172, sy = p.y + 150 + Math.floor(i / 2) * 24;
      rr(sx, sy, 164, 20, 5); ctx.fillStyle = '#23234a'; ctx.fill();
      text(stats[i], sx + 8, sy + 14, f(12, true), '#ffffff', 'left', 'alphabetic');
    }
    text(hero.ability ? hero.ability.name : 'Ability', p.x + 16, p.y + 206, f(13, true), '#9b59b6', 'left', 'alphabetic');
    var desc = hero.ability ? hero.ability.desc : '';
    var dlines = wrapLines(desc, p.w - 32, f(12)).slice(0, 3);
    for (var d = 0; d < dlines.length; d++) {
      text(dlines[d], p.x + 16, p.y + 226 + d * 16, f(12), '#e8e8f2', 'left', 'alphabetic');
    }
    // SELL (only for bench/board selections, not battle inspection).
    if (info.where) {
      var refund = hero.tier * (star === 3 ? 9 : (star === 2 ? 3 : 1));
      drawButton(L.panelSell, 'SELL  +' + refund + 'g', '#7a5c00', '#ffffff', false);
    } else {
      rr(L.panelSell.x, L.panelSell.y, L.panelSell.w, L.panelSell.h, 8);
      ctx.fillStyle = '#23234a'; ctx.fill();
      text('IN BATTLE', L.panelSell.x + L.panelSell.w / 2, L.panelSell.y + 28, f(13, true), '#8a8ab0', 'center', 'alphabetic');
    }
    drawButton(L.panelClose, 'CLOSE', '#23234a', '#ffffff', false);
  }

  function drawFloaters(ui, L) {
    (ui.floaters || []).forEach(function (fl) {
      var age = fl.life || 0, max = fl.max || 900;
      if (age >= max) return;
      var a = 1 - age / max;
      var y = fl.y - (age / max) * 34;
      ctx.globalAlpha = a;
      if (fl.kind === 'poof') {
        ctx.fillStyle = '#b8b8cc';
        ctx.beginPath(); ctx.arc(fl.x, y, 6 + (age / max) * 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(fl.x, y, 3 + (age / max) * 8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.font = f(fl.kind === 'cast' ? 12 : 14, true);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3;
        ctx.strokeText(fl.text, fl.x, y);
        ctx.fillStyle = fl.color || '#ffffff';
        ctx.fillText(fl.text, fl.x, y);
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawMessage(ui) {
    if (!ui.message) return;
    ctx.font = f(13, true);
    var w = ctx.measureText(ui.message).width + 28;
    var x = (W - w) / 2, y = 100;
    rr(x, y, w, 30, 15);
    ctx.fillStyle = 'rgba(20,20,40,0.94)'; ctx.fill();
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ui.message, W / 2, y + 20, f(13, true), '#ffd54a', 'center', 'alphabetic');
  }

  function drawTitle(state, ui, L) {
    ctx.fillStyle = '#101024'; ctx.fillRect(0, 0, W, H);
    // Decorative hexagons.
    ctx.strokeStyle = 'rgba(155,89,182,0.25)'; ctx.lineWidth = 2;
    // Decorative hexagons: top row only + a low row at y=640, kept clear of
    // the title (y~190), the commander dots (y~510) and their labels.
    for (var i = 0; i < 6; i++) {
      var hx = 40 + i * 62, hy = 120 + (i % 2) * 520;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = Math.PI / 3 * k + Math.PI / 6;
        var px = hx + Math.cos(a) * 26, py = hy + Math.sin(a) * 26;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    text('HEXCLASH', 195, 190, f(46, true), '#f1c40f', 'center', 'alphabetic');
    text('A U T O   B A T T L E R', 195, 222, f(16, true), '#e8e8f2', 'center', 'alphabetic');
    text('Build a team. Outlast 7 rivals.', 195, 252, f(13), '#c9c9e0', 'center', 'alphabetic');
    drawButton(L.titlePlay, '▶  PLAY', '#c0392b', '#ffffff', false);
    drawButton(L.titleHowto, 'HOW TO PLAY', '#23234a', '#ffffff', false);
    var bestTxt = state.best > 0
      ? 'BEST PLACEMENT: ' + ordinal(state.best) + '   •   ' + (state.gamesPlayed || 0) + ' game' + ((state.gamesPlayed || 0) === 1 ? '' : 's') + ' played'
      : 'No games yet — good luck, commander!';
    text(bestTxt, 195, 448, f(13, true), '#ffd54a', 'center', 'alphabetic');
    // 8 commander dots (you + 7 rivals).
    text('8 COMMANDERS ENTER', 195, 486, f(11, true), '#8a8ab0', 'center', 'alphabetic');
    var colors = ['#f1c40f'].concat(OPP_COLORS.slice(0, 7));
    for (var d = 0; d < 8; d++) {
      var dx = 195 - 7 * 18 + d * 36;
      ctx.fillStyle = colors[d];
      ctx.beginPath(); ctx.arc(dx, 510, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0b0b18'; ctx.lineWidth = 2; ctx.stroke();
    }
    text('You are gold. Survive to 1st place.', 195, 540, f(12), '#c9c9e0', 'center', 'alphabetic');
  }

  function drawHowto(state, ui, L) {
    drawTitle(state, ui, L);
    ctx.fillStyle = 'rgba(5,5,15,0.78)'; ctx.fillRect(0, 0, W, H);
    var p = L.howtoPanel;
    rr(p.x, p.y, p.w, p.h, 12);
    ctx.fillStyle = '#1a1a33'; ctx.fill();
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.stroke();
    text('HOW TO PLAY', 195, p.y + 36, f(20, true), '#f1c40f', 'center', 'alphabetic');
    var lines = [
      ['GOAL', 'Outlast 7 rivals. Lose all HP and you are eliminated.'],
      ['SHOP', 'Buy heroes with gold. Tap a card, then place from the bench.'],
      ['SYNERGIES', 'Matching classes & factions on the board grant bonuses.'],
      ['STARS', 'Three copies of a hero combine into a 2-star, then 3-star.'],
      ['ECONOMY', 'Earn 5g + win bonus + interest each round. Save for streaks.'],
      ['BATTLE', 'Fights run automatically. Tap READY or wait out the timer.']
    ];
    var y = p.y + 70;
    lines.forEach(function (pair) {
      text(pair[0], p.x + 18, y, f(13, true), '#f1c40f', 'left', 'alphabetic');
      var wl = wrapLines(pair[1], p.w - 36, f(12));
      for (var i = 0; i < wl.length; i++) {
        text(wl[i], p.x + 18, y + 17 + i * 15, f(12), '#e8e8f2', 'left', 'alphabetic');
      }
      y += 17 + wl.length * 15 + 12;
    });
    drawButton(L.howtoClose, 'CLOSE', '#c0392b', '#ffffff', false);
  }

  function drawBattleBottom(state, ui, L) {
    var units = ui.battleUnits || [];
    var pAlive = 0, eAlive = 0;
    units.forEach(function (u) { if (u.alive) { if (u.side === 'player') pAlive++; else eAlive++; } });
    var panel = L.battleStatus;
    box(panel.x, panel.y, panel.w, panel.h, '#0d0d1e', '#26264a', 1);
    text('YOUR UNITS: ' + pAlive + ' alive', 20, 496, f(14, true), '#2ecc71', 'left', 'alphabetic');
    text('ENEMY: ' + eAlive + ' alive', 20, 518, f(14, true), '#e74c3c', 'left', 'alphabetic');
    var syn = synergiesOf(state);
    var synTxt = (syn.active || []).map(function (a) { return a.name + ' ' + a.count; }).join('  •  ') || 'No active synergies';
    text(synTxt, 20, 540, f(12), '#c9c9e0', 'left', 'alphabetic');
    if (ui.suddenDeath && !ui.battleDone) {
      text('⚠ SUDDEN DEATH — units lose HP every second!', 195, 566, f(13, true), '#ff5b5b', 'center', 'alphabetic');
    }
    if (ui.battleDone && ui.battleResult) {
      var won = ui.battleResult.winner === 'player';
      var draw = ui.battleResult.winner === 'draw';
      var big = draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
      var sub = draw ? 'No damage dealt' : (won ? '-' + ui.battleResult.dmg + ' HP to ' + opponentName(state) : '-' + ui.battleResult.dmg + ' HP to you');
      text(big + '  ' + sub, 195, 566, f(18, true), won ? '#2ecc71' : (draw ? '#f1c40f' : '#ff5b5b'), 'center', 'alphabetic');
      drawButton(L.battleContinue, 'CONTINUE ▶', '#c0392b', '#ffffff', false);
      text('or wait — continuing automatically', 195, 626, f(11), '#8a8ab0', 'center', 'alphabetic');
    } else {
      text('Battle runs automatically. Tap a unit to inspect it.', 195, 566, f(12), '#8a8ab0', 'center', 'alphabetic');
      text('2x speed, mute and pause are in the top-right.', 195, 588, f(12), '#8a8ab0', 'center', 'alphabetic');
    }
  }

  function drawOver(state, ui, L) {
    ctx.fillStyle = '#101024'; ctx.fillRect(0, 0, W, H);
    var place = state.placement || 8;
    var won = place === 1;
    text(ordinal(place) + (won ? ' — VICTORY!' : ' — ELIMINATED'), 195, 220, f(34, true), won ? '#f1c40f' : '#ff5b5b', 'center', 'alphabetic');
    text(won ? 'You outlasted all 7 rivals!' : 'Your commander fell in round ' + state.round + '.', 195, 256, f(14), '#e8e8f2', 'center', 'alphabetic');
    text('Wins: ' + state.wins + '   •   Losses: ' + state.losses, 195, 292, f(13, true), '#c9c9e0', 'center', 'alphabetic');
    text('BEST PLACEMENT: ' + (state.best > 0 ? ordinal(state.best) : '—'), 195, 320, f(13, true), '#ffd54a', 'center', 'alphabetic');
    text('Games played: ' + (state.gamesPlayed || 0), 195, 344, f(13), '#c9c9e0', 'center', 'alphabetic');
    drawButton(L.overAgain, '▶  PLAY AGAIN', '#c0392b', '#ffffff', false);
  }

  function draw(state, ui) {
    if (!ctx || !state) return;
    ui = ui || {};
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var L = layout(state, ui);
    var screen = ui.screen || 'title';
    if (screen === 'title') { drawTitle(state, ui, L); return; }
    if (screen === 'howto') { drawHowto(state, ui, L); return; }
    if (screen === 'over') { drawOver(state, ui, L); return; }
    // Shared chrome for prep + battle.
    ctx.fillStyle = '#101024'; ctx.fillRect(0, 0, W, H);
    drawHUD(state, ui, L);
    drawBanner(state, ui, L);
    if (screen === 'battle') {
      drawBoard(state, ui, L, ui.battleUnits || []);
      drawFloaters(ui, L);
      drawBattleBottom(state, ui, L);
    } else {
      drawBoard(state, ui, L, flatBoardUnits(state));
      drawFloaters(ui, L);
      drawBench(state, ui, L);
      drawShop(state, ui, L);
      drawButtons(state, ui, L);
    }
    drawMessage(ui);
    if (ui.selected) drawPanel(state, ui, L);
    if (ui.paused) {
      ctx.fillStyle = 'rgba(5,5,15,0.72)'; ctx.fillRect(0, 0, W, H);
      text('PAUSED', 195, 330, f(30, true), '#ffffff', 'center', 'alphabetic');
      text('Tap the pause button (top-right) to resume.', 195, 362, f(13), '#c9c9e0', 'center', 'alphabetic');
    }
  }

  function init(c) {
    canvas = c || null;
    if (canvas) {
      ctx = canvas.getContext ? canvas.getContext('2d') : null;
      dpr = (global.devicePixelRatio && global.devicePixelRatio > 0) ? global.devicePixelRatio : 1;
    }
    return !!ctx;
  }

  var HexRender = {
    init: init, draw: draw, layout: layout, ordinal: ordinal,
    FACTION_COLORS: FACTION_COLORS, TIER_COLORS: TIER_COLORS,
    WIDTH: W, HEIGHT: H
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = HexRender;
  global.HexRender = HexRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);

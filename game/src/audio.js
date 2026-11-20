// HEXCLASH audio — WebAudio synth, zero assets.
// Global: window.HexAudio. No AudioContext is created until the first user
// gesture. If WebAudio is unavailable, every function is a silent no-op.
(function (global) {
  "use strict";

  var ctx = null;
  var master = null;
  var muted = false;
  var inited = false;

  function audioAvailable() {
    return !!(global.AudioContext || global.webkitAudioContext);
  }

  function ensureContext() {
    if (ctx) return ctx;
    if (!audioAvailable()) return null;
    var AC = global.AudioContext || global.webkitAudioContext;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return null;
    }
    try {
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.15;
      master.connect(ctx.destination);
    } catch (e) {
      master = null;
    }
    return ctx;
  }

  function init() {
    if (inited) return;
    inited = true;
    var c = ensureContext();
    if (c && c.state === "suspended") {
      c.resume().catch(function () {});
    }
  }

  // Create the AudioContext on the first user gesture, then remove listeners.
  function onGesture() {
    init();
    try {
      global.removeEventListener("pointerdown", onGesture);
      global.removeEventListener("keydown", onGesture);
    } catch (e) {}
  }
  try {
    global.addEventListener("pointerdown", onGesture, { passive: true });
    global.addEventListener("keydown", onGesture);
  } catch (e) {}

  function setMuted(b) {
    muted = !!b;
    if (master && ctx) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : 0.15, ctx.currentTime, 0.01);
      } catch (e) {}
    }
  }

  function isMuted() {
    return muted;
  }

  // --- tiny synth helpers -------------------------------------------------

  // One oscillator blip with an exponential decay envelope.
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || !master || muted) return;
    if (ctx.state === "suspended") return;
    try {
      var t0 = ctx.currentTime + (when || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      }
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol || 0.5, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  // Short filtered noise burst (hits, deaths, thuds).
  function noise(dur, vol, filterFreq, when) {
    if (!ctx || !master || muted) return;
    if (ctx.state === "suspended") return;
    try {
      var t0 = ctx.currentTime + (when || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq || 1200;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  // Sequence of notes: [[freq, startOffset, dur, type, vol], ...]
  function arpeggio(notes) {
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      tone(n[0], n[2], n[3] || "sine", n[4] || 0.5, n[1]);
    }
  }

  // --- public sound effects -----------------------------------------------

  function click() { tone(800, 0.06, "square", 0.25); }

  function buy() {
    arpeggio([
      [523.25, 0, 0.09, "triangle", 0.5],
      [659.25, 0.07, 0.09, "triangle", 0.5],
      [783.99, 0.14, 0.12, "triangle", 0.5]
    ]);
  }

  function coin() {
    tone(880, 0.08, "sine", 0.5);
    tone(1318.51, 0.16, "sine", 0.5, 0.07);
  }

  function sell() {
    arpeggio([
      [783.99, 0, 0.08, "triangle", 0.45],
      [659.25, 0.06, 0.08, "triangle", 0.45],
      [523.25, 0.12, 0.11, "triangle", 0.45]
    ]);
  }

  function place() { tone(440, 0.09, "triangle", 0.5, 0, 330); }

  function levelup() {
    arpeggio([
      [392, 0, 0.09, "square", 0.3],
      [523.25, 0.08, 0.09, "square", 0.3],
      [659.25, 0.16, 0.09, "square", 0.3],
      [783.99, 0.24, 0.16, "square", 0.3]
    ]);
  }

  function refresh() {
    tone(1200, 0.05, "square", 0.2);
    tone(900, 0.07, "square", 0.2, 0.05);
  }

  function ready() {
    tone(660, 0.08, "triangle", 0.5);
    tone(990, 0.12, "triangle", 0.5, 0.08);
  }

  function battleStart() {
    tone(220, 0.25, "sawtooth", 0.35, 0, 440);
    noise(0.12, 0.3, 800, 0);
  }

  function hit() {
    noise(0.08, 0.5, 900);
    tone(120, 0.09, "sine", 0.6, 0, 60);
  }

  function cast() {
    tone(300, 0.28, "sawtooth", 0.3, 0, 1200);
    tone(600, 0.2, "sine", 0.25, 0.05, 1800);
  }

  function death() {
    noise(0.18, 0.4, 500);
    tone(180, 0.2, "triangle", 0.4, 0, 50);
  }

  function win() {
    arpeggio([
      [523.25, 0, 0.12, "triangle", 0.5],
      [659.25, 0.1, 0.12, "triangle", 0.5],
      [783.99, 0.2, 0.12, "triangle", 0.5],
      [1046.5, 0.3, 0.3, "triangle", 0.5]
    ]);
  }

  function lose() {
    arpeggio([
      [392, 0, 0.14, "triangle", 0.45],
      [311.13, 0.12, 0.14, "triangle", 0.45],
      [261.63, 0.24, 0.14, "triangle", 0.45],
      [196, 0.36, 0.32, "triangle", 0.45]
    ]);
  }

  function creep() {
    tone(500, 0.07, "square", 0.2);
    tone(500, 0.07, "square", 0.2, 0.1);
    tone(750, 0.1, "square", 0.2, 0.2);
  }

  function error() {
    tone(160, 0.12, "square", 0.3);
    tone(110, 0.16, "square", 0.3, 0.1);
  }

  global.HexAudio = {
    init: init,
    setMuted: setMuted,
    isMuted: isMuted,
    click: click,
    buy: buy,
    coin: coin,
    sell: sell,
    place: place,
    levelup: levelup,
    refresh: refresh,
    ready: ready,
    battleStart: battleStart,
    hit: hit,
    cast: cast,
    death: death,
    win: win,
    lose: lose,
    creep: creep,
    error: error
  };
})(typeof window !== "undefined" ? window : this);

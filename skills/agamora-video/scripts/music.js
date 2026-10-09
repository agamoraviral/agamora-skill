'use strict';
/*
 * music.js — генератор музыкальной подложки и звуковых акцентов для анимационного ролика.
 *
 * Запуск:    node music.js <timeline.json> <out.wav>
 * Результат: WAV 48 кГц, стерео, 16 бит, ровно ceil(total*48000) отсчётов.
 * Из кода:   const { renderMusic } = require('./music');
 *            const [L, R] = renderMusic(timeline);       // два Float32Array, готовы к записи
 *
 * Ре мажор / си минор, 96 BPM, аккорд меняется раз в 2 такта. Сетка долей подстраивается под
 * каждую сцену (на несколько процентов), чтобы смена сцены приходилась ровно на долю.
 * Слои: тёплый пэд, саб-бас, щипковое арпеджио с дилэем 3/16, мягкие бочка и хэты, тики,
 * общая реверберация Freeverb; акценты по событиям timeline.events.
 * Под речью подложка −11 дБ, акценты −5 дБ. Итог ≈ −20 LUFS, истинный пик ≤ −3 dBTP.
 * Без зависимостей; детерминированно (ГПСЧ mulberry32 с постоянным зерном).
 */

const fs = require('fs');

// ── Общие константы ─────────────────────────────────────────────────────────
const SR = 48000;                 // частота дискретизации, Гц
const BEAT = 60 / 96;             // доля при 96 BPM, с
const CR = 64;                    // шаг управляющих кривых, отсчётов (= 2^6)
const SEED = 0x5eed2026;          // зерно ГПСЧ
const TAU = 2 * Math.PI;
const TARGET_LUFS = -20;          // интегральная громкость дорожки
const TP_LIMIT_DB = -3.5;         // порог лимитера по истинному пику (запас 0,5 дБ до −3 dBTP)
const DUCK = { music: -11, fx: -5, pre: 0.2, ramp: 0.3 };   // приглушение под речь

// Уровни слоёв до нормализации (подобраны по измерению громкости каждого слоя)
const LV = {
  padSaw: 0.07, padTri: 0.085, bass: 0.12, arp: 0.32, kick: 0.5, hat: 0.22, tick: 0.2, tension: 0.02,
  hit: 1, whoosh: 0.65, riser: 3.5, sparkle: 0.14, deny: 0.4, ticks: 0.3, swell: 1.26,
};
// Посылы в реверберацию (rev) и дилэй
const SEND = { pad: 0.3, arp: 0.3, arpDelay: 0.5, delayRev: 0.25, kick: 0.05, hat: 0.1, tick: 0.25, tension: 0.6 };
const REV_WET = { music: 0.45, fx: 0.6 };              // возврат ≈ −7…−8 дБ к сухому сигналу

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, x) => a + (b - a) * x;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const panL = (p) => Math.cos(((p + 1) * Math.PI) / 4);    // равномощностная панорама, p ∈ [−1; 1]
const panR = (p) => Math.sin(((p + 1) * Math.PI) / 4);

// ГПСЧ mulberry32: равномерно на [0; 1)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Гармония ────────────────────────────────────────────────────────────────
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// iv — ступени аккорда от корня; arp — пять нот арпеджио от корня
const QUAL = {
  '': { iv: [0, 4, 7], arp: [0, 7, 12, 16, 19] },
  m: { iv: [0, 3, 7], arp: [0, 7, 12, 15, 19] },
  maj7: { iv: [0, 4, 7, 11], arp: [0, 7, 11, 16, 19] },
  maj9: { iv: [0, 4, 7, 11, 14], arp: [0, 7, 14, 16, 19] },
  m7: { iv: [0, 3, 7, 10], arp: [0, 7, 10, 15, 19] },
  sus4: { iv: [0, 5, 7], arp: [0, 7, 12, 17, 19] },
  add9: { iv: [0, 4, 7, 14], arp: [0, 7, 14, 16, 19] },
  5: { iv: [0, 7], arp: [0, 7, 12, 19, 24] },
};
const chordCache = new Map();
function chord(name) {
  if (chordCache.has(name)) return chordCache.get(name);
  const m = /^([A-G][#b]?)(maj9|maj7|add9|sus4|m7|m|5)?(?:\/([A-G][#b]?))?$/.exec(name);
  if (!m) throw new Error('Неизвестный аккорд: ' + name);
  const root = PC[m[1]], q = QUAL[m[2] || ''];
  const pcs = [...new Set(q.iv.map((i) => (root + i) % 12))];
  const third = q.iv.includes(4) ? (root + 4) % 12 : q.iv.includes(3) ? (root + 3) % 12 : -1;
  const c = { name, root, pcs, third, fifth: (root + 7) % 12, bass: m[3] ? PC[m[3]] : root, arp: q.arp };
  chordCache.set(name, c);
  return c;
}

// Расположение аккорда пэда (5 голосов в 3–4-й октаве) с плавным голосоведением:
// перебор сочетаний, жёсткие правила расстановки и штраф за перемещение голосов.
function voiceChord(c, prev) {
  if (c.name === 'D5') return [38, 45, 50, 57];          // гул тизера: D2 + A2 (+ D3, A3)
  const cand = [];
  for (let m = 49; m <= 74; m++) if (c.pcs.includes(m % 12)) cand.push(m);
  const ess = c.pcs.length >= 4 ? c.pcs.filter((p) => p !== c.fifth) : c.pcs;   // обязательные ступени
  const ext = c.pcs.filter((p) => p !== c.root && p !== c.fifth && p !== c.third);
  const n = cand.length, v = [0, 0, 0, 0, 0], cnt = new Int32Array(12);
  let best = null, bestCost = Infinity;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let d = b + 1; d < n; d++)
    for (let e = d + 1; e < n; e++) for (let g = e + 1; g < n; g++) {
      v[0] = cand[a]; v[1] = cand[b]; v[2] = cand[d]; v[3] = cand[e]; v[4] = cand[g];
      const cost = voicingCost(v, c, prev, ess, ext, cnt);
      if (cost < bestCost) { bestCost = cost; best = v.slice(); }
    }
  if (best) return best;
  const r = 48 + c.root;                                    // запасной вариант: тесное трезвучие
  return c.pcs.map((p) => r + ((p - c.root + 12) % 12)).sort((x, y) => x - y);
}
function voicingCost(v, c, prev, ess, ext, cnt) {
  const low = v[0] % 12;
  if (low !== c.root && low !== c.fifth) return Infinity;   // внизу — корень или квинта
  const i0 = v[1] - v[0];
  if (i0 < (v[0] < 55 ? 5 : 3) || i0 > 12) return Infinity; // без мутных терций внизу
  for (let i = 1; i < 4; i++) { const d = v[i + 1] - v[i]; if (d < 2 || d > 9) return Infinity; }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 5; j++) if (v[j] - v[i] === 13) return Infinity; // без малых нон
  cnt.fill(0);
  for (let i = 0; i < 5; i++) cnt[v[i] % 12]++;
  for (const p of ess) if (!cnt[p]) return Infinity;
  let cost = 0;
  if (c.third >= 0 && cnt[c.third] > 1) cost += 5;          // удвоение терции
  for (const p of ext) if (cnt[p] > 1) cost += 8;          // удвоение септимы/ноны
  if (cnt[c.fifth] > 1) cost += 1;
  if (v[4] > 71) cost += (v[4] - 71) * 1.5;
  cost += Math.abs((v[0] + v[1] + v[2] + v[3] + v[4]) / 5 - 61) * 0.3;
  if (prev) {                                               // перемещение голосов (в обе стороны)
    for (let i = 0; i < 5; i++) { let dm = 99; for (const p of prev) dm = Math.min(dm, Math.abs(v[i] - p)); cost += dm; }
    for (const p of prev) { let dm = 99; for (let i = 0; i < 5; i++) dm = Math.min(dm, Math.abs(v[i] - p)); cost += dm; }
  } else {
    const REF = [50, 57, 62, 66, 69];
    for (let i = 0; i < 5; i++) cost += Math.abs(v[i] - REF[i]) * 0.5;
  }
  return cost;
}
// Бас во 2-й октаве (C2…B2); си — в той октаве, что ближе к предыдущей ноте
function bassMidi(c, prev) {
  const m = 36 + c.bass;
  if (m === 47 && prev != null && Math.abs(35 - prev) < Math.abs(47 - prev)) return 35;
  return m;
}
// Пять нот арпеджио в октаве, где среднее ближе к A4
function arpPool(c) {
  let best = null, bd = Infinity;
  for (let base = 48 + c.root; base <= 72; base += 12) {
    const pool = c.arp.map((i) => base + i);
    const d = Math.abs(pool.reduce((s, x) => s + x, 0) / pool.length - 68);
    if (d < bd) { bd = d; best = pool; }
  }
  return best;
}

// ── Характер сцен ───────────────────────────────────────────────────────────
// pad — уровень пэда в начале/конце сцены; cut — срез ФНЧ пэда, Гц; bass — уровень баса;
// arp: [[доля сцены, нот на долю, уровень], …]; kick/hat: [[доля сцены, рисунок, уровень], …];
// bassPulse — с какой доли сцены бас пульсирует восьмыми; int — рост интенсивности ритма.
const STYLE = {
  teaser: { prog: ['D5'], pad: [0.55, 0.85], cut: [320, 950], bass: 0.5, tension: true },
  title: { prog: ['Dmaj9', 'Bm7', 'Gmaj7', 'Asus4'], pad: [1, 1], cut: [1500, 2000], bass: 0.8, arp: [[0, 2, 0.5]] },
  problem: { prog: ['Bm', 'G', 'Em', 'F#sus4'], pad: [0.8, 0.8], cut: [950, 1150], bass: 0.85, tick: 1 },
  solution: { prog: ['D', 'A/C#', 'Bm', 'G'], pad: [0.9, 0.95], cut: [1700, 2200], bass: 1,
    arp: [[0, 2, 0.6]], kick: [[0, 'half', 0.5]], hat: [[0, 'off8', 0.45]] },
  team: { prog: ['D', 'A/C#', 'Bm', 'G'], pad: [0.95, 0.95], cut: [1900, 2400], bass: 1,
    arp: [[0, 2, 0.65]], kick: [[0, 'half', 0.55]], hat: [[0, 'off8', 0.5]] },
  roles: { prog: ['D', 'A/C#', 'Bm', 'G'], pad: [0.95, 1], cut: [2000, 2600], bass: 1,
    arp: [[0, 2, 0.7]], kick: [[0, 'half', 0.6]], hat: [[0, 'off8', 0.55]] },
  principle: { prog: ['Em7', 'Gmaj7', 'D/F#', 'Asus4'], pad: [0.85, 0.85], cut: [1300, 1550], bass: 0.75, arp: [[0, 1, 0.6]] },
  effect: { prog: ['Bm', 'G', 'D', 'A'], pad: [0.85, 1.05], cut: [1400, 3000], bass: 1, bassPulse: 0.5,
    arp: [[0, 2, 0.55], [0.55, 4, 0.6]], kick: [[0.4, 'half', 0.5], [0.75, 'four', 0.6]],
    hat: [[0.55, 'off8', 0.5]], int: [0.85, 1.15] },
  examples: { prog: ['G', 'A', 'D/F#', 'Bm'], pad: [0.95, 0.95], cut: [2100, 2500], bass: 1,
    arp: [[0, 2, 0.7]], kick: [[0, 'half', 0.6]], hat: [[0, 'off8', 0.55]] },
  roadmap: { prog: ['D', 'A/C#', 'Bm', 'G'], pad: [0.95, 1.1], cut: [2200, 3200], bass: 1, bassPulse: 0,
    arp: [[0, 4, 0.55]], kick: [[0, 'four', 0.6]], hat: [[0, 'drive', 0.55]], int: [0.85, 1.15] },
  outro: { prog: ['Gmaj7', 'Asus4'], pad: [0.95, 0.9], cut: [1900, 1700], bass: 0.9, arp: [[0, 2, 0.4]], anchorEnd: true },
};
const ARP_PAT = { 1: [0, 2, 3, 1], 2: [0, 1, 2, 3, 4, 3, 2, 1], 4: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 1] };
const ARP_TAU = { 1: 0.75, 2: 0.4, 4: 0.22 };            // затухание щипка, с
const PAD_XF = 1.4;                                        // атака/затухание голосов пэда, с
const PAD_ANT = 0.3;                                       // пэд меняет аккорд чуть раньше доли, с

// ── Разбор timeline ────────────────────────────────────────────────────────
const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);   // число или null
function normalizeTimeline(tl) {
  if (!tl || !(+tl.total > 0) || !isFinite(+tl.total)) throw new Error('timeline.total должен быть положительным числом');
  const total = +tl.total;
  let scenes = (Array.isArray(tl.scenes) ? tl.scenes : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({ type: String(s.type), t0: +s.t0, t1: +s.t1 }))
    .filter((s) => isFinite(s.t0) && s.t0 < total)
    .sort((a, b) => a.t0 - b.t0);
  if (!scenes.length) scenes = [{ type: 'title', t0: 0, t1: total }];
  scenes[0].t0 = 0;                                        // сцены — встык, от 0 до total
  for (let i = 0; i < scenes.length; i++) scenes[i].t1 = i + 1 < scenes.length ? scenes[i + 1].t0 : total;
  scenes = scenes.filter((s) => s.t1 - s.t0 > 1e-3);
  const raw = (Array.isArray(tl.speech) ? tl.speech : [])
    .filter(Array.isArray)
    .map((p) => [clamp(+p[0], 0, total), clamp(+p[1], 0, total)])
    .filter((p) => isFinite(p[0]) && isFinite(p[1]) && p[1] > p[0])
    .sort((a, b) => a[0] - b[0]);
  const speech = [];
  const gapMin = 2 * (DUCK.pre + DUCK.ramp);               // короткие паузы не «проваливаем»
  for (const p of raw) {
    const last = speech[speech.length - 1];
    if (last && p[0] - last[1] < gapMin) last[1] = Math.max(last[1], p[1]);
    else speech.push([p[0], p[1]]);
  }
  const events = (Array.isArray(tl.events) ? tl.events : [])
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({ kind: String(e.kind), t: +e.t, strength: num(e.strength), dur: num(e.dur) }))
    .filter((e) => isFinite(e.t) && e.t >= 0 && e.t <= total)
    .sort((a, b) => a.t - b.t);
  return { total, scenes, speech, events };
}

function segAt(segs, t) {
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  return segs[lo];
}

// ── Аранжировка: аккорды, ноты, удары ─────────────────────────────────────
function arrange(tl) {
  const { total, events } = tl;
  const swell = events.find((e) => e.kind === 'swell') || null;
  const stopT = swell ? swell.t : total;                   // после нарастания играет только оно
  const scenes = tl.scenes.map((s) => {
    const st = STYLE[s.type] || STYLE.solution;
    const dur = s.t1 - s.t0, nb = Math.max(1, Math.round(dur / BEAT));
    return { type: s.type, t0: s.t0, t1: s.t1, st, dur, nb, bt: dur / nb };
  });

  // 1. Аккорды: смена раз в 2 такта от начала сцены; хвост короче такта присоединяем к предыдущему
  const segs = [];
  for (const sc of scenes) {
    const end = Math.min(sc.t1, stopT);
    if (end - sc.t0 < 1e-3) continue;
    const nbEnd = (end - sc.t0) / sc.bt;
    const push = (b0, b1, name) => segs.push({ t0: sc.t0 + b0 * sc.bt, t1: Math.min(end, sc.t0 + b1 * sc.bt), ch: chord(name), sc });
    let prog = sc.st.prog;
    if (sc.st.anchorEnd && swell && stopT <= sc.t1 + 1e-6) {
      // финал: последний аккорд (Asus4) — за такт до нарастания, раньше — остальные
      const head = prog.slice(0, -1);
      let bc = Math.round(nbEnd - 4);
      if (bc < 2 || !head.length) bc = 0;
      for (let b = 0, k = 0; b < bc; b += 8, k++) push(b, Math.min(b + 8, bc), head[k % head.length]);
      push(bc, nbEnd, prog[prog.length - 1]);
    } else {
      if (sc.st.anchorEnd) prog = prog.concat(['Dadd9']); // финал без нарастания — разрешаемся в тонику
      for (let k = 0; 8 * k < nbEnd - 1e-6; k++) {
        const b0 = 8 * k, b1 = Math.min(8 * k + 8, nbEnd);
        if (k > 0 && b1 - b0 < 4 && b1 >= nbEnd - 1e-6) { segs[segs.length - 1].t1 = end; break; }
        push(b0, b1, prog[sc.st.anchorEnd ? Math.min(k, prog.length - 1) : k % prog.length]);
      }
    }
  }
  if (!segs.length) segs.push({ t0: 0, t1: Math.max(stopT, 1e-3), ch: chord('D'), sc: scenes[0] });

  let pv = null, pb = null;
  for (const s of segs) {
    s.voicing = voiceChord(s.ch, pv); pv = s.voicing;
    s.bassMidi = bassMidi(s.ch, pb); pb = s.bassMidi;
    s.pool = arpPool(s.ch);
  }

  // 2. Пэд: общие ноты соседних аккордов тянутся, остальные плавно сменяются
  const pad = [], act = new Map();
  segs.forEach((s, i) => {
    const tc = i === 0 ? s.t0 : Math.max(segs[i - 1].t0 + 0.5, s.t0 - PAD_ANT);
    const want = new Set(s.voicing);
    for (const [m, nt] of act) if (!want.has(m)) { nt.off = tc; pad.push(nt); act.delete(m); }
    for (const m of s.voicing) if (!act.has(m)) act.set(m, { midi: m, on: tc, atk: i === 0 ? 1.5 : PAD_XF, off: 0, rel: PAD_XF });
  });
  for (const nt of act.values()) { nt.off = stopT; nt.rel = 2.2; pad.push(nt); }

  // 3. Саб-бас: тянется по основным тонам; в «драйвовых» местах пульсирует восьмыми
  const bass = [];
  let cur = null;
  const closeCur = (rel) => { if (cur) { cur.off = cur.end; cur.rel = rel; bass.push(cur); cur = null; } };
  for (const sg of segs) {
    const sc = sg.sc, st = sc.st;
    const tp = st.bassPulse == null ? Infinity : sc.t0 + Math.ceil(st.bassPulse * sc.nb / 4 - 1e-9) * 4 * sc.bt;
    const sEnd = Math.min(sg.t1, tp);
    if (sEnd > sg.t0 + 1e-6) {
      if (cur && cur.midi === sg.bassMidi && Math.abs(cur.end - sg.t0) < 1e-6) cur.end = sEnd;
      else { closeCur(0.3); cur = { midi: sg.bassMidi, on: sg.t0, atk: bass.length ? 0.08 : 1.0, end: sEnd, off: 0, rel: 0.3, lvl: 1 }; }
    }
    if (sg.t1 > tp + 1e-6) {
      closeCur(0.05);
      const step = sc.bt / 2, pStart = Math.max(sg.t0, tp);
      for (let k = Math.ceil((pStart - sc.t0) / step - 1e-6); ; k++) {
        const t = sc.t0 + k * step;
        if (t >= sg.t1 - 1e-6) break;
        bass.push({ midi: sg.bassMidi, on: t, atk: 0.006, off: t + step * 0.72, rel: 0.05, lvl: k % 2 ? 0.8 : 1 });
      }
    }
  }
  if (cur) { cur.end = stopT; closeCur(stopT < total ? 1.0 : 0.3); }

  // 4. Арпеджио, бочка, хэты, тики, тянущийся «звон» тизера
  const arp = [], kick = [], hat = [], tick = [], tension = [];
  const rnd = mulberry32(SEED + 7);
  for (const sc of scenes) {
    const st = sc.st, end = Math.min(sc.t1, stopT);
    if (end - sc.t0 < 0.05) continue;
    const inten = (t) => (st.int ? lerp(st.int[0], st.int[1], clamp((t - sc.t0) / sc.dur, 0, 1)) : 1);
    const range = (list, i) => {                           // доли отрезка, начало — с такта
      const b0 = Math.ceil(list[i][0] * sc.nb / 4 - 1e-9) * 4;
      const b1 = i + 1 < list.length ? Math.ceil(list[i + 1][0] * sc.nb / 4 - 1e-9) * 4 : sc.nb;
      return [b0, Math.min(b1, sc.nb)];
    };
    if (st.arp) st.arp.forEach((seg, i) => {
      const div = seg[1], lvl = seg[2], pat = ARP_PAT[div], tau = ARP_TAU[div];
      const [b0, b1] = range(st.arp, i);
      for (let b = b0; b < b1; b++) for (let j = 0; j < div; j++) {
        const t = sc.t0 + (b + j / div) * sc.bt;
        if (t >= end - 0.03) break;
        const step = (b % 4) * div + j;
        const acc = div === 1 ? (step === 0 ? 1 : 0.85) : div === 2 ? (j === 0 ? 1 : 0.8) : j === 0 ? 1 : j === 2 ? 0.8 : 0.66;
        const midi = segAt(segs, t + 1e-6).pool[pat[step % pat.length]];
        arp.push({ t, midi, amp: lvl * inten(t) * acc * (0.94 + 0.12 * rnd()), tau, pan: (step & 1 ? 0.18 : -0.18) + (rnd() - 0.5) * 0.1 });
      }
    });
    if (st.kick) st.kick.forEach((seg, i) => {
      const [b0, b1] = range(st.kick, i);
      for (let b = b0; b < b1; b++) {
        const t = sc.t0 + b * sc.bt, bb = b % 4;
        if (t >= end - 0.03) break;
        if (seg[1] === 'half' && bb % 2) continue;
        kick.push({ t, amp: seg[2] * inten(t) * (bb === 0 ? 1 : bb === 2 ? 0.9 : 0.8) });
      }
    });
    if (st.hat) st.hat.forEach((seg, i) => {
      const [b0, b1] = range(st.hat, i);
      const offs = seg[1] === 'drive' ? [[0.25, 0.4], [0.5, 1], [0.75, 0.45]] : [[0.5, 1]];
      for (let b = b0; b < b1; b++) for (const [o, v] of offs) {
        const t = sc.t0 + (b + o) * sc.bt;
        if (t < end - 0.03) hat.push({ t, amp: seg[2] * inten(t) * v * (0.9 + 0.2 * rnd()), k: (rnd() * 3) | 0 });
      }
    });
    if (st.tick) for (let b = 0; b < sc.nb; b++) {
      const t = sc.t0 + b * sc.bt;
      if (t >= end - 0.03) break;
      tick.push({ t, amp: st.tick * (b % 2 ? 0.8 : 1), k: b % 2 });
    }
    if (st.tension) tension.push({ on: sc.t0 + 0.8, off: end + 0.6, midi: 69, pan: -0.3 }, { on: sc.t0 + 1.6, off: end + 0.6, midi: 76, pan: 0.3 });
  }
  return { scenes, segs, pad, bass, arp, kick, hat, tick, tension, stopT, swell, events };
}

// ── Управляющие кривые ─────────────────────────────────────────────────────
function boxSmooth(a, w) {                                 // скользящее среднее (центрированное)
  const n = a.length, h = w >> 1, cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + a[i];
  for (let i = 0; i < n; i++) { const lo = Math.max(0, i - h), hi = Math.min(n, i + h + 1); a[i] = (cs[hi] - cs[lo]) / (hi - lo); }
}
// Уровни и срез по сценам; переходы сглажены (~1 с)
function sceneCurves(A, NC) {
  const padGain = new Float32Array(NC), cutLog = new Float32Array(NC), bassGain = new Float32Array(NC);
  const sc = A.scenes;
  let si = 0;
  for (let k = 0; k < NC; k++) {
    const t = (k * CR) / SR;
    while (si + 1 < sc.length && t >= sc[si + 1].t0) si++;
    const s = sc[si], st = s.st, x = clamp((t - s.t0) / s.dur, 0, 1);
    padGain[k] = lerp(st.pad[0], st.pad[1], x);
    cutLog[k] = lerp(Math.log(st.cut[0]), Math.log(st.cut[1]), x);
    bassGain[k] = st.bass;
  }
  const W1 = Math.round(SR / CR), W2 = Math.round((0.4 * SR) / CR);
  for (const a of [padGain, cutLog, bassGain]) { boxSmooth(a, W1); boxSmooth(a, W2); }
  const padCut = new Float32Array(NC);
  for (let k = 0; k < NC; k++) {
    const t = (k * CR) / SR;                               // медленное «дыхание» среза
    padCut[k] = clamp(Math.exp(cutLog[k]) * (1 + 0.12 * Math.sin((TAU * t) / 9.3)), 200, 6000);
  }
  return { padGain, padCut, bassGain };
}
// Приглушение под речь: начинаем за 0,2 с до фразы, рампы 0,3 с
function duckCurves(speech, NC, off) {
  const d = new Float32Array(NC);
  if (!off) for (const [a, b] of speech) {
    const tA = a - DUCK.pre;
    const k0 = Math.max(0, Math.floor((tA * SR) / CR)), k1 = Math.min(NC - 1, Math.ceil(((b + DUCK.ramp) * SR) / CR));
    for (let k = k0; k <= k1; k++) {
      const t = (k * CR) / SR;
      const v = Math.min(smooth((t - tA) / DUCK.ramp), 1 - smooth((t - b) / DUCK.ramp));
      if (v > d[k]) d[k] = v;
    }
  }
  const gM = new Float32Array(NC), gF = new Float32Array(NC);
  for (let k = 0; k < NC; k++) { gM[k] = Math.pow(10, (DUCK.music * d[k]) / 20); gF[k] = Math.pow(10, (DUCK.fx * d[k]) / 20); }
  return { gM, gF };
}

// ── Синтез слоёв подложки ──────────────────────────────────────────────────
// Пэд: две расстроенные пилы (PolyBLEP, разведены по каналам) + треугольник в центре
function renderPad(notes, L, R, N, rnd) {
  const GS = LV.padSaw, GT = LV.padTri;
  for (const nt of notes) {
    const f = mtof(nt.midi);
    const on = Math.round(nt.on * SR), s0 = Math.max(0, on);
    const nA = Math.max(1, Math.round(nt.atk * SR)), nOff = Math.round(nt.off * SR), nR = Math.max(1, Math.round(nt.rel * SR));
    const s1 = Math.min(N, nOff + nR);
    const det = 5 + 3 * rnd();
    const i1 = (f * Math.pow(2, -det / 1200)) / SR, i2 = (f * Math.pow(2, det / 1200)) / SR, i3 = f / SR;
    let p1 = rnd(), p2 = rnd(), p3 = rnd();
    for (let n = s0; n < s1; n++) {
      let e = 1;
      const da = n - on;
      if (da < nA) e = 0.5 - 0.5 * Math.cos((Math.PI * da) / nA);
      if (n >= nOff) e *= 0.5 + 0.5 * Math.cos((Math.PI * (n - nOff)) / nR);
      let y1 = 2 * p1 - 1;
      if (p1 < i1) { const x = p1 / i1; y1 -= x + x - x * x - 1; } else if (p1 > 1 - i1) { const x = (p1 - 1) / i1; y1 -= x * x + x + x + 1; }
      p1 += i1; if (p1 >= 1) p1 -= 1;
      let y2 = 2 * p2 - 1;
      if (p2 < i2) { const x = p2 / i2; y2 -= x + x - x * x - 1; } else if (p2 > 1 - i2) { const x = (p2 - 1) / i2; y2 -= x * x + x + x + 1; }
      p2 += i2; if (p2 >= 1) p2 -= 1;
      const y3 = 1 - 4 * Math.abs(p3 - 0.5);
      p3 += i3; if (p3 >= 1) p3 -= 1;
      const a = GS * e, b = GT * e * y3;
      L[n] += a * (0.92 * y1 + 0.4 * y2) + b;
      R[n] += a * (0.4 * y1 + 0.92 * y2) + b;
    }
  }
}
// Шина пэда: ФНЧ (TPT SVF, 12 дБ/окт, без резонанса) + однополюсный ФНЧ 7 кГц, уровень по сценам
function padFilter(tL, tR, o, cv, N) {
  const { padCut, padGain } = cv, send = SEND.pad;
  const k = 1 / 0.65, aOP = 1 - Math.exp((-TAU * 7000) / SR);
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0, lo = 0, ro = 0;
  for (let b = 0; b < N; b += CR) {
    const ci = b / CR;
    const g = Math.tan((Math.PI * padCut[ci]) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    let gn = padGain[ci];
    const dg = (padGain[ci + 1] - gn) / CR, e = Math.min(N, b + CR);
    for (let n = b; n < e; n++) {
      const vl = tL[n] - l2, v1l = a1 * l1 + a2 * vl, v2l = l2 + a2 * l1 + a3 * vl;
      l1 = 2 * v1l - l1; l2 = 2 * v2l - l2;
      const vr = tR[n] - r2, v1r = a1 * r1 + a2 * vr, v2r = r2 + a2 * r1 + a3 * vr;
      r1 = 2 * v1r - r1; r2 = 2 * v2r - r2;
      lo += aOP * (v2l - lo); ro += aOP * (v2r - ro);
      const yl = lo * gn, yr = ro * gn;
      o.mL[n] += yl; o.mR[n] += yr; o.sL[n] += yl * send; o.sR[n] += yr * send;
      gn += dg;
    }
  }
}
// Саб-бас: синус + немного второй гармоники (слышимость на небольших колонках)
function renderBass(notes, o, gainC, N) {
  for (const nt of notes) {
    const w = (TAU * mtof(nt.midi)) / SR, amp = nt.lvl * LV.bass;
    const on = Math.round(nt.on * SR), s0 = Math.max(0, on);
    const nA = Math.max(1, Math.round(nt.atk * SR)), nOff = Math.round(nt.off * SR), nR = Math.max(1, Math.round(nt.rel * SR));
    const s1 = Math.min(N, nOff + nR);
    let ph = 0;
    for (let n = s0; n < s1; n++) {
      let e = amp;
      const da = n - on;
      if (da < nA) e *= 0.5 - 0.5 * Math.cos((Math.PI * da) / nA);
      if (n >= nOff) e *= 0.5 + 0.5 * Math.cos((Math.PI * (n - nOff)) / nR);
      const k = n >> 6, g = gainC[k] + (gainC[k + 1] - gainC[k]) * ((n & 63) / 64);
      const y = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * e * g;
      o.mL[n] += y; o.mR[n] += y;
      ph += w; if (ph > TAU) ph -= TAU;
    }
  }
}
// Щипковый тон: три гармоники, верхние гаснут быстрее; o — шины {L, R, sL, sR, dL, dR}
function pluck(o, N, t, f, amp, tau, pan, atk, send, dsend, h2, h3, glide) {
  const s0 = Math.round(t * SR), len = Math.round(Math.min(4.6 * tau, 3) * SR), s1 = Math.min(N, s0 + len);
  if (s0 < 0 || s0 >= s1) return;
  const gl = panL(pan) * amp, gr = panR(pan) * amp;
  const nA = Math.max(1, Math.round(atk * SR)), nF = Math.round(0.01 * SR);
  const d1 = Math.exp(-1 / (tau * SR)), d2 = Math.exp(-1.8 / (tau * SR)), d3 = Math.exp(-2.8 / (tau * SR));
  let w = (TAU * f) / SR, cw = Math.cos(w), sw = Math.sin(w), c = 1, s = 0, e1 = 1, e2 = h2, e3 = h3;
  const { L, R, sL, sR, dL, dR } = o;
  for (let n = s0; n < s1; n++) {
    const i = n - s0;
    if (glide !== 0 && (i & 63) === 0) {                   // плавный уход высоты (для «отказа»)
      w = (TAU * f * Math.pow(2, (glide * i) / len / 12)) / SR; cw = Math.cos(w); sw = Math.sin(w);
    }
    let y = e1 * s + e2 * 2 * s * c + e3 * s * (3 - 4 * s * s);
    if (i < nA) y *= i / nA; else if (len - i < nF) y *= (len - i) / nF;
    const yl = y * gl, yr = y * gr;
    L[n] += yl; R[n] += yr;
    if (send) { sL[n] += yl * send; sR[n] += yr * send; }
    if (dsend) { dL[n] += yl * dsend; dR[n] += yr * dsend; }
    const cn = c * cw - s * sw; s = s * cw + c * sw; c = cn;
    e1 *= d1; e2 *= d2; e3 *= d3;
  }
}
// Стерео-дилэй «пинг-понг» 3/16 (0,469 с), отражения темнеют
function pingPong(tL, tR, o, N) {
  const D = Math.round(0.75 * BEAT * SR), bl = new Float64Array(D), br = new Float64Array(D);
  const g = Math.sqrt(0.42), aLP = 1 - Math.exp((-TAU * 3800) / SR), aHP = 1 - Math.exp((-TAU * 220) / SR);
  const WET = 0.6, REV = SEND.delayRev;
  let idx = 0, lp1 = 0, hp1 = 0, lp2 = 0, hp2 = 0;
  for (let n = 0; n < N; n++) {
    const xl = bl[idx], xr = br[idx];
    lp1 += aLP * (xl - lp1); hp1 += aHP * (lp1 - hp1);
    lp2 += aLP * (xr - lp2); hp2 += aHP * (lp2 - hp2);
    bl[idx] = 0.5 * (tL[n] + tR[n]) + (lp2 - hp2) * g;    // правое отражение — обратно в левый канал
    br[idx] = (lp1 - hp1) * g;                             // левое — в правый
    if (++idx >= D) idx = 0;
    o.mL[n] += xl * WET; o.mR[n] += xr * WET; o.sL[n] += xl * REV; o.sR[n] += xr * REV;
  }
}
// Тянущийся высокий «звон» тизера: синусы с лёгким вибрато и медленной пульсацией
function renderTension(notes, o, N) {
  for (const nt of notes) {
    const s0 = Math.max(0, Math.round(nt.on * SR)), s1 = Math.min(N, Math.round(nt.off * SR));
    const nA = Math.round(2.5 * SR), nR = Math.round(1.2 * SR), f = mtof(nt.midi);
    const gl = panL(nt.pan) * LV.tension, gr = panR(nt.pan) * LV.tension, send = SEND.tension;
    let ph = 0;
    for (let n = s0; n < s1; n++) {
      const i = n - s0, t = n / SR;
      let e = 1;
      if (i < nA) e = 0.5 - 0.5 * Math.cos((Math.PI * i) / nA);
      if (s1 - n < nR) e *= 0.5 - 0.5 * Math.cos((Math.PI * (s1 - n)) / nR);
      e *= 1 + 0.3 * Math.sin(TAU * 0.25 * t + nt.midi);
      ph += (TAU * f * (1 + 0.0017 * Math.sin(TAU * 5 * t))) / SR;
      const y = Math.sin(ph) * e;
      o.mL[n] += y * gl; o.mR[n] += y * gr; o.sL[n] += y * gl * send; o.sR[n] += y * gr * send;
    }
  }
}

// ── Заготовки ударных ──────────────────────────────────────────────────────
// Мягкая бочка: синус 120 → 45 Гц, 250 мс
function makeKick() {
  const len = Math.round(0.25 * SR), out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += (TAU * (45 + 75 * Math.exp(-t / 0.035))) / SR;
    let e = Math.exp(-t / 0.085);
    if (i < 120) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / 120);
    if (t > 0.2) e *= 0.5 + 0.5 * Math.cos((Math.PI * (t - 0.2)) / 0.05);
    out[i] = Math.sin(ph) * e;
  }
  return out;
}
function normPeak(a) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] /= m;
  return a;
}
// Тихий хэт: шум через ФВЧ 7,5 кГц, 30 мс
function makeHat(rnd) {
  const len = Math.round(0.03 * SR), out = new Float32Array(len);
  const g = Math.tan((Math.PI * 7500) / SR), k = 1 / 0.7, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const aLP = 1 - Math.exp((-TAU * 13000) / SR);
  let i1 = 0, i2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const x = rnd() * 2 - 1, v3 = x - i2, v1 = a1 * i1 + a2 * v3, v2 = i2 + a2 * i1 + a3 * v3;
    i1 = 2 * v1 - i1; i2 = 2 * v2 - i2;
    lp += aLP * (x - k * v1 - v2 - lp);
    let e = Math.exp(-i / (0.008 * SR));
    if (i < 24) e *= i / 24;
    if (len - i < 240) e *= (len - i) / 240;
    out[i] = lp * e;
  }
  return normPeak(out);
}
// Тик часов: короткий тон + «деревянный» призвук + щелчок полосового шума
function makeTick(f, rnd) {
  const len = Math.round(0.045 * SR), out = new Float32Array(len);
  const g = Math.tan((Math.PI * 3200) / SR), k = 1 / 1.5, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const aLP = 1 - Math.exp((-TAU * 8000) / SR);
  let i1 = 0, i2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, x = rnd() * 2 - 1, v3 = x - i2, v1 = a1 * i1 + a2 * v3, v2 = i2 + a2 * i1 + a3 * v3;
    i1 = 2 * v1 - i1; i2 = 2 * v2 - i2;
    let y = Math.sin(TAU * f * t) * Math.exp(-t / 0.007) + 0.35 * Math.sin((TAU * f * t) / 3.2) * Math.exp(-t / 0.012)
      + 0.5 * k * v1 * Math.exp(-t / 0.0025);
    if (i < 15) y *= i / 15;
    if (len - i < 240) y *= (len - i) / 240;
    lp += aLP * (y - lp);
    out[i] = lp;
  }
  return normPeak(out);
}
function mixSample(o, N, smp, t, amp, pan, send) {
  const n0 = Math.round(t * SR), gl = panL(pan) * amp, gr = panR(pan) * amp;
  for (let i = 0; i < smp.length; i++) {
    const n = n0 + i;
    if (n >= N) break;
    if (n < 0) continue;
    const yl = smp[i] * gl, yr = smp[i] * gr;
    o.L[n] += yl; o.R[n] += yr;
    if (send) { o.sL[n] += yl * send; o.sR[n] += yr * send; }
  }
}

// ── Реверберация Freeverb: 8 гребенчатых + 4 всепропускающих фильтра на канал ──
class Freeverb {
  constructor(room, damp, width) {
    const sc = SR / 44100, CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225], SP = 23;
    this.c = [CT.map((t) => new Float64Array(Math.round(t * sc))), CT.map((t) => new Float64Array(Math.round((t + SP) * sc)))];
    this.a = [AT.map((t) => new Float64Array(Math.round(t * sc))), AT.map((t) => new Float64Array(Math.round((t + SP) * sc)))];
    this.ci = new Int32Array(16); this.cf = new Float64Array(16); this.ai = new Int32Array(8);
    this.fb = room * 0.28 + 0.7; this.d1 = damp * 0.4; this.d2 = 1 - this.d1;
    this.w1 = 0.5 + width / 2; this.w2 = (1 - width) / 2;
    this.pre = new Float64Array(Math.round(0.022 * SR)); this.pi = 0;      // преддилэй 22 мс
    this.aLP = 1 - Math.exp((-TAU * 6000) / SR); this.aHP = 1 - Math.exp((-TAU * 180) / SR); this.lp = 0; this.hp = 0;
  }
  // Посыл inL/inR → отражения прибавляются к outL/outR
  process(inL, inR, outL, outR, N, wet) {
    const B = 4096, inp = new Float64Array(B), aL = new Float64Array(B), aR = new Float64Array(B);
    const g1 = wet * this.w1 * 3, g2 = wet * this.w2 * 3;
    for (let b0 = 0; b0 < N; b0 += B) {
      const n = Math.min(B, N - b0);
      let lp = this.lp, hp = this.hp, pi = this.pi;
      const pre = this.pre, pl = pre.length;
      for (let i = 0; i < n; i++) {                        // вход: моно, полоса 180 Гц – 6 кГц
        lp += this.aLP * ((inL[b0 + i] + inR[b0 + i]) * 0.5 - lp);
        hp += this.aHP * (lp - hp);
        inp[i] = pre[pi] * 0.03;
        pre[pi] = lp - hp;
        if (++pi >= pl) pi = 0;
        aL[i] = 0; aR[i] = 0;
      }
      this.lp = lp; this.hp = hp; this.pi = pi;
      this.combs(0, inp, aL, n); this.combs(1, inp, aR, n);
      this.aps(0, aL, n); this.aps(1, aR, n);
      for (let i = 0; i < n; i++) { outL[b0 + i] += aL[i] * g1 + aR[i] * g2; outR[b0 + i] += aR[i] * g1 + aL[i] * g2; }
    }
  }
  combs(ch, inp, acc, n) {
    const fb = this.fb, d1 = this.d1, d2 = this.d2;
    for (let c = 0; c < 8; c++) {
      const buf = this.c[ch][c], len = buf.length, j = ch * 8 + c;
      let idx = this.ci[j], fs = this.cf[j];
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        fs = y * d2 + fs * d1;
        buf[idx] = inp[i] + fs * fb;
        if (++idx >= len) idx = 0;
        acc[i] += y;
      }
      this.ci[j] = idx; this.cf[j] = fs;
    }
  }
  aps(ch, acc, n) {
    for (let a = 0; a < 4; a++) {
      const buf = this.a[ch][a], len = buf.length, j = ch * 4 + a;
      let idx = this.ai[j];
      for (let i = 0; i < n; i++) {
        const bo = buf[idx], x = acc[i];
        buf[idx] = x + bo * 0.5;
        acc[i] = bo - x;
        if (++idx >= len) idx = 0;
      }
      this.ai[j] = idx;
    }
  }
}

// ── Акценты по событиям (шина эффектов f*, посыл s*) ──────────────────────
// Коэффициенты фильтра TPT SVF записываются в готовый массив (без выделения памяти в циклах)
function svfSet(o, fc, q) {
  const g = Math.tan((Math.PI * clamp(fc, 20, 20000)) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k));
  o[0] = a1; o[1] = g * a1; o[2] = g * g * a1; o[3] = k;
  return o;
}
const svf = (fc, q) => svfSet(new Float64Array(4), fc, q);
// Удар: саб-спад + «толчок» + шумовой всплеск в реверберацию + тёмный тональный удар по тонике
function fxHit(c, ev, rnd) {
  const s = clamp(ev.strength == null ? 0.7 : ev.strength, 0, 1);
  if (s <= 0) return;
  const a = Math.pow(s, 0.8) * LV.hit, n0 = Math.round(ev.t * SR), { N, fL, fR, sL, sR } = c;
  { // саб-спад 105 → 30 Гц
    const len = Math.round(2 * SR), nF = Math.round(0.3 * SR);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const n = n0 + i; if (n >= N) break;
      const t = i / SR;
      ph += (TAU * (30 + 75 * Math.exp(-t / 0.22))) / SR;
      let e = Math.exp(-t / 0.6);
      if (i < 192) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / 192);
      if (len - i < nF) e *= (len - i) / nF;
      const y = Math.sin(ph) * e * 0.5 * a;
      fL[n] += y; fR[n] += y;
    }
  }
  { // «толчок» 200 → 60 Гц
    const len = Math.round(0.35 * SR);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const n = n0 + i; if (n >= N) break;
      const t = i / SR;
      ph += (TAU * (60 + 140 * Math.exp(-t / 0.025))) / SR;
      let e = Math.exp(-t / 0.06) * (1 - i / len);
      if (i < 72) e *= i / 72;
      const y = Math.sin(ph) * e * 0.22 * a;
      fL[n] += y; fR[n] += y;
    }
  }
  { // шумовой всплеск: ФНЧ закрывается, основная часть — в реверберацию
    const len = Math.round(1.1 * SR), aHP = 1 - Math.exp((-TAU * 70) / SR);
    let l1 = 0, l2 = 0, r1 = 0, r2 = 0, hl = 0, hr = 0;
    const q = svf(1000, 0.6);
    for (let i = 0; i < len; i++) {
      const n = n0 + i; if (n >= N) break;
      const t = i / SR;
      if ((i & 31) === 0) svfSet(q, 180 + (1000 + 1200 * s) * Math.exp(-t / 0.25), 0.6);
      const a1 = q[0], a2 = q[1], a3 = q[2];
      let v3 = rnd() * 2 - 1 - l2, v1 = a1 * l1 + a2 * v3, v2 = l2 + a2 * l1 + a3 * v3;
      l1 = 2 * v1 - l1; l2 = 2 * v2 - l2; const yl0 = v2;
      v3 = rnd() * 2 - 1 - r2; v1 = a1 * r1 + a2 * v3; v2 = r2 + a2 * r1 + a3 * v3;
      r1 = 2 * v1 - r1; r2 = 2 * v2 - r2; const yr0 = v2;
      hl += aHP * (yl0 - hl); hr += aHP * (yr0 - hr);
      let e = Math.exp(-t / 0.15) * (1 - i / len) * a;
      if (i < 144) e *= i / 144;
      const yl = (yl0 - hl) * e, yr = (yr0 - hr) * e;
      fL[n] += yl * 0.12; fR[n] += yr * 0.12; sL[n] += yl * 0.5; sR[n] += yr * 0.5;
    }
  }
  { // тональный удар: пилы на тонике, квинте и октаве текущего аккорда через закрывающийся ФНЧ
    const r = 36 + c.chordAt(ev.t + 0.3).root, fr = [mtof(r), mtof(r + 7), mtof(r + 12)];   // звучит долго — берём наступающий аккорд
    const len = Math.round(2.6 * SR), nF = Math.round(0.3 * SR), inc = new Float64Array(6), ph = new Float64Array(6);
    for (let j = 0; j < 6; j++) { inc[j] = (fr[j >> 1] * Math.pow(2, (j & 1 ? 6 : -6) / 1200)) / SR; ph[j] = rnd(); }
    let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
    const q = svf(1000, 0.7);
    for (let i = 0; i < len; i++) {
      const n = n0 + i; if (n >= N) break;
      const t = i / SR;
      if ((i & 31) === 0) svfSet(q, 150 + (500 + 900 * s) * Math.exp(-t / 0.3), 0.7);
      let xl = 0, xr = 0;
      for (let j = 0; j < 6; j++) {
        const p = ph[j], d = inc[j];
        let y = 2 * p - 1;
        if (p < d) { const x = p / d; y -= x + x - x * x - 1; } else if (p > 1 - d) { const x = (p - 1) / d; y -= x * x + x + x + 1; }
        ph[j] = p + d >= 1 ? p + d - 1 : p + d;
        if (j & 1) xr += y; else xl += y;
      }
      const a1 = q[0], a2 = q[1], a3 = q[2];
      let v3 = xl - l2, v1 = a1 * l1 + a2 * v3, v2 = l2 + a2 * l1 + a3 * v3;
      l1 = 2 * v1 - l1; l2 = 2 * v2 - l2; const yl0 = v2;
      v3 = xr - r2; v1 = a1 * r1 + a2 * v3; v2 = r2 + a2 * r1 + a3 * v3;
      r1 = 2 * v1 - r1; r2 = 2 * v2 - r2; const yr0 = v2;
      let e = Math.exp(-t / 0.7) * 0.045 * a;
      if (i < 384) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / 384);
      if (len - i < nF) e *= (len - i) / nF;
      const yl = yl0 * e, yr = yr0 * e;
      fL[n] += yl; fR[n] += yr; sL[n] += yl * 0.35; sR[n] += yr * 0.35;
    }
  }
}
// Пролёт на смене сцены: полосовой шум с движением частоты и панорамы, пик — в момент t
function fxWhoosh(c, ev, rnd) {
  const T = 0.75, P = 0.45, up = P / T, { N, fL, fR, sL, sR } = c;
  const n0 = Math.round((ev.t - P) * SR), len = Math.round(T * SR);
  const qb = svf(500, 0.7), ql = svf(5500, 0.7), q = svf(350, 0.9);  // «тело» пролёта и срез верхов (без шипения)
  let b1 = 0, b2 = 0, q1 = 0, q2 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < len; i++) {
    const n = n0 + i; if (n >= N) break;
    const u = i / len;
    if ((i & 31) === 0) svfSet(q, u < up ? 350 * Math.pow(2200 / 350, u / up) : 2200 * Math.pow(800 / 2200, (u - up) / (1 - up)), 0.9);
    const x = rnd() * 2 - 1;
    let v3 = x - b2, v1 = q[0] * b1 + q[1] * v3, v2 = b2 + q[1] * b1 + q[2] * v3;
    b1 = 2 * v1 - b1; b2 = 2 * v2 - b2; const bp = q[3] * v1;
    v3 = x - q2; v1 = qb[0] * q1 + qb[1] * v3; v2 = q2 + qb[1] * q1 + qb[2] * v3;
    q1 = 2 * v1 - q1; q2 = 2 * v2 - q2;
    v3 = bp + 0.4 * v2 - w2; v1 = ql[0] * w1 + ql[1] * v3; v2 = w2 + ql[1] * w1 + ql[2] * v3;
    w1 = 2 * v1 - w1; w2 = 2 * v2 - w2;
    if (n < 0) continue;
    const e = u < up ? Math.pow(Math.sin((Math.PI / 2) * (u / up)), 2) : Math.pow(Math.cos((Math.PI / 2) * ((u - up) / (1 - up))), 2);
    const pan = -0.7 + 1.4 * u, y = v2 * e * LV.whoosh, yl = y * panL(pan), yr = y * panR(pan);
    fL[n] += yl; fR[n] += yr; sL[n] += yl * 0.3; sR[n] += yr * 0.3;
  }
}
// Нарастание к моменту t: полосовой шум вверх + «обратное» нарастание нот текущего аккорда
function fxRiser(c, ev, rnd) {
  const dur = clamp(ev.dur == null ? 1.5 : ev.dur, 0.2, 12), { N, fL, fR, sL, sR } = c;
  const n1 = Math.round(ev.t * SR), n0 = Math.max(0, Math.round((ev.t - dur) * SR)), len = n1 - n0;
  if (len <= 0) return;
  const r = 60 + c.chordAt(Math.max(0, ev.t - 0.05)).root, tones = [r, r + 7, r + 12];
  const gl = [0, -0.45, 0.45].map(panL), gr = [0, -0.45, 0.45].map(panR);
  const cw = tones.map((m) => Math.cos((TAU * mtof(m)) / SR)), sw = tones.map((m) => Math.sin((TAU * mtof(m)) / SR));
  const tc = [1, 1, 1], ts = [0, 0, 0], nF = Math.round(0.02 * SR), aLP = 1 - Math.exp((-TAU * 7000) / SR);
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0, nl = 0, nr = 0;
  const q = svf(250, 1.3);
  for (let i = 0; i < len; i++) {
    const n = n0 + i; if (n >= N) break;
    const x = i / len;
    if ((i & 31) === 0) svfSet(q, 250 * Math.pow(3500 / 250, x), 1.3);
    let v3 = rnd() * 2 - 1 - l2, v1 = q[0] * l1 + q[1] * v3, v2 = l2 + q[1] * l1 + q[2] * v3;
    l1 = 2 * v1 - l1; l2 = 2 * v2 - l2; nl += aLP * (q[3] * v1 - nl);   // полоса + срез верхов
    v3 = rnd() * 2 - 1 - r2; v1 = q[0] * r1 + q[1] * v3; v2 = r2 + q[1] * r1 + q[2] * v3;
    r1 = 2 * v1 - r1; r2 = 2 * v2 - r2; nr += aLP * (q[3] * v1 - nr);
    let fade = 1;
    if (len - i < nF) fade = 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / nF);
    const eN = Math.pow(x, 2.2) * 0.07 * fade * LV.riser, eT = x * x * x * 0.05 * fade * LV.riser;
    let tl = 0, tr = 0;
    for (let j = 0; j < 3; j++) {
      const cc = tc[j], ss = ts[j], y = ss + 0.25 * 2 * ss * cc;
      tl += y * gl[j]; tr += y * gr[j];
      tc[j] = cc * cw[j] - ss * sw[j]; ts[j] = ss * cw[j] + cc * sw[j];
    }
    const yl = nl * eN + tl * eT, yr = nr * eN + tr * eT;
    fL[n] += yl; fR[n] += yr; sL[n] += yl * 0.2; sR[n] += yr * 0.2;
  }
}
// Светлый перелив: четыре ноты текущего аккорда в 5–6-й октаве вверх
function fxSparkle(c, ev) {
  const ch = c.chordAt(ev.t), notes = [];
  for (let m = 79; m <= 98 && notes.length < 4; m++) if (ch.pcs.includes(m % 12)) notes.push(m);
  const pans = [-0.35, -0.1, 0.15, 0.4], vels = [0.8, 0.9, 1, 0.85];
  notes.forEach((m, k) => pluck(c.bus, c.N, ev.t + 0.055 * k, mtof(m), LV.sparkle * vels[k], 0.45, pans[k], 0.0015, 0.5, 0, 0.25, 0.08, 0));
}
// Мягкий низкий «отказ»: две приглушённые ноты вниз (D3 → B2) с лёгким уходом высоты
function fxDeny(c, ev) {
  pluck(c.bus, c.N, ev.t, mtof(50), LV.deny * 0.85, 0.17, -0.1, 0.012, 0.2, 0, 0.35, 0.12, -0.3);
  pluck(c.bus, c.N, ev.t + 0.17, mtof(47), LV.deny, 0.2, 0.1, 0.012, 0.2, 0, 0.35, 0.12, -0.3);
}
// Тихие тики часов восьмыми в течение dur
function fxTicks(c, ev) {
  const dur = clamp(ev.dur == null ? 1.5 : ev.dur, 0.1, 30), step = BEAT / 2;
  for (let k = 0; k * step < dur - 1e-6; k++)
    mixSample(c.bus, c.N, c.tick[k % 2], ev.t + k * step, LV.ticks * lerp(0.75, 1, (k * step) / dur), k % 2 ? 0.15 : -0.15, 0.2);
}
// Финальный аккорд D add9: нарастание, затем долгое затухание; к t+dur — тишина
function fxSwell(c, ev, rnd, total) {
  const dur = clamp(ev.dur == null ? total - ev.t : ev.dur, 0, total - ev.t), { N, fL, fR, sL, sR } = c;
  if (dur < 0.3) return;
  const rise = clamp(0.32 * dur, Math.min(1.2, dur * 0.5), 4), tau = Math.max(0.25, (dur - rise) / 4.2);
  const n0 = Math.round(ev.t * SR), len = Math.min(N - n0, Math.round(dur * SR)), nF = Math.round(Math.min(0.6, dur * 0.2) * SR);
  const mids = [50, 57, 64, 66, 69, 74], NV = 12;          // D3 A3 E4 F#4 A4 D5, по две пилы на ноту
  const inc = new Float64Array(NV), ph = new Float64Array(NV);
  for (let j = 0; j < NV; j++) { inc[j] = (mtof(mids[j >> 1]) * Math.pow(2, (j & 1 ? 7 : -7) / 1200)) / SR; ph[j] = rnd(); }
  const wSub = (TAU * mtof(38)) / SR, wA = (TAU * mtof(81)) / SR, wD = (TAU * mtof(86)) / SR;
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
  const q = svf(500, 0.7);
  for (let i = 0; i < len; i++) {
    const n = n0 + i, t = i / SR;
    let e = t < rise ? Math.pow(smooth(t / rise), 1.5) : Math.exp(-(t - rise) / tau);
    if (len - i < nF) e *= 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / nF);
    if ((i & 31) === 0) svfSet(q, 500 + 2600 * e, 0.7);
    let xl = 0, xr = 0;
    for (let j = 0; j < NV; j++) {
      const p = ph[j], d = inc[j];
      let y = 2 * p - 1;
      if (p < d) { const x = p / d; y -= x + x - x * x - 1; } else if (p > 1 - d) { const x = (p - 1) / d; y -= x * x + x + x + 1; }
      ph[j] = p + d >= 1 ? p + d - 1 : p + d;
      if (j & 1) { xr += y; xl += 0.35 * y; } else { xl += y; xr += 0.35 * y; }
    }
    let v3 = xl - l2, v1 = q[0] * l1 + q[1] * v3, v2 = l2 + q[1] * l1 + q[2] * v3;
    l1 = 2 * v1 - l1; l2 = 2 * v2 - l2; const yl0 = v2;
    v3 = xr - r2; v1 = q[0] * r1 + q[1] * v3; v2 = r2 + q[1] * r1 + q[2] * v3;
    r1 = 2 * v1 - r1; r2 = 2 * v2 - r2; const yr0 = v2;
    const sub = Math.sin(wSub * i) * 0.18, sh = (Math.sin(wA * i) + Math.sin(wD * i)) * 0.012;
    const g = e * LV.swell, yl = (yl0 * 0.05 + sub + sh * 0.8) * g, yr = (yr0 * 0.05 + sub + sh * 1.2) * g;
    fL[n] += yl; fR[n] += yr; sL[n] += yl * 0.5; sR[n] += yr * 0.5;
  }
}

// ── Мастер: громкость BS.1770, истинный пик, лимитер ───────────────────────
// Интегральная громкость по ITU-R BS.1770-4 (K-фильтр 48 кГц, блоки 400 мс, стробирование)
function loudness(L, R, N) {
  const b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285, a1 = -1.69065929318241, a2 = 0.73248077421585;
  const c1 = -1.99004745483398, c2 = 0.99007225036621;
  const hop = SR / 10, nh = Math.floor(N / hop);
  if (nh < 4) return -Infinity;
  const pw = new Float64Array(nh), st = new Float64Array(16);
  for (let h = 0; h < nh; h++) {
    let acc = 0;
    for (let n = h * hop, e = n + hop; n < e; n++) {
      for (let ch = 0; ch < 2; ch++) {
        const o = ch * 8, x = ch ? R[n] : L[n];
        const y = b0 * x + b1 * st[o] + b2 * st[o + 1] - a1 * st[o + 2] - a2 * st[o + 3];
        st[o + 1] = st[o]; st[o] = x; st[o + 3] = st[o + 2]; st[o + 2] = y;
        const z = y - 2 * st[o + 4] + st[o + 5] - c1 * st[o + 6] - c2 * st[o + 7];
        st[o + 5] = st[o + 4]; st[o + 4] = y; st[o + 7] = st[o + 6]; st[o + 6] = z;
        acc += z * z;
      }
    }
    pw[h] = acc;
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z), zs = [];
  for (let i = 0; i + 3 < nh; i++) zs.push((pw[i] + pw[i + 1] + pw[i + 2] + pw[i + 3]) / (4 * hop));
  const g1 = zs.filter((z) => z > 0 && lk(z) > -70);
  if (!g1.length) return -Infinity;
  const rel = lk(g1.reduce((s, z) => s + z, 0) / g1.length) - 10;
  const g2 = g1.filter((z) => lk(z) > rel);
  return lk(g2.reduce((s, z) => s + z, 0) / g2.length);
}
// Истинный пик: интерполяция с 4-кратной передискретизацией (окно Блэкмана, 16 отводов на фазу)
const TP_FIR = [1, 2, 3].map((p) => {
  const row = new Float64Array(16);
  let s = 0;
  for (let j = 0; j < 16; j++) {
    const d = p / 4 - (j - 7);
    row[j] = (d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * (0.42 + 0.5 * Math.cos((Math.PI * d) / 8) + 0.08 * Math.cos((Math.PI * d) / 4));
    s += row[j];
  }
  for (let j = 0; j < 16; j++) row[j] /= s;
  return row;
});
function tpAt(x, n, N) {                                   // максимум |x| на отрезке [n; n+1)
  let m = Math.abs(x[n]);
  if (n < 7 || n + 8 >= N) return m;
  for (let p = 0; p < 3; p++) {
    const row = TP_FIR[p];
    let y = 0;
    for (let j = 0; j < 16; j++) y += row[j] * x[n - 7 + j];
    if (Math.abs(y) > m) m = Math.abs(y);
  }
  return m;
}
function truePeak(L, R, N) {
  let m = 0;
  for (let n = 0; n < N; n++) {
    const a = Math.max(Math.abs(L[n]), Math.abs(R[n]), n + 1 < N ? Math.max(Math.abs(L[n + 1]), Math.abs(R[n + 1])) : 0);
    if (a * 1.5 < m) continue;                             // межотсчётный пик не превышает соседей более чем в 1,5 раза
    m = Math.max(m, tpAt(L, n, N), tpAt(R, n, N));
  }
  return m;
}
// Лимитер с упреждением 6 мс по истинному пику: плавная атака, удержание 40 мс, восстановление 200 мс
function limiter(L, R, N, thr, gReq, gMin) {
  const W = Math.round(0.006 * SR), H = Math.round(0.04 * SR);
  gReq.fill(1); gMin.fill(1);
  let any = false;
  for (let n = 0; n < N; n++) {
    const a = Math.max(Math.abs(L[n]), Math.abs(R[n]), n + 1 < N ? Math.max(Math.abs(L[n + 1]), Math.abs(R[n + 1])) : 0);
    if (a < thr * 0.6) continue;
    const p = Math.max(tpAt(L, n, N), tpAt(R, n, N));
    if (p > thr) { gReq[n] = thr / p; any = true; }
  }
  if (!any) return 0;
  for (let n = 0; n < N; n++) {                            // минимум по окну «вперёд»
    const g = gReq[n];
    if (g < 1) for (let j = Math.max(0, n - W + 1); j <= n; j++) if (gMin[j] > g) gMin[j] = g;
  }
  const aRel = 1 - Math.exp(-1 / (0.2 * SR));
  let sum = W, g = 1, minG = 1, hold = 0;
  for (let n = 0; n < N; n++) {                            // сглаживание окном W: усиление успевает упасть к пику
    sum += gMin[n] - (n >= W ? gMin[n - W] : 1);
    const gs = sum / W;
    if (gs <= g) { g = gs; hold = H; }                     // атака
    else if (hold > 0) hold--;                             // удержание: близкие пики — одним ослаблением
    else { const rel = g + (1 - g) * aRel; g = rel < gs ? rel : gs; }
    L[n] *= g; R[n] *= g;
    if (g < minG) minG = g;
  }
  return -20 * Math.log10(minG);
}
// Фильтр ВЧ 2-го порядка (Баттерворт) — убирает постоянную составляющую и инфразвук
function highpass(x, N, fc) {
  const w = (TAU * fc) / SR, al = Math.sin(w) / Math.SQRT2, cs = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, b2 = b0, a1 = (-2 * cs) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < N; n++) {
    const v = x[n], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[n] = y;
  }
}

// ── Главная функция ────────────────────────────────────────────────────────
/**
 * Рендер подложки по timeline. Возвращает [L, R] (Float32Array); в свойстве info — замеры.
 * opts (для отладки): layers — список слоёв ('pad','bass','arp','kick','hat','ticks','tension','fx' или 'fx:<вид>'),
 * raw — без нормализации и лимитера, noDuck — без приглушения под речь.
 */
function renderMusic(timeline, opts = {}) {
  const tl = normalizeTimeline(timeline);
  const N = Math.ceil(tl.total * SR), NC = Math.ceil(N / CR) + 2;
  const A = arrange(tl);
  const use = (name) => !opts.layers || opts.layers.includes(name) || (name.startsWith('fx:') && opts.layers.includes('fx'));
  const mL = new Float32Array(N), mR = new Float32Array(N);   // шина музыки
  const fL = new Float32Array(N), fR = new Float32Array(N);   // шина акцентов
  const sL = new Float32Array(N), sR = new Float32Array(N);   // посыл в реверберацию
  const tL = new Float32Array(N), tR = new Float32Array(N);   // временная шина
  const cv = sceneCurves(A, NC), M = { mL, mR, sL, sR };
  const warnings = [];

  // Подложка
  if (use('pad')) { renderPad(A.pad, tL, tR, N, mulberry32(SEED + 1)); padFilter(tL, tR, M, cv, N); }
  if (use('arp')) {
    tL.fill(0); tR.fill(0);
    const bus = { L: mL, R: mR, sL, sR, dL: tL, dR: tR };
    for (const nt of A.arp) pluck(bus, N, nt.t, mtof(nt.midi), nt.amp * LV.arp, nt.tau, nt.pan, 0.003, SEND.arp, SEND.arpDelay, 0.32, 0.13, 0);
    pingPong(tL, tR, M, N);
  }
  if (use('bass')) renderBass(A.bass, M, cv.bassGain, N);
  const mBus = { L: mL, R: mR, sL, sR };
  if (use('kick')) { const kick = makeKick(); for (const k of A.kick) mixSample(mBus, N, kick, k.t, k.amp * LV.kick, 0, SEND.kick); }
  if (use('hat')) {
    const hr = mulberry32(SEED + 2), hats = [makeHat(hr), makeHat(hr), makeHat(hr)];
    for (const h of A.hat) mixSample(mBus, N, hats[h.k], h.t, h.amp * LV.hat, 0.3, SEND.hat);
  }
  const tr = mulberry32(SEED + 3), ticks = [makeTick(2100, tr), makeTick(1650, tr)];
  if (use('ticks')) for (const k of A.tick) mixSample(mBus, N, ticks[k.k], k.t, k.amp * LV.tick, k.k ? 0.2 : -0.2, SEND.tick);
  if (use('tension')) renderTension(A.tension, M, N);
  new Freeverb(0.82, 0.45, 1).process(sL, sR, mL, mR, N, REV_WET.music);

  // Акценты
  sL.fill(0); sR.fill(0);
  const dEnd = chord('Dadd9');
  const ctx = { N, fL, fR, sL, sR, tick: ticks, bus: { L: fL, R: fR, sL, sR },
    chordAt: (t) => (t >= A.stopT ? dEnd : segAt(A.segs, t).ch) };
  A.events.forEach((ev, i) => {
    if (!use('fx:' + ev.kind)) return;
    const r = mulberry32(SEED + 1000 + 7919 * i);
    switch (ev.kind) {
      case 'hit': fxHit(ctx, ev, r); break;
      case 'whoosh': fxWhoosh(ctx, ev, r); break;
      case 'riser': fxRiser(ctx, ev, r); break;
      case 'sparkle': fxSparkle(ctx, ev); break;
      case 'deny': fxDeny(ctx, ev); break;
      case 'ticks': fxTicks(ctx, ev); break;
      case 'swell': fxSwell(ctx, ev, r, tl.total); break;
      default: warnings.push('неизвестное событие «' + ev.kind + '» в ' + ev.t + ' с пропущено');
    }
  });
  new Freeverb(0.86, 0.4, 1).process(sL, sR, fL, fR, N, REV_WET.fx);

  // Сведение с приглушением под речь
  const { gM, gF } = duckCurves(tl.speech, NC, opts.noDuck);
  for (let n = 0; n < N; n++) {
    const k = n >> 6, fr = (n & 63) / 64;
    const gm = gM[k] + (gM[k + 1] - gM[k]) * fr, gf = gF[k] + (gF[k + 1] - gF[k]) * fr;
    mL[n] = mL[n] * gm + fL[n] * gf;
    mR[n] = mR[n] * gm + fR[n] * gf;
  }
  highpass(mL, N, 18); highpass(mR, N, 18);
  const nIn = Math.min(N, Math.round(0.01 * SR)), nOut = Math.min(N, Math.round(Math.min(1.5, tl.total * 0.05) * SR));
  for (let i = 0; i < nIn; i++) { mL[i] *= i / nIn; mR[i] *= i / nIn; }
  for (let i = 0; i < nOut; i++) { const g = Math.pow(Math.sin(((Math.PI / 2) * i) / nOut), 2), n = N - 1 - i; mL[n] *= g; mR[n] *= g; }

  const out = [mL, mR];
  out.info = { warnings, total: tl.total, samples: N };
  if (opts.raw) { out.info.lufs = loudness(mL, mR, N); return out; }

  // Нормализация к −20 LUFS, лимитер по истинному пику, мягкое tanh-ограничение как страховка
  const thr = Math.pow(10, TP_LIMIT_DB / 20);
  const scale = (g) => { for (let n = 0; n < N; n++) { mL[n] *= g; mR[n] *= g; } };
  const lufsRaw = loudness(mL, mR, N);
  let gain = isFinite(lufsRaw) ? Math.pow(10, (TARGET_LUFS - lufsRaw) / 20) : 1;
  scale(gain);
  let gr = limiter(mL, mR, N, thr, tL, tR);
  let lufs = loudness(mL, mR, N);
  if (isFinite(lufs) && Math.abs(TARGET_LUFS - lufs) > 0.05) {
    const g2 = Math.pow(10, (TARGET_LUFS - lufs) / 20);
    scale(g2); gain *= g2;
    gr = Math.max(gr, limiter(mL, mR, N, thr, tL, tR));
    lufs = loudness(mL, mR, N);
  }
  const knee = thr, span = Math.pow(10, -3.1 / 20) - knee;
  let peak = 0, dcL = 0, dcR = 0;
  for (let n = 0; n < N; n++) {
    for (let ch = 0; ch < 2; ch++) {
      const x = ch ? mR[n] : mL[n], ax = Math.abs(x);
      if (ax > knee) { const y = Math.sign(x) * (knee + span * Math.tanh((ax - knee) / span)); if (ch) mR[n] = y; else mL[n] = y; }
    }
    peak = Math.max(peak, Math.abs(mL[n]), Math.abs(mR[n]));
    dcL += mL[n]; dcR += mR[n];
  }
  Object.assign(out.info, { lufs, gainDb: 20 * Math.log10(gain), limiterDb: gr, peakDb: 20 * Math.log10(peak || 1e-9),
    truePeakDb: 20 * Math.log10(truePeak(mL, mR, N) || 1e-9), dc: [dcL / N, dcR / N] });
  return out;
}

// ── Запись WAV (PCM 16 бит, стерео) ────────────────────────────────────────
function writeWav(path, L, R) {
  const n = L.length, bytes = n * 4, buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(bytes, 40);
  const q = (x) => { const v = Math.round(x * 32767); return v > 32767 ? 32767 : v < -32768 ? -32768 : v; };
  if ((buf.byteOffset + 44) % 2 === 0) {                   // быстрый путь: прямая запись 16-битных отсчётов
    const pcm = new Int16Array(buf.buffer, buf.byteOffset + 44, n * 2);
    for (let i = 0; i < n; i++) { pcm[2 * i] = q(L[i]); pcm[2 * i + 1] = q(R[i]); }
  } else for (let i = 0; i < n; i++) { buf.writeInt16LE(q(L[i]), 44 + 4 * i); buf.writeInt16LE(q(R[i]), 46 + 4 * i); }
  fs.writeFileSync(path, buf);
}

if (require.main === module) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) { console.error('Использование: node music.js <timeline.json> <out.wav>'); process.exit(1); }
  try {
    const t0 = Date.now();
    const out = renderMusic(JSON.parse(fs.readFileSync(inPath, 'utf8')));
    writeWav(outPath, out[0], out[1]);
    const i = out.info, f = (x, d = 1) => x.toFixed(d).replace('.', ',');
    for (const w of i.warnings) console.warn('Предупреждение: ' + w);
    console.log(`Готово: ${outPath} — ${f(i.total, 2)} с, ${i.samples} отсчётов, 48 кГц, стерео, 16 бит`);
    console.log(`Громкость ${f(i.lufs)} LUFS, истинный пик ${f(i.truePeakDb)} dBTP, пик ${f(i.peakDb)} dBFS, ` +
      `пост. составляющая ${i.dc.map((x) => x.toExponential(1)).join(' / ')}, лимитер до ${f(i.limiterDb)} дБ; ${f((Date.now() - t0) / 1000)} с`);
  } catch (e) {
    console.error('Ошибка: ' + e.message);
    process.exit(1);
  }
}

module.exports = { renderMusic };

// Движок анимационного ролика с закадровым голосом в фирменном стиле презентаций (навык agamora-video).
// Сценарий — отдельный модуль: тексты сцен, голос и функции отрисовки сцен (см. scenario.example.js). Движок даёт:
// синтез речи через OpenRouter (/api/v1/audio/speech) с кэшем, разметку речи по паузам и привязку анимации к словам,
// обложку первым кадром (превью в мессенджерах), шторки между сценами, субтитры, музыку (music.js) и сведение звука,
// контрольные кадры с автоматической проверкой вёрстки, рендер кадров в Chrome с передачей в ffmpeg без временных файлов.
// Запуск (в папке scripts, один раз: npm install):
//   node render_video.js --scenario путь/сценарий.js          — ролик (путь — в meta.output сценария или --out)
//   node render_video.js --scenario … --preview папка          — контрольные кадры, листы и проверка вёрстки, без видео
//   node render_video.js --scenario … --silent --preview папка — то же без синтеза речи (заглушка той же длины)
//   node render_video.js --scenario … --remux                  — пересобрать только звук в готовом ролике
//   --model elevenlabs/eleven-v4 --voice jessica               — модель и голос синтеза (иначе — из сценария)
// Ключ OpenRouter — одной строкой в ~/secrets/openrouter.key (читается программно, не печатается).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { once } = require("events");
const puppeteer = require("puppeteer-core");
const ffmpeg = require("ffmpeg-static");

const W = 1920, H = 1080, FPS = 30, SR = 24000, LEAD = 700, TAIL = 1500;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SC_PATH = path.resolve(arg("--scenario") || path.join(__dirname, "scenario.example.js"));
const SCN = require(SC_PATH), META = SCN.meta || {};
const SCENES = JSON.parse(JSON.stringify(SCN.scenes));
const OUT = path.resolve(arg("--out") || path.join(path.dirname(SC_PATH), META.output || "video.mp4"));
const PREVIEW = arg("--preview");
const AUDIO = path.join(path.dirname(SC_PATH), "audio");
const MODEL = arg("--model") || (SCN.voice && SCN.voice.model) || "elevenlabs/eleven-v4";
const VOICE = arg("--voice") || (SCN.voice && SCN.voice.voice) || "jessica";
const DECK = path.join(__dirname, "..", "..", "agamora-presentations");   // шрифты и бренды навыка презентаций

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  const p = list.find((x) => fs.existsSync(x));
  if (!p) throw new Error("Не найден Chrome или Edge: укажите путь в переменной CHROME_PATH");
  return p;
}

// ── озвучка: OpenRouter /audio/speech (ElevenLabs, MiniMax и др.), ответ mp3 → pcm 24 кГц моно, кэш по тексту, модели и голосу ──
function wavHeader(bytes, sr = SR, ch = 1) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + bytes, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2 * ch, 28);
  h.writeUInt16LE(2 * ch, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(bytes, 40);
  return h;
}
async function synth(text) {
  const key = fs.readFileSync(path.join(os.homedir(), "secrets", "openrouter.key"), "utf8").trim();
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST", signal: AbortSignal.timeout(180000), headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text, voice: VOICE, response_format: "mp3" }) });
  const mp3 = Buffer.from(await res.arrayBuffer());
  if (!res.ok || mp3.length < 2000) throw new Error("OpenRouter: " + res.status + " " + mp3.toString("utf8").slice(0, 300));
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", String(SR), "pipe:1"], { input: mp3, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("ffmpeg не смог разобрать ответ синтеза");
  return r.stdout;
}
const SPLIT = /(?<=[.!?])\s+/;
const letters = (x) => (x.match(/[\p{L}\p{N}]/gu) || []).length;
async function voice() {
  if (process.argv.includes("--silent")) {   // проверка картинки без синтеза: тон по 70 мс на букву, пауза между предложениями
    for (const s of SCENES) {
      const chunks = [];
      for (const p of (s.say || s.sub) ? (s.say || s.sub).split(SPLIT) : []) {
        const n = Math.round(letters(p) * 0.07 * SR), b = Buffer.alloc((n + Math.round(0.45 * SR)) * 2);
        for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 200 * i) / SR)), i * 2);
        chunks.push(b);
      }
      s.pcm = Buffer.concat(chunks);
    }
    return;
  }
  fs.mkdirSync(AUDIO, { recursive: true });
  let num = 0;
  const jobs = SCENES.map((s) => {
    const text = (s.say || s.sub || "").replace(/\u2011/g, "-");
    if (!text) { s.pcm = Buffer.alloc(0); return null; }
    const base = path.join(AUDIO, String(++num).padStart(2, "0"));
    return async () => {
      const hash = crypto.createHash("sha1").update([MODEL, VOICE, text].join("\n")).digest("hex");
      if (!(fs.existsSync(base + ".wav") && fs.existsSync(base + ".txt") && fs.readFileSync(base + ".txt", "utf8").startsWith(hash))) {
        let pcm = null;
        for (let n = 1; n <= 3 && !pcm; n++) {
          const p = await synth(text), rate = text.length / (p.length / 2 / SR);   // знаков в секунду — грубая проверка
          if (rate > 6 && rate < 26) pcm = p; else console.log(`  ${path.basename(base)}: подозрительный темп ${rate.toFixed(1)} зн/с, попытка ${n + 1}`);
        }
        if (!pcm) throw new Error("Не удалось получить озвучку: " + base);
        fs.writeFileSync(base + ".wav", Buffer.concat([wavHeader(pcm.length), pcm]));
        fs.writeFileSync(base + ".txt", `${hash}\n${MODEL} · ${VOICE}\n${text}\n`);
        console.log(`  ${path.basename(base)}: записано ${(pcm.length / SR / 2).toFixed(1)} с`);
      }
      s.pcm = fs.readFileSync(base + ".wav").subarray(44);
    };
  }).filter(Boolean);
  await Promise.all(Array.from({ length: 3 }, async () => { while (jobs.length) await jobs.shift()(); }));
}

// ── разметка речи: начало и конец, паузы, границы предложений (время от начала сцены) ──
function analyze(s) {
  if (!s.pcm.length) { s.sents = []; s.speechEnd = 0; s.end = 0; s.dur = s.min; s.gaps = 0; return; }
  const n = Math.floor(s.pcm.length / 2), win = SR / 50, rms = [];
  for (let i = 0; i + win <= n; i += win) {
    let e = 0;
    for (let j = 0; j < win; j++) { const v = s.pcm.readInt16LE((i + j) * 2); e += v * v; }
    rms.push(Math.sqrt(e / win));
  }
  const peak = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.98)];
  const loud = rms.map((v) => v > Math.max(120, peak * 0.07));
  const first = Math.max(0, loud.indexOf(true)), last = loud.lastIndexOf(true), gaps = [];
  for (let i = first, g = -1; i <= last; i++) {
    if (!loud[i]) { if (g < 0) g = i; } else { if (g >= 0 && i - g >= 7) gaps.push([g * 20, i * 20]); g = -1; }
  }
  const subs = s.sub.split(SPLIT), says = (s.say || s.sub).split(SPLIT);
  if (subs.length !== says.length) throw new Error(`Сцена «${s.type}»: в субтитрах и тексте диктора разное число предложений`);
  const L = says.map(letters), total = L.reduce((a, b) => a + b, 0), t0 = first * 20, t1 = (last + 1) * 20, cut = [];
  let acc = 0, prev = t0;
  for (let k = 1; k < says.length; k++) {
    acc += L[k - 1];
    const est = t0 + ((t1 - t0) * acc) / total, tol = Math.max(900, (t1 - t0) * 0.15);
    let best = [est, est], score = Infinity;
    for (const [ga, gb] of gaps) {
      const c = (ga + gb) / 2;
      if (ga <= prev + 200 || Math.abs(c - est) > tol) continue;
      const sc = Math.abs(c - est) - 2 * (gb - ga);
      if (sc < score) { score = sc; best = [ga, gb]; }
    }
    cut.push(best); prev = best[1];
  }
  s.sents = says.map((say, k) => ({ say, sub: subs[k], a: LEAD + (k ? cut[k - 1][1] : t0), b: LEAD + (k < cut.length ? cut[k][0] : t1) }));
  s.speechEnd = t1;
  s.end = LEAD + t1;
  s.dur = Math.max(s.min, s.end + TAIL);
  s.gaps = gaps.length;
}

// ── фирменные цвета и элементы презентаций (deckkit/tokens.py), шрифт IBM Plex Sans и бренд: brand.json навыка презентаций
// (brands-local/<имя> или brands/<имя>) задаёт логотип и цвета по ролям палитры; meta.colors сценария — поверх бренда
function loadBrand(name) {
  for (const dir of ["brands-local", "brands"]) {
    const bj = path.join(DECK, dir, name || "", "brand.json");
    if (name && fs.existsSync(bj)) return { ...JSON.parse(fs.readFileSync(bj, "utf8")), dir: path.dirname(bj) };
  }
  if (name) console.log(`Бренд «${name}» не найден — нейтральная палитра без логотипа`);
  return {};
}
const BRAND = loadBrand(META.brand);
const ROLE = { primary: "navy", accent: "blue", light: "lblue", ink: "ink", body: "body", muted: "muted", rule: "rule", pale: "pale", tobe_zone: "est", risk: "red" };
const K = { navy: "#002D72", blue: "#0070BA", lblue: "#8CB8E0", ink: "#1A2433", body: "#3B4758", muted: "#5F6B7C", rule: "#D5DCE5",
  pale: "#F2F5F9", est: "#E3F2FB", red: "#B42318", redPale: "#F6DEDB", mid: "#0B4F94",
  ...Object.fromEntries(Object.entries(BRAND.colors || {}).filter(([k]) => ROLE[k]).map(([k, v]) => [ROLE[k], v])), ...(META.colors || {}) };
const asset = (p, mime) => (p && fs.existsSync(p) ? `data:${mime};base64,${fs.readFileSync(p).toString("base64")}` : "");
const LOGO = BRAND.logo ? path.join(BRAND.dir, BRAND.logo) : null;
K.logo = asset(LOGO, LOGO && /\.svg$/i.test(LOGO) ? "image/svg+xml" : "image/png");
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`;
const FONTS = [[400, "Regular"], [500, "Medium"], [600, "SemiBold"], [700, "Bold"]].map(([w, f]) => {
  const src = asset(path.join(DECK, "assets", "fonts", "ibm-plex-sans", `IBMPlexSans-${f}.ttf`), "font/ttf");
  return src ? `@font-face{font-family:Plex;font-weight:${w};src:url(${src}) format("truetype")}` : "";
}).join("");

const CSS = `${FONTS}*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:#fff;color:${K.ink};font-family:Plex,"Segoe UI",Arial,sans-serif}
#stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:50% 45%}
#kick{position:absolute;left:120px;top:58px;font-size:22px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${K.blue}}
#logo{position:absolute;right:120px;top:50px;height:42px}
#page{position:absolute;right:120px;bottom:40px;font-size:20px;font-weight:500;color:${K.muted}}
#sub{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);max-width:1400px;width:max-content;text-align:center;font-size:29px;
line-height:1.36;font-weight:500;color:${K.ink};background:${rgba(K.pale, 0.96)};padding:12px 30px;border-left:5px solid ${K.navy}}
#wipe{position:absolute;inset:0;pointer-events:none}#wipe i{position:absolute;inset:0}.w1{background:${K.blue}}.w2{background:${K.navy}}
#fade{position:absolute;inset:0;background:#fff;pointer-events:none}
.bx{position:absolute}.caps{text-transform:uppercase;letter-spacing:.12em;font-weight:600}
.num{font-feature-settings:"tnum" 1,"lnum" 1;letter-spacing:-.02em}
.odo{display:inline-flex;align-items:flex-start;line-height:1}.odd{display:inline-block;height:1em;overflow:hidden;line-height:1em}
.odd>span{display:block}.odc{display:inline-block;line-height:1em}
.mono{font-family:Consolas,"Cascadia Mono",monospace}`;

function pageMain(CFG, SCF) {
  const { SCENES, K: C } = CFG;
  // ── математика движения
  const cl = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));                                     // резкий старт, мягкая посадка
  const eio = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eb = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2));   // с лёгким перелётом
  const T = (lt, at, d) => cl((lt - at) / d);
  const P = (lt, at, d = 700) => eo(T(lt, at, d));
  const B = (lt, at, d = 700) => eb(T(lt, at, d));
  const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const f1 = (v) => v.toFixed(1), f3 = (v) => v.toFixed(3);
  // ── приёмы появления
  const op = (p) => `opacity:${f3(cl(p))}`;
  const up = (p, dy = 30) => `opacity:${f3(cl(p * 1.3))};transform:translateY(${f1((1 - p) * dy)}px)`;
  const sc = (p, s0 = 0.8) => `opacity:${f3(cl(p * 1.5))};transform:scale(${f3(lerp(s0, 1, p))})`;
  const wipeL = (p) => `clip-path:inset(0 ${f1(100 - 100 * cl(p))}% 0 0)`;
  const wipeU = (p) => `clip-path:inset(${f1(100 - 100 * cl(p))}% 0 0 0)`;
  const MASK = "overflow:hidden;padding-bottom:.16em;margin-bottom:-.16em";
  const mline = (h, p) => `<div style="${MASK}"><div style="transform:translateY(${f1((1 - p) * 112)}%)">${h}</div></div>`;
  const words = (text, lt, at, step = 60, d = 800) => text.split(" ").map((w, i) =>
    `<span style="display:inline-block;vertical-align:top;${MASK}"><span style="display:inline-block;transform:translateY(${f1((1 - P(lt, at + i * step, d)) * 112)}%)">${w}</span></span>`).join(" ");
  const caps = (t, c, s = 20) => `<span class="caps" style="font-size:${s}px;color:${c}">${t}</span>`;
  const svgL = (inner) => `<svg width="1920" height="1080" style="position:absolute;left:0;top:0;overflow:visible">${inner}</svg>`;
  // ── иконки презентаций (deckkit/icons.py)
  const ICO = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 20a6.5 6.5 0 0 0-2.6-5.2"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13h.01M15 13h.01M9.5 17h5"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>', plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>', check: '<path d="M20 6L9 17l-5-5"/>', flag: '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4.5L17 13H4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/>',
    layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>', shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>', checksq: '<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 11a13 13 0 0 1 11-8 13 13 0 0 1-8 11l-3 1-1-1z"/><circle cx="15" cy="9" r="1.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    play: '<path d="M7 4l13 8-13 8z"/>', mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' };
  const ic = (k, c, s = 40, w = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICO[k] || ""}</svg>`;
  // ── элементы слайда: плоская плашка, рамка с прорисовкой контура, ломаная стрелка, строка итогов, заголовок-сообщение
  const FILL = { navy: [C.navy, "#fff"], blue: [C.blue, "#fff"], pale: [C.pale, C.ink], white: ["#fff", C.ink], est: [C.est, C.ink], red: [C.redPale, C.red] };
  const plate = (x, y, w, h, kind, inner, st = "") => `<div class="bx" style="left:${f1(x)}px;top:${f1(y)}px;width:${w}px;height:${h}px;background:${FILL[kind][0]};color:${FILL[kind][1]};${st}">${inner}</div>`;
  const frame = (x, y, w, h, p, c = C.navy, dash = false, fill = "#fff", inner = "", sw = 2) => {
    const per = 2 * (w + h);
    return `<div class="bx" style="left:${f1(x)}px;top:${f1(y)}px;width:${w}px;height:${h}px;background:${fill};opacity:${f3(cl(p * 3))}"></div>`
      + `<svg class="bx" width="${w}" height="${h}" style="left:${f1(x)}px;top:${f1(y)}px;overflow:visible"><rect x="${sw / 2}" y="${sw / 2}" width="${w - sw}" height="${h - sw}" fill="none" stroke="${c}" stroke-width="${sw}"`
      + (dash ? ` stroke-dasharray="7 5" opacity="${f3(cl(p * 1.5))}"/>` : ` stroke-dasharray="${per}" stroke-dashoffset="${f1(per * (1 - p))}"/>`) + "</svg>"
      + `<div class="bx" style="left:${f1(x)}px;top:${f1(y)}px;width:${w}px;height:${h}px;${up(cl((p - 0.45) / 0.55), 10)}">${inner}</div>`;
  };
  const conn = (pts, p, c = C.navy, w = 2, arrow = true, dash = "") => {
    if (p <= 0) return "";
    let len = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
    let rest = len * cl(p);
    const out = [pts[0]];
    for (let i = 1; i < pts.length && rest > 0; i++) {
      const k = Math.min(1, rest / seg[i - 1]);
      out.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]);
      rest -= seg[i - 1];
    }
    let h = `<polyline points="${out.map((q) => q.map(f1).join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    if (arrow && p >= 0.98) {
      const [ax, ay] = pts[pts.length - 1], [bx, by] = pts[pts.length - 2], a = Math.atan2(ay - by, ax - bx), r = 11;
      h += `<path d="M${f1(ax)} ${f1(ay)} L${f1(ax - r * Math.cos(a - 0.45))} ${f1(ay - r * Math.sin(a - 0.45))} L${f1(ax - r * Math.cos(a + 0.45))} ${f1(ay - r * Math.sin(a + 0.45))}z" fill="${c}"/>`;
    }
    return h;
  };
  const STRIP = Array.from({ length: 30 }, (_, i) => i % 10).join("<br>");
  const ndig = (s) => [...s].filter((c) => c >= "0" && c <= "9").length;
  const land = (at, s, d = 1300) => at + 90 * (ndig(s) - 1) + 0.55 * d;          // «посадка» последней цифры — момент удара в музыке
  const odo = (s, lt, at, d = 1300) => {                                           // счётчик-барабан: цифры прокручиваются и встают на место
    let k = 0;
    const n = ndig(s);
    return `<span class="odo">` + [...s].map((c) => {
      if (c < "0" || c > "9") return `<span class="odc">${c === " " ? "&#8239;" : c}</span>`;
      const i = k++, p = eo(T(lt, at + i * 90, d)), idx = (+c + 10 * (1 + ((n - i) % 2))) * p, bl = 2.2 * (1 - p) * (1 - p);
      return `<span class="odd"><span style="transform:translateY(${(-idx).toFixed(3)}em);filter:blur(${bl.toFixed(2)}px)">${STRIP}</span></span>`;
    }).join("") + "</span>";
  };
  const head = (t, lt, at, top = 98) => `<div style="position:absolute;left:120px;top:${top}px;width:1600px;font-size:52px;font-weight:700;line-height:1.15;color:${C.navy}">${words(t, lt, at)}</div>`;
  const summary = (y, cols, lt, at, big = 64) => {
    let h = `<div class="bx" style="left:120px;top:${y}px;width:1680px;height:3px;background:${C.navy};${wipeL(P(lt, at - 300, 900))}"></div>`;
    cols.forEach(([lab, val, sub, hi, ca], i) => {   // ca — своё время появления колонки (иначе по очереди от at)
      const x = 120 + i * 560, a = ca != null ? ca : at + i * 280;
      if (i) h += `<div class="bx" style="left:${x - 14}px;top:${y + 24}px;width:2px;height:${big + 96}px;background:${C.rule};${op(P(lt, a, 500))}"></div>`;
      h += `<div class="bx" style="left:${x + (i ? 6 : 0)}px;top:${y + 22}px;width:540px;${up(P(lt, a, 700), 16)}"><div style="font-size:24px;font-weight:600;color:${C.ink}">${lab}</div>
        <div class="num" style="font-size:${big}px;font-weight:700;color:${hi ? C.blue : C.navy};line-height:1.1;margin-top:8px">${val}</div><div style="font-size:21px;color:${C.body};margin-top:8px">${sub}</div></div>`;
    });
    return h;
  };
  const L = { cl, lerp, eo, eio, eb, T, P, B, rnd, f1, f3, op, up, sc, wipeL, wipeU, mline, words, caps, svgL, ic, plate, frame, conn, odo, land, head, summary };
  const { R, EV } = SCF(L, C, CFG);   // сцены и звуковые события — из сценария

  // ── время сцен и привязка слов к речи
  const missing = new Set();
  const letters = (x) => (x.match(/[\p{L}\p{N}]/gu) || []).length;
  let TT = 0, chapterNo = 0;
  for (const s of SCENES) {
    s.t0 = TT; TT += s.dur; s.t1 = TT;
    if (s.chapter) s.no = ++chapterNo;
    const offs = [], memo = new Map();
    let full = "";
    s.sents.forEach((x) => { offs.push(full.length); full += x.say.toLowerCase() + " "; });
    s.Q = (word) => {   // момент, когда диктор произносит слово (время от начала сцены)
      if (memo.has(word)) return memo.get(word);
      const i = full.indexOf(word.toLowerCase());
      let t = s.end;
      if (i < 0) missing.add(s.type + ": " + word);
      else { let k = offs.length - 1; while (offs[k] > i) k--; const x = s.sents[k]; t = x.a + ((x.b - x.a) * letters(full.slice(offs[k], i))) / Math.max(1, letters(x.say)); }
      memo.set(word, t);
      return t;
    };
  }
  window.TOTAL = TT;
  window.sceneInfo = () => SCENES.map((s) => [s.t0, s.dur, s.end, s.sents.length, s.type]);
  window.missingCues = () => [...missing];
  window.timeline = () => {
    const ev = [];
    SCENES.forEach((s, i) => {
      if (i > 0) ev.push({ t: s.t0 / 1000, kind: "whoosh" });
      for (const e of EV[s.type] ? EV[s.type](s.Q, s.dur, s.end) : []) ev.push({ ...e, t: (s.t0 + e.t) / 1000, ...(e.dur ? { dur: e.dur / 1000 } : {}) });
    });
    return { total: TT / 1000, scenes: SCENES.map((s) => ({ type: s.music || s.type, t0: s.t0 / 1000, t1: s.t1 / 1000 })),
      speech: SCENES.filter((s) => s.sents.length).map((s) => [(s.t0 + s.sents[0].a) / 1000, (s.t0 + s.end) / 1000]), events: ev.sort((a, b) => a.t - b.t) };
  };
  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), sub = $("sub"), w1 = $("w1"), w2 = $("w2"), wipe = $("wipe"), chapters = SCENES.filter((x) => x.chapter).length;
  if (CFG.K.logo) $("logo").src = CFG.K.logo;
  window.renderAt = (t) => {
    const idx = SCENES.findIndex((x) => t >= x.t0 && t < x.t1), s = SCENES[idx < 0 ? SCENES.length - 1 : idx], lt = t - s.t0;
    stage.innerHTML = R[s.type](lt, s.dur, s.Q, s.end);
    stage.style.transform = `scale(${f3(1 + 0.015 * cl(lt / s.dur))})`;           // лёгкий наезд камеры
    $("kick").textContent = s.chapter ? `${String(s.no).padStart(2, "0")} · ${s.chapter}` : "";
    $("page").textContent = s.chapter ? `${s.no} / ${chapters}` : "";
    $("logo").style.display = CFG.K.logo && !s.noLogo ? "block" : "none";
    let cur = null;
    if (s.chapter) s.sents.forEach((x, k) => { const nx = s.sents[k + 1]; if (lt >= x.a - 120 && lt < (nx ? nx.a - 120 : x.b + 700)) cur = x; });
    sub.style.display = cur ? "block" : "none";
    if (cur) sub.textContent = cur.sub;
    // шторка на смене сцен: синяя и тёмно-синяя полосы закрывают кадр к моменту смены и уходят
    const HW = 480;
    let wb = -1;
    for (let i = 1; i < SCENES.length; i++) if (Math.abs(t - SCENES[i].t0) < HW) wb = i;
    if (wb > 0) {
      const u = (t - (SCENES[wb].t0 - HW)) / (2 * HW), mir = wb % 2 === 0;
      const rect = (a, b) => { const L2 = mir ? 1920 - b : a, R2 = mir ? 1920 - a : b; return `inset(0 ${f1(1920 - R2)}px 0 ${f1(L2)}px)`; };
      const lay = (a0, a1, b0, b1) => (u < 0.5 ? rect(lerp(1920, 0, eio(cl((u - a0) / (a1 - a0)))), 1920) : rect(0, lerp(1920, 0, eio(cl((u - b0) / (b1 - b0))))));
      w1.style.clipPath = lay(0, 0.42, 0.58, 1); w2.style.clipPath = lay(0.08, 0.5, 0.5, 0.92);
      wipe.style.display = "block";
    } else wipe.style.display = "none";
    $("fade").style.opacity = f3(cl((t - (TT - 800)) / 800));   // первый кадр — обложка без затемнения; в конце — уход в белое
  };
}

// проверка вёрстки кадра: выход текста за кадр, наезд текста на текст и на субтитр (невидимое и обрезанное пропускаем)
function checkLayout() {
  const out = new Set(), st = document.getElementById("stage").getBoundingClientRect(), sb = document.getElementById("sub");
  const rs = sb.style.display === "none" ? null : sb.getBoundingClientRect(), leaves = [];
  const vis = (el) => { let o = 1; for (let e = el; e && e.id !== "stage"; e = e.parentElement) { const cs = getComputedStyle(e); o *= +cs.opacity; if (cs.clipPath && /inset\(100%|inset\(0px 100%|inset\(0px 0px 0px 100%/.test(cs.clipPath)) return 0; } return o; };
  for (const el of document.querySelectorAll("#stage *")) {
    if (el.closest("svg") || el.closest(".odo")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || vis(el) < 0.05) continue;
    const name = (el.textContent || "").trim().slice(0, 34) || el.tagName;
    if (!(el.textContent.trim() && [...el.children].every((c) => c.tagName === "BR"))) continue;
    if (r.right > st.right + 2 || r.bottom > st.bottom + 2 || r.left < st.left - 2) out.add(`выходит за кадр: «${name}»`);
    if (rs && r.bottom > rs.top && r.top < rs.bottom && r.right > rs.left && r.left < rs.right) out.add(`под субтитром: «${name}»`);
    const k = 0.18 * r.height;
    leaves.push([{ left: r.left, right: r.right, top: r.top + k, bottom: r.bottom - k }, name]);
  }
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const [a, n1] = leaves[i], [b, n2] = leaves[j];
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) out.add(`текст наезжает: «${n1}» и «${n2}»`);
  }
  return [...out].slice(0, 15);
}

const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div id="stage"></div><div id="kick"></div><img id="logo" alt=""><div id="page"></div><div id="sub"></div>
<div id="wipe"><i class="w1" id="w1"></i><i class="w2" id="w2"></i></div><div id="fade"></div></body></html>`;

// звук: голос (24 кГц моно) + музыка и акценты из music.js; сведение отдельным проходом в файл ровно на длительность ролика
function buildAudio(total, tlPath) {
  const pcm = Buffer.alloc(Math.ceil((total / 1000) * SR) * 2);
  let t0 = 0;
  for (const s of SCENES) {
    if (s.pcm.length) {
      const len = Math.min(s.pcm.length, Math.round(((s.speechEnd + 300) / 1000) * SR) * 2);
      s.pcm.subarray(0, len).copy(pcm, Math.round(((t0 + LEAD) / 1000) * SR) * 2);
    }
    t0 += s.dur;
  }
  const wav = path.join(os.tmpdir(), "agamora_video_voice.wav"), mus = path.join(os.tmpdir(), "agamora_video_music.wav"), mix = path.join(os.tmpdir(), "agamora_video_mix.wav");
  fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length), pcm]));
  let music = false;
  const gen = path.join(__dirname, "music.js");
  if (META.music !== false && fs.existsSync(gen)) {
    const r = spawnSync(process.execPath, [gen, tlPath, mus], { stdio: "inherit" });
    music = r.status === 0 && fs.existsSync(mus);
    if (!music) console.log("Музыка не собрана — ролик будет только с голосом");
  }
  const sec = (total / 1000).toFixed(3), VC = "aresample=48000,pan=stereo|c0=c0|c1=c0,loudnorm=I=-16:TP=-2:LRA=11,aresample=48000";
  const fc = (music ? `[0:a]${VC}[v];[1:a]aresample=48000,volume=0.63[m];[v][m]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89:level=false`
    : `[0:a]${VC}`) + `,apad=whole_dur=${sec},atrim=0:${sec}[a]`;
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", wav, ...(music ? ["-i", mus] : []), "-filter_complex", fc,
    "-map", "[a]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", mix], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg не смог свести звук");
  return { files: [wav, mus, mix], mix, music };
}

async function main() {
  console.log(`Сценарий: ${path.basename(SC_PATH)} · озвучка: ${process.argv.includes("--silent") ? "заглушка" : MODEL + " · " + VOICE}`);
  await voice();
  SCENES.forEach((s, i) => {
    analyze(s);
    console.log(`  сцена ${String(i + 1).padStart(2)} ${s.type}: ${(s.dur / 1000).toFixed(1)} с` + (s.sents.length ? `, речь ${(s.speechEnd / 1000).toFixed(1)} с` : ", без диктора"));
  });
  const cfg = { K, SCENES: SCENES.map(({ pcm, ...s }) => s) };
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
    args: ["--force-device-scale-factor=1", "--hide-scrollbars", "--font-render-hinting=none", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(PAGE, { waitUntil: "load" });
  await page.addScriptTag({ content: `(${pageMain.toString()})(${JSON.stringify(cfg)}, ${SCN.page.toString()});` });
  await page.evaluate(async () => { await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px Plex`))); await document.fonts.ready; });
  const total = await page.evaluate(() => window.TOTAL), tl = await page.evaluate(() => window.timeline());
  const frames = Math.ceil((total / 1000) * FPS);
  console.log(`Ролик: ${(total / 1000).toFixed(1)} с, ${frames} кадров, ${W}×${H}, ${FPS} кадров/с, звуковых событий ${tl.events.length}`);
  if (PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });
  const tlPath = path.join(PREVIEW || os.tmpdir(), "timeline.json");
  fs.writeFileSync(tlPath, JSON.stringify(tl, null, 1));

  if (PREVIEW) {
    const info = await page.evaluate(() => window.sceneInfo()), issues = [];
    let n = 0;
    for (const [i, [t0, d, end, ns, type]] of info.entries()) {
      for (const lt of type === "cover" ? [0, d * 0.85] : ns ? [d * 0.3, d * 0.62, Math.min(d - 600, end + 700)] : [d * 0.45, d * 0.85]) {
        await page.evaluate((x) => window.renderAt(x), t0 + lt);
        for (const m of await page.evaluate(checkLayout)) issues.push(`сцена ${i + 1}, ${(lt / 1000).toFixed(1)} с: ${m}`);
        await page.screenshot({ path: path.join(PREVIEW, `p${String(++n).padStart(2, "0")}.png`) });
      }
    }
    const miss = await page.evaluate(() => window.missingCues());
    await browser.close();
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-framerate", "1", "-i", path.join(PREVIEW, "p%02d.png"),
      "-vf", "scale=640:360,tile=3x3:padding=6:color=0x8a96a8", path.join(PREVIEW, "sheet%d.png")]);
    console.log(`Контрольные кадры: ${n}, листы и таймлайн — ${PREVIEW}`);
    console.log(miss.length ? "Не найдены слова для привязки: " + miss.join("; ") : "Привязка к речи: все слова найдены");
    console.log(issues.length ? "Замечания по вёрстке:\n" + issues.map((x) => "  ! " + x).join("\n") : "Вёрстка: замечаний нет");
    return;
  }

  const { files, mix, music } = buildAudio(total, tlPath);
  files.push(tlPath);
  if (process.argv.includes("--remux")) {   // только звук: голос и музыка заново, картинка из готового ролика без перекодирования
    await browser.close();
    const tmp = OUT.replace(/\.mp4$/i, ".remux.mp4");
    const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", OUT, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { stdio: "inherit" });
    for (const f of files) fs.rmSync(f, { force: true });
    if (r.status !== 0) throw new Error("ffmpeg не смог пересобрать звук");
    fs.renameSync(tmp, OUT);
    console.log(`Звук пересобран: ${OUT} · музыка: ${music ? "есть" : "нет"}`);
    return;
  }
  const ff = spawn(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-i", mix,
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
  const done = once(ff, "close");
  let closed = false;
  ff.on("close", () => { closed = true; });
  ff.stdin.on("error", () => {});
  const ts = Date.now();
  for (let i = 0; i < frames; i++) {
    if (closed) throw new Error("ffmpeg завершился раньше времени, кадр " + i);
    await page.evaluate((x) => window.renderAt(x), (i * 1000) / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await Promise.race([once(ff.stdin, "drain"), done]);   // если ffmpeg закрылся, не ждать вечно
    if (i % 900 === 0 || i === frames - 1) console.log(`  кадр ${i + 1} из ${frames} · ${((Date.now() - ts) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  const [code] = await done;
  await browser.close();
  for (const f of files) fs.rmSync(f, { force: true });
  if (code !== 0) throw new Error("ffmpeg завершился с кодом " + code);
  const info = spawnSync(ffmpeg, ["-hide_banner", "-i", OUT], { encoding: "utf8" }).stderr;
  const dur = (info.match(/Duration: ([\d:.]+)/) || [])[1], vid = (info.match(/Video: [^\n]+/) || [""])[0], aud = (info.match(/Audio: [^\n]+/) || [""])[0];
  if (!/1920x1080/.test(vid) || !/30 fps/.test(vid) || !aud) throw new Error("Проверка не пройдена: " + vid + " | " + aud);
  console.log(`Готово: ${OUT}\n  ${(fs.statSync(OUT).size / 1048576).toFixed(1)} МБ · длительность ${dur} · музыка: ${music ? "есть" : "нет"}`);
}

main().catch((e) => { console.error("Ошибка:", e.message); process.exit(1); });

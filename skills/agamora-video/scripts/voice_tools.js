// Подбор и проверка голоса для закадрового текста через OpenRouter (ключ — ~/secrets/openrouter.key, не печатается).
//   node voice_tools.js bench "фрагмент текста" [папка]  — записать фрагмент разными голосами и оценить их моделью-слушателем
//   node voice_tools.js judge папка_с_audio [01 04 …]    — прослушать готовые фрагменты озвучки (NN.wav + NN.txt из render_video.js)
// Оценщик — Gemini через OpenRouter (приём звука): естественность, тембр, русское произношение, паузы, дикция; ошибки ударений.
// Для запросов со звуком на балансе OpenRouter должно быть не меньше $0,50. Последнее слово — за человеком: склейте образцы и дайте послушать.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const key = fs.readFileSync(path.join(os.homedir(), "secrets", "openrouter.key"), "utf8").trim();
const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" }, JUDGE = process.env.JUDGE_MODEL || "~google/gemini-pro-latest";   // другой оценщик — переменной JUDGE_MODEL
// кандидаты: женские голоса, лучший по русскому произношению в сравнении 2026 года — elevenlabs/eleven-v4 · jessica
const VOICES = [["elevenlabs/eleven-v4", "jessica"], ["elevenlabs/eleven-v4", "lily"], ["elevenlabs/eleven-v4", "bella"], ["elevenlabs/eleven-v4", "sarah"],
  ["elevenlabs/eleven-v4", "alice"], ["elevenlabs/eleven-v4", "laura"], ["elevenlabs/eleven-v4", "matilda"], ["elevenlabs/eleven-v3", "alice"],
  ["minimax/speech-2.8-hd", "Russian_AmbitiousWoman"], ["minimax/speech-2.8-hd", "Russian_BrightHeroine"]];

async function tts(model, voice, input) {
  const r = await fetch("https://openrouter.ai/api/v1/audio/speech", { method: "POST", headers: H, body: JSON.stringify({ model, voice, input, response_format: "mp3" }) });
  const b = Buffer.from(await r.arrayBuffer());
  if (!r.ok || b.length < 2000) throw new Error(r.status + " " + b.toString("utf8").slice(0, 120));
  return b;
}
async function ask(prompt, audio, format) {
  let last = "";
  for (let n = 1; n <= 3; n++) {   // обрыв соединения или ответ оценщика без JSON (зацикленный текст) — повторить; не помогло — переписать фразу
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: H, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ model: JUDGE, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: audio.toString("base64"), format } }] }] }) });
      const j = await r.json();
      last = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || JSON.stringify(j).slice(0, 200));
      return JSON.parse(last.match(/\{[\s\S]*\}/)[0]);
    } catch (e) { last = last || e.message; }
  }
  return { error: last.slice(0, 160) };
}
async function pool(items, n, fn) { const q = [...items], out = []; await Promise.all(Array.from({ length: n }, async () => { while (q.length) out.push(await fn(q.shift())); })); return out; }

async function bench(text, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const res = await pool(VOICES.map((v, i) => [i, ...v]), 4, async ([i, model, voice]) => {
    try {
      const mp3 = await tts(model, voice, text), f = path.join(dir, `голос_${String(i + 1).padStart(2, "0")}.mp3`);
      fs.writeFileSync(f, mp3);
      const s = await ask(`Ты строгий эксперт по дикторской речи и русской фонетике. Прослушай запись. Текст: «${text}».
Оцени от 1 до 10: human — неотличимость от живого диктора; timbre — приятность тембра; ru — произношение и ударения, отсутствие акцента;
prosody — паузы на знаках препинания и интонация; diction — чёткость. Ответ строго JSON: {"human":N,"timbre":N,"ru":N,"prosody":N,"diction":N,"errors":"кратко"}`, mp3, "mp3");
      return { n: i + 1, model, voice, ...s, total: ["human", "timbre", "ru", "prosody", "diction"].reduce((a, k) => a + (+s[k] || 0), 0) };
    } catch (e) { return { n: i + 1, model, voice, total: -1, errors: e.message }; }
  });
  res.sort((a, b) => b.total - a.total || (b.ru || 0) - (a.ru || 0));
  for (const r of res) console.log(`${String(r.total).padStart(3)}  №${r.n} ${r.model} · ${r.voice}  [ест ${r.human} тембр ${r.timbre} рус ${r.ru} паузы ${r.prosody} дикция ${r.diction}]  ${String(r.errors || r.error || "").slice(0, 90)}`);
}
async function judge(dir, ids) {
  ids = ids.length ? ids : fs.readdirSync(dir).filter((f) => /^\d+\.wav$/.test(f)).map((f) => f.slice(0, -4)).sort();
  const res = await pool(ids, 5, async (id) => {
    const text = fs.readFileSync(path.join(dir, id + ".txt"), "utf8").split("\n").slice(2).join(" ").trim();
    const s = await ask(`Ты строгий редактор дикторской речи. Прослушай запись и сравни с текстом: «${text}».
Найди только реальные ошибки: неверные ударения, искажённые слова, пропуски, неестественные паузы или интонации. Оцени естественность от 1 до 10.
Ответ строго JSON: {"score":N,"errors":[{"word":"слово","problem":"кратко"}]}`, fs.readFileSync(path.join(dir, id + ".wav")), "wav");
    return { id, ...s };
  });
  res.sort((a, b) => a.id.localeCompare(b.id));
  for (const r of res) console.log(`${r.id}: ${r.score || "?"}/10  ` + (r.errors || []).map((e) => `«${e.word}» — ${e.problem}`).join("; ").slice(0, 400) + (r.error ? " " + r.error : ""));
}

const [cmd, a1, ...rest] = process.argv.slice(2);
if (cmd === "bench" && a1) bench(a1, rest[0] || path.join(process.cwd(), "голоса"));
else if (cmd === "judge" && a1) judge(a1, rest);
else console.log('Использование: node voice_tools.js bench "фрагмент" [папка] | judge папка_с_audio [01 04 …]');

// Демонстрационный сценарий навыка agamora-video: ролик, в котором навыки Агаморы представляют сами себя.
// Восемь сцен в стиле презентаций, бренд «Агамора» (цвета и логотип — brands/agamora/brand.json навыка презентаций).
// Как пользоваться: скопировать файл к материалам, заменить тексты, цифры и сцены, запустить
//   node render_video.js --scenario путь/сценарий.js --silent --preview папка   (картинка без синтеза речи)
// Правила текста диктора — в SKILL.md: без аббревиатур, мысль под картинку, числа словами, без риторических вопросов.
// Поля сцены: type — имя функции отрисовки; chapter — метка главы (появляются метка, номер и субтитры); min — минимальная
// длительность, мс; sub — субтитры; say — текст для синтеза, если отличается (числа словами); music — тип для music.js;
// noLogo — скрыть логотип в углу. Функция page выполняется в браузере: получает приёмы движка L и цвета C,
// возвращает функции сцен R и звуковые события EV. Q(слово) — момент, когда диктор произносит слово (мс от начала сцены).
module.exports = {
  meta: { title: "Агамора: презентации и ролики для руководства", output: "agamora-video-demo.mp4", brand: "agamora" },   // brand — папка в agamora-presentations/brands(-local)
  voice: { model: "elevenlabs/eleven-v4", voice: "jessica" },
  scenes: [
    { type: "cover", min: 2200, sub: "", music: "title" },
    { type: "title", min: 7500,
      sub: "Знакомьтесь, это Агамора. Два навыка для Claude Code. Первый делает презентации для руководства. Второй превращает их в ролик с голосом и музыкой.",
      say: "Знакомьтесь, это Агамора. Два навыка для Клод Кода. Первый делает презентации для руководства. Второй превращает их в ролик с голосом и музыкой." },
    { type: "problem", chapter: "Проблема", min: 10000,
      sub: "Шаблонную презентацию узнают с первого слайда. Пёстрые значки, градиенты, мелкий текст и громкие цифры без источника. Руководство возвращает такие слайды на доработку." },
    { type: "deck", chapter: "Презентации", min: 12000, music: "solution",
      sub: "Навык работает по своду из 85 правил. Каждое выросло из замечаний руководства. Слайд собирается из 61 готового компонента. Затем навык проверяет шрифт, контраст и перегруз на каждом слайде.",
      say: "Навык работает по своду из восьмидесяти пяти правил. Каждое выросло из замечаний руководства. Слайд собирается из шестидесяти одного готового компонента. Затем навык проверяет шрифт, контраст и перегруз на каждом слайде." },
    { type: "video", chapter: "Ролик", min: 11000, music: "roles",
      sub: "Из того же материала второй навык делает ролик. Сцены строятся из элементов слайдов. Голос диктора синтезируется и проверяется на слух. Музыка подстраивается под ключевые моменты." },
    { type: "brand", chapter: "Бренд", min: 10000, music: "principle",
      sub: "В начале работы навык спрашивает о вашем бренде. Цвета, шрифты и логотип он берёт из фирменного стиля компании. Поэтому материал выглядит как ваш, а не как шаблон." },
    { type: "effect", chapter: "Результат", min: 10000,
      sub: "На выходе получается готовый комплект. Файл для печати, редактируемая презентация и ролик в высоком разрешении. И всё это собирается одной командой." },
    { type: "outro", min: 10000, sub: "Вы задаёте смысл. Навык делает остальное. Попробуйте сами.", noLogo: true },
  ],
  page: function (L, C, CFG) {
    const { cl, lerp, eio, T, P, B, f1, f3, op, up, sc, wipeL, wipeU, mline, words, caps, svgL, ic, plate, frame, conn, odo, land, head, summary } = L;
    const unit = (t, s = 36) => `<span style="font-size:${s}px;letter-spacing:0"> ${t}</span>`;
    const logo = (h) => (CFG.K.logo ? `<img src="${CFG.K.logo}" style="height:${h}px;display:block">` : "");
    const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const mix = (a, b, p) => "#" + hx(a).map((v, i) => Math.round(lerp(v, hx(b)[i], cl(p))).toString(16).padStart(2, "0")).join("");

    // обложка: первый кадр и превью — титульный слайд с тремя цифрами; перед шторкой элементы уходят вверх
    function cover(lt, D) {
      const out = P(lt, D - 750, 600), st = (k) => `opacity:${f3(1 - out)};transform:translateY(${f1(-40 * out * (1 + 0.4 * k))}px)`;
      return `<div style="position:absolute;left:120px;top:190px;width:1600px;${st(0)}">${caps("Агамора · навыки для Claude Code", C.blue, 24)}
        <div style="font-size:92px;font-weight:700;line-height:1.05;letter-spacing:-.015em;color:${C.navy};margin-top:26px">Презентации<br>и ролики для руководства</div>
        <div style="height:8px;width:200px;background:${C.blue};margin-top:38px"></div>
        <div style="font-size:34px;color:${C.body};margin-top:30px">Дизайнерский дек в PDF и PPTX и ролик с голосом из того же материала</div></div>`
        + `<div style="${st(1)}">` + summary(700, [["Правила", "85", "из замечаний руководства"], ["Компоненты", "61", "схемы, графики, Гант, обложки", true],
          ["Ролик", "1080p", "с голосом и музыкой"]], lt, -10000, 64) + "</div>";
    }
    // заставка: название и два навыка — презентация и ролик из неё
    function title(lt, D, Q) {
      const a1 = Q("первый") - 150, a2 = Q("второй") - 150;
      let s = "", h = `<div style="position:absolute;left:120px;top:250px;width:860px">${mline(caps("Знакомьтесь", C.blue, 24), P(lt, 150, 900))}
        <div style="font-size:112px;font-weight:700;line-height:1.04;color:${C.navy};margin-top:26px">${mline("Агамора", P(lt, Q("агамора") - 200, 900))}</div>
        <div style="height:8px;width:${f1(200 * P(lt, Q("два навыка"), 900))}px;background:${C.blue};margin-top:40px"></div>
        <div style="font-size:42px;line-height:1.3;color:${C.body};margin-top:32px">${words("Два навыка для Claude Code", lt, Q("два навыка") - 100, 70)}</div></div>`;
      h += plate(1060, 270, 740, 190, "navy", `<div style="padding:36px 40px;display:flex;align-items:center;gap:30px">${ic("file", "#fff", 64, 1.5)}<div><div style="font-size:42px;font-weight:700">Презентации</div><div style="font-size:24px;color:${C.lblue};margin-top:6px">PDF и редактируемый PPTX</div></div></div>`, wipeL(P(lt, a1, 900)));
      s += conn([[1430, 472], [1430, 558]], P(lt, a2 - 450, 500));
      h += frame(1060, 570, 740, 190, P(lt, a2, 900), C.navy, false, "#fff", `<div style="padding:36px 40px;display:flex;align-items:center;gap:30px">${ic("play", C.navy, 64, 1.5)}<div><div style="font-size:42px;font-weight:700;color:${C.navy}">Ролик</div><div style="font-size:24px;color:${C.body};margin-top:6px">голос, музыка и обложка для превью</div></div></div>`);
      return svgL(s) + h;
    }
    // проблема: «шаблонный» слайд, ошибки обводятся в момент, когда о них говорит диктор, затем вердикт
    function problem(lt, D, Q) {
      const mx = 120, my = 250, MW = 860, MH = 484, back = P(lt, Q("возвращает") - 100, 700);
      const fl = [["Иконки в цветных квадратах", Q("пёстрые")], ["Градиенты и тени", Q("градиенты")], ["Мелкий текст и сноски", Q("мелкий")], ["Числа без источника", Q("громкие")]];
      const PAST = ["#F4B8A8", "#A8CDF4", "#B5E2B5", "#F4DDA0"], bar = (x, y, w, hh, c = "#D5D9E2") => `<div class="bx" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;background:${c};border-radius:${hh / 2}px"></div>`;
      let m = `<div class="bx" style="left:0;top:0;width:${MW}px;height:${MH}px;background:#fff;border:2px solid ${C.rule}"></div>`
        + `<div class="bx" style="left:24px;top:22px;width:${MW - 48}px;height:70px;background:linear-gradient(90deg,#8E9BD6,#D49AC8);border-radius:14px"></div>`
        + bar(48, 42, 300, 14, "rgba(255,255,255,.85)") + bar(48, 66, 180, 9, "rgba(255,255,255,.6)");
      for (let i = 0; i < 4; i++) {
        const x = 24 + i * 206;
        m += `<div class="bx" style="left:${x}px;top:116px;width:190px;height:150px;background:#F7F8FB;border-radius:16px;box-shadow:0 6px 14px rgba(40,40,80,.12)"></div>`
          + `<div class="bx" style="left:${x + 18}px;top:134px;width:56px;height:56px;background:${PAST[i]};border-radius:14px"></div>`
          + `<div class="bx" style="left:${x + 34}px;top:150px;width:24px;height:24px;border-radius:50%;background:#fff"></div>`
          + [0, 1, 2].map((j) => bar(x + 18, 208 + j * 16, 130 - j * 22 + (i % 2) * 14, 7, "#CDD2DC")).join("");
      }
      for (let j = 0; j < 8; j++) for (let c = 0; c < 2; c++) m += bar(24 + c * 250, 292 + j * 17, Math.round(200 + 30 * Math.sin(j * 1.7 + c)), 6);
      m += `<div class="bx" style="left:540px;top:286px;font-size:92px;font-weight:700;line-height:1.1;color:#E58FB0;letter-spacing:-.02em">+300%<span style="font-size:44px;vertical-align:top">*</span></div>`
        + bar(546, 404, 250, 6) + bar(546, 420, 190, 6) + bar(24, 452, 420, 5, "#E1E4EA");
      let h = head("Шаблонный дек узнают сразу", lt, Q("шаблонную") - 300)
        + `<div class="bx" style="left:${mx}px;top:${my}px;width:${MW}px;height:${MH}px;${sc(P(lt, Q("шаблонную"), 900), 0.92)}"><div style="position:relative;width:100%;height:100%;opacity:${f3(1 - 0.6 * back)}">${m}</div></div>`;
      let s = "";
      [[24, 116, 812, 150], [24, 22, 812, 70], [24, 286, 470, 140], [534, 282, 300, 150]].forEach(([x, y, w, hh], i) => {   // где каждая ошибка на макете
        const p = P(lt, fl[i][1] - 100, 600), per = 2 * (w + hh + 32);
        s += `<rect x="${mx + x - 8}" y="${my + y - 8}" width="${w + 16}" height="${hh + 16}" rx="10" fill="none" stroke="${C.red}" stroke-width="4" stroke-dasharray="${per}" stroke-dashoffset="${f1(per * (1 - p))}" opacity="${f3(cl(p * 4) * (1 - 0.5 * back))}"/>`;
      });
      let r = "";
      fl.forEach(([t, a], i) => {
        r += `<div class="bx" style="left:1080px;top:${290 + i * 100}px;display:flex;align-items:center;gap:22px;${up(P(lt, a - 100, 700), 18)}">${ic("x", C.red, 44, 2.2)}<span style="font-size:34px;font-weight:600;color:${C.ink}">${t}</span></div>`;
      });
      r += `<div class="bx" style="left:${mx + MW / 2 - 230}px;top:${my + 130}px;width:460px;height:116px;border:4px solid ${C.red};background:rgba(255,255,255,.95);display:flex;align-items:center;justify-content:center;${sc(B(lt, Q("возвращает"), 600), 0.6)}"><span class="caps" style="font-size:34px;color:${C.red};letter-spacing:.14em">На доработку</span></div>`
        + `<div class="bx" style="left:1080px;top:${290 + 4 * 100 + 24}px;width:700px;font-size:28px;color:${C.body};${up(P(lt, Q("возвращает"), 700), 14)}">Такие слайды руководство возвращает</div>`;
      return h + svgL(s) + r;
    }
    // презентации: два счётчика слева, справа слайд собирается из компонентов и проходит проверку
    function deck(lt, D, Q) {
      const stat = (y, lab, num, at, cap) => `<div class="bx" style="left:120px;top:${y}px;width:680px;${up(P(lt, at - 400, 700), 16)}">${caps(lab, C.blue, 20)}
        <div class="num" style="font-size:150px;font-weight:700;line-height:1;color:${C.navy};margin-top:10px">${odo(num, lt, at - 300, 1300)}</div>
        <div style="font-size:28px;color:${C.body};margin-top:12px">${cap}</div></div>`;
      let h = head("Каждый слайд собирается по правилам", lt, Q("навык") - 300)
        + stat(250, "Свод правил", "85", Q("восьмидесяти"), "правил, у каждого записана причина") + stat(560, "Библиотека", "61", Q("шестидесяти"), "компонент: схемы, графики, Гант, обложки");
      const x0 = 900, y0 = 250, SW = 900, SH = 506, a = Q("слайд собирается") - 100, scan = Q("затем");
      const piece = (k, pos, inner) => `<div class="bx" style="${pos};${up(P(lt, a + k * 260, 650), 14)}">${inner}</div>`;
      h += frame(x0, y0, SW, SH, P(lt, a - 500, 900), C.rule, false, "#fff", "", 2)
        + piece(0, `left:${x0 + 40}px;top:${y0 + 34}px`, caps("Эффект", C.blue, 15)) + piece(0, `left:${x0 + SW - 140}px;top:${y0 + 28}px`, logo(22))
        + piece(1, `left:${x0 + 40}px;top:${y0 + 62}px;width:${SW - 80}px`, `<div style="font-size:34px;font-weight:700;color:${C.navy};line-height:1.15">Переход окупается за 1,3 года</div>`)
        + piece(2, `left:${x0 + 40}px;top:${y0 + 150}px`, `<div class="num" style="font-size:120px;font-weight:700;color:${C.navy};line-height:1">1,3</div><div style="font-size:22px;color:${C.body};margin-top:8px">года до окупаемости</div>`);
      [0.38, 0.52, 0.66, 0.82, 1].forEach((v, i) => {   // столбики растут по очереди, последний выделен
        const bh = 230 * v * P(lt, a + 3 * 260 + i * 110, 700);
        h += `<div class="bx" style="left:${x0 + 420 + i * 88}px;top:${f1(y0 + 400 - bh)}px;width:62px;height:${f1(bh)}px;background:${i === 4 ? C.navy : C.lblue}"></div>`;
      });
      h += `<div class="bx" style="left:${x0 + 410}px;top:${y0 + 402}px;width:450px;height:2px;background:${C.muted};${wipeL(P(lt, a + 3 * 260, 600))}"></div>`
        + piece(5, `left:${x0 + 40}px;top:${y0 + 446}px`, `<div style="font-size:22px;font-weight:700;color:${C.ink}">Вывод одной фразой внизу слайда</div>`);
      const sp = T(lt, scan, 1200);
      if (sp > 0 && sp < 1) h += `<div class="bx" style="left:${x0}px;top:${f1(y0 + SH * eio(sp))}px;width:${SW}px;height:3px;background:${C.blue};opacity:.85"></div>`;
      [["Шрифт от 20 px", Q("шрифт")], ["Контраст", Q("контраст")], ["Без перегруза", Q("перегруз")]].forEach(([t, at], i) => {
        h += `<div class="bx" style="left:${x0 + i * 300}px;top:${y0 + SH + 34}px;display:flex;align-items:center;gap:14px;${up(P(lt, at - 50, 600), 12)}">${ic("check", C.blue, 40, 2.4)}<span style="font-size:28px;font-weight:600;color:${C.ink}">${t}</span></div>`;
      });
      return h;
    }
    // ролик: три карточки с живыми деталями (волна речи, доли такта) и плита «одна команда»
    function video(lt, D, Q) {
      const P3 = [["1 · Сцены", "layers", "Сцены из элементов слайдов", "карточки, схемы, цифры и дорожки", Q("сцены")],
        ["2 · Голос", "mic", "Голос с проверкой на слух", "модель-слушатель ищет ошибки ударений", Q("голос")],
        ["3 · Музыка", "music", "Музыка под ключевые моменты", "удары на появлении цифр", Q("музыка")]];
      let h = head("Тот же материал оживает в ролике", lt, Q("из того же") - 300);
      P3.forEach(([lab, k, t, sub, a], i) => {
        h += plate(120 + i * 570, 250, 540, 400, "pale", `<div style="padding:34px 36px"><div style="display:flex;justify-content:space-between;align-items:center">${caps(lab, C.blue, 20)}${ic(k, C.navy, 54, 1.5)}</div>
          <div style="font-size:36px;font-weight:600;line-height:1.2;color:${C.navy};margin-top:30px">${t}</div><div style="font-size:26px;color:${C.body};margin-top:18px;line-height:1.3">${sub}</div></div>`, wipeU(P(lt, a - 200, 900)));
      });
      const vp = P(lt, Q("голос") + 300, 600), mp = P(lt, Q("музыка") + 300, 600), beat = Math.floor(lt / 480) % 8;
      for (let j = 0; j < 36; j++) {
        const amp = (0.25 + 0.75 * Math.abs(Math.sin(j * 0.9 + lt / 140) * Math.sin(j * 0.37 + lt / 420))) * vp;
        h += `<div class="bx" style="left:${726 + j * 13}px;top:${f1(592 - 34 * amp)}px;width:6px;height:${f1(68 * amp + 2)}px;background:${C.blue};opacity:${f3(0.8 * cl(vp * 3))}"></div>`;
      }
      for (let j = 0; j < 8; j++) h += `<div class="bx" style="left:${1296 + j * 58}px;top:${j % 4 === 0 ? 556 : 590}px;width:40px;height:${j % 4 === 0 ? 70 : 36}px;background:${j === beat ? C.navy : C.lblue};${op(mp)}"></div>`;
      return h + plate(120, 700, 1680, 150, "navy", `<div style="padding:30px 40px;display:flex;align-items:center;gap:30px">${ic("play", "#fff", 60, 1.5)}
        <div><div style="font-size:42px;font-weight:700">Одна команда</div><div style="font-size:25px;color:${C.lblue};margin-top:6px">сценарий → контрольные кадры → MP4 с обложкой для превью</div></div></div>`, wipeL(P(lt, Q("ключевые") + 500, 1000)));
    }
    // бренд: один и тот же слайд перекрашивается в три палитры, логотип — только у своего бренда
    function brand(lt, D, Q) {
      const PAL = [{ name: "Агамора", n: C.navy, b: C.blue, l: C.lblue, bg: "#FFFFFF" }, { name: "Тёплый журнальный", n: "#12151C", b: "#B0430A", l: "#8FA6C8", bg: "#F3F0E8" },
        { name: "Графит и кобальт", n: "#1B2A41", b: "#2563B8", l: "#A5BCDD", bg: "#FFFFFF" }];
      const k1 = P(lt, Q("цвета") - 100, 900), k2 = P(lt, Q("фирменного") - 100, 900), k3 = P(lt, Q("как ваш") - 200, 900);
      const pick = (key) => mix(mix(mix(PAL[0][key], PAL[1][key], k1), PAL[2][key], k2), PAL[0][key], k3);
      const idx = k3 > 0.5 ? 0 : k2 > 0.5 ? 2 : k1 > 0.5 ? 1 : 0, lo = cl(1 - k1 + k3), n = pick("n"), b = pick("b"), l = pick("l");
      let h = head("Под ваш бренд, а не по шаблону", lt, Q("в начале") - 300);
      PAL.forEach((p, i) => {
        h += `<div class="bx" style="left:150px;top:${290 + i * 160}px;width:540px;${up(P(lt, Q("в начале") + 300 + i * 220, 700), 14)}">
          <div style="display:flex;gap:10px">${[p.n, p.b, p.l].map((c) => `<i style="display:block;width:58px;height:58px;background:${c}"></i>`).join("")}</div>
          <div style="font-size:30px;font-weight:${i === idx ? 700 : 500};color:${i === idx ? C.ink : C.muted};margin-top:14px">${p.name}</div></div>`;
      });
      h += `<div class="bx" style="left:120px;top:${f1(290 + 160 * idx)}px;width:6px;height:116px;background:${C.blue};${op(P(lt, Q("в начале") + 300, 700))}"></div>`;
      const x0 = 760, y0 = 250, SW = 1040, SH = 585, a = Q("в начале");
      h += `<div class="bx" style="left:${x0}px;top:${y0}px;width:${SW}px;height:${SH}px;background:${pick("bg")};border:2px solid ${C.rule};${sc(P(lt, a, 900), 0.94)}">
        <div class="bx" style="left:44px;top:40px">${caps("Эффект", b, 17)}</div>
        <div class="bx" style="right:44px;top:30px;opacity:${f3(lo)}">${logo(26)}</div>
        <div class="bx" style="right:44px;top:26px;padding:6px 14px;border:2px dashed ${b};font-size:18px;font-weight:600;color:${b};opacity:${f3(1 - lo)}">Ваш логотип</div>
        <div class="bx" style="left:44px;top:74px;font-size:40px;font-weight:700;color:${n}">Переход окупается за 1,3 года</div>
        <div class="bx" style="left:44px;top:178px"><div class="num" style="font-size:140px;font-weight:700;line-height:1;color:${n}">1,3</div><div style="font-size:24px;color:${C.body};margin-top:10px">года до окупаемости</div></div>
        ${[0.38, 0.52, 0.66, 0.82, 1].map((v, i) => `<div class="bx" style="left:${500 + i * 98}px;top:${f1(440 - 250 * v)}px;width:70px;height:${f1(250 * v)}px;background:${i === 4 ? n : l}"></div>`).join("")}
        <div class="bx" style="left:490px;top:442px;width:500px;height:2px;background:${C.muted}"></div>
        <div class="bx" style="left:0;top:${SH - 96}px;width:100%;height:96px;background:${n};color:#fff;font-size:26px;font-weight:600;padding:32px 44px">Предлагаем начать в первом квартале</div></div>`;
      return h;
    }
    // результат: строка итогов, каждая колонка — в момент, когда о ней говорит диктор
    function effect(lt, D, Q) {
      return head("Готовый комплект в вашем стиле", lt, Q("на выходе") - 200)
        + summary(330, [["Для печати", "PDF", "та же вёрстка на любом компьютере", false, Q("файл") - 250],
          ["Для правки", "PPTX", "родной текст и фигуры", true, Q("редактируемая") - 250],
          ["Ролик", odo("1080", lt, Q("высоком") - 300, 1300) + unit("p"), "30 кадров/с, громкость −16 LUFS", false, Q("ролик") - 250]], lt, Q("файл") - 250, 110)
        + `<div class="bx" style="left:120px;top:700px;display:flex;align-items:center;gap:26px;${up(P(lt, Q("одной командой") - 200, 700), 14)}">${ic("zap", C.blue, 52, 1.8)}<span style="font-size:40px;font-weight:700;color:${C.navy}">Одна команда от сценария до файлов</span></div>`;
    }
    // итог: девиз и финальная заставка с логотипом и адресом репозитория
    function outro(lt, D, Q) {
      const lock = P(lt, D - 3600, 900);
      return `<div style="position:absolute;left:120px;top:250px;font-size:104px;font-weight:700;line-height:1.08;opacity:${f3(1 - lock)}">`
        + [["Вы задаёте смысл.", "вы задаёте", C.navy], ["Навык делает остальное.", "навык делает", C.blue], ["Попробуйте сами.", "попробуйте", C.navy]].map(([t, w, c]) => mline(`<span style="color:${c}">${t}</span>`, P(lt, Q(w) - 120, 800))).join("") + "</div>"
        + `<div style="position:absolute;left:0;right:0;top:340px;text-align:center;${up(lock, 20)}">${CFG.K.logo ? `<img src="${CFG.K.logo}" style="height:84px">` : ""}
          <div style="font-size:54px;font-weight:700;color:${C.navy};margin-top:44px">Презентации и ролики для руководства</div>
          <div class="mono" style="font-size:30px;color:${C.body};margin-top:26px">github.com/agamoraviral/agamora-skill</div></div>`;
    }
    const EV = {
      cover: (Q, D) => [{ t: D, kind: "riser", dur: 1000 }],
      title: (Q) => [{ t: Q("агамора"), kind: "sparkle" }, { t: Q("второй") - 150, kind: "hit", strength: 0.4 }],
      problem: (Q) => [{ t: Q("возвращает"), kind: "deny" }],
      deck: (Q) => [{ t: land(Q("восьмидесяти") - 300, "85"), kind: "hit", strength: 0.7 }, { t: land(Q("шестидесяти") - 300, "61"), kind: "hit", strength: 0.6 },
        { t: Q("перегруз") + 200, kind: "sparkle" }],
      video: (Q) => [{ t: Q("ключевые") + 500, kind: "hit", strength: 0.5 }],
      brand: (Q) => [{ t: Q("цвета") - 100, kind: "whoosh" }, { t: Q("фирменного") - 100, kind: "whoosh" }, { t: Q("как ваш") - 200, kind: "sparkle" }],
      effect: (Q) => [{ t: land(Q("высоком") - 300, "1080"), kind: "riser", dur: 1500 }, { t: land(Q("высоком") - 300, "1080"), kind: "hit", strength: 0.9 }],
      outro: (Q, D, END) => [{ t: END, kind: "swell", dur: D - END }],
    };
    return { R: { cover, title, problem, deck, video, brand, effect, outro }, EV };
  },
};

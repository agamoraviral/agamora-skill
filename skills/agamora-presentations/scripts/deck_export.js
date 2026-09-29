/* deck_export.js — раскладка HTML-дека для экспорта в PPTX (вставляет export_pptx.py, в дек не входит).
 * Режимы (по хешу адреса):
 *   #export=layout — ждёт шрифты, обходит слайды, пишет раскладку в <script type="application/json" id="x-layout">
 *                    (для chrome --dump-dom --virtual-time-budget);
 *   #export=raster — те же правила классификации, затем после исходных слайдов добавляет по странице на каждый
 *                    «растровый остров» (всё скрыто visibility:hidden, кроме острова) — для --print-to-pdf.
 * Координаты — CSS-пиксели слайда 1600×900 от левого верхнего угла слайда.
 */
(function () {
  'use strict';
  var m = /export=(\w+)/.exec(location.hash || '');
  if (!m) return;
  var MODE = m[1];
  var SLIDE_SEL = 'section.slide';
  var SKIP_SVG = { defs: 1, marker: 1, clippath: 1, mask: 1, lineargradient: 1, radialgradient: 1, pattern: 1, symbol: 1,
                   title: 1, desc: 1, style: 1, script: 1, filter: 1, metadata: 1 };
  var REPLACED = { IMG: 1, SVG: 1, CANVAS: 1, VIDEO: 1, IFRAME: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1, OBJECT: 1, svg: 1 };
  var warnings = [];

  /* ---------- цвет ---------- */
  var cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
  var ctx = cvs.getContext('2d', { willReadFrequently: true });
  function hex2(v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase(); }
  function color(s, mul) {
    mul = mul === undefined ? 1 : mul;
    if (!s || s === 'transparent' || s === 'none') return null;
    var mm = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
    var r, g, b, a;
    if (mm) { r = +mm[1]; g = +mm[2]; b = +mm[3]; a = mm[4] === undefined ? 1 : (+mm[4]) / (mm[5] ? 100 : 1); }
    else { // oklch(), color(), lab() и т. п. — через пиксель холста
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data; if (!d[3]) return null;
      r = d[0] * 255 / d[3]; g = d[1] * 255 / d[3]; b = d[2] * 255 / d[3]; a = d[3] / 255;
    }
    a *= mul;
    if (a <= 0.003) return null;
    return { c: hex2(r) + hex2(g) + hex2(b), a: +a.toFixed(3) };
  }
  function px(v) { return parseFloat(v) || 0; }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------- шрифты ---------- */
  var famCache = {};
  function installed(fam) {
    var k = 'i:' + fam; if (k in famCache) return famCache[k];
    var t = 'Шрифт WwMmIl 1234567890 абвгд', res = false;
    ['monospace', 'serif'].forEach(function (gen) {
      ctx.font = '40px ' + gen; var w0 = ctx.measureText(t).width;
      ctx.font = '40px "' + fam + '", ' + gen; if (Math.abs(ctx.measureText(t).width - w0) > 0.01) res = true;
    });
    return (famCache[k] = res);
  }
  var faceFams = {};
  document.fonts.forEach(function (f) { if (f.status === 'loaded') faceFams[f.family.replace(/["']/g, '')] = 1; });
  function resolveFamily(list) {
    if (list in famCache) return famCache[list];
    var fams = list.split(',').map(function (s) { return s.trim().replace(/^["']|["']$/g, ''); });
    var out = fams[fams.length - 1];
    for (var i = 0; i < fams.length; i++) {
      var f = fams[i];
      if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+)$/.test(f)) { out = f; break; }
      if (faceFams[f] || installed(f)) { out = f; break; }
    }
    return (famCache[list] = out);
  }
  var metCache = {};
  function fontMetrics(cs) { // реальные ascent/descent, которыми Chrome строит строку
    var k = cs.fontStyle + '|' + cs.fontWeight + '|' + cs.fontSize + '|' + cs.fontFamily;
    if (metCache[k]) return metCache[k];
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var t = ctx.measureText('Hg');
    return (metCache[k] = { A: t.fontBoundingBoxAscent, D: t.fontBoundingBoxDescent });
  }
  function lineHeightPx(cs) {
    if (cs.lineHeight === 'normal') { var mt = fontMetrics(cs); return Math.round(mt.A) + Math.round(mt.D); }
    return px(cs.lineHeight);
  }
  function runStyle(cs, mul) {
    var ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing);
    var deco = cs.textDecorationLine || '';
    var mt = fontMetrics(cs);
    return { font: resolveFamily(cs.fontFamily), fontList: cs.fontFamily, size: px(cs.fontSize), weight: +cs.fontWeight || 400,
             italic: cs.fontStyle !== 'normal', color: color(cs.color, mul), ls: r2(ls),
             caps: cs.textTransform === 'uppercase' ? 'all' : (cs.fontVariantCaps === 'small-caps' ? 'small' : null),
             lower: cs.textTransform === 'lowercase', u: deco.indexOf('underline') >= 0, s: deco.indexOf('line-through') >= 0,
             tnum: (cs.fontVariantNumeric || '').indexOf('tabular-nums') >= 0,
             va: cs.verticalAlign === 'super' ? 'super' : (cs.verticalAlign === 'sub' ? 'sub' : null),
             A: r2(mt.A), D: r2(mt.D) };
  }

  /* ---------- геометрия ---------- */
  var slideBox = null;
  function rel(r) { return { x: r2(r.left - slideBox.left), y: r2(r.top - slideBox.top), w: r2(r.width), h: r2(r.height) }; }
  function parseMatrix(t) {
    if (!t || t === 'none') return null;
    var mm = /^matrix\(([^)]+)\)$/.exec(t);
    if (!mm) return { complex: true };
    var v = mm[1].split(',').map(Number);
    return { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] };
  }
  function rotationOnly(M) { // чистый поворот (без масштаба и сдвига формы)
    if (!M || M.complex) return null;
    var sx = Math.hypot(M.a, M.b), sy = Math.hypot(M.c, M.d);
    if (Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3 || Math.abs(M.a * M.c + M.b * M.d) > 1e-3) return null;
    return Math.atan2(M.b, M.a) * 180 / Math.PI;
  }
  function rotPt(p, o, deg) {
    var t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), dx = p[0] - o[0], dy = p[1] - o[1];
    return [r2(o[0] + dx * c - dy * s), r2(o[1] + dx * s + dy * c)];
  }
  function rotateItem(it, o, deg) { // повернуть уже снятый элемент вокруг точки o
    if (it.k === 'line') { var a = rotPt([it.x1, it.y1], o, deg), b = rotPt([it.x2, it.y2], o, deg); it.x1 = a[0]; it.y1 = a[1]; it.x2 = b[0]; it.y2 = b[1]; return; }
    if (it.k === 'poly') { it.pts = it.pts.map(function (p) { return rotPt(p, o, deg); }); return; }
    if (it.k === 'path') { it.segs.forEach(function (sg) { for (var i = 0; i < sg.p.length; i++) sg.p[i] = rotPt(sg.p[i], o, deg); }); return; }
    if (it.k === 'island') return;
    var c = rotPt([it.x + it.w / 2, it.y + it.h / 2], o, deg);
    var dx = c[0] - (it.x + it.w / 2), dy = c[1] - (it.y + it.h / 2);
    it.x = r2(it.x + dx); it.y = r2(it.y + dy); it.rot = r2((it.rot || 0) + deg);
    if (it.lines) it.lines.forEach(function (l) { l.top += dy; l.base += dy; l.left += dx; l.right += dx; });
  }

  /* ---------- порядок отрисовки (упрощённый CSS 2.1, приложение E) ---------- */
  var itemSeq = 0;
  function keyFlow(st) { return st.group.concat([1, ++itemSeq]); }

  /* ---------- классификация ---------- */
  function boxUnsupported(cs) { // что в собственной отрисовке блока не переводится в родные фигуры
    var why = [];
    var bi = cs.backgroundImage;
    if (bi && bi !== 'none') {
      if (!/^linear-gradient\(/.test(bi) || bi.indexOf('),') > 0 && /gradient\(.*gradient\(/.test(bi)) why.push('background-image');
    }
    if (cs.boxShadow !== 'none' && (/inset/.test(cs.boxShadow) || cs.boxShadow.split(/,(?![^(]*\))/).length > 1)) why.push('box-shadow');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') why.push('backdrop-filter');
    if (cs.outlineStyle !== 'none' && px(cs.outlineWidth) > 0) why.push('outline');
    ['::before', '::after'].forEach(function (pe) {
      var p = getComputedStyle(cs._el, pe);
      if (p.content && p.content !== 'none' && p.content !== 'normal' && p.display !== 'none') why.push(pe);
    });
    // разная толщина/цвет сторон при скруглении — не выразить
    var sides = ['Top', 'Right', 'Bottom', 'Left'].map(function (s) { return { w: px(cs['border' + s + 'Width']), st: cs['border' + s + 'Style'], c: cs['border' + s + 'Color'] }; });
    var uniform = sides.every(function (s) { return s.w === sides[0].w && s.st === sides[0].st && s.c === sides[0].c; });
    var rad = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(function (c) { return px(cs['border' + c + 'Radius']); });
    if (!uniform && rad.some(function (r) { return r > 0; }) && sides.some(function (s) { return s.w > 0 && s.st !== 'none'; })) why.push('border+radius');
    if (sides.some(function (s) { return s.w > 0 && /double|groove|ridge|inset|outset/.test(s.st); })) why.push('border-style');
    return why;
  }
  function subtreeUnsupported(el, cs) {
    var why = [];
    if (cs.filter !== 'none') why.push('filter');
    if (cs.maskImage && cs.maskImage !== 'none' || cs.webkitMaskImage && cs.webkitMaskImage !== 'none') why.push('mask');
    if (cs.mixBlendMode !== 'normal') why.push('blend');
    var M = parseMatrix(cs.transform);
    if (M && rotationOnly(M) === null) {
      // наклон/масштаб: пустой блок станет многоугольником, иначе — растр
      if (el.children.length || hasText(el)) why.push('transform');
    }
    if (cs.clipPath !== 'none') {
      if (!/^polygon\(/.test(cs.clipPath) || el.children.length || hasText(el)) why.push('clip-path');
    }
    if (el.tagName === 'CANVAS' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME' || el.tagName === 'OBJECT') why.push(el.tagName.toLowerCase());
    if (el.tagName === 'IMG' && /\.svg(\?|#|$)|^data:image\/svg/i.test(el.currentSrc || el.src)) why.push('svg-img');
    if (cs.writingMode && cs.writingMode !== 'horizontal-tb') why.push('writing-mode');
    return why;
  }
  function hasText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    return false;
  }

  /* ---------- снятие блока ---------- */
  function borderInfo(cs, mul) {
    var s = ['Top', 'Right', 'Bottom', 'Left'].map(function (k) {
      return { w: px(cs['border' + k + 'Width']), st: cs['border' + k + 'Style'], c: color(cs['border' + k + 'Color'], mul) };
    });
    s.forEach(function (x) { if (x.st === 'none' || x.st === 'hidden' || !x.c) x.w = 0; });
    return s;
  }
  function dashOf(st) { return st === 'dashed' ? 'dash' : (st === 'dotted' ? 'sysDot' : null); }
  function parseGradient(bi, mul) {
    // linear-gradient(90deg, rgb(..) 0%, rgb(..) 100%) — вычисленный стиль Chrome
    var body = bi.replace(/^linear-gradient\(/, '').replace(/\)$/, '');
    var parts = body.split(/,(?![^(]*\))/).map(function (s) { return s.trim(); });
    var ang = 180;
    if (/deg$/.test(parts[0])) { ang = parseFloat(parts.shift()); }
    else if (/^to /.test(parts[0])) {
      var t = parts.shift(); ang = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to right top': 45,
        'to bottom right': 135, 'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315 }[t];
      if (ang === undefined) ang = 180;
    }
    var stops = parts.map(function (p, i) {
      var mm = /^(.*\))\s*([\d.]+%)?$/.exec(p) || /^(\S+)\s*([\d.]+%)?$/.exec(p);
      return { col: color(mm ? mm[1] : p, mul), pos: mm && mm[2] ? parseFloat(mm[2]) / 100 : null };
    });
    stops.forEach(function (s, i) { if (s.pos === null) s.pos = stops.length > 1 ? i / (stops.length - 1) : 0; });
    if (stops.some(function (s) { return !s.col; })) return null;
    return { ang: ang, stops: stops.map(function (s) { return { c: s.col.c, a: s.col.a, pos: r2(s.pos) }; }) };
  }
  function shadowOf(cs, mul) {
    if (cs.boxShadow === 'none') return null;
    // "rgba(0, 45, 114, 0.18) 0px 12px 32px 0px"
    var s = cs.boxShadow, cm = /(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(s);
    var nums = s.replace(cm ? cm[0] : '', '').trim().split(/\s+/).map(px);
    var col = color(cm ? cm[0] : 'rgba(0,0,0,.3)', mul);
    if (!col) return null;
    return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, c: col.c, a: col.a };
  }
  function emitBox(el, cs, st, out, bb) {
    var mul = st.mul;
    var bg = color(cs.backgroundColor, mul);
    var grad = (cs.backgroundImage && /^linear-gradient\(/.test(cs.backgroundImage)) ? parseGradient(cs.backgroundImage, mul) : null;
    var sides = borderInfo(cs, mul);
    var shadow = shadowOf(cs, mul);
    if (!bg && !grad && !sides.some(function (s) { return s.w > 0; }) && !shadow) return;
    var r = bb;
    var rad = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(function (c) {
      var v = cs['border' + c + 'Radius'].split(' ')[0];
      return /%$/.test(v) ? parseFloat(v) / 100 * Math.min(r.w, r.h) : px(v);
    });
    var minSide = Math.min(r.w, r.h);
    rad = rad.map(function (v) { return Math.min(v, minSide / 2); });
    var uniform = sides.every(function (s) { return s.w === sides[0].w && (s.c && sides[0].c ? s.c.c === sides[0].c.c && s.c.a === sides[0].c.a : s.c === sides[0].c) && s.st === sides[0].st; });
    var geom = 'rect', adj = null;
    var allEq = rad.every(function (v) { return Math.abs(v - rad[0]) < 0.5; });
    if (allEq && rad[0] > 0.5) {
      if (Math.abs(r.w - r.h) < 0.5 && rad[0] >= minSide / 2 - 0.5) geom = 'ellipse';
      else { geom = 'roundRect'; adj = [r2(rad[0] / minSide)]; }
    } else if (!allEq) {
      if (Math.abs(rad[0] - rad[1]) < 0.5 && Math.abs(rad[2] - rad[3]) < 0.5) { geom = 'round2SameRect'; adj = [r2(rad[0] / minSide), r2(rad[3] / minSide)]; }
      else { warnings.push('скругление разных углов упрощено: ' + descr(el)); geom = 'roundRect'; adj = [r2(Math.max.apply(null, rad) / minSide)]; }
    }
    var item = { k: 'shape', geom: geom, adj: adj, x: r.x, y: r.y, w: r.w, h: r.h, fill: bg, grad: grad, line: null, shadow: shadow, key: st.ownKey || keyFlow(st), src: descr(el) };
    if (uniform && sides[0].w > 0) {
      var bw = sides[0].w; // линия PPTX — по оси контура; граница CSS — внутри рамки
      item.x = r2(r.x + bw / 2); item.y = r2(r.y + bw / 2); item.w = r2(r.w - bw); item.h = r2(r.h - bw);
      if (adj) item.adj = adj.map(function (v, i) { var rr = (i === 0 ? rad[0] : rad[3]) - bw / 2; return r2(Math.max(0, rr) / Math.min(item.w, item.h)); });
      item.line = { c: sides[0].c.c, a: sides[0].c.a, w: bw, dash: dashOf(sides[0].st) };
      out.push(item);
    } else {
      out.push(item);
      // отдельные стороны — тонкие прямоугольники (без скругления)
      var S = [['Top', r.x, r.y, r.w, sides[0].w], ['Right', r.x + r.w - sides[1].w, r.y, sides[1].w, r.h],
               ['Bottom', r.x, r.y + r.h - sides[2].w, r.w, sides[2].w], ['Left', r.x, r.y, sides[3].w, r.h]];
      S.forEach(function (sd, i) {
        if (sides[i].w <= 0) return;
        out.push({ k: 'shape', geom: 'rect', x: r2(sd[1]), y: r2(sd[2]), w: r2(sd[3]), h: r2(sd[4]), fill: sides[i].c, line: null, key: keyFlow(st), src: descr(el) + ' border-' + sd[0].toLowerCase() });
      });
    }
  }
  function descr(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''); }

  /* ---------- текст ---------- */
  function collectRuns(nodes, mul, runs, blockCs) {
    nodes.forEach(function (n) {
      if (n.nodeType === 3) {
        var cs = getComputedStyle(n.parentElement);
        var t = n.nodeValue;
        if (cs.whiteSpace.indexOf('pre') !== 0) t = t.replace(/[\t\n\r ]+/g, ' ');
        if (t) runs.push({ node: n, t: t, st: runStyle(cs, mul) });
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { runs.push({ br: true }); return; }
        var cs2 = getComputedStyle(n);
        if (cs2.display === 'none') return;
        // отступ слева у вложенного элемента («96 млн ₽» с margin-left у единицы) → пробел, иначе в PPTX слипнется
        var last = runs.length ? runs[runs.length - 1] : null;
        if (px(cs2.marginLeft) + px(cs2.paddingLeft) >= 3 && last && !last.br && !/\s$/.test(last.t))
          runs.push({ node: null, t: ' ', st: runStyle(cs2, mul) });
        collectRuns(Array.prototype.slice.call(n.childNodes), mul * (parseFloat(cs2.opacity) || 1), runs, blockCs);
      }
    });
  }
  function inlineBackgrounds(nodes, st, out) { // span с фоном внутри строки → прямоугольники под текстом
    nodes.forEach(function (n) {
      if (n.nodeType !== 1 || n.tagName === 'BR') return;
      var cs = getComputedStyle(n), bg = color(cs.backgroundColor, st.mul);
      if (bg) Array.prototype.forEach.call(n.getClientRects(), function (cr) {
        var r = rel(cr), rad = px(cs.borderTopLeftRadius);
        out.push({ k: 'shape', geom: rad > 0.5 ? 'roundRect' : 'rect', adj: rad > 0.5 ? [r2(Math.min(0.5, rad / Math.min(r.w, r.h)))] : null,
                   x: r.x, y: r.y, w: r.w, h: r.h, fill: bg, line: null, key: keyFlow(st), src: descr(n) + ' inline-bg' });
      });
      inlineBackgrounds(Array.prototype.slice.call(n.childNodes), st, out);
    });
  }
  function measureLines(runs) {
    // строки Chrome: жетон = слово с хвостовыми пробелами; новая строка — когда жетон ушёл левее и ниже предыдущего
    var lines = [], cur = null, prev = null, rg = document.createRange();
    runs.forEach(function (ru, ri) {
      if (ru.br) { if (cur) cur.brAfter = true; prev = null; return; }
      var re = /\S+\s*|\s+/g, mm;
      while ((mm = re.exec(ru.t)) !== null) {
        var tok = mm[0], word = tok.replace(/\s+$/, '');
        if (!word) { if (cur) cur.text += ' '; continue; }
        // смещения в исходном узле: нормализованные пробелы → ищем по исходной строке
        var src = ru.node.nodeValue, start = mapOffset(src, ru.t, mm.index);
        var end = mapOffset(src, ru.t, mm.index + word.length);
        rg.setStart(ru.node, start); rg.setEnd(ru.node, end);
        var rects = Array.prototype.filter.call(rg.getClientRects(), function (r) { return r.width > 0 || r.height > 0; });
        if (!rects.length) continue;
        for (var k = 0; k < rects.length; k++) {
          var r = rects[k];
          var newLine = !prev || (r.left < prev.right - 1 && r.top > prev.top + 1) || (prev && prev.forceBreak);
          if (newLine) { cur = { text: '', left: r.left, right: r.right, top: r.top, bottom: r.bottom, base: -1e9, segs: [] }; lines.push(cur); }
          cur.left = Math.min(cur.left, r.left); cur.right = Math.max(cur.right, r.right);
          cur.top = Math.min(cur.top, r.top); cur.bottom = Math.max(cur.bottom, r.bottom);
          cur.base = Math.max(cur.base, r.top + Math.round(ru.st.A));
          prev = { left: r.left, right: r.right, top: r.top };
        }
        cur.text += tok;
        cur.segs.push(ri);
      }
      if (runs[ri + 1] && runs[ri + 1].br) prev = { left: 1e9, right: 1e9, top: -1e9, forceBreak: true };
    });
    return lines;
  }
  function mapOffset(src, norm, i) { // индекс в нормализованной строке → индекс в исходной (схлопнутые пробелы)
    if (src === norm) return i;
    var si = 0, ni = 0;
    while (ni < i && si < src.length) {
      if (/[\t\n\r ]/.test(src[si])) { while (si < src.length && /[\t\n\r ]/.test(src[si])) si++; ni++; }
      else { si++; ni++; }
    }
    return si;
  }
  function emitText(nodes, host, hostCs, st, out, contentBox) {
    var runs = [];
    collectRuns(nodes, st.mul, runs, hostCs);
    var any = runs.some(function (r) { return !r.br && /\S/.test(r.t); });
    if (!any) return;
    inlineBackgrounds(nodes, st, out);
    var lines = measureLines(runs);
    if (!lines.length) return;
    // обрезать ведущие/хвостовые пробелы абзаца
    var firstTxt = runs.filter(function (r) { return !r.br; });
    firstTxt[0].t = firstTxt[0].t.replace(/^\s+/, '');
    firstTxt[firstTxt.length - 1].t = firstTxt[firstTxt.length - 1].t.replace(/\s+$/, '');
    var top = Math.min.apply(null, lines.map(function (l) { return l.top; }));
    var bottom = Math.max.apply(null, lines.map(function (l) { return l.bottom; }));
    var lh = lineHeightPx(hostCs);
    var align = { start: 'l', left: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just', '-webkit-center': 'ctr' }[hostCs.textAlign] || 'l';
    var wrap = !/nowrap|pre$/.test(hostCs.whiteSpace);
    var item = {
      k: 'text', x: r2(contentBox.x), y: r2(top - slideBox.top), w: r2(contentBox.w), h: r2(bottom - top), wrap: wrap,
      align: align, lh: r2(lh), indent: r2(px(hostCs.textIndent)), cb: { x: r2(contentBox.x), y: r2(contentBox.y), w: r2(contentBox.w), h: r2(contentBox.h) },
      runs: runs.map(function (r) { return r.br ? { br: true } : { t: r.t, s: r.st }; }).filter(function (r) { return r.br || r.t.length; }),
      lines: lines.map(function (l) { return { text: l.text.replace(/\s+$/, ''), left: r2(l.left - slideBox.left), right: r2(l.right - slideBox.left),
                                                top: r2(l.top - slideBox.top), base: r2(l.base - slideBox.top), bottom: r2(l.bottom - slideBox.top), br: !!l.brAfter }; }),
      key: keyFlow(st), src: descr(host)
    };
    // маркер списка
    if (hostCs.display === 'list-item' && hostCs.listStyleType !== 'none' && nodes[0] && nodes[0].parentNode === host) {
      var mk = getComputedStyle(host, '::marker');
      var ch = { disc: '•', circle: '◦', square: '▪' }[hostCs.listStyleType];
      ctx.font = hostCs.fontStyle + ' ' + hostCs.fontWeight + ' ' + hostCs.fontSize + ' ' + hostCs.fontFamily;
      var bw = ctx.measureText((ch || '0.') + ' ').width;
      item.bullet = ch ? { ch: ch, color: color(mk.color, st.mul), w: r2(bw) }
                       : { auto: 'arabicPeriod', start: listIndex(host), color: color(mk.color, st.mul), w: r2(bw) };
      item.x = r2(item.x - bw); item.w = r2(item.w + bw);
    }
    out.push(item);
  }
  function listIndex(li) { var i = 1; for (var p = li.previousElementSibling; p; p = p.previousElementSibling) if (p.tagName === 'LI') i++; return i; }

  /* ---------- SVG ---------- */
  function ctmOf(el) {
    var M = el.getScreenCTM();
    return function (x, y) { return [r2(M.a * x + M.c * y + M.e - slideBox.left), r2(M.b * x + M.d * y + M.f - slideBox.top)]; };
  }
  function ctmScale(el) { var M = el.getScreenCTM(); return Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)); }
  function ctmRot(el) { var M = el.getScreenCTM(); return Math.atan2(M.b, M.a) * 180 / Math.PI; }
  function ctmAxis(el) { var M = el.getScreenCTM(); return Math.abs(M.b) < 1e-6 && Math.abs(M.c) < 1e-6; }
  function svgPaint(cs, which, mul) {
    var v = cs[which];
    if (!v || v === 'none') return null;
    if (/url\(/.test(v)) return { unsupported: true };
    var op = parseFloat(cs[which + 'Opacity']); if (isNaN(op)) op = 1;
    return color(v, mul * op);
  }
  function svgLine(cs, mul, el) {
    var p = svgPaint(cs, 'stroke', mul);
    if (!p) return null;
    var sw = px(cs.strokeWidth) * ctmScale(el);
    var da = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[,\s]+/).map(px).map(function (v) { return r2(v * ctmScale(el)); }) : null;
    return { c: p.c, a: p.a, w: r2(sw), dashArr: da, cap: cs.strokeLinecap, join: cs.strokeLinejoin };
  }
  function markerInfo(el, cs, which) {
    var v = cs['marker' + which];
    if (!v || v === 'none') return null;
    var id = (/url\(["']?#([^"')]+)/.exec(v) || [])[1];
    var mk = id && document.getElementById(id);
    var w = mk ? px(mk.getAttribute('markerWidth') || 3) : 3;
    var units = mk ? mk.getAttribute('markerUnits') : null;
    var rel = units === 'userSpaceOnUse' ? w / (px(cs.strokeWidth) || 1) : w;
    return { type: 'triangle', size: rel <= 3 ? 'sm' : (rel <= 6 ? 'med' : 'lg') };
  }
  function visitSvg(svg, st, out, pending) {
    var mul0 = st.mul;
    function walk(node, mul) {
      Array.prototype.forEach.call(node.children, function (el) {
        var tag = el.tagName.toLowerCase();
        if (SKIP_SVG[tag]) return;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        var m2 = mul * (parseFloat(cs.opacity) || 1);
        var bad = (cs.filter !== 'none') || (cs.clipPath !== 'none') || (cs.mask !== 'none' && cs.mask !== undefined && cs.mask !== '') || el.hasAttribute('filter') || el.hasAttribute('mask') || el.hasAttribute('clip-path');
        if (tag === 'g' || tag === 'a') { if (bad) island(el, 'svg-g'); else walk(el, m2); return; }
        if (bad) { island(el, 'svg-effect'); return; }
        var fill = svgPaint(cs, 'fill', m2), line = svgLine(cs, m2, el);
        if ((fill && fill.unsupported) || (line && line.unsupported)) { island(el, 'svg-paint-server'); return; }
        var P = ctmOf(el), axis = ctmAxis(el), sc = ctmScale(el);
        var hasMarkers = cs.markerStart !== 'none' || cs.markerEnd !== 'none' || cs.markerMid !== 'none';
        if (tag === 'rect') {
          var x = el.x.baseVal.value, y = el.y.baseVal.value, w = el.width.baseVal.value, h = el.height.baseVal.value;
          var rx = el.rx.baseVal.value || el.ry.baseVal.value || 0;
          if (axis) {
            var p0 = P(x, y), p1 = P(x + w, y + h), R = { x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]) };
            var ms = Math.min(R.w, R.h);
            flush(); out.push({ k: 'shape', geom: rx > 0 ? 'roundRect' : 'rect', adj: rx > 0 ? [r2(Math.min(0.5, rx * sc / ms))] : null, x: r2(R.x), y: r2(R.y), w: r2(R.w), h: r2(R.h), fill: fill, line: line, key: keyFlow(st), src: 'svg rect' });
          } else if (!rx) { flush(); out.push({ k: 'poly', pts: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], closed: true, fill: fill, line: line, key: keyFlow(st), src: 'svg rect rot' }); }
          else island(el, 'svg-rect-rot-rx');
        } else if (tag === 'circle' || tag === 'ellipse') {
          var cx = el.cx.baseVal.value, cy = el.cy.baseVal.value;
          var rX = tag === 'circle' ? el.r.baseVal.value : el.rx.baseVal.value, rY = tag === 'circle' ? rX : el.ry.baseVal.value;
          if (!axis) { island(el, 'svg-ellipse-rot'); return; }
          var a = P(cx - rX, cy - rY), b = P(cx + rX, cy + rY);
          flush(); out.push({ k: 'shape', geom: 'ellipse', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: r2(Math.abs(b[0] - a[0])), h: r2(Math.abs(b[1] - a[1])), fill: fill, line: line, key: keyFlow(st), src: 'svg ' + tag });
        } else if (tag === 'line') {
          var q1 = P(el.x1.baseVal.value, el.y1.baseVal.value), q2 = P(el.x2.baseVal.value, el.y2.baseVal.value);
          if (!line) return;
          flush(); out.push({ k: 'line', x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], line: line, head: markerInfo(el, cs, 'Start'), tail: markerInfo(el, cs, 'End'), key: keyFlow(st), src: 'svg line' });
        } else if (tag === 'polyline' || tag === 'polygon') {
          var pts = Array.prototype.map.call(el.points, function (pt) { return P(pt.x, pt.y); });
          if (tag === 'polygon' && hasMarkers) { island(el, 'svg-poly-markers'); return; }
          flush(); out.push({ k: 'poly', pts: pts, closed: tag === 'polygon', fill: tag === 'polygon' ? fill : null, line: line, tail: markerInfo(el, cs, 'End'), head: markerInfo(el, cs, 'Start'), key: keyFlow(st), src: 'svg ' + tag });
        } else if (tag === 'path') {
          var segs = pathToCubic(el.getAttribute('d') || '', P);
          if (!segs || hasMarkers && (cs.markerMid !== 'none')) { island(el, 'svg-path'); return; }
          flush(); out.push({ k: 'path', segs: segs, fill: fill, line: line, head: markerInfo(el, cs, 'Start'), tail: markerInfo(el, cs, 'End'), key: keyFlow(st), src: 'svg path' });
        } else if (tag === 'text') {
          if (el.querySelector('textPath') || Array.prototype.some.call(el.querySelectorAll('tspan'), function (t) { return t.hasAttribute('x') || t.hasAttribute('y') || t.hasAttribute('dy') || t.hasAttribute('dx'); })) { island(el, 'svg-text-complex'); return; }
          var txt = el.textContent.replace(/\s+/g, ' ').trim(); if (!txt) return;
          var fs = px(cs.fontSize) * sc;
          var bb = el.getBBox(), anchorX = el.x.baseVal.length ? el.x.baseVal[0].value : 0, baseY = el.y.baseVal.length ? el.y.baseVal[0].value : 0;
          var o = P(anchorX, baseY);
          var rs = runStyle(cs, m2); rs.size = r2(fs); rs.color = fill && !fill.unsupported ? fill : rs.color;
          var mt = fontMetrics(cs); rs.A = r2(mt.A * sc); rs.D = r2(mt.D * sc);
          var wpx = r2(bb.width * sc);
          var ta = cs.textAnchor, al = ta === 'middle' ? 'ctr' : (ta === 'end' ? 'r' : 'l');
          var rot = ctmRot(el);
          // рамка без переноса: левый край по якорю, ширина с запасом
          var slack = Math.max(8, wpx * 0.15), W = wpx + slack * 2;
          var x0 = al === 'l' ? o[0] : (al === 'ctr' ? o[0] - W / 2 : o[0] - W);
          var lh = r2(fs * 1.2);
          var it = { k: 'text', x: r2(x0), y: r2(o[1] - rs.A), w: r2(W), h: r2(rs.A + rs.D), wrap: false, align: al, lh: lh, svg: true,
                     runs: [{ t: txt, s: rs }], lines: [{ text: txt, left: r2(o[0] - (al === 'l' ? 0 : al === 'ctr' ? wpx / 2 : wpx)), right: 0, top: r2(o[1] - rs.A), base: o[1], bottom: r2(o[1] + rs.D) }],
                     key: keyFlow(st), src: 'svg text' };
          it.lines[0].right = r2(it.lines[0].left + wpx);
          if (Math.abs(rot) > 0.05) rotateItem(it, o, rot);
          flush(); out.push(it);
        } else island(el, 'svg-' + tag);
      });
    }
    var run = null; // подряд идущие растровые элементы одного родителя сливаются в один остров
    function island(el, why) {
      if (run && run.parent === el.parentNode && run.last === el.previousElementSibling) { run.els.push(el); run.last = el; run.why.push(why); return; }
      flush();
      run = { parent: el.parentNode, els: [el], last: el, why: [why] };
    }
    function flush() { if (run) { pending.push({ els: run.els, why: run.why }); out.push({ k: 'island', n: pending.length - 1, key: keyFlow(st), why: run.why.join(','), src: 'svg' }); run = null; } }
    walk(svg, mul0);
    flush();
  }

  /* ---------- SVG path → кубические кривые в координатах слайда ---------- */
  function pathToCubic(d, P) {
    var toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g);
    if (!toks) return null;
    var i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null, segs = [], cur = null;
    function num() { return parseFloat(toks[i++]); }
    function isNum() { return i < toks.length && !/^[a-zA-Z]$/.test(toks[i]); }
    function start(x, y) { cur = { p: [P(x, y)], c: ['M'], closed: false }; segs.push(cur); }
    function L(x, y) { cur.p.push(P(x, y)); cur.c.push('L'); }
    function C(x1, y1, x2, y2, x, y) { cur.p.push(P(x1, y1), P(x2, y2), P(x, y)); cur.c.push('C'); }
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
      var rl = cmd === cmd.toLowerCase(), C0 = cmd.toUpperCase();
      var ox = rl ? cx : 0, oy = rl ? cy : 0;
      if (C0 === 'M') { cx = num() + ox; cy = num() + oy; sx = cx; sy = cy; start(cx, cy); cmd = rl ? 'l' : 'L'; lcx = lqx = null; continue; }
      if (!cur) start(cx, cy);
      if (C0 === 'Z') { cur.closed = true; cx = sx; cy = sy; cur = null; lcx = lqx = null; if (i < toks.length && !/^[a-zA-Z]$/.test(toks[i])) return null; continue; }
      if (C0 === 'L') { cx = num() + ox; cy = num() + oy; L(cx, cy); lcx = lqx = null; }
      else if (C0 === 'H') { cx = num() + ox; L(cx, cy); lcx = lqx = null; }
      else if (C0 === 'V') { cy = num() + oy; L(cx, cy); lcx = lqx = null; }
      else if (C0 === 'C') { var x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy; cx = num() + ox; cy = num() + oy; C(x1, y1, x2, y2, cx, cy); lcx = x2; lcy = y2; lqx = null; }
      else if (C0 === 'S') { var rx1 = lcx === null ? cx : 2 * cx - lcx, ry1 = lcx === null ? cy : 2 * cy - lcy; var sx2 = num() + ox, sy2 = num() + oy; var ex = num() + ox, ey = num() + oy; C(rx1, ry1, sx2, sy2, ex, ey); lcx = sx2; lcy = sy2; cx = ex; cy = ey; lqx = null; }
      else if (C0 === 'Q' || C0 === 'T') {
        var qx, qy;
        if (C0 === 'Q') { qx = num() + ox; qy = num() + oy; } else { qx = lqx === null ? cx : 2 * cx - lqx; qy = lqx === null ? cy : 2 * cy - lqy; }
        var ex2 = num() + ox, ey2 = num() + oy;
        C(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), ex2 + 2 / 3 * (qx - ex2), ey2 + 2 / 3 * (qy - ey2), ex2, ey2);
        lqx = qx; lqy = qy; lcx = null; cx = ex2; cy = ey2;
      } else if (C0 === 'A') {
        var arx = num(), ary = num(), phi = num(), fa = num(), fs = num(), ax = num() + ox, ay = num() + oy;
        arcToCubic(cx, cy, arx, ary, phi, fa, fs, ax, ay).forEach(function (b) { C(b[0], b[1], b[2], b[3], b[4], b[5]); });
        cx = ax; cy = ay; lcx = lqx = null;
      } else return null;
      if (!isNum() && i < toks.length && !/^[a-zA-Z]$/.test(toks[i])) return null;
    }
    return segs.map(function (s) { return { p: s.p, c: s.c, closed: s.closed }; });
  }
  function arcToCubic(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
    var sinp = Math.sin(phi * Math.PI / 180), cosp = Math.cos(phi * Math.PI / 180);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cosp * dx + sinp * dy, y1p = -sinp * dx + cosp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = Math.sqrt(Math.max(0, num / den)) * (fa === fs ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cosp * cxp - sinp * cyp + (x1 + x2) / 2, cy = sinp * cxp + cosp * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) { var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; }
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    var n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), res = [], h = 4 / 3 * Math.tan(dt / n / 4);
    for (var k = 0; k < n; k++) {
      var a1 = t1 + k * dt / n, a2 = t1 + (k + 1) * dt / n;
      var e1x = Math.cos(a1), e1y = Math.sin(a1), e2x = Math.cos(a2), e2y = Math.sin(a2);
      var p1 = [e1x - h * e1y, e1y + h * e1x], p2 = [e2x + h * e2y, e2y - h * e2x], p3 = [e2x, e2y];
      var T = function (p) { var X = p[0] * rx, Y = p[1] * ry; return [cosp * X - sinp * Y + cx, sinp * X + cosp * Y + cy]; };
      var q1 = T(p1), q2 = T(p2), q3 = T(p3);
      res.push([q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]]);
    }
    return res;
  }

  /* ---------- обход HTML ---------- */
  function contentBoxOf(el, cs) {
    var r = rel(el.getBoundingClientRect());
    var l = px(cs.borderLeftWidth) + px(cs.paddingLeft), t = px(cs.borderTopWidth) + px(cs.paddingTop);
    var rr = px(cs.borderRightWidth) + px(cs.paddingRight), b = px(cs.borderBottomWidth) + px(cs.paddingBottom);
    return { x: r.x + l, y: r.y + t, w: r.w - l - rr, h: r.h - t - b };
  }
  function createsSC(cs, parentCs) {
    var pos = cs.position !== 'static', z = cs.zIndex;
    var flexItem = parentCs && /flex|grid/.test(parentCs.display);
    return (pos && z !== 'auto') || (flexItem && z !== 'auto') || parseFloat(cs.opacity) < 1 || cs.transform !== 'none' ||
      cs.filter !== 'none' || cs.isolation === 'isolate' || cs.mixBlendMode !== 'normal' || cs.clipPath !== 'none' ||
      cs.position === 'fixed' || cs.position === 'sticky';
  }
  function visit(el, st, out, pending, parentCs) {
    var cs = getComputedStyle(el); cs._el = el;
    if (cs.display === 'none') return;
    var tag = el.tagName;
    var positioned = cs.position !== 'static', sc = createsSC(cs, parentCs);
    var z = cs.zIndex === 'auto' ? 0 : parseInt(cs.zIndex, 10);
    var ns = { mul: st.mul * (parseFloat(cs.opacity) || 1), sc: st.sc, group: st.group, ownKey: null };
    if (positioned || sc) {
      var layerKey = z < 0 ? [0, z, ++itemSeq] : (z > 0 ? [3, z, ++itemSeq] : [2, ++itemSeq]);
      ns.group = st.sc.concat(layerKey);
      if (sc) ns.sc = ns.group;
      ns.ownKey = ns.group.concat([-1]);
    }
    if (cs.visibility === 'hidden') { ns.hidden = true; }
    var why = subtreeUnsupported(el, cs);
    var r = rel(el.getBoundingClientRect());
    if (why.length) {
      pending.push({ els: [el], why: why });
      out.push({ k: 'island', n: pending.length - 1, key: ns.ownKey || keyFlow(ns), why: why.join(','), src: descr(el) });
      return;
    }
    // поворот: снимаем поддерево без transform, затем поворачиваем снятые элементы
    var M = parseMatrix(cs.transform), rot = M ? rotationOnly(M) : null, saved = null, sub = out, origin = null;
    if (rot !== null && Math.abs(rot) > 0.01) {
      var bb0 = el.getBoundingClientRect();
      var cx0 = bb0.left + bb0.width / 2, cy0 = bb0.top + bb0.height / 2;
      saved = el.style.transform; el.style.setProperty('transform', 'none', 'important');
      var bb1 = el.getBoundingClientRect();
      var to = cs.transformOrigin.split(' ').map(px);
      origin = [r2(bb1.left - slideBox.left + to[0]), r2(bb1.top - slideBox.top + to[1])];
      // центр после поворота = поворот центра без поворота вокруг origin — проверка
      sub = [];
      r = rel(bb1);
    } else if (M && !M.complex && rot === null) {
      // наклон/масштаб пустого блока → многоугольник по углам
      saved = el.style.transform; el.style.setProperty('transform', 'none', 'important');
      var b1 = rel(el.getBoundingClientRect());
      var to2 = cs.transformOrigin.split(' ').map(px), ox = b1.x + to2[0], oy = b1.y + to2[1];
      var pts = [[b1.x, b1.y], [b1.x + b1.w, b1.y], [b1.x + b1.w, b1.y + b1.h], [b1.x, b1.y + b1.h]].map(function (p) {
        var dx = p[0] - ox, dy = p[1] - oy; return [r2(ox + M.a * dx + M.c * dy + M.e), r2(oy + M.b * dx + M.d * dy + M.f)];
      });
      el.style.transform = saved;
      var fillS = color(cs.backgroundColor, ns.mul);
      if (fillS && !ns.hidden) out.push({ k: 'poly', pts: pts, closed: true, fill: fillS, line: null, key: ns.ownKey || keyFlow(ns), src: descr(el) + ' transform' });
      return;
    }
    if (tag === 'svg' || el instanceof SVGSVGElement) {
      if (!ns.hidden) visitSvg(el, ns, sub, pending);
    } else if (tag === 'IMG') {
      if (!ns.hidden) {
        var cb = contentBoxOf(el, cs);
        var rad = px(cs.borderTopLeftRadius);
        sub.push({ k: 'img', x: cb.x, y: cb.y, w: cb.w, h: cb.h, src: el.currentSrc || el.src, fit: cs.objectFit, pos: cs.objectPosition,
                   nw: el.naturalWidth, nh: el.naturalHeight, radius: rad > 0.5 ? r2(Math.min(0.5, rad / Math.min(cb.w, cb.h))) : 0,
                   alpha: ns.mul < 1 ? r2(ns.mul) : null, key: ns.ownKey || keyFlow(ns), src2: descr(el) });
      }
    } else {
      // клип-путь polygon у пустого блока → многоугольник
      if (cs.clipPath !== 'none' && /^polygon\(/.test(cs.clipPath)) {
        var fillC = color(cs.backgroundColor, ns.mul);
        var pp = cs.clipPath.replace(/^polygon\((?:(?:nonzero|evenodd),\s*)?/, '').replace(/\)$/, '').split(',').map(function (pr) {
          var xy = pr.trim().split(/\s+/);
          var fx = /%$/.test(xy[0]) ? parseFloat(xy[0]) / 100 * r.w : px(xy[0]), fy = /%$/.test(xy[1]) ? parseFloat(xy[1]) / 100 * r.h : px(xy[1]);
          return [r2(r.x + fx), r2(r.y + fy)];
        });
        if (fillC && !ns.hidden) sub.push({ k: 'poly', pts: pp, closed: true, fill: fillC, line: null, key: ns.ownKey || keyFlow(ns), src: descr(el) + ' clip-path' });
        if (saved !== null) el.style.transform = saved;
        return;
      }
      var selfWhy = boxUnsupported(cs);
      if (!ns.hidden) {
        if (selfWhy.length) {
          pending.push({ els: [el], self: true, why: selfWhy, text: hasText(el) });
          sub.push({ k: 'island', n: pending.length - 1, key: ns.ownKey || keyFlow(ns), why: selfWhy.join(','), src: descr(el) + ' (свой фон)' });
          // тень и прочее ушли в растр; если есть простой фон без тени — всё равно растр (единый остров)
        } else if (el !== st.slideEl) emitBox(el, cs, ns, sub, r);
      }
      // дети: инлайновые серии → текстовые рамки; элементы → рекурсия
      var kids = Array.prototype.slice.call(el.childNodes), runNodes = [];
      var cb2 = contentBoxOf(el, cs);
      var flushRun = function () {
        if (runNodes.length && !ns.hidden) emitText(runNodes, el, cs, ns, sub, cb2);
        runNodes = [];
      };
      kids.forEach(function (n) {
        if (n.nodeType === 3) { runNodes.push(n); return; }
        if (n.nodeType !== 1) return;
        var ccs = getComputedStyle(n);
        if (ccs.display === 'none') return;
        var inl = (ccs.display === 'inline' || ccs.display === 'contents') && !REPLACED[n.tagName] && ccs.position === 'static' && !(n instanceof SVGElement);
        if (inl) { runNodes.push(n); return; }
        flushRun();
        visit(n, ns, sub, pending, cs);
      });
      flushRun();
    }
    if (saved !== null) {
      el.style.transform = saved;
      sub.forEach(function (it) { rotateItem(it, origin, rot); out.push(it); });
    }
  }

  function exportSlides() {
    var slides = Array.prototype.slice.call(document.querySelectorAll(SLIDE_SEL));
    var res = { slides: [], warnings: warnings, fonts: [], ua: navigator.userAgent, dpr: window.devicePixelRatio };
    // @font-face → для экспортёра (метрики и отчёт)
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      var rules; try { rules = ss.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules, function (r) {
        if (r.type === CSSRule.FONT_FACE_RULE) {
          res.fonts.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: r.style.getPropertyValue('font-weight') || '400',
                           style: r.style.getPropertyValue('font-style') || 'normal', srcKind: (r.style.getPropertyValue('src').match(/url\("?(data:[^;,]*|[^"')]{0,120})/) || [])[1] || '' });
        }
      });
    });
    var allPending = [];
    slides.forEach(function (s, si) {
      slideBox = s.getBoundingClientRect();
      var cs = getComputedStyle(s); cs._el = s;
      itemSeq = 0;
      var out = [], pending = [];
      var st = { mul: 1, sc: [], group: [], slideEl: s };
      var bg = color(cs.backgroundColor);
      var selfWhy = boxUnsupported(cs);
      if (cs.backgroundImage !== 'none' || selfWhy.length) {
        pending.push({ els: [s], self: true, why: ['slide-background'].concat(selfWhy), text: hasText(s) });
        out.push({ k: 'island', n: 0, key: [-2], why: 'slide-background', src: 'slide' });
      }
      visit(s, st, out, pending, null);
      out.sort(function (a, b) { return cmpKey(a.key, b.key); });
      var nt = s.querySelector('aside.notes');
      res.slides.push({ w: r2(slideBox.width), h: r2(slideBox.height), bg: bg, items: out, notes: nt ? nt.textContent.trim() : '', qa: s.getAttribute('data-qa') || '',
        islands: pending.map(function (p) { return { why: p.why, self: !!p.self, bb: unionBox(p.els) }; }) });
      allPending.push(pending);
    });
    return { res: res, pending: allPending, slides: slides };
  }
  function unionBox(els) { // рамка острова в координатах слайда (для обрезки растра)
    var L = 1e9, T = 1e9, R = -1e9, B = -1e9;
    els.forEach(function (e) { var r = e.getBoundingClientRect(); L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); });
    return { x: r2(L - slideBox.left), y: r2(T - slideBox.top), w: r2(R - L), h: r2(B - T) };
  }
  function cmpKey(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === undefined) return -1; if (b[i] === undefined) return 1;
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  /* ---------- растровые страницы островов ---------- */
  function buildRasterPages(ex) {
    var style = document.createElement('style');
    style.textContent = 'html,body{background:transparent!important}' +
      '.x-clone{visibility:hidden!important}' +
      '.x-vis{visibility:visible!important}' +
      '.x-self{visibility:visible!important}.x-self>*{visibility:hidden!important}' +
      '.x-self.x-notext{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' +
      'section.x-orig{display:none!important}';
    document.head.appendChild(style);
    var manifest = [];
    ex.slides.forEach(function (s, si) {
      var pend = ex.pending[si];
      // пометить элементы островов атрибутами в оригинале, затем клонировать
      pend.forEach(function (p, pi) { p.els.forEach(function (e) { e.setAttribute('data-x-island', si + '.' + pi); }); });
      var last = ex.slides[ex.slides.length - 1];
      pend.forEach(function (p, pi) {
        var c = s.cloneNode(true);
        c.removeAttribute('id');
        c.classList.add('x-clone');
        Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (e) { if (!(e.closest('defs') || /^(marker|linearGradient|radialGradient|clipPath|mask|filter|pattern|symbol)$/i.test(e.tagName))) e.removeAttribute('id'); });
        var marked = c.hasAttribute('data-x-island') && c.getAttribute('data-x-island') === si + '.' + pi ? [c] : [];
        marked = marked.concat(Array.prototype.slice.call(c.querySelectorAll('[data-x-island="' + si + '.' + pi + '"]')));
        marked.forEach(function (e) {
          if (p.self) { e.classList.add('x-self'); if (p.text) e.classList.add('x-notext'); }
          else if (e.classList) e.classList.add('x-vis'); else e.setAttribute('class', (e.getAttribute('class') || '') + ' x-vis');
        });
        last.parentNode.appendChild(c);
        manifest.push({ slide: si, island: pi });
      });
    });
    ex.slides.forEach(function (s) { s.classList.add('x-orig'); });
    var meta = document.createElement('script'); meta.type = 'application/json'; meta.id = 'x-raster';
    meta.textContent = JSON.stringify(manifest);
    document.body.appendChild(meta);
  }

  function run() {
    var t0 = performance.now();
    var ex = exportSlides();
    if (MODE === 'layout') {
      ex.res.ms = Math.round(performance.now() - t0);
      ex.res.fontsStatus = document.fonts.status;
      var sc = document.createElement('script'); sc.type = 'application/json'; sc.id = 'x-layout';
      sc.textContent = JSON.stringify(ex.res).replace(/</g, '\\u003c');
      document.body.appendChild(sc);
    } else if (MODE === 'raster') {
      buildRasterPages(ex);
    }
    document.documentElement.setAttribute('data-export-done', MODE);
  }
  function go() {
    document.fonts.ready.then(function () {
      requestAnimationFrame(function () { requestAnimationFrame(run); });
    });
  }
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();

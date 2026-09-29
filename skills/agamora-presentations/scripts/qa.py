# -*- coding: utf-8 -*-
"""Проверка качества дека перед сдачей: автоматический разбор раскладки + кадры для просмотра глазами.

Запуск:  python qa.py deck.html [--pdf deck.pdf] [--out папка_кадров]
Что проверяется автоматически (по раскладке Chrome, той же, что у экспорта в PPTX):
- кегль меньше 20 px в теле слайда (кроме метки раздела и номера страницы);
- текст выходит за свой блок или за край слайда;
- подписи накладываются друг на друга;
- перегруз: больше 80 слов или больше 12 чисел на слайде; заголовок длиннее 90 знаков или в 3+ строки;
- запрещённое: восклицательные знаки, сноски со звёздочкой, «Источник:» на слайде;
- пустые горизонтальные полосы в теле слайда выше 190 px (по кадру PDF).
Кадры: frame-NN.png и листы sheet-N.png по 6 кадров — их нужно посмотреть глазами (см. references/qa.md).
Код возврата 1, если есть ошибки (warnings не считаются).
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import chrome            # noqa: E402
from export_pptx import dump_layout  # noqa: E402

SMALL_OK = ("span.sec", "span.no", ".sec", ".no")
WORD = re.compile(r"[A-Za-zА-Яа-яЁё]{2,}")
NUM = re.compile(r"\d[\d\s ,.]*")


def text_of(it):
    return "".join(r.get("t", "\n") for r in it["runs"]).strip()


def _lum(hexc):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(c1, c2):
    a, b = sorted((_lum(c1), _lum(c2)), reverse=True)
    return (a + 0.05) / (b + 0.05)


def backdrop(slide, idx, x, y, slide_bg):
    """Цвет под точкой (x, y): последняя залитая фигура до текста в порядке наложения; None — под растром."""
    for it in reversed(slide["items"][:idx]):
        if it["k"] == "island":
            bb = (slide.get("islands") or [{}] * (it["n"] + 1))[it["n"]].get("bb")
            if bb and _inside(bb, x, y):
                return None          # под текстом растр — контраст не определить, смотреть глазами
            continue
        if it["k"] == "shape" and it.get("fill") and it["fill"].get("a", 1) > 0.6 and _inside(it, x, y):
            return it["fill"]["c"]
        if it["k"] in ("poly", "path") and it.get("fill") and it["fill"].get("a", 1) > 0.6:
            pts = it["pts"] if it["k"] == "poly" else [p for sg in it["segs"] for p in sg["p"]]
            if len(pts) > 2 and _in_poly(pts, x, y):
                return it["fill"]["c"]
    return slide_bg


def _inside(it, x, y):
    return "x" in it and it["x"] <= x <= it["x"] + it["w"] and it["y"] <= y <= it["y"] + it["h"]


def _in_poly(pts, x, y):
    inside = False
    for i in range(len(pts)):
        (x1, y1), (x2, y2) = pts[i], pts[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-9) + x1:
            inside = not inside
    return inside


def lint(layout):
    errs, warns = [], []
    for si, s in enumerate(layout["slides"], 1):
        if s.get("qa") == "skip":        # служебный слайд (лист иконок и т. п.): <section class="slide" data-qa="skip">
            continue
        texts = [it for it in s["items"] if it["k"] == "text"]
        words = nums = 0
        boxes = []
        slide_bg = (s.get("bg") or {}).get("c", "FFFFFF")
        sizes_on_slide = set()
        for idx, it in enumerate(s["items"]):
            if it["k"] != "text" or not it["lines"]:
                continue
            ln = it["lines"][0]
            bg = backdrop(s, idx, (ln["left"] + ln["right"]) / 2, (ln["top"] + ln["bottom"]) / 2, slide_bg)
            if any(k in it.get("src", "") for k in (".no",)):
                continue                 # номер страницы — намеренно тихая навигация
            for r in it["runs"]:
                if r.get("br") or not r["t"].strip() or not r["s"].get("color"):
                    continue
                sizes_on_slide.add(round(r["s"]["size"]))
                if bg:
                    cr = contrast(r["s"]["color"]["c"], bg)
                    big = r["s"]["size"] >= 24 or (r["s"]["size"] >= 18.5 and r["s"].get("weight", 400) >= 700)
                    need = 3.0 if big else 4.5
                    if cr < need - 0.05 and r["s"]["size"] >= 64:
                        warns.append(f"слайд {si}: крупная цифра почти не видна ({cr:.1f}:1) — это украшение? "
                                     f"Убрать или сделать данными — «{r['t'].strip()[:20]}»")
                        break
                    if cr < need - 0.05:
                        errs.append(f"слайд {si}: контраст {cr:.1f}:1 < {need} — «{r['t'].strip()[:30]}» "
                                    f"(#{r['s']['color']['c']} на #{bg})")
                        break
        if len(sizes_on_slide) > 7:
            warns.append(f"слайд {si}: {len(sizes_on_slide)} разных кеглей — держать шкалу (references/design.md)")
        for it in texts:
            t = text_of(it)
            src = it.get("src", "")
            small_ok = any(k in src for k in SMALL_OK)
            sizes = [r["s"]["size"] for r in it["runs"] if not r.get("br")]
            if sizes and min(sizes) < 19.5 and not small_ok:
                errs.append(f"слайд {si}: кегль {min(sizes):.0f}px < 20 — «{t[:40]}»")
            cb = it.get("cb")
            for ln in it["lines"]:
                if cb and not it.get("svg") and it.get("wrap", True) and ln["right"] > cb["x"] + cb["w"] + 2:
                    errs.append(f"слайд {si}: строка выходит за блок — «{ln['text'][:40]}»")
                    break
            if any(l["left"] < 0 or l["right"] > s["w"] + 1 or l["bottom"] > s["h"] + 1 for l in it["lines"]):
                errs.append(f"слайд {si}: текст за краем слайда — «{t[:40]}»")
            elif any(l["left"] < 36 or l["right"] > s["w"] - 36 for l in it["lines"]) and "hero" not in src:
                warns.append(f"слайд {si}: текст ближе 36px к краю — «{t[:40]}»")
            if "at" in src.split(".") or src.endswith(".at"):
                if len(t) > 90:
                    warns.append(f"слайд {si}: заголовок длинный ({len(t)} знаков)")
                if len(it["lines"]) > 2:
                    errs.append(f"слайд {si}: заголовок в {len(it['lines'])} строки — сократить")
            if not small_ok:
                words += len(WORD.findall(t))
                nums += len([m for m in NUM.findall(t) if m.strip()])
            if "!" in t:
                errs.append(f"слайд {si}: восклицательный знак — «{t[:40]}»")
            if re.search(r"(^|\s)\*|\*\s*$|¹|²|³", t) or re.match(r"(?i)источник", t):
                errs.append(f"слайд {si}: сноска или «источник» на слайде — «{t[:40]}» (оговорку — в подпись крупно)")
            for ln in it["lines"]:
                boxes.append((ln["left"], ln["top"], ln["right"], ln["bottom"], id(it), ln["text"]))
        if words > 80:
            warns.append(f"слайд {si}: {words} слов — перегруз, разгрузить или разбить на два слайда")
        if nums > 12:
            warns.append(f"слайд {si}: {nums} чисел — оставить главные")
        seen = set()
        for i, A in enumerate(boxes):
            for B in boxes[i + 1:]:
                if A[4] == B[4]:
                    continue
                ix = min(A[2], B[2]) - max(A[0], B[0])
                iy = min(A[3], B[3]) - max(A[1], B[1])
                if ix > 4 and iy > 4:
                    area = min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1])) or 1
                    if ix * iy / area > 0.2:
                        key = (A[5][:20], B[5][:20])
                        if key not in seen:
                            seen.add(key)
                            errs.append(f"слайд {si}: наложение подписей «{A[5][:25]}» и «{B[5][:25]}»")
    return errs, warns


def frames(pdf, out, zoom=1.0):
    import pymupdf
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    doc = pymupdf.open(pdf)
    paths, empty = [], []
    for i, pg in enumerate(doc, 1):
        z = zoom * 1600 / pg.rect.width          # страница Chrome в пунктах: 1600 px = 1200 pt
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z))
        p = os.path.join(out, f"frame-{i:02d}.png")
        pix.save(p)
        paths.append(p)
        im = Image.open(p).convert("L")
        w, h = im.size
        y0, y1 = int(170 * zoom), int(860 * zoom)
        run = best = 0
        px = im.load()
        for y in range(y0, y1):
            row = [px[x, y] for x in range(int(72 * zoom), w - int(72 * zoom), 4)]
            flat = max(row) - min(row) < 6
            run = run + 1 if flat else 0
            best = max(best, run)
        if best / zoom > 190:
            empty.append((i, int(best / zoom)))
    sheets = []
    for k in range(0, len(paths), 6):
        tiles = [Image.open(p) for p in paths[k:k + 6]]
        tw, th = 800, 450
        sheet = Image.new("RGB", (tw * 2 + 30, th * 3 + 40), "#2B3240")
        for j, t in enumerate(tiles):
            t = t.convert("RGB").resize((tw, th))
            sheet.paste(t, (10 + (j % 2) * (tw + 10), 10 + (j // 2) * (th + 10)))
        sp = os.path.join(out, f"sheet-{k // 6 + 1}.png")
        sheet.save(sp)
        sheets.append(sp)
    return paths, sheets, empty


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--pdf")
    ap.add_argument("--out")
    a = ap.parse_args()
    layout, tmp_html = dump_layout(a.html)
    if os.path.exists(tmp_html):
        os.remove(tmp_html)
    errs, warns = lint(layout)
    pdf = a.pdf or os.path.splitext(a.html)[0] + ".pdf"
    if not os.path.exists(pdf):
        chrome.print_pdf(a.html, pdf)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.html)), "qa_" + os.path.splitext(os.path.basename(a.html))[0])
    paths, sheets, empty = frames(pdf, out)
    for i, band in empty:
        warns.append(f"слайд {i}: пустая полоса {band}px в теле — растянуть главный объект или укрупнить")
    print(f"Слайдов: {len(layout['slides'])}. Ошибок: {len(errs)}. Предупреждений: {len(warns)}.")
    for e in errs:
        print("  ОШИБКА  " + e)
    for w in warns:
        print("  проверить  " + w)
    print("Листы для просмотра глазами:")
    for s in sheets:
        print("  " + s)
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()

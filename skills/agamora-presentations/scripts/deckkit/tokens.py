# -*- coding: utf-8 -*-
"""Токены, каркас слайда и сборка дека в один самодостаточный HTML.

Холст 1600×900 px, поля 44/72/46 px, ширина тела 1456 px (все холсты и графики считают от неё).
Шрифты встраиваются в HTML (IBM Plex Sans — текст, Caveat — рукописные пометки), поэтому дек выглядит
одинаково на Windows и macOS и печатается без сети. Бренд — файл brand.json (см. references/brand.md):
заменяет цвета палитры и добавляет логотип. Без бренда дек собирается в нейтральной палитре по умолчанию.
"""
import base64
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(os.path.dirname(HERE))
FONTS_DIR = os.path.join(SKILL, "assets", "fonts")

# ── палитра по умолчанию (роль → цвет). Бренд меняет любые из них через brand.json ─────────────────
NAVY = "#002D72"    # тёмно-синий: заголовки, главные плоскости, выделенный столбец
BLUE = "#0070BA"    # синий: метка раздела, агенты, рукописные пометки, вторичные полосы
LBLUE = "#8CB8E0"   # светло-синий: обычные столбцы, бюджет, линия шкалы
SKY = "#009FDF"     # голубой мотива: наклонные полосы, номера на тёмном
INK = "#1A2433"     # основной текст и значения
BODY = "#3B4758"    # текст абзацев (.t)
MUTED = "#5F6B7C"   # подписи осей, второстепенное
RULE = "#D5DCE5"    # разделительные линии
PALE = "#F2F5F9"    # светлые зоны, выносные плашки
RED = "#B42318"     # только риск, затраты, запрет

EXTRA = {
    "on_navy_text": "#C9D8EE",   # подпись на тёмно-синем
    "line_box": "#AEBBCB",       # рамка обычного блока и «тихие» соединители
    "tobe_zone": "#E3F2FB",      # фон зоны TO BE / блок kind="sky"
    "asis_zone": "#F4F5F7",      # фон зоны AS IS / блок kind="grey"
    "arrow": "#8A96A6",          # серые стрелки Canvas.line по умолчанию
    "axis": "#9AA6B5",           # ось графиков
    "grey_head": "#5B6778",      # заголовок AS IS
    "page_no": "#A3ADBA",        # номер страницы
    "waffle_off": "#DDE3EB",     # пустые клетки «вафли»
    "gantt_alt": "#F4F7FB",      # заливка чётных кварталов в Ганте
    "gantt_vline": "#D9DFE7",    # вертикали кварталов
    "grid": "#E6EAF0",           # сетка шкалы процентов
    "bars_on_navy": "#5F8FCB",   # столбцы на тёмной панели
    "hand_on_navy": "#8FD3FF",   # рукописная пометка на тёмно-синем
}
ROLES = {"primary": NAVY, "accent": BLUE, "light": LBLUE, "motif": SKY, "ink": INK, "body": BODY,
         "muted": MUTED, "rule": RULE, "pale": PALE, "risk": RED, **EXTRA}

FONT = "var(--ft)"                     # шрифт текста (бренд: fonts.text), по умолчанию IBM Plex Sans
FONT_DISPLAY = "var(--fd)"             # шрифт заголовков и крупных чисел (бренд: fonts.display)
HAND_FONT = "'Caveat','Segoe Print','Ink Free',cursive"
HAND_SCALE = 1.25   # Caveat мельче Segoe Print по высоте строчных: size в hand() — «видимый» кегль эталона
W, H = 1600, 900
PAD_T, PAD_X, PAD_B = 44, 72, 46
BODY_W = W - 2 * PAD_X          # 1456

CSS = """
@page{size:1600px 900px;margin:0}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#fff}
@media screen{html,body{background:#E9EDF2}section.slide{margin:0 auto 24px}}
body{font-family:var(--ft);color:#1A2433;font-variant-numeric:tabular-nums;
     -webkit-font-smoothing:antialiased;font-kerning:normal}
section.slide{width:1600px;height:900px;position:relative;overflow:hidden;break-after:page;page-break-after:always;background:#fff}
section.slide:last-of-type{break-after:auto;page-break-after:auto}
aside.notes{display:none}
.pg{position:absolute;inset:0;display:flex;flex-direction:column;padding:44px 72px 46px}
.hd{display:flex;align-items:center;height:34px}
.sec{font-size:18px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#0070BA}
.hd .lg{margin-left:auto;height:30px}
.at{margin-top:16px;font-family:var(--fd);font-size:38px;line-height:1.2;font-weight:700;color:#002D72;max-width:1380px;letter-spacing:-.3px}
.lead{margin-top:14px;font-size:28px;line-height:1.35;color:#1A2433;max-width:1300px}
.num{font-family:var(--fd)}
.bd{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:28px;margin-top:30px}
.no{position:absolute;right:72px;bottom:22px;font-size:16px;font-weight:600;color:#A3ADBA}
.row{display:flex;gap:40px;min-height:0}
.col{flex:1;display:flex;flex-direction:column;min-width:0}
.t{font-size:24px;line-height:1.4;color:#3B4758}
.cv{position:relative;flex-shrink:0}
.hand{font-family:'Caveat','Segoe Print','Ink Free',cursive;font-weight:700;color:#0070BA;line-height:1.1;white-space:nowrap}
div,h1,p,li{text-wrap:pretty}
.at,h1,h2{text-wrap:balance}
"""

# Логотип вставляется при сборке из brand.json; без логотипа метка пропадает, вёрстка не меняется.
LOGO = "@@LOGO(30)@@"
LOGO_WHITE = "@@LOGO_WHITE(34)@@"


def page(sec, title, body, notes=None, lead=None):
    """Обычный слайд: метка раздела + логотип, заголовок-вывод 38px, тело по центру по вертикали.
    Высота тела: ≈684 px при заголовке в одну строку, ≈638 px — в две.
    notes — текст для докладчика (в PDF не виден, в PPTX уходит в заметки слайда).
    lead — одна строка полного вывода под коротким заголовком-тезисом (приём режима дизайна:
    «Вес движка решает» и ниже строка, почему); отнимает у тела ≈50 px."""
    nt = f'<aside class="notes">{notes}</aside>' if notes else ""
    ld = f'<p class="lead">{lead}</p>' if lead else ""
    return (f'<section class="slide"><div class="pg"><div class="hd"><span class="sec">{sec}</span>'
            f'<span style="margin-left:auto;display:flex">{LOGO}</span></div>'
            f'<h1 class="at">{title}</h1>{ld}<div class="bd">{body}</div></div><span class="no">PG</span>{nt}</section>')


def mn(v):
    """Целое с неразрывным пробелом-разделителем тысяч: 1&nbsp;867."""
    return f"{v:,.0f}".replace(",", "&nbsp;")


def bn(v):
    """Миллионы → миллиарды с одним знаком и запятой: 2810 → «2,8»."""
    return f"{v / 1000:.1f}".replace(".", ",")


# ── бренд ─────────────────────────────────────────────────────────────────────────────────────
def find_brand(name_or_path=None):
    """Путь к папке бренда: явный путь; иначе имя ищется в brands-local/ (не в git), затем в brands/.
    Имя по умолчанию — переменная окружения DECK_BRAND, иначе нейтральная палитра без логотипа."""
    name = name_or_path or os.environ.get("DECK_BRAND")
    if not name:
        return None
    if os.path.isdir(name):
        return os.path.abspath(name)
    if os.path.isfile(name):
        return os.path.dirname(os.path.abspath(name))
    for root in ("brands-local", "brands"):
        p = os.path.join(SKILL, root, name)
        if os.path.isfile(os.path.join(p, "brand.json")):
            return p
    raise FileNotFoundError(f"Бренд «{name}» не найден ни в brands-local/, ни в brands/")


def load_brand(name_or_path=None):
    d = find_brand(name_or_path)
    if not d:
        return {"name": "neutral", "dir": None, "colors": {}, "logo": None, "logo_white": None}
    b = json.load(io.open(os.path.join(d, "brand.json"), encoding="utf-8"))
    b["dir"] = d
    return b


def _data_uri(path):
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "svg": "image/svg+xml",
            "ttf": "font/ttf", "otf": "font/otf", "woff2": "font/woff2"}[ext]
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode("ascii")


def _remap_colors(html, brand):
    """Цвета бренда: ключ — роль палитры (primary, accent, …) или исходный цвет «#RRGGBB»."""
    table = {}
    for k, v in (brand.get("colors") or {}).items():
        src = ROLES.get(k, k)
        if re.fullmatch(r"#[0-9A-Fa-f]{6}", src):
            table[src.upper()] = v
    if not table:
        return html
    rx = re.compile("|".join(re.escape(k) for k in table), re.I)
    return rx.sub(lambda m: table[m.group(0).upper()], html)


def _logos(html, brand):
    def img(key, h):
        f = brand.get(key) or (brand.get("logo") if key == "logo_white" else None)
        if not f or not brand.get("dir"):
            return ""
        p = os.path.join(brand["dir"], f)
        flt = ";filter:brightness(0) invert(1)" if key == "logo_white" and not brand.get("logo_white") else ""
        return f'<img class="lg" src="{_data_uri(p)}" alt="" style="height:{h}px;width:auto{flt}">'
    html = re.sub(r"@@LOGO\((\d+)\)@@", lambda m: img("logo", m.group(1)), html)
    return re.sub(r"@@LOGO_WHITE\((\d+)\)@@", lambda m: img("logo_white", m.group(1)), html)


FAMILIES = {   # встроенные шрифты (SIL OFL): семейство → [(насыщенность, файл)]
    "IBM Plex Sans": [(400, "ibm-plex-sans/IBMPlexSans-Regular.ttf"), (500, "ibm-plex-sans/IBMPlexSans-Medium.ttf"),
                      (600, "ibm-plex-sans/IBMPlexSans-SemiBold.ttf"), (700, "ibm-plex-sans/IBMPlexSans-Bold.ttf")],
    "Onest": [(400, "onest/Onest-Regular.ttf"), (500, "onest/Onest-Medium.ttf"),
              (600, "onest/Onest-SemiBold.ttf"), (700, "onest/Onest-Bold.ttf")],
    "Unbounded": [(500, "unbounded/Unbounded-Medium.ttf"), (600, "unbounded/Unbounded-SemiBold.ttf"),
                  (700, "unbounded/Unbounded-Bold.ttf")],
    "Caveat": [(700, "caveat/Caveat-Bold.ttf")],   # пометки — только жирным
}
FALLBACK = "'Segoe UI',Arial,sans-serif"


def font_css(families=("IBM Plex Sans", "Caveat")):
    """@font-face со шрифтами внутри HTML: печать и экспорт работают без сети и без установки шрифтов.
    Встраиваются только нужные семейства — дек не раздувается."""
    out = []
    for fam in dict.fromkeys(families):
        for wt, rel in FAMILIES.get(fam, []):
            p = os.path.join(FONTS_DIR, rel)
            if os.path.exists(p):
                out.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{wt};"
                           f"src:url({_data_uri(p)}) format('truetype')}}")
    return "\n".join(out)


def typography(brand):
    """Шрифты бренда: fonts.text — текст, fonts.display — заголовки и крупные числа (по умолчанию тот же)."""
    f = brand.get("fonts") or {}
    text = f.get("text", "IBM Plex Sans")
    disp = f.get("display", text)
    css = f":root{{--ft:'{text}',{FALLBACK};--fd:'{disp}','{text}',{FALLBACK}}}"
    return (text, disp), css


# ── типографика ───────────────────────────────────────────────────────────────────────────────
_NB = re.compile(r"(?<![\w-])(в|к|с|и|а|о|у|на|по|за|из|от|до|для|без|при|про|не|ни|во|со|об)\s+(?=[\w«(≈0-9])", re.I)


def nbsp(html):
    """Неразрывный пробел после коротких предлогов, союзов и частиц (не оставлять «в», «к», «на» в конце строки)
    и «склейка» (U+2060) вокруг тире в диапазонах чисел «2–5», «2027–2031» — чтобы диапазон не рвался переносом.
    Меняет только текст между тегами, атрибуты и стили не трогает."""
    def fix(t):
        t = _NB.sub(lambda k: k.group(1) + "&nbsp;", t)
        return re.sub(r"(\d)–(\d)", lambda m: m.group(1) + "⁠–⁠" + m.group(2), t)
    return re.sub(r">([^<>]+)<", lambda m: ">" + fix(m.group(1)) + "<", html)


def build(slides, title, path, css=CSS, brand=None, typo=True):
    """Склеивает слайды в один самодостаточный HTML (шрифты и логотип внутри) и возвращает число слайдов.
    brand — имя или путь бренда (по умолчанию DECK_BRAND или нейтральная палитра)."""
    b = load_brand(brand)
    out = []
    for i, sec in enumerate(slides, 1):
        sec = nbsp(sec) if typo else sec
        out.append(sec.replace('<span class="no">PG</span>', f'<span class="no">{i}</span>'))
    (text, disp), vars_css = typography(b)
    html = (f'<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>{title}</title>'
            f'<style>{font_css((text, disp, "Caveat"))}\n{vars_css}\n{css}\n{b.get("css", "")}</style></head><body>'
            + "".join(out) + "</body></html>")
    html = _logos(_remap_colors(html, b), b)
    io.open(path, "w", encoding="utf-8").write(html)
    return len(slides)


build_typo = build   # совместимость со старыми генераторами

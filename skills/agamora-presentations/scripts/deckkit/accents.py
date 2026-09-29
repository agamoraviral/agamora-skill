# -*- coding: utf-8 -*-
"""Приёмы режима дизайна: как расставить акценты, чтобы слайд читался сам.

Порядок чтения задаётся раскладкой: метка раздела → короткий заголовок-тезис → (лид-строка) →
ОДИН акцент (главное число, лидирующая полоса, линия порога, тёмная карточка «наш вывод») →
доказательства тихим тоном → вывод одной фразой внизу. Всё, что не акцент, — нейтральное.

- kv_rows()        — строки «метка — значение» на тонких линиях вместо карточек и таблиц;
- hero_number()    — асимметрия: крупное число слева цветом акцента, доказательства справа;
- threshold_bars() — горизонтальные полосы с подписями значений и пунктирным порогом, подписанным на месте;
- rank_bars()      — рейтинг: лидер — основным цветом, второй эшелон — вторым, остальные — бледно;
- segment_bar()    — отрезок процесса или времени, разбитый на фазы, с описаниями под полосой;
- focus_cards()    — ряд светлых карточек, одна тёмная — «наш вывод» или «кульминация»;
- section_slide()  — слайд-раздел на всю площадь цветом бренда (ритм дека, не чаще раза на раздел);
- takeaway()       — вывод одной жирной фразой внизу тела слайда.
Все размеры — для тела шириной 1456 px; кегли не меньше 20 px.
"""
from .tokens import NAVY, BLUE, LBLUE, SKY, INK, BODY, MUTED, RULE, PALE, RED, EXTRA
from .primitives import slant_bars


def kv_rows(rows, label_w=240, size=26, pad=24, gap=28):
    """rows: [(метка, значение)] — метка жирным слева, значение справа; строки разделены линиями 2 px.
    Заменяет карточки и таблицы там, где нужно перечислить свойства, условия, рамки."""
    out = []
    for i, (k, v) in enumerate(rows):
        bottom = f"border-bottom:2px solid {RULE};" if i == len(rows) - 1 else ""
        out.append(f'<div style="display:flex;gap:{gap}px;padding:{pad}px 0;border-top:2px solid {RULE};{bottom}">'
                   f'<div style="width:{label_w}px;flex-shrink:0;font-size:{size}px;font-weight:700;line-height:1.35;color:{INK}">{k}</div>'
                   f'<div style="flex:1;min-width:0;font-size:{size}px;line-height:1.4;color:{BODY}">{v}</div></div>')
    return '<div style="display:flex;flex-direction:column">' + "".join(out) + "</div>"


def hero_number(value, unit, caption, sub=None, rows=None, color=NAVY, size=150, left_w=580, label_w=220):
    """Слева — главное число (шрифт заголовков, цвет акцента) с подписью 30 px и пояснением 24 px;
    справа — строки «метка — значение» (rows). Для слайдов «цель и рамки», «итог», «эффект»."""
    us = (f'<span style="font-size:{int(size * 0.36)}px;letter-spacing:0;margin-left:12px">{unit}</span>' if unit else "")
    sb = f'<div style="font-size:24px;line-height:1.4;color:{MUTED}">{sub}</div>' if sub else ""
    left = (f'<div style="width:{left_w}px;flex-shrink:0;display:flex;flex-direction:column;gap:18px">'
            f'<div class="num" style="font-size:{size}px;font-weight:700;line-height:1;letter-spacing:-3px;color:{color};'
            f'white-space:nowrap">{value}{us}</div>'
            f'<div style="font-size:30px;line-height:1.3;color:{INK}">{caption}</div>{sb}</div>')
    right = f'<div style="flex:1;min-width:0">{kv_rows(rows, label_w)}</div>' if rows else ""
    return f'<div style="display:flex;gap:72px;align-items:flex-start">{left}{right}</div>'


def threshold_bars(rows, vmax, threshold=None, t_label="", hi=None, W=1456, label_w=300, value_w=170,
                   bar_h=46, gap=26, color=LBLUE, hi_color=NAVY, t_color=RED):
    """rows: [(подпись, значение, текст значения)]; vmax — правый край шкалы.
    hi — индексы акцентных полос; по умолчанию акцентны полосы за порогом (или самая длинная без порога).
    Порог — пунктирная линия с подписью на месте (например «5 МБ — бюджет первой загрузки»)."""
    x0 = label_w + 24
    bar_max = W - x0 - value_w
    if hi is None:
        hi = ([i for i, r in enumerate(rows) if threshold is not None and r[1] > threshold]
              or [max(range(len(rows)), key=lambda i: rows[i][1])])
    top = 52 if threshold is not None and t_label else 0
    H = top + len(rows) * (bar_h + gap) - gap
    out = [f'<div style="position:relative;width:{W}px;height:{H}px">']
    for i, (lab, v, txt) in enumerate(rows):
        y = top + i * (bar_h + gap)
        w = max(4, v / vmax * bar_max)
        c = hi_color if i in hi else color
        out.append(f'<div style="position:absolute;left:0;top:{y}px;width:{label_w}px;height:{bar_h}px;display:flex;align-items:center;'
                   f'font-size:26px;font-weight:600;color:{INK}">{lab}</div>'
                   f'<div style="position:absolute;left:{x0}px;top:{y}px;width:{w:.0f}px;height:{bar_h}px;background:{c}"></div>'
                   f'<div style="position:absolute;left:{x0 + w + 14:.0f}px;top:{y}px;height:{bar_h}px;display:flex;align-items:center;'
                   f'white-space:nowrap;font-size:26px;font-weight:{700 if i in hi else 400};color:{INK if i in hi else BODY}">{txt}</div>')
    if threshold is not None:
        tx = x0 + threshold / vmax * bar_max
        out.append(f'<svg style="position:absolute;left:0;top:0" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
                   f'<line x1="{tx:.0f}" y1="{top - 8 if top else 0}" x2="{tx:.0f}" y2="{H}" stroke="{t_color}" stroke-width="3" '
                   f'stroke-dasharray="8 7"/></svg>')
        if t_label:
            out.append(f'<div style="position:absolute;left:{tx + 14:.0f}px;top:0;white-space:nowrap;font-size:22px;font-weight:700;'
                       f'color:{t_color}">{t_label}</div>')
    out.append("</div>")
    return "".join(out)


def rank_bars(rows, vmax=None, first=1, second=2, W=1456, label_w=640, bar_h=38, gap=26):
    """Рейтинг: rows: [(название, пояснение, значение)] по убыванию. Первые first — основным цветом,
    следующие second — вторым, остальные — бледно. Значение — жирным у конца полосы."""
    vmax = vmax or max(r[2] for r in rows)
    x0, value_w = label_w + 28, 90
    bar_max = W - x0 - value_w
    out = [f'<div style="position:relative;width:{W}px;height:{len(rows) * (bar_h + gap) - gap}px">']
    for i, (name, desc, v) in enumerate(rows):
        y = i * (bar_h + gap)
        c = NAVY if i < first else (BLUE if i < first + second else LBLUE)
        w = max(4, v / vmax * bar_max)
        d = f'<span style="font-weight:400;color:{BODY}">: {desc}</span>' if desc else ""
        out.append(f'<div style="position:absolute;left:0;top:{y - 4}px;width:{label_w}px;height:{bar_h + 8}px;display:flex;'
                   f'align-items:center;white-space:nowrap;overflow:hidden;font-size:24px;font-weight:700;color:{INK}">{name}{d}</div>'
                   f'<div style="position:absolute;left:{x0}px;top:{y}px;width:{w:.0f}px;height:{bar_h}px;background:{c}"></div>'
                   f'<div style="position:absolute;left:{x0 + w + 14:.0f}px;top:{y - 4}px;height:{bar_h + 8}px;display:flex;'
                   f'align-items:center;font-size:26px;font-weight:700;color:{INK}">{v}</div>')
    out.append("</div>")
    return "".join(out)


def segment_bar(segs, total, W=1456, h=64, desc_size=22):
    """Отрезок процесса или времени, разбитый на фазы. segs: [(начало, конец, цвет, надпись на полосе, описание)].
    Надпись на полосе — границы фазы («0,15–0,85»), описание под полосой — что происходит. Акцент — цветом фазы."""
    out = [f'<div style="position:relative;width:{W}px;height:{h + 110}px">']
    for a, b, c, lab, desc in segs:
        x, w = a / total * W, (b - a) / total * W
        fg = "#fff" if c.upper() not in (LBLUE.upper(), PALE.upper(), "#FFFFFF") else INK
        out.append(f'<div style="position:absolute;left:{x:.0f}px;top:0;width:{w:.0f}px;height:{h}px;background:{c};'
                   f'display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:{fg};'
                   f'white-space:nowrap">{lab}</div>'
                   f'<div style="position:absolute;left:{x:.0f}px;top:{h + 14}px;width:{max(w - 16, 120):.0f}px;font-size:{desc_size}px;'
                   f'line-height:1.35;color:{BODY}">{desc}</div>')
    out.append("</div>")
    return "".join(out)


def focus_cards(items, focus=None, h=None):
    """Ряд плоских карточек: items: [(метка, заголовок, текст)]; focus — индекс тёмной карточки
    («наш вывод», «кульминация»; по умолчанию последняя). Остальные светлые и тихие."""
    focus = len(items) - 1 if focus is None else focus
    hh = f"height:{h}px;" if h else ""
    cards = []
    for i, (lab, title, text) in enumerate(items):
        dark = i == focus
        bg, tc, bc, lc = (NAVY, "#fff", EXTRA["on_navy_text"], LBLUE) if dark else (PALE, INK, BODY, BLUE)
        lb = (f'<div style="font-size:20px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:{lc}">{lab}</div>'
              if lab else "")
        cards.append(f'<div style="flex:1;min-width:0;{hh}background:{bg};padding:32px 34px;display:flex;flex-direction:column;gap:14px">'
                     f'{lb}<div style="font-size:30px;font-weight:700;line-height:1.2;color:{tc}">{title}</div>'
                     f'<div style="font-size:22px;line-height:1.4;color:{bc}">{text}</div></div>')
    return '<div style="display:flex;gap:24px;align-items:stretch">' + "".join(cards) + "</div>"


def section_slide(eyebrow, title, text=None, bg=NAVY, fg="#fff", eyebrow_color=LBLUE, text_color=None):
    """Слайд-раздел на всю площадь: метка, огромный заголовок (шрифт заголовков, 112 px), строка пояснения,
    фирменный мотив справа внизу. Даёт ритм длинному деку; не чаще одного на раздел."""
    tc = text_color or EXTRA["on_navy_text"]
    tx = f'<div style="font-size:32px;line-height:1.35;color:{tc};max-width:1100px;margin-top:34px">{text}</div>' if text else ""
    return (f'<section class="slide" style="background:{bg}"><div style="position:absolute;inset:0;padding:0 120px;display:flex;'
            f'flex-direction:column;justify-content:center">'
            f'<div style="font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{eyebrow_color}">{eyebrow}</div>'
            f'<div class="num" style="font-size:112px;font-weight:700;line-height:1.02;letter-spacing:-3px;color:{fg};margin-top:26px">{title}</div>'
            f'{tx}</div>'
            f'<svg viewBox="0 0 260 110" style="position:absolute;right:96px;bottom:84px;width:260px;height:110px">'
            f'{slant_bars(0, 0, 210, 26, 16)}</svg><span class="no">PG</span></section>')


def takeaway(text, color=INK, size=30):
    """Вывод одной фразой внизу тела: жирный 30 px, без плашки и рамки."""
    return f'<div style="font-size:{size}px;font-weight:700;line-height:1.3;color:{color};max-width:1320px">{text}</div>'

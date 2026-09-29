# -*- coding: utf-8 -*-
"""Плоская обложка-поток swarm_to_bank(): читается сверху вниз одной фразой —
«рой агентов» → полоса платформы (единый вход, правила и учёт) → сетка систем.

Один ключевой смысл, три-четыре крупных элемента, подписи крупные. Случайная подсветка сетки задаётся
зерном (seed), поэтому картинка воспроизводима. Надписи — параметры."""
import random
from .tokens import NAVY, BLUE, LBLUE, SKY
from .primitives import pgram

ROWS = [(96, 600, 9), (150, 520, 8), (204, 430, 7), (256, 330, 5), (304, 220, 4)]   # (y ряда, ширина, число агентов)


def bot(x, y, sz, fill, op):
    """Робот-агент: антенна, корпус со скруглением 20 %, глаза и рот цветом фона (NAVY)."""
    h = sz * 0.78
    return (f'<g opacity="{op:.2f}"><line x1="{x:.1f}" y1="{y - h / 2 - sz * .18:.1f}" x2="{x:.1f}" y2="{y - h / 2:.1f}" stroke="{fill}" stroke-width="{sz * .07:.1f}"/>'
            f'<circle cx="{x:.1f}" cy="{y - h / 2 - sz * .22:.1f}" r="{sz * .07:.1f}" fill="{fill}"/>'
            f'<rect x="{x - sz / 2:.1f}" y="{y - h / 2:.1f}" width="{sz:.1f}" height="{h:.1f}" rx="{sz * .2:.1f}" fill="{fill}"/>'
            f'<circle cx="{x - sz * .19:.1f}" cy="{y - h * .05:.1f}" r="{sz * .08:.1f}" fill="{NAVY}"/><circle cx="{x + sz * .19:.1f}" cy="{y - h * .05:.1f}" r="{sz * .08:.1f}" fill="{NAVY}"/>'
            f'<rect x="{x - sz * .16:.1f}" y="{y + h * .2:.1f}" width="{sz * .32:.1f}" height="{sz * .06:.1f}" fill="{NAVY}"/></g>')


def swarm_to_bank(W=760, H=900, top_label="Рой агентов ИИ", band_word="Платформа", band_l1="единый вход", band_l2="правила и учёт",
                  bottom_label="все системы компании", rows=ROWS, grid=(12, 5), seed=5):
    rnd = random.Random(seed)
    cx = W / 2
    o = [f'<circle cx="{cx}" cy="250" r="300" fill="#0B3F8F" opacity=".45"/>']
    GTOP, GH = 392, 96
    pts = []
    for y, wdt, n in rows:
        for i in range(n):
            x = cx - wdt / 2 + (i + 0.5) * wdt / n + rnd.uniform(-16, 16)
            pts.append((x, y + rnd.uniform(-12, 12)))
    for x, y in pts:                                            # связи агентов с полосой платформы
        o.append(f'<path d="M{x:.1f},{y + 18:.1f} Q{(x + cx) / 2:.1f},{(y + GTOP) / 2 + 30:.1f} {cx + (x - cx) * .25:.1f},{GTOP - 6}" fill="none" '
                 f'stroke="{SKY}" stroke-width="1.4" opacity=".35"/>')
    for x, y in pts:                                            # агенты мельче к низу — перспектива
        sz = rnd.choice([30, 34, 38, 44]) * (1.12 - (y - 96) / 700)
        o.append(bot(x, y, sz, rnd.choice(["#FFFFFF", "#BFE6FF", "#8FD3FF"]), rnd.uniform(.75, 1)))
    o.append(pgram(cx - 300, GTOP - 30, 600, 16, SKY, 6) + pgram(cx - 300 + 34, GTOP + GH + 14, 600, 16, SKY, 6))
    o.append(pgram(cx - 300 + 17, GTOP, 600, GH, "#FFFFFF", 34))
    o.append(f'<text x="{cx - 236}" y="{GTOP + 66}" font-size="{min(56, int(56 * 5 / max(5, len(band_word))))}" font-weight="700" fill="{NAVY}" letter-spacing="{5 if len(band_word) <= 5 else 1}" textLength="{min(240, 48 * len(band_word))}" lengthAdjust="spacingAndGlyphs">{band_word}</text>'
             f'<line x1="{cx + 4}" y1="{GTOP + 22}" x2="{cx + 4}" y2="{GTOP + 76}" stroke="{LBLUE}" stroke-width="2"/>'
             f'<text x="{cx + 28}" y="{GTOP + 44}" font-size="25" font-weight="700" fill="{NAVY}">{band_l1}</text>'
             f'<text x="{cx + 28}" y="{GTOP + 76}" font-size="25" font-weight="600" fill="{BLUE}">{band_l2}</text>')
    cols, rws = grid
    GY0, sq, gp = GTOP + GH + 74, 30, 12
    gw = cols * (sq + gp) - gp
    gx0 = cx - gw / 2
    for i in range(cols):                                       # лучи от полосы к системам
        xb = gx0 + i * (sq + gp) + sq / 2
        o.append(f'<path d="M{cx + (xb - cx) * .5:.1f},{GTOP + GH + 30} L{xb:.1f},{GY0 - 6}" stroke="{SKY}" stroke-width="1.6" opacity=".55"/>')
    for r in range(rws):
        for c in range(cols):
            lit = rnd.random() < 0.55
            o.append(f'<rect x="{gx0 + c * (sq + gp):.1f}" y="{GY0 + r * (sq + gp):.1f}" width="{sq}" height="{sq}" fill="{SKY if lit else "#2B5FA8"}" '
                     f'opacity="{1 if lit else .9}"/>')
    lab = lambda y, t: (f'<div style="position:absolute;left:0;top:{y}px;width:{W}px;text-align:center;font-size:25px;font-weight:700;color:#fff;'
                        f'letter-spacing:.3px">{t}</div>')
    return (f'<div style="position:relative;width:{W}px;height:{H}px"><svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">'
            f'{"".join(o)}</svg>{lab(26, top_label)}{lab(GY0 + rws * (sq + gp) + 14, bottom_label)}</div>')

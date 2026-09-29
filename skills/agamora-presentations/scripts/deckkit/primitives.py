# -*- coding: utf-8 -*-
"""Примитивы: крупное число, рукописная пометка (HTML и SVG), изогнутая стрелка, наконечник,
наклонная полоса (параллелограмм) и три наклонные полосы — фирменный мотив.

Рукописная пометка — «человеческий» акцент: одна на слайд, 2–6 слов, у ключевой цифры, не поверх подписей
графика; шрифт Caveat встроен в HTML (hand() принимает «видимый» кегль 25–30 и масштабирует под шрифт)."""
import math
from .tokens import NAVY, BLUE, SKY, BODY, HAND_FONT, HAND_SCALE

_HAND_SVG = HAND_FONT.replace("'", "")


def big(v, u="", l="", size=96, color=NAVY, lsize=24, lcolor=BODY):
    """Крупное число с единицей и подписью. Кегли в эталоне: 60 (вторичное), 76–96 (показатели), 104–116 (главное)."""
    us = f'<span style="font-size:{int(size * 0.36)}px;font-weight:600;margin-left:10px;letter-spacing:0">{u}</span>' if u else ""
    ls = f'<div style="font-size:{lsize}px;line-height:1.3;color:{lcolor};margin-top:12px">{l}</div>' if l else ""
    return (f'<div><div class="num" style="font-size:{size}px;font-weight:700;color:{color};line-height:1;letter-spacing:-1.5px;white-space:nowrap">{v}{us}</div>'
            f'{ls}</div>')


def hand(text, size=27, rot=-4, color=BLUE):
    """Рукописная пометка у ключевой цифры (HTML). Одна на слайд, 2–6 слов, не поверх подписей графика.
    Класс .hand из tokens.CSS задаёт шрифт и nowrap; перенос — только явным <br>."""
    return f'<div class="hand" style="font-size:{size * HAND_SCALE:.0f}px;color:{color};transform:rotate({rot}deg)">{text}</div>'


def hand_svg(x, y, text, size=27, rot=-4, color=BLUE):
    """Та же пометка внутри SVG графика (поворот вокруг точки привязки)."""
    return (f'<text x="{x}" y="{y}" font-family="{_HAND_SVG}" font-weight="700" font-size="{size * HAND_SCALE:.0f}" fill="{color}" '
            f'transform="rotate({rot} {x} {y})">{text}</text>')


def arrow_head(x1, y1, x2, y2, color, L=16, W=8):
    """Треугольный наконечник в точке (x2, y2) по направлению из (x1, y1).
    Возвращает (svg, точка основания) — линию нужно доводить до основания, чтобы она не торчала из острия.
    В эталоне называется _head()."""
    dx, dy = x2 - x1, y2 - y1
    n = math.hypot(dx, dy) or 1
    ux, uy = dx / n, dy / n
    bx, by = x2 - L * ux, y2 - L * uy
    return (f'<path d="M{x2:.1f},{y2:.1f} L{bx - uy * W:.1f},{by + ux * W:.1f} L{bx + uy * W:.1f},{by - ux * W:.1f} Z" fill="{color}"/>', (bx, by))


_head = arrow_head   # имя из эталона


def curve_arrow(x1, y1, cx1, cy1, cx2, cy2, x2, y2, color=BLUE):
    """Кубическая кривая Безье со стрелкой — «от пометки к цифре». Контрольные точки задаются руками."""
    hp = arrow_head(cx2, cy2, x2, y2, color, 14, 7)[0]
    return f'<path d="M{x1},{y1} C{cx1},{cy1} {cx2},{cy2} {x2},{y2}" fill="none" stroke="{color}" stroke-width="2.4"/>' + hp


def pgram(x, y, w, h, fill, sk=None, extra=""):
    """Наклонная полоса — фирменный мотив (параллелограмм, верх сдвинут вправо на sk)."""
    sk = h * 0.36 if sk is None else sk
    return f'<path d="M{x + sk:.1f},{y:.1f} H{x + w:.1f} L{x + w - sk:.1f},{y + h:.1f} H{x:.1f} Z" fill="{fill}"{extra}/>'


def slant_bars(x, y, w, h, gap, fill=SKY, opacity=1):
    """Три наклонные полосы лесенкой — фирменный мотив. В эталоне: обложка (210×26, зазор 16, в SVG 260×110) и
    тёмная панель короткой версии (190×24, зазор 14, в SVG 230×100 — показ в 180×78)."""
    sk = h * 0.36
    shift = (h + gap) * sk / h
    op = f' opacity="{opacity}"' if opacity < 1 else ""
    return "".join(pgram(x + (2 - i) * shift, y + i * (h + gap), w, h, fill, sk, op) for i in range(3))


def slant_bars_svg(w=260, h=110, bar_w=210, bar_h=26, gap=16, fill=SKY):
    """Готовый блок-SVG с тремя полосами (как на обложке эталона)."""
    return f'<svg viewBox="0 0 {w} {h}" style="width:{w}px;height:{h}px">{slant_bars(0, 0, bar_w, bar_h, gap, fill)}</svg>'

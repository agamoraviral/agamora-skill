# -*- coding: utf-8 -*-
"""Холст схемы Canvas — главный инструмент «схема вместо текста».

Блоки — HTML с автопереносом текста (подписи не обрезаются), связи — SVG поверх: ортогональные линии,
стрелки, пунктир. Размер холста задаётся под высоту тела слайда (≈560–660 px), а не растягивается рядами.
Виды блоков BOX: line — обычный участник; navy — главный узел; blue — агент или активная роль;
sky — целевое состояние; grey — «как есть»; dash — предложение, которого ещё нет.
chain() — цепочка блоков слева направо со стрелками; Anchors — точки привязки блока для связей."""
from .tokens import NAVY, BLUE, PALE, INK, BODY, MUTED
from .icons import icon
from .primitives import arrow_head

# вид блока → (фон, рамка, цвет заголовка, цвет подписи)
BOX = {"line": ("#fff", "2px solid #AEBBCB", INK, MUTED),            # обычный участник схемы
       "navy": (NAVY, f"2px solid {NAVY}", "#fff", "#C9D8EE"),         # главный узел (платформа, единый вход)
       "blue": (BLUE, f"2px solid {BLUE}", "#fff", "#EAF3FC"),         # агенты, текущая работа
       "pale": (PALE, f"2px solid {PALE}", NAVY, BODY),                # тихая подложка-блок
       "sky": ("#E3F2FB", "2px solid #E3F2FB", NAVY, BODY),            # светло-голубой (модель ИИ, TO BE)
       "dash": ("#fff", f"2px dashed {BLUE}", NAVY, BODY),             # «предлагаем добавить», будущее
       "grey": ("#F4F5F7", "2px solid #D5DAE1", "#4B5563", "#5F6B7C")}  # внешнее, отключённое, AS IS


class Canvas:
    """Холст схемы в пикселях слайда: блоки — HTML (текст переносится сам), линии и стрелки — SVG."""

    def __init__(self, w, h):
        self.w, self.h, self.under, self.svg, self.over = w, h, [], [], []

    def zone(self, x, y, w, h, fill=PALE, border="", label="", lcolor=NAVY):
        """Подложка-зона (AS IS / TO BE, «Контур банка», «При разработке»). Подпись 22 px в левом верхнем углу."""
        lab = (f'<div style="position:absolute;left:24px;top:18px;font-size:22px;font-weight:700;color:{lcolor}">{label}</div>' if label else "")
        bd = f"border:{border};" if border else ""
        self.under.append(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{fill};{bd}">{lab}</div>')

    def box(self, x, y, w, h, t, s="", kind="line", size=24, align="center", ssize=20, ico=None, isz=48, top=None):
        """Блок-участник. align="center" — иконка над текстом; "left" — иконка слева.
        top — цвет верхней линейки 6 px (выделение ряда результатов). Типичные кегли: 23–30 заголовок, 20–22 подпись."""
        bg, bd, tc, sc = BOX[kind]
        tb = f"border-top:6px solid {top};" if top else ""
        ic = icon(ico, isz, tc if kind in ("navy", "blue") else NAVY) if ico else ""
        sub = f'<div style="font-size:{ssize}px;line-height:1.3;color:{sc};margin-top:6px">{s}</div>' if s else ""
        lay = ("flex-direction:column;justify-content:center;align-items:center;text-align:center" if align == "center"
               else "flex-direction:row;align-items:center;text-align:left")
        self.over.append(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};border:{bd};{tb}'
                         f'display:flex;{lay};padding:12px 20px;gap:{12 if align == "center" else 18}px">'
                         f'{ic}<div><div style="font-size:{size}px;font-weight:700;line-height:1.22;color:{tc}">{t}</div>{sub}</div></div>')
        return Anchors(x, y, w, h)   # добавлено: точки привязки для стрелок

    def text(self, x, y, w, html, size=22, color=BODY, weight=400, align="left", lh=1.3):
        """Свободная подпись шириной w (перенос автоматический)."""
        self.over.append(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;font-size:{size}px;line-height:{lh};color:{color};'
                         f'font-weight:{weight};text-align:{align}">{html}</div>')

    def put(self, x, y, html, w=None):
        """Вставить готовый HTML (big(), hand(), иконку, «вафлю») в точку."""
        ww = f"width:{w}px;" if w else ""
        self.over.append(f'<div style="position:absolute;left:{x}px;top:{y}px;{ww}">{html}</div>')

    def line(self, pts, color="#8A96A6", width=2.4, dash="", head=True):
        """Ломаная по точкам; head=True — наконечник на последней точке (линия укорачивается до основания)."""
        pts = [tuple(p) for p in pts]
        hp = ""
        if head:
            hp, pts[-1] = arrow_head(*pts[-2], *pts[-1], color)
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{da}/>' + hp)

    def raw(self, s):
        """Любой SVG-фрагмент в слой линий (круги, многоугольники, pgram, hand_svg)."""
        self.svg.append(s)

    def html(self):
        return (f'<div class="cv" style="width:{self.w}px;height:{self.h}px">{"".join(self.under)}'
                f'<svg viewBox="0 0 {self.w} {self.h}" style="position:absolute;left:0;top:0;width:{self.w}px;height:{self.h}px;overflow:visible">'
                f'{"".join(self.svg)}</svg>{"".join(self.over)}</div>')


class Anchors:
    """Добавлено (в эталоне нет): середины сторон блока, чтобы не считать координаты стрелок вручную.
    Пример: a = cv.box(...); b = cv.box(...); cv.line([a.r, b.l])."""

    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.l, self.r = (x, y + h / 2), (x + w, y + h / 2)
        self.t, self.b = (x + w / 2, y), (x + w / 2, y + h)
        self.c = (x + w / 2, y + h / 2)


def chain(cv, items, y, h, w, step, kinds_arrow=None, size=27, ssize=20, isz=60, arrow_w=3):
    """Добавлено: частый приём эталона — ряд блоков слева направо со стрелками между ними.
    items: [(заголовок, подпись, вид, иконка)], step — шаг по x, w — ширина блока, стрелка занимает зазор step − w.
    kinds_arrow: функция i → цвет стрелки к блоку i (в эталоне к главному узлу стрелка тёмно-синяя)."""
    for i, (t, d, k, ic) in enumerate(items):
        x = i * step
        cv.box(x, y, w, h, t, d, k, size, "center", ssize, ic, isz)
        if i:
            col = kinds_arrow(i) if kinds_arrow else NAVY
            cv.line([(x - (step - w) + 4, y + h / 2), (x - 2, y + h / 2)], col, arrow_w)

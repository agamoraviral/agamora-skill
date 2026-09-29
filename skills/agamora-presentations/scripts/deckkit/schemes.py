# -*- coding: utf-8 -*-
"""Схемы — форма подачи под смысл:
- asis_tobe() — AS IS / TO BE: две зоны на разном фоне и явная стрелка между ними;
- net_panel()/net_compare() — «паутина» разрозненных подключений против единого входа (цена бездействия);
- stair()/stairs() — лестница зрелости с отметкой «мы здесь»;
- ring()/ring_node()/two_loops() — две разведённые петли процесса (люди днями, агенты минутами);
- swimlane() — дорожки «человек / агенты» по шагам задачи;
- milestones()/timeline_dots() — контрольные точки на шкале;
- onion() — слои вокруг ядра с выносками;
- band()/bands() — «дни против часов» полосами;
- year_steps() — этапы нескольких лет ступенями из наклонных полос;
- decisions()/callout() — решения и вывод.
Геометрия рассчитана на ширину тела 1456 px; данные и подписи — параметры."""
import math
from .tokens import NAVY, BLUE, LBLUE, SKY, INK, BODY, MUTED, RULE, PALE, RED
from .canvas import Canvas
from .icons import icon
from .primitives import arrow_head, pgram, hand, big


# ─────────────────────────────── «было → стало»
def asis_tobe(W=1456, H=580, zone_w=640, asis_sub="сегодня", tobe_sub="2027–2028"):
    """Возвращает холст с двумя зонами AS IS (#F4F5F7) и TO BE (#E3F2FB), заголовками 40 px и
    толстой стрелкой-многоугольником NAVY между ними. Блоки внутри зон автор добавляет сам через cv.box/line.
    Захардкожено: заголовки «AS IS»/«TO BE» (термины, принятые у адресата); стрелка 138×116."""
    cv = Canvas(W, H)
    cv.zone(0, 0, zone_w, H, "#F4F5F7")
    cv.zone(W - zone_w, 0, zone_w, H, "#E3F2FB")
    cv.text(32, 22, 400, f'<b style="font-size:40px;color:#5B6778">AS IS</b>&nbsp;&nbsp;<span style="font-size:23px;color:#5F6B7C">{asis_sub}</span>', 23, MUTED)
    cv.text(W - zone_w + 32, 22, 400, f'<b style="font-size:40px;color:{NAVY}">TO BE</b>&nbsp;&nbsp;<span style="font-size:23px;color:{BLUE}">{tobe_sub}</span>', 23, BLUE)
    mx, my = W / 2, H / 2 + 30          # в эталоне стрелка на y 262–378 при H=580
    cv.raw(f'<polygon points="{mx - 68},{my - 28} {mx + 18},{my - 28} {mx + 18},{my - 58} {mx + 70},{my} {mx + 18},{my + 58} '
           f'{mx + 18},{my + 28} {mx - 68},{my + 28}" fill="{NAVY}"/>')
    return cv


# ─────────────────────────────── «паутина» против единого входа
def net_panel(cv, zx, hub, n_sys=12, n_svc=6, hub_label="Единый<br>вход", left_cap="системы", right_cap="сервисы платформы"):
    """Одна панель сравнения. hub=False — каждая система тянет 4 линии к «случайным» сервисам (#B7BFCB),
    hub=True — лучи систем сходятся в круг r=66 NAVY, от него к сервисам. Детерминированная «случайность»:
    (i*5 + k*7) % n_svc. Захардкожено: шаг систем 32, сервисов 64, координаты x 70 и 620 от края панели."""
    sys_y = [110 + i * 32 for i in range(n_sys)]
    svc_y = [130 + i * 64 for i in range(n_svc)]
    sx, vx = zx + 70, zx + 620
    if hub:
        hx, hy = zx + 345, 290
        for y in sys_y:
            cv.raw(f'<line x1="{sx}" y1="{y}" x2="{hx}" y2="{hy}" stroke="{BLUE}" stroke-width="2" opacity=".75"/>')
        for y in svc_y:
            cv.raw(f'<line x1="{hx}" y1="{hy}" x2="{vx}" y2="{y}" stroke="{NAVY}" stroke-width="2.6"/>')
        cv.raw(f'<circle cx="{hx}" cy="{hy}" r="66" fill="{NAVY}"/>')
        cv.text(hx - 66, hy - 30, 132, hub_label, 22, "#fff", 700, "center", 1.25)
    else:
        for i, y in enumerate(sys_y):
            for k in range(4):
                cv.raw(f'<line x1="{sx}" y1="{y}" x2="{vx}" y2="{svc_y[(i * 5 + k * 7) % n_svc]}" stroke="#B7BFCB" stroke-width="1.6"/>')
    for y in sys_y:
        cv.raw(f'<circle cx="{sx}" cy="{y}" r="8" fill="{MUTED if not hub else BLUE}"/>')
    for y in svc_y:
        cv.raw(f'<rect x="{vx - 14}" y="{y - 14}" width="28" height="28" fill="{NAVY if hub else "#5F6B7C"}"/>')
    cv.text(zx + 8, 476, 170, left_cap, 20, MUTED, 600, "left")
    cv.text(vx - 206, 476, 240, right_cap, 20, MUTED, 600, "right")


def net_compare(left_title, right_title, left_note, right_note, hand_note=None, W=1456, H=600):
    """Слайд целиком: две зоны 690 px, слева «паутина», справа хаб, внизу по одной фразе 22 px,
    над левой зоной — рукописная пометка RED («обходные решения»)."""
    cv = Canvas(W, H)
    cv.zone(0, 0, 690, H, "#F4F5F7")
    cv.zone(766, 0, 690, H, "#E3F2FB")
    cv.text(30, 22, 640, left_title, 28, "#5B6778", 700)
    cv.text(796, 22, 640, right_title, 28, NAVY, 700)
    net_panel(cv, 0, False)
    net_panel(cv, 766, True)
    cv.text(30, 530, 640, left_note, 22, "#4B5563", lh=1.3)
    cv.text(796, 530, 640, right_note, 22, BODY, lh=1.3)
    if hand_note:
        cv.put(420, 20, hand(hand_note, 29, -4, RED), 260)
    return cv.html()


# ─────────────────────────────── ступени зрелости
def stair(h, n, title, text, mark, fill, fg, sub, hi=False):
    """Одна ступень: метка над ней («Мы здесь», «Цель 2027 года»), заголовок 36, текст 24 и крупная
    полупрозрачная цифра 170 px в правом нижнем углу — заполняет пустоту плашки (приём «Антипаттерна №5»)."""
    return (f'<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">'
            f'<div style="font-size:22px;font-weight:700;margin-bottom:12px;color:{NAVY if hi else MUTED}">{mark}</div>'
            f'<div style="height:{h};background:{fill};padding:30px 32px 22px;display:flex;flex-direction:column;gap:12px">'
            f'<div style="font-size:36px;font-weight:700;color:{fg};line-height:1.15">{title}</div>'
            f'<div style="font-size:24px;line-height:1.35;color:{sub}">{text}</div>'
            f'<div style="margin-top:auto;align-self:flex-end;font-size:170px;font-weight:700;line-height:.78;color:{"#1F4A8C" if hi else "#D3DCE8"}">{n}</div></div></div>')


def stairs(steps, hi=1):
    """steps: [(заголовок, текст, метка)] — три ступени высотой 46/72/96 %; hi — индекс цели (тёмно-синяя)."""
    hs = ["46%", "72%", "96%"]
    out = []
    for i, (t, d, m) in enumerate(steps):
        if i == hi:
            out.append(stair(hs[i], i + 1, t, d, m, NAVY, "#fff", "#C9D8EE", True))
        else:
            out.append(stair(hs[i], i + 1, t, d, m, PALE if i < hi else "#E3EAF3", INK, BODY))
    return '<div style="flex:1;display:flex;gap:22px;align-items:flex-end;min-height:0">' + "".join(out) + '</div>'


# ─────────────────────────────── две петли
def ring(cv, cx, cy, r, color, ccw):
    """Окружность 3.5 px с тремя наконечниками (90°, 270° и 0°/180°) — направление вращения петли."""
    cv.raw(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="3.5"/>')
    for th in (90, 270, 0 if ccw else 180):
        t = math.radians(th)
        px, py = cx + r * math.cos(t), cy - r * math.sin(t)
        ux, uy = (-math.sin(t), -math.cos(t)) if ccw else (math.sin(t), math.cos(t))
        cv.raw(arrow_head(px - ux * 14, py - uy * 14, px + ux * 6, py + uy * 6, color, 18, 9)[0])


def ring_node(cv, cx, cy, r, th, color):
    """Узел на окружности под углом th (градусы, 0 — справа, против часовой). Белая обводка 4 px отделяет от линии."""
    t = math.radians(th)
    x, y = cx + r * math.cos(t), cy - r * math.sin(t)
    cv.raw(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="13" fill="{color}" stroke="#fff" stroke-width="4"/>')
    return x, y


def two_loops(left, right, top_link, bottom_link, W=1456, H=500):
    """Две петли. left/right: (иконка, заголовок, подзаголовок, [три шага]).
    Шаги левой петли — на 135/180/225°, правой — на 45/0/−45°, подписи 26 px жирные на выносках.
    top_link / bottom_link — подписи стрелок между петлями («спецификация» NAVY, «результат» BLUE).
    Захардкожено: центры 455 и 1001, радиус 165, колонки подписей по 252 px у краёв."""
    cv = Canvas(W, H)
    L, R, RY, RR = 455, 1001, 250, 165
    ring(cv, L, RY, RR, NAVY, True)
    ring(cv, R, RY, RR, BLUE, False)
    for cx, col, (ic, t, sub, _) in ((L, NAVY, left), (R, BLUE, right)):
        cv.put(cx - 30, RY - 112, icon(ic, 60, col))
        cv.text(cx - 120, RY - 40, 240, t, 36, col, 700, "center", 1.1)
        cv.text(cx - 120, RY + 10, 240, sub, 24, MUTED, 400, "center")
    for th, t in zip((135, 180, 225), left[3]):
        x, y = ring_node(cv, L, RY, RR, th, NAVY)
        cv.line([(262, y), (x - 16, y)], "#AEBBCB", 1.6, head=False)
        cv.put(0, y - 36, f'<div style="height:72px;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-size:26px;font-weight:700;color:{INK};line-height:1.2">{t}</div>', 252)
    for th, t in zip((45, 0, -45), right[3]):
        x, y = ring_node(cv, R, RY, RR, th, BLUE)
        cv.line([(x + 16, y), (1196, y)], "#AEBBCB", 1.6, head=False)
        cv.put(1204, y - 36, f'<div style="height:72px;display:flex;align-items:center;font-size:26px;font-weight:700;color:{INK};line-height:1.2">{t}</div>', 252)
    a1, a2 = math.radians(25), math.radians(155)
    cv.line([(L + RR * math.cos(a1), RY - RR * math.sin(a1)), (R + RR * math.cos(a2), RY - RR * math.sin(a2))], NAVY, 3)
    cv.line([(R + RR * math.cos(a2), RY + RR * math.sin(a2)), (L + RR * math.cos(a1), RY + RR * math.sin(a1))], BLUE, 3)
    cv.text(618, 138, 220, top_link, 24, NAVY, 700, "center")
    cv.text(618, 330, 220, bottom_link, 24, BLUE, 700, "center")
    return cv.html()


# ─────────────────────────────── дорожки «кто делает»
def swimlane(path, lanes=("Человек", "Агенты")):
    """Путь задачи по двум дорожкам. path: [(текст шага, в_первой_дорожке)] — до 7 шагов.
    Карточка шага: белая, рамка 2 px цвета дорожки, верх 7 px, «Шаг N» 20 px + текст 22 px.
    Переходы — ортогональные ломаные через середину зазора. Захардкожено: ширина шага 166, зазор 36,
    высота дорожки 204 — рассчитано ровно на 7 шагов в 1456 px."""
    LW, C, G, RH, RG, P = 58, 166, 36, 204, 20, 16
    X0 = LW + 16
    n = len(path)
    W, H, BH = X0 + n * C + (n - 1) * G, 2 * RH + RG, RH - 2 * P
    top = {True: 0, False: RH + RG}
    out = []
    for first, name in ((True, lanes[0]), (False, lanes[1])):
        col = NAVY if first else BLUE
        out.append(f'<div style="position:absolute;left:0;top:{top[first]}px;width:{W}px;height:{RH}px;background:{PALE}"></div>'
                   f'<div style="position:absolute;left:0;top:{top[first]}px;width:{LW}px;height:{RH}px;background:{col};display:flex;align-items:center;justify-content:center">'
                   f'<span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:20px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#fff">{name}</span></div>')
    mids = []
    for i, (t, first) in enumerate(path):
        col = NAVY if first else BLUE
        x, y = X0 + i * (C + G), top[first] + P
        mids.append((x, y + BH // 2))
        out.append(f'<div style="position:absolute;left:{x}px;top:{y}px;width:{C}px;height:{BH}px;background:#fff;border:2px solid {col};border-top-width:7px;'
                   f'padding:14px 14px;display:flex;flex-direction:column;gap:8px">'
                   f'<div style="font-size:20px;font-weight:700;color:{col}">Шаг {i + 1}</div>'
                   f'<div style="font-size:22px;font-weight:700;color:{INK};line-height:1.22">{t}</div></div>')
    paths = []
    for i in range(n - 1):
        (xa, ya), (xb, yb) = mids[i], mids[i + 1]
        x1 = xa + C
        pts = [(x1, ya), (xb - 2, yb)] if ya == yb else [(x1, ya), (x1 + G // 2, ya), (x1 + G // 2, yb), (xb - 2, yb)]
        hp, pts[-1] = arrow_head(*pts[-2], *pts[-1], "#7A8697", 13, 7)
        paths.append(f'<path d="M{" L".join(f"{a:.0f},{b:.0f}" for a, b in pts)}" fill="none" stroke="#7A8697" stroke-width="2.2"/>{hp}')
    svg = f'<svg viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0;width:{W}px;height:{H}px">{"".join(paths)}</svg>'
    return f'<div class="cv" style="width:{W}px;height:{H}px">{"".join(out)}{svg}</div>'


# ─────────────────────────────── контрольные точки
def milestones(points, years=None, W=1456, H=500, hand_note=None, first_x=121, step=243):
    """Шкала контрольных точек. points: [(квартал, событие, тёмная_точка)]; последняя точка крупнее (r 32)
    и подписана жирнее. years: [(подпись года, индекс_от, индекс_до)] — скобки над кварталами.
    Захардкожено: трек LBLUE 14 px на y=210, точки r 23 с белой обводкой 6, кегли 31 (квартал) и 26–27 (событие)."""
    cv = Canvas(W, H)
    for yr, a, b in (years or []):
        xa, xb = first_x + a * step - 100, first_x + b * step + 100
        cv.raw(f'<path d="M{xa},62 V52 H{xb} V62" fill="none" stroke="{NAVY}" stroke-width="2.4"/>')
        cv.text(xa, 0, xb - xa, yr, 36, NAVY, 700, "center")
    cv.raw(f'<rect x="0" y="210" width="{W}" height="14" fill="{LBLUE}"/>')
    for i, (q, t, dark) in enumerate(points):
        x, last = first_x + i * step, i == len(points) - 1
        cv.raw(f'<circle cx="{x}" cy="217" r="{32 if last else 23}" fill="{NAVY if dark else BLUE}" stroke="#fff" stroke-width="6"/>')
        cv.text(x - 115, 118, 230, q, 31, NAVY, 700, "center")
        cv.text(x - 118, 274, 236, t, 27 if last else 26, INK if last else BODY, 700 if last else 400, "center", 1.25)
    if hand_note:
        cv.put(W - 416, 360, hand(hand_note, 26, -4), 360)
    return cv.html()


def timeline_dots(points, W=1456, H=330):
    """Хронология сделанного: линия LBLUE 10 px, точки r 20 NAVY, дата 27 жирная сверху, событие 25 снизу."""
    cv = Canvas(W, H)
    cv.raw(f'<rect x="0" y="120" width="{W}" height="10" fill="{LBLUE}"/>')
    step = W / len(points)
    for i, (d, t) in enumerate(points):
        x = step / 2 + i * step
        cv.raw(f'<circle cx="{x:.0f}" cy="125" r="20" fill="{NAVY}" stroke="#fff" stroke-width="5"/>')
        cv.text(x - 140, 42, 280, d, 27, NAVY, 700, "center")
        cv.text(x - 140, 172, 280, t, 25, INK, 700, "center", 1.25)
    return cv.html()


# ─────────────────────────────── «луковица»
def onion(core_label, core_value, layers, right_top, right_bottom, hand_note=None, W=1456, H=590):
    """Ядро и слои окружения. layers: [(индекс_слоя 0–4, y выноски, подпись)] — выноска от середины
    кольца к подписи 27 px; справа за линией два big() 88 px: right_top=(число, подпись, цвет), right_bottom.
    Захардкожено: центр (300, 295), радиусы 118…295, пять оттенков от #BFD5EC к #EDF3F9, ядро r 72 NAVY."""
    cv = Canvas(W, H)
    CX, CY = 300, 295
    RADII = [118, 164, 210, 256, 295]
    for r, f in reversed(list(zip(RADII, ["#BFD5EC", "#CCDDF0", "#D8E5F3", "#E3ECF6", "#EDF3F9"]))):
        cv.raw(f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="{f}" stroke="#fff" stroke-width="3"/>')
    cv.raw(f'<circle cx="{CX}" cy="{CY}" r="72" fill="{NAVY}"/>')
    cv.text(CX - 72, CY - 36, 144, core_label, 20, "#fff", 700, "center")
    cv.text(CX - 72, CY - 8, 144, core_value, 34, "#fff", 700, "center")
    for k, y, t in layers:
        rm = (RADII[k] + (RADII[k - 1] if k else 72)) / 2
        ax = CX + math.sqrt(max(rm * rm - (y - CY) ** 2, 0))
        cv.raw(f'<line x1="{ax:.1f}" y1="{y}" x2="636" y2="{y}" stroke="{NAVY}" stroke-width="1.8"/><circle cx="{ax:.1f}" cy="{y}" r="7" fill="{NAVY}"/>')
        cv.text(650, y - 17, 360, t, 27, INK, 700, lh=1.2)
    cv.raw(f'<line x1="1030" y1="10" x2="1030" y2="{H - 10}" stroke="{RULE}" stroke-width="2"/>')
    cv.put(1076, 40, big(right_top[0], "", right_top[1], 88, right_top[2], 25), 380)
    cv.put(1076, 300, big(right_bottom[0], "", right_bottom[1], 88, right_bottom[2], 25), 380)
    if hand_note:
        cv.put(660, 535, hand(hand_note, 27, -3), 360)
    return cv.html()


# ─────────────────────────────── процесс строками AS IS / TO BE
def band(label, value, color, steps, line_col, first=False):
    """Строка процесса: слева метка 22 и значение 56 px («2–5 дней» / «часы»), справа шаги — верхняя линейка 7 px
    (у шагов человека всегда NAVY), иконка 44 и текст 24. line_col="#AEBBCB" делает иконки серыми (AS IS)."""
    st = "".join(f'<div style="flex:1;border-top:7px solid {NAVY if t.startswith("Человек") else line_col};padding-top:18px;display:flex;flex-direction:column;gap:12px">'
                 f'{icon(ic, 44, NAVY if line_col != "#AEBBCB" else "#5B6778")}<div style="font-size:24px;font-weight:700;color:{INK};line-height:1.25">{t}</div></div>'
                 for t, ic in steps)
    return (f'<div style="flex:1;display:flex;gap:40px;align-items:center;border-top:{"3px solid " + NAVY if first else "2px solid " + RULE};padding:22px 0">'
            f'<div style="width:250px;flex-shrink:0"><div style="font-size:22px;font-weight:700;color:{color}">{label}</div>'
            f'<div style="font-size:56px;font-weight:700;color:{color};line-height:1.05;margin-top:8px">{value}</div></div>'
            f'<div style="flex:1;display:flex;gap:16px">{st}</div></div>')


def bands(asis, tobe, hand_note=None):
    """asis/tobe: (метка, значение, [(шаг, иконка)]). Захардкожено: признак шага человека — текст начинается с «Человек»."""
    return ('<div style="flex:1;display:flex;flex-direction:column;position:relative">'
            + band(asis[0], asis[1], MUTED, asis[2], "#AEBBCB", True) + band(tobe[0], tobe[1], NAVY, tobe[2], BLUE)
            + (f'<div style="position:absolute;left:40px;bottom:14px">{hand(hand_note, 27, -5)}</div>' if hand_note else "") + '</div>')


# ─────────────────────────────── этапы нескольких лет наклонными полосами
def year_steps(years, W=1456, H=560, hand_note=None):
    """Лестница из наклонных полос логотипа. years: [(год, этап, результат, цвет)] — 3 шт.,
    цвета LBLUE → BLUE → NAVY. Полоса 540×136 со скосом 50, год 52 и этап 28 белым; под лестницей по
    каждому году — линия 5 px цвета полосы и результат 26 px. Захардкожено: шаг 458 по x и 128 по y."""
    cv = Canvas(W, H)
    for i, (yr, st, res, fill) in enumerate(years):
        x, y = i * 458, 282 - i * 128
        cv.raw(pgram(x, y, 540, 136, fill, 50))
        fg = NAVY if fill.upper() in (LBLUE.upper(), "#8CB8E0") else "#fff"   # на светлой полосе белый не читается
        cv.text(x + 78, y + 14, 440, yr, 52, fg, 700, lh=1.1)
        cv.text(x + 62, y + 78, 440, st, 28, fg, 700)
        cv.raw(f'<line x1="{i * 492}" y1="452" x2="{i * 492 + 450}" y2="452" stroke="{fill}" stroke-width="5"/>')
        cv.text(i * 492, 470, 450, res, 26, INK, 600, lh=1.3)
    if hand_note:
        cv.put(10, 40, hand(hand_note, 30, -5), 400)
    return cv.html()


# ─────────────────────────────── решения
def decisions(items):
    """Нумерованные решения: номер 64 px SKY, текст 31 px жирный, первая линия 3 px NAVY, остальные RULE."""
    return "".join(f'<div style="flex:1;display:flex;gap:30px;align-items:center;border-top:{"3px solid " + NAVY if i == 0 else "2px solid " + RULE}">'
                   f'<span style="font-size:64px;font-weight:700;color:{SKY};line-height:1;width:44px;flex-shrink:0">{i + 1}</span>'
                   f'<div style="font-size:31px;font-weight:700;color:{INK};line-height:1.25">{d}</div></div>' for i, d in enumerate(items))


def callout(title, text=""):
    """Выносная плашка-вывод под схемой: PALE, левая линия 8 px SKY, заголовок 27–30 NAVY."""
    t = f'<div class="t" style="margin-top:10px">{text}</div>' if text else ""
    return (f'<div style="background:{PALE};border-left:8px solid {SKY};padding:26px 34px">'
            f'<div style="font-size:28px;font-weight:700;color:{NAVY}">{title}</div>{t}</div>')

# -*- coding: utf-8 -*-
"""Графики под формат данных: столбики (на светлом и тёмном фоне), «вафля» доли, водопад статей,
парные полосы «бюджет → эффект» с кратностью, список полос, диапазоны на общей шкале, траектория по годам,
доли, «дни против часов» на одной шкале.

Правила: всё рисуется в масштабе одной шкалы; значения подписаны прямо у меток (без легенд, где можно);
подписи 20–24 px, значения 24–36 px; сетка светлая, ось одна. Геометрия рассчитана на ширину тела 1456 px."""
from .tokens import NAVY, BLUE, LBLUE, SKY, INK, BODY, MUTED, RULE, mn, bn
from .canvas import Canvas
from .primitives import hand_svg, curve_arrow


def vbars(vals, labels, W, H, hi=None, vsize=26, lsize=22, color=LBLUE, fmt=None):
    """Вертикальные столбики с подписями значений и категорий. hi — индекс выделенного (NAVY)."""
    base, top, step = H - 40, 44, W / len(vals)
    bw, mx = step * 0.6, max(vals)
    out = [f'<line x1="0" y1="{base}" x2="{W}" y2="{base}" stroke="#9AA6B5" stroke-width="2"/>']
    for i, v in enumerate(vals):
        x, h = i * step + (step - bw) / 2, v / mx * (base - top)
        out.append(f'<rect x="{x:.1f}" y="{base - h:.1f}" width="{bw:.1f}" height="{h:.1f}" fill="{NAVY if i == hi else color}"/>'
                   f'<text x="{x + bw / 2:.1f}" y="{base - h - 12:.1f}" text-anchor="middle" font-size="{vsize}" font-weight="700" fill="{INK}">{(fmt or mn)(v)}</text>'
                   f'<text x="{x + bw / 2:.1f}" y="{base + 32}" text-anchor="middle" font-size="{lsize}" fill="{MUTED}">{labels[i]}</text>')
    return f'<svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">{"".join(out)}</svg>'


def vbars_dark(vals, labels, W=470, H=250, vsize=22, lsize=20):
    """Столбики на тёмно-синей панели (слайд решений): последний — SKY, остальные #5F8FCB, текст белый."""
    base, top, step = H - 34, 36, W / len(vals)
    bw, mx = step * 0.58, max(vals)
    out = [f'<line x1="0" y1="{base}" x2="{W}" y2="{base}" stroke="rgba(255,255,255,.35)" stroke-width="2"/>']
    for i, v in enumerate(vals):
        x, h = i * step + (step - bw) / 2, v / mx * (base - top)
        out.append(f'<rect x="{x:.1f}" y="{base - h:.1f}" width="{bw:.1f}" height="{h:.1f}" fill="{SKY if i == len(vals) - 1 else "#5F8FCB"}"/>'
                   f'<text x="{x + bw / 2:.1f}" y="{base - h - 10:.1f}" text-anchor="middle" font-size="{vsize}" font-weight="700" fill="#fff">{mn(v)}</text>'
                   f'<text x="{x + bw / 2:.1f}" y="{base + 28}" text-anchor="middle" font-size="{lsize}" fill="#C9D8EE">{labels[i]}</text>')
    return f'<svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">{"".join(out)}</svg>'


def waffle(n, total=30, cols=10, sq=40, gap=8, on=NAVY, off="#DDE3EB"):
    """«Вафля» доли: n закрашенных из total. В эталоне: 9 из 30 (sq=54, gap=10) рядом с фразой 36 px."""
    out = "".join(f'<rect x="{(i % cols) * (sq + gap)}" y="{(i // cols) * (sq + gap)}" width="{sq}" height="{sq}" fill="{on if i < n else off}"/>'
                  for i in range(total))
    W, H = cols * (sq + gap) - gap, ((total + cols - 1) // cols) * (sq + gap) - gap
    return f'<svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">{out}</svg>'


def waterfall(items, total_label, total_caption="<b>Итого за 5 лет</b>", W=1456, H=580, base=480, scale_h=420, bw=132, note=None):
    """Водопад вклада статей. items: [(короткая подпись, значение, признак_оборудования)] —
    по убыванию; последний столбец — итог NAVY с подписью total_label. Пунктир соединяет верх статьи
    со следующей. Третий элемент True красит статью LBLUE (в эталоне — «оборудование»), иначе BLUE.
    note — рукописная пометка в левом верхнем углу (в эталоне «запас: … не включены»)."""
    from .primitives import hand
    total = sum(v for _, v, _ in items)
    cv = Canvas(W, H)
    slots = len(items) + 1
    SLOT, KK = W / slots, scale_h / total
    cv.raw(f'<line x1="0" y1="{base}" x2="{W}" y2="{base}" stroke="#9AA6B5" stroke-width="2"/>')
    cum = 0
    for i, (lab, v, hw) in enumerate(items):
        x = i * SLOT + (SLOT - bw) / 2
        y1, y0 = base - (cum + v) * KK, base - cum * KK
        cv.raw(f'<rect x="{x:.0f}" y="{y1:.1f}" width="{bw}" height="{y0 - y1:.1f}" fill="{LBLUE if hw else BLUE}"/>'
               f'<line x1="{x + bw:.0f}" y1="{y1:.1f}" x2="{x + SLOT:.0f}" y2="{y1:.1f}" stroke="#9AA6B5" stroke-width="1.6" stroke-dasharray="5 4"/>')
        cv.text(x - 24, y1 - 38, bw + 48, mn(v), 26, INK, 700, "center")
        cv.text(i * SLOT + 2, base + 14, SLOT - 4, lab, 21, BODY, 400, "center", 1.25)
        cum += v
    xt = (slots - 1) * SLOT + (SLOT - bw) / 2
    cv.raw(f'<rect x="{xt:.0f}" y="{base - total * KK:.1f}" width="{bw}" height="{total * KK:.1f}" fill="{NAVY}"/>')
    cv.text(xt - 40, base - total * KK - 42, bw + 80, total_label, 28, NAVY, 700, "center")
    cv.text((slots - 1) * SLOT + 2, base + 14, SLOT - 4, total_caption, 21, INK, 400, "center", 1.25)
    if note:
        cv.put(10, 30, hand(note, 26, -3), 420)
    return cv.html()


def pair_bars(rows, W=1456, H=540, bar_w=780, ratio_size=92):
    """Бюджет и эффект парой полос с общей шкалой и крупной кратностью справа.
    rows: [(название, бюджет, эффект, пометка_к_эффекту)] — кратность считается как эффект / бюджет."""
    K = bar_w / max(e for _, _, e, _ in rows)
    cv = Canvas(W, H)
    step = H / len(rows)
    for j, (n, b, e, note) in enumerate(rows):
        y = j * step
        cv.raw(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="{NAVY}" stroke-width="3"/>')
        cv.text(0, y + 18, W - 306, n, 28, INK, 700)
        for k, (v, col, lab) in enumerate([(b, LBLUE, "бюджет"), (e, NAVY, "эффект за 5 лет" + (", " + note if note else ""))]):
            yy = y + 80 + k * 84
            vs = mn(v) if v >= 1000 else f"{v:.1f}".replace(".", ",")
            cv.raw(f'<rect x="0" y="{yy}" width="{max(v * K, 6):.0f}" height="64" fill="{col}"/>')
            cv.text(max(v * K, 6) + 20, yy + 8, 420, f'{vs} <span style="font-size:22px;font-weight:400;color:{MUTED}">{lab}</span>', 34, INK, 700)
        cv.text(W - 276, y + 110, 276, f"×{e / b:.1f}".replace(".", ","), ratio_size, NAVY, 700, "right", 1)
    return cv.html()


def bar_list(rows, W=1456, H=560, label_w=440, bar_x=460, bar_max=480, side_html=None, side_x=1150, hi=None):
    """Список горизонтальных полос с иконкой и подписью слева.
    rows: [(иконка, название, для кого, значение, пометка)]; hi — индекс полосы другого цвета (BLUE).
    side_html — крупное число справа за вертикальной линией (в эталоне big(…, 76) + hand())."""
    from .icons import icon
    cv = Canvas(W, H)
    mx = max(r[3] for r in rows)
    step = (H - 20) / len(rows)
    for i, (ic, n, who, v, note) in enumerate(rows):
        y = 10 + i * step
        cv.put(0, y + 18, f'<div style="display:flex;gap:18px;align-items:center">{icon(ic, 52, NAVY)}<div><div style="font-size:26px;font-weight:700;color:{INK}">{n}</div>'
                          f'<div style="font-size:21px;color:{MUTED};margin-top:2px">{who}</div></div></div>', label_w)
        w = v / mx * bar_max
        cv.raw(f'<rect x="{bar_x}" y="{y + 26}" width="{w:.0f}" height="64" fill="{BLUE if i == hi else NAVY}"/>')
        cv.text(bar_x + w + 18, y + 32, 240, f'{mn(v)} <span style="font-size:21px;font-weight:400;color:{MUTED}">{note}</span>', 36, INK, 700)
    if side_html:
        cv.raw(f'<line x1="{side_x - 40}" y1="0" x2="{side_x - 40}" y2="{H}" stroke="{RULE}" stroke-width="2"/>')
        cv.put(side_x, 120, side_html, W - side_x)
    return cv.html()


def range_chart(rows, W=1456, H=430, x0=500, k=17.6, pmax=50, note=None):
    """Диапазоны на общей шкале процентов.
    rows: [(подпись, от, до, цвет, текст значения, выделить_подпись)]. Сетка каждые 10 %, полосы 86 px."""
    from .primitives import hand
    cv = Canvas(W, H)
    xp = lambda p: x0 + p * k
    for p_ in range(0, pmax + 1, 10):
        cv.raw(f'<line x1="{xp(p_):.0f}" y1="30" x2="{xp(p_):.0f}" y2="360" stroke="#E6EAF0" stroke-width="2"/>')
        cv.text(xp(p_) - 40, 374, 80, f"{p_} %", 22, MUTED, 400, "center")
    for i, (lab, a, b, col, v, hl) in enumerate(rows):
        y = 70 + i * 160
        cv.text(0, y + 2, x0 - 30, lab, 27, NAVY if hl else INK, 700, "right", 1.2)
        cv.raw(f'<rect x="{xp(a):.0f}" y="{y - 6}" width="{xp(b) - xp(a):.0f}" height="86" fill="{col}"/>')
        cv.text(xp(b) + 22, y + 12, 220, v, 44, INK, 700)
    if note:
        cv.put(600, 318, hand(note, 30, -4), 420)
    return cv.html()


def trajectory(vals, years, future, W=1456, H=580, zone_title="Следующий этап", zone_sub="", note=None, note_xy=(250, 150),
               arrow=(560, 128, 650, 96, 720, 80, 800, 88)):
    """Рост по годам + пунктирная зона будущего этапа. vals — значения прошлых лет,
    future — число будущих колонок (подписи годов жирные NAVY). Последний факт выделен NAVY.
    note — рукописная пометка с изогнутой стрелкой к росту (координаты стрелки подбираются вручную)."""
    base, top = H - 100, 60
    n = len(vals) + future
    step = W / n
    mx = max(vals)
    out = [f'<line x1="0" y1="{base}" x2="{W}" y2="{base}" stroke="#9AA6B5" stroke-width="2"/>']
    for i in range(n):
        x = i * step + step / 2
        if i < len(vals):
            h = vals[i] / mx * (base - top)
            out.append(f'<rect x="{x - 50:.0f}" y="{base - h:.0f}" width="100" height="{h:.0f}" fill="{NAVY if i == len(vals) - 1 else LBLUE}"/>'
                       f'<text x="{x:.0f}" y="{base - h - 14:.0f}" text-anchor="middle" font-size="30" font-weight="700" fill="{INK}">{vals[i]}</text>')
        past = i < len(vals)
        out.append(f'<text x="{x:.0f}" y="{base + 38}" text-anchor="middle" font-size="24" fill="{MUTED if past else NAVY}" font-weight="{400 if past else 700}">{years[i]}</text>')
    x0 = len(vals) * step + 10
    zw = future * step - 20
    out.append(f'<rect x="{x0:.0f}" y="{top}" width="{zw:.0f}" height="{base - top}" fill="#E3F2FB" stroke="{BLUE}" stroke-width="2" stroke-dasharray="10 8"/>'
               f'<text x="{x0 + zw / 2:.0f}" y="{(top + base) / 2 - 6:.0f}" text-anchor="middle" font-size="32" font-weight="700" fill="{NAVY}">{zone_title}</text>'
               f'<text x="{x0 + zw / 2:.0f}" y="{(top + base) / 2 + 34:.0f}" text-anchor="middle" font-size="22" fill="{BODY}">{zone_sub}</text>')
    if note:
        out.append(hand_svg(note_xy[0], note_xy[1], note, 30, -5) + curve_arrow(*arrow))
    return f'<svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">{"".join(out)}</svg>'


def share_bars(rows, W=1456, H=300, x0=400, bar_max=760):
    """Качественные доли горизонтальными полосами: [(название, доля 0–100, цвет, подпись, риск)].
    Риск-строка (red=True) — подпись красным жирным; минимальная ширина полосы 1,2 %, чтобы «почти ноль» был виден."""
    from .tokens import RED
    cv = Canvas(W, H)
    for i, (n, w, c, t, red) in enumerate(rows):
        y = i * 100
        cv.text(0, y + 26, x0 - 20, n, 26, INK, 700)
        ww = max(w, 1.2) / 100 * bar_max
        cv.raw(f'<rect x="{x0}" y="{y + 18}" width="{ww:.0f}" height="60" fill="{c}"/>')
        cv.text(x0 + ww + 22, y + 30, 420, t, 24, RED if red else BODY, 700 if red else 400)
    return cv.html()


def days_vs_hours(steps, asis_label="Сегодня —<br>вручную", asis_value="2–5 дней", tobe_label="С агентом", tobe_value="часы",
                  tobe_text="", days=5, tobe_share=0.17, hand_note=None, W=1456, H=540, X0=330, DAY=222):
    """«Дни против часов на одной шкале» — вместо двух строк шагов band().
    Верхняя полоса — ручные шаги по дню каждый (серые #AEBBCB/#C3CCD8 через один, иконка 40 + подпись 21),
    над ней итог 48 px; нижняя — узкая полоса BLUE шириной tobe_share дня и крупное «часы» 64 px, под ним одна фраза 22.
    Сравнение длиной полос на общей шкале дней читается быстрее, чем два ряда карточек.
    steps: [(иконка, подпись)] — по одному на день. Захардкожено: шкала 0–5 дней по 222 px, подписи дней по-русски."""
    from .icons import icon
    from .primitives import hand
    DAYS = ["0", "1 день", "2 дня", "3 дня", "4 дня", "5 дней", "6 дней", "7 дней"]
    cv = Canvas(W, H)
    for d in range(days + 1):
        x = X0 + d * DAY
        cv.raw(f'<line x1="{x}" y1="60" x2="{x}" y2="468" stroke="#E3E8EF" stroke-width="2"/>')
        cv.text(x - 70, 480, 140, DAYS[d], 21, MUTED, 400, "center")
    cv.text(0, 112, 310, asis_label, 28, "#5B6778", 700, lh=1.2)
    for i, (ic, t) in enumerate(steps):
        x = X0 + i * DAY
        cv.raw(f'<rect x="{x + 2}" y="84" width="{DAY - 4}" height="120" fill="{"#AEBBCB" if i % 2 == 0 else "#C3CCD8"}"/>')
        cv.put(x + 18, 100, f'<div style="display:flex;flex-direction:column;gap:10px">{icon(ic, 40, "#2E3A4B", 1.6)}'
                            f'<span style="font-size:21px;font-weight:700;color:{INK}">{t}</span></div>', DAY - 30)
    cv.text(X0 + days * DAY - 360, 10, 360, asis_value, 48, "#5B6778", 700, "right", 1.1)
    cv.text(0, 316, 310, tobe_label, 28, NAVY, 700)
    AW = DAY * tobe_share
    cv.raw(f'<rect x="{X0}" y="296" width="{AW:.0f}" height="120" fill="{BLUE}"/>')
    cv.text(X0 + AW + 26, 300, 300, tobe_value, 64, BLUE, 700, lh=1)
    if tobe_text:
        cv.text(X0 + AW + 28, 376, 760, tobe_text, 22, BODY, lh=1.3)
    if hand_note:
        cv.put(X0 + AW + 250, 296, hand(hand_note, 32, -4), 300)
    return cv.html()

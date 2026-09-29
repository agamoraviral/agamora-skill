# -*- coding: utf-8 -*-
"""Изометрическая иллюстрация обложки bank_swarm() и каркас титульного слайда cover_slide().

Иллюстрация — одна фраза смысла, прочитанная за три секунды: основание-платформа, корпуса систем,
над ними рой агентов, подключённых только через единый вход. Все надписи — параметры.
Осторожно: изометрический «город» с роем точек руководство назвало «вообще не понятным» — для обложки
по умолчанию берите плоский поток cover_flow.swarm_to_bank(); изометрию — только упростив до 3–4 крупных
элементов. Уроки из отзывов: «звезда» из подписанных узлов вокруг центра выглядит «детским садом»; выборка части
элементов при заявке «все» — ошибка; пейзажи и «закаты» — не в тему. Иллюстрация — только по смыслу материала."""
import math
import random
from .tokens import NAVY, SKY, BODY, MUTED
from .primitives import slant_bars

BUILDINGS = [(-185, -185, 70, 70, 150), (-70, -190, 70, 60, 96), (45, -185, 95, 90, 196), (-190, -60, 66, 86, 84), (80, -50, 84, 74, 118),
             (-190, 64, 86, 78, 66), (-66, 104, 66, 76, 124), (150, 50, 50, 60, 72)]      # (x, y, ширина, глубина, высота)
WITH_AGENTS = (0, 2, 4, 6, 3, 7)      # индексы корпусов, над которыми висит агент-куб


def iso(ox, oy, C=0.866, S=0.5):
    """Изометрическая проекция с началом (ox, oy)."""
    return lambda x, y, z: (ox + (x - y) * C, oy + (x + y) * S - z)


def poly(pts, fill, extra=""):
    return '<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + f'" fill="{fill}"{extra}/>'


def box3(P, x0, y0, z0, w, d, h, top, left, right):
    """Параллелепипед: левая (по оси y+d), правая (по оси x+w) и верхняя грани."""
    return (poly([P(x0, y0 + d, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z0 + h), P(x0, y0 + d, z0 + h)], left)
            + poly([P(x0 + w, y0, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z0 + h), P(x0 + w, y0, z0 + h)], right)
            + poly([P(x0, y0, z0 + h), P(x0 + w, y0, z0 + h), P(x0 + w, y0 + d, z0 + h), P(x0, y0 + d, z0 + h)], top))


def seg(p1, p2, color, w=1.2, op=1, dash=""):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="{color}" stroke-width="{w}" opacity="{op}"{da}/>'


def bank_swarm(W=760, H=900, base_label="Платформа", side_label="30 сервисов",
               caption='<b style="color:#fff">Рой агентов ИИ</b> автоматизирует работу —<br>через платформу: единый вход, правила и учёт',
               buildings=BUILDINGS, with_agents=WITH_AGENTS, rings=5, seed=11):
    rnd = random.Random(seed)
    ox, oy, C, S_ = 380, 596, 0.866, 0.5
    P = iso(ox, oy, C, S_)
    TOP = 56
    o = [f'<circle cx="{ox}" cy="{oy - 300}" r="330" fill="#0B3F8F" opacity=".55"/>', f'<circle cx="{ox}" cy="{oy - 300}" r="210" fill="#1052AB" opacity=".3"/>']
    o.append(box3(P, -200, -200, 0, 400, 400, TOP, "#1F58AD", "#163F80", "#0F3268"))          # основание-платформа
    for g in range(-160, 200, 40):                                                              # сетка плиток на верхней грани
        o.append(seg(P(g, -200, TOP), P(g, 200, TOP), "#4A86D6", 1, .45) + seg(P(-200, g, TOP), P(200, g, TOP), "#4A86D6", 1, .45))
    tx, ty = P(-160, 200, 13)
    o.append(f'<text transform="matrix({C},{S_},0,1,{tx:.1f},{ty:.1f})" font-size="40" font-weight="700" letter-spacing="10" fill="#fff">{base_label}</text>')
    tx2, ty2 = P(200, 170, 18)
    o.append(f'<text transform="matrix({C},{-S_},0,1,{tx2:.1f},{ty2:.1f})" font-size="22" font-weight="600" fill="#BFD9F5">{side_label}</text>')
    ring = [P(52 * math.cos(t / 24 * 2 * math.pi), 52 * math.sin(t / 24 * 2 * math.pi), TOP + 1) for t in range(24)]
    ring2 = [P(26 * math.cos(t / 24 * 2 * math.pi), 26 * math.sin(t / 24 * 2 * math.pi), TOP + 1) for t in range(24)]
    o.append(poly(ring, SKY, ' opacity=".35"') + poly(ring2, "#fff", ' opacity=".75"'))       # «вход» в центре платформы
    depth = lambda b: b[0] + b[1] + (b[2] + b[3]) / 2
    order = sorted(buildings, key=depth)
    back = [b for b in order if depth(b) < 0]
    front = [b for b in order if b not in back]

    def building(x0, y0, w, d, h):
        out = box3(P, x0, y0, TOP, w, d, h, "#EAF3FC", "#A9CBEF", "#7EAEE0")
        for z in range(TOP + 16, TOP + h - 8, 18):                                              # «этажи»
            out += seg(P(x0 + 7, y0 + d, z), P(x0 + w - 7, y0 + d, z), "#7FA9DD", 1.3, .9)
            out += seg(P(x0 + w, y0 + 7, z), P(x0 + w, y0 + d - 7, z), "#5E8FCC", 1.3, .9)
        return out

    o += [building(*b) for b in back]
    bt, bb = P(0, 0, 470), P(0, 0, TOP + 1)                                                     # луч из центра
    o.append(f'<rect x="{bt[0] - 7:.1f}" y="{bt[1]:.1f}" width="14" height="{bb[1] - bt[1]:.1f}" fill="{SKY}" opacity=".28"/>' + seg(bt, bb, "#fff", 2, .85))
    o += [building(*b) for b in front]
    for idx in with_agents:                                                                     # агенты-кубы над корпусами
        x0, y0, w, d, h = buildings[idx]
        cx_, cy_ = x0 + w / 2, y0 + d / 2
        az = TOP + h + 64
        o.append(seg(P(cx_, cy_, TOP + h), P(cx_, cy_, az), SKY, 1.8, .9, "4 4"))
        o.append(box3(P, cx_ - 9, cy_ - 9, az, 18, 18, 18, "#FFFFFF", "#9FD4F0", "#6FBDE8"))
    for k in range(rings):                                                                      # рой
        r0, z0, n = 96 + 30 * k, 330 + 20 * k, 170 - 18 * k
        for i in range(n):
            t = 2 * math.pi * i / n + k * 0.9
            dens = 0.5 + 0.5 * math.sin(2 * t + 1.3 * k)
            if dens < rnd.random() * 0.8:
                continue
            rr = r0 + rnd.gauss(0, 9)
            zz = z0 + 22 * math.sin(2 * t + k) + rnd.gauss(0, 7)
            x, y = P(rr * math.cos(t), rr * math.sin(t), zz)
            dx, dy = P(rr * math.cos(t - 0.09), rr * math.sin(t - 0.09), zz)
            op = rnd.uniform(.5, 1)
            if rnd.random() < 0.45:
                o.append(f'<line x1="{dx:.1f}" y1="{dy:.1f}" x2="{x:.1f}" y2="{y:.1f}" stroke="#8FD3FF" stroke-width="1.6" stroke-linecap="round" opacity="{op * .45:.2f}"/>')
            o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rnd.choice([1.6, 2.1, 2.6, 3.1, 3.8])}" fill="{rnd.choice(["#8FD3FF", "#BFE6FF", "#FFFFFF", "#FFFFFF"])}" '
                     f'opacity="{op:.2f}"/>')
    cx0, cy0 = P(0, 0, 470)
    o.append(f'<circle cx="{cx0:.1f}" cy="{cy0:.1f}" r="40" fill="#fff" opacity=".12"/><circle cx="{cx0:.1f}" cy="{cy0:.1f}" r="22" fill="#fff" opacity=".3"/>'
             f'<circle cx="{cx0:.1f}" cy="{cy0:.1f}" r="12" fill="#fff"/>')
    cap = (f'<div style="position:absolute;left:40px;top:{H - 92}px;width:{W - 80}px;text-align:center;font-size:23px;line-height:1.35;color:#C9D8EE">'
           f'{caption}</div>') if caption else ""
    return (f'<div style="position:relative;width:{W}px;height:{H}px"><svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">'
            f'{"".join(o)}</svg>{cap}</div>')


def cover_slide(title_html, eyebrow, subtitle, meta, art_html):
    """Титульный слайд: слева логотип 40 px, метка 20 px, заголовок 68 px (−1.4 px), подзаголовок 30 px,
    внизу строка 20 px и три наклонные полосы 260×110 в правом нижнем углу колонки; справа — панель 760 px NAVY с иллюстрацией."""
    return f"""<section class="slide"><div style="position:absolute;inset:0;display:flex">
  <div style="flex:1;padding:64px 64px 60px 80px;display:flex;flex-direction:column;position:relative">
    <span style="align-self:flex-start;display:flex">@@LOGO(40)@@</span>
    <div style="flex:1"></div>
    <div class="sec" style="font-size:20px">{eyebrow}</div>
    <div style="font-size:68px;font-weight:700;color:{NAVY};line-height:1.06;margin-top:22px;letter-spacing:-1.4px">{title_html}</div>
    <div style="font-size:30px;color:{BODY};margin-top:26px;line-height:1.3">{subtitle}</div>
    <div style="flex:1"></div>
    <div style="font-size:20px;color:{MUTED}">{meta}</div>
    <svg viewBox="0 0 260 110" style="position:absolute;right:40px;bottom:54px;width:260px;height:110px">{slant_bars(0, 0, 210, 26, 16)}</svg>
  </div>
  <div style="width:760px;flex-shrink:0;background:{NAVY};overflow:hidden">{art_html}</div>
</div></section>"""

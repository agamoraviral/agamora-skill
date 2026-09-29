# -*- coding: utf-8 -*-
"""Раскладки тела слайда без холста: ряд крупных чисел с главным числом на тёмной панели,
сетка показателей, направления на общем основании, колонки с выделением, пунктирные карточки,
панель эффекта, первый слайд короткой версии hero_split(), таблица приложения.

Таблица — только для приложения («как посчитан эффект»); в основном деке главный объект — график или схема."""
from .tokens import NAVY, BLUE, LBLUE, SKY, INK, BODY, MUTED, RULE, PALE
from .icons import icon
from .primitives import big, hand, slant_bars
from .charts import vbars_dark, vbars


def numbers_row_hero(items, hero, hero_note=None):
    """items: [(иконка, число, единица, подпись)] — 3 колонки через линии 2 px RULE; hero: (иконка, число, единица, подпись)
    на панели NAVY flex 1.25 с числом 112 px; hero_note — рукописная пометка #8FD3FF в правом верхнем углу панели."""
    cols = "".join(f'<div class="col" style="justify-content:center;gap:26px;padding:0 44px;{"border-left:2px solid " + RULE + ";" if i else "padding-left:0;"}">'
                   f'{icon(ic, 68, NAVY, 1.5)}{big(v, u, l, 96, NAVY, 26)}</div>' for i, (ic, v, u, l) in enumerate(items))
    ic, v, u, l = hero
    note = f'<div style="position:absolute;right:40px;top:44px">{hand(hero_note, 30, -5, "#8FD3FF")}</div>' if hero_note else ""
    panel = (f'<div style="flex:1.25;background:{NAVY};padding:0 48px;display:flex;flex-direction:column;justify-content:center;gap:26px;position:relative">'
             f'{icon(ic, 68, "#fff", 1.5)}{big(v, u, l, 112, "#fff", 26, "#C9D8EE")}{note}</div>')
    return f'<div class="row" style="flex:1;gap:0;align-items:stretch">{cols}{panel}</div>'


def kpi_grid(items):
    """items: [(иконка, число, подпись)] — сетка 2×2, gap 40/80, число 96 px."""
    cells = "".join(f'<div style="border-top:3px solid {SKY};padding-top:26px;display:flex;gap:30px;align-items:flex-start">{icon(ic, 84, NAVY, 1.4)}{big(v, "", l, 96, NAVY, 26)}</div>'
                    for ic, v, l in items)
    return f'<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:40px 80px;align-content:center">{cells}</div>'


def directions(items, base_text):
    """items: [(иконка, заголовок, результат)] — карточки NAVY на всю высоту; снизу «основание» PALE 28 px —
    метафора «всё стоит на служебных сервисах»."""
    cards = "".join(f'<div style="flex:1;background:{NAVY};padding:40px 36px;display:flex;flex-direction:column;gap:18px">'
                    f'<div style="display:flex;align-items:flex-start;justify-content:space-between">{icon(ic, 84, "#fff", 1.4)}'
                    f'<span style="font-size:120px;font-weight:700;color:{SKY};line-height:.8">{i + 1}</span></div>'
                    f'<div style="font-size:40px;font-weight:700;color:#fff;line-height:1.12;margin-top:auto">{t}</div>'
                    f'<div style="font-size:26px;color:#C9D8EE;line-height:1.3;border-top:2px solid rgba(255,255,255,.25);padding-top:16px">{r}</div></div>'
                    for i, (ic, t, r) in enumerate(items))
    return (f'<div class="row" style="flex:1;gap:28px">{cards}</div>'
            f'<div style="background:{PALE};padding:26px 36px;font-size:28px;font-weight:700;color:{NAVY};text-align:center">{base_text}</div>')


def columns_highlight(cols, own, note=None):
    """cols: [(название, [пункты])]; own — название колонки, которую выделить (NAVY, flex 1.45, пункты жирные белые)."""
    out = "".join(
        (f'<div class="col" style="flex:1.45;background:{NAVY};padding:30px 34px;gap:0">' if s == own else '<div class="col" style="padding:30px 0 0;gap:0">')
        + f'<div style="font-size:34px;font-weight:700;color:{"#fff" if s == own else NAVY};margin-bottom:16px">{s}</div>'
        + "".join(f'<div style="border-top:2px solid {"rgba(255,255,255,.25)" if s == own else RULE};padding:16px 0;font-size:24px;font-weight:{700 if s == own else 400};'
                  f'color:{"#fff" if s == own else INK}">{it}</div>' for it in items) + '</div>' for s, items in cols)
    return f'<div class="row" style="flex:1;gap:36px">{out}</div>' + (f'<div class="t">{note}</div>' if note else "")


def dashed_cards(items, hand_note=None):
    """items: [(иконка, заголовок, текст)] — рамка 3 px пунктир BLUE (= «предлагаем добавить»), иконка 68, заголовок 31, текст 24."""
    cards = "".join(f'<div class="col" style="border:3px dashed {BLUE};padding:40px 36px;gap:22px">{icon(ic, 68, NAVY, 1.5)}'
                    f'<div style="font-size:31px;font-weight:700;color:{NAVY};line-height:1.2">{t}</div><div class="t">{d}</div></div>'
                    for ic, t, d in items)
    return f'<div class="row" style="flex:1;gap:32px">{cards}</div>' + (f'<div>{hand(hand_note, 28, -3)}</div>' if hand_note else "")


def effect_panel(label, value, unit, caption, series, years, extra, W=560):
    """Панель «Эффект для всей компании»: метка LBLUE, число 112 белое, vbars_dark по годам,
    внизу два числа 60 px (extra: [(число, единица, подпись)])."""
    ex = "".join(big(v, u, l, 60, "#fff", 21, "#C9D8EE") for v, u, l in extra)
    return (f'<div style="width:{W}px;flex-shrink:0;background:{NAVY};padding:40px 44px;display:flex;flex-direction:column;justify-content:space-between">'
            f'<div><div class="sec" style="color:{LBLUE}">{label}</div>'
            f'<div style="margin-top:18px">{big(value, unit, caption, 112, "#fff", 25, "#C9D8EE")}</div></div>'
            f'{vbars_dark(series, years)}'
            f'<div style="border-top:2px solid rgba(255,255,255,.25);padding-top:26px;display:flex;gap:36px">{ex}</div></div>')


def hero_split(eyebrow, title_html, lead, pains, eff_label, eff_value, eff_unit, eff_caption, eff_note, series, years, bottom):
    """Первый слайд короткой версии («ванпейджер»): слева NAVY flex 1.45 — наклонные полосы, метка, тезис 64, лид 27,
    три «боли» с номерами 40 SKY (заголовок 27, ответ 22); справа — метка, число 116, пометка, столбики 540×300,
    нижнее число 60. pains: [(боль, что меняется)]; bottom: (число, единица, подпись)."""
    ps = "".join(f'<div style="display:flex;gap:24px;border-top:2px solid rgba(255,255,255,{.45 if i == 0 else .2});padding:20px 0">'
                 f'<span style="font-size:40px;font-weight:700;color:{SKY};line-height:1;width:30px;flex-shrink:0">{i + 1}</span>'
                 f'<div><div style="font-size:27px;font-weight:700;color:#fff;line-height:1.25">{p}</div>'
                 f'<div style="font-size:22px;color:#C9D8EE;line-height:1.35;margin-top:6px">{a}</div></div></div>' for i, (p, a) in enumerate(pains))
    bars = vbars(series, years, 540, 300, hi=len(series) - 1, vsize=25, lsize=22)
    return f"""<section class="slide"><div style="position:absolute;inset:0;display:flex">
  <div style="flex:1.45;background:{NAVY};padding:56px 64px 44px;display:flex;flex-direction:column;position:relative">
    <svg viewBox="0 0 230 100" style="position:absolute;right:56px;top:52px;width:180px;height:78px">{slant_bars(0, 0, 190, 24, 14)}</svg>
    <div class="sec" style="color:{LBLUE}">{eyebrow}</div>
    <div style="font-size:64px;font-weight:700;color:#fff;line-height:1.06;margin-top:28px;letter-spacing:-1.2px">{title_html}</div>
    <div style="font-size:27px;color:#C9D8EE;margin-top:22px;line-height:1.35;max-width:820px">{lead}</div>
    <div style="flex:1"></div>{ps}
  </div>
  <div style="flex:1;padding:52px 60px 44px;display:flex;flex-direction:column;position:relative">
    <span style="align-self:flex-end;display:flex;min-height:34px">@@LOGO(34)@@</span>
    <div class="sec" style="margin-top:18px">{eff_label}</div>
    <div style="margin-top:14px">{big(eff_value, eff_unit, eff_caption, 116, NAVY, 24)}</div>
    <div style="margin-top:18px">{hand(eff_note, 25, -3)}</div>
    <div style="flex:1;display:flex;align-items:center">{bars}</div>
    <div style="border-top:2px solid {RULE};padding-top:20px">{big(bottom[0], bottom[1], bottom[2], 60, NAVY, 22)}</div>
  </div>
</div></section>"""


def appendix_table(head, rows, widths=("24%", None, "14%")):
    """Таблица приложения: заголовки 20 px MUTED прописными, линия 3 px NAVY, строки 21 px на линиях RULE,
    последний столбец — числа вправо жирным. Последняя строка rows — итог (NAVY)."""
    def th(i, h):
        w = f"width:{widths[i]};" if i < len(widths) and widths[i] else ""
        al = "right" if i == len(head) - 1 else "left"
        return f'<th style="text-align:{al};font-size:20px;color:{MUTED};padding-bottom:10px;border-bottom:3px solid {NAVY};{w}">{h}</th>'
    trs = []
    for r, row in enumerate(rows):
        last = r == len(rows) - 1
        tds = []
        for i, c in enumerate(row):
            num = i == len(row) - 1
            col = NAVY if last else (INK if i == 0 or num else BODY)
            pad = "14px 20px 0 0" if last else "13px 20px 13px 0"
            bd = "" if last else f"border-bottom:1px solid {RULE};"
            tds.append(f'<td style="padding:{pad};{bd}{"text-align:right;white-space:nowrap;" if num else ""}font-weight:{700 if (i == 0 or num) else 400};color:{col}">{c}</td>')
        trs.append("<tr>" + "".join(tds) + "</tr>")
    return (f'<table style="width:100%;border-collapse:collapse;font-size:21px;line-height:1.3"><tr>{"".join(th(i, h) for i, h in enumerate(head))}</tr>'
            + "".join(trs) + "</table>")

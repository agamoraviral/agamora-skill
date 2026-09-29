# -*- coding: utf-8 -*-
"""Классический Гант плана на год: задачи строками слева (сгруппированы по направлениям),
кварталы колонками, тонкие полосы без текста внутри, легенда статуса в одну строку.

Шевроны «I–IV квартал» и текст в каждой ячейке отклонены как некрасивые и перегружающие.
Виды полос: bk — тёмно-синяя (в утверждённом портфеле), cur — синяя (в текущей работе),
new — пунктир (предлагаем добавить). Подписи легенды — параметр."""
from .tokens import NAVY, BLUE, RULE, BODY
from .canvas import Canvas
from .icons import icon

KINDS = {"bk": f'fill="{NAVY}"', "cur": f'fill="{BLUE}"',
         "new": f'fill="#E3F2FB" stroke="{BLUE}" stroke-width="2" stroke-dasharray="6 4"'}
LEGEND_CSS = {"bk": f"background:{NAVY}", "cur": f"background:{BLUE}", "new": f"background:#E3F2FB;border:2px dashed {BLUE}"}
DEFAULT_LEGEND = [("bk", "в утверждённом портфеле"), ("cur", "в текущей работе"), ("new", "предлагаем добавить")]


def gantt(lanes, year_label="2027 год", cols=("I квартал", "II квартал", "III квартал", "IV квартал"), legend=DEFAULT_LEGEND,
          W=1456, LW=520, X0=548, GH=46, TH=40, task_size=21, lane_size=24):
    """lanes: [(иконка, название направления, вид полос, [(с_колонки, по_колонку, текст задачи)])], колонки с 1."""
    n = len(cols)
    QW = (W - X0) / n
    rows = sum(GH + TH * len(b) for _, _, _, b in lanes)
    H = 56 + rows + 60
    cv = Canvas(W, H)
    for q in range(n):
        x = X0 + q * QW
        if q % 2:
            cv.raw(f'<rect x="{x:.0f}" y="0" width="{QW:.0f}" height="{56 + rows}" fill="#F4F7FB"/>')
        cv.text(x, 10, QW, cols[q], 23, NAVY, 700, "center")
    cv.text(0, 6, LW, year_label, 28, NAVY, 700)
    cv.raw(f'<line x1="0" y1="54" x2="{W}" y2="54" stroke="{NAVY}" stroke-width="2.5"/>')
    y = 56
    for j, (ic, lane, kind, bars) in enumerate(lanes):
        if j:
            cv.raw(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="{RULE}" stroke-width="1.5"/>')
        cv.put(0, y + 8, f'<div style="display:flex;gap:12px;align-items:center">{icon(ic, 32, NAVY)}'
                         f'<span style="font-size:{lane_size}px;font-weight:700;color:{NAVY}">{lane}</span></div>', LW)
        y += GH
        for a_, b_, t in bars:
            cv.text(44, y + 7, LW - 44, t, task_size, BODY)
            x = X0 + (a_ - 1) * QW + 10
            w = (b_ - a_ + 1) * QW - 20
            cv.raw(f'<rect x="{x:.0f}" y="{y + 9}" width="{w:.0f}" height="22" {KINDS[kind]}/>')
            y += TH
    for q in range(n + 1):
        cv.raw(f'<line x1="{X0 + q * QW:.0f}" y1="54" x2="{X0 + q * QW:.0f}" y2="{56 + rows}" stroke="#D9DFE7" stroke-width="1.5"/>')
    leg = "".join(f'<span style="display:inline-flex;align-items:center;gap:12px;margin-right:40px"><span style="width:40px;height:20px;{LEGEND_CSS[k]}"></span>{t}</span>'
                  for k, t in legend)
    cv.put(0, 56 + rows + 22, f'<div style="font-size:21px;color:{BODY}">{leg}</div>', W)
    return cv.html()


# Пример данных в форме эталона (формулировки обобщены)
EXAMPLE = [("code", "Разрабатываем с агентами", "cur", [(1, 1, "Первый проект на новом процессе"), (2, 3, "Все проекты — на новом процессе"),
                                                         (4, 4, "Процесс — командам потребителей")]),
           ("bot", "Создаём своих агентов", "bk", [(1, 1, "Первая версия помощника"), (2, 2, "Агенты получают данные"),
                                                   (3, 3, "Приёмочные испытания"), (4, 4, "Промышленная модель")]),
           ("plug", "Открываем сервисы агентам", "new", [(1, 1, "Единый вход для агентов"), (2, 2, "Правила и лимиты"),
                                                         (3, 3, "Аудит всех действий"), (4, 4, "Учёт расходов")])]

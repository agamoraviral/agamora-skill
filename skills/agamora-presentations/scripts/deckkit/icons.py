# -*- coding: utf-8 -*-
"""Строгие линейные иконки: одна толщина линии, один цвет, без плашек и кружков.

Иконка ставится только там, где обозначает участника схемы или смысл пункта, а не для украшения.
Параметр accent добавляет короткую наклонную полосу цвета мотива (фирменный акцент).
icon_sheet() — лист всех иконок для проверки глазами."""
from .tokens import NAVY, SKY

ICON = {
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',  # человек
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 20a6.5 6.5 0 0 0-2.6-5.2"/>',  # команда / люди
    "bot": '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13h.01M15 13h.01M9.5 17h5"/>',  # агент ИИ
    "code": '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',  # разработка, код
    "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',  # настройка
    "plug": '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',  # подключение
    "file": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',  # документ, спецификация
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',  # защита, правила, аудит
    "search": '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',  # поиск, каталог
    "flag": '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4.5L17 13H4"/>',  # веха, решение
    "pin": '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',  # место «мы здесь»
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',  # срок, время
    "trend": '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',  # рост
    "fork": '<circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M6 7.5V9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.5M12 12v4.5"/>',  # развилка, обход
    "userx": '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 8l5 5M22 8l-5 5"/>',  # человек исключён
    "eyeoff": '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A9 9 0 0 1 12 4c5 0 9 4 10 8a12 12 0 0 1-2.2 3.6M6.6 6.6A11.6 11.6 0 0 0 2 12c1 4 5 8 10 8a9.7 9.7 0 0 0 4.1-.9"/>',  # закрыто, наружу не уходит
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',  # качество, цель
    "zap": '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',  # быстро
    "pen": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',  # правка
    "book": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',  # документация
    "check": '<path d="M20 6L9 17l-5-5"/>',  # проверка
    "checksq": '<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="3"/>',  # проверено
    "box": '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',  # библиотека, пакет
    "cpu": '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',  # модель ИИ, вычисления
    "rocket": '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 11a13 13 0 0 1 11-8 13 13 0 0 1-8 11l-3 1-1-1z"/><circle cx="15" cy="9" r="1.5"/>',  # запуск
    "door": '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',  # единый вход
    "activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',  # мониторинг, сопровождение
    "lock": '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',  # доступ
    "layers": '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',  # служебные сервисы, слой платформы
    "refresh": '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',  # обновление
    "link": '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',  # шлюз, связь
    "msg": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',  # диалог
    "alert": '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',  # предупреждение
    "list": '<path d="M4 6h16M4 12h16M4 18h10"/>',  # список
    "ruble": '<path d="M8 21V3h6a4.5 4.5 0 0 1 0 9H6M6 16h9"/>',  # деньги, стоимость
    "grid": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',  # системы банка
    "cal": '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',  # календарь
    "chart": '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',  # замер, график
    "folder": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',  # портфель
    "org": '<circle cx="12" cy="6" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 9v3M12 12l-5 3M12 12l5 3"/>',  # оргструктура
    "table": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',  # таблица
    "three": '<rect x="2.5" y="4" width="5.5" height="16" rx="1.5"/><rect x="9.25" y="4" width="5.5" height="16" rx="1.5"/><rect x="16" y="4" width="5.5" height="16" rx="1.5"/>',  # три части
    "loop": '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',  # цикл
    "steps": '<path d="M3 20h5v-5h5v-5h5V5h3"/>',  # ступени
    "eye": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',  # контроль, наблюдаемость
}

ICON_RU = {"user": "человек", "users": "команда / люди", "bot": "агент ИИ", "code": "разработка, код", "gear": "настройка", "plug": "подключение", "file": "документ, спецификация", "shield": "защита, правила, аудит", "search": "поиск, каталог", "flag": "веха, решение", "pin": "место «мы здесь»", "clock": "срок, время", "trend": "рост", "fork": "развилка, обход", "userx": "человек исключён", "eyeoff": "закрыто, наружу не уходит", "target": "качество, цель", "zap": "быстро", "pen": "правка", "book": "документация", "check": "проверка", "checksq": "проверено", "box": "библиотека, пакет", "cpu": "модель ИИ, вычисления", "rocket": "запуск", "door": "единый вход", "activity": "мониторинг, сопровождение", "lock": "доступ", "layers": "служебные сервисы, слой платформы", "refresh": "обновление", "link": "шлюз, связь", "msg": "диалог", "alert": "предупреждение", "list": "список", "ruble": "деньги, стоимость", "grid": "системы банка", "cal": "календарь", "chart": "замер, график", "folder": "портфель", "org": "оргструктура", "table": "таблица", "three": "три части", "loop": "цикл", "steps": "ступени", "eye": "контроль, наблюдаемость"}


def icon(name, size=44, color=NAVY, sw=1.7, accent=False):
    """Иконка как inline-SVG. Размеры в эталоне: 32 (строка Ганта), 44 (шаги), 48–60 (блоки схем),
    68–84 (резюме, направления, показатели). На тёмно-синем фоне color="#fff"."""
    acc = f'<path d="M3.6,16.6 H12.8 L11,21.2 H1.8 Z" fill="{SKY}" stroke="none"/>' if accent else ""
    return (f'<svg viewBox="0 0 24 24" style="width:{size}px;height:{size}px;flex-shrink:0;fill:none;stroke:{color};stroke-width:{sw};'
            f'stroke-linecap:round;stroke-linejoin:round;overflow:visible">{acc}{ICON[name]}</svg>')


def icon_sheet(size=40):
    """Лист всех иконок с подписями — для проверки набора (QA) и выбора иконки по смыслу."""
    cells = "".join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:136px">{icon(n, size)}'
                    f'<div style="font-size:18px;color:#1A2433;font-weight:700">{n}</div>'
                    f'<div style="font-size:14px;color:#5F6B7C;text-align:center;line-height:1.2">{ICON_RU[n]}</div></div>' for n in ICON)
    return f'<div style="display:flex;flex-wrap:wrap;gap:14px 8px">{cells}</div>'


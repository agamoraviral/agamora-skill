# -*- coding: utf-8 -*-
"""Самопрезентация навыка: девять слайдов, которые agamora-presentations собрал сам о себе.

В отличие от галереи это настоящий дек: заголовок — вывод, один акцент на слайд, главный объект,
числа — только подтверждённые факты о навыке (константы ниже; правила, уроки, иконки и шрифты перед сборкой
сверяются с файлами навыка, расхождение останавливает сборку). Бренд — «Агамора». Слайд «Оформление» показывает слайд
«Библиотека» этого же дека в трёх стилях: миниатюры собираются отдельными мини-деками и вставляются
картинками. Запуск из любой папки:
    python examples/showcase.py        # → examples/out/showcase.html, .pdf, .pptx
"""
import base64
import io
import os
import re
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(SKILL, "scripts"))

from deckkit.tokens import NAVY, BLUE, LBLUE, INK, BODY, MUTED, RULE, CSS, EXTRA, FAMILIES, page, build
from deckkit.icons import ICON, icon
from deckkit.primitives import big, hand
from deckkit.canvas import Canvas
from deckkit import accents as A
from deckkit import layouts as L
from deckkit import schemes as S
from deckkit.cover_iso import cover_slide
from deckkit.cover_flow import swarm_to_bank

OUT = os.path.join(HERE, "out")
BRAND = "agamora"

# ── факты о навыке: единственный источник чисел ────────────────────────────────────────────────
RULES = 85                                   # правил с причинами — references/rules.md
LESSONS = 28                                 # уроков в журнале опыта — references/lessons.md
LESSONS_SPAN = "с февраля по сентябрь 2026 года"
COMPONENTS = {"схемы": 17, "графики": 10, "приёмы акцентов": 8, "раскладки": 8,
              "примитивы": 8, "обложки": 8, "Гант": 1, "холст схем": 1}      # deckkit, всего 61
ICONS = 45                                   # строгие линейные иконки — deckkit/icons.py
FONTS = ("IBM Plex Sans", "Onest", "Unbounded", "Caveat")                     # встроены, SIL OFL
FORMATS = ("PDF", "PPTX")                    # из одного HTML
MIN_PX = 20                                  # минимальный кегль в теле слайда
CONTRAST = ("4,5 : 1", "3 : 1")              # мелкий текст / крупный текст
VIDEO = ("1920 × 1080", 30, "−16")           # кадр, кадров в секунду, громкость в LUFS
VOICES, JUDGE = 13, 9                        # сравнённые голоса; порог оценки озвучки из 10
INSTALL = ("claude plugin marketplace add agamoraviral/agamora-skill",
           "claude plugin install agamora-presentations@agamora")


def check_facts():
    """Числа на слайдах сверяются с файлами навыка: устаревшую цифру лучше поймать при сборке, чем в README."""
    ref = os.path.join(SKILL, "references")
    read = lambda f: io.open(os.path.join(ref, f), encoding="utf-8").read()
    found = {"правил": (len(re.findall(r"(?m)^\*\*\d+\.\d+\.", read("rules.md"))), RULES),
             "уроков": (len(re.findall(r"(?m)^- ", read("lessons.md"))), LESSONS),
             "иконок": (len(ICON), ICONS),
             "шрифтов": (len(FAMILIES), len(FONTS))}
    bad = [f"{k}: в навыке {a}, в константах {b}" for k, (a, b) in found.items() if a != b]
    if bad:
        sys.exit("Числа разошлись с навыком, обновите константы: " + "; ".join(bad))


def caps(text, color):
    """Метка капсом внутри тела слайда (20 px — минимум тела)."""
    return f'<div style="font-size:20px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:{color}">{text}</div>'


def step_row(cv, steps, y, h, w, step, accent=None, size=26, ssize=21, isz=56, title_lines=2, pad_top=36):
    """Ряд шагов слева направо со стрелками. В отличие от chain() содержимое прижато к верху, а под заголовок
    отведено title_lines строк: иконки, заголовки и подписи стоят на одной высоте при любой длине текста."""
    for i, (t, s, ic) in enumerate(steps):
        x, dark = i * step, i == accent
        bg, bd, tc, sc = (NAVY, NAVY, "#fff", EXTRA["on_navy_text"]) if dark else ("#fff", EXTRA["line_box"], INK, MUTED)
        cv.put(x, y, f'<div style="width:{w}px;height:{h}px;background:{bg};border:2px solid {bd};padding:{pad_top}px 16px 0;'
                     f'display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px">'
                     f'{icon(ic, isz, "#fff" if dark else NAVY)}'
                     f'<div style="min-height:{title_lines * size * 1.2:.0f}px;display:flex;align-items:center;font-size:{size}px;'
                     f'font-weight:700;line-height:1.2;color:{tc}">{t}</div>'
                     f'<div style="font-size:{ssize}px;line-height:1.3;color:{sc}">{s}</div></div>')
        if i:
            cv.line([(x - (step - w) + 4, y + h / 2), (x - 2, y + h / 2)], NAVY if dark else EXTRA["arrow"], 3)


def with_notes(section, text):
    """Заметки докладчика для слайдов, собранных не через page() (обложка)."""
    return section.replace("</section>", f'<aside class="notes">{text}</aside></section>', 1)


# ── слайды ────────────────────────────────────────────────────────────────────────────────────
def s_cover():
    art = swarm_to_bank(top_label="Агенты Claude Code", band_word="Навык", band_l1="правила подачи",
                        band_l2="проверка качества", bottom_label="слайды в PDF и PPTX, ролик MP4")
    sec = cover_slide("Презентации<br>и ролики<br>для руководства", "Навыки для Claude Code",
                      "Дизайнерская презентация в PDF и PPTX и ролик с голосом из того же материала",
                      "Пример собран самим навыком · 2026", art)
    return with_notes(sec, "Навык Агаморы для Claude Code делает презентации для руководства и ролики к ним. "
                           "Эту презентацию он собрал сам о себе: по своим правилам, из своих компонентов, с той же проверкой.")


PROBLEM = [("Иконки в цветных квадратах, градиенты и тени", "Плоская фирменная графика по смыслу"),
           ("Сплошной текст и мелкий кегль", "Один главный объект и крупный текст"),
           ("Эффектные числа без подтверждения", "Только подтверждённые числа"),
           ("Один шаблон для всех", "Ваш бренд: цвета, шрифты, логотип")]


def s_problem():
    W, H, LW, RX, PAD = 1456, 560, 580, 700, 52
    cv = Canvas(W, H)
    cv.zone(RX, 0, W - RX, H, NAVY)
    cv.text(0, 34, LW, "Типичный генератор слайдов", 30, MUTED, 700)
    cv.text(RX + PAD, 34, W - RX - 2 * PAD, "Навык Агаморы", 30, "#fff", 700)
    y0, rh = 112, 110
    for i, (was, now) in enumerate(PROBLEM):
        y = y0 + i * rh
        cv.raw(f'<line x1="0" y1="{y}" x2="{LW}" y2="{y}" stroke="{RULE}" stroke-width="2"/>'
               f'<line x1="{RX + PAD}" y1="{y}" x2="{W - PAD}" y2="{y}" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>')
        cv.text(0, y + 22, LW, was, 26, MUTED)
        cv.text(RX + PAD, y + 22, W - RX - 2 * PAD, now, 26, "#fff", 700)
        cv.line([(LW + 30, y + 39), (RX - 30, y + 39)], EXTRA["arrow"], 2.4)
    return page("Проблема", "Шаблонную презентацию узнают сразу", cv.html(),
                lead="Руководство возвращает её за украшения, перегруз и числа без подтверждения",
                notes="Шаблон заметен с первого слайда, и такую презентацию возвращают. Навык построен на обратном: "
                      "плоская графика по смыслу, один главный объект, только подтверждённые числа и фирменный стиль заказчика.")


def s_rules():
    rows = [("Причина", "у каждого правила записано, что однажды вернуло презентацию на переделку"),
            ("Пример", f"«мелкие сноски не читаются», поэтому сносок нет, а кегль от {MIN_PX} px"),
            ("Журнал опыта", f"{LESSONS} уроков {LESSONS_SPAN}"),
            ("Противоречия", "ранние правила сведены к одной формулировке")]
    hero = (f'<div style="width:480px;flex-shrink:0"><div class="num" style="font-size:200px;font-weight:700;line-height:1;'
            f'letter-spacing:-5px;color:{NAVY};white-space:nowrap">{RULES}</div>'
            f'<div style="font-size:30px;line-height:1.3;color:{INK};margin-top:48px">правил подачи, языка, чисел и графики</div></div>')
    body = ('<div style="display:flex;gap:80px;align-items:center">' + hero
            + f'<div style="flex:1;min-width:0">{A.kv_rows(rows, label_w=230, size=28, pad=30)}</div></div>')
    return page("Опыт", "Правила выросли из замечаний руководства", body,
                notes=f"Свод вырос из замечаний руководства к десяткам презентаций. У каждого из {RULES} правил записана "
                      f"причина. Журнал опыта хранит {LESSONS} уроков, а ранние правила, которые спорили с поздними, сведены к одной формулировке.")


STEPS = [("Бриф и айдентика", "адресат, решение, бренд", "msg"),
         ("Сюжет", "строка плана на каждый слайд", "list"),
         ("Форма подачи", "график, схема или крупное число", "chart"),
         ("Сборка", "из готовых компонентов", "box"),
         ("PDF и PPTX", "из одного HTML", "file"),
         ("Проверка", "автоматически и глазами", "eye")]


def s_process():
    W, w, step, top, h = 1456, 206, 250, 106, 364
    cv = Canvas(W, top + h)
    for a, b, t in ((0, 2, "Сначала смысл"), (3, 5, "Затем исполнение")):
        xa, xb = a * step, b * step + w
        cv.raw(f'<path d="M{xa},70 V58 H{xb} V70" fill="none" stroke="{NAVY}" stroke-width="2.4"/>')
        cv.text(xa, 0, xb - xa, t, 28, NAVY, 700, "center")
    step_row(cv, STEPS, top, h, w, step, accent=len(STEPS) - 1, size=27, ssize=22, isz=64, pad_top=44)
    body = cv.html() + '<div style="margin-top:44px">' + A.takeaway("Автор отвечает на вопросы и смотрит план, остальное навык делает сам") + "</div>"
    return page("Процесс", "Шесть шагов от брифа до сдачи", body,
                notes="Навык выясняет адресат, решение и бренд, строит сюжет по строке на слайд и выбирает форму подачи. "
                      "Затем собирает слайды из компонентов, выводит PDF и PPTX и проверяет результат.")


def s_components():
    items = [("grid", str(ICONS), "", "строгих линейных иконок"),
             ("pen", str(len(FONTS)), "", "семейства шрифтов встроены в файл"),
             ("file", str(len(FORMATS)), "", "формата из одного HTML: PDF и PPTX")]
    hero = ("box", str(sum(COMPONENTS.values())), "", "компонент слайда: схемы, графики, обложки, Гант")
    return page("Библиотека", "Готовые компоненты вместо пустого листа", L.numbers_row_hero(items, hero),
                lead="Навык собирает слайд из отработанных деталей, а не рисует каждый раз заново",
                notes=f"В библиотеке {sum(COMPONENTS.values())} компонент: схемы, графики, приёмы акцентов, раскладки, обложки и Гант. "
                      f"Плюс {ICONS} линейных иконок и {len(FONTS)} встроенных семейства шрифтов, поэтому презентация одинакова "
                      "на Windows и macOS и собирается без сети.")


def frames_svg(cols=2, rows=3, fw=196, fh=110, gx=28, gy=22):
    """Схема листа кадров: мини-слайды с разными главными объектами (столбики, число, цепочка, полосы, Гант, сетка)."""
    W, H = cols * fw + (cols - 1) * gx, rows * fh + (rows - 1) * gy
    r = lambda x, y, w, h, c: f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{c}"/>'
    o = []
    for k in range(cols * rows):
        x, y = (k % cols) * (fw + gx), (k // cols) * (fh + gy)
        o.append(r(x, y, fw, fh, "#fff") + r(x + 12, y + 12, fw * .42, 7, NAVY))
        cx, cy, cw, ch = x + 12, y + 30, fw - 24, fh - 42
        if k == 0:                                   # столбики
            for i, hh in enumerate((.35, .5, .7, 1)):
                bw = cw / 4 * .6
                o.append(r(cx + i * cw / 4 + (cw / 4 - bw) / 2, cy + ch * (1 - hh), bw, ch * hh, NAVY if i == 3 else LBLUE))
        elif k == 1:                                 # число на тёмной панели и строки
            o.append(r(cx, cy, cw * .38, ch, NAVY))
            o += [r(cx + cw * .46, cy + 8 + i * ch / 3, cw * .54, 5, LBLUE) for i in range(3)]
        elif k == 2:                                 # цепочка блоков
            bw = cw * .26
            o += [r(cx + i * (bw + cw * .11), cy + ch * .22, bw, ch * .56, NAVY if i == 2 else LBLUE) for i in range(3)]
        elif k == 3:                                 # полосы
            o += [r(cx, cy + 4 + i * ch / 3, cw * ww, ch / 3 - 10, NAVY if i == 0 else LBLUE) for i, ww in enumerate((1, .7, .45))]
        elif k == 4:                                 # Гант
            for i in range(4):
                o.append(r(cx, cy + 4 + i * ch / 4, cw * .24, 5, RULE) + r(cx + cw * .32 + i * cw * .16, cy + 4 + i * ch / 4, cw * .2, 5, NAVY if i == 3 else LBLUE))
        else:                                        # сетка показателей
            o += [r(cx + (i % 2) * cw * .52, cy + (i // 2) * ch * .56, cw * .4, ch * .3, NAVY if i == 0 else LBLUE) for i in range(4)]
    return f'<svg viewBox="0 0 {W} {H}" style="width:{W}px;height:{H}px;display:block">{"".join(o)}</svg>'


def s_quality():
    rows = [("Кегль", f"меньше {MIN_PX} px в теле слайда"),
            ("Контраст", f"ниже {CONTRAST[0]} у мелкого текста и {CONTRAST[1]} у крупного"),
            ("Раскладка", "вылеты за край и наложения подписей"),
            ("Заголовок", "в три строки и больше"),
            ("Знаки", "восклицательный знак, сноска, «Источник:»")]
    left = ('<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:18px">'
            + caps("Сначала автоматически", BLUE)
            + f'<div style="font-size:30px;font-weight:700;line-height:1.25;color:{INK};margin-bottom:6px">Ошибка останавливает сдачу</div>'
            + A.kv_rows(rows, label_w=190, size=24, pad=20)
            + f'<div style="font-size:22px;line-height:1.35;color:{MUTED};margin-top:4px">Отдельно навык предупреждает о перегрузе и пустых полосах</div></div>')
    right = (f'<div style="width:520px;flex-shrink:0;background:{NAVY};padding:36px 44px 36px;display:flex;flex-direction:column;gap:18px">'
             + caps("Затем глазами", LBLUE)
             + '<div style="font-size:30px;font-weight:700;line-height:1.25;color:#fff">Листы кадров</div>'
             + f'<div style="margin-top:6px">{frames_svg(fw=204, fh=112, gx=24, gy=20)}</div>'
             + f'<div style="font-size:22px;line-height:1.35;color:{EXTRA["on_navy_text"]};margin-top:4px">Каждый кадр смотрят и читают вслух</div></div>')
    body = (f'<div style="display:flex;gap:64px;align-items:stretch">{left}{right}</div>'
            + A.takeaway("Презентацию сдают, только когда пройдены обе проверки"))
    return page("Качество", "Каждый слайд проверяется дважды", body,
                notes="Сначала автоматическая проверка по раскладке: кегль, контраст, вылеты, наложения и запрещённые знаки. "
                      "Ошибка останавливает сдачу. Затем листы кадров смотрят глазами и читают каждый слайд вслух.")


VIDEO_STEPS = [("Сцены из слайдов", "элементы слайдов оживают", "layers"),
               ("Голос диктора", "анимация привязана к словам", "msg"),
               ("Музыка", "акценты на ключевых цифрах", "activity"),
               ("Ролик MP4", "обложка первым кадром для превью", "rocket")]


def s_video():
    W, w, h = 1456, 320, 280
    step = (W - w) / (len(VIDEO_STEPS) - 1)
    cv = Canvas(W, h)
    step_row(cv, VIDEO_STEPS, 0, h, w, step, accent=len(VIDEO_STEPS) - 1, size=28, ssize=22, isz=60, title_lines=1)
    specs = [(VIDEO[0], f"MP4, {VIDEO[1]} кадров в секунду"), (f"{VIDEO[2]}&nbsp;LUFS", "громкость звука"),
             (str(VOICES), "синтезированных голосов сравнили"), (f"{JUDGE} из 10", "порог оценки озвучки моделью-слушателем")]
    cells = "".join(f'<div style="flex:1;min-width:0;border-top:2px solid {RULE};padding-top:22px">{big(v, "", t, 56, NAVY, 22, BODY)}</div>'
                    for v, t in specs)
    body = cv.html() + f'<div style="display:flex;gap:40px;margin-top:52px">{cells}</div>'
    return page("Видео", "Тот же материал оживает в ролике", body,
                lead="Навык видео собирает ролик из тех же слайдов и в том же фирменном стиле",
                notes="Второй навык превращает слайды в ролик. Сцены собираются из элементов слайдов, анимация привязана к словам диктора, "
                      f"музыка подчёркивает ключевые цифры. Каждый фрагмент озвучки оценивает модель-слушатель, порог {JUDGE} из 10.")


def thumbnail(slide_html, brand, width):
    """Миниатюра слайда в нужном стиле: мини-дек из одного слайда → PDF → PNG заданной ширины (data URI)."""
    import pymupdf
    from render_pdf import render
    tmp = tempfile.mkdtemp(prefix="showcase-")
    saved = os.environ.pop("DECK_BRAND", None)      # нейтральный стиль — без бренда, даже если задан DECK_BRAND
    try:
        html = os.path.join(tmp, "thumb.html")
        build([slide_html], "Миниатюра", html, css=CSS + ".no{display:none}", brand=brand)
        pdf = render(html, log=lambda *a: None)
        with pymupdf.open(pdf) as doc:
            pg = doc[0]
            z = width / pg.rect.width
            png = pg.get_pixmap(matrix=pymupdf.Matrix(z, z)).tobytes("png")
    finally:
        if saved is not None:
            os.environ["DECK_BRAND"] = saved
        shutil.rmtree(tmp, ignore_errors=True)
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def s_brand(sample_html, sample_no):
    big_w, small_w, gap = 981, 427, 48           # 981 + 48 + 427 = 1456; высоты колонок совпадают при 16 : 9
    styles = [("agamora", "Агамора", "фирменные цвета и логотип", big_w),
              ("editorial", "Тёплый журнальный", "готовый профиль", small_w),
              (None, "Нейтральный", "палитра по умолчанию", small_w)]

    def fig(brand, name, desc, w, extra=""):
        src = thumbnail(sample_html, brand, w * 2)
        return (f'<div style="width:{w}px"><div style="border:2px solid {RULE};line-height:0">'
                f'<img src="{src}" alt="" style="display:block;width:100%;height:auto"></div>'
                f'<div style="display:flex;align-items:baseline;gap:14px;margin-top:12px;font-size:22px;line-height:1.3">'
                f'<b style="color:{INK}">{name}</b><span style="color:{MUTED}">{desc}</span>{extra}</div></div>')

    note = f'<div style="margin-left:auto;align-self:center">{hand(f"слайд {sample_no} в трёх стилях", 27, -3)}</div>'
    body = (f'<div style="display:flex;gap:{gap}px;align-items:flex-start">{fig(*styles[0], extra=note)}'
            f'<div style="display:flex;flex-direction:column;gap:28px">{fig(*styles[1])}{fig(*styles[2])}</div></div>')
    return page("Оформление", "Стиль подстраивается под ваш бренд", body,
                lead="Навык спрашивает о бренде в начале работы: цвета, шрифты, логотип, брендбук",
                notes="В начале работы навык спрашивает о бренде: цвета, шрифты, логотип, брендбук. Бренд подключается файлом brand.json. "
                      f"На слайде один и тот же слайд {sample_no} этой презентации в трёх стилях.")


def s_start():
    sub = lambda html, color=BODY, weight=400: (f'<div style="margin-top:12px;font-size:24px;font-weight:{weight};line-height:1.45;'
                                                f'color:{color}">{html}</div>')
    items = ["Установить плагин двумя командами" + sub("".join(f"<div>{c}</div>" for c in INSTALL), BLUE, 500),
             "Попросить презентацию" + sub("«Сделай презентацию для руководства по …»"),
             "Ответить на вопросы о сюжете и бренде" + sub("Дальше навык собирает, выводит и проверяет слайды")]
    outs = [(FORMATS[0], "для показа и печати"), (FORMATS[1], "редактируемый текст и фигуры"), ("MP4", "ролик с голосом по просьбе")]
    rows = "".join(f'<div style="border-top:2px solid rgba(255,255,255,{.45 if i == 0 else .22});padding:22px 0 24px">'
                   f'{big(v, "", t, 64, "#fff", 22, EXTRA["on_navy_text"])}</div>' for i, (v, t) in enumerate(outs))
    panel = (f'<div style="width:470px;flex-shrink:0;background:{NAVY};padding:40px 48px;display:flex;flex-direction:column;'
             f'justify-content:center;gap:22px">{caps("На выходе", LBLUE)}<div>{rows}</div></div>')
    body = (f'<div style="flex:1;display:flex;gap:64px;align-items:stretch;min-height:0">'
            f'<div style="flex:1;min-width:0;display:flex;flex-direction:column">{S.decisions(items)}</div>{panel}</div>')
    return page("Начало работы", "Три шага до первой презентации", body,
                notes="Установка занимает две команды в терминале. Дальше достаточно попросить презентацию для руководства "
                      "и ответить на вопросы о сюжете и бренде.")


def slides():
    F = [s_cover(), s_problem(), s_rules(), s_process()]
    sample = s_components()
    F.append(sample)
    F += [s_quality(), s_video(), s_brand(sample, F.index(sample) + 1), s_start()]
    return F


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    check_facts()
    from render_pdf import render
    from export_pptx import export
    os.makedirs(OUT, exist_ok=True)
    html = os.path.join(OUT, "showcase.html")
    n = build(slides(), "Навык презентаций Агаморы", html, brand=BRAND)
    print(f"HTML: {html} — {n} слайдов")
    render(html)
    export(html, os.path.join(OUT, "showcase.pptx"), {"IBM Plex Sans": "Segoe UI"})

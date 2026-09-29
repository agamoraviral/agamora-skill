# -*- coding: utf-8 -*-
"""HTML-дек → PDF через headless Chrome (--print-to-pdf) с проверкой числа страниц.

Запуск:  python render_pdf.py deck.html [deck.pdf]
Размер страницы берётся из @page{size:1600px 900px} в CSS дека; шрифты встроены в HTML.
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import chrome  # noqa: E402


def render(html, pdf=None, log=print):
    pdf = os.path.abspath(pdf or os.path.splitext(html)[0] + ".pdf")
    chrome.print_pdf(html, pdf)
    n_html = len(re.findall(r'<section class="slide', io.open(html, encoding="utf-8").read()))
    try:
        import pymupdf
        n_pdf = pymupdf.open(pdf).page_count
    except Exception:
        n_pdf = None
    kb = os.path.getsize(pdf) // 1024
    log(f"PDF: {pdf} — {n_pdf} стр., {kb} КБ")
    if n_pdf is not None and n_pdf != n_html:
        log(f"  ВНИМАНИЕ: слайдов в HTML {n_html}, страниц в PDF {n_pdf} — что-то вылезло за 900 px или разорвалось")
    return pdf


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit("usage: python render_pdf.py deck.html [deck.pdf]")
    render(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)

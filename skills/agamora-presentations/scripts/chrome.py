# -*- coding: utf-8 -*-
"""Headless Chrome без сторонних пакетов: печать в PDF и --dump-dom (Windows, macOS, Linux).

Правила, выученные на практике:
- путь в --print-to-pdf только абсолютный, иначе Chrome падает с «Access is denied»;
- --virtual-time-budget нужен, чтобы шрифты и сценарии страницы успели отработать до печати;
- после печати проверяем, что файл действительно новый (Chrome иногда молча не перезаписывает PDF).
"""
import os
import pathlib
import shutil
import subprocess
import tempfile
import time

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def chrome_exe():
    env = os.environ.get("CHROME_PATH")
    if env and os.path.exists(env):
        return env
    for c in CANDIDATES:
        if os.path.exists(c):
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    raise FileNotFoundError("Не найден Chrome/Chromium/Edge. Укажите путь в переменной CHROME_PATH.")


def file_url(path, frag=""):
    return pathlib.Path(os.path.abspath(path)).as_uri() + (("#" + frag) if frag else "")


def _run(args, timeout):
    """Каждый запуск — со своим временным профилем: иначе второй Chrome может отдать работу ещё живому первому
    и молча выйти с пустым результатом."""
    prof = tempfile.mkdtemp(prefix="deck-chrome-")
    try:
        return subprocess.run(args[:1] + ["--user-data-dir=" + prof] + args[1:], capture_output=True, timeout=timeout)
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def _base(budget_ms):
    args = [chrome_exe(), "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            "--disable-extensions", "--hide-scrollbars",
            "--force-device-scale-factor=1", "--window-size=1600,900", "--font-render-hinting=none",
            "--allow-file-access-from-files"]
    if budget_ms:
        args.append("--virtual-time-budget=%d" % budget_ms)
    return args


def print_pdf(html_path, pdf_path, frag="", budget_ms=8000, timeout=300):
    pdf_path = os.path.abspath(pdf_path)
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    t0 = time.time()
    r = _run(_base(budget_ms) + ["--no-pdf-header-footer", "--print-to-pdf=" + pdf_path, file_url(html_path, frag)], timeout)
    if not os.path.exists(pdf_path) or os.path.getmtime(pdf_path) < t0 - 1:
        raise RuntimeError("PDF не создан: " + r.stderr.decode("utf-8", "replace")[-800:])
    return pdf_path


def dump_dom(html_path, frag="", budget_ms=8000, timeout=300):
    r = _run(_base(budget_ms) + ["--dump-dom", file_url(html_path, frag)], timeout)
    return r.stdout.decode("utf-8", "replace")

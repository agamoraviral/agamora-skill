# -*- coding: utf-8 -*-
"""Генерирует references/components.md из кода deckkit: модуль → назначение → функции с сигнатурой и описанием.
Запускать после любых изменений библиотеки:  python scripts/gen_components_doc.py"""
import ast
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "deckkit")
OUT = os.path.join(os.path.dirname(HERE), "references", "components.md")
ORDER = ["tokens", "accents", "canvas", "primitives", "icons", "charts", "schemes", "layouts", "gantt", "cover_iso", "cover_flow"]


def sig(fn, src):
    seg = ast.get_source_segment(src, fn)
    head = seg.split(":\n", 1)[0] if seg else fn.name
    return " ".join(head.replace("def ", "", 1).split())


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = ["# Справочник компонентов deckkit", "",
           "Файл собран автоматически (`python scripts/gen_components_doc.py`) из кода `scripts/deckkit/`.",
           "Как выглядит каждый компонент — в галерее `examples/gallery.py` → `examples/out/gallery.pdf`.",
           "Импорт: `sys.path.insert(0, '<папка скилла>/scripts')`, затем `from deckkit.tokens import page, build` и т. д.",
           "Все размеры — в пикселях холста 1600×900; ширина тела слайда 1456 px.", ""]
    for m in ORDER:
        p = os.path.join(KIT, m + ".py")
        src = io.open(p, encoding="utf-8").read()
        tree = ast.parse(src)
        out += [f"## `deckkit.{m}`", "", (ast.get_docstring(tree) or "").strip(), ""]
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
                doc = (ast.get_docstring(node) or "").strip()
                out += [f"- **`{sig(node, src)}`**" + (f" — {doc}" if doc else "")]
            elif isinstance(node, ast.ClassDef):
                out += [f"- **класс `{node.name}`** — {(ast.get_docstring(node) or '').strip()}"]
                for f in node.body:
                    if isinstance(f, ast.FunctionDef) and not f.name.startswith("_"):
                        d = (ast.get_docstring(f) or "").strip()
                        out += [f"  - `{sig(f, src)}`" + (f" — {d}" if d else "")]
        out.append("")
    io.open(OUT, "w", encoding="utf-8").write("\n".join(out))
    print("components.md:", OUT, len(out), "строк")


if __name__ == "__main__":
    main()

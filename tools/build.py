#!/usr/bin/env python3
"""把 src/template.html、src/engine.js、dictionary.tsv 組成單一網頁。

輸出：
  index.html          給 GitHub Pages（完整 HTML 文件）
  dist/artifact.html  給 claude.ai 發佈（不含 <html>/<head>/<body> 外框）

執行：python3 tools/build.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

template = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
engine = (ROOT / "src" / "engine.js").read_text(encoding="utf-8")
tsv = (ROOT / "dictionary.tsv").read_text(encoding="utf-8")

dict_literal = json.dumps(tsv, ensure_ascii=False).replace("</", "<\\/")
page = template.replace("/*__ENGINE__*/", engine).replace('/*__DICT__*/""', dict_literal)
assert "/*__ENGINE__*/" not in page and "/*__DICT__*/" not in page, "placeholder left in page"

(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "artifact.html").write_text(page, encoding="utf-8")

full = (
    '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    "</head>\n<body>\n" + page + "\n</body>\n</html>\n"
)
(ROOT / "index.html").write_text(full, encoding="utf-8")
print(f"built index.html ({len(full) // 1024} KB) and dist/artifact.html")

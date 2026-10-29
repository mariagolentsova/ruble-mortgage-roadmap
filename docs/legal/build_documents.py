"""Wraps the personal-data documents written for this project (docs/legal/*.src.html) into
static pages in the calculator's style: public/privacy.html and public/consent.html.
Edit the .src.html files, then run:  python3 docs/legal/build_documents.py"""
import html, re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
PAGE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>{title}</title>
<link rel="icon" type="image/png" href="favicon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" />
<style>
  :root {{ --navy: #0b1f44; --milk: #f7f3e9; --card: #fdfbf6; --ink: #0b1f44; --muted: #5b6b8c; --rule: #e4ddcc; --link: #16305f; color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: var(--milk); color: var(--ink); }}
  body {{ font: 400 15px/1.6 "Manrope", ui-sans-serif, system-ui, sans-serif; -webkit-text-size-adjust: 100%; }}
  header {{ background: var(--navy); color: var(--milk); padding: max(env(safe-area-inset-top), 20px) 20px 20px; text-align: center; }}
  header img {{ height: 36px; width: auto; }}
  header p {{ margin: 8px 0 0; font-size: 13px; opacity: .75; letter-spacing: .02em; }}
  main {{ max-width: 760px; margin: 16px auto 32px; padding: 0 16px; }}
  article {{ background: var(--card); border-radius: 16px; padding: 24px 20px; box-shadow: 0 8px 24px -12px rgba(11,31,68,.25); overflow-wrap: anywhere; }}
  h1 {{ font-size: 20px; line-height: 1.3; margin: 0 0 4px; font-weight: 700; text-wrap: balance; }}
  .meta {{ color: var(--muted); font-size: 13px; margin: 0 0 16px; }}
  h2 {{ font-size: 16px; line-height: 1.35; margin: 24px 0 8px; padding-top: 16px; border-top: 1px solid var(--rule); font-weight: 700; }}
  p, li {{ margin: 0 0 10px; }}
  ul {{ padding-left: 20px; margin: 0 0 12px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 4px 0 12px; font-size: 14px; }}
  th, td {{ border: 1px solid var(--rule); padding: 8px 10px; text-align: left; vertical-align: top; }}
  th {{ background: var(--milk); font-weight: 600; }}
  td, th {{ overflow-wrap: normal; }}
  a {{ color: var(--link); }}
  /* Phones: each table row becomes a small card — the data, and below it where it comes from. */
  @media (max-width: 560px) {{
    table, tbody, tr, td {{ display: block; width: 100%; }}
    tr:first-child {{ display: none; }}
    tr {{ border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }}
    td {{ border: 0; padding: 0; }}
    td + td {{ color: var(--muted); font-size: 13px; margin-top: 4px; }}
  }}
  @media (min-width: 600px) {{ article {{ padding: 32px 40px; }} body {{ font-size: 16px; }} }}
</style>
</head>
<body>
<header>
  <img src="logo-milk.png" alt="Центр недвижимости «СОВЪСТЬ»" />
  <p>Документы · Ипотечный калькулятор</p>
</header>
<main>
<article>
{body}
</article>
</main>
<div style="height: max(env(safe-area-inset-bottom), 16px)"></div>
</body>
</html>
"""

for name in ("privacy", "consent"):
    body = (root / "docs/legal" / f"{name}.src.html").read_text(encoding="utf-8").strip()
    title = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<h1>(.*?)</h1>", body, re.S).group(1))).strip()
    out = root / "public" / f"{name}.html"
    out.write_text(PAGE.format(title=html.escape(title), body=body), encoding="utf-8")
    print(f"{out.relative_to(root)}: {title}")

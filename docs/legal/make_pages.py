"""Wraps the two legal documents (converted from the client's .docx, text unchanged) into
static pages that match the calculator's look. Output goes to the calculator's public/ folder."""
import re, sys, html as H

src, out = sys.argv[1], sys.argv[2]

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
  h1 {{ font-size: 20px; line-height: 1.3; margin: 0 0 16px; font-weight: 700; text-wrap: balance; }}
  h2 {{ font-size: 16px; line-height: 1.35; margin: 28px 0 8px; padding-top: 16px; border-top: 1px solid var(--rule); font-weight: 700; }}
  p {{ margin: 0 0 12px; }}
  a {{ color: var(--link); }}
  @media (min-width: 600px) {{ article {{ padding: 32px 40px; }} body {{ font-size: 16px; }} }}
</style>
</head>
<body>
<header>
  <img src="logo-milk.png" alt="Центр недвижимости «Совесть»" />
  <p>{label}</p>
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

frag = open(src, encoding="utf-8").read().strip()
paras = re.findall(r"<p>(.*?)</p>", frag, flags=re.S)
assert paras, "no paragraphs"

def plain(s):
    return re.sub(r"<[^>]+>", "", s).strip()

blocks = []
title = plain(paras[0])
blocks.append(f"<h1>{paras[0].replace('<strong>', '').replace('</strong>', '')}</h1>")
for p in paras[1:]:
    t = plain(p)
    # A short numbered line without breaks, e.g. "3. Правовое основание обработки…", is a section heading.
    if re.match(r"^\d{1,2}\.\s+\S", t) and "<br" not in p and len(t) < 140 and not re.match(r"^\d+\.\d", t):
        blocks.append(f"<h2>{p}</h2>")
    else:
        blocks.append(f"<p>{p}</p>")

# Links from the document open in a new window inside Telegram's browser.
body = "\n".join(blocks).replace("<a href=", '<a target="_blank" rel="noopener" href=')
label = "Документы · Ипотечный калькулятор"
open(out, "w", encoding="utf-8").write(PAGE.format(title=H.escape(title), label=label, body=body))

# Sanity check: every word of the source text is still there, in order.
src_words = re.findall(r"\w+", plain(frag.replace("<br />", " ")))
out_words = re.findall(r"\w+", plain(re.search(r"<article>(.*)</article>", open(out, encoding="utf-8").read(), re.S).group(1).replace("<br />", " ")))
assert src_words == out_words, "text changed"
print(f"{out}: {len(src_words)} words, {sum(b.startswith('<h2') for b in blocks)} sections, title: {title[:60]}")

#!/usr/bin/env python3
"""Assemble the redesign demo: one self-contained HTML page with a screen switcher.

usage: python3 build.py [--config redesign.json] [out.html]
  Without out.html the page goes to the config's "output" (the shared demo). A lane always passes its
  own out/<lane>.html, because several lanes build at the same time.

Everything is read from redesign.json; its paths are relative to the config file:
  parts/00-head.html     base CSS: page layout, phone frame, shared components (the shared lane owns it)
  css/*.css              per-screen CSS, appended after the base in name order (each lane owns its own)
  parts/10-chrome.html   {{ICONS}}, the masthead ({{TITLE}}, {{LEDE}}), legend and theme toggle; opens <div class="wrap">
  sections/<id>.html     exactly one <section class="screen" id="s-<id>"> per screen, in config order
  parts/90-script.html   the screen switcher and theme script
  assets/*.json          {key: data URI} maps for {{A:key}}
  icons/*.svg            one icon per file, a <symbol id="i-<name>"> or a plain <svg> (lucide); collected into the sprite
  today/<name>.png       today's app (.png, .jpg or .webp) for {{IMG:name}}

Placeholders: {{A:key}} {{IMG:name}} {{ICONS}} {{TITLE}} {{LEDE}}
  {{NAV:<item>}} the config's tab bar with <item> active; {{NAV:<item>:unread-<other>}} adds an unread dot. An item
  with "screen": null is drawn but inert (a screen the demo does not have yet).
  {{TITLE}} takes the config's "title_html" when set (a Latin brand in a <bdi>); <title> always takes "title".
  {{IMG:name}} for a screen listed in "today_missing" ({name: reason}: today's app could not be captured, README step 2)
  draws a placeholder with the reason; its section must label that column «היום · לא צולם · <reason>», and
  INVENTORY.md (next to the config) must list it in «Screens that could not be captured» with the sources tried.
Theme: config "tokens" (any theme) and "theme.dark" / "theme.light" become CSS custom properties (--<name>);
the default theme sits on :root, the other one on [data-theme] and on prefers-color-scheme.
Fonts: config "fonts" lists LOCAL font files ({family, file, weight, style}), embedded as data URIs, so the demo never
asks the network for anything (shoot.mjs blocks and fails every remote request). A URL is an error.
Lint: config "lint" rules ({name, pattern, hint}) are counted per section and printed, not fatal.
Exit 1 when a section is missing or names the wrong id, a placeholder is unresolved, an icon reference (<use href="#…">)
has no symbol, an icon or tab-bar id repeats, a tab-bar item opens a screen that does not exist, or a font is not local.
"""
import argparse
import base64
from html import escape as html_escape
import json
import pathlib
import re
import sys

ap = argparse.ArgumentParser(description='Assemble the redesign demo from redesign.json')
ap.add_argument('--config', default='redesign.json')
ap.add_argument('out', nargs='?')
args = ap.parse_args()

CFG_PATH = pathlib.Path(args.config).resolve()
C = json.loads(CFG_PATH.read_text(encoding='utf-8'))
ROOT = CFG_PATH.parent
DIRS = {'parts': 'parts', 'sections': 'sections', 'css': 'css', 'assets': 'assets', 'icons': 'icons', 'today': 'today',
        **C.get('dirs', {})}
P = {k: (ROOT / v).resolve() for k, v in DIRS.items()}
missing, problems = set(), []


def read(p):
    return p.read_text(encoding='utf-8')


def tokens_css():
    theme = C.get('theme', {})
    default = theme.get('default', 'dark')
    other = 'light' if default == 'dark' else 'dark'
    phone = C['phone']
    frame = phone.get('frame', 8)

    def props(values):
        return ';'.join(f'--{k}:{v}' for k, v in values.items())

    base = props({'phone-w': f'{phone["width"] + 2 * frame}px', 'phone-h': f'{phone["height"] + 2 * frame}px',
                  'frame': f'{frame}px', **C.get('tokens', {})})
    css = f':root{{{base};{props(theme.get(default, {}))};color-scheme:{default}}}\n'
    if theme.get(other):
        block = f'{props(theme[other])};color-scheme:{other}'
        css += f':root[data-theme="{other}"]{{{block}}}\n'
        css += f'@media (prefers-color-scheme: {other}){{:root:not([data-theme="{default}"]){{{block}}}}}\n'
    return css


symbol_ids = []


def sprite():
    symbols = []
    for f in sorted(P['icons'].glob('*.svg')) if P['icons'].is_dir() else []:
        text = read(f).strip()
        if '<symbol' in text:
            symbol_ids.extend(re.findall(r'<symbol\b[^>]*\bid="([^"]+)"', text))
            symbols.append(text)
            continue
        m = re.search(r'<svg\b([^>]*)>(.*)</svg>', text, flags=re.S)
        if not m:
            problems.append(f'icon {f.name}: neither <symbol> nor <svg>')
            continue
        # a plain <svg> (lucide and most icon sets): keep its presentation attributes on the symbol
        attrs = re.sub(r'\s(?:xmlns(?::\w+)?|width|height|class|id)="[^"]*"', '', m.group(1))
        symbol_ids.append(f'i-{f.stem}')
        symbols.append(f'<symbol id="i-{f.stem}"{attrs}>{m.group(2).strip()}</symbol>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" '
            'aria-hidden="true" focusable="false">' + ''.join(symbols) + '</svg>')


def nav(m):
    cfg = C.get('nav', {})
    items = cfg.get('items', [])
    ids = [it['id'] for it in items]
    active = m.group(1)
    if active not in ids:
        missing.add('NAV ' + active)
    dots = set()
    for flag in [f for f in (m.group(2) or '').split(':') if f]:
        if flag.startswith('unread-') and flag[len('unread-'):] in ids:
            dots.add(flag[len('unread-'):])
        else:
            missing.add('NAV flag ' + flag)
    out = []
    for it in items:
        on, dot = it['id'] == active, it['id'] in dots
        cls = ' '.join(c for c in ('on' if on else '', 'unread' if dot else '') if c)
        attrs = (' aria-current="page"' if on else '') + (
            f' aria-label="{it["label"]} · {cfg.get("unread_label", "יש עדכונים")}"' if dot else '')
        target = it.get('screen', it['id'])
        link = (f'role="link" tabindex="0" data-demo-screen="{target}"' if target is not None
                else 'role="link" aria-disabled="true"')
        out.append(f'<span {link} class="{cls}"{attrs}>'
                   f'<svg class="ic" aria-hidden="true"><use href="#i-{it["icon"]}"/></svg>{it["label"]}</span>')
    return '<div class="nav">' + ''.join(out) + '</div>'


TODAY_MISSING = C.get('today_missing', {})


def placeholder(reason):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{C["phone"]["width"]}" height="{C["phone"]["height"]}">'
           '<rect width="100%" height="100%" fill="#2a2a2a"/>'
           '<text x="50%" y="46%" fill="#e6e6e6" font-family="system-ui,sans-serif" font-size="22" text-anchor="middle">'
           'לא צולם</text><text x="50%" y="52%" fill="#bdbdbd" font-family="system-ui,sans-serif" font-size="15" '
           f'text-anchor="middle">{html_escape(reason)}</text></svg>')
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()


def img(m):
    name = m.group(1)
    if name in TODAY_MISSING:
        return placeholder(TODAY_MISSING[name])
    for ext, mime in (('png', 'image/png'), ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('webp', 'image/webp')):
        p = P['today'] / f'{name}.{ext}'
        if p.exists():
            return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()
    missing.add('IMG:' + name)
    return ''


assets = {}
for f in sorted(P['assets'].glob('*.json')) if P['assets'].is_dir() else []:
    assets.update(json.loads(read(f)))
inventory = ROOT / 'INVENTORY.md'
uncaptured = set()
if inventory.exists():
    inv = read(inventory)
    part = inv.split('Screens that could not be captured', 1)[1] if 'Screens that could not be captured' in inv else ''
    uncaptured = {m.group(1) for m in re.finditer(r'^\|\s*`?([\w-]+)`?\s*\|', part.split('\n## ', 1)[0], flags=re.M)}
for name in TODAY_MISSING:
    if any((P['today'] / f'{name}.{ext}').exists() for ext in ('png', 'jpg', 'jpeg', 'webp')):
        problems.append(f'today/{name} exists: take it out of today_missing (or delete the shot if it is wrong)')
    if name not in uncaptured:
        problems.append(f'today_missing lists {name}, but INVENTORY.md «Screens that could not be captured» has no row for it (with the sources tried)')


def asset(m):
    if m.group(1) not in assets:
        missing.add('A:' + m.group(1))
        return ''
    return assets[m.group(1)]


screens = C['screens']
lint = [(r['name'], re.compile(r['pattern']), r.get('hint', '')) for r in C.get('lint', [])]
lint_hits = {}
sections = []
for i, s in enumerate(screens):
    p = P['sections'] / f'{s["id"]}.html'
    if not p.exists():
        problems.append(f'missing section {s["id"]} ({p})')
        continue
    body = read(p)
    if f'id="s-{s["id"]}"' not in body:
        problems.append(f'sections/{s["id"]}.html does not carry id="s-{s["id"]}"')
    body = re.sub(r'<section class="screen( on)?"', '<section class="screen' + (' on' if i == 0 else '') + '"', body, count=1)
    for name in re.findall(r'\{\{IMG:([a-zA-Z0-9_-]+)\}\}', body):
        if name in TODAY_MISSING and not re.search(r'class="col-label[^"]*"[^>]*>\s*היום · לא צולם', body):
            problems.append(f'sections/{s["id"]}.html: {name} is in today_missing, so its column label must read «היום · לא צולם · <reason>»')
    for name, rx, _ in lint:
        n = len(rx.findall(body))
        if n:
            lint_hits.setdefault(name, {})[s['id']] = n
    sections.append(body)

def font_faces():
    faces = []
    mime = {'woff2': 'font/woff2', 'woff': 'font/woff', 'ttf': 'font/ttf', 'otf': 'font/otf'}
    for fnt in C.get('fonts', []):
        if not isinstance(fnt, dict) or re.match(r'[a-z]+://', str(fnt.get('file', ''))):
            problems.append(f'font {fnt!r}: only local files ({{"family", "file"}}); the demo makes no network request')
            continue
        p = (ROOT / fnt['file']).resolve()
        ext = p.suffix.lstrip('.').lower()
        if not p.is_file() or ext not in mime:
            problems.append(f'font file {p} missing or not woff2/woff/ttf/otf')
            continue
        uri = f'data:{mime[ext]};base64,' + base64.b64encode(p.read_bytes()).decode()
        faces.append(f'@font-face{{font-family:"{fnt["family"]}";src:url({uri});font-weight:{fnt.get("weight", "400")};'
                     f'font-style:{fnt.get("style", "normal")};font-display:block}}')
    return '\n'.join(faces)


screen_ids = [s['id'] for s in screens]
nav_items = C.get('nav', {}).get('items', [])
for dup in sorted({i['id'] for i in nav_items if [x['id'] for x in nav_items].count(i['id']) > 1}):
    problems.append(f'tab-bar id {dup} repeats')
for it in nav_items:
    if it.get('screen', it['id']) is not None and it.get('screen', it['id']) not in screen_ids:
        problems.append(f'tab-bar item {it["id"]} opens screen {it.get("screen", it["id"])}, which is not in "screens"')

css_files = sorted(P['css'].glob('*.css')) if P['css'].is_dir() else []
extra_css = '\n'.join(f'/* {f.name} */\n' + read(f) for f in css_files)
head = (f'<title>{C["title"]}</title>\n<style id="tokens">\n{font_faces()}\n{tokens_css()}</style>\n'
        + read(P['parts'] / '00-head.html') + f'\n<style id="screens">\n{extra_css}\n</style>\n')
chrome = read(P['parts'] / '10-chrome.html')
switch = (f'<nav class="switch" role="tablist" aria-label="{C.get("switch_label", "מסכים")}">\n' + '\n'.join(
    f'  <button type="button" role="tab" aria-controls="s-{s["id"]}" aria-selected="{"true" if i == 0 else "false"}" '
    f'data-s="{s["id"]}">{s["tab"]}</button>' for i, s in enumerate(screens)) + '\n</nav>\n')
script = read(P['parts'] / '90-script.html')

body = chrome + '\n' + switch + '\n'.join(sections) + '\n</div>\n' + script
src = head + '</head>\n<body>\n' + body
src = re.sub(r'\{\{A:([a-zA-Z0-9_-]+)\}\}', asset, src)
src = re.sub(r'\{\{IMG:([a-zA-Z0-9_-]+)\}\}', img, src)
src = re.sub(r'\{\{NAV:([a-z0-9-]+)((?::[a-z0-9-]+)*)\}\}', nav, src)
src = src.replace('{{TITLE}}', C.get('title_html', C['title'])).replace('{{LEDE}}', C.get('lede', ''))
leftover = re.findall(r'\{\{[^}]*\}\}', src.replace('{{ICONS}}', ''))[:8]
src = src.replace('{{ICONS}}', sprite())
for dup in sorted({s for s in symbol_ids if symbol_ids.count(s) > 1}):
    problems.append(f'icon id {dup} repeats')
for ref in sorted(set(re.findall(r'<use\b[^>]*\bhref="#([^"]+)"', src)) - set(symbol_ids)):
    problems.append(f'<use href="#{ref}"> has no symbol in icons/')
doc = (f'<!doctype html>\n<html lang="{C.get("lang", "he")}" dir="{C.get("dir", "rtl")}">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       + src + '\n</body>\n</html>\n')

out = pathlib.Path(args.out).resolve() if args.out else ROOT / C.get('output', 'demo.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(doc, encoding='utf-8')
print(f'built {len(sections)}/{len(screens)} screens, {len(doc.encode()) // 1024} KB -> {out}')
print(f'missing {sorted(missing)} leftover {leftover}')
for p in problems:
    print('problem', p)
for name, hits in lint_hits.items():
    hint = next(h for n, _, h in lint if n == name)
    print(f'lint {name}: {hits}' + (f' ({hint})' if hint else ''))
sys.exit(1 if missing or leftover or problems else 0)

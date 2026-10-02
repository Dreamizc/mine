#!/usr/bin/env python3
"""รวมไฟล์ใน src/ เป็นไฟล์เดียว index.html (เปิดใช้งานได้ทันทีโดยไม่ต้องมีไฟล์อื่น)

ใช้งาน: python3 build.py
"""
from pathlib import Path

root = Path(__file__).parent
src = root / 'src'
tpl = (src / 'index.template.html').read_text(encoding='utf-8')
css = (src / 'style.css').read_text(encoding='utf-8')
js = '\n'.join((src / f).read_text(encoding='utf-8') for f in ['core.js', 'demo.js', 'app.js'])
out = tpl.replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js.replace('</script', '<\\/script'))
banner = '<!-- ไฟล์นี้สร้างอัตโนมัติจาก src/ ด้วย build.py — แก้ไขที่ src/ แล้วรัน python3 build.py -->\n'
(root / 'index.html').write_text(out.replace('<html lang="th">', banner + '<html lang="th">', 1), encoding='utf-8')
print(f'index.html: {len(out):,} bytes')

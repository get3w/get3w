#!/usr/bin/env python3
"""Render the Get3W desktop icon (requires Pillow and CairoSVG)."""
from pathlib import Path
from io import BytesIO
import shutil
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'apps/desktop/resources/icons'
MARK = ROOT / 'apps/app/public/openwork-mark.svg'
SIZE = 1024

# macOS icon canvas: inset plate, soft corners, generous internal whitespace.
mask = Image.new('L', (SIZE, SIZE))
ImageDraw.Draw(mask).rounded_rectangle((96, 96, 928, 928), radius=184, fill=255)
shadow = Image.new('RGBA', (SIZE, SIZE))
shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.20)))
canvas = Image.new('RGBA', (SIZE, SIZE))
canvas.alpha_composite(shadow, (0, 12))
plate = Image.new('RGBA', (SIZE, SIZE))
draw = ImageDraw.Draw(plate)
for y in range(SIZE):
    level = round(255 - 14 * max(0, min(1, (y - 96) / 832)))
    draw.line((0, y, SIZE, y), fill=(level, level, level, 255))
plate.putalpha(mask)
canvas.alpha_composite(plate)
rim = Image.new('RGBA', (SIZE, SIZE))
ImageDraw.Draw(rim).rounded_rectangle((97, 97, 927, 927), radius=183, outline=(255, 255, 255, 190), width=3)
canvas.alpha_composite(rim)

# Keep the original Get3W geometry; only its presentation changes.
svg = ET.fromstring(MARK.read_text())
svg.set('fill', '#000000')
mark = Image.open(BytesIO(cairosvg.svg2png(bytestring=ET.tostring(svg), output_width=680, output_height=680))).convert('RGBA')
mark_shadow = Image.new('RGBA', mark.size, (32, 35, 44, 0))
mark_shadow.putalpha(mark.getchannel('A').filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.17)))
canvas.alpha_composite(mark_shadow, (172, 179))
canvas.alpha_composite(mark, (172, 172))
canvas.save(ICONS / 'icon.png')
canvas.save(ICONS / 'icon.icns', format='ICNS')
canvas.save(ICONS / 'icon.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
for path in (ICONS / 'linux').glob('*.png'):
    n = int(path.stem.split('x')[0])
    canvas.resize((n, n), Image.Resampling.LANCZOS).save(path)
shutil.copyfile(ICONS / 'icon.png', ICONS / 'dev/icon.png')
shutil.copyfile(ICONS / 'icon.icns', ICONS / 'dev/icon-dev.icns')
# PWA home-screen icon uses the same plate; inline provider/sidebar marks stay theme-aware.
canvas.resize((180, 180), Image.Resampling.LANCZOS).save(ROOT / 'apps/app/public/apple-touch-icon.png')
print('Rendered Get3W application icons from the existing mark.')

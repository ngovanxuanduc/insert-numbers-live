"""Render SVG frames to PNG with rsvg-convert and assemble an animated GIF.
Usage: python assemble.py <frames dir> <out.gif>
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

frames_dir = Path(sys.argv[1])
out = Path(sys.argv[2])
manifest = json.loads((frames_dir / "manifest.json").read_text())

images, durations = [], []
for f in manifest:
    svg = frames_dir / f["name"]
    png = svg.with_suffix(".png")
    subprocess.run(["rsvg-convert", "-w", "900", "-h", "470", str(svg), "-o", str(png)], check=True)
    images.append(Image.open(png).convert("RGB"))
    durations.append(f["ms"])

# Dùng chung một bảng màu cho mọi frame để màu nền không bị nhấp nháy giữa các frame.
sheet = Image.new("RGB", (900, 470 * len(images)))
for k, im in enumerate(images):
    sheet.paste(im, (0, 470 * k))
palette = sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]

frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(out, f"{out.stat().st_size / 1024:.0f} KB", len(frames), "frames")

"""Derive Android launcher assets from the Pixel-style (2026) master artwork.

`desktop/buildResources/icon-android.png` is the 72 dp visible viewport of the
launcher design (layered document on white), drawn on a 1024 px canvas.

Run from the repository root:
    uv run --no-project --with pillow python android/scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw


repo = Path(__file__).resolve().parents[2]
source = Image.open(repo / "desktop/buildResources/icon-android.png").convert("RGBA")
res = repo / "android/app/src/main/res"
BACKGROUND = "#FFFFFF"  # keep in sync with @color/app_icon_background

# Legacy (pre-adaptive) launchers: white circle with the artwork, as on Pixel.
tile = Image.new("RGBA", source.size, BACKGROUND)
tile.alpha_composite(source)
for density, size in [
    ("mdpi", 48),
    ("hdpi", 72),
    ("xhdpi", 96),
    ("xxhdpi", 144),
    ("xxxhdpi", 192),
]:
    icon = tile.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4))
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    icon.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    output = res / f"mipmap-{density}/app_icon.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    icon.save(output)

# 108dp at xxxhdpi. The master is the central 72dp viewport; the launcher owns
# the final outer mask and the artwork stays within the 66dp safe circle.
canvas_size = 432
art_size = 288
foreground = Image.new("RGBA", (canvas_size, canvas_size))
foreground.alpha_composite(
    source.resize((art_size, art_size), Image.Resampling.LANCZOS),
    ((canvas_size - art_size) // 2, (canvas_size - art_size) // 2),
)
output = res / "drawable-xxxhdpi/app_icon_foreground.png"
output.parent.mkdir(parents=True, exist_ok=True)
foreground.save(output)

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


SOURCE_DIR = Path("/Users/manishkumar/Desktop/updated_portfolio_000")
OUTPUT_DIR = Path("/Users/manishkumar/Desktop/portfolio/public")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

COLS = 256
ROWS = 144
WATERMARK_BOX = (1714, 938, 1918, 1072)


def erase_watermark(image: Image.Image) -> Image.Image:
    cleaned = image.copy()
    x0, y0, x1, y1 = WATERMARK_BOX
    height = y1 - y0
    source_top = max(0, y0 - height - 12)
    source_bottom = max(source_top + 1, y0 - 12)
    patch = cleaned.crop((x0, source_top, x1, source_bottom))
    if patch.size != (x1 - x0, y1 - y0):
        patch = patch.resize((x1 - x0, y1 - y0), Image.Resampling.BICUBIC)
    cleaned.paste(patch, (x0, y0))
    return cleaned


def clear_border(image: Image.Image, inset: int = 2) -> Image.Image:
    cleaned = image.copy()
    width, height = cleaned.size
    cleaned.paste(0, (0, 0, width, inset))
    cleaned.paste(0, (0, height - inset, width, height))
    cleaned.paste(0, (0, 0, inset, height))
    cleaned.paste(0, (width - inset, 0, width, height))
    return cleaned


def build_object_mask(image: Image.Image) -> Image.Image:
    softened = image.filter(ImageFilter.GaussianBlur(radius=0.85))
    thresholded = softened.point(lambda value: 255 if value < 247 else 0)
    consolidated = (
        thresholded.filter(ImageFilter.MaxFilter(size=3))
        .filter(ImageFilter.MinFilter(size=3))
        .filter(ImageFilter.MaxFilter(size=3))
        .filter(ImageFilter.GaussianBlur(radius=0.7))
    )
    return clear_border(consolidated, inset=2)


def build_dark_shape_map(image: Image.Image, object_mask: Image.Image) -> Image.Image:
    softened = image.filter(ImageFilter.GaussianBlur(radius=0.75))
    thresholded = softened.point(lambda value: 255 if value < 208 else 0)
    consolidated = (
        thresholded.filter(ImageFilter.MaxFilter(size=3))
        .filter(ImageFilter.MinFilter(size=3))
        .filter(ImageFilter.GaussianBlur(radius=0.55))
    )
    shaped = ImageChops.multiply(consolidated, object_mask)
    return clear_border(shaped, inset=2)


def build_contour_map(image: Image.Image, object_mask: Image.Image) -> Image.Image:
    softened = image.filter(ImageFilter.GaussianBlur(radius=1.2))
    edges = softened.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(radius=0.6))
    edges = ImageOps.autocontrast(edges, cutoff=2)
    edges = edges.point(
        lambda value: 0 if value < 16 else min(255, int((value - 16) * 255 / 164))
    )
    object_halo = object_mask.filter(ImageFilter.MaxFilter(size=7)).filter(
        ImageFilter.GaussianBlur(radius=0.7)
    )
    contour = ImageChops.multiply(edges, object_halo)
    return clear_border(contour, inset=2)


def build() -> None:
    frames = sorted(SOURCE_DIR.glob("*.jpg"))
    if not frames:
        raise SystemExit("No frame images found.")

    luma_bytes = bytearray()
    edge_bytes = bytearray()
    material_bytes = bytearray()
    silhouette_bytes = bytearray()

    for frame in frames:
        grayscale = erase_watermark(Image.open(frame).convert("L"))
        resized = grayscale.filter(
            ImageFilter.UnsharpMask(radius=1.4, percent=140, threshold=2)
        ).resize((COLS, ROWS), Image.Resampling.BICUBIC)
        silhouette = build_object_mask(resized)
        material = build_dark_shape_map(resized, silhouette)
        structure = build_contour_map(resized, silhouette)
        luma_bytes.extend(resized.tobytes())
        edge_bytes.extend(structure.tobytes())
        material_bytes.extend(material.tobytes())
        silhouette_bytes.extend(silhouette.tobytes())

    metadata = {
        "cols": COLS,
        "rows": ROWS,
        "frameCount": len(frames),
        "sourceWidth": 1920,
        "sourceHeight": 1080,
        "lumaFile": "frame-luma.bin",
        "edgeFile": "frame-edge.bin",
        "materialFile": "frame-material.bin",
        "silhouetteFile": "frame-silhouette.bin",
    }

    (OUTPUT_DIR / "frame-luma.bin").write_bytes(luma_bytes)
    (OUTPUT_DIR / "frame-edge.bin").write_bytes(edge_bytes)
    (OUTPUT_DIR / "frame-material.bin").write_bytes(material_bytes)
    (OUTPUT_DIR / "frame-silhouette.bin").write_bytes(silhouette_bytes)
    (OUTPUT_DIR / "frame-data.json").write_text(json.dumps(metadata), encoding="utf-8")

    print(f"Wrote {len(frames)} frames to {OUTPUT_DIR}")


if __name__ == "__main__":
    build()

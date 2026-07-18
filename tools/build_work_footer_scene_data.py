from __future__ import annotations

import json
import os
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public"
REFERENCE_PATH = Path(
    os.environ.get(
        "WORK_FOOTER_SCENE_REFERENCE",
        str(OUTPUT_DIR / "work-footer-scene-reference.png"),
    )
)
SOURCE_PATH = Path(
    os.environ.get(
        "WORK_FOOTER_SCENE_SOURCE",
        "/Users/manishkumar/Downloads/undefined - Imgur.png",
    )
)

COLS = int(os.environ.get("WORK_FOOTER_SCENE_COLS", "200"))
CELL_RECORD_BYTES = 13
GLYPH_FAMILIES = [
    "1I7",
    "LTV",
    "XYZ",
    "ACS",
    "EPR",
    "NQ25",
    "6893",
    "0ABG",
    "8QMW",
    "WM80",
]
BLUE_LIGHT = {"r": 78, "g": 124, "b": 255}
BLUE_DARK = {"r": 25, "g": 67, "b": 245}
STRAIGHT_POLE_GUIDES = [
    # Coordinates are normalized to the blue reference image. Each guide is a
    # hand-straightened lamp stem that should keep exactly two glyph columns.
    {
        "start": (235 / 1354, 243 / 768),
        "end": (235 / 1354, 508 / 768),
        "clear_start": (235 / 1354, 243 / 768),
        "clear_end": (235 / 1354, 508 / 768),
    },
    {
        "start": (769 / 1354, 221 / 768),
        "end": (769 / 1354, 380 / 768),
        "clear_start": (769 / 1354, 221 / 768),
        "clear_end": (769 / 1354, 380 / 768),
    },
    {
        "start": (1190 / 1354, 257 / 768),
        "end": (1162 / 1354, 580 / 768),
        "clear_start": (1190 / 1354, 257 / 768),
        "clear_end": (1162 / 1354, 580 / 768),
    },
]
FLOOR_POLYGON = [
    (0, 706),
    (235, 675),
    (515, 632),
    (780, 586),
    (935, 536),
    (1110, 542),
    (1305, 566),
    (1510, 622),
    (1920, 710),
    (1920, 1090),
    (0, 1090),
]


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 1 if value >= edge1 else 0

    amount = max(0, min(1, (value - edge0) / (edge1 - edge0)))
    return amount * amount * (3 - 2 * amount)


def draw_rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=255)


def get_blue_reference_mask(reference: Image.Image) -> Image.Image:
    rgba = reference.convert("RGBA")
    width, height = rgba.size
    rgba_pixels = rgba.load()
    mask = Image.new("L", rgba.size, 0)
    mask_pixels = mask.load()

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = rgba_pixels[x, y]
            if alpha <= 0:
                continue

            is_blue = (
                blue >= 62 and
                blue - red >= 28 and
                blue - green >= 8 and
                red <= 190 and
                green <= 225
            )
            if not is_blue:
                continue

            blue_separation = min(255, (blue - red) * 1.6 + (blue - green) * 1.1)
            mask_pixels[x, y] = max(160, round(blue_separation))

    return mask


def build_reference_weight(mask: Image.Image, edge: Image.Image) -> Image.Image:
    soft_fill = mask.filter(ImageFilter.GaussianBlur(1.4))
    edge_boost = edge.filter(ImageFilter.MaxFilter(3))
    return ImageChops.lighter(soft_fill, edge_boost)


def clear_isolated_pole_path(
    mask: Image.Image,
    clear_mask: Image.Image,
    pole_mask: Image.Image,
) -> Image.Image:
    width, height = mask.size
    cleaned = mask.copy()
    mask_pixels = mask.load()
    clear_pixels = clear_mask.load()
    pole_pixels = pole_mask.load()
    cleaned_pixels = cleaned.load()

    for y in range(height):
        for x in range(width):
            if clear_pixels[x, y] <= 0 or pole_pixels[x, y] > 0:
                continue

            nearby_scene_cells = 0
            for sample_y in range(max(0, y - 2), min(height, y + 3)):
                for sample_x in range(max(0, x - 7), min(width, x + 8)):
                    if (
                        clear_pixels[sample_x, sample_y] <= 0 and
                        mask_pixels[sample_x, sample_y] > 5
                    ):
                        nearby_scene_cells += 1

            if nearby_scene_cells < 4:
                cleaned_pixels[x, y] = 0

    return cleaned


def remove_right_lamp_slant_and_bridge_floor(
    mask: Image.Image,
    pole_mask: Image.Image,
) -> Image.Image:
    width, height = mask.size
    repaired = mask.copy()
    source_pixels = mask.load()
    pole_pixels = pole_mask.load()
    repaired_pixels = repaired.load()
    start_x = (1190 / 1354) * width
    start_y = round((257 / 768) * height)
    end_x = (1162 / 1354) * width
    end_y = round((580 / 768) * height)
    floor_bridge_row = round((515 / 768) * height)
    row_span = max(1, end_y - start_y)
    cleared_cells: list[tuple[int, int]] = []

    for y in range(start_y, end_y + 1):
        progress = (y - start_y) / row_span
        source_x = start_x + (end_x - start_x) * progress
        center_column = (source_x / width) * width
        left_column = max(0, min(width - 2, round(center_column - 0.5)))

        for x in range(max(0, left_column - 1), min(width, left_column + 3)):
            if pole_pixels[x, y] > 0:
                continue

            if source_pixels[x, y] <= 5:
                continue

            repaired_pixels[x, y] = 0
            cleared_cells.append((x, y))

    for x, y in cleared_cells:
        if y < floor_bridge_row:
            continue

        left_neighbors = [
            repaired_pixels[sample_x, y]
            for sample_x in range(max(0, x - 5), max(0, x - 1))
            if pole_pixels[sample_x, y] <= 0
        ]
        right_neighbors = [
            repaired_pixels[sample_x, y]
            for sample_x in range(min(width, x + 2), min(width, x + 6))
            if pole_pixels[sample_x, y] <= 0
        ]
        left_has_floor = max(left_neighbors, default=0) > 5
        right_has_floor = max(right_neighbors, default=0) > 5

        if left_has_floor and right_has_floor:
            repaired_pixels[x, y] = max(max(left_neighbors), max(right_neighbors))

    return repaired


def remove_right_lamp_adjacent_ghost(mask: Image.Image, pole_mask: Image.Image) -> Image.Image:
    width, height = mask.size
    repaired = mask.copy()
    pole_pixels = pole_mask.load()
    repaired_pixels = repaired.load()
    start_row = round((445 / 768) * height)
    end_row = round((520 / 768) * height)
    ghost_columns = range(
        max(0, round((1186 / 1354) * width) - 1),
        min(width, round((1186 / 1354) * width) + 1),
    )

    for y in range(start_row, end_row + 1):
        for x in ghost_columns:
            if pole_pixels[x, y] <= 0:
                repaired_pixels[x, y] = 0

    return repaired


def clean_right_lamp_stem_area(mask: Image.Image, pole_mask: Image.Image) -> Image.Image:
    width, height = mask.size
    cleaned = mask.copy()
    pole_pixels = pole_mask.load()
    cleaned_pixels = cleaned.load()
    center_column = round((1190 / 1354) * width)

    ghost_start_row = round((370 / 768) * height)
    ghost_end_row = round((505 / 768) * height)
    for y in range(ghost_start_row, ghost_end_row + 1):
        for x in range(max(0, center_column - 10), max(0, center_column - 1)):
            if pole_pixels[x, y] <= 0:
                cleaned_pixels[x, y] = 0

    stray_start_row = round((365 / 768) * height)
    stray_end_row = round((505 / 768) * height)
    for y in range(stray_start_row, stray_end_row + 1):
        for x in range(max(0, center_column - 17), max(0, center_column - 10)):
            if pole_pixels[x, y] <= 0:
                cleaned_pixels[x, y] = 0

    return cleaned


def replace_right_lamp_base(mask: Image.Image, pole_mask: Image.Image) -> Image.Image:
    width, height = mask.size
    repaired = mask.copy()
    pole_pixels = pole_mask.load()
    repaired_pixels = repaired.load()
    center_column = round((1190 / 1354) * width)
    clear_start_row = round((500 / 768) * height)
    clear_end_row = round((626 / 768) * height)

    for y in range(clear_start_row, clear_end_row + 1):
        for x in range(max(0, center_column - 20), min(width, center_column + 15)):
            if pole_pixels[x, y] <= 0:
                repaired_pixels[x, y] = 0

    base = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(base)
    base_center_y = round((590 / 768) * height)
    draw.ellipse(
        (
            center_column - 7,
            base_center_y - 3,
            center_column + 8,
            base_center_y + 4,
        ),
        fill=255,
    )
    draw.rectangle(
        (
            center_column - 1,
            round((575 / 768) * height),
            center_column + 2,
            base_center_y,
        ),
        fill=255,
    )

    return ImageChops.lighter(repaired, base)


def build_straight_pole_masks(
    source_size: tuple[int, int],
    grid_size: tuple[int, int],
) -> tuple[Image.Image, Image.Image, Image.Image, Image.Image]:
    source_width, source_height = source_size
    cols, rows = grid_size
    source_mask = Image.new("L", source_size, 0)
    source_clear_mask = Image.new("L", source_size, 0)
    grid_mask = Image.new("L", grid_size, 0)
    grid_clear_mask = Image.new("L", grid_size, 0)
    source_draw = ImageDraw.Draw(source_mask)
    source_clear_draw = ImageDraw.Draw(source_clear_mask)
    grid_pixels = grid_mask.load()
    clear_pixels = grid_clear_mask.load()
    source_line_width = max(6, round((source_width / cols) * 2.5))
    source_clear_width = max(source_line_width * 2, round((source_width / cols) * 4))

    def clear_grid_line(
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
    ) -> None:
        start_row = max(0, min(rows - 1, round((start_y / source_height) * rows)))
        end_row = max(0, min(rows - 1, round((end_y / source_height) * rows)))
        if end_row < start_row:
            start_row, end_row = end_row, start_row

        row_span = max(1, end_row - start_row)
        for row in range(start_row, end_row + 1):
            progress = (row - start_row) / row_span
            source_x = start_x + (end_x - start_x) * progress
            center_column = (source_x / source_width) * cols
            left_column = max(0, min(cols - 2, round(center_column - 0.5)))

            for clear_column in range(
                max(0, left_column - 4),
                min(cols, left_column + 6),
            ):
                clear_pixels[clear_column, row] = 255

    for guide in STRAIGHT_POLE_GUIDES:
        start_x = guide["start"][0] * source_width
        start_y = guide["start"][1] * source_height
        end_x = guide["end"][0] * source_width
        end_y = guide["end"][1] * source_height
        clear_start_x = guide["clear_start"][0] * source_width
        clear_start_y = guide["clear_start"][1] * source_height
        clear_end_x = guide["clear_end"][0] * source_width
        clear_end_y = guide["clear_end"][1] * source_height

        source_clear_draw.line(
            (
                round(clear_start_x),
                round(clear_start_y),
                round(clear_end_x),
                round(clear_end_y),
            ),
            fill=255,
            width=source_clear_width,
        )
        if (
            round(clear_start_x) != round(start_x) or
            round(clear_end_x) != round(end_x) or
            round(clear_start_y) != round(start_y) or
            round(clear_end_y) != round(end_y)
        ):
            clear_grid_line(clear_start_x, clear_start_y, clear_end_x, clear_end_y)

        source_draw.line(
            (
                round(start_x),
                round(start_y),
                round(end_x),
                round(end_y),
            ),
            fill=255,
            width=source_line_width,
        )

        start_row = max(0, min(rows - 1, round((start_y / source_height) * rows)))
        end_row = max(0, min(rows - 1, round((end_y / source_height) * rows)))
        if end_row < start_row:
            start_row, end_row = end_row, start_row

        row_span = max(1, end_row - start_row)
        for row in range(start_row, end_row + 1):
            progress = (row - start_row) / row_span
            source_x = start_x + (end_x - start_x) * progress
            center_column = (source_x / source_width) * cols
            left_column = max(0, min(cols - 2, round(center_column - 0.5)))

            grid_pixels[left_column, row] = 255
            grid_pixels[left_column + 1, row] = 255

    return (
        source_mask.filter(ImageFilter.GaussianBlur(0.35)),
        grid_mask,
        grid_clear_mask,
        source_clear_mask.filter(ImageFilter.GaussianBlur(0.35)),
    )


def draw_reference_weight_masks(size: tuple[int, int]) -> tuple[Image.Image, Image.Image]:
    width, height = size
    object_mask = Image.new("L", size, 0)
    emphasis_mask = Image.new("L", size, 0)
    object_draw = ImageDraw.Draw(object_mask)
    emphasis_draw = ImageDraw.Draw(emphasis_mask)

    def box(values: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
        left, top, right, bottom = values
        return (
            round(left * width),
            round(top * height),
            round(right * width),
            round(bottom * height),
        )

    def rounded(
        values: tuple[float, float, float, float],
        radius: float,
        *,
        emphasize: bool = False,
    ) -> None:
        target_box = box(values)
        target_radius = round(radius * min(width, height))
        draw_rounded(object_draw, target_box, target_radius)
        if emphasize:
            draw_rounded(emphasis_draw, target_box, target_radius)

    # Lamps, table, and small props receive a medium object weight.
    object_draw.rectangle(box((0.168, 0.31, 0.174, 0.73)), fill=255)
    object_draw.ellipse(box((0.151, 0.69, 0.194, 0.75)), fill=255)
    object_draw.polygon(
        [
            (round(0.142 * width), round(0.2 * height)),
            (round(0.202 * width), round(0.2 * height)),
            (round(0.182 * width), round(0.314 * height)),
            (round(0.164 * width), round(0.314 * height)),
        ],
        fill=255,
    )
    object_draw.rectangle(box((0.56, 0.285, 0.566, 0.5)), fill=255)
    object_draw.polygon(
        [
            (round(0.545 * width), round(0.195 * height)),
            (round(0.592 * width), round(0.195 * height)),
            (round(0.575 * width), round(0.286 * height)),
            (round(0.563 * width), round(0.286 * height)),
        ],
        fill=255,
    )
    object_draw.rectangle(box((0.872, 0.33, 0.879, 0.765)), fill=255)
    object_draw.ellipse(box((0.837, 0.748, 0.914, 0.81)), fill=255)
    object_draw.polygon(
        [
            (round(0.85 * width), round(0.198 * height)),
            (round(0.925 * width), round(0.198 * height)),
            (round(0.897 * width), round(0.33 * height)),
            (round(0.879 * width), round(0.33 * height)),
        ],
        fill=255,
    )
    rounded((0.232, 0.496, 0.322, 0.62), 0.008)
    object_draw.ellipse(box((0.264, 0.452, 0.286, 0.49)), fill=255)

    # Couches and statue receive the strongest fill/density.
    rounded((0.294, 0.4, 0.382, 0.535), 0.034, emphasize=True)
    rounded((0.31, 0.48, 0.456, 0.62), 0.036, emphasize=True)
    rounded((0.382, 0.455, 0.45, 0.63), 0.03, emphasize=True)
    rounded((0.552, 0.48, 0.666, 0.655), 0.04, emphasize=True)
    rounded((0.625, 0.425, 0.724, 0.57), 0.036, emphasize=True)
    rounded((0.696, 0.464, 0.842, 0.744), 0.038, emphasize=True)
    rounded((0.752, 0.438, 0.838, 0.605), 0.035, emphasize=True)
    rounded((0.77, 0.23, 0.826, 0.462), 0.034, emphasize=True)

    return (
        object_mask.filter(ImageFilter.GaussianBlur(1.0)),
        emphasis_mask.filter(ImageFilter.GaussianBlur(1.35)),
    )



def make_target_couch_mask(size: tuple[int, int]) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)

    def sx(value: float) -> int:
        return round(value * width)

    def sy(value: float) -> int:
        return round(value * height)

    draw_rounded(draw, (sx(0.17), sy(0.02), sx(0.74), sy(0.48)), sx(0.12))
    draw_rounded(draw, (sx(0.12), sy(0.34), sx(0.82), sy(0.75)), sx(0.1))
    draw_rounded(draw, (sx(0.00), sy(0.22), sx(0.27), sy(0.91)), sx(0.11))
    draw_rounded(draw, (sx(0.68), sy(0.28), sx(0.99), sy(0.92)), sx(0.12))
    draw_rounded(draw, (sx(0.14), sy(0.66), sx(0.88), sy(0.94)), sx(0.08))
    draw.rectangle((sx(0.12), sy(0.88), sx(0.9), sy(0.98)), fill=255)

    return mask.filter(ImageFilter.GaussianBlur(max(1, round(width * 0.012))))


def paste_neighbor_couch(scene: Image.Image) -> None:
    source_box = (1048, 454, 1408, 772)
    target_box = (1328, 488, 1648, 812)
    target_width = target_box[2] - target_box[0]
    target_height = target_box[3] - target_box[1]
    couch = scene.crop(source_box).resize((target_width, target_height), Image.Resampling.LANCZOS)
    alpha = make_target_couch_mask((target_width, target_height))
    scene.paste(couch, target_box[:2], alpha)


def draw_floor_area_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(FLOOR_POLYGON, fill=255)
    return mask


def draw_scene_masks(scene: Image.Image) -> tuple[Image.Image, Image.Image, Image.Image]:
    size = scene.size
    object_mask = Image.new("L", size, 0)
    emphasis_mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(object_mask)
    emphasis_draw = ImageDraw.Draw(emphasis_mask)

    # Left side table and small lamp.
    draw.polygon([(448, 557), (614, 552), (622, 584), (454, 594)], fill=255)
    draw.rectangle((472, 584, 490, 686), fill=255)
    draw.rectangle((529, 580, 547, 694), fill=255)
    draw.rectangle((586, 580, 604, 685), fill=255)
    draw.polygon([(462, 650), (610, 646), (596, 686), (470, 692)], fill=255)
    draw.ellipse((506, 493, 565, 535), fill=255)
    draw.polygon([(530, 512), (566, 498), (556, 548), (515, 562)], fill=255)
    draw.polygon([(526, 548), (553, 548), (568, 592), (508, 592)], fill=255)

    # Left couch.
    left_couch_shapes = [
        ((565, 430, 748, 578), 46),
        ((538, 524, 838, 686), 36),
        ((535, 515, 624, 718), 36),
        ((742, 504, 842, 716), 34),
        ((574, 636, 820, 724), 28),
    ]
    for box, radius in left_couch_shapes:
        draw_rounded(draw, box, radius)
        draw_rounded(emphasis_draw, box, radius)

    # Center floor lamp.
    draw.polygon([(1053, 216), (1132, 216), (1114, 256), (1102, 318), (1091, 354), (1078, 318), (1070, 256)], fill=255)
    draw.rectangle((1086, 315, 1095, 562), fill=255)
    draw.ellipse((1062, 545, 1121, 574), fill=255)

    # Neighboring couch plus its darker duplicate.
    center_couch_shapes = [
        ((1084, 462, 1376, 594), 48),
        ((1055, 546, 1408, 706), 42),
        ((1050, 510, 1140, 744), 38),
        ((1292, 528, 1408, 746), 42),
        ((1086, 650, 1382, 752), 28),
    ]
    for box, radius in center_couch_shapes:
        draw_rounded(draw, box, radius)
        draw_rounded(emphasis_draw, box, radius)

    target_couch = make_target_couch_mask((320, 324))
    object_mask.paste(
        ImageChops.lighter(object_mask.crop((1328, 488, 1648, 812)), target_couch),
        (1328, 488),
    )
    emphasis_mask.paste(
        ImageChops.lighter(emphasis_mask.crop((1328, 488, 1648, 812)), target_couch),
        (1328, 488),
    )

    # Statue.
    draw.ellipse((1492, 252, 1540, 305), fill=255)
    emphasis_draw.ellipse((1492, 252, 1540, 305), fill=255)
    draw.polygon(
        [
            (1512, 292),
            (1564, 316),
            (1588, 456),
            (1606, 517),
            (1548, 538),
            (1497, 501),
            (1476, 428),
            (1488, 356),
        ],
        fill=255,
    )
    emphasis_draw.polygon(
        [
            (1512, 292),
            (1564, 316),
            (1588, 456),
            (1606, 517),
            (1548, 538),
            (1497, 501),
            (1476, 428),
            (1488, 356),
        ],
        fill=255,
    )
    draw_rounded(draw, (1475, 342, 1546, 417), 26)
    draw_rounded(draw, (1518, 398, 1594, 458), 24)
    draw_rounded(emphasis_draw, (1475, 342, 1546, 417), 26)
    draw_rounded(emphasis_draw, (1518, 398, 1594, 458), 24)

    # Right floor lamp.
    draw.polygon([(1618, 218), (1762, 218), (1730, 264), (1708, 338), (1686, 356), (1665, 263)], fill=255)
    draw.rectangle((1686, 333, 1696, 802), fill=255)
    draw.ellipse((1625, 790, 1712, 850), fill=255)

    floor_area = draw_floor_area_mask(size)
    grayscale = ImageOps.grayscale(scene)
    dark_floor = grayscale.point(lambda value: 170 if value < 86 else 0)
    floor_pattern = ImageChops.multiply(dark_floor, floor_area)
    expanded_objects = object_mask.filter(ImageFilter.MaxFilter(13))
    object_blocker = expanded_objects.point(lambda value: 255 if value > 8 else 0)
    floor_pattern = ImageChops.subtract(floor_pattern, object_blocker)
    floor_pattern = floor_pattern.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.55))

    object_mask = object_mask.filter(ImageFilter.GaussianBlur(0.9))
    object_mask = ImageOps.autocontrast(object_mask)
    emphasis_mask = emphasis_mask.filter(ImageFilter.GaussianBlur(1.2))
    emphasis_mask = ImageOps.autocontrast(emphasis_mask)
    full_mask = ImageChops.lighter(object_mask, floor_pattern)

    return full_mask, object_mask, emphasis_mask


def write_bytes(path: Path, image: Image.Image) -> None:
    if hasattr(image, "get_flattened_data"):
        path.write_bytes(bytes(image.get_flattened_data()))
        return

    path.write_bytes(bytes(image.getdata()))


def mask_alpha(mask_value: int) -> float:
    return smoothstep(0.018, 0.82, mask_value / 255)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def lerp(start: float, end: float, amount: float) -> float:
    return start + (end - start) * amount


def mix_footer_color(depth: float, region_weight: float, edge_detail: float) -> dict[str, int]:
    tone = clamp(0.1 + depth * 0.76 + region_weight * 0.1 + edge_detail * 0.08, 0, 1)

    return {
        "r": round(lerp(BLUE_LIGHT["r"], BLUE_DARK["r"], tone)),
        "g": round(lerp(BLUE_LIGHT["g"], BLUE_DARK["g"], tone)),
        "b": round(lerp(BLUE_LIGHT["b"], BLUE_DARK["b"], tone)),
    }


def footer_hash(column: int, row: int, salt: int = 0) -> int:
    hash_value = (
        (column * 73856093 & 0xFFFFFFFF) ^
        (row * 19349663 & 0xFFFFFFFF) ^
        (salt * 83492791 & 0xFFFFFFFF)
    ) & 0xFFFFFFFF
    hash_value = (hash_value ^ (hash_value >> 13)) & 0xFFFFFFFF
    hash_value = (hash_value * 1274126177) & 0xFFFFFFFF
    hash_value = (hash_value ^ (hash_value >> 16)) & 0xFFFFFFFF

    return hash_value


def footer_glyph(column: int, row: int, ink: float) -> str:
    family_index = min(
        len(GLYPH_FAMILIES) - 1,
        int(clamp(ink, 0, 0.9999) * len(GLYPH_FAMILIES)),
    )
    family = GLYPH_FAMILIES[family_index]
    hash_value = footer_hash(column, row, family_index * 173 + 5021)

    return family[hash_value % len(family)]


def build_separator_strengths(
    luma: Image.Image,
    edge: Image.Image,
    mask: Image.Image,
) -> tuple[bytes, list[float]]:
    width, height = luma.size
    luma_pixels = luma.load()
    edge_pixels = edge.load()
    mask_pixels = mask.load()
    values: list[float] = []

    for y in range(height):
        for x in range(width):
            current_mask_alpha = mask_alpha(mask_pixels[x, y])
            darkness = 1 - luma_pixels[x, y] / 255
            source_edge = edge_pixels[x, y] / 255
            neighbor_darkness = 0.0
            neighbor_count = 0
            max_darkness = darkness
            min_darkness = darkness
            strong_mask_neighbors = 0
            max_neighbor_mask = current_mask_alpha

            for row_offset in range(-2, 3):
                sample_y = y + row_offset
                if sample_y < 0 or sample_y >= height:
                    continue

                for column_offset in range(-2, 3):
                    sample_x = x + column_offset
                    if (
                        (row_offset == 0 and column_offset == 0) or
                        sample_x < 0 or
                        sample_x >= width
                    ):
                        continue

                    sample_darkness = 1 - luma_pixels[sample_x, sample_y] / 255
                    sample_mask = mask_alpha(mask_pixels[sample_x, sample_y])
                    neighbor_darkness += sample_darkness
                    neighbor_count += 1
                    min_darkness = min(min_darkness, sample_darkness)
                    max_darkness = max(max_darkness, sample_darkness)
                    max_neighbor_mask = max(max_neighbor_mask, sample_mask)

                    if sample_mask > 0.24:
                        strong_mask_neighbors += 1

            average_darkness = (
                neighbor_darkness / neighbor_count
                if neighbor_count > 0
                else darkness
            )
            local_contrast = max(
                0,
                min(
                    1,
                    abs(darkness - average_darkness) +
                    (max_darkness - min_darkness) * 0.24,
                ),
            )
            bright_gap = 1 - smoothstep(0.16, 0.56, darkness)
            interior_edge = (
                smoothstep(0.18, 0.68, source_edge + local_contrast * 0.34) *
                smoothstep(0.04, 0.32, current_mask_alpha) *
                bright_gap
            )
            surrounded_gap = (
                smoothstep(0.16, 0.5, max_neighbor_mask) *
                smoothstep(2, 9, strong_mask_neighbors) *
                (1 - smoothstep(0.1, 0.38, current_mask_alpha)) *
                max(0, min(1, 0.58 + source_edge * 0.62 + local_contrast * 0.34)) *
                bright_gap
            )

            values.append(max(interior_edge, surrounded_gap))

    return struct.pack(f"<{len(values)}f", *values), values


def build_cell_records(
    luma: Image.Image,
    edge: Image.Image,
    mask: Image.Image,
    weight: Image.Image,
    pole: Image.Image,
    separator_strengths: list[float],
) -> tuple[bytes, int]:
    width, height = luma.size
    luma_pixels = luma.load()
    edge_pixels = edge.load()
    mask_pixels = mask.load()
    weight_pixels = weight.load()
    pole_pixels = pole.load()
    records = bytearray()
    cell_count = 0

    for y in range(height):
        for x in range(width):
            index = y * width + x
            current_mask_alpha = mask_alpha(mask_pixels[x, y])
            is_pole = pole_pixels[x, y] > 0

            if current_mask_alpha <= (0.04 if is_pole else 0.075):
                continue

            source_edge = edge_pixels[x, y] / 255
            region_weight = weight_pixels[x, y] / 255
            darkness = 1 - luma_pixels[x, y] / 255
            neighbor_darkness = 0.0
            neighbor_count = 0
            min_mask_alpha = current_mask_alpha
            max_darkness = darkness
            min_darkness = darkness

            for row_offset in range(-1, 2):
                sample_y = y + row_offset
                if sample_y < 0 or sample_y >= height:
                    continue

                for column_offset in range(-1, 2):
                    sample_x = x + column_offset
                    if (
                        (row_offset == 0 and column_offset == 0) or
                        sample_x < 0 or
                        sample_x >= width
                    ):
                        continue

                    sample_darkness = 1 - luma_pixels[sample_x, sample_y] / 255
                    neighbor_darkness += sample_darkness
                    neighbor_count += 1
                    min_darkness = min(min_darkness, sample_darkness)
                    max_darkness = max(max_darkness, sample_darkness)
                    min_mask_alpha = min(
                        min_mask_alpha,
                        mask_alpha(mask_pixels[sample_x, sample_y]),
                    )

            average_darkness = (
                neighbor_darkness / neighbor_count
                if neighbor_count > 0
                else darkness
            )
            local_contrast = clamp(
                abs(darkness - average_darkness) +
                (max_darkness - min_darkness) * 0.24,
                0,
                1,
            )
            edge_detail = smoothstep(0.02, 0.72, source_edge * 0.78 + local_contrast * 0.72)
            boundary = smoothstep(0.035, 0.74, current_mask_alpha - min_mask_alpha)
            fill = smoothstep(0.035, 0.82, darkness)
            separator = 0 if is_pole else separator_strengths[index]

            if separator > 0.34:
                continue

            contour_strength = max(
                boundary,
                edge_detail * 0.74,
                smoothstep(0.08, 0.42, current_mask_alpha) *
                smoothstep(0.22, 0.62, local_contrast),
            )

            if (
                not is_pole and
                current_mask_alpha < 0.16 and
                contour_strength < 0.34
            ):
                continue

            ink = clamp(fill * 0.78 + edge_detail * 0.26 + boundary * 0.12, 0, 1)
            raw_alpha = (
                current_mask_alpha * 0.76
                if is_pole
                else current_mask_alpha *
                (0.42 + fill * 0.22 + edge_detail * 0.1 + boundary * 0.08) *
                clamp(0.86 + region_weight * 0.1, 0.86, 0.96) *
                (1 - separator * 0.86)
            )

            if raw_alpha <= 0.03:
                continue

            alpha_floor = (
                0.12
                if is_pole
                else 0.055 + contour_strength * 0.1
            )
            alpha_ceiling = 0.78 if is_pole else 0.82
            alpha_hundred = round(clamp(raw_alpha, alpha_floor, alpha_ceiling) * 100)
            depth = (
                0.94
                if is_pole
                else clamp(
                    ink * 0.82 +
                    edge_detail * 0.1 +
                    boundary * 0.08 +
                    contour_strength * 0.04,
                    0,
                    1,
                )
            )
            color = mix_footer_color(
                depth,
                1 if is_pole else region_weight,
                1 if is_pole else edge_detail,
            )
            glyph = "I" if is_pole else footer_glyph(x, y, ink)

            records.extend(
                struct.pack(
                    "<HHfBBBBB",
                    x,
                    y,
                    ink,
                    color["r"],
                    color["g"],
                    color["b"],
                    alpha_hundred,
                    ord(glyph),
                )
            )
            cell_count += 1

    return bytes(records), cell_count


def build() -> None:
    if not REFERENCE_PATH.exists():
        raise SystemExit(f"Missing work footer scene reference: {REFERENCE_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    reference = Image.open(REFERENCE_PATH).convert("RGBA")
    source_width, source_height = reference.size
    rows = round(COLS * source_height / source_width)
    reference_rgb = Image.new("RGB", reference.size, "white")
    reference_rgb.paste(reference.convert("RGB"), (0, 0), reference.getchannel("A"))
    blue_mask = get_blue_reference_mask(reference)
    pole_clip_mask, pole_grid_mask, pole_clear_mask, _pole_source_clear_mask = build_straight_pole_masks(
        reference.size,
        (COLS, rows),
    )
    blue_mask = ImageChops.lighter(blue_mask, pole_clip_mask)
    clip_alpha = blue_mask.point(lambda value: 0 if value <= 6 else min(255, round(value * 1.08)))
    clip_rgba = Image.new("RGBA", reference.size, (255, 255, 255, 0))
    clip_rgba.putalpha(clip_alpha)
    resized_scene = reference_rgb.resize((COLS, rows), Image.Resampling.LANCZOS)
    resized_mask = blue_mask.resize((COLS, rows), Image.Resampling.BOX)
    resized_mask = resized_mask.point(lambda value: 0 if value <= 5 else min(255, round(value * 1.18)))
    resized_mask = clear_isolated_pole_path(resized_mask, pole_clear_mask, pole_grid_mask)
    resized_mask = ImageChops.lighter(resized_mask, pole_grid_mask)
    luma = ImageOps.grayscale(resized_scene)
    softened = luma.filter(ImageFilter.GaussianBlur(0.35))
    mask_edges = resized_mask.filter(ImageFilter.FIND_EDGES)
    luma_edges = luma.filter(ImageFilter.FIND_EDGES)
    edges = ImageChops.lighter(mask_edges, luma_edges).filter(ImageFilter.GaussianBlur(0.35))
    edges = ImageOps.autocontrast(edges, cutoff=1)
    weight = build_reference_weight(resized_mask, edges)

    luma_pixels = softened.load()
    edge_pixels = edges.load()
    mask_pixels = resized_mask.load()
    weight_pixels = weight.load()
    pole_pixels = pole_grid_mask.load()

    for y in range(rows):
        for x in range(COLS):
            mask_value = mask_pixels[x, y]
            if mask_value <= 3:
                luma_pixels[x, y] = 255
                edge_pixels[x, y] = 0
                continue

            mask_strength = mask_value / 255
            edge_strength = edge_pixels[x, y] / 255
            weight_pixels[x, y] = max(
                weight_pixels[x, y],
                min(255, round(146 + mask_strength * 74 + edge_strength * 50)),
            )
            luma_pixels[x, y] = max(
                12,
                min(
                    148,
                    round(luma_pixels[x, y] * (0.58 - edge_strength * 0.12) + 6),
                ),
            )
            edge_pixels[x, y] = max(
                56,
                min(255, round(edge_pixels[x, y] * 1.36 + mask_strength * 18)),
            )

            if pole_pixels[x, y] > 0:
                luma_pixels[x, y] = min(luma_pixels[x, y], 28)
                edge_pixels[x, y] = max(edge_pixels[x, y], 210)
                weight_pixels[x, y] = 255

    separator_bytes, separator_strengths = build_separator_strengths(softened, edges, resized_mask)
    cell_bytes, cell_count = build_cell_records(
        softened,
        edges,
        resized_mask,
        weight,
        pole_grid_mask,
        separator_strengths,
    )

    metadata = {
        "cols": COLS,
        "rows": rows,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "lumaFile": "/work-footer-scene-luma.bin",
        "edgeFile": "/work-footer-scene-edge.bin",
        "maskFile": "/work-footer-scene-mask.bin",
        "weightFile": "/work-footer-scene-weight.bin",
        "poleFile": "/work-footer-scene-pole.bin",
        "separatorFile": "/work-footer-scene-separator.bin",
        "cellFile": "/work-footer-scene-cells.bin",
        "cellCount": cell_count,
        "cellRecordBytes": CELL_RECORD_BYTES,
        "clipMaskFile": "/work-footer-scene-clip-mask.png",
        "referenceFile": "/work-footer-scene-reference.png",
        "version": "blue-reference-v29-readable-glyph-padding",
        "sourceTreatment": "Readable large-glyph blue reference mask with lighter opacity, wider cell spacing, two-column pole overlays, and continuous chevron floor coverage.",
    }

    write_bytes(OUTPUT_DIR / "work-footer-scene-luma.bin", softened)
    write_bytes(OUTPUT_DIR / "work-footer-scene-edge.bin", edges)
    write_bytes(OUTPUT_DIR / "work-footer-scene-mask.bin", resized_mask)
    write_bytes(OUTPUT_DIR / "work-footer-scene-weight.bin", weight)
    write_bytes(OUTPUT_DIR / "work-footer-scene-pole.bin", pole_grid_mask)
    (OUTPUT_DIR / "work-footer-scene-separator.bin").write_bytes(separator_bytes)
    (OUTPUT_DIR / "work-footer-scene-cells.bin").write_bytes(cell_bytes)
    clip_rgba.save(OUTPUT_DIR / "work-footer-scene-clip-mask.png")
    (OUTPUT_DIR / "work-footer-scene-data.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )

    blue_preview = Image.new("RGB", (COLS, rows), (255, 255, 255))
    blue_fill = Image.new("RGB", (COLS, rows), (25, 67, 245))
    preview = Image.composite(blue_fill, blue_preview, resized_mask)
    preview.save(OUTPUT_DIR / "work-footer-scene-preview.png")
    print(f"Wrote work footer scene data: {COLS}x{rows}")


if __name__ == "__main__":
    build()

from __future__ import annotations

import json
import os
import re
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public"
SOURCE_DIR = Path(
    os.environ.get(
        "INTRO_OWL_SEQUENCE_DIR",
        "/Users/manishkumar/Desktop/ezgif-5b394b89748166fa-jpg",
    )
)

FRAME_START = int(os.environ.get("INTRO_OWL_FRAME_START", "0"))
FRAME_END_VALUE = os.environ.get("INTRO_OWL_FRAME_END")
FRAME_END = int(FRAME_END_VALUE) if FRAME_END_VALUE not in (None, "") else None
INTRO_OWL_DURATION_SECONDS = float(os.environ.get("INTRO_OWL_DURATION_SECONDS", "5"))
COLS = 168
CROP_MARGIN = 34
MIN_MASK_PIXELS = 100
OWL_MASK_VERTICAL_LIMIT = float(os.environ.get("INTRO_OWL_VERTICAL_LIMIT", "0.92"))
OUTPUT_PADDING_X = int(os.environ.get("INTRO_OWL_PADDING_X", "8"))
OUTPUT_PADDING_TOP = int(os.environ.get("INTRO_OWL_PADDING_TOP", "24"))
OUTPUT_PADDING_BOTTOM = int(os.environ.get("INTRO_OWL_PADDING_BOTTOM", "14"))


def get_frame_number(path: Path) -> int | None:
    match = re.search(r"(?:_|-)(\d{3,})\.jpe?g$", path.name, re.IGNORECASE)
    return int(match.group(1)) if match else None


def iter_source_frames() -> list[tuple[int, Path]]:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"Missing source frame directory: {SOURCE_DIR}")

    frames = []
    for path in SOURCE_DIR.glob("*.jpg"):
        frame_number = get_frame_number(path)
        if (
            frame_number is not None
            and frame_number >= FRAME_START
            and (FRAME_END is None or frame_number <= FRAME_END)
        ):
            frames.append((frame_number, path))

    frames.sort(key=lambda item: item[0])

    if not frames:
        end_message = "" if FRAME_END is None else f" through {FRAME_END:03d}"
        raise SystemExit(
            f"No JPG frames found from {FRAME_START:03d}{end_message} in {SOURCE_DIR}"
        )

    return frames


def connected_components(mask: Image.Image) -> list[dict[str, object]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components = []

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index] or pixels[start_x, start_y] == 0:
                continue

            queue = deque([(start_x, start_y)])
            visited[start_index] = 1
            points = []
            min_x = min_y = 10**9
            max_x = max_y = -1
            sum_x = sum_y = 0

            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                sum_x += x
                sum_y += y
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue

                    index = ny * width + nx
                    if visited[index] or pixels[nx, ny] == 0:
                        continue

                    visited[index] = 1
                    queue.append((nx, ny))

            area = len(points)
            components.append(
                {
                    "area": area,
                    "bbox": (min_x, min_y, max_x, max_y),
                    "cx": sum_x / area,
                    "cy": sum_y / area,
                    "points": points,
                }
            )

    return components


def keep_largest_owl_component(mask: Image.Image) -> Image.Image:
    components = connected_components(mask)
    if not components:
        return mask

    components.sort(key=lambda component: int(component["area"]), reverse=True)
    primary = components[0]
    primary_min_x, primary_min_y, primary_max_x, primary_max_y = primary["bbox"]
    output = Image.new("L", mask.size, 0)
    output_pixels = output.load()

    for component in components:
        min_x, min_y, max_x, max_y = component["bbox"]
        overlaps_primary = not (
            max_x < primary_min_x - 3
            or min_x > primary_max_x + 3
            or max_y < primary_min_y - 3
            or min_y > primary_max_y + 3
        )
        area = int(component["area"])
        primary_area = int(primary["area"])

        if component is primary or (area > primary_area * 0.18 and overlaps_primary):
            for x, y in component["points"]:
                output_pixels[x, y] = 255

    return output


def fill_enclosed_holes(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    mask_pixels = mask.load()
    mask_area = sum(
        1
        for y in range(height)
        for x in range(width)
        if mask_pixels[x, y] > 0
    )
    inverse = Image.new("L", mask.size, 0)
    inverse_pixels = inverse.load()

    for y in range(height):
        for x in range(width):
            if mask_pixels[x, y] == 0:
                inverse_pixels[x, y] = 255

    output = mask.copy()
    output_pixels = output.load()
    max_hole_area = max(24, int(mask_area * 0.32))

    for component in connected_components(inverse):
        min_x, min_y, max_x, max_y = component["bbox"]
        touches_border = min_x == 0 or min_y == 0 or max_x == width - 1 or max_y == height - 1

        if touches_border or int(component["area"]) > max_hole_area:
            continue

        for x, y in component["points"]:
            output_pixels[x, y] = 255

    return output


def get_mask_bbox(mask: Image.Image, threshold: int = 0) -> tuple[int, int, int, int] | None:
    width, height = mask.size
    pixels = mask.load()
    min_x = width
    min_y = height
    max_x = -1
    max_y = -1

    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= threshold:
                continue

            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

    if max_x < min_x or max_y < min_y:
        return None

    return min_x, min_y, max_x, max_y


def sample_neighbor_tone(
    original_mask: Image.Image,
    luma: Image.Image,
    edges: Image.Image,
    x: int,
    y: int,
    radius: int = 6,
) -> tuple[int, int]:
    width, height = original_mask.size
    mask_pixels = original_mask.load()
    luma_pixels = luma.load()
    edge_pixels = edges.load()
    luma_total = 0
    edge_total = 0
    count = 0

    for sample_y in range(max(0, y - radius), min(height, y + radius + 1)):
        for sample_x in range(max(0, x - radius), min(width, x + radius + 1)):
            if mask_pixels[sample_x, sample_y] == 0:
                continue

            luma_total += luma_pixels[sample_x, sample_y]
            edge_total += edge_pixels[sample_x, sample_y]
            count += 1

    if count == 0:
        return 146, 32

    return round(luma_total / count), round(edge_total / count)


def paint_added_mask_pixels(
    original_mask: Image.Image,
    filled_mask: Image.Image,
    luma: Image.Image,
    edges: Image.Image,
) -> None:
    width, height = filled_mask.size
    original_pixels = original_mask.load()
    filled_pixels = filled_mask.load()
    luma_pixels = luma.load()
    edge_pixels = edges.load()

    for y in range(height):
        for x in range(width):
            if filled_pixels[x, y] == 0 or original_pixels[x, y] > 0:
                continue

            tone_luma, tone_edge = sample_neighbor_tone(original_mask, luma, edges, x, y)
            luma_pixels[x, y] = max(luma_pixels[x, y], tone_luma)
            edge_pixels[x, y] = max(18, min(96, tone_edge))


def fill_enclosed_holes_with_tone(
    mask: Image.Image,
    luma: Image.Image,
    edges: Image.Image,
) -> Image.Image:
    original = mask.copy()
    filled = fill_enclosed_holes(mask)
    paint_added_mask_pixels(original, filled, luma, edges)

    return filled


def fill_body_span_gaps(mask: Image.Image, luma: Image.Image, edges: Image.Image) -> Image.Image:
    bbox = get_mask_bbox(mask)
    if bbox is None:
        return mask

    min_x, min_y, max_x, max_y = bbox
    body_width = max(1, max_x - min_x + 1)
    body_height = max(1, max_y - min_y + 1)
    original = mask.copy()
    original_pixels = original.load()
    output = mask.copy()
    output_pixels = output.load()
    fill_points: set[tuple[int, int]] = set()

    for y in range(min_y, max_y + 1):
        relative_y = (y - min_y) / body_height

        if relative_y < 0.16 or relative_y > 0.82:
            continue

        runs = []
        x = min_x

        while x <= max_x:
            while x <= max_x and original_pixels[x, y] == 0:
                x += 1

            start_x = x

            while x <= max_x and original_pixels[x, y] > 0:
                x += 1

            end_x = x - 1

            if end_x >= start_x:
                runs.append((start_x, end_x))

        for left_run, right_run in zip(runs, runs[1:], strict=False):
            gap_start = left_run[1] + 1
            gap_end = right_run[0] - 1
            gap_length = gap_end - gap_start + 1

            if gap_length <= 0:
                continue

            max_gap = min(10, body_width * 0.14)

            if gap_length > max_gap:
                continue

            support_count = 0
            for sample_x in (gap_start, (gap_start + gap_end) // 2, gap_end):
                has_above = any(
                    original_pixels[sample_x, sample_y] > 0
                    for sample_y in range(max(min_y, y - 6), y)
                )
                has_below = any(
                    original_pixels[sample_x, sample_y] > 0
                    for sample_y in range(y + 1, min(max_y, y + 6) + 1)
                )
                support_count += int(has_above and has_below)

            if support_count < 2:
                continue

            for fill_x in range(gap_start, gap_end + 1):
                fill_points.add((fill_x, y))

    if not fill_points:
        return mask

    luma_pixels = luma.load()
    edge_pixels = edges.load()

    for x, y in fill_points:
        output_pixels[x, y] = 255
        tone_luma, tone_edge = sample_neighbor_tone(original, luma, edges, x, y)
        luma_pixels[x, y] = max(luma_pixels[x, y], tone_luma)
        edge_pixels[x, y] = max(18, min(96, tone_edge))

    return output


def remove_floor_runs(mask: Image.Image, luma: Image.Image, edges: Image.Image, floor_start: int) -> None:
    width, height = mask.size
    mask_pixels = mask.load()
    luma_pixels = luma.load()
    edge_pixels = edges.load()

    for y in range(max(0, floor_start), height):
        x = 0
        while x < width:
            while x < width and mask_pixels[x, y] == 0:
                x += 1

            start_x = x

            while x < width and mask_pixels[x, y] > 0:
                x += 1

            end_x = x - 1
            run_length = end_x - start_x + 1

            if run_length < 16:
                continue

            average_edge = sum(edge_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            average_luma = sum(luma_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            y_ratio = y / max(1, height - 1)
            broad_low_haze = (
                y_ratio > 0.74
                and run_length > width * 0.22
                and average_luma < 135
                and average_edge < 58
            )
            lower_soft_haze = (
                y_ratio > 0.78
                and run_length >= 14
                and average_luma < 152
                and average_edge < 38
            )

            if broad_low_haze or lower_soft_haze:
                for run_x in range(start_x, end_x + 1):
                    mask_pixels[run_x, y] = 0

                continue

            if average_edge >= 58 and not (average_luma > 118 and average_edge < 72):
                continue

            for run_x in range(start_x, end_x + 1):
                vertical_weight = sum(
                    1
                    for run_y in range(max(0, y - 3), min(height, y + 4))
                    if mask_pixels[run_x, run_y] > 0
                )

                if edge_pixels[run_x, y] < 70 and vertical_weight <= 5:
                    mask_pixels[run_x, y] = 0


def remove_lower_baseline_runs(mask: Image.Image, luma: Image.Image, edges: Image.Image) -> None:
    width, height = mask.size
    mask_pixels = mask.load()
    luma_pixels = luma.load()
    edge_pixels = edges.load()
    floor_start = int(height * 0.76)

    for y in range(floor_start, height):
        y_ratio = y / max(1, height - 1)
        x = 0

        while x < width:
            while x < width and mask_pixels[x, y] == 0:
                x += 1

            start_x = x

            while x < width and mask_pixels[x, y] > 0:
                x += 1

            end_x = x - 1
            run_length = end_x - start_x + 1

            if run_length <= 0:
                continue

            average_edge = sum(edge_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            average_luma = sum(luma_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            broad_low_run = (
                y_ratio > 0.77
                and run_length > width * 0.32
                and average_luma < 138
                and average_edge < 88
            )
            soft_lower_run = (
                y_ratio > 0.82
                and run_length >= 14
                and average_luma < 152
                and average_edge < 48
            )

            if not (broad_low_run or soft_lower_run):
                continue

            for run_x in range(start_x, end_x + 1):
                mask_pixels[run_x, y] = 0


def carve_low_detail_lower_haze(mask: Image.Image, luma: Image.Image, edges: Image.Image) -> Image.Image:
    bbox = get_mask_bbox(mask)
    if bbox is None:
        return mask

    width, height = mask.size
    min_x, min_y, max_x, max_y = bbox
    body_width = max(1, max_x - min_x + 1)
    body_height = max(1, max_y - min_y + 1)
    mask_pixels = mask.load()
    luma_pixels = luma.load()
    edge_pixels = edges.load()
    output = mask.copy()
    output_pixels = output.load()

    for y in range(min_y, max_y + 1):
        relative_y = (y - min_y) / body_height

        if relative_y < 0.68:
            continue

        x = min_x

        while x <= max_x:
            while x <= max_x and mask_pixels[x, y] == 0:
                x += 1

            start_x = x

            while x <= max_x and mask_pixels[x, y] > 0:
                x += 1

            end_x = x - 1
            run_length = end_x - start_x + 1

            if run_length < 8:
                continue

            average_luma = sum(luma_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            average_edge = sum(edge_pixels[run_x, y] for run_x in range(start_x, end_x + 1)) / run_length
            smooth_low_detail = average_luma > 108 and average_edge < 18
            bright_floor_strip = (
                relative_y > 0.86
                and average_luma > 154
                and average_edge < 58
            )
            flat_lower_mass = (
                relative_y > 0.78
                and run_length > body_width * 0.16
                and average_edge < 28
            )

            if not (smooth_low_detail or bright_floor_strip or flat_lower_mass):
                continue

            for run_x in range(start_x, end_x + 1):
                if bright_floor_strip:
                    output_pixels[run_x, y] = 0
                    continue

                vertical_mask_support = sum(
                    1
                    for sample_y in range(max(min_y, y - 3), min(max_y, y + 3) + 1)
                    if mask_pixels[run_x, sample_y] > 0
                )
                thin_horizontal_noise = (
                    relative_y > 0.7
                    and run_length > body_width * 0.12
                    and vertical_mask_support <= 4
                )

                if thin_horizontal_noise:
                    output_pixels[run_x, y] = 0
                    continue

                local_edge = max(
                    edge_pixels[sample_x, sample_y]
                    for sample_y in range(max(0, y - 1), min(height, y + 2))
                    for sample_x in range(max(0, run_x - 1), min(width, run_x + 2))
                )
                feather_edge_above = max(
                    edge_pixels[sample_x, sample_y]
                    for sample_y in range(max(min_y, y - 8), y + 1)
                    for sample_x in range(max(0, run_x - 1), min(width, run_x + 2))
                )
                preserve_feather = (
                    local_edge > 32
                    or (relative_y < 0.78 and feather_edge_above > 58)
                )

                if preserve_feather:
                    continue

                output_pixels[run_x, y] = 0

    return output


def build_frame_data(
    image: Image.Image,
    cols: int,
    rows: int,
) -> tuple[Image.Image, Image.Image, Image.Image]:
    resized = image.convert("RGB").resize((cols, rows), Image.Resampling.LANCZOS)
    luma = ImageOps.grayscale(resized)
    softened = luma.filter(ImageFilter.GaussianBlur(0.45))
    edges = luma.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(0.35))
    edges = ImageOps.autocontrast(edges, cutoff=1)
    softened_pixels = softened.load()
    edge_pixels = edges.load()

    anchor = Image.new("L", (cols, rows), 0)
    anchor_pixels = anchor.load()

    for y in range(rows):
        y_ratio = y / (rows - 1)
        for x in range(cols):
            value = softened_pixels[x, y]
            edge = edge_pixels[x, y]
            if y_ratio < 0.77 and (value > 164 or (value > 136 and edge > 72)):
                anchor_pixels[x, y] = 255

    anchor = anchor.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    anchor_components = []

    for component in connected_components(anchor):
        min_x, min_y, max_x, max_y = component["bbox"]
        width = max_x - min_x + 1
        height = max_y - min_y + 1
        area = int(component["area"])
        center_y = float(component["cy"]) / rows

        if area < 16 or center_y > 0.8 or height <= 2 or width <= 2:
            continue

        if width > height * 9 and center_y > 0.5:
            continue

        score = area * (1.32 - center_y) + height * 4 + width * 0.7
        anchor_components.append((score, component))

    anchor_components.sort(reverse=True, key=lambda item: item[0])

    if not anchor_components:
        return luma, edges, Image.new("L", (cols, rows), 0)

    primary = anchor_components[0][1]
    kept_components = [primary]

    for _, component in anchor_components[1:14]:
        if int(component["area"]) >= int(primary["area"]) * 0.14:
            kept_components.append(component)

    anchor_kept = Image.new("L", (cols, rows), 0)
    anchor_kept_pixels = anchor_kept.load()
    anchor_x_values = []
    anchor_y_values = []

    for component in kept_components:
        for x, y in component["points"]:
            anchor_kept_pixels[x, y] = 255
            anchor_x_values.append(x)
            anchor_y_values.append(y)

    if not anchor_x_values:
        return luma, edges, Image.new("L", (cols, rows), 0)

    min_x = max(0, min(anchor_x_values) - 20)
    max_x = min(cols - 1, max(anchor_x_values) + 22)
    min_y = max(0, min(anchor_y_values) - 12)
    max_y = min(rows - 1, max(anchor_y_values) + 24, int(rows * OWL_MASK_VERTICAL_LIMIT))

    support = anchor_kept.filter(ImageFilter.MaxFilter(21))
    support_pixels = support.load()
    candidate = Image.new("L", (cols, rows), 0)
    candidate_pixels = candidate.load()

    for y in range(min_y, max_y + 1):
        y_ratio = y / (rows - 1)
        for x in range(min_x, max_x + 1):
            if support_pixels[x, y] == 0:
                continue

            value = softened_pixels[x, y]
            edge = edge_pixels[x, y]
            if (
                anchor_kept_pixels[x, y]
                or value > 108
                or (value > 82 and edge > 50)
                or (edge > 54 and value > 38)
                or (value > 60 and edge > 34)
                or (edge > 46 and value > 30 and y_ratio < OWL_MASK_VERTICAL_LIMIT - 0.03)
            ):
                if not (y_ratio > 0.67 and value < 68 and edge < 70):
                    candidate_pixels[x, y] = 255

    mask = Image.new("L", (cols, rows), 0)
    mask_pixels = mask.load()

    for component in connected_components(candidate):
        if int(component["area"]) < 28:
            continue

        touches_anchor = any(anchor_kept_pixels[x, y] for x, y in component["points"])
        if not touches_anchor:
            continue

        for x, y in component["points"]:
            mask_pixels[x, y] = 255

    mask = keep_largest_owl_component(mask)
    remove_floor_runs(mask, softened, edges, max(int(rows * 0.58), max(anchor_y_values) - 5))
    mask = fill_enclosed_holes_with_tone(mask, luma, edges)
    mask = (
        mask.filter(ImageFilter.MaxFilter(5))
        .filter(ImageFilter.MinFilter(3))
        .filter(ImageFilter.GaussianBlur(0.85))
    )
    mask_pixels = mask.load()

    for y in range(rows):
        y_ratio = y / (rows - 1)
        for x in range(cols):
            if mask_pixels[x, y] < 14 or y_ratio > OWL_MASK_VERTICAL_LIMIT:
                mask_pixels[x, y] = 0

    mask = fill_enclosed_holes_with_tone(mask, luma, edges)
    mask = fill_body_span_gaps(mask, luma, edges)
    mask = fill_enclosed_holes_with_tone(mask, luma, edges)
    remove_lower_baseline_runs(mask, softened, edges)
    mask = keep_largest_owl_component(mask)
    mask = carve_low_detail_lower_haze(mask, softened, edges)
    mask = keep_largest_owl_component(mask)

    return luma, edges, mask


def crop_box_from_masks(masks: list[Image.Image]) -> tuple[int, int, int, int]:
    width, height = masks[0].size
    min_x = width
    min_y = height
    max_x = 0
    max_y = 0

    for mask in masks:
        pixels = mask.load()
        for y in range(height):
            for x in range(width):
                if pixels[x, y] > 18:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)

    if min_x > max_x or min_y > max_y:
        raise SystemExit("Unable to find the owl in the sequence.")

    return (
        max(0, min_x - CROP_MARGIN),
        max(0, min_y - CROP_MARGIN),
        min(width, max_x + CROP_MARGIN + 1),
        min(height, max_y + CROP_MARGIN + 1),
    )


def crop_with_output_padding(
    image: Image.Image,
    crop_box: tuple[int, int, int, int],
    fill: int,
) -> Image.Image:
    cropped = image.crop(crop_box)
    width, height = cropped.size
    output = Image.new(
        "L",
        (
            width + OUTPUT_PADDING_X * 2,
            height + OUTPUT_PADDING_TOP + OUTPUT_PADDING_BOTTOM,
        ),
        fill,
    )
    output.paste(cropped, (OUTPUT_PADDING_X, OUTPUT_PADDING_TOP))

    return output


def calculate_transition_score(
    luma_a: bytes,
    edge_a: bytes,
    mask_a: bytes,
    luma_b: bytes,
    edge_b: bytes,
    mask_b: bytes,
) -> float:
    union = 0
    mask_delta = 0.0
    luma_delta = 0.0
    edge_delta = 0.0

    for index, (mask_value_a, mask_value_b) in enumerate(zip(mask_a, mask_b, strict=True)):
        if mask_value_a <= 18 and mask_value_b <= 18:
            continue

        union += 1
        mask_delta += abs(mask_value_a - mask_value_b) / 255
        luma_delta += abs(luma_a[index] - luma_b[index]) / 255
        edge_delta += abs(edge_a[index] - edge_b[index]) / 255

    if union == 0:
        return 0

    return (mask_delta * 0.64 + luma_delta * 0.22 + edge_delta * 0.14) / union


def build_frame_progress_stops(
    luma_frame_bytes: list[bytes],
    edge_frame_bytes: list[bytes],
    mask_frame_bytes: list[bytes],
) -> list[float]:
    frame_count = len(mask_frame_bytes)

    if frame_count <= 1:
        return [0, 1]

    scores = [
        calculate_transition_score(
            luma_frame_bytes[index],
            edge_frame_bytes[index],
            mask_frame_bytes[index],
            luma_frame_bytes[index + 1],
            edge_frame_bytes[index + 1],
            mask_frame_bytes[index + 1],
        )
        for index in range(frame_count - 1)
    ]
    ordered_scores = sorted(scores)
    median_score = ordered_scores[len(ordered_scores) // 2] or 1
    raw_weights = [
        max(0.72, min(1.7, (score / median_score) ** 0.72))
        for score in scores
    ]
    raw_weights.append(raw_weights[-1])
    weights = []

    for index, weight in enumerate(raw_weights):
        previous_weight = raw_weights[max(0, index - 1)]
        next_weight = raw_weights[min(frame_count - 1, index + 1)]
        weights.append(previous_weight * 0.16 + weight * 0.68 + next_weight * 0.16)

    weight_total = sum(weights) or 1
    progress = 0.0
    stops = [0.0]

    for weight in weights:
        progress += weight / weight_total
        stops.append(round(progress, 6))

    stops[-1] = 1.0

    return stops


def get_body_anchor(
    luma_frame: bytes,
    mask_frame: bytes,
    cols: int,
    rows: int,
) -> tuple[float, float, float]:
    search_left = max(0, int(cols * 0.24))
    search_right = min(cols, int(cols * 0.56))
    weighted_points = []

    for row in range(rows):
        for column in range(search_left, search_right):
            index = row * cols + column
            luma_value = luma_frame[index]

            if mask_frame[index] <= 18 or luma_value <= 154:
                continue

            weighted_points.append((column, row, luma_value - 153))

    if weighted_points:
        total_weight = sum(weight for _, _, weight in weighted_points)
        head_x = sum(column * weight for column, _, weight in weighted_points) / total_weight
        head_y = sum(row * weight for _, row, weight in weighted_points) / total_weight
    else:
        filled = [
            (index % cols, index // cols)
            for index, value in enumerate(mask_frame)
            if value > 18
        ]

        if not filled:
            return cols * 0.42, rows * 0.5, cols * 0.72

        x_values = [column for column, _ in filled]
        y_values = [row for _, row in filled]
        head_x = min(x_values) + (max(x_values) - min(x_values)) * 0.28
        head_y = median(y_values)

    body_band_top = max(0, round(head_y - 11))
    body_band_bottom = min(rows, round(head_y + 13))
    body_columns = [
        column
        for row in range(body_band_top, body_band_bottom)
        for column in range(max(0, round(head_x - 6)), cols)
        if mask_frame[row * cols + column] > 18
    ]
    tail_x = max(body_columns) if body_columns else head_x + cols * 0.28

    return head_x, head_y, tail_x


def smooth_body_anchors(
    anchors: list[tuple[float, float, float]],
    radius: int = 2,
) -> list[tuple[float, float, float]]:
    frame_count = len(anchors)

    if frame_count <= 2:
        return anchors

    smoothed = []

    for frame_index in range(frame_count):
        window = [
            anchors[(frame_index + offset) % frame_count]
            for offset in range(-radius, radius + 1)
        ]
        smoothed.append(
            (
                float(median(anchor[0] for anchor in window)),
                float(median(anchor[1] for anchor in window)),
                float(median(anchor[2] for anchor in window)),
            )
        )

    return smoothed


def build_body_stabilization(
    luma_frame_bytes: list[bytes],
    edge_frame_bytes: list[bytes],
    mask_frame_bytes: list[bytes],
    cols: int,
    rows: int,
) -> tuple[list[bytes], list[bytes], list[list[float]], dict[str, float]]:
    anchors = smooth_body_anchors(
        [
            get_body_anchor(luma_frame, mask_frame, cols, rows)
            for luma_frame, mask_frame in zip(
                luma_frame_bytes,
                mask_frame_bytes,
                strict=True,
            )
        ]
    )
    body_lengths = [
        max(1, tail_x - head_x)
        for head_x, _, tail_x in anchors
    ]
    body_length = max(44.0, min(58.0, float(median(body_lengths))))
    head_radius_x = 10.5
    head_radius_y = 9.5
    torso_start_offset = -1.5
    torso_top_height = 9.2
    torso_tail_height = 4.6
    lock_padding = 2.4
    core_frames = []
    lock_frames = []

    for frame_index, (head_x, head_y, _) in enumerate(anchors):
        core = bytearray(cols * rows)
        lock = bytearray(cols * rows)
        edge_frame = edge_frame_bytes[frame_index]
        mask_frame = mask_frame_bytes[frame_index]
        torso_start = head_x + torso_start_offset
        torso_end = head_x + body_length
        shadow_depth = lock_padding * 2.6

        for row in range(rows):
            for column in range(cols):
                head_distance = (
                    ((column - (head_x - 1.4)) / head_radius_x) ** 2 +
                    ((row - head_y) / head_radius_y) ** 2
                )
                inside_torso = torso_start <= column <= torso_end
                torso_progress = max(
                    0.0,
                    min(1.0, (column - torso_start) / max(1.0, body_length)),
                )
                shoulder = max(0.0, 1 - abs(torso_progress - 0.18) / 0.24) * 1.35
                torso_center_y = head_y + 2.4 + torso_progress * 1.8
                tail_taper = max(0.12, (1 - torso_progress) ** 0.45)
                torso_half_height = (
                    torso_top_height * (1 - torso_progress) +
                    torso_tail_height * torso_progress +
                    shoulder
                ) * tail_taper
                lower_body_edge = torso_center_y + torso_half_height
                inside_core = (
                    head_distance <= 1
                    or (
                        inside_torso
                        and abs(row - torso_center_y) <= torso_half_height
                    )
                )
                index = row * cols + column

                if inside_core:
                    core[index] = 255

                shadow_distance = row - lower_body_edge
                inside_shadow_zone = (
                    not inside_core
                    and inside_torso
                    and torso_progress < 0.94
                    and 0 < shadow_distance <= shadow_depth
                    and mask_frame[index] > 18
                )

                if not inside_shadow_zone:
                    continue

                distance_strength = min(1.0, shadow_distance / shadow_depth)
                edge_strength = max(0.0, min(1.0, (132 - edge_frame[index]) / 104))
                tail_falloff = max(0.18, 1 - torso_progress ** 2.4)
                suppression = (
                    distance_strength ** 0.72 *
                    (0.38 + edge_strength * 0.54) *
                    tail_falloff
                )
                lock[index] = round(max(0.0, min(0.88, suppression)) * 255)

        core_frames.append(bytes(core))
        lock_frames.append(bytes(lock))

    model = {
        "bodyLength": round(body_length, 3),
        "headRadiusX": head_radius_x,
        "headRadiusY": head_radius_y,
        "lockPadding": lock_padding,
    }
    serialized_anchors = [
        [round(head_x, 3), round(head_y, 3)]
        for head_x, head_y, _ in anchors
    ]

    return core_frames, lock_frames, serialized_anchors, model


def remove_downstroke_fog_shelves(
    luma_frame: bytes,
    edge_frame: bytes,
    mask_frame: bytes,
    core_frame: bytes,
    anchor: list[float],
    cols: int,
    rows: int,
) -> tuple[bytes, int]:
    output = bytearray(mask_frame)
    head_y = anchor[1]
    cleanup_start = max(0, min(rows - 1, round(head_y + 13)))
    removed = 0

    # Fog joins the downturned feathers as a broad horizontal shelf. Peeling
    # only low-detail contour pixels keeps the supported feather columns intact.
    for _ in range(7):
        source = bytes(output)
        pending = set()

        for row in range(rows - 1, cleanup_start - 1, -1):
            column = 0

            while column < cols:
                while (
                    column < cols
                    and (
                        source[row * cols + column] <= 18
                        or core_frame[row * cols + column] > 18
                    )
                ):
                    column += 1

                run_start = column

                while (
                    column < cols
                    and source[row * cols + column] > 18
                    and core_frame[row * cols + column] <= 18
                ):
                    column += 1

                run_end = column - 1
                run_length = run_end - run_start + 1

                if run_length < 7:
                    continue

                run_texture = 0.0
                run_support = 0.0

                for run_column in range(run_start, run_end + 1):
                    texture_left = max(0, run_column - 2)
                    texture_right = min(cols - 1, run_column + 2)
                    row_values = [
                        luma_frame[row * cols + sample_column]
                        for sample_column in range(texture_left, texture_right + 1)
                    ]
                    run_texture += max(row_values) - min(row_values)
                    run_support += sum(
                        source[sample_row * cols + run_column] > 18
                        for sample_row in range(
                            max(cleanup_start, row - 4),
                            min(rows, row + 5),
                        )
                    )

                average_texture = run_texture / run_length
                average_support = run_support / run_length
                broad_shelf = (
                    run_length >= max(18, round(cols * 0.13))
                    and average_texture < 28
                    and average_support < 6.4
                )

                for run_column in range(run_start, run_end + 1):
                    index = row * cols + run_column
                    vertical_support = sum(
                        source[sample_row * cols + run_column] > 18
                        for sample_row in range(
                            max(cleanup_start, row - 4),
                            min(rows, row + 5),
                        )
                    )
                    support_below = sum(
                        source[sample_row * cols + run_column] > 18
                        for sample_row in range(row + 1, min(rows, row + 4))
                    )
                    texture_left = max(0, run_column - 2)
                    texture_right = min(cols - 1, run_column + 2)
                    horizontal_texture = max(
                        luma_frame[row * cols + sample_column]
                        for sample_column in range(texture_left, texture_right + 1)
                    ) - min(
                        luma_frame[row * cols + sample_column]
                        for sample_column in range(texture_left, texture_right + 1)
                    )
                    nearby_horizontal_texture = max(
                        (
                            max(
                                luma_frame[sample_row * cols + sample_column]
                                for sample_column in range(texture_left, texture_right + 1)
                            )
                            - min(
                                luma_frame[sample_row * cols + sample_column]
                                for sample_column in range(texture_left, texture_right + 1)
                            )
                        )
                        for sample_row in range(max(0, row - 1), min(rows, row + 2))
                    )
                    local_edge = max(
                        edge_frame[sample_row * cols + sample_column]
                        for sample_row in range(max(0, row - 1), min(rows, row + 2))
                        for sample_column in range(
                            max(0, run_column - 1),
                            min(cols, run_column + 2),
                        )
                    )
                    feather_detail = (
                        horizontal_texture >= 26
                        or nearby_horizontal_texture >= 34
                        or (
                            local_edge >= 96
                            and nearby_horizontal_texture >= 18
                        )
                    )
                    shallow_contour = support_below <= 1 and vertical_support <= 5
                    broad_low_detail_contour = (
                        broad_shelf
                        and support_below <= 2
                        and vertical_support <= 7
                        and nearby_horizontal_texture < 30
                    )

                    if (
                        not feather_detail
                        and (shallow_contour or broad_low_detail_contour)
                    ):
                        pending.add(index)

        if not pending:
            break

        for index in pending:
            output[index] = 0

        removed += len(pending)

    return bytes(output), removed


def make_body_stabilization_preview(
    mask_frame_bytes: list[bytes],
    core_frame_bytes: list[bytes],
    lock_frame_bytes: list[bytes],
    cols: int,
    rows: int,
) -> Image.Image:
    preview_indices = [
        0,
        max(0, len(mask_frame_bytes) // 7),
        max(0, len(mask_frame_bytes) * 2 // 7),
        max(0, len(mask_frame_bytes) * 3 // 7),
        max(0, len(mask_frame_bytes) * 4 // 7),
        max(0, len(mask_frame_bytes) * 5 // 7),
        max(0, len(mask_frame_bytes) * 6 // 7),
        len(mask_frame_bytes) - 1,
    ]
    sheet = Image.new("RGB", (cols * 4, rows * 2), (255, 255, 255))

    for position, frame_index in enumerate(preview_indices):
        raw_mask = mask_frame_bytes[frame_index]
        core_mask = core_frame_bytes[frame_index]
        lock_mask = lock_frame_bytes[frame_index]
        preview = Image.new("RGB", (cols, rows), (255, 255, 255))
        preview_pixels = preview.load()

        for index in range(cols * rows):
            column = index % cols
            row = index // cols

            if core_mask[index] > 18:
                preview_pixels[column, row] = (25, 67, 245)
            elif lock_mask[index] > 18:
                preview_pixels[column, row] = (225, 232, 255)
            elif raw_mask[index] > 18:
                preview_pixels[column, row] = (116, 142, 218)

        sheet.paste(preview, ((position % 4) * cols, (position // 4) * rows))

    return sheet


def make_preview(
    frame_numbers: list[int],
    luma_frames: list[Image.Image],
    edge_frames: list[Image.Image],
    mask_frames: list[Image.Image],
    crop_box: tuple[int, int, int, int],
) -> Image.Image:
    preview_indices = [
        0,
        max(0, len(frame_numbers) // 7),
        max(0, len(frame_numbers) * 2 // 7),
        max(0, len(frame_numbers) * 3 // 7),
        max(0, len(frame_numbers) * 4 // 7),
        max(0, len(frame_numbers) * 5 // 7),
        max(0, len(frame_numbers) * 6 // 7),
        len(frame_numbers) - 1,
    ]
    cell_width = 260
    cell_height = 190
    sheet = Image.new("RGB", (cell_width * 4, cell_height * 2), (255, 255, 255))

    for position, frame_index in enumerate(preview_indices):
        luma = crop_with_output_padding(luma_frames[frame_index], crop_box, 255)
        edges = crop_with_output_padding(edge_frames[frame_index], crop_box, 0)
        mask = crop_with_output_padding(mask_frames[frame_index], crop_box, 0)
        width, height = mask.size
        preview = Image.new("RGBA", (width, height), (255, 255, 255, 255))
        preview_pixels = preview.load()
        luma_pixels = luma.load()
        edge_pixels = edges.load()
        mask_pixels = mask.load()

        for y in range(height):
            for x in range(width):
                alpha = mask_pixels[x, y]
                if alpha <= 10:
                    continue

                darkness = 1 - luma_pixels[x, y] / 255
                edge = edge_pixels[x, y] / 255
                depth = min(1, darkness * 0.7 + edge * 0.55)
                preview_pixels[x, y] = (
                    int(94 - 80 * depth),
                    int(145 - 120 * depth),
                    int(255 - 100 * depth),
                    min(240, int(alpha * (0.55 + depth * 0.65))),
                )

        rendered = preview.resize((cell_width, cell_height), Image.Resampling.NEAREST).convert("RGB")
        draw = ImageDraw.Draw(rendered)
        draw.text((6, 6), f"{frame_numbers[frame_index]:03d}", fill=(0, 0, 0))
        sheet.paste(rendered, ((position % 4) * cell_width, (position // 4) * cell_height))

    return sheet


def build() -> None:
    source_frames = iter_source_frames()
    first_image = Image.open(source_frames[0][1])
    source_width, source_height = first_image.size
    rows = round(COLS * source_height / source_width)
    duplicate_frames_removed = 0
    frame_numbers = []
    luma_frames = []
    edge_frames = []
    mask_frames = []

    for frame_number, path in source_frames:
        image = Image.open(path)
        if image.size != (source_width, source_height):
            raise SystemExit(f"Frame size mismatch in {path}")

        luma, edges, mask = build_frame_data(image, COLS, rows)
        mask_pixels = mask.load()
        mask_pixels_count = sum(
            1
            for y in range(rows)
            for x in range(COLS)
            if mask_pixels[x, y] > 18
        )

        if mask_pixels_count < MIN_MASK_PIXELS:
            raise SystemExit(f"Mask for {path.name} is too small ({mask_pixels_count} pixels).")

        if (
            luma_frames
            and luma.tobytes() == luma_frames[-1].tobytes()
            and edges.tobytes() == edge_frames[-1].tobytes()
            and mask.tobytes() == mask_frames[-1].tobytes()
        ):
            duplicate_frames_removed += 1
            continue

        frame_numbers.append(frame_number)
        luma_frames.append(luma)
        edge_frames.append(edges)
        mask_frames.append(mask)

    crop_box = crop_box_from_masks(mask_frames)
    cropped_width = crop_box[2] - crop_box[0] + OUTPUT_PADDING_X * 2
    cropped_height = crop_box[3] - crop_box[1] + OUTPUT_PADDING_TOP + OUTPUT_PADDING_BOTTOM
    luma_bytes = bytearray()
    edge_bytes = bytearray()
    mask_bytes = bytearray()
    luma_frame_bytes = []
    edge_frame_bytes = []
    mask_frame_bytes = []

    for luma, edges, mask in zip(luma_frames, edge_frames, mask_frames, strict=True):
        cropped_luma = crop_with_output_padding(luma, crop_box, 255).tobytes()
        cropped_edges = crop_with_output_padding(edges, crop_box, 0).tobytes()
        cropped_mask = crop_with_output_padding(mask, crop_box, 0).tobytes()
        luma_frame_bytes.append(cropped_luma)
        edge_frame_bytes.append(cropped_edges)
        mask_frame_bytes.append(cropped_mask)
        luma_bytes.extend(cropped_luma)
        edge_bytes.extend(cropped_edges)
        mask_bytes.extend(cropped_mask)

    original_mask_frame_bytes = mask_frame_bytes
    (
        body_core_frame_bytes,
        body_lock_frame_bytes,
        body_anchors,
        body_core_model,
    ) = build_body_stabilization(
        luma_frame_bytes,
        edge_frame_bytes,
        mask_frame_bytes,
        cropped_width,
        cropped_height,
    )

    for _ in range(4):
        cleaned_mask_frame_bytes = []
        iteration_removed = 0

        for luma_frame, edge_frame, mask_frame, core_frame, anchor in zip(
            luma_frame_bytes,
            edge_frame_bytes,
            mask_frame_bytes,
            body_core_frame_bytes,
            body_anchors,
            strict=True,
        ):
            cleaned_mask, _ = remove_downstroke_fog_shelves(
                luma_frame,
                edge_frame,
                mask_frame,
                core_frame,
                anchor,
                cropped_width,
                cropped_height,
            )
            cleaned_mask = keep_largest_owl_component(
                Image.frombytes(
                    "L",
                    (cropped_width, cropped_height),
                    cleaned_mask,
                )
            ).tobytes()
            iteration_removed += sum(
                original_value > 18 and cleaned_value <= 18
                for original_value, cleaned_value in zip(
                    mask_frame,
                    cleaned_mask,
                    strict=True,
                )
            )
            cleaned_mask_frame_bytes.append(cleaned_mask)

        mask_frame_bytes = cleaned_mask_frame_bytes

        if iteration_removed == 0:
            break

        (
            body_core_frame_bytes,
            body_lock_frame_bytes,
            body_anchors,
            body_core_model,
        ) = build_body_stabilization(
            luma_frame_bytes,
            edge_frame_bytes,
            mask_frame_bytes,
            cropped_width,
            cropped_height,
        )

    fog_pixels_removed = sum(
        original_value > 18 and cleaned_value <= 18
        for original_frame, cleaned_frame in zip(
            original_mask_frame_bytes,
            mask_frame_bytes,
            strict=True,
        )
        for original_value, cleaned_value in zip(
            original_frame,
            cleaned_frame,
            strict=True,
        )
    )
    mask_bytes = bytearray().join(mask_frame_bytes)
    frame_progress_stops = build_frame_progress_stops(
        luma_frame_bytes,
        edge_frame_bytes,
        mask_frame_bytes,
    )
    body_core_bytes = b"".join(body_core_frame_bytes)
    body_lock_bytes = b"".join(body_lock_frame_bytes)

    metadata = {
        "cols": cropped_width,
        "rows": cropped_height,
        "frameCount": len(frame_numbers),
        "startFrame": frame_numbers[0],
        "endFrame": frame_numbers[-1],
        "sourceFrameCount": len(source_frames),
        "duplicateFramesRemoved": duplicate_frames_removed,
        "durationSeconds": INTRO_OWL_DURATION_SECONDS,
        "frameProgressStops": frame_progress_stops,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "sampleCols": COLS,
        "sampleRows": rows,
        "cropBox": crop_box,
        "lumaFile": "/intro-owl-sequence-luma.bin",
        "edgeFile": "/intro-owl-sequence-edge.bin",
        "maskFile": "/intro-owl-sequence-mask.bin",
        "bodyCoreFile": "/intro-owl-body-core.bin",
        "bodyLockFile": "/intro-owl-body-lock.bin",
        "bodyAnchors": body_anchors,
        "bodyCoreModel": body_core_model,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "intro-owl-data.json").write_text(json.dumps(metadata), encoding="utf-8")
    (OUTPUT_DIR / "intro-owl-sequence-luma.bin").write_bytes(luma_bytes)
    (OUTPUT_DIR / "intro-owl-sequence-edge.bin").write_bytes(edge_bytes)
    (OUTPUT_DIR / "intro-owl-sequence-mask.bin").write_bytes(mask_bytes)
    (OUTPUT_DIR / "intro-owl-body-core.bin").write_bytes(body_core_bytes)
    (OUTPUT_DIR / "intro-owl-body-lock.bin").write_bytes(body_lock_bytes)
    make_preview(frame_numbers, luma_frames, edge_frames, mask_frames, crop_box).save(
        OUTPUT_DIR / "intro-owl-preview.png"
    )
    make_body_stabilization_preview(
        mask_frame_bytes,
        body_core_frame_bytes,
        body_lock_frame_bytes,
        cropped_width,
        cropped_height,
    ).resize(
        (cropped_width * 8, cropped_height * 4),
        Image.Resampling.NEAREST,
    ).save(OUTPUT_DIR / "intro-owl-body-preview.png")

    print(
        f"Wrote {len(frame_numbers)} intro owl frames from {frame_numbers[0]:03d} "
        f"to {frame_numbers[-1]:03d} at {cropped_width}x{cropped_height} "
        f"({duplicate_frames_removed} duplicate holds removed, "
        f"{fog_pixels_removed} fog pixels removed)"
    )


if __name__ == "__main__":
    build()

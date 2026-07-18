from __future__ import annotations

import json
import os
import re
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public"
VISION_MASK_DIR = OUTPUT_DIR / "intro-owl-vision-masks"
SOURCE_DIR = Path(
    os.environ.get(
        "INTRO_OWL_SEQUENCE_DIR",
        "/Users/manishkumar/Desktop/updated_owl",
    )
)
FRAME_START = int(os.environ.get("INTRO_OWL_FRAME_START", "0"))
FRAME_END = int(os.environ.get("INTRO_OWL_FRAME_END", "72"))
DURATION_SECONDS = float(os.environ.get("INTRO_OWL_DURATION_SECONDS", "5"))

SAMPLE_COLS = 256
OUTPUT_PADDING_X = 8
OUTPUT_PADDING_TOP = 12
OUTPUT_PADDING_BOTTOM = 10
MASK_THRESHOLD = 18


def frame_number(path: Path) -> int | None:
    match = re.search(r"(?:_|-)(\d{3,})\.jpe?g$", path.name, re.IGNORECASE)
    return int(match.group(1)) if match else None


def source_frames() -> list[tuple[int, Path]]:
    frames = []

    for path in SOURCE_DIR.glob("*.jpg"):
        number = frame_number(path)
        if number is not None and FRAME_START <= number <= FRAME_END:
            frames.append((number, path))

    frames.sort(key=lambda item: item[0])

    if not frames:
        raise SystemExit(f"No owl frames found in {SOURCE_DIR}")

    return frames


def components(mask: np.ndarray) -> list[dict[str, object]]:
    height, width = mask.shape
    visited = np.zeros((height, width), dtype=np.uint8)
    output = []

    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or visited[start_y, start_x]:
                continue

            queue = deque([(start_x, start_y)])
            visited[start_y, start_x] = 1
            points = []
            min_x = max_x = start_x
            min_y = max_y = start_y

            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

                for next_x, next_y in (
                    (x - 1, y),
                    (x + 1, y),
                    (x, y - 1),
                    (x, y + 1),
                ):
                    if (
                        next_x < 0
                        or next_x >= width
                        or next_y < 0
                        or next_y >= height
                        or visited[next_y, next_x]
                        or not mask[next_y, next_x]
                    ):
                        continue

                    visited[next_y, next_x] = 1
                    queue.append((next_x, next_y))

            output.append(
                {
                    "points": points,
                    "area": len(points),
                    "bbox": (min_x, min_y, max_x, max_y),
                    "cx": sum(point[0] for point in points) / len(points),
                    "cy": sum(point[1] for point in points) / len(points),
                }
            )

    return output


def image_from_bool(mask: np.ndarray) -> Image.Image:
    return Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), mode="L")


def bool_from_image(image: Image.Image, threshold: int = MASK_THRESHOLD) -> np.ndarray:
    return np.asarray(image, dtype=np.uint8) > threshold


def fill_small_holes(mask: np.ndarray, maximum_area: int) -> np.ndarray:
    height, width = mask.shape
    output = mask.copy()

    for component in components(~mask):
        min_x, min_y, max_x, max_y = component["bbox"]
        touches_outer_edge = (
            min_x == 0
            or min_y == 0
            or max_x == width - 1
            or max_y == height - 1
        )

        if touches_outer_edge or component["area"] > maximum_area:
            continue

        for x, y in component["points"]:
            output[y, x] = True

    return output


def prune_thin_lower_runs(
    mask: np.ndarray,
    edge: np.ndarray,
    local_contrast: np.ndarray,
    start_y: int,
) -> np.ndarray:
    height, width = mask.shape
    output = mask.copy()

    for _ in range(3):
        source = output.copy()

        for y in range(max(0, start_y), height):
            x = 0

            while x < width:
                while x < width and not source[y, x]:
                    x += 1

                run_start = x

                while x < width and source[y, x]:
                    x += 1

                run_end = x - 1
                run_length = run_end - run_start + 1

                if run_length < 9:
                    continue

                for run_x in range(run_start, run_end + 1):
                    vertical_support = int(
                        source[
                            max(0, y - 4):min(height, y + 5),
                            run_x,
                        ].sum()
                    )
                    horizontal_texture = abs(float(local_contrast[y, run_x]))
                    feather_detail = edge[y, run_x] >= 54 or horizontal_texture >= 9
                    shallow_shelf = vertical_support <= 3
                    broad_soft_shelf = (
                        run_length >= 18
                        and vertical_support <= 5
                        and edge[y, run_x] < 38
                        and horizontal_texture < 7
                    )
                    unsupported_horizon = (
                        run_length >= 18
                        and vertical_support <= 2
                    )

                    if unsupported_horizon or (
                        not feather_detail
                        and (shallow_shelf or broad_soft_shelf)
                    ):
                        output[y, run_x] = False

    return output


def keep_head_connected_components(
    mask: np.ndarray,
    head_x: float,
    head_y: float,
) -> np.ndarray:
    found = components(mask)
    if not found:
        return mask

    found.sort(key=lambda component: component["area"], reverse=True)
    primary = min(
        found,
        key=lambda component: (
            0
            if any(
                (x - head_x) ** 2 + (y - head_y) ** 2 <= 12**2
                for x, y in component["points"]
            )
            else 1,
            -component["area"],
        ),
    )
    primary_bbox = primary["bbox"]
    output = np.zeros_like(mask)

    for component in found:
        min_x, min_y, max_x, max_y = component["bbox"]
        near_primary = not (
            max_x < primary_bbox[0] - 7
            or min_x > primary_bbox[2] + 7
            or max_y < primary_bbox[1] - 7
            or min_y > primary_bbox[3] + 7
        )

        if component is not primary and (component["area"] < 34 or not near_primary):
            continue

        for x, y in component["points"]:
            output[y, x] = True

    return output


def shift_image(image: Image.Image, offset_x: float, offset_y: float) -> Image.Image:
    return image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1, 0, -offset_x, 0, 1, -offset_y),
        resample=Image.Resampling.BILINEAR,
        fillcolor=0,
    )


def estimate_head_and_body(
    mask: np.ndarray,
    luma: np.ndarray,
) -> tuple[float, float, float]:
    ys, xs = np.nonzero(mask)

    if len(xs) == 0:
        height, width = mask.shape
        return width * 0.42, height * 0.5, width * 0.7

    min_x = int(xs.min())
    max_x = int(xs.max())
    min_y = int(ys.min())
    max_y = int(ys.max())
    owl_width = max(1, max_x - min_x)
    owl_height = max(1, max_y - min_y)
    left_limit = min_x + owl_width * 0.42
    lower_limit = min_y + owl_height * 0.31
    head_candidates = (
        mask
        & (np.indices(mask.shape)[1] <= left_limit)
        & (np.indices(mask.shape)[0] >= lower_limit)
        & (luma >= 132)
    )
    head_y_values, head_x_values = np.nonzero(head_candidates)

    if len(head_x_values) >= 12:
        weights = np.maximum(1, luma[head_y_values, head_x_values] - 116)
        head_x = float(np.average(head_x_values, weights=weights))
        head_y = float(np.average(head_y_values, weights=weights))
    else:
        head_x = min_x + owl_width * 0.22
        head_y = min_y + owl_height * 0.58

    body_band_top = max(0, round(head_y - 10))
    body_band_bottom = min(mask.shape[0], round(head_y + 13))
    body_columns = np.nonzero(mask[body_band_top:body_band_bottom])[1]
    tail_x = (
        float(np.percentile(body_columns, 94))
        if len(body_columns)
        else min(max_x, head_x + owl_width * 0.68)
    )
    tail_x = min(tail_x, head_x + 76)

    return head_x, head_y, tail_x


def add_body_core(
    mask: np.ndarray,
    head_x: float,
    head_y: float,
    tail_x: float,
) -> np.ndarray:
    height, width = mask.shape
    core = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(core)
    head_radius_x = 8.2
    head_radius_y = 7.6
    body_end_x = min(tail_x, head_x + 73)
    body_start_x = head_x - 1
    body_center_start = head_y + 2.2
    body_center_end = head_y + 4.6

    draw.ellipse(
        (
            head_x - head_radius_x,
            head_y - head_radius_y,
            head_x + head_radius_x,
            head_y + head_radius_y,
        ),
        fill=255,
    )

    if body_end_x > body_start_x + 3:
        points_top = []
        points_bottom = []
        steps = max(6, round(body_end_x - body_start_x))

        for step in range(steps + 1):
            progress = step / steps
            x = body_start_x + (body_end_x - body_start_x) * progress
            center_y = body_center_start + (body_center_end - body_center_start) * progress
            shoulder = max(0, 1 - abs(progress - 0.2) / 0.25) * 1.8
            half_height = (8.2 * (1 - progress) + 3.2 * progress + shoulder) * (
                0.35 + 0.65 * (1 - progress) ** 0.38
            )
            points_top.append((x, center_y - half_height))
            points_bottom.append((x, center_y + half_height))

        draw.polygon(points_top + list(reversed(points_bottom)), fill=255)

    core_mask = bool_from_image(core)
    return mask | core_mask


def build_initial_frame(
    image: Image.Image,
    cols: int,
    rows: int,
) -> tuple[Image.Image, Image.Image, Image.Image, tuple[float, float, float]]:
    resized = image.convert("RGB").resize((cols, rows), Image.Resampling.LANCZOS)
    rgb = np.asarray(resized, dtype=np.float32)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    luma_image = ImageOps.grayscale(resized)
    luma = np.asarray(luma_image, dtype=np.float32)
    local_background = np.asarray(
        luma_image.filter(ImageFilter.GaussianBlur(5.2)),
        dtype=np.float32,
    )
    local_contrast = luma - local_background
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    blue_bias = blue - (red + green) * 0.5
    edge_image = luma_image.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(0.55))
    edge_image = ImageOps.autocontrast(edge_image, cutoff=1)
    edge = np.asarray(edge_image, dtype=np.float32)
    yy, xx = np.indices((rows, cols))
    roi = (
        (xx >= cols * 0.25)
        & (xx <= cols * 0.87)
        & (yy <= rows * 0.94)
    )
    seed_roi = roi & (yy <= rows * 0.72)
    seed = seed_roi & (
        ((luma >= 147) & (chroma <= 80))
        | ((luma >= 112) & (local_contrast >= 15) & (blue_bias <= 38))
        | ((luma >= 90) & (local_contrast >= 27) & (chroma <= 70))
    )
    seed_components = []

    for component in components(seed):
        min_x, min_y, max_x, max_y = component["bbox"]
        component_width = max_x - min_x + 1
        component_height = max_y - min_y + 1

        if (
            component["area"] >= 8
            and component_width >= 2
            and component_height >= 2
        ):
            center_penalty = (
                abs(component["cx"] / cols - 0.58) * 0.7
                + abs(component["cy"] / rows - 0.34) * 0.45
            )
            score = (
                component["area"] * 2.4
                + component_width * 4
                + component_height * 3
            ) * max(0.12, 1 - center_penalty)
            seed_components.append((score, component))

    if not seed_components:
        raise RuntimeError("Unable to find a high-confidence owl seed")

    seed_components.sort(key=lambda item: item[0], reverse=True)
    primary_seed = seed_components[0][1]
    primary_seed_bbox = primary_seed["bbox"]
    selected_seed_components = []

    for _, component in seed_components:
        min_x, min_y, max_x, max_y = component["bbox"]
        near_primary = not (
            max_x < primary_seed_bbox[0] - 20
            or min_x > primary_seed_bbox[2] + 20
            or max_y < primary_seed_bbox[1] - 18
            or min_y > primary_seed_bbox[3] + 18
        )

        if component is primary_seed or (component["area"] >= 14 and near_primary):
            selected_seed_components.append(component)

    seed_clean = np.zeros_like(seed)

    for component in selected_seed_components:
        for x, y in component["points"]:
            seed_clean[y, x] = True

    seed_y, seed_x = np.nonzero(seed_clean)
    seed_min_x = max(0, int(seed_x.min()) - 17)
    seed_max_x = min(cols - 1, int(seed_x.max()) + 20)
    seed_min_y = max(0, int(seed_y.min()) - 12)
    seed_max_y = min(rows - 1, int(seed_y.max()) + 62)
    seed_region = (
        (xx >= seed_min_x)
        & (xx <= seed_max_x)
        & (yy >= seed_min_y)
        & (yy <= seed_max_y)
    )
    seed_support = bool_from_image(
        image_from_bool(seed_clean).filter(ImageFilter.MaxFilter(31))
    )

    upper_candidate = (
        (
            (luma >= 71)
            & (blue_bias <= 31)
            & (chroma <= 72)
            & ((local_contrast >= 1.5) | (edge >= 18))
        )
        | ((luma >= 49) & (local_contrast >= 7) & (blue_bias <= 38))
        | ((luma >= 52) & (edge >= 37) & (blue_bias <= 42))
    )
    lower_candidate = (
        (luma >= 82)
        & (blue_bias <= 31)
        & ((edge >= 27) | (local_contrast >= 5.5))
    )
    candidate = (
        roi
        & seed_region
        & seed_support
        & np.where(yy <= rows * 0.69, upper_candidate, lower_candidate)
    )
    candidate |= seed_clean
    candidate = bool_from_image(
        image_from_bool(candidate)
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.MinFilter(3))
    )
    selected = []

    for component in components(candidate):
        points = component["points"]
        seed_overlap = sum(seed_clean[y, x] for x, y in points)
        min_x, min_y, max_x, max_y = component["bbox"]
        component_width = max_x - min_x + 1
        component_height = max_y - min_y + 1
        center_penalty = (
            abs(component["cx"] / cols - 0.58) * 0.55
            + abs(component["cy"] / rows - 0.34) * 0.35
        )
        score = (
            component["area"]
            + seed_overlap * 5.5
            + component_width * 3
            + component_height * 2
        ) * max(0.2, 1 - center_penalty)

        if component["area"] >= 32 and seed_overlap >= 3:
            selected.append((score, component))

    if not selected:
        raise RuntimeError("Unable to isolate owl component")

    selected.sort(key=lambda item: item[0], reverse=True)
    primary = selected[0][1]
    primary_bbox = primary["bbox"]
    mask = np.zeros_like(candidate)

    for _, component in selected:
        min_x, min_y, max_x, max_y = component["bbox"]
        close_to_primary = not (
            max_x < primary_bbox[0] - 8
            or min_x > primary_bbox[2] + 8
            or max_y < primary_bbox[1] - 8
            or min_y > primary_bbox[3] + 8
        )

        if component is not primary and (component["area"] < 90 or not close_to_primary):
            continue

        for x, y in component["points"]:
            mask[y, x] = True

    mask = bool_from_image(
        image_from_bool(mask)
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.MinFilter(3))
    )
    head_x, head_y, tail_x = estimate_head_and_body(mask, luma)
    mask_y, mask_x = np.nonzero(mask)
    mask_height = int(mask_y.max() - mask_y.min() + 1) if len(mask_y) else rows
    mask_width = int(mask_x.max() - mask_x.min() + 1) if len(mask_x) else cols

    if mask_height < 56 or mask_width / max(1, mask_height) > 1.75:
        mask[
            (xx > tail_x + 16)
            & (yy > head_y + 12)
        ] = False

    lower_region = yy > head_y + 11
    body_corridor = (
        (xx >= head_x - 7)
        & (xx <= min(cols - 1, head_x + 76))
        & (yy <= head_y + 17)
    )
    feather_evidence = (
        ((luma >= 72) & (edge >= 22) & (blue_bias <= 38))
        | ((luma >= 66) & (local_contrast >= 5.5) & (blue_bias <= 36))
        | ((luma >= 124) & (edge >= 11) & (blue_bias <= 30))
    )
    mask[lower_region & ~body_corridor & ~feather_evidence] = False
    mask = prune_thin_lower_runs(
        mask,
        edge,
        local_contrast,
        round(head_y + 9),
    )
    mask = bool_from_image(
        image_from_bool(mask)
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.MinFilter(3))
    )
    mask = prune_thin_lower_runs(
        mask,
        edge,
        local_contrast,
        round(head_y + 9),
    )
    mask = keep_head_connected_components(mask, head_x, head_y)
    mask = add_body_core(mask, head_x, head_y, tail_x)
    mask = fill_small_holes(mask, 60)

    return luma_image, edge_image, image_from_bool(mask), (head_x, head_y, tail_x)


def build_vision_frame(
    image: Image.Image,
    vision_mask_path: Path,
    cols: int,
    rows: int,
) -> tuple[Image.Image, Image.Image, Image.Image, tuple[float, float, float]]:
    resized = image.convert("RGB").resize((cols, rows), Image.Resampling.LANCZOS)
    luma_image = ImageOps.grayscale(resized)
    edge_image = luma_image.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(0.45))
    edge_image = ImageOps.autocontrast(edge_image, cutoff=1)
    vision_mask = (
        Image.open(vision_mask_path)
        .convert("L")
        .resize((cols, rows), Image.Resampling.LANCZOS)
    )
    mask_array = np.asarray(vision_mask, dtype=np.uint8)
    binary = mask_array > 12
    found = components(binary)

    if not found:
        raise RuntimeError(f"Vision mask is empty: {vision_mask_path.name}")

    primary = max(found, key=lambda component: component["area"])
    clean_support = np.zeros_like(binary)

    for x, y in primary["points"]:
        clean_support[y, x] = True

    clean_support = bool_from_image(
        image_from_bool(clean_support).filter(ImageFilter.MaxFilter(3))
    )
    cleaned_mask = np.where(clean_support, mask_array, 0).astype(np.uint8)
    cleaned_mask = Image.fromarray(cleaned_mask, mode="L").filter(ImageFilter.GaussianBlur(0.38))
    clean_binary = np.asarray(cleaned_mask, dtype=np.uint8) > 18
    luma_array = np.asarray(luma_image, dtype=np.float32)
    anchor = estimate_head_and_body(clean_binary, luma_array)

    return luma_image, edge_image, cleaned_mask, anchor


def stabilize_masks(
    masks: list[Image.Image],
    anchors: list[tuple[float, float, float]],
) -> list[Image.Image]:
    output = []

    for index, current in enumerate(masks):
        current_array = np.asarray(current, dtype=np.float32) / 255
        support_arrays = []

        for neighbor_index in (max(0, index - 1), min(len(masks) - 1, index + 1)):
            offset_x = anchors[index][0] - anchors[neighbor_index][0]
            offset_y = anchors[index][1] - anchors[neighbor_index][1]
            shifted = shift_image(masks[neighbor_index], offset_x, offset_y)
            support_arrays.append(np.asarray(shifted, dtype=np.float32) / 255)

        persistent_support = np.minimum(support_arrays[0], support_arrays[1])
        stabilized = np.maximum(current_array, persistent_support * 0.42)
        soft = Image.fromarray(
            np.clip(stabilized * 255, 0, 255).astype(np.uint8),
            mode="L",
        ).filter(ImageFilter.GaussianBlur(0.72))
        output.append(soft)

    return output


def crop_box(masks: list[Image.Image]) -> tuple[int, int, int, int]:
    combined = np.maximum.reduce([np.asarray(mask, dtype=np.uint8) for mask in masks])
    ys, xs = np.nonzero(combined > 16)

    if len(xs) == 0:
        raise RuntimeError("The stabilized owl mask is empty")

    margin = 5
    return (
        max(0, int(xs.min()) - margin),
        max(0, int(ys.min()) - margin),
        min(combined.shape[1], int(xs.max()) + margin + 1),
        min(combined.shape[0], int(ys.max()) + margin + 1),
    )


def crop_and_pad(image: Image.Image, box: tuple[int, int, int, int], fill: int) -> Image.Image:
    cropped = image.crop(box)
    output = Image.new(
        "L",
        (
            cropped.width + OUTPUT_PADDING_X * 2,
            cropped.height + OUTPUT_PADDING_TOP + OUTPUT_PADDING_BOTTOM,
        ),
        fill,
    )
    output.paste(cropped, (OUTPUT_PADDING_X, OUTPUT_PADDING_TOP))
    return output


def isolate_tone(
    luma: Image.Image,
    edge: Image.Image,
    mask: Image.Image,
) -> tuple[Image.Image, Image.Image]:
    mask_array = np.asarray(mask, dtype=np.float32) / 255
    luma_array = np.asarray(luma, dtype=np.float32)
    edge_array = np.asarray(edge, dtype=np.float32)
    isolated_luma = 255 - (255 - luma_array) * mask_array
    isolated_edge = edge_array * np.power(mask_array, 0.72)

    return (
        Image.fromarray(np.clip(isolated_luma, 0, 255).astype(np.uint8), mode="L"),
        Image.fromarray(np.clip(isolated_edge, 0, 255).astype(np.uint8), mode="L"),
    )


def make_preview(
    numbers: list[int],
    lumas: list[Image.Image],
    edges: list[Image.Image],
    masks: list[Image.Image],
) -> Image.Image:
    preview_indices = [
        0,
        len(numbers) // 7,
        len(numbers) * 2 // 7,
        len(numbers) * 3 // 7,
        len(numbers) * 4 // 7,
        len(numbers) * 5 // 7,
        len(numbers) * 6 // 7,
        len(numbers) - 1,
    ]
    cell_width = 300
    cell_height = 210
    sheet = Image.new("RGB", (cell_width * 4, cell_height * 2), "white")

    for position, index in enumerate(preview_indices):
        luma = np.asarray(lumas[index], dtype=np.float32)
        edge = np.asarray(edges[index], dtype=np.float32) / 255
        mask = np.asarray(masks[index], dtype=np.float32) / 255
        darkness = 1 - luma / 255
        depth = np.clip(darkness * 0.76 + edge * 0.38, 0, 1)
        rgb = np.full((*luma.shape, 3), 255, dtype=np.uint8)
        rgb[:, :, 0] = np.clip(94 - 82 * depth, 0, 255)
        rgb[:, :, 1] = np.clip(145 - 122 * depth, 0, 255)
        rgb[:, :, 2] = np.clip(255 - 92 * depth, 0, 255)
        rgb = np.clip(255 - (255 - rgb) * mask[:, :, None], 0, 255).astype(np.uint8)
        rendered = Image.fromarray(rgb, mode="RGB")
        rendered.thumbnail((cell_width - 12, cell_height - 24), Image.Resampling.NEAREST)
        cell = Image.new("RGB", (cell_width, cell_height), "white")
        cell.paste(
            rendered,
            (
                (cell_width - rendered.width) // 2,
                (cell_height - rendered.height) // 2 + 8,
            ),
        )
        ImageDraw.Draw(cell).text((6, 5), f"{numbers[index]:03d}", fill="black")
        sheet.paste(cell, ((position % 4) * cell_width, (position // 4) * cell_height))

    return sheet


def build() -> None:
    frames = source_frames()
    first = Image.open(frames[0][1])
    source_width, source_height = first.size
    sample_rows = round(SAMPLE_COLS * source_height / source_width)
    numbers = []
    lumas = []
    edges = []
    masks = []
    anchors = []
    using_vision_masks = True

    for number, path in frames:
        image = Image.open(path)
        if image.size != (source_width, source_height):
            raise RuntimeError(f"Frame size mismatch: {path.name}")

        vision_mask_path = VISION_MASK_DIR / f"{path.stem}.png"

        if vision_mask_path.exists():
            luma, edge, mask, anchor = build_vision_frame(
                image,
                vision_mask_path,
                SAMPLE_COLS,
                sample_rows,
            )
        else:
            using_vision_masks = False
            luma, edge, mask, anchor = build_initial_frame(image, SAMPLE_COLS, sample_rows)

        numbers.append(number)
        lumas.append(luma)
        edges.append(edge)
        masks.append(mask)
        anchors.append(anchor)

    if not using_vision_masks:
        masks = stabilize_masks(masks, anchors)

    box = crop_box(masks)
    output_lumas = []
    output_edges = []
    output_masks = []

    for luma, edge, mask in zip(lumas, edges, masks, strict=True):
        isolated_luma, isolated_edge = isolate_tone(luma, edge, mask)
        output_lumas.append(crop_and_pad(isolated_luma, box, 255))
        output_edges.append(crop_and_pad(isolated_edge, box, 0))
        output_masks.append(crop_and_pad(mask, box, 0))

    cols, rows = output_masks[0].size
    metadata = {
        "version": 2,
        "renderingModel": "camera-style-soft-matte",
        "segmentationModel": (
            "Apple Vision foreground instance mask"
            if using_vision_masks
            else "local contrast fallback"
        ),
        "cols": cols,
        "rows": rows,
        "frameCount": len(numbers),
        "startFrame": numbers[0],
        "endFrame": numbers[-1],
        "durationSeconds": DURATION_SECONDS,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "sampleCols": SAMPLE_COLS,
        "sampleRows": sample_rows,
        "cropBox": box,
        "maskIsSoft": True,
        "lumaFile": "/intro-owl-sequence-luma.bin",
        "edgeFile": "/intro-owl-sequence-edge.bin",
        "maskFile": "/intro-owl-sequence-mask.bin",
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "intro-owl-data.json").write_text(
        json.dumps(metadata),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "intro-owl-sequence-luma.bin").write_bytes(
        b"".join(image.tobytes() for image in output_lumas)
    )
    (OUTPUT_DIR / "intro-owl-sequence-edge.bin").write_bytes(
        b"".join(image.tobytes() for image in output_edges)
    )
    (OUTPUT_DIR / "intro-owl-sequence-mask.bin").write_bytes(
        b"".join(image.tobytes() for image in output_masks)
    )
    make_preview(numbers, output_lumas, output_edges, output_masks).save(
        OUTPUT_DIR / "intro-owl-preview.png"
    )

    print(
        f"Wrote {len(numbers)} camera-style owl frames "
        f"from {numbers[0]:03d} to {numbers[-1]:03d} at {cols}x{rows}"
    )


if __name__ == "__main__":
    build()

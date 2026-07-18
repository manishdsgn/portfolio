from __future__ import annotations

import json
from collections import deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
METADATA_PATH = PUBLIC_DIR / "intro-owl-data.json"
OUTPUT_PATH = PUBLIC_DIR / "intro-owl-repair-mask.bin"


def get_row_spans(mask_frame: bytes, cols: int, rows: int) -> dict[int, tuple[int, int]]:
    spans = {}

    for row in range(rows):
        mask_columns = [
            column
            for column in range(cols)
            if mask_frame[row * cols + column] > 6
        ]

        if len(mask_columns) < 2:
            continue

        spans[row] = (min(mask_columns), max(mask_columns))

    return spans


def get_hole_components(mask_frame: bytes, cols: int, rows: int) -> list[dict[str, object]]:
    spans = get_row_spans(mask_frame, cols, rows)
    candidates = bytearray(cols * rows)

    for row, (left, right) in spans.items():
        for column in range(left, right + 1):
            if mask_frame[row * cols + column] <= 6:
                candidates[row * cols + column] = 1

    visited = bytearray(cols * rows)
    components = []

    for row in range(rows):
        for column in range(cols):
            index = row * cols + column

            if visited[index] or candidates[index] == 0:
                continue

            queue = deque([(column, row)])
            visited[index] = 1
            points = []
            touches_span_edge = False

            while queue:
                current_column, current_row = queue.popleft()
                points.append((current_column, current_row))
                span = spans.get(current_row)

                if span and (
                    current_column <= span[0] + 1 or
                    current_column >= span[1] - 1
                ):
                    touches_span_edge = True

                for next_column, next_row in (
                    (current_column - 1, current_row),
                    (current_column + 1, current_row),
                    (current_column, current_row - 1),
                    (current_column, current_row + 1),
                ):
                    if next_column < 0 or next_column >= cols or next_row < 0 or next_row >= rows:
                        continue

                    next_index = next_row * cols + next_column

                    if visited[next_index] or candidates[next_index] == 0:
                        continue

                    visited[next_index] = 1
                    queue.append((next_column, next_row))

            if len(points) < 36:
                continue

            x_values = [point[0] for point in points]
            y_values = [point[1] for point in points]
            components.append(
                {
                    "area": len(points),
                    "bbox": (min(x_values), min(y_values), max(x_values), max(y_values)),
                    "cx": sum(x_values) / len(points),
                    "cy": sum(y_values) / len(points),
                    "touches_span_edge": touches_span_edge,
                    "points": points,
                }
            )

    return components


def should_keep_component(
    component: dict[str, object],
    bbox: tuple[int, int, int, int],
    body_anchor_y: float,
) -> bool:
    min_x, min_y, max_x, max_y = bbox
    body_width = max(1, max_x - min_x + 1)
    body_height = max(1, max_y - min_y + 1)
    comp_min_x, comp_min_y, comp_max_x, comp_max_y = component["bbox"]
    comp_width = comp_max_x - comp_min_x + 1
    comp_height = comp_max_y - comp_min_y + 1
    area = int(component["area"])
    rel_x = (float(component["cx"]) - min_x) / body_width
    rel_y = (float(component["cy"]) - min_y) / body_height

    if bool(component["touches_span_edge"]):
        return False

    if area < 120:
        return False

    if comp_width < 12 or comp_height < 9:
        return False

    if comp_width > body_width * 0.55 or comp_height > body_height * 0.5:
        return False

    # Repairs are only for the transient lower-body void that appears during
    # downstrokes. Open sky between raised or level wings is intentional.
    if comp_min_y < body_anchor_y + 6:
        return False

    if not (0.22 <= rel_x <= 0.74 and 0.2 <= rel_y <= 0.82):
        return False

    center_score = (
        max(0, 1 - abs(rel_x - 0.5) * 1.55) *
        max(0, 1 - abs(rel_y - 0.54) * 1.35)
    )
    size_score = area + comp_width * comp_height * 0.08

    return size_score * center_score > 110


def get_mask_bbox(mask_frame: bytes, cols: int, rows: int) -> tuple[int, int, int, int] | None:
    filled = [index for index, value in enumerate(mask_frame) if value > 6]

    if not filled:
        return None

    x_values = [index % cols for index in filled]
    y_values = [index // cols for index in filled]

    return min(x_values), min(y_values), max(x_values), max(y_values)


def build() -> None:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    cols = int(metadata["cols"])
    rows = int(metadata["rows"])
    frame_count = int(metadata["frameCount"])
    frame_size = cols * rows
    body_anchors = metadata["bodyAnchors"]
    mask_path = PUBLIC_DIR / metadata["maskFile"].lstrip("/")
    mask_bytes = mask_path.read_bytes()
    repair = bytearray(frame_size * frame_count)
    kept_components = 0

    for frame_index in range(frame_count):
        frame_start = frame_index * frame_size
        mask_frame = mask_bytes[frame_start:frame_start + frame_size]
        bbox = get_mask_bbox(mask_frame, cols, rows)

        if bbox is None:
            continue

        for component in get_hole_components(mask_frame, cols, rows):
            if not should_keep_component(
                component,
                bbox,
                float(body_anchors[frame_index][1]),
            ):
                continue

            kept_components += 1

            for column, row in component["points"]:
                repair[frame_start + row * cols + column] = 255

    metadata["repairMaskFile"] = "/intro-owl-repair-mask.bin"
    METADATA_PATH.write_text(json.dumps(metadata), encoding="utf-8")
    OUTPUT_PATH.write_bytes(bytes(repair))
    print(f"Wrote {OUTPUT_PATH} with {kept_components} repaired hole components")


if __name__ == "__main__":
    build()

import math
from math import gcd


def parse_ratios(value: str):
    ratios = []
    seen = set()
    for line_number, line in enumerate(value.splitlines(), 1):
        text = line.strip()
        if not text:
            continue
        parts = text.split(":")
        if len(parts) != 2:
            raise ValueError(f"Invalid aspect ratio on line {line_number}: expected W:H.")
        try:
            width, height = (int(part.strip()) for part in parts)
        except ValueError as error:
            raise ValueError(f"Invalid aspect ratio on line {line_number}: W and H must be integers.") from error
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid aspect ratio on line {line_number}: W and H must be positive.")
        divisor = gcd(width, height)
        ratio = (width // divisor, height // divisor)
        if ratio in seen:
            raise ValueError(f"Duplicate aspect ratio on line {line_number}: {ratio[0]}:{ratio[1]}.")
        seen.add(ratio)
        ratios.append(ratio)
    if not ratios:
        raise ValueError("At least one aspect ratio is required.")
    return ratios


def combine_ratios(standard_ratios, custom_value: str):
    ratios = list(standard_ratios)
    seen = set(ratios)
    if custom_value.strip():
        for ratio in parse_ratios(custom_value):
            if ratio not in seen:
                seen.add(ratio)
                ratios.append(ratio)
    if not ratios:
        raise ValueError("At least one aspect ratio must be enabled or entered.")
    return ratios


def dimensions_for_area(square_resolution: int, ratio, alignment: int):
    ratio_width, ratio_height = ratio
    area = square_resolution * square_resolution
    width = math.sqrt(area * ratio_width / ratio_height)
    height = math.sqrt(area * ratio_height / ratio_width)

    def align(value):
        return max(alignment, int(round(value / alignment)) * alignment)

    return align(width), align(height)

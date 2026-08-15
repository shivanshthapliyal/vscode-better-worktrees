"""Generates the extension icon: one repository branching into parallel worktrees.

A trunk runs left to right. Two branches peel away through tangent quarter-arcs
and then straighten out parallel to the trunk, so the right edge of the mark is
three parallel lines -- three working trees checked out at once.

Geometry is defined on a 128-unit grid and rendered at 8x, then downsampled, so
every curve is a true circular arc rather than a smoothed elbow.

Run: python3 scripts/make-icon.py
"""

import math

from PIL import Image, ImageDraw

GRID = 128  # Geometry below is expressed in these units, independent of SIZE.
SIZE = 128
SCALE = 8
S = SIZE * SCALE

INK = (255, 255, 255)
BG = (11, 12, 14)
CORNER_RADIUS = 28

STROKE = 8.5
ARC_R = 17.0
ROOT_DOT = 9.5
TIP_DOT = 7.5

TRUNK_Y = 64.0
X_START = 27.0
X_END = 101.0
TAKEOFF_X = 42.0

ARC_STEPS = 64


def s_curve(start_x: float, from_y: float, direction: float) -> list:
    """Two tangent quarter-arcs stepping a horizontal line 2*ARC_R sideways.

    Arc one bends away from the trunk, arc two bends back; they share a vertical
    tangent at the joint, and the pair leaves and arrives horizontal, so the
    curve meets the straight segments on either side without a kink.
    """
    pts = []

    cx, cy = start_x, from_y + ARC_R * direction
    for i in range(ARC_STEPS + 1):
        a = (math.pi / 2) * (i / ARC_STEPS)
        pts.append((cx + ARC_R * math.sin(a), cy - ARC_R * math.cos(a) * direction))

    jx, jy = pts[-1]
    cx2, cy2 = jx + ARC_R, jy
    for i in range(1, ARC_STEPS + 1):
        a = math.pi - (math.pi / 2) * (i / ARC_STEPS)
        pts.append((cx2 + ARC_R * math.cos(a), cy2 + ARC_R * math.sin(a) * direction))

    return pts


def build_paths() -> list:
    paths = [[(X_START, TRUNK_Y), (X_END, TRUNK_Y)]]

    for direction in (-1.0, 1.0):
        curve = s_curve(TAKEOFF_X, TRUNK_Y, direction)
        end_y = curve[-1][1]
        paths.append([(TAKEOFF_X, TRUNK_Y)] + curve + [(X_END, end_y)])

    return paths


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=255
    )
    return mask


def _walk(path: list, step: float) -> list:
    """Resample a polyline to points evenly spaced along its arc length."""
    out = [path[0]]
    carry = 0.0
    for (x0, y0), (x1, y1) in zip(path, path[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        if seg == 0:
            continue
        t = step - carry
        while t <= seg:
            f = t / seg
            out.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f))
            t += step
        carry = (carry + seg) % step
    out.append(path[-1])
    return out


def render(bg: tuple, ink: tuple) -> Image.Image:
    # One grid unit in supersampled pixels, so geometry tracks SIZE rather than
    # assuming the 128-unit grid equals the output resolution.
    u = SIZE * SCALE / GRID
    side = round(GRID * u)

    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    plate = Image.new("RGBA", (side, side), bg + (255,))
    canvas.paste(plate, (0, 0), rounded_mask(side, round(CORNER_RADIUS * u)))

    d = ImageDraw.Draw(canvas)
    paths = build_paths()

    # Stamping a disc along the path yields true round caps and joins; PIL's
    # line joint modes distort on densely sampled curves.
    for path in paths:
        for x, y in _walk(path, 0.25):
            _dot(d, (x * u, y * u), STROKE / 2 * u, ink)

    _dot(d, (X_START * u, TRUNK_Y * u), ROOT_DOT * u, ink)
    for path in paths:
        _dot(d, (X_END * u, path[-1][1] * u), TIP_DOT * u, ink)

    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def _dot(d: ImageDraw.ImageDraw, center: tuple, r: float, fill: tuple) -> None:
    x, y = center
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def main() -> None:
    render(BG, INK).save("icon.png")
    print("wrote icon.png")


if __name__ == "__main__":
    main()

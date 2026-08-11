"""Generates the extension icon: a git-worktree 'branch fork' glyph.

A trunk node on the left splits into three branch nodes on the right, echoing
one repository fanning out into several worktrees. Rendered at 4x and
downsampled for clean anti-aliased edges. Run: python3 scripts/make-icon.py
"""

from PIL import Image, ImageDraw

SIZE = 128
SCALE = 4
S = SIZE * SCALE

BG_TOP = (37, 99, 235)  # blue
BG_BOTTOM = (14, 165, 164)  # teal
NODE = (255, 255, 255)
EDGE = (255, 255, 255)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        grad.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return grad.resize((size, size))


def main() -> None:
    bg = vertical_gradient(S, BG_TOP, BG_BOTTOM).convert("RGBA")
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), rounded_mask(S, radius=28 * SCALE))

    d = ImageDraw.Draw(canvas)

    trunk = (40 * SCALE, 64 * SCALE)
    branches = [
        (92 * SCALE, 32 * SCALE),
        (92 * SCALE, 64 * SCALE),
        (92 * SCALE, 96 * SCALE),
    ]
    r_trunk = 11 * SCALE
    r_branch = 8 * SCALE
    edge_w = 7 * SCALE

    # Edges: curved connectors trunk -> each branch, drawn as smooth polylines.
    for bx, by in branches:
        mid_x = (trunk[0] + bx) // 2
        pts = [
            trunk,
            (mid_x, trunk[1]),
            (mid_x, by),
            (bx, by),
        ]
        # A simple quadratic-ish smoothing: sample the elbow with small steps.
        smooth = []
        steps = 24
        for i in range(steps + 1):
            t = i / steps
            # de Casteljau over the 4 control points
            ax = _lerp(pts, t)
            smooth.append(ax)
        d.line(smooth, fill=EDGE, width=edge_w, joint="curve")

    # Nodes on top of the edges.
    _dot(d, trunk, r_trunk, NODE)
    for b in branches:
        _dot(d, b, r_branch, NODE)

    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    out.save("icon.png")
    print("wrote icon.png")


def _lerp(pts, t):
    p = list(pts)
    while len(p) > 1:
        p = [
            (
                p[i][0] + (p[i + 1][0] - p[i][0]) * t,
                p[i][1] + (p[i + 1][1] - p[i][1]) * t,
            )
            for i in range(len(p) - 1)
        ]
    return p[0]


def _dot(d, center, r, fill):
    x, y = center
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


if __name__ == "__main__":
    main()

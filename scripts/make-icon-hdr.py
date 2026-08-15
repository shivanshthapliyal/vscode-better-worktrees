"""Generates an HDR variant of the icon, PQ-encoded in the Rec.2020 container.

The mark is rendered from the same geometry as the SDR icon, then re-encoded so
the strokes sit at a chosen absolute luminance above SDR diffuse white. On an HDR
display the mark lifts off the plate; on an SDR display it tone-maps back to an
ordinary white-on-dark icon.

MARK_NITS is the whole design decision. SDR diffuse white is 203 cd/m^2, so the
default is a deliberate ~2x lift: present, but not a light source. Values in the
thousands are what accidental HDR exports produce, and they read as a blown-out
glow that outshines whatever UI hosts the icon.

Tagging is delegated to scripts/encode-hdr.swift, which attaches the system's
own ITU-R BT.2100 PQ color space via ImageIO.

Run: python3 scripts/make-icon-hdr.py
"""

import importlib.util
import subprocess
import sys
from pathlib import Path

from PIL import Image

MARK_NITS = 400.0
SDR_WHITE_NITS = 203.0

SIZE = 512

# SMPTE ST 2084 (PQ) constants.
M1 = 2610 / 16384
M2 = 2523 / 4096 * 128
C1 = 3424 / 4096
C2 = 2413 / 4096 * 32
C3 = 2392 / 4096 * 32

# Rec.709 -> Rec.2020 primaries (BT.2087), applied in linear light.
R709_TO_R2020 = (
    (0.6274039, 0.3292830, 0.0433131),
    (0.0690973, 0.9195404, 0.0113623),
    (0.0163914, 0.0880132, 0.8955953),
)


def pq_encode(nits: float) -> float:
    """Absolute luminance in cd/m^2 -> PQ code value in [0,1]."""
    y = max(nits, 0.0) / 10000.0
    return ((C1 + C2 * (y**M1)) / (1.0 + C3 * (y**M1))) ** M2


def srgb_to_linear(v: float) -> float:
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def to_rec2020(rgb: tuple) -> tuple:
    return tuple(sum(R709_TO_R2020[i][j] * rgb[j] for j in range(3)) for i in range(3))


def build_source() -> Image.Image:
    """Render the mark at SIZE using the SDR script's geometry."""
    path = Path(__file__).with_name("make-icon.py")
    spec = importlib.util.spec_from_file_location("make_icon", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mk = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mk)

    mk.SIZE = SIZE
    mk.S = SIZE * mk.SCALE
    return mk.render(mk.BG, mk.INK).convert("RGB")


def encode_pq(img: Image.Image) -> Image.Image:
    """Rewrite SDR pixels as PQ code values, placing white at MARK_NITS.

    Every pixel is scaled by the same factor, so the image keeps its SDR tonal
    relationships and only the ceiling moves: the plate stays as dark relative
    to the mark as it was, instead of being lifted toward mid-grey.
    """
    out = Image.new("RGB", img.size)
    src, dst = img.load(), out.load()
    assert src is not None and dst is not None

    cache: dict = {}
    for y in range(img.height):
        for x in range(img.width):
            px = src[x, y]
            if px not in cache:
                lin = [srgb_to_linear(c / 255.0) for c in px]
                wide = to_rec2020([c * MARK_NITS for c in lin])
                cache[px] = tuple(
                    min(255, max(0, round(pq_encode(c) * 255.0))) for c in wide
                )
            dst[x, y] = cache[px]

    return out


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "docs" / "icon-hdr.png"
    out.parent.mkdir(exist_ok=True)

    staged = out.with_suffix(".untagged.png")
    encode_pq(build_source()).save(staged)

    result = subprocess.run(
        [
            "swift",
            str(Path(__file__).with_name("encode-hdr.swift")),
            str(staged),
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    staged.unlink()

    if result.returncode != 0:
        sys.exit(f"tagging failed: {result.stderr.strip()}")

    print(f"wrote {out.relative_to(root)}")
    print(
        f"  mark  -> {MARK_NITS:.0f} nits ({MARK_NITS / SDR_WHITE_NITS:.1f}x SDR white)"
    )


if __name__ == "__main__":
    main()

"""The Label drawn with Pillow: size, black box, white band. No ffmpeg."""

from beat_upload.label import render_label


def test_label_is_as_wide_as_asked_and_taller_than_a_third() -> None:
    im = render_label(400)
    assert im.width == 400
    assert 0.6 * 400 < im.height < 0.8 * 400


def test_label_is_a_black_box_with_a_white_band_and_white_letters() -> None:
    im = render_label(400).convert("RGB")
    assert im.getpixel((2, 2)) == (0, 0, 0)  # the box
    middle_row = [im.getpixel((x, im.height // 2)) for x in range(im.width)]
    white = sum(1 for p in middle_row if p == (255, 255, 255))
    black = sum(1 for p in middle_row if p == (0, 0, 0))
    assert white > im.width * 0.3  # the band behind the big word
    assert black > im.width * 0.1  # the big word and the box edges
    top_strip = [im.getpixel((x, round(0.11 * im.width))) for x in range(im.width)]
    assert any(sum(p) > 600 for p in top_strip)  # PRODUCED BY in white


def test_label_scales_without_breaking() -> None:
    small, big = render_label(120), render_label(520)
    assert small.width == 120 and big.width == 520
    assert abs(small.height / 120 - big.height / 520) < 0.02

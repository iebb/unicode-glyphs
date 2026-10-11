# Unicode reference glyph atlas

**Reference only. The source font licenses are highly restrictive. No reuse or
redistribution rights are granted.** See [the complete restrictions](REFERENCE-ONLY.md).

[Open the display website](https://iebb.github.io/unicode-glyphs/) ·
[All block navigation pages](https://iebb.github.io/unicode-glyphs/navigation.html) ·
[Reusable extraction scripts](https://github.com/iebb/unicode-glyph-extractor)

The Unicode 18.0.0 snapshot contains 372,521 specimens for all 172,939 printed
chart codepoints. This includes 172,873 assigned non-private-use, non-surrogate
codepoints and 66 noncharacter conventions. Regional forms and displayed
standardized variants are preserved separately.

Files use lossless **SVGZ** (gzip-compressed SVG), with original paths, metadata
and notices. The browser decompresses them as needed. To recover ordinary SVG:

```bash
gzip -dc U01/11/11.svgz > U01-11-11.svg
```

Six-digit hexadecimal codepoints are split into pairs. Single forms use
`U01/11/11.svgz`; multiple forms use `U00/4E/00/G0-523B.svgz`. Draft specimens
live under `draft/`. Draft-only codepoints appear in red and carry a Draft label.

## Navigate by plane

- [U00 — Basic Multilingual Plane](U00/)
- [U01 — Supplementary Multilingual Plane](U01/)
- [U02 — Supplementary Ideographic Plane](U02/)
- [U03 — Tertiary Ideographic Plane](U03/)
- [U0E — Supplementary special-purpose plane](U0E/)
- Other plane directories contain their printed noncharacter cell conventions.

Each plane, byte directory and multiform codepoint has a navigation README.
Static HTML pages also provide block navigation without JavaScript.

## Verification and updates

`reports/release/` contains input hashes, complete coverage and PDF outline
audits, raster checks, byte-for-byte compression checks and the gzipped manifest.
`reports/draft/` is present when a public draft exists. `docs/data/catalog.json`
records the current versions and counts.

Monthly CI in the extractor repository discovers the current final release and
available public draft, extracts them, verifies every specimen and updates this
repository. An unavailable draft is reported as unavailable; a changed layout or
failed audit prevents publication. The `docs/` directory is published on GitHub
Pages using a small deployment containing the browser and indexes. Specimens
are loaded individually from this repository.

To rebuild catalog and navigation after a verified extraction:

```bash
python3 tools/build_catalog.py --repo . --discovery discovery.json
```

Original chart notices remain in every decompressed SVG. This repository does
not grant a font license or permission to redistribute chart artwork.

# Resource artwork

Drop any `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif` file here (or in
`../assets/backgrounds`, `../assets/characters`) and the pipeline will place it
on the matching tiles of the auto-generated concept diagrams.

## Naming is the lookup key

The backend tokenizes the file name and its folder name, then matches those
words against each tile's icon and label:

| File | Matches tiles about |
| --- | --- |
| `icons/water.svg` | water, rain, rivers, evaporation |
| `icons/sun.png` | the sun, sunlight, solar energy |
| `weather/storm.svg` | clouds, storms, weather |
| `plant-leaf.svg` | plants, leaves, photosynthesis |

Prefer short, descriptive names. Words like `icon`, `flat`, `outline`, `final`,
`v2` and the folder names `icons`/`images` are ignored.

## Behaviour

- Matching files are inlined into the storyboard as `data:` URLs, so a render
  never needs a network request and works offline.
- A tile with no match keeps its built-in SVG glyph, so diagrams are never
  empty.
- Only files up to 400 KB are inlined; larger images are skipped.
- The folder is re-scanned automatically when files change (15 s cache).

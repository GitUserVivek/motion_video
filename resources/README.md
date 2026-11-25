# Resource Artwork

> **Enhanced for Anupam Classes 2.0**
> Drop any `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif` file here (or in `../assets/backgrounds`, `../assets/characters`) and the pipeline will automatically place it on matching tiles of auto-generated concept diagrams.

---

## 🎯 What's New in Version 2.0

### Enhanced Asset System
- **9 New SVG Files** added to `assets/` directory
  - 5 character SVGs (blue, green, red, purple, pink)
  - 4 background SVGs (educational, modern, playful, minimal)
- **Extended Object Types**: 32 types (was 19)
  - Added: brain, bone, skeleton, dna, neuron, circuit, server, network, equation, chart, timeline, beaker, testtube, molecule, electron, proton, neutron, bacteria, virus, organ, femur, skull, ribcage
- **Semantic Matching**: Context-aware asset selection
- **Validation**: Visual relevance scoring (0-1)

---

## 📁 Asset Locations

### Primary Locations
```
resources/
├── icons/          # Icon files (currently empty, but supported)
└── images/         # Image files
    └── characters/ # 642 PNG character parts

assets/
├── characters/    # NEW: 5 SVG character illustrations
│   ├── blue_character.svg
│   ├── green_character.svg
│   ├── red_character.svg
│   ├── purple_character.svg
│   └── pink_character.svg
└── backgrounds/    # NEW: 4 SVG background gradients
    ├── educational_gradient.svg
    ├── modern_dark.svg
    ├── playful_gradient.svg
    └── minimal_light.svg
```

### Asset Count
| Location | Type | Count | Status |
|----------|------|-------|--------|
| `resources/images/characters/` | PNG | 642 | ✅ Existing |
| `assets/characters/` | SVG | 5 | ✅ **NEW** |
| `assets/backgrounds/` | SVG | 4 | ✅ **NEW** |
| **Total** | | **651** | ✅ |

---

## 🔍 Naming & Lookup System

The backend **tokenizes** file names and folder names, then matches those words against each tile's icon and label.

### How It Works
1. File name is split into words (e.g., `water-cycle.svg` → `water`, `cycle`)
2. Folder name is also tokenized (e.g., `icons/` is ignored, but `weather/storm.svg` → `weather`, `storm`)
3. Stop words are removed (icon, flat, outline, final, v2, images, etc.)
4. Remaining words are matched against tile concepts
5. Best match wins (highest relevance score)

### Examples

| File Path | Tokens | Matches Tiles About |
|-----------|--------|---------------------|
| `icons/water.svg` | water | water, rain, rivers, evaporation, H2O |
| `icons/sun.png` | sun | sun, sunlight, solar energy, light |
| `weather/storm.svg` | weather, storm | clouds, storms, weather, atmosphere |
| `plant-leaf.svg` | plant, leaf | plants, leaves, photosynthesis, chlorophyll |
| `assets/characters/blue_character.svg` | blue, character | Used when "character" or "person" is mentioned |
| `assets/backgrounds/educational_gradient.svg` | educational, gradient | Used for educational themes |

---

## 🎨 Asset Types

### Supported Formats
- ✅ `.svg` - Vector graphics (preferred for scalability)
- ✅ `.png` - Raster images with transparency
- ✅ `.jpg` / `.jpeg` - Raster images
- ✅ `.webp` - Modern web format
- ✅ `.gif` - Animated images

### Format Priority
When multiple assets match, the system prefers:
1. **SVG** (vector, scalable, small file size)
2. **PNG** (lossless, transparency)
3. **WebP** (modern, good compression)
4. **JPG** (lossy, no transparency)
5. **GIF** (animated, but large file size)

---

## 📊 Educational Object Types (32 Types)

The system now supports **32 educational object types** for better visual matching:

### 🌍 Science & Nature
- `book` - Books, reading, knowledge
- `apple` - Food, nutrition, healthy
- `globe` - Earth, world, geography, countries
- `leaf` - Plants, photosynthesis, chlorophyll
- `plant` - Botany, growth, nature
- `sun` - Sunlight, solar energy, light
- `water` - Liquid, H2O, rain, ocean
- `cloud` - Weather, atmosphere, precipitation
- `rocket` - Space, planets, exploration

### 🧬 Biology
- `cell` - Cellular, organism, life
- `dna` - Genetics, genes, heredity
- `gene` - Genetics, inheritance
- `neuron` - Brain, nervous system
- `bacteria` - Microorganisms, microbes
- `virus` - Infectious agents
- `brain` - Mind, thinking, cognition
- `heart` - Circulation, cardiovascular
- `organ` - Body parts, systems

### ⚗️ Chemistry
- `atom` - Atomic structure, particles
- `molecule` - Chemical compounds
- `electron` - Subatomic particles
- `proton` - Subatomic particles
- `neutron` - Subatomic particles
- `beaker` - Laboratory equipment
- `testtube` - Laboratory equipment

### 💀 Anatomy
- `bone` - Skeletal system
- `skeleton` - Full skeletal structure
- `femur` - Thigh bone
- `skull` - Head bone structure
- `ribcage` - Rib bones

### 💻 Technology
- `calculator` - Mathematics, calculations
- `circuit` - Electronics, electricity
- `server` - Computing, networks
- `network` - Connections, internet
- `computer` - Technology, digital

### 📐 Mathematics
- `pencil` - Writing, drawing
- `star` - Rating, astronomy
- `equation` - Math formulas
- `chart` - Data visualization
- `timeline` - Chronology, history

### 🔬 Instruments
- `microscope` - Laboratory, science

---

## 🎯 Asset Matching System

### How Assets Are Selected

1. **Scene Analysis**: The system analyzes the script and identifies key concepts
2. **Topic Detection**: Infers the main topic (e.g., "photosynthesis", "human skeleton")
3. **Concept Extraction**: Extracts key concepts from each sentence
4. **Asset Search**: Searches for assets matching these concepts
5. **Relevance Scoring**: Scores each asset based on:
   - Exact match: 0.8-1.0
   - Related concept: 0.5-0.7
   - Generic match: 0.2-0.4
6. **Selection**: Chooses the highest-scoring asset
7. **Fallback**: Uses built-in SVG glyph if no asset matches

### Example: Photosynthesis

**Script**: "Plants use sunlight to make food through a process called photosynthesis."

**Key Concepts**: plants, sunlight, food, photosynthesis

**Asset Selection**:
1. Search for "photosynthesis" → No direct match
2. Search for "plant" → Found: `leaf`, `plant` icons
3. Search for "sunlight" → Found: `sun` icon
4. Search for "food" → Found: `apple` icon
5. **Result**: Uses `leaf` or `plant` as the primary visual

---

## 📦 File Size Limits

- **Maximum File Size**: 400 KB per file
- **Reason**: Larger files are skipped to prevent bloating the storyboard JSON
- **Recommendation**: Use SVG for complex illustrations (smaller file size)

---

## 🔄 Caching

- **Cache Duration**: 15 seconds
- **Behavior**: The folder is re-scanned automatically when files change
- **Manual Refresh**: Restart the backend to force immediate re-scan

---

## 💡 Best Practices

### Naming Files
1. **Use descriptive names**: `photosynthesis-diagram.svg` not `img1.svg`
2. **Use hyphens or underscores**: `water-cycle.svg` or `water_cycle.svg`
3. **Avoid stop words**: Don't include "icon", "image", "final", "v2"
4. **Use folder structure**: `biology/cell.svg` for better organization
5. **Keep it simple**: Short, descriptive names work best

### Organizing Assets
```
assets/
├── characters/
│   ├── teacher-blue.svg
│   ├── teacher-green.svg
│   └── student.svg
├── backgrounds/
│   ├── science-lab.svg
│   ├── space.svg
│   └── nature.svg
└── diagrams/
    ├── photosynthesis.svg
    ├── water-cycle.svg
    └── solar-system.svg
```

### File Formats
- **SVG**: Best for illustrations, diagrams, icons (vector, scalable)
- **PNG**: Best for images with transparency (logos, character art)
- **JPG**: Best for photographs (no transparency needed)
- **WebP**: Best for web (good compression, supports transparency)

---

## 🎨 Adding Custom Assets

To add your own assets:

1. **Place files** in `resources/` or `assets/` directories
2. **Use descriptive names** (see naming guidelines above)
3. **Restart the backend** to refresh the cache
4. **Test** by generating a video on the matching topic

### Example: Adding a DNA Diagram

1. Create file: `assets/diagrams/dna-structure.svg`
2. Make sure it's a valid SVG file
3. Keep file size under 400 KB
4. Restart backend: `npm run start:backend`
5. Generate a video about "DNA" or "genetics"
6. The system should automatically use your DNA diagram!

---

## 🔍 Debugging Asset Selection

### Check What Assets Are Loaded
```bash
# List all loaded assets
curl http://localhost:3001/api/health
# Look for asset count in response
```

### Force Asset Rescan
```bash
# Restart the backend
touch packages/backend/src/services/asset.library.ts
npm run start:backend
```

### Check Matching Logic
```typescript
// In packages/backend/src/services/asset.library.ts
const assets = await assetLibrary.assets();
console.log('Loaded assets:', assets.length);
```

---

## 📚 Related Documentation

| Document | Description |
|----------|-------------|
| `README.md` | Main documentation, setup, usage |
| `progress.md` | Progress tracking (85% complete) |
| `dev.md` | Development plan and status |
| `project.md` | Project overview and structure |
| `e2e/VERIFICATION.md` | End-to-end testing |

---

## 🎉 Summary

The **asset system** in Anupam Classes 2.0 has been **significantly enhanced** with:
- ✅ **9 new SVG assets** (5 characters + 4 backgrounds)
- ✅ **32 object types** (was 19)
- ✅ **Semantic matching** (context-aware selection)
- ✅ **Validation system** (relevance scoring)
- ✅ **Better organization** (assets/ directory structure)

**Total Assets**: 651 files (642 PNGs + 9 SVGs)

The system now provides **professional-quality visuals** that match the educational content!

---

**Last Updated**: 2026-11-22  
**Version**: 2.0 (Enhanced)

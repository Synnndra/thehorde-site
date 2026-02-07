# Create an Orc — PFP Generator

## Overview
A page at `/create-orc` where users build a custom Orc profile picture by selecting traits layer by layer. Each trait category (background, skin, armor, weapon, helm, etc.) has multiple options matching the actual Orc NFT collection. Users can also randomize, then export the result as a PFP image for social media.

## How It Works

1. **Select traits** — pick options for each layer category from dropdown/thumbnail selectors
2. **Live preview** — canvas composites all selected layers in real-time as you pick
3. **Randomize** — click to randomly generate a full Orc from all available traits
4. **Export** — download as PNG in multiple formats (square, circle crop, with/without border)

## Page Layout

```
+-------------------------------------------------------+
|  [Site Nav Bar]                                        |
+-------------------------------------------------------+
|                                                        |
|   CREATE YOUR ORC                                      |
|                                                        |
|   +------------------+   +-------------------------+   |
|   |                  |   |  Trait Selectors         |   |
|   |   Live Preview   |   |                         |   |
|   |   (Canvas)       |   |  Background: [v]        |   |
|   |                  |   |  Skin:       [v]        |   |
|   |   500x500px      |   |  Eyes:       [v]        |   |
|   |                  |   |  Mouth:      [v]        |   |
|   |                  |   |  Armor:      [v]        |   |
|   |                  |   |  Weapon:     [v]        |   |
|   |                  |   |  Helm:       [v]        |   |
|   |                  |   |  Accessory:  [v]        |   |
|   +------------------+   |                         |   |
|                          |  [Randomize]             |   |
|   Export Options:        |  [Clear All]             |   |
|   [Square] [Circle]     +-------------------------+   |
|   [With Border]                                       |
|   [Download PNG]                                      |
|                                                        |
+-------------------------------------------------------+
```

- **Left:** Canvas preview showing the composited Orc (all layers stacked)
- **Right:** Trait selectors — one per layer category, each showing thumbnail previews of available options
- **Bottom:** Export controls

### Mobile Layout
Stacks vertically: preview on top, trait selectors below, export at bottom. Trait selectors become horizontal scrollable thumbnail strips.

## Trait Layer System

### Layer Order (bottom to top)
Layers are composited in this order on the canvas. Each layer is a transparent PNG that stacks on top of the previous:

```
1. Background    (full canvas, no transparency)
2. Skin          (base Orc body)
3. Eyes          (eye style/color)
4. Mouth         (expression)
5. Armor         (body armor overlay)
6. Weapon        (held weapon)
7. Helm          (headgear)
8. Accessory     (extra items — earrings, scars, etc.)
```

**Note:** The exact categories and their order will be determined by the layer art provided. The system is built to be data-driven — adding/removing/reordering categories only requires updating a config file, not code changes.

### Trait Config (`create-orc/traits.js`)
```js
var ORC_TRAITS = {
    layers: [
        {
            id: 'background',
            name: 'Background',
            required: true,
            options: [
                { id: 'red', name: 'Red', file: 'background/red.png' },
                { id: 'blue', name: 'Blue', file: 'background/blue.png' },
                { id: 'green', name: 'Green', file: 'background/green.png' },
                // ... all background options
            ]
        },
        {
            id: 'skin',
            name: 'Skin',
            required: true,
            options: [
                { id: 'green_skin', name: 'Green', file: 'skin/green.png' },
                { id: 'brown_skin', name: 'Brown', file: 'skin/brown.png' },
                // ...
            ]
        },
        // ... more layers
    ]
};
```

This config drives everything — the UI, the layer compositing order, and which options are available. When new art is added, just add entries here.

### Asset Directory Structure
```
create-orc/
  assets/
    background/
      red.png
      blue.png
      green.png
      ...
    skin/
      green.png
      brown.png
      ...
    eyes/
      angry.png
      glowing.png
      ...
    mouth/
      grin.png
      fangs.png
      ...
    armor/
      none.png
      leather.png
      plate.png
      ...
    weapon/
      none.png
      axe.png
      sword.png
      ...
    helm/
      none.png
      horned.png
      crown.png
      ...
    accessory/
      none.png
      earring.png
      scar.png
      ...
```

All PNGs should be the same dimensions (e.g. 500x500) with transparency so they stack cleanly.

## Canvas Compositing

### How Layers Stack
```js
function renderOrc(canvas, selections) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each layer in order
    ORC_TRAITS.layers.forEach(function(layer) {
        var selected = selections[layer.id];
        if (selected && selected.image) {
            ctx.drawImage(selected.image, 0, 0, canvas.width, canvas.height);
        }
    });
}
```

### Image Preloading
All trait images are preloaded on page load (or lazily as categories are opened). A loading bar shows progress. Images are cached in memory so switching traits feels instant.

## Trait Selectors

### Selector UI
Each trait category shows as a collapsible section with thumbnail previews:

```
Background                              [v]
+------+  +------+  +------+  +------+
| Red  |  | Blue |  |Green |  |Purple|
|[img] |  |[img] |  |[img] |  |[img] |
+------+  +------+  +------+  +------+

Skin                                    [v]
+------+  +------+  +------+
|Green |  |Brown |  | Grey |
|[img] |  |[img] |  |[img] |
+------+  +------+  +------+
```

- Click a thumbnail to select it (gold border highlights selection)
- "None" option for non-required layers (weapon, helm, accessory)
- Currently selected trait name shown next to category name

### Randomize Button
Picks a random option for every layer and updates the preview. Clicking again re-rolls everything.

### Clear All Button
Resets all optional layers to "None", keeps required layers (background, skin) on their first option.

## Export Options

### Download Formats
1. **Square PNG** — raw canvas output (500x500 or 1000x1000 for high-res)
2. **Circle Crop** — circular mask applied, transparent corners, good for Discord/X PFPs
3. **With Border** — adds a gold (#c9a227) border frame around the image (square or circle)

### Export Flow
```js
function exportOrc(format) {
    var exportCanvas = document.createElement('canvas');
    var size = 1000; // high-res export
    exportCanvas.width = size;
    exportCanvas.height = size;
    var ctx = exportCanvas.getContext('2d');

    // Render full Orc at export size
    renderOrc(exportCanvas, currentSelections);

    if (format === 'circle') {
        applyCircleMask(ctx, size);
    }
    if (format === 'border') {
        drawBorder(ctx, size, '#c9a227', 8);
    }

    // Trigger download
    var link = document.createElement('a');
    link.download = 'my-orc.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}
```

### Share to X
Optional "Share to X" button that opens a tweet compose window with a message like "I created my Orc on @midhorde! 🏴" — the user would need to manually attach the downloaded image since the X API doesn't support image uploads from client-side.

## File Structure

```
create-orc/
  index.html          Page markup
  style.css           Page styles
  app.js              Main logic (canvas rendering, trait selection, export)
  traits.js           Trait config (layer definitions, options, file paths)
  assets/
    background/       Background layer PNGs
    skin/             Skin layer PNGs
    eyes/             Eye layer PNGs
    mouth/            Mouth layer PNGs
    armor/            Armor layer PNGs
    weapon/           Weapon layer PNGs
    helm/             Helm layer PNGs
    accessory/        Accessory layer PNGs
```

No backend/API needed — everything runs client-side with canvas.

## Nav & Home Page Updates

### Site Nav
Add "Create" link to the nav bar on all pages:
```html
<a href="/create-orc">Create</a>
```

### Home Page
Add a portal button:
```html
<a href="/create-orc" class="portal-btn">
    <span class="btn-icon">🎨</span>
    <span class="btn-text">Create an Orc</span>
</a>
```

## Implementation Order

1. **Page scaffold** — HTML/CSS layout with preview canvas and selector placeholders
2. **Trait config** — `traits.js` with layer definitions (populate once art is ready)
3. **Image preloading** — load all trait PNGs with progress bar
4. **Canvas compositing** — render selected layers in order
5. **Trait selectors** — thumbnail grid UI, click to select, gold highlight
6. **Randomize** — random selection across all layers
7. **Export** — square PNG download at high resolution
8. **Circle crop + border** — additional export formats
9. **Mobile responsive** — stacked layout, horizontal scroll selectors
10. **Nav updates** — add "Create" to site nav and home page

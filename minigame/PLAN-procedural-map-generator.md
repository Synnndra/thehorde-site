# Procedural Map Generator for Horde Defense

## Overview
Add random map generation that creates playable maps each game with configurable difficulty.

## Files to Create/Modify

| File | Action |
|------|--------|
| `minigame/mapGenerator.js` | **CREATE** - All procedural generation code |
| `minigame/game.js` | Modify `startGame()` to use generator |
| `minigame/index.html` | Add script tag + random map buttons |

## Algorithm: Constrained Random Walk

1. Place tavern (center for hard, edge for easy)
2. Place spawn points on opposite edges
3. Generate winding paths using scored random walk
4. For medium/hard: paths merge before tavern
5. Mark path cells (2) in buildableAreas grid
6. Add optional water features (3)
7. Validate map has enough buildable space

## Difficulty Configuration

```
Easy:   1 spawn, long winding path (35-50 cells), tavern on far edge
Medium: 2 spawns, paths merge at 60%, moderate length (25-40 cells)
Hard:   3 spawns, paths merge at 40%, shorter paths (15-25 cells)
```

## Key Functions in mapGenerator.js

```javascript
generateProceduralMap(difficulty)       // Main entry point - returns map object
generatePath(start, end, config, grid)  // Create single path with waypoints
scoreDirection(current, dir, end, ...)  // Score movement choices for interesting paths
markSegmentOnGrid(from, to, grid)       // Bresenham's line algorithm for path cells
calculateMergePoint(spawns, tavern)     // Where multi-paths join together
addWaterFeatures(grid, paths)           // Optional decorative water pools
validateMap(grid, paths)                // Ensure playability (enough buildable space)
```

## Path Generation Algorithm

```javascript
function generatePath(start, end, config, grid) {
    const waypoints = [start];
    let current = start;
    let pathLength = 0;
    let lastDirection = null;

    while (pathLength < config.minPathLength || distance(current, end) > 3) {
        // Score each direction based on:
        // - Moving toward goal (gradual approach)
        // - Favor turns over straight lines (interesting paths)
        // - Avoid backtracking
        // - Avoid overlapping existing paths

        const direction = selectWeightedRandom(scoredDirections);
        const segmentLength = random(2, 4);  // Walk 2-4 cells

        current = moveInDirection(current, direction, segmentLength);
        waypoints.push(current);
        markSegmentOnGrid(previous, current, grid);
        pathLength += segmentLength;
        lastDirection = direction;
    }

    waypoints.push(end);
    return waypoints;
}
```

## Game.js Integration

In `startGame()` around line 540, add before `this.currentMap = MAPS[this.selectedMap]`:

```javascript
// Check if using procedural map
if (this.selectedMap.startsWith('random_')) {
    const difficulty = this.selectedMap.split('_')[1];
    this.currentMap = generateProceduralMap(difficulty);
} else {
    this.currentMap = MAPS[this.selectedMap];
}
```

## UI Changes (index.html)

Add random map buttons to map selection area:

```html
<div class="random-maps">
    <h4>Random Maps</h4>
    <button class="map-btn" data-map="random_easy">Random Easy</button>
    <button class="map-btn" data-map="random_medium">Random Medium</button>
    <button class="map-btn" data-map="random_hard">Random Hard</button>
</div>
```

Add script tag:
```html
<script src="mapGenerator.js"></script>
```

## Output Map Structure

The generator returns a map object matching the existing format:

```javascript
{
    name: "Random Easy",
    difficulty: "easy",
    description: "Procedurally generated map",
    gridWidth: 20,
    gridHeight: 15,
    paths: [[{x,y}, {x,y}, ...]],           // Waypoint arrays
    buildableAreas: [[1,1,2,1,...], ...],   // 15 rows x 20 cols
    tavernPosition: {x: 19, y: 7},
    spawnPoints: [{x: 0, y: 7}],
    pathColor: '#3d2817',
    groundColor: '#1a2f1a'
}
```

## Verification Steps

1. Open game in browser
2. Select "Random Easy" - verify single winding path generated
3. Select "Random Medium" - verify 2 paths that merge
4. Select "Random Hard" - verify 3 paths that merge
5. Play each difficulty - enemies should follow paths correctly
6. Verify towers can only be placed on grass cells (1)
7. Refresh page and verify different map generates each time
8. Check that paths are interesting (have turns, not straight lines)

## Notes

- Each game refresh = new random map
- Validation ensures at least 60% of cells are buildable
- If generation fails validation, it retries automatically
- Water features are optional visual variety (don't affect gameplay)

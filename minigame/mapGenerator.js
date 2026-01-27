// mapGenerator.js - Procedural map generation for Horde Defense

const DIFFICULTY_CONFIG = {
    easy: {
        spawnCount: 1,
        minPathLength: 35,
        maxPathLength: 50,
        turnFrequency: 0.7,
        waterFeatures: true,
        tavernPosition: 'edge',
        mergePoint: null
    },
    medium: {
        spawnCount: 2,
        minPathLength: 25,
        maxPathLength: 40,
        turnFrequency: 0.5,
        waterFeatures: true,
        tavernPosition: 'center-right',
        mergePoint: 0.6
    },
    hard: {
        spawnCount: 3,
        minPathLength: 15,
        maxPathLength: 25,
        turnFrequency: 0.3,
        waterFeatures: false,
        tavernPosition: 'center',
        mergePoint: 0.4
    }
};

// Create empty grid filled with grass (1)
function createEmptyGrid(width, height) {
    const grid = [];
    for (let y = 0; y < height; y++) {
        grid.push(new Array(width).fill(1));
    }
    return grid;
}

// Place tavern based on difficulty
function placeTavern(position, gridWidth, gridHeight) {
    switch (position) {
        case 'edge':
            return { x: gridWidth - 1, y: Math.floor(gridHeight / 2) };
        case 'center-right':
            return { x: Math.floor(gridWidth * 0.75), y: Math.floor(gridHeight / 2) };
        case 'center':
            return { x: Math.floor(gridWidth / 2), y: Math.floor(gridHeight / 2) };
        default:
            return { x: gridWidth - 1, y: Math.floor(gridHeight / 2) };
    }
}

// Place spawn points on edges opposite to tavern
function placeSpawnPoints(count, tavern, gridWidth, gridHeight) {
    const spawns = [];
    const margin = 2;

    if (count === 1) {
        // Single spawn on left edge
        spawns.push({ x: 0, y: Math.floor(gridHeight / 2) });
    } else if (count === 2) {
        // Two spawns on left edge, spread vertically
        spawns.push({ x: 0, y: Math.floor(gridHeight * 0.3) });
        spawns.push({ x: 0, y: Math.floor(gridHeight * 0.7) });
    } else if (count === 3) {
        // Three spawns: left, top, bottom
        spawns.push({ x: 0, y: Math.floor(gridHeight / 2) });
        spawns.push({ x: Math.floor(gridWidth / 2), y: 0 });
        spawns.push({ x: Math.floor(gridWidth / 2), y: gridHeight - 1 });
    }

    return spawns;
}

// Calculate merge point for multi-path maps
function calculateMergePoint(spawnPoints, tavern, mergeRatio) {
    const centroidX = spawnPoints.reduce((sum, p) => sum + p.x, 0) / spawnPoints.length;
    const centroidY = spawnPoints.reduce((sum, p) => sum + p.y, 0) / spawnPoints.length;

    return {
        x: Math.round(centroidX + (tavern.x - centroidX) * mergeRatio),
        y: Math.round(centroidY + (tavern.y - centroidY) * mergeRatio)
    };
}

// Manhattan distance
function manhattanDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Clamp value to range
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Score a direction for path generation
function scoreDirection(current, dir, end, lastDir, config, grid, pathLength, gridWidth, gridHeight) {
    const testX = current.x + dir.dx * 3;
    const testY = current.y + dir.dy * 3;

    // Out of bounds - invalid
    if (testX < 1 || testX > gridWidth - 2 || testY < 1 || testY > gridHeight - 2) {
        return 0;
    }

    // Check if we'd overlap existing path (unless near end)
    if (pathLength < config.minPathLength * 0.8) {
        const checkX = clamp(testX, 0, gridWidth - 1);
        const checkY = clamp(testY, 0, gridHeight - 1);
        if (grid[checkY][checkX] === 2) {
            return 0;
        }
    }

    let score = 10;

    // Favor directions that approach the end
    const currentDist = manhattanDistance(current, end);
    const newDist = manhattanDistance({ x: testX, y: testY }, end);
    if (newDist < currentDist) {
        score += 5;
    }

    // Favor turns for interesting paths
    if (lastDir && (dir.dx !== lastDir.dx || dir.dy !== lastDir.dy)) {
        score += config.turnFrequency * 10;
    }

    // Penalize going backward
    if (lastDir && dir.dx === -lastDir.dx && dir.dy === -lastDir.dy) {
        score = 1;
    }

    return score;
}

// Weighted random selection
function weightedRandomSelect(candidates) {
    const totalWeight = candidates.reduce((sum, c) => sum + c.score, 0);
    let random = Math.random() * totalWeight;

    for (const candidate of candidates) {
        random -= candidate.score;
        if (random <= 0) {
            return candidate;
        }
    }
    return candidates[candidates.length - 1];
}

// Mark a line segment on the grid using Bresenham's algorithm
function markSegmentOnGrid(from, to, grid) {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let err = dx - dy;
    let x = from.x;
    let y = from.y;

    const gridHeight = grid.length;
    const gridWidth = grid[0].length;

    while (true) {
        if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
            grid[y][x] = 2;
        }

        if (x === to.x && y === to.y) break;

        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
}

// Generate a single path from start to end
function generatePath(start, end, config, grid, gridWidth, gridHeight) {
    const waypoints = [{ x: start.x, y: start.y }];
    let current = { x: start.x, y: start.y };
    let pathLength = 0;
    let lastDirection = null;
    let iterations = 0;
    const maxIterations = 200;

    const directions = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
    ];

    while (iterations < maxIterations) {
        iterations++;
        const distToEnd = manhattanDistance(current, end);

        // Check if we should finish
        if (pathLength >= config.minPathLength && distToEnd <= 3) {
            break;
        }

        // Prevent infinite paths
        if (pathLength > config.maxPathLength) {
            break;
        }

        // Score each direction
        const candidates = directions
            .map(dir => ({
                dir,
                score: scoreDirection(current, dir, end, lastDirection, config, grid, pathLength, gridWidth, gridHeight)
            }))
            .filter(c => c.score > 0);

        let selected;
        if (candidates.length === 0) {
            // Stuck - force toward end
            const dx = end.x - current.x;
            const dy = end.y - current.y;
            selected = {
                dir: Math.abs(dx) > Math.abs(dy)
                    ? { dx: dx > 0 ? 1 : -1, dy: 0 }
                    : { dx: 0, dy: dy > 0 ? 1 : -1 },
                score: 1
            };
        } else {
            selected = weightedRandomSelect(candidates);
        }

        // Determine segment length
        const segmentLength = 2 + Math.floor(Math.random() * 3);

        // Calculate new position
        const newX = clamp(current.x + selected.dir.dx * segmentLength, 1, gridWidth - 2);
        const newY = clamp(current.y + selected.dir.dy * segmentLength, 1, gridHeight - 2);
        const newPoint = { x: newX, y: newY };

        // Mark cells on grid
        markSegmentOnGrid(current, newPoint, grid);

        pathLength += Math.abs(newPoint.x - current.x) + Math.abs(newPoint.y - current.y);

        // Only add waypoint if we actually moved
        if (newPoint.x !== current.x || newPoint.y !== current.y) {
            waypoints.push({ x: newPoint.x, y: newPoint.y });
            current = newPoint;
            lastDirection = selected.dir;
        }
    }

    // Add final waypoint to end
    if (current.x !== end.x || current.y !== end.y) {
        markSegmentOnGrid(current, end, grid);
        waypoints.push({ x: end.x, y: end.y });
    }

    return waypoints;
}

// Add water features for visual variety
function addWaterFeatures(grid, paths) {
    const gridHeight = grid.length;
    const gridWidth = grid[0].length;
    const poolCount = 2 + Math.floor(Math.random() * 2); // 2-3 pools

    for (let i = 0; i < poolCount; i++) {
        let attempts = 0;
        while (attempts < 100) {
            const x = 1 + Math.floor(Math.random() * (gridWidth - 4));
            const y = 1 + Math.floor(Math.random() * (gridHeight - 4));

            // Check if area is clear (not on path)
            let isValid = true;
            for (let cy = 0; cy < 3 && isValid; cy++) {
                for (let cx = 0; cx < 3 && isValid; cx++) {
                    const checkX = x + cx;
                    const checkY = y + cy;
                    if (checkY >= gridHeight || checkX >= gridWidth) {
                        isValid = false;
                    } else if (grid[checkY][checkX] !== 1) {
                        isValid = false; // On path or water already
                    }
                }
            }

            if (isValid) {
                // Create pool (2x2 to 3x3)
                const size = 2 + Math.floor(Math.random() * 2);
                for (let dy = 0; dy < size; dy++) {
                    for (let dx = 0; dx < size; dx++) {
                        const wx = x + dx;
                        const wy = y + dy;
                        if (wx < gridWidth && wy < gridHeight && grid[wy][wx] === 1) {
                            grid[wy][wx] = 3;
                        }
                    }
                }
                break;
            }
            attempts++;
        }
    }
}

// Validate the generated map
function validateMap(grid, paths) {
    const gridHeight = grid.length;
    const gridWidth = grid[0].length;

    // Count buildable cells
    let buildableCount = 0;
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            if (grid[y][x] === 1) buildableCount++;
        }
    }

    // Require at least 55% buildable
    if (buildableCount < gridWidth * gridHeight * 0.55) {
        return false;
    }

    // Verify all paths have minimum length
    for (const path of paths) {
        if (path.length < 3) return false;
    }

    return true;
}

// Calculate path length for a waypoint array
function calculatePathLength(path) {
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

// Main generation function
function generateProceduralMap(difficulty, maxAttempts = 10) {
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
    const gridWidth = 20;
    const gridHeight = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const grid = createEmptyGrid(gridWidth, gridHeight);

        // Place tavern
        const tavern = placeTavern(config.tavernPosition, gridWidth, gridHeight);

        // Place spawn points
        const spawnPoints = placeSpawnPoints(config.spawnCount, tavern, gridWidth, gridHeight);

        // Calculate merge point for multi-path maps
        const mergePoint = config.mergePoint
            ? calculateMergePoint(spawnPoints, tavern, config.mergePoint)
            : null;

        // Generate paths
        const paths = [];

        for (let i = 0; i < spawnPoints.length; i++) {
            const spawn = spawnPoints[i];
            const target = mergePoint || tavern;

            const path = generatePath(spawn, target, config, grid, gridWidth, gridHeight);
            paths.push(path);
        }

        // If merging, add shared path from merge to tavern
        if (mergePoint) {
            const sharedPath = generatePath(mergePoint, tavern, config, grid, gridWidth, gridHeight);

            // Append shared segment to all paths
            for (let i = 0; i < paths.length; i++) {
                // Skip the first point of shared path (it's the merge point already in path)
                paths[i] = paths[i].concat(sharedPath.slice(1));
            }
        }

        // Add water features
        if (config.waterFeatures) {
            addWaterFeatures(grid, paths);
        }

        // Validate
        if (validateMap(grid, paths)) {
            const difficultyNames = {
                easy: 'Easy',
                medium: 'Medium',
                hard: 'Hard'
            };

            return {
                name: `Random ${difficultyNames[difficulty]}`,
                difficulty: difficulty,
                description: `Procedurally generated ${difficulty} map`,
                gridWidth: gridWidth,
                gridHeight: gridHeight,
                paths: paths,
                buildableAreas: grid,
                tavernPosition: tavern,
                spawnPoints: spawnPoints,
                pathColor: '#3d2817',
                groundColor: '#1a2f1a'
            };
        }
    }

    // Fallback to a simple generated map if all attempts fail
    console.warn('Map generation failed, using fallback');
    return generateFallbackMap(difficulty);
}

// Simple fallback map if generation fails
function generateFallbackMap(difficulty) {
    const gridWidth = 20;
    const gridHeight = 15;
    const grid = createEmptyGrid(gridWidth, gridHeight);

    // Simple L-shaped path
    const path = [
        { x: 0, y: 7 },
        { x: 8, y: 7 },
        { x: 8, y: 3 },
        { x: 15, y: 3 },
        { x: 15, y: 7 },
        { x: 19, y: 7 }
    ];

    // Mark path on grid
    for (let i = 0; i < path.length - 1; i++) {
        markSegmentOnGrid(path[i], path[i + 1], grid);
    }

    return {
        name: `Random ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
        difficulty: difficulty,
        description: 'Fallback map',
        gridWidth: gridWidth,
        gridHeight: gridHeight,
        paths: [path],
        buildableAreas: grid,
        tavernPosition: { x: 19, y: 7 },
        spawnPoints: [{ x: 0, y: 7 }],
        pathColor: '#3d2817',
        groundColor: '#1a2f1a'
    };
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateProceduralMap, DIFFICULTY_CONFIG };
}

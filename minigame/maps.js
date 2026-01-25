// maps.js - Map definitions and path data for Horde Defense

const MAPS = {
    tavern_road: {
        name: "Tavern Road",
        difficulty: "easy",
        description: "A single winding path leads to Merlin's Beard",
        gridWidth: 20,
        gridHeight: 15,
        // Path waypoints (enemies follow these points)
        paths: [
            [
                { x: 0, y: 7 },
                { x: 3, y: 7 },
                { x: 3, y: 3 },
                { x: 7, y: 3 },
                { x: 7, y: 11 },
                { x: 11, y: 11 },
                { x: 11, y: 5 },
                { x: 15, y: 5 },
                { x: 15, y: 9 },
                { x: 19, y: 9 }
            ]
        ],
        // Tower placement grid (1 = buildable, 0 = blocked, 2 = path)
        buildableAreas: [
            [0,0,0,0,1,1,1,0,0,0,1,1,1,1,1,0,0,1,1,0],
            [0,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,0],
            [0,1,1,0,0,0,0,0,1,1,1,0,0,0,1,0,1,1,1,0],
            [0,1,1,2,2,2,2,2,1,1,1,0,1,1,1,0,1,1,1,0],
            [0,1,1,0,1,1,1,2,1,1,1,0,1,1,1,0,0,0,0,0],
            [0,1,1,0,1,1,1,2,1,1,1,2,2,2,2,2,1,1,1,0],
            [0,0,0,0,1,1,1,2,1,1,1,2,1,1,1,2,1,1,1,0],
            [2,2,2,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,1,0],
            [0,1,1,0,1,1,1,2,1,1,1,2,1,1,1,2,1,1,1,0],
            [0,1,1,0,1,1,1,2,2,2,2,2,1,1,1,2,2,2,2,2],
            [0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0],
            [0,1,1,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,1,1,1,1,1,1,0,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ],
        // Tavern position (end point)
        tavernPosition: { x: 19, y: 9 },
        // Spawn points
        spawnPoints: [{ x: 0, y: 7 }],
        // Background color for path
        pathColor: '#3d2817',
        groundColor: '#1a2f1a'
    },

    forest_ambush: {
        name: "Forest Ambush",
        difficulty: "medium",
        description: "Split paths through the dark forest that merge near the tavern",
        gridWidth: 20,
        gridHeight: 15,
        paths: [
            // Upper path
            [
                { x: 0, y: 3 },
                { x: 5, y: 3 },
                { x: 5, y: 1 },
                { x: 10, y: 1 },
                { x: 10, y: 5 },
                { x: 15, y: 5 },
                { x: 15, y: 7 },
                { x: 19, y: 7 }
            ],
            // Lower path
            [
                { x: 0, y: 11 },
                { x: 5, y: 11 },
                { x: 5, y: 13 },
                { x: 10, y: 13 },
                { x: 10, y: 9 },
                { x: 15, y: 9 },
                { x: 15, y: 7 },
                { x: 19, y: 7 }
            ]
        ],
        buildableAreas: [
            [0,0,0,0,0,0,1,1,1,1,0,1,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,0,0,0,0,0,2,1,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,2,1,1,1,1,0,1,1,1,0],
            [2,2,2,2,2,2,1,1,1,1,2,1,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,2,1,1,1,1,0,0,0,0,0],
            [0,1,1,1,1,0,1,1,1,1,2,2,2,2,2,2,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,0,1,1,1,1,2,1,1,1,0],
            [0,0,0,0,0,0,1,1,1,1,0,1,1,1,1,2,2,2,2,2],
            [0,1,1,1,1,0,1,1,1,1,0,1,1,1,1,2,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,2,2,2,2,2,2,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,2,1,1,1,1,0,0,0,0,0],
            [2,2,2,2,2,2,1,1,1,1,2,1,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,0,1,1,1,1,2,1,1,1,1,0,1,1,1,0],
            [0,1,1,1,1,0,0,0,0,0,2,1,1,1,1,0,1,1,1,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ],
        tavernPosition: { x: 19, y: 7 },
        spawnPoints: [
            { x: 0, y: 3 },
            { x: 0, y: 11 }
        ],
        pathColor: '#2d1f0f',
        groundColor: '#0f1f0f'
    },

    castle_siege: {
        name: "Castle Siege",
        difficulty: "hard",
        description: "Multiple entry points - the knights attack from all sides!",
        gridWidth: 20,
        gridHeight: 15,
        paths: [
            // Left path
            [
                { x: 0, y: 7 },
                { x: 4, y: 7 },
                { x: 4, y: 5 },
                { x: 8, y: 5 },
                { x: 8, y: 7 },
                { x: 10, y: 7 }
            ],
            // Top path
            [
                { x: 10, y: 0 },
                { x: 10, y: 3 },
                { x: 8, y: 3 },
                { x: 8, y: 5 },
                { x: 10, y: 5 },
                { x: 10, y: 7 }
            ],
            // Bottom path
            [
                { x: 10, y: 14 },
                { x: 10, y: 11 },
                { x: 8, y: 11 },
                { x: 8, y: 9 },
                { x: 10, y: 9 },
                { x: 10, y: 7 }
            ],
            // Right path (reinforcements)
            [
                { x: 19, y: 7 },
                { x: 15, y: 7 },
                { x: 15, y: 5 },
                { x: 12, y: 5 },
                { x: 12, y: 7 },
                { x: 10, y: 7 }
            ]
        ],
        buildableAreas: [
            [0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0],
            [0,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0],
            [0,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0],
            [0,1,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,1,0],
            [0,0,0,0,0,1,1,1,2,1,1,1,0,0,0,0,1,1,1,0],
            [0,1,1,1,0,0,0,0,2,1,1,1,2,2,2,0,1,1,1,0],
            [0,1,1,1,2,1,1,1,2,1,1,1,2,1,1,0,0,0,0,0],
            [2,2,2,2,2,1,1,1,2,2,2,2,2,1,1,2,2,2,2,2],
            [0,1,1,1,2,1,1,1,2,1,1,1,2,1,1,0,0,0,0,0],
            [0,1,1,1,0,0,0,0,2,1,1,1,2,2,2,0,1,1,1,0],
            [0,0,0,0,0,1,1,1,2,1,1,1,0,0,0,0,1,1,1,0],
            [0,1,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,1,0],
            [0,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0],
            [0,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0],
            [0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0]
        ],
        tavernPosition: { x: 10, y: 7 },
        spawnPoints: [
            { x: 0, y: 7 },
            { x: 10, y: 0 },
            { x: 10, y: 14 },
            { x: 19, y: 7 }
        ],
        pathColor: '#4a3728',
        groundColor: '#1f1a15'
    }
};

// Helper function to get path segments for rendering
function getPathSegments(mapId) {
    const map = MAPS[mapId];
    if (!map) return [];

    const segments = [];
    map.paths.forEach(path => {
        for (let i = 0; i < path.length - 1; i++) {
            segments.push({
                start: path[i],
                end: path[i + 1]
            });
        }
    });
    return segments;
}

// Calculate distance along a path
function getPathLength(path) {
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

// Get position along path given distance traveled
function getPositionOnPath(path, distance) {
    let traveled = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);

        if (traveled + segmentLength >= distance) {
            const remaining = distance - traveled;
            const ratio = remaining / segmentLength;
            return {
                x: path[i].x + dx * ratio,
                y: path[i].y + dy * ratio,
                angle: Math.atan2(dy, dx)
            };
        }
        traveled += segmentLength;
    }

    // Return end position if distance exceeds path length
    const lastPoint = path[path.length - 1];
    return {
        x: lastPoint.x,
        y: lastPoint.y,
        angle: 0,
        finished: true
    };
}

// Check if a grid cell is buildable
function isBuildable(mapId, gridX, gridY) {
    const map = MAPS[mapId];
    if (!map) return false;

    if (gridX < 0 || gridX >= map.gridWidth || gridY < 0 || gridY >= map.gridHeight) {
        return false;
    }

    return map.buildableAreas[gridY][gridX] === 1;
}

// Convert grid coordinates to canvas coordinates
function gridToCanvas(gridX, gridY, cellSize) {
    return {
        x: gridX * cellSize + cellSize / 2,
        y: gridY * cellSize + cellSize / 2
    };
}

// Convert canvas coordinates to grid coordinates
function canvasToGrid(canvasX, canvasY, cellSize) {
    return {
        x: Math.floor(canvasX / cellSize),
        y: Math.floor(canvasY / cellSize)
    };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MAPS, getPathSegments, getPathLength, getPositionOnPath, isBuildable, gridToCanvas, canvasToGrid };
}

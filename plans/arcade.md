# The Horde Arcade

## Overview
An arcade section at `/arcade` with 6 MidEvils-themed games. Horde Defense (currently at `/minigame`) moves here as game #1. All games have per-game leaderboards plus a combined overall leaderboard. Every game grants an Orc NFT holder bonus.

## Games

### 1. Horde Defense (Tower Defense) — existing, moves from `/minigame`
The existing tower defense game. Defend Merlin's Beard tavern across 20 waves. Place Orc defenders, upgrade them, survive boss waves.
- **NFT Bonus:** +5% damage per Orc held (max 25%)
- **Leaderboard:** Score based on kills, waves, gold, speed bonus, difficulty multiplier

### 2. Orc Smash (Breakout/Brick Breaker)
Bounce a flaming boulder to smash waves of knight shields. Orc-themed power-ups drop from broken bricks.
- **Gameplay:** Paddle at bottom, ball bounces off bricks arranged in formations. Bricks have HP (squires = 1 hit, knights = 2, armored = 3). Power-ups: multi-ball, fireball (pierces), wide paddle, slow ball, extra life
- **Levels:** 20 levels with increasing brick density and tougher brick types. Boss levels every 5 (a moving shield wall)
- **Scoring:** Points per brick (scaled by type), combo multiplier for consecutive hits without paddle touch, level completion bonus, lives remaining bonus
- **NFT Bonus:** +5% score multiplier per Orc held (max 25%)

### 3. Orc Run (Endless Runner)
Side-scrolling endless runner. Your Orc charges through Midland, jumping over obstacles, sliding under barriers, and collecting gold.
- **Gameplay:** Auto-scrolling left-to-right. Tap/click to jump, hold for higher jump, swipe down/click to slide. Obstacles: fences, pits, fallen trees, knight patrols. Collectibles: gold coins, health potions, speed boosts
- **Difficulty Scaling:** Speed increases over time. More complex obstacle patterns. Knight archers appear at higher distances
- **Scoring:** Distance traveled + gold collected + enemies dodged. Milestone bonuses every 500m
- **NFT Bonus:** +5% speed boost threshold per Orc (max 25% — you can run faster before it becomes uncontrollable)

### 4. Midland Memory (Memory Match)
Flip cards to match pairs of MidEvils characters, traits, and items. Timed rounds with increasing grid sizes.
- **Gameplay:** Grid of face-down cards. Flip two per turn. Match = pair removed. Clear the board to advance. Timer counting down
- **Levels:** 4x3 (easy) -> 4x4 -> 5x4 -> 6x5 -> 6x6 (hard). Cards use actual MidEvils trait art (backgrounds, weapons, armor, helms)
- **Scoring:** Base points per match, time bonus for fast clears, combo bonus for consecutive matches, penalty for mismatches
- **NFT Bonus:** +5% time extension per Orc held (max 25% more time per level)

### 5. Orc Brawl (2D Fighting)
Side-scrolling beat 'em up. Your Orc fights through waves of knights in combo-based melee combat.
- **Gameplay:** Canvas-based 2D fighter. Move left/right, jump. Light attack, heavy attack, block. Chain attacks into combos (e.g. light-light-heavy = uppercut combo). Special move meter builds from landing hits — unleash a devastating Orc rage ability when full
- **Enemies:** Squires (weak, slow), Knights (block often, counter-attack), Archers (ranged, dodge backwards), Cavalry (charge attack), Mages (projectiles, teleport). Bosses every 5 waves
- **Waves:** Endless waves of increasing difficulty. More enemies per wave, tougher types introduced over time. Short rest between waves to recover some HP
- **Combo System:** 3-hit, 5-hit, 7-hit combos with increasing damage multiplier. Juggle enemies in the air for bonus points. Perfect block (block just before hit lands) stuns the attacker
- **Scoring:** Points per kill (scaled by enemy type), combo multiplier, damage taken penalty, wave completion bonus, style points for varied attacks
- **NFT Bonus:** +5% attack damage per Orc held (max 25%)

### 6. Orc Siege (Artillery/Angry Birds style)
Launch boulders from a catapult to destroy knight fortifications. Physics-based trajectory aiming.
- **Gameplay:** Drag to aim catapult (angle + power), release to fire. Boulders have physics (gravity, bounce). Destroy wooden/stone structures and the knights hiding behind them. Limited ammo per level
- **Levels:** 30 levels with increasingly complex fortifications. Wood breaks in 1 hit, stone in 2-3. Ice shatters and chains. Knights have different HP
- **Special Ammo:** Unlocked as you progress — fire boulder (burns wood), heavy boulder (extra damage), split boulder (splits into 3 mid-air)
- **Scoring:** Destruction percentage, ammo efficiency (fewer shots = more points), knight kills, level completion bonus
- **NFT Bonus:** +5% boulder damage per Orc held (max 25%)

## Architecture

### URL Structure
```
/arcade                         Arcade hub (game selection)
/arcade/horde-defense           Game 1 — Tower Defense (moved from /minigame)
/arcade/orc-smash               Game 2 — Breakout
/arcade/orc-run                 Game 3 — Endless Runner
/arcade/midland-memory          Game 4 — Memory Match
/arcade/orc-brawl                Game 5 — Fighting
/arcade/orc-siege               Game 6 — Artillery
```

The old `/minigame` path redirects to `/arcade/horde-defense` (add a redirect in `vercel.json`).

### Redirect Config (vercel.json)
```json
{
  "redirects": [
    { "source": "/minigame", "destination": "/arcade/horde-defense", "permanent": true }
  ]
}
```

### File Structure
```
arcade/
  index.html                    Arcade hub page
  style.css                     Hub page styles
  shared/
    arcade-utils.js             Shared utilities (wallet, NFT bonus, score submission)
    game-base.css               Shared game styles (screens, buttons, leaderboard, stats)

  horde-defense/
    index.html                  (moved from minigame/)
    style.css
    game.js, towers.js, enemies.js, maps.js, mapGenerator.js
    sprites.js, sounds.js, ui.js
    assets/                     (moved from minigame/assets/)

  orc-smash/
    index.html
    style.css
    game.js                     Game engine (canvas, physics, ball/paddle/bricks)
    levels.js                   Level definitions (brick layouts)
    assets/

  orc-run/
    index.html
    style.css
    game.js                     Game engine (canvas, scrolling, collision)
    obstacles.js                Obstacle patterns and spawning
    assets/

  midland-memory/
    index.html
    style.css
    game.js                     Game logic (card flipping, matching, timer)
    cards.js                    Card definitions (images, pairs)
    assets/

  orc-brawl/
    index.html
    style.css
    game.js                     Game engine (canvas, combat, physics)
    enemies.js                  Enemy types, AI, attack patterns
    combos.js                   Combo definitions and input detection
    assets/

  orc-siege/
    index.html
    style.css
    game.js                     Game engine (canvas, physics, trajectory)
    levels.js                   Level definitions (structures, knight positions)
    assets/
```

### Nav Bar Updates
- Replace "Game" link in the site-nav with "Arcade" pointing to `/arcade`
- Each game page includes the standard `shared/nav.js` + `shared/nav.css`

## Arcade Hub Page (`/arcade/index.html`)

Grid of 6 game cards, each showing:
- Game thumbnail/preview image
- Game title
- Short description
- Top score (fetched from per-game leaderboard)
- "Play" button

Layout similar to the home page portal buttons but larger cards with preview images. Same dark theme, gold accents, Cinzel font.

### Overall Leaderboard
Below the game grid, an "Arcade Leaderboard" section shows combined scores across all games.
- Aggregates each player's best score per game
- Total arcade score = sum of best scores across all 6 games
- Displays: Rank, Player Name, Total Score, Games Played
- Requires consistent player names across games (stored in localStorage, entered once)

## Leaderboard System

### Per-Game Leaderboards
Each game gets its own KV key and API endpoint.

**API:** `GET/POST /api/arcade/leaderboard`

**Query params:**
- `game` (required): `horde-defense`, `orc-smash`, `orc-run`, `midland-memory`, `horde-trivia`, `orc-siege`

**KV keys:**
- `arcade:leaderboard:horde-defense` — top 50 scores
- `arcade:leaderboard:orc-smash` — top 50 scores
- `arcade:leaderboard:orc-run` — top 50 scores
- `arcade:leaderboard:midland-memory` — top 50 scores
- `arcade:leaderboard:orc-brawl` — top 50 scores
- `arcade:leaderboard:orc-siege` — top 50 scores

**Score object:**
```json
{
  "name": "PlayerName",
  "score": 12500,
  "details": {},
  "nftBonus": true,
  "date": "2026-02-03T..."
}
```

The `details` field is game-specific (waves for tower defense, distance for runner, level for breakout, etc.).

### Overall Leaderboard
**API:** `GET /api/arcade/leaderboard?game=overall`

**KV key:** `arcade:leaderboard:overall`

**Computed by:** The score submission endpoint. When a score is posted to any game, the server:
1. Saves to per-game leaderboard
2. Looks up the player's best score in all 6 games (by name match)
3. Computes total arcade score
4. Updates overall leaderboard

**Overall score object:**
```json
{
  "name": "PlayerName",
  "totalScore": 45000,
  "games": {
    "horde-defense": 12500,
    "orc-smash": 8000,
    "orc-run": 6500,
    "midland-memory": 7000,
    "orc-brawl": 5500,
    "orc-siege": 5500
  },
  "gamesPlayed": 6,
  "date": "2026-02-03T..."
}
```

### Migration
The existing `/api/leaderboard` (Horde Defense scores) needs to be migrated:
1. Copy scores from `horde:leaderboard` to `arcade:leaderboard:horde-defense`
2. Update Horde Defense UI to use new endpoint
3. Keep old endpoint working temporarily with a redirect or proxy

## Shared Arcade Utilities (`arcade/shared/arcade-utils.js`)

Extracted from the existing minigame code, shared across all 6 games:

```js
// Wallet connection (reused from minigame/ui.js)
function connectArcadeWallet() { ... }

// NFT fetch + Orc count (reused from minigame/ui.js)
function fetchOrcCount(walletAddress) { ... }

// Calculate NFT bonus (5% per Orc, max 25%)
function calculateNftBonus(orcCount) {
    return Math.min(orcCount * 0.05, 0.25);
}

// Submit score to per-game leaderboard
function submitArcadeScore(game, scoreData) { ... }

// Load leaderboard
function loadArcadeLeaderboard(game) { ... }

// Player name management (localStorage)
function getPlayerName() { ... }
function setPlayerName(name) { ... }
```

## NFT Bonus Summary

| Game | Bonus Type | Effect |
|------|-----------|--------|
| Horde Defense | Damage boost | +5% tower damage per Orc (max 25%) |
| Orc Smash | Score multiplier | +5% score per Orc (max 25%) |
| Orc Run | Speed tolerance | +5% max speed before difficulty spike per Orc (max 25%) |
| Midland Memory | Time extension | +5% bonus time per level per Orc (max 25%) |
| Orc Brawl | Damage boost | +5% attack damage per Orc (max 25%) |
| Orc Siege | Damage boost | +5% boulder damage per Orc (max 25%) |

## Home Page Update
Replace the "Orc Minigame" portal button with "Arcade":
```html
<a href="/arcade" class="portal-btn">
    <span class="btn-icon">🎮</span>
    <span class="btn-text">Arcade</span>
</a>
```

## Implementation Order

1. **Arcade hub page** — `/arcade/index.html` with game cards, overall leaderboard
2. **Shared utilities** — `arcade-utils.js` (wallet, NFT, score submission, player name)
3. **Leaderboard API** — `/api/arcade/leaderboard` with per-game + overall support
4. **Migrate Horde Defense** — move `/minigame` to `/arcade/horde-defense`, set up redirect, update leaderboard calls
5. **Orc Smash** — brick breaker (canvas, levels, power-ups)
6. **Orc Run** — endless runner (canvas, scrolling, obstacles)
7. **Midland Memory** — memory match (DOM-based cards, timer)
8. **Orc Brawl** — 2D fighter (canvas, combat system, combo detection)
9. **Orc Siege** — artillery game (canvas, physics engine)
10. **Overall leaderboard** — aggregate scoring, hub page integration
11. **Polish** — nav updates, home page button, consistent styling, mobile responsiveness

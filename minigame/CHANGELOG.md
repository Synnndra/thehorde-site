# Horde Defense Changelog

## 2026-01-26 - Balance Update

Based on leaderboard analysis showing 0% win rate on Medium/Hard maps and Wave 15 (Archmage boss) being a major roadblock.

### Enemy Changes

| Change | Before | After | Reason |
|--------|--------|-------|--------|
| Cavalry speed | 2.8 | 2.2 | Too fast to kill reliably |
| Mage disable chance | 15%/sec | 10%/sec | Tower disables too frequent |
| Mage disable duration | 4.0s | 3.0s | Disabled towers for too long |
| Archmage regen rate | 30 HP/sec | 15 HP/sec | Nearly unkillable at Wave 15 |

### Scaling Changes

| Change | Before | After | Reason |
|--------|--------|-------|--------|
| HP scaling per wave | +10% | +8% | Late waves too punishing |
| Gold scaling per wave | +5% | +7% | Gold couldn't keep up with HP |

### Difficulty Changes

| Difficulty | Enemy Multiplier Before | After |
|------------|------------------------|-------|
| Easy | 0.8x | 0.8x (unchanged) |
| Medium | 1.0x | 0.85x |
| Hard | 1.3x | 1.0x |

### Economy Changes

- Added starting gold bonus for harder maps:
  - Easy: +0 gold
  - Medium: +50 gold
  - Hard: +100 gold

### Expected Impact

- Wave 15 should be beatable with good tower placement
- Medium and Hard maps should now be winnable
- Late-game (waves 16+) should feel challenging but fair
- Players can afford key upgrades to handle scaling enemies

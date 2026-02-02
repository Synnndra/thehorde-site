# Badge System for My Horde Page

## Overview

Add an achievement badge system to the My Horde page with two badge types:
- **Stat-based** — computed client-side from existing holder data
- **Event-based** — stored in KV, awarded via admin panel

## Badge List

### Stat-based (auto-computed)
| Badge | Condition | Icon |
|-------|-----------|------|
| Warlord | Hold 50+ orcs | ⚔️ |
| Commander | Hold 20+ orcs | 🛡️ |
| Squad Leader | Hold 10+ orcs | ⚔️ |
| Recruit | Hold your first orc | 👶 |
| Enlisted | 100% of orcs enlisted | 🎖️ |
| Drill Sergeant | 10+ orcs enlisted | 🎖️ |
| Legendary Keeper | Own a Legendary orc (top 10 rarity) | 👑 |
| Rare Collector | Own 5+ Epic or Legendary orcs | 💎 |
| Diversity | Own orcs across all 4 rarity tiers (Legendary 1-10, Epic 11-40, Rare 41-115, Common 116+) | 🌈 |
| Trader | Completed a swap | 🤝 |
| Deal Maker | Completed 5+ swaps | 💼 |
| Fully Connected | Linked both Discord and X | 🔗 |

### Event-based (admin-awarded)
- Created and awarded via admin panel (e.g., "Christmas Sweeper 2026")

## KV Schema

```
badges:definitions        → { "badge_id": { id, name, description, icon, createdAt } }
badges:wallet:<address>   → ["badge_id_1", "badge_id_2"]
badges:awarded:<badgeId>  → ["wallet1", "wallet2"]
badges:swaps:<address>    → integer (atomic INCR on swap completion)
```

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `api/badges.js` | Public GET endpoint — returns event badges + swap count for a wallet |
| `api/badges-admin.js` | Admin POST endpoint — create, award, revoke, list, view badges |

### Modified Files
| File | Change |
|------|--------|
| `api/swap/accept.js` | INCR swap counters for both wallets on completion (~8 lines after line 211) |
| `vercel.json` | Add 2 rewrite rules for `/api/badges` and `/api/badges-admin` |
| `my-horde/index.html` | Add badges section HTML between stats bar and loading div |
| `my-horde/app.js` | Add badge definitions, fetch in loadData(), renderBadges() + createBadgeElement() (~150 lines) |
| `my-horde/style.css` | Badge styling: earned/locked states, tooltips, responsive (~90 lines) |
| `admin/index.html` | Add badge management section (create form, award form, badge list) |
| `admin/app.js` | Badge admin logic: create, award, list, view (~130 lines) |
| `admin/style.css` | Badge admin form styles (~20 lines) |

## Implementation Phases

### Phase 1: API Layer
- Create `api/badges.js` (public, GET, rate-limited)
- Create `api/badges-admin.js` (admin auth, POST, timing-safe)
- Add rewrite rules to `vercel.json`

### Phase 2: Swap Counter
- Modify `api/swap/accept.js` to INCR `badges:swaps:<wallet>` for both parties on completion
- Note: Existing completed swaps need a one-time backfill (add `mode: 'backfill-swaps'` to admin endpoint)

### Phase 3: Admin Panel
- Add badge management UI to admin (create, award to wallets, view)

### Phase 4: My Horde Frontend
- Add badges section to HTML
- Add badge computation + rendering to app.js
- Add badge CSS (earned = gold border + glow, locked = dimmed/greyscale, tooltip on hover)

### Phase 5: Testing
- Test stat badges with holder data
- Test event badge create/award via admin
- Test swap counter increment
- Run existing test suite

## Visual Design
- Badges displayed in profile header area as small cards (72px wide)
- Earned badges: gold border with glow, full opacity
- Locked badges: greyed out at 35% opacity
- Hover tooltip showing requirement text
- Medieval theme matching existing page (Cinzel font, gold/brown palette)

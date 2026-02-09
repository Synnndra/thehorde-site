# CLAUDE.md

## Project
Vercel-deployed static site + serverless API functions for a Solana NFT community (MidEvil Orcs). Vanilla JS frontend (no framework). Dark medieval theme with Cinzel/Crimson Text fonts.

## Stack
- **Hosting**: Vercel (Pro plan — minimize unnecessary deploys)
- **Database**: Upstash Redis via KV REST API
- **Blockchain**: Helius RPC for Solana, client calls go through `/api/helius` proxy
- **Auth**: Phantom wallet signature verification (tweetnacl)

## Key Patterns
- Shared utilities in `lib/swap-utils.js` — KV helpers, rate limiting (`isRateLimitedKV`), signature verification, replay prevention (`isSignatureUsed`/`markSignatureUsed`), timestamp validation
- All subpages share nav from `/shared/nav.css` + `/shared/nav.js`
- Shared base styles in `/shared/base.css` (background, noise texture, CSS reset, variables)
- Main `index.html` nav uses `.nav-center` wrapper with extra indentation; subpages use flat nav
- Client-side Helius calls MUST use `/api/helius` proxy — never direct Helius URL
- Game leaderboards require session tokens from `/api/game-session`

## Structure
- `/api/` — Vercel serverless functions (swap, dao, holders, leaderboard, etc.)
- `/shared/` — base.css, nav.css, nav.js
- `/lib/` — swap-utils.js (shared server utilities)
- `/swap/`, `/dao/`, `/holders/`, `/my-horde/`, `/orc-viewer/`, `/create-orc/`, `/collage-maker/` — subpages
- `/minigame/` — Horde Tower Defense game
- `/orc-run/` — Orc Run endless runner game

## Known Gotchas
- Never add `position: relative` to `body` — breaks Phantom wallet extension overlay, causing `provider.connect()` "Unexpected error"
- `backdrop-filter` creates containing block that traps `position: fixed` children — place modals outside containers with `backdrop-filter`
- Windows environment — quote paths with backslashes in bash commands

## Don't
- Don't push without asking
- Don't create documentation files unless asked
- Don't deploy or run `vercel` commands without asking
- Don't commit unless asked

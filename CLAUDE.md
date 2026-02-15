# CLAUDE.md

## Project
Vercel-deployed static site + serverless API functions for a Solana NFT community (MidEvil Orcs). Vanilla JS frontend (no framework). Dark medieval theme with Cinzel/Crimson Text fonts.

## Stack
- **Hosting**: Vercel (Pro plan — minimize unnecessary deploys)
- **Database**: Upstash Redis via KV REST API
- **Blockchain**: Helius RPC for Solana, client calls go through `/api/helius` proxy
- **Auth**: Phantom wallet signature verification (tweetnacl)
- **Collection**: MidEvils `w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW`, Graveyard `DpYLtgV5XcWPt3TM9FhXEh8uNg6QFYrj3zCGZxpcA3vF`

## Key Patterns
- Shared utilities in `lib/swap-utils.js` — KV helpers, rate limiting (`isRateLimitedKV`), signature verification, replay prevention (`isSignatureUsed`/`markSignatureUsed`), timestamp validation, atomic escrow claiming (SET NX), distributed locking
- `lib/dao-utils.js` — DAO governance constants, orc holdings verification, proposal state management with check-on-read auto-close
- `lib/fish-generator.js` — Deterministic seeded PRNG (Mulberry32) so server can verify client-side game catches
- All subpages share nav from `/shared/nav.css` + `/shared/nav.js`
- Shared base styles in `/shared/base.css` (background, noise texture, CSS reset, variables)
- Main `index.html` nav uses `.nav-center` wrapper with extra indentation; subpages use flat nav
- Client-side Helius calls MUST use `/api/helius` proxy — never direct Helius URL
- Game leaderboards require session tokens from `/api/game-session`
- Console.log/warn silenced in production via `shared/nav.js` — only `console.error` reaches prod. Don't strip logs manually

## Security Template
Every API endpoint must follow this pattern:
1. Rate limit (`isRateLimitedKV`)
2. Signature verification (`verifySignature`)
3. Replay prevention (`isSignatureUsed` / `markSignatureUsed`)
4. Timestamp validation (5-minute window)
- `isSignatureUsed` fails closed — returns true (blocks) if KV is unavailable
- Escrow uses two-phase commit: pending → escrowed → completed, with crash-safe retry
- All innerHTML MUST use `escapeHtml()` for text and `sanitizeImageUrl()` for image URLs (both in `swap/ui-utils.js`)

## Structure
- `/api/` — Vercel serverless functions (swap, dao, holders, leaderboard, fishing, etc.)
- `/shared/` — base.css, nav.css, nav.js
- `/lib/` — swap-utils.js, dao-utils.js, fish-generator.js (shared server utilities)
- `/swap/`, `/dao/`, `/holders/`, `/my-horde/`, `/orc-viewer/`, `/create-orc/`, `/collage-maker/` — subpages
- `/minigame/` — Horde Tower Defense game
- `/orc-run/` — Orc Run endless runner game

## Known Gotchas
- Never add `position: relative` to `body` — breaks Phantom wallet extension overlay, causing `provider.connect()` "Unexpected error"
- `backdrop-filter` creates containing block that traps `position: fixed` children — place modals outside containers with `backdrop-filter`
- Windows environment — quote paths with backslashes in bash commands
- In-memory rate limit fallback doesn't persist across serverless cold starts — only effective for burst protection within a single invocation

## Don't
- Don't push without asking
- Don't create documentation files unless asked
- Don't deploy or run `vercel` commands without asking
- Don't commit unless asked
- Don't write API endpoints without the security template (rate limit, sig verify, replay prevent)
- Don't use innerHTML without escapeHtml/sanitizeImageUrl
- Don't put secrets in committed files — .env.local is gitignored, keep it that way

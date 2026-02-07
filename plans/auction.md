# MidEvils NFT Auction System

## Overview
A single-NFT auction page where a seller can list a MidEvil NFT for timed bidding. Uses the same managed escrow pattern as Midswap — seller escrows NFT at listing, bidders escrow SOL with each bid, outbid bidders are automatically refunded, and when the auction ends the winner's SOL is already in escrow for immediate two-phase release.

## How It Works

1. **Seller lists NFT** — connects wallet, picks a MidEvil, sets starting price + duration, signs & escrows NFT to the escrow wallet
2. **Bidders place bids** — connect wallet, enter bid amount (must exceed current top bid), sign & escrow SOL to the escrow wallet. Previous top bidder's SOL is automatically returned by the server
3. **Auction ends** — timer expires. Winner's SOL is already in escrow, so two-phase release happens immediately (no waiting for payment)
4. **Two-phase release** — server releases NFT to winner, SOL to seller (same crash-safe pattern as Midswap)
5. **Cleanup** — cron handles expired auctions, stuck releases, and stuck refunds

## Auction State Machine

```
active          Accepting bids, seller's NFT in escrow
  |             Each bid: new bidder escrows SOL, previous bidder refunded
  v
escrowed        Timer expired, winner's SOL already in escrow, ready for release
  |
  v
completed       Two-phase release done, both parties received assets

Cancellation paths:
  active (no bids) --> cancelled       Return seller's NFT
  active (has bids) --> cancelled      Return seller's NFT + refund top bidder's SOL
```

## Bid Escrow Flow (Detail)

```
Bidder A bids 1.5 SOL:
  -> A escrows 1.5 SOL to escrow wallet
  -> Server verifies tx, stores A as topBid
  -> topBid: { bidder: A, amount: 1.5, escrowTx: "tx_a" }

Bidder B bids 2.0 SOL:
  -> B escrows 2.0 SOL to escrow wallet
  -> Server verifies tx
  -> Server returns 1.5 SOL from escrow to A (automatic refund)
  -> Stores B as topBid, moves A to refunded bids
  -> topBid: { bidder: B, amount: 2.0, escrowTx: "tx_b" }

Bidder A bids 3.0 SOL:
  -> A escrows 3.0 SOL to escrow wallet
  -> Server verifies tx
  -> Server returns 2.0 SOL from escrow to B (automatic refund)
  -> Stores A as topBid again
  -> topBid: { bidder: A, amount: 3.0, escrowTx: "tx_a2" }

Auction ends:
  -> A's 3.0 SOL already in escrow
  -> Two-phase release: NFT to A, SOL to seller
  -> No "awaiting payment" step needed
```

### Refund Failure Handling
If the server fails to refund the outbid bidder (e.g. network issue):
- The bid is still accepted and the new topBid is saved
- The failed refund is recorded in a `pending_refunds` list on the auction object
- The cleanup cron retries pending refunds periodically
- Bidders can also see "refund pending" status on their bid in the UI

## Fee Structure
- Platform fee: 0.02 SOL (same as Midswap)
- Free for Orc holders
- Fee paid by bidder as part of their escrow transaction (bid amount + fee)
- Refunds return only the bid amount (fee is non-refundable on outbid)
  - Alternative: fee only charged to the winning bid, refund full amount to outbid. This is friendlier — go with this approach.
- **Decision: Fee only charged on the winning bid.** Outbid refunds return the full escrowed amount. The fee is deducted from the winner's escrowed SOL during the release phase (seller receives bidAmount - fee).

## Pages

### `/auction/index.html` — Browse & Create
- List of active auctions with countdown timers
- "Create Auction" button (requires wallet connection)
- Filter by: active, ended, my auctions

### `/auction/create.html` — Create Auction
- Connect wallet
- Select NFT from your MidEvils collection (reuse Helius NFT loading from Midswap)
- Set starting price (SOL), optional reserve price
- Set duration (1h, 6h, 12h, 24h, 48h)
- Preview & confirm -> sign message + escrow NFT transaction
- On success: redirect to auction detail page with shareable link

### `/auction/view.html?id={auctionId}` — Auction Detail
- NFT image, traits, rarity
- Current top bid, bid history
- Countdown timer
- Bid input + "Place Bid" button (triggers SOL escrow transaction)
- If you're the current top bidder: show "You're winning" status
- If you were outbid: show refund status
- Seller controls: cancel (returns NFT + refunds top bidder if any), view status

## API Endpoints

### `POST /api/auction/create`
Create a new auction listing.

**Request:**
```json
{
  "sellerWallet": "...",
  "nftId": "...",
  "startPrice": 1.5,
  "reservePrice": null,
  "durationHours": 24,
  "message": "Auction create ... at {timestamp}",
  "signature": "...",
  "escrowTxSignature": "..."
}
```

**Flow:**
1. Rate limit (5 req/60s per IP)
2. Validate signature + timestamp
3. Verify NFT is from allowed collections (Helius getAsset)
4. Claim escrow tx signature (prevent reuse)
5. Verify escrow transaction content (NFT transferred to escrow wallet)
6. Generate auction ID (UUID)
7. Store auction in KV
8. Add to seller's auction index
9. Add to `auctions:active` set
10. Append tx log: `listed`
11. Return `{ auctionId, status: 'active', endsAt }`

**KV writes:**
- `auction:{id}` = full auction object
- `wallet:{seller}:auctions` RPUSH id
- `auctions:active` SADD id
- `used_escrow_tx:{sig}` = id (48h TTL)
- `txlog:auction:{id}` RPUSH listed entry

### `POST /api/auction/bid`
Place a bid on an active auction. Bidder must escrow SOL on-chain before calling this endpoint.

**Request:**
```json
{
  "auctionId": "...",
  "bidderWallet": "...",
  "bidAmount": 2.5,
  "escrowTxSignature": "...",
  "message": "Auction bid ... at {timestamp}",
  "signature": "..."
}
```

**Flow:**
1. Rate limit (20 req/60s per IP)
2. Validate signature + timestamp
3. Claim escrow tx signature (prevent reuse)
4. Verify escrow tx content (SOL amount matches bidAmount, sent to escrow wallet)
5. Acquire lock on auction
6. Fetch auction from KV
7. Verify status is `active` and not expired
8. Verify bidAmount > topBid.amount (and >= startPrice if first bid)
9. Verify bidder != seller
10. If there's a previous topBid with escrowed SOL:
    - Attempt to refund previous bidder's SOL from escrow
    - If refund succeeds: move previous bid to `refundedBids`
    - If refund fails: add to `pendingRefunds` (cron will retry)
11. Set new topBid with escrowTxSignature
12. Append to bids array
13. Save auction to KV
14. Release lock
15. Append tx log: `bid_placed` (and `bid_refunded` or `refund_pending` for previous bidder)
16. Return `{ success: true, topBid: { amount, bidder } }`

### `GET /api/auction/list`
List auctions, filtered by status or wallet.

**Query params:** `status=active|closed|completed`, `wallet=...`, `limit=20`

**Flow:**
1. Rate limit (30 req/60s)
2. If wallet: fetch `wallet:{wallet}:auctions`, load each auction
3. If status filter: scan active auctions (maintain an `auctions:active` set)
4. Return array of auction summaries (no full bid history)

**KV reads:**
- `auctions:active` SMEMBERS (for browsing)
- `wallet:{wallet}:auctions` LRANGE (for my auctions)
- `auction:{id}` for each result

### `GET /api/auction/[id]`
Get full auction detail including bid history.

**Flow:**
1. Rate limit (30 req/60s)
2. Fetch `auction:{id}`
3. Fetch `txlog:auction:{id}`
4. Return full auction object + tx log

### `POST /api/auction/close`
Close an auction and trigger two-phase release. Called by cron when `endsAt` passes, or can be triggered manually.

**Flow:**
1. Acquire lock on auction
2. Verify status is `active` and `endsAt` has passed
3. If no bids (or reserve not met): return seller's NFT, set status `expired`
4. If has winning bid:
   - Set status to `escrowed` (seller NFT + winner SOL both in escrow)
   - Two-phase release:
     - Phase 1: Release seller's NFT to winner
     - Phase 2: Release winner's SOL to seller (minus fee if not Orc holder)
   - Set status to `completed`
5. Remove from `auctions:active`
6. Release lock
7. Append tx log entries

### `POST /api/auction/cancel`
Cancel an auction (seller only).

**Request:**
```json
{
  "auctionId": "...",
  "sellerWallet": "...",
  "message": "Auction cancel ... at {timestamp}",
  "signature": "..."
}
```

**Flow:**
1. Validate signature
2. Acquire lock
3. Verify status is `active`
4. If topBid exists with escrowed SOL: refund top bidder
5. Return NFT from escrow to seller
6. Set status to `cancelled`
7. Remove from `auctions:active`
8. Release lock
9. Append tx log

### `GET /api/auction/cleanup`
Cron job for auction maintenance.

**Tasks:**
1. Close expired auctions: `active` + past `endsAt` -> trigger close flow (release or return)
2. Retry pending refunds: scan auctions with `pendingRefunds` entries, attempt refund, move to `refundedBids` on success
3. Retry stuck releases: `escrowed` for > 5 min but < 2 hours -> retry release phases
4. Return stuck escrow: `escrowed` for > 2 hours -> return both sides (seller NFT + winner SOL)
5. Clean up orphan escrow records

## KV Data Model

### Auction Object (`auction:{id}`)
```json
{
  "id": "uuid",
  "seller": "wallet_address",
  "nft": {
    "id": "nft_mint_address",
    "name": "MidEvil #123",
    "imageUrl": "...",
    "collection": "...",
    "isCompressed": false,
    "assetData": {}
  },
  "startPrice": 1.5,
  "reservePrice": null,
  "durationHours": 24,
  "createdAt": 1700000000000,
  "endsAt": 1700086400000,
  "status": "active",
  "topBid": {
    "amount": 3.0,
    "bidder": "wallet_address",
    "escrowTxSignature": "tx_sig",
    "timestamp": 1700050000000
  },
  "bids": [
    { "amount": 1.5, "bidder": "wallet1", "escrowTxSignature": "tx1", "timestamp": 1700020000000, "status": "refunded", "refundTx": "refund_tx1" },
    { "amount": 2.0, "bidder": "wallet2", "escrowTxSignature": "tx2", "timestamp": 1700035000000, "status": "refunded", "refundTx": "refund_tx2" },
    { "amount": 3.0, "bidder": "wallet1", "escrowTxSignature": "tx3", "timestamp": 1700050000000, "status": "winning" }
  ],
  "pendingRefunds": [],
  "sellerEscrowTxSignature": "seller_escrow_tx",
  "isOrcHolder": true,
  "fee": 0,
  "releasePhase1Tx": null,
  "releasePhase2Tx": null
}
```

### Index Keys
- `auctions:active` — SET of active auction IDs (for browsing)
- `wallet:{address}:auctions` — LIST of auction IDs per wallet
- `lock:auction:{id}` — distributed lock (SET NX EX, 900s TTL)
- `txlog:auction:{id}` — append-only log (RPUSH)
- `used_escrow_tx:{sig}` — escrow claim (SET NX EX, 48h TTL)
- `used_sig:{sig}` — replay prevention (SET NX EX, 10min TTL)

## Files to Create

### Frontend
```
auction/
  index.html          Browse auctions + create button
  create.html         Create auction form
  view.html           Auction detail + bidding
  style.css           Auction-specific styles
  app.js              Page routing & initialization
  auction-list.js     Browse/filter auctions
  auction-create.js   Create flow (NFT selection, escrow)
  auction-detail.js   Bid placement, countdown, winner payment
```

### Backend
```
api/auction/
  create.js           Create auction listing
  bid.js              Place a bid (with SOL escrow)
  list.js             Browse/filter auctions
  [id].js             Get auction detail
  close.js            Close auction + two-phase release
  cancel.js           Cancel auction (seller)
  cleanup.js          Cron maintenance (close expired, retry refunds, retry releases)
```

### Shared
- Reuse `/lib/swap-utils.js` for KV helpers, signature verification, escrow operations, Helius integration
- Reuse `/swap/wallet.js` pattern for wallet connection
- Reuse `/swap/blockchain.js` pattern for transaction building
- Add `shared/nav.css` + `shared/nav.js` (already on all pages)

## Vercel Config
Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/auction/cleanup", "schedule": "*/10 * * * *" }
  ]
}
```

## Implementation Order

1. **KV data model + API skeleton** — create/list/[id] endpoints with basic CRUD
2. **Create auction flow** — seller escrow, NFT verification, auction storage
3. **Bid flow with SOL escrow** — bidder escrows SOL, server verifies, auto-refunds outbid bidder
4. **Browse page** — list active auctions with countdown timers
5. **Auction detail page** — bid UI with escrow transaction, real-time countdown
6. **Auction close + two-phase release** — close endpoint, cron-triggered or manual
7. **Cancel flow** — seller cancellation with NFT return + bidder refund
8. **Cleanup cron** — expired auctions, pending refunds, stuck releases
9. **Polish** — bid history, refund status display, share links, error recovery

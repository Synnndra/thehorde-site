# DAO Voting Page

## Overview
A governance page at `/dao` where Orc holders vote on proposals for The Horde DAO. Voting power is 1 vote per Orc held. Proposals can be created by holders with 3+ Orcs. Votes are stored in Vercel KV with wallet signature proof for verifiability.

## How It Works

1. **Browse proposals** — see active, passed, and rejected proposals
2. **Connect wallet** — verify Orc ownership via Helius
3. **Vote** — sign a message with your wallet to cast votes (1 per Orc held)
4. **Create proposal** — holders with 3+ Orcs can submit new proposals
5. **Results** — when voting period ends, proposal passes or fails based on majority + quorum

## Voting Rules

- **Eligibility:** Must hold at least 1 Orc NFT to vote
- **Voting power:** 1 vote per Orc held (holding 5 Orcs = 5 votes)
- **One vote per wallet per proposal:** Can't change your vote once cast
- **Proposal creation:** Must hold 3+ Orcs
- **Voting period:** Set per proposal (default 72 hours)
- **Quorum:** Minimum 30 votes cast for a proposal to be valid (adjustable per proposal)
- **Pass threshold:** Simple majority (>50% of votes cast)

## Vote Verification

Each vote is backed by a wallet signature, making it cryptographically verifiable even though it's stored off-chain:

```
Vote signing flow:
1. User connects wallet, server verifies Orc count via Helius
2. User clicks "For" or "Against"
3. Client constructs message: "DAO vote: {proposalId} {for|against} by {wallet} at {timestamp}"
4. Wallet signs the message
5. Server verifies:
   a. Signature matches wallet
   b. Wallet holds Orcs (re-checked at vote time)
   c. Wallet hasn't already voted on this proposal
   d. Proposal is still active
   e. Timestamp is recent (< 5 minutes)
6. Vote stored in KV with signature as proof
```

Anyone can audit votes by verifying the stored signatures against the vote messages.

## Pages

### `/dao/index.html` — Proposal List
- **Active proposals** — currently accepting votes, with countdown timer
- **Closed proposals** — passed/rejected/expired, with final results
- **"Create Proposal" button** — visible to connected wallets with 3+ Orcs
- **DAO stats bar:** total proposals, total votes cast, active proposals count, total Orc voting power

### `/dao/proposal.html?id={proposalId}` — Proposal Detail
- Proposal title, description, author wallet
- Voting period with countdown
- Current results bar (For vs Against, vote count + percentage)
- Vote buttons: "For" / "Against" (requires wallet connection)
- Your vote status (if already voted, shows what you voted)
- Voter list: all votes with wallet address (abbreviated), vote direction, Orc count, timestamp
- Discussion section (optional, future enhancement)

### `/dao/create.html` — Create Proposal
- **Title** input (max 100 chars)
- **Description** textarea (markdown supported, max 2000 chars)
- **Voting duration** selector: 24h, 48h, 72h (default), 7 days
- **Quorum** selector: 30 (default), 50, 100 votes minimum
- **Preview** — shows how the proposal will look
- **Submit** — sign message to create, costs nothing (stored in KV)

## API Endpoints

### `GET /api/dao/proposals`
List all proposals.

**Query params:** `status=active|closed|all` (default: all), `limit=20`, `offset=0`

**Response:**
```json
{
  "proposals": [
    {
      "id": "uuid",
      "title": "Fund marketing campaign",
      "author": "wallet_address",
      "authorOrcCount": 5,
      "status": "active",
      "createdAt": 1700000000000,
      "endsAt": 1700259200000,
      "quorum": 30,
      "votesFor": 45,
      "votesAgainst": 12,
      "totalVotes": 57,
      "voterCount": 15
    }
  ],
  "total": 8
}
```

### `GET /api/dao/proposal/[id]`
Get full proposal detail with vote list.

**Response:**
```json
{
  "id": "uuid",
  "title": "Fund marketing campaign",
  "description": "Proposal to allocate 10 SOL from the DAO treasury...",
  "author": "wallet_address",
  "authorOrcCount": 5,
  "status": "active",
  "createdAt": 1700000000000,
  "endsAt": 1700259200000,
  "quorum": 30,
  "votesFor": 45,
  "votesAgainst": 12,
  "totalVotes": 57,
  "voterCount": 15,
  "votes": [
    {
      "wallet": "voter_wallet",
      "direction": "for",
      "orcCount": 3,
      "votePower": 3,
      "signature": "base58_signature",
      "message": "DAO vote: {id} for by {wallet} at {timestamp}",
      "timestamp": 1700100000000
    }
  ],
  "result": null
}
```

### `POST /api/dao/proposal/create`
Create a new proposal.

**Request:**
```json
{
  "wallet": "creator_wallet",
  "title": "Fund marketing campaign",
  "description": "Proposal to allocate 10 SOL...",
  "durationHours": 72,
  "quorum": 30,
  "message": "DAO create proposal by {wallet} at {timestamp}",
  "signature": "base58_signature"
}
```

**Flow:**
1. Rate limit (3 req/60s per IP)
2. Validate signature + timestamp
3. Verify wallet holds 3+ Orcs via Helius
4. Validate title (1-100 chars) and description (1-2000 chars)
5. Validate duration (24, 48, 72, or 168 hours)
6. Generate proposal ID
7. Store proposal in KV
8. Add to `dao:proposals:active` set
9. Append to `wallet:{wallet}:proposals` list
10. Return `{ proposalId, status: 'active', endsAt }`

### `POST /api/dao/proposal/vote`
Cast a vote on a proposal.

**Request:**
```json
{
  "proposalId": "uuid",
  "wallet": "voter_wallet",
  "direction": "for",
  "message": "DAO vote: {proposalId} for by {wallet} at {timestamp}",
  "signature": "base58_signature"
}
```

**Flow:**
1. Rate limit (10 req/60s per IP)
2. Validate signature + timestamp
3. Verify wallet holds Orcs via Helius — get exact count
4. Acquire lock on proposal
5. Fetch proposal from KV
6. Verify proposal status is `active` and not expired
7. Check wallet hasn't already voted (`dao:voted:{proposalId}:{wallet}`)
8. Calculate vote power (= Orc count)
9. Record vote:
   - Append to proposal's votes array
   - Update votesFor/votesAgainst totals
   - Set `dao:voted:{proposalId}:{wallet}` = direction (prevent double vote)
10. Save proposal to KV
11. Release lock
12. Return `{ success: true, votePower, direction, newTotals }`

### `GET /api/dao/close`
Cron job to close expired proposals.

**Flow:**
1. Fetch `dao:proposals:active` set members
2. For each active proposal past `endsAt`:
   - Acquire lock
   - Determine result:
     - If totalVotes < quorum: `expired` (didn't meet quorum)
     - If votesFor > votesAgainst: `passed`
     - If votesAgainst >= votesFor: `rejected`
   - Set `status` and `result`
   - Move from `dao:proposals:active` to `dao:proposals:closed`
   - Release lock

## KV Data Model

### Proposal Object (`dao:proposal:{id}`)
```json
{
  "id": "uuid",
  "title": "Fund marketing campaign",
  "description": "Proposal to allocate 10 SOL from the DAO treasury for a Twitter marketing campaign.",
  "author": "wallet_address",
  "authorOrcCount": 5,
  "status": "active",
  "createdAt": 1700000000000,
  "endsAt": 1700259200000,
  "durationHours": 72,
  "quorum": 30,
  "votesFor": 45,
  "votesAgainst": 12,
  "totalVotes": 57,
  "voterCount": 15,
  "votes": [
    {
      "wallet": "voter_wallet",
      "direction": "for",
      "orcCount": 3,
      "votePower": 3,
      "signature": "base58_sig",
      "message": "DAO vote: uuid for by voter_wallet at 1700100000000",
      "timestamp": 1700100000000
    }
  ],
  "result": null
}
```

### Index Keys
- `dao:proposals:active` — SET of active proposal IDs
- `dao:proposals:closed` — SET of closed proposal IDs
- `dao:voted:{proposalId}:{wallet}` — string, prevents double voting (value = "for"|"against")
- `wallet:{wallet}:proposals` — LIST of proposal IDs created by wallet
- `lock:dao:proposal:{id}` — distributed lock (SET NX EX, 300s TTL)
- `used_sig:{sig}` — replay prevention (SET NX EX, 10min TTL)
- `dao:stats` — cached aggregate stats (total proposals, total votes, etc.)

## Security Considerations

### Orc Count Snapshot
A voter's Orc count is checked at the time they vote, not when the proposal was created. This means:
- If you buy Orcs mid-vote, you get the new count
- If you sell Orcs after voting, your vote stands at the original count
- This is a tradeoff — simpler than snapshotting, but someone could theoretically vote, transfer Orcs to another wallet, and vote again

### Transfer Protection
To prevent the "vote and transfer" attack:
- When a vote is cast, record the specific Orc mint addresses held by the voter
- Store voted Orc IDs in a set: `dao:voted_orcs:{proposalId}`
- On subsequent votes, check that none of the voter's Orcs have already been used to vote
- This ensures each Orc can only contribute 1 vote per proposal, regardless of wallet transfers

**Flow addition for vote endpoint (step 6.5):**
```
6.5. Fetch voter's Orc mint addresses via Helius
     Check each against dao:voted_orcs:{proposalId}
     If any Orc already voted: reject with "Orc(s) already used to vote"
     If clean: add all Orc IDs to dao:voted_orcs:{proposalId}
```

### Signature Verification
- Every vote includes a signed message that can be independently verified
- Message format includes proposalId, direction, wallet, and timestamp
- Prevents forged votes and replay attacks
- Stored alongside the vote for public audit

## File Structure

```
dao/
  index.html            Proposal list page
  proposal.html         Proposal detail + voting
  create.html           Create proposal form
  style.css             DAO page styles
  app.js                Routing, wallet connection, proposal list
  proposal-detail.js    Vote UI, results display, voter list
  proposal-create.js    Create form, validation, submission

api/dao/
  proposals.js          List proposals (GET)
  [id].js               Get proposal detail (GET)
  create.js             Create proposal (POST)
  vote.js               Cast vote (POST)
  close.js              Cron: close expired proposals (GET)
```

## Nav & Home Page Updates

### Site Nav
Add "DAO" link to the nav bar on all pages:
```html
<a href="/dao">DAO</a>
```

### Home Page
Add a portal button:
```html
<a href="/dao" class="portal-btn">
    <span class="btn-icon">🗳️</span>
    <span class="btn-text">DAO Voting</span>
</a>
```

## Vercel Config
Add cron for closing expired proposals:
```json
{
  "crons": [
    { "path": "/api/dao/close", "schedule": "*/5 * * * *" }
  ]
}
```

## Implementation Order

1. **Page scaffold** — HTML/CSS for proposal list, detail, and create pages
2. **Proposal create API** — signature verification, Orc count check (3+ threshold), KV storage
3. **Proposal list API** — fetch active/closed proposals with summary stats
4. **Proposal detail API** — full proposal with vote history
5. **Vote API** — signature verification, Orc count, transfer protection, vote recording
6. **Voting UI** — For/Against buttons, result bar, voter list
7. **Close cron** — auto-close expired proposals, determine pass/reject/expired
8. **Create proposal UI** — form with validation, markdown preview
9. **Transfer protection** — per-Orc vote tracking to prevent double-voting via transfers
10. **Nav updates** — add DAO link to site nav and home page portal

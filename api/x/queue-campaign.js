// One-time endpoint to queue all Bobbers Tournament campaign posts as drafts.
// Delete this file after the tournament (post Feb 21).
import { timingSafeEqual } from 'crypto';
import { kvHset, kvHgetall } from '../../lib/swap-utils.js';
import { generateDraftId } from '../../lib/x-utils.js';

const DRAFTS_KEY = 'x:drafts';

// All times in UTC (PST + 8 hours). Post 13 has no scheduledAt — manual only.
const CAMPAIGN_POSTS = [
    {
        label: 'Post 1 — Teaser (Mon afternoon)',
        schedule: 'Mon Feb 16 afternoon',
        scheduledAt: Date.UTC(2026, 1, 16, 23, 0),  // 3 PM PST
        text:
`\u{1F41F} Something's stirring in the Primordial Pit\u2026

Tomorrow at 5 PM PST, the waters open.

The First Annual Bobbers Fishing Tournament is almost here. \u{1F3A3}

Legendary prizes. Leaderboard glory. And fish that'll make your Orcs jealous.

Details dropping tonight \u{1F440}`
    },
    {
        label: 'Post 2 — Full Announcement (Mon evening) \u{1F4CC}PIN',
        schedule: 'Mon Feb 16 evening',
        scheduledAt: Date.UTC(2026, 1, 17, 3, 0),   // 7 PM PST
        text:
`\u{1F3A3} THE FIRST ANNUAL BOBBERS FISHING TOURNAMENT \u{1F3A3}

Cast your lines at the Primordial Pit for a chance at legendary prizes!

\u{1F4C5} Feb 17 (5PM PST) \u2014 Feb 21 (12PM PST)
\u{1F3AE} 5 casts per day (Orc holders get bonus casts!)
\u{1F4CA} Score = Weight \u00D7 Rarity Multiplier

\u{1F3C6} PRIZES:
\u{1F947} Free MidEvils NFT + a Legendary fish named after YOU
\u{1F948} Your Mid immortalized as a fisherman in Bobbers
\u{1F949} A fish named after you in the game

Play at: midhorde.com/fishing
Who's ready to fish? \u{1F41F}\u2B07\uFE0F`
    },
    {
        label: 'Post 3 — It\'s Live (Tue 5PM PST)',
        schedule: 'Tue Feb 17 5:00 PM',
        scheduledAt: Date.UTC(2026, 1, 18, 1, 0),   // 5 PM PST
        text:
`\u{1F6A8} LINES ARE IN THE WATER \u{1F6A8}

The Bobbers Fishing Tournament is LIVE!

Go cast your 5 free casts right now \u{1F447}
midhorde.com/fishing

Holding Orcs? You get up to 5 BONUS casts per day. Every cast counts.

Let's see what you catch \u{1F41F}`
    },
    {
        label: 'Post 4 — Day 1 Engagement (Tue 8-9PM)',
        schedule: 'Tue Feb 17 8-9 PM',
        scheduledAt: Date.UTC(2026, 1, 18, 4, 30),  // 8:30 PM PST
        text:
`How's Day 1 going, anglers? \u{1F3A3}

Drop your best catch in the replies \u2014 let's see who's sitting at the top of that leaderboard \u{1F440}

Haven't cast yet? You've still got time today: midhorde.com/fishing

Remember: Score = Weight \u00D7 Rarity. One legendary pull could change everything.`
    },
    {
        label: 'Post 5 — Day 2 Morning (Wed 10AM)',
        schedule: 'Wed Feb 18 10 AM',
        scheduledAt: Date.UTC(2026, 1, 18, 18, 0),  // 10 AM PST
        text:
`\u2600\uFE0F Day 2 of the Bobbers Fishing Tournament

Your casts reset! That's 5 fresh chances to climb the leaderboard.

(Orc holders: don't forget your bonus casts \u{1F7E2})

Cast now \u2192 midhorde.com/fishing`
    },
    {
        label: 'Post 6 — Day 2 Midday Engagement (Wed)',
        schedule: 'Wed Feb 18 1-2 PM',
        scheduledAt: Date.UTC(2026, 1, 18, 21, 30), // 1:30 PM PST
        text:
`Quick math for the tournament:

5 days \u00D7 5 casts = 25 total chances
Orc holder? Up to 50 casts \u{1F440}

Every. Cast. Counts.

The leaderboard is live and moving fast.
midhorde.com/fishing \u{1F41F}`
    },
    {
        label: 'Post 7 — Midweek Hype (Thu morning)',
        schedule: 'Thu Feb 19 10 AM',
        scheduledAt: Date.UTC(2026, 1, 19, 18, 0),  // 10 AM PST
        text:
`We're at the halfway point of the Bobbers Fishing Tournament! \u{1F3A3}

The leaderboard is heating up. Have you been using all your casts?

If you haven't started yet \u2014 you still have time. 3 days of casts can absolutely win this thing.

Jump in \u2192 midhorde.com/fishing`
    },
    {
        label: 'Post 8 — Prize Reminder (Thu afternoon)',
        schedule: 'Thu Feb 19 5-6 PM',
        scheduledAt: Date.UTC(2026, 1, 20, 1, 30),  // 5:30 PM PST
        text:
`Friendly reminder of what's on the line \u{1F3C6}

\u{1F947} A FREE MidEvils NFT + design your own Legendary fish for the game
\u{1F948} Your Mid becomes a permanent fisherman character in Bobbers
\u{1F949} A fish named after you, forever in the game

These prizes are one-of-a-kind. Don't sleep on your casts.
midhorde.com/fishing`
    },
    {
        label: 'Post 9 — 24 Hours Left (Fri morning)',
        schedule: 'Fri Feb 20 10 AM',
        scheduledAt: Date.UTC(2026, 1, 20, 18, 0),  // 10 AM PST
        text:
`\u23F0 24 HOURS LEFT to fish

The Bobbers Tournament wraps tomorrow at noon PST.

Today's casts + tomorrow morning = your last shots at the leaderboard.

Make them count \u{1F3A3}
midhorde.com/fishing`
    },
    {
        label: 'Post 10 — Final Night Push (Fri evening)',
        schedule: 'Fri Feb 20 8-9 PM',
        scheduledAt: Date.UTC(2026, 1, 21, 4, 30),  // 8:30 PM PST
        text:
`Last full day of casting is DONE after tonight.

Tomorrow morning you get one final round of casts before the tournament closes at 12 PM PST.

If you're in striking distance of the top 3\u2026 tomorrow is your moment.

\u{1F41F} midhorde.com/fishing`
    },
    {
        label: 'Post 11 — Final Morning (Sat 8-9AM)',
        schedule: 'Sat Feb 21 8-9 AM',
        scheduledAt: Date.UTC(2026, 1, 21, 16, 30), // 8:30 AM PST
        text:
`\u{1F6A8} FINAL CASTS \u{1F6A8}

The Bobbers Fishing Tournament closes at 12 PM PST today.

Use your remaining casts NOW. This is it.

\u{1F3A3} midhorde.com/fishing

Who's taking home that Legendary fish? \u{1F440}`
    },
    {
        label: 'Post 12 — Tournament Closed (Sat 12PM)',
        schedule: 'Sat Feb 21 12:00 PM',
        scheduledAt: Date.UTC(2026, 1, 21, 20, 0),  // 12 PM PST
        text:
`\u{1F3C1} LINES UP! The First Annual Bobbers Fishing Tournament is CLOSED!

What a week at the Primordial Pit \u{1F41F}

Winners announcement coming soon\u2026

Thank you to everyone who cast a line. This community is incredible. \u{1FAE1}`
    },
    {
        label: 'Post 13 — Winners Announcement',
        schedule: 'Sat/Sun (when ready)',
        text:
`\u{1F3C6} YOUR BOBBERS FISHING TOURNAMENT CHAMPIONS \u{1F3C6}

\u{1F947} [WINNER] \u2014 Earns a free MidEvils NFT + designs a Legendary fish!
\u{1F948} [2ND PLACE] \u2014 Their Mid becomes a fisherman character in Bobbers!
\u{1F949} [3RD PLACE] \u2014 Gets a fish named after them in the game!

Congrats to our champions and GGs to everyone who competed \u{1F3A3}

The Primordial Pit remembers. See you at the next one \u{1F41F}`
    }
];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const adminSecret = process.env.ADMIN_SECRET?.trim()?.replace(/\\n/g, '');

    if (!adminSecret || !kvUrl || !kvToken) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Auth
    const secretBuf = Buffer.from(String(req.body?.secret || ''));
    const adminBuf = Buffer.from(adminSecret);
    if (secretBuf.length !== adminBuf.length || !timingSafeEqual(secretBuf, adminBuf)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // Check if campaign already queued
        const existing = await kvHgetall(DRAFTS_KEY, kvUrl, kvToken);
        const campaignDrafts = Object.values(existing || {}).filter(d => d.source === 'campaign' && d.status === 'pending');
        if (campaignDrafts.length > 0) {
            return res.status(409).json({
                error: `Campaign already queued (${campaignDrafts.length} pending drafts)`,
                drafts: campaignDrafts.map(d => ({ id: d.id, topic: d.topic }))
            });
        }

        // Queue all posts
        const created = [];
        for (const post of CAMPAIGN_POSTS) {
            const draftId = generateDraftId();
            const draft = {
                id: draftId,
                text: post.text,
                suggestedTags: [],
                imageIdea: null,
                source: 'campaign',
                topic: `${post.label} | ${post.schedule}`,
                scheduledAt: post.scheduledAt || null,
                status: 'pending',
                createdAt: Date.now(),
                reviewedBy: null,
                editedText: null,
                postedAt: null,
                tweetId: null,
                error: null
            };
            await kvHset(DRAFTS_KEY, draftId, draft, kvUrl, kvToken);
            created.push({ id: draftId, label: post.label, schedule: post.schedule });
        }

        return res.status(200).json({
            success: true,
            message: `Queued ${created.length} campaign posts as pending drafts`,
            drafts: created
        });

    } catch (err) {
        console.error('Queue campaign error:', err);
        return res.status(500).json({ error: 'Failed to queue campaign' });
    }
}

const BADGES = {
    warlord: { name: 'Warlord', description: 'Hold 33+ orcs', image: '/badges/warlord.png' },
    commander: { name: 'Commander', description: 'Hold 20+ orcs', image: '/badges/commander.png' },
    squad_leader: { name: 'Squad Leader', description: 'Hold 10+ orcs', image: '/badges/squad_leader.png' },
    recruit: { name: 'Recruit', description: 'Hold your first orc', image: '/badges/recruit.png' },
    enlisted: { name: 'Enlisted', description: '100% of orcs enlisted', image: '/badges/enlisted.png' },
    drill_sergeant: { name: 'Drill Sergeant', description: '10+ orcs enlisted', image: '/badges/drill_sergeant.png' },
    legendary_keeper: { name: 'Legendary Keeper', description: 'Own a Legendary orc (top 10 rarity)', image: '/badges/legendary_keeper.png' },
    rare_collector: { name: 'Rare Collector', description: 'Own 5+ Epic or Legendary orcs', image: '/badges/rare_collector.png' },
    diversity: { name: 'Diversity', description: 'Own orcs across all 4 rarity tiers', image: '/badges/diversity.png' },
    trader: { name: 'Trader', description: 'Completed a swap', image: '/badges/trader.png' },
    deal_maker: { name: 'Deal Maker', description: 'Completed 5+ swaps', image: '/badges/deal_maker.png' },
    fully_connected: { name: 'Fully Connected', description: 'Linked both Discord and X', image: '/badges/fully_connected.png' },
};

export default function handler(req, res) {
    const { id } = req.query;
    const badge = BADGES[id];

    if (!badge) {
        return res.redirect(302, '/my-horde');
    }

    const origin = 'https://midhorde.com';
    const imageUrl = origin + badge.image + '?v=2';
    const pageUrl = origin + '/badge/' + id;
    const title = badge.name + ' Badge — The Horde';
    const description = badge.description;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">
<meta name="twitter:site" content="@MidHorde">
<meta http-equiv="refresh" content="0;url=/my-horde">
</head>
<body>
<p>Redirecting to <a href="/my-horde">My Horde</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(html);
}

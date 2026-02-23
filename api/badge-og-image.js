// Dynamic OG card image for badge sharing — generates 1200x630 PNG
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const BADGES = {
    warlord: 'warlord.png', commander: 'commander.png', squad_leader: 'squad_leader.png',
    recruit: 'recruit.png', enlisted: 'enlisted.png', drill_sergeant: 'drill_sergeant.png',
    legendary_keeper: 'legendary_keeper.png', rare_collector: 'rare_collector.png',
    diversity: 'diversity.png', trader: 'trader.png', deal_maker: 'deal_maker.png',
    fully_connected: 'fully_connected.png',
};

export default async function handler(req, res) {
    const { id } = req.query;
    const file = BADGES[id];
    if (!file) return res.status(404).end();

    try {
        const badgePath = join(process.cwd(), 'badges', file);
        const badgeBuf = readFileSync(badgePath);

        // Resize badge to fit nicely in the card
        const badge = await sharp(badgeBuf)
            .resize(400, 400, { fit: 'inside' })
            .png()
            .toBuffer();

        // Create 1200x630 dark background with badge centered
        const card = await sharp({
            create: { width: 1200, height: 630, channels: 4, background: { r: 24, g: 24, b: 27, alpha: 1 } }
        })
            .composite([{ input: badge, gravity: 'centre' }])
            .png({ compressionLevel: 9 })
            .toBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
        return res.status(200).send(card);
    } catch (err) {
        console.error('Badge OG image error:', err.message);
        return res.status(500).end();
    }
}

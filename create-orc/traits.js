var ORC_TRAITS = [
    {
        id: 'background',
        name: 'Background',
        required: true,
        options: [
            { id: 'bg-blizzard', name: 'Blizzard', color: '#8a9aaa', image: 'blizzard.png' },
            { id: 'bg-blue', name: 'Blue', color: '#2a3a6a', image: 'blue.png' },
            { id: 'bg-brick', name: 'Brick', color: '#7a3a2a', image: 'brick.png' },
            { id: 'bg-hades', name: 'Hades', color: '#3a0a0a', image: 'hades.png' },
            { id: 'bg-mud', name: 'Mud', color: '#5a3a1a', image: 'mud.png' },
            { id: 'bg-olive', name: 'Olive', color: '#4a5a2a', image: 'olive.png' },
            { id: 'bg-portal', name: 'Portal', color: '#4a2a6a', image: 'portal.png' }
        ]
    },
    {
        id: 'skin',
        name: 'Skin',
        required: true,
        options: [
            { id: 'skin-bronze', name: 'Bronze', color: '#8a6a3a', image: 'bronze.png', hasOpen: true },
            { id: 'skin-drak', name: 'Drak', color: '#2a1a2a', image: 'drak.png', hasOpen: true },
            { id: 'skin-glacier', name: 'Glacier', color: '#7a9aaa', image: 'glacier.png' },
            { id: 'skin-heavenly', name: 'Heavenly', color: '#aaaacc', image: 'heavenly.png' },
            { id: 'skin-moss', name: 'Moss', color: '#3a5a2a', image: 'moss.png', hasOpen: true },
            { id: 'skin-skele', name: 'Skele', color: '#c8c0a8', image: 'skele.png' },
            { id: 'skin-swamp', name: 'Swamp', color: '#2a4a2a', image: 'swamp.png', hasOpen: true }
        ]
    },
    {
        id: 'eyewear',
        name: 'Eyewear',
        required: false,
        options: [
            { id: 'eye-berserk', name: 'Berserk Eyes', color: '#cc2222', image: 'berserk_eyes.png' },
            { id: 'eye-dark-glasses', name: 'Dark Glasses', color: '#1a1a2a', image: 'dark_glasses.png' },
            { id: 'eye-death-eyes', name: 'Death Eyes', color: '#1a0a1a', image: 'death_eyes.png' },
            { id: 'eye-flaming-lasers', name: 'Flaming Lasers', color: '#cc4411', image: 'flaming_lasers.png' },
            { id: 'eye-ghostar', name: 'Ghostar Eyes', color: '#aabbcc', image: 'ghostar_eyes.png' },
            { id: 'eye-oozing', name: 'Oozing Shades', color: '#4acc4a', image: 'oozing_shades.png' },
            { id: 'eye-pink-glow', name: 'Pink Glow', color: '#cc66aa', image: 'pink_glow.png' },
            { id: 'eye-reading', name: 'Reading Frames', color: '#6a5a4a', image: 'reading_frames.png' },
            { id: 'eye-red-shades', name: 'Red Shades', color: '#aa2222', image: 'red_shades.png' },
            { id: 'eye-red-sports', name: 'Red Sports', color: '#cc3333', image: 'red_sports.png' },
            { id: 'eye-tinted-sports', name: 'Tinted Sports', color: '#4a4a6a', image: 'tinted_sports.png' },
            { id: 'eye-wound', name: 'Wound', color: '#6a2a2a', image: 'wound.png' }
        ]
    },
    {
        id: 'mouth',
        name: 'Mouth',
        required: false,
        options: [
            { id: 'mouth-open', name: 'Open Mouth', color: '#5a2a2a', image: 'open_mouth_preview.png' },
            { id: 'mouth-thick-stache', name: 'Thick Stache', color: '#3a2a1a', image: 'thick_stache.png' }
        ]
    },
    {
        id: 'headwear',
        name: 'Headwear',
        required: false,
        options: [
            { id: 'hw-black-spikes', name: 'Black Spikes', color: '#1a1a1a', image: 'black_spikes.png' },
            { id: 'hw-cowboy', name: 'Cowboy', color: '#6a4a2a', image: 'cowboy.png' },
            { id: 'hw-dark-flow', name: 'Dark Flow', color: '#2a1a1a', image: 'dark_flow.png' },
            { id: 'hw-fiery-horns', name: 'Fiery Horns', color: '#cc5a0a', image: 'fiery_horns.png' },
            { id: 'hw-green-cap', name: 'Green Cap', color: '#2a5a2a', image: 'green_cap.png' },
            { id: 'hw-headband', name: 'Headband', color: '#5a4a3a', image: 'headband.png' },
            { id: 'hw-high-cut-curls', name: 'High Cut Curls', color: '#3a2a1a', image: 'high_cut_curls.png' },
            { id: 'hw-kings-crown', name: 'Kings Crown', color: '#D4A017', image: 'kings_crown.png' },
            { id: 'hw-maulboro', name: 'Maulboro', color: '#4a3a5a', image: 'maulboro.png' },
            { id: 'hw-mickorcs-visor', name: 'MickOrcs Visor', color: '#2a4a2a', image: 'mickorcs_visor.png' },
            { id: 'hw-monster-helmet', name: 'Monster Helmet', color: '#4a4a5a', image: 'monster_helmet.png' },
            { id: 'hw-morgoths-hat', name: 'Morgoths Hat', color: '#2a0a2a', image: 'morgoths_hat.png' },
            { id: 'hw-mullet', name: 'Mullet', color: '#4a3a2a', image: 'mullet.png' },
            { id: 'hw-necro-helmet', name: 'Necromancers Helmet', color: '#1a1a3a', image: 'necromancers_helm.png' },
            { id: 'hw-orc-bucket', name: 'Orc Bucket Hat', color: '#3a5a2a', image: 'orc_bucket_hat.png' },
            { id: 'hw-orchawk', name: 'OrcHawk', color: '#3a3a1a', image: 'orchawk.png' },
            { id: 'hw-pods', name: 'Pods', color: '#3a3a4a', image: 'pods.png' },
            { id: 'hw-relaxed-hat', name: 'Relaxed Hat', color: '#5a4a3a', image: 'relaxed_hat.png' },
            { id: 'hw-ring-of-death', name: 'Ring of Death', color: '#3a0a0a', image: 'ring_of_death.png' },
            { id: 'hw-scouts-helm', name: 'Scouts Helm', color: '#5a5a3a', image: 'scouts_helm.png' },
            { id: 'hw-skull-bandana', name: 'Skull Bandana', color: '#1a1a1a', image: 'skull_bandana.png' },
            { id: 'hw-warriors-helm', name: 'Warriors Helm', color: '#6a6a7a', image: 'warriors_helm.png' }
        ]
    },
    {
        id: 'clothing',
        name: 'Clothing',
        required: false,
        options: [
            { id: 'cl-battle-club', name: 'Battle Club', color: '#3a3a2a', image: 'battle_club.png', hasOpen: true },
            { id: 'cl-beater', name: 'Beater', color: '#f8f0e0', image: 'beater.png', hasOpen: true },
            { id: 'cl-black-tie', name: 'Black Tie', color: '#1a1a1a', image: 'black_tie.png', hasOpen: true },
            { id: 'cl-bloody-hoodie', name: 'Bloody Hoodie', color: '#5a1a1a', image: 'bloody_hoodie.png', hasOpen: true },
            { id: 'cl-cloak-darkness', name: 'Cloak of Darkness', color: '#0a0a1a', image: 'cloak_of_darkness.png', hasOpen: true },
            { id: 'cl-crewneck', name: 'Crewneck', color: '#4a4a4a', image: 'crewneck.png', hasOpen: true },
            { id: 'cl-crimson-corps', name: 'Crimson Corps', color: '#7a1a1a', image: 'crimson_corps.png', hasOpen: true },
            { id: 'cl-dragon-polo', name: 'Dragon Woods Polo', color: '#2a4a2a', image: 'dragon_woods_polo.png', hasOpen: true },
            { id: 'cl-fisherman', name: 'Fisherman', color: '#5a5a3a', image: 'fisherman.png', hasOpen: true },
            { id: 'cl-grateful-goblins', name: 'Grateful Goblins', color: '#3a6a3a', image: 'grateful_goblins.png', hasOpen: true },
            { id: 'cl-jean-jacket', name: 'Jean Jacket', color: '#3a4a6a', image: 'jean_jacket.png', hasOpen: true },
            { id: 'cl-jock', name: 'Jock', color: '#6a2a2a', image: 'jock.png', hasOpen: true },
            { id: 'cl-mickorcs', name: 'MickOrcs', color: '#2a4a2a', image: 'mickorcs.png', hasOpen: true },
            { id: 'cl-monster-racer', name: 'Monster Racer', color: '#4a3a5a', image: 'monster_racer.png', hasOpen: true },
            { id: 'cl-morgoths-cloak', name: 'Morgoths Cloak', color: '#2a0a2a', image: 'morgoths_cloak.png', hasOpen: true },
            { id: 'cl-necro-armor', name: 'Necromancers Armor', color: '#2a1a3a', image: 'necromancers_armor.png' },
            { id: 'cl-orc-champs', name: 'Orc Champs', color: '#2a5a2a', image: 'orc_champs.png', hasOpen: true },
            { id: 'cl-orcs-guard', name: 'Orcs Guard', color: '#4a5a3a', image: 'orcs_guard.png', hasOpen: true },
            { id: 'cl-pagan', name: 'Pagan', color: '#4a3a2a', image: 'pagan.png', hasOpen: true },
            { id: 'cl-raphael', name: 'Raphael', color: '#5a3a5a', image: 'raphael.png', hasOpen: true },
            { id: 'cl-rocks-turtleneck', name: 'Rocks Turtleneck', color: '#2a2a2a', image: 'rocks_turtleneck.png', hasOpen: true },
            { id: 'cl-satyr-fleece', name: 'Satyr Fleece', color: '#5a4a3a', image: 'satyr_fleece.png', hasOpen: true },
            { id: 'cl-scout', name: 'Scout', color: '#4a5a3a', image: 'scout.png', hasOpen: true },
            { id: 'cl-slaughter-puffer', name: 'Slaughter Puffer', color: '#3a1a1a', image: 'slaughter_puffer.png', hasOpen: true },
            { id: 'cl-stockbreaker', name: 'Stockbreaker', color: '#2a3a4a', image: 'stockbreaker.png', hasOpen: true },
            { id: 'cl-vacation-shirt', name: 'Vacation Shirt', color: '#4a6a6a', image: 'vacation_shirt.png', hasOpen: true },
            { id: 'cl-wool-sweater', name: 'Wool Sweater', color: '#5a4a3a', image: 'wool_sweater.png', hasOpen: true },
            { id: 'cl-workers-jacket', name: 'Workers Jacket', color: '#4a3a2a', image: 'workers_jacket.png', hasOpen: true }
        ]
    },
    {
        id: 'specialty',
        name: 'Specialty',
        required: false,
        options: [
            { id: 'sp-axe', name: 'Axe', color: '#6a6a6a', image: 'axe.png' },
            { id: 'sp-death-fire', name: 'Death Fire', color: '#4a0a4a', image: 'death_fire.png' },
            { id: 'sp-evil-conscience', name: 'Evil Conscience', color: '#4a1a1a', image: 'evil_conscience.png' },
            { id: 'sp-orkish-aura', name: 'Orkish Aura', color: '#3a6a3a', image: 'orkish_aura.png' },
            { id: 'sp-gargoyle', name: 'Personal Gargoyle', color: '#5a5a6a', image: 'personal_gargoyle.png' },
            { id: 'sp-hawk', name: 'Personal Hawk', color: '#5a3a1a', image: 'personal_hawk.png' },
            { id: 'sp-skull', name: 'Personal Skull', color: '#c8c0a8', image: 'personal_skull.png' },
            { id: 'sp-purple-drink', name: 'Purple Drink', color: '#6a2a6a', image: 'purple_drink.png' },
            { id: 'sp-sword', name: 'Sword', color: '#9a9aaa', image: 'sword.png' },
            { id: 'sp-torn-cash', name: 'Torn up Cash', color: '#3a8a3a', image: 'torn_up_cash.png' },
            { id: 'sp-uzi', name: 'Uzi', color: '#3a3a3a', image: 'uzi.png' }
        ]
    }
];

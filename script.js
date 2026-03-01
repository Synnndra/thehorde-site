// The Horde - MidEvils DAO

document.addEventListener('DOMContentLoaded', () => {
    // Add subtle parallax effect to background
    document.addEventListener('mousemove', (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;

        document.body.style.backgroundPosition = `calc(50% + ${moveX}px) calc(50% + ${moveY}px)`;
    });

    // Discord link integration
    initDiscordLink();

    // X link integration
    initXLink();

    // Entrance animations via IntersectionObserver
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe fade-in sections
    document.querySelectorAll('.fade-in-section').forEach(el => {
        observer.observe(el);
    });

    // Observe individual portal buttons for staggered entrance
    document.querySelectorAll('.portal-btn').forEach((btn, i) => {
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(20px)';
        btn.style.transitionDelay = `${i * 0.05}s`;
        observer.observe(btn);
    });

    // Fetch and display stats
    fetchStats();
});

// ========================================
// STATS FETCHING
// ========================================
const STATS_CACHE_KEY = 'horde_stats';
const STATS_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchStats() {
    // Check sessionStorage cache
    const cached = sessionStorage.getItem(STATS_CACHE_KEY);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < STATS_TTL) {
                renderStats(data);
                return;
            }
        } catch (e) {
            // Invalid cache, proceed to fetch
        }
    }

    try {
        const holdersRes = await fetch('/api/holders');

        const stats = {};

        if (holdersRes.ok) {
            const holdersData = await holdersRes.json();
            stats.totalHolders = holdersData.totalHolders;
            stats.floorPrice = holdersData.floorPrice;
            stats.enlistedCount = holdersData.enlistedCount;
        }

        // Cache results
        sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
            data: stats,
            timestamp: Date.now()
        }));

        renderStats(stats);
    } catch (e) {
        // Silently fail — stats stay as "--"
    }
}

function renderStats(stats) {
    if (stats.totalHolders != null) {
        animateCountUp('stat-holders', stats.totalHolders);
    }
    if (stats.enlistedCount != null) {
        animateCountUp('stat-enlisted', stats.enlistedCount);
    }
    if (stats.floorPrice != null) {
        const floorEl = document.getElementById('stat-floor');
        if (floorEl) {
            const rounded = parseFloat(stats.floorPrice).toFixed(2);
            floorEl.textContent = rounded;
        }
    }
}

function animateCountUp(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;

    target = parseInt(target, 10);
    if (isNaN(target)) {
        el.textContent = '--';
        return;
    }

    const duration = 1200;
    const start = performance.now();

    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

// ========================================
// DISCORD LINK
// ========================================
function initDiscordLink() {
    const btn = document.getElementById('link-discord-btn');
    if (!btn) return;

    // Check URL params for Discord callback data
    const params = new URLSearchParams(window.location.search);
    const discordId = params.get('discord_id');
    const discordUsername = params.get('discord_username');
    const discordAvatar = params.get('discord_avatar');
    const discordError = params.get('discord_error');

    if (discordId && discordUsername) {
        localStorage.setItem('discord_id', discordId);
        localStorage.setItem('discord_username', discordUsername);
        localStorage.setItem('discord_avatar', discordAvatar || '');
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    } else if (discordError) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    renderDiscordBtn(btn);
}

function renderDiscordBtn(btn) {
    const id = localStorage.getItem('discord_id');
    const username = localStorage.getItem('discord_username');
    const avatar = localStorage.getItem('discord_avatar');

    if (id && username) {
        // Linked state
        btn.classList.add('linked');
        btn.innerHTML = '';

        if (avatar) {
            const img = document.createElement('img');
            img.src = `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=40`;
            img.alt = username;
            img.className = 'discord-avatar';
            btn.appendChild(img);
        }

        const label = document.createElement('span');
        label.className = 'link-discord-label';
        label.textContent = username;
        btn.appendChild(label);

        btn.title = 'Click to unlink Discord';
        btn.onclick = () => {
            if (confirm('Unlink your Discord account?')) {
                localStorage.removeItem('discord_id');
                localStorage.removeItem('discord_username');
                localStorage.removeItem('discord_avatar');
                location.reload();
            }
        };
    } else {
        // Unlinked state
        btn.onclick = () => {
            window.location.href = '/api/discord/auth';
        };
    }
}

// ========================================
// X LINK
// ========================================
function initXLink() {
    const btn = document.getElementById('link-x-btn');
    if (!btn) return;

    // Check URL params for X callback data
    const params = new URLSearchParams(window.location.search);
    const xId = params.get('x_id');
    const xUsername = params.get('x_username');
    const xAvatar = params.get('x_avatar');
    const xError = params.get('x_error');

    if (xId && xUsername) {
        localStorage.setItem('x_id', xId);
        localStorage.setItem('x_username', xUsername);
        localStorage.setItem('x_avatar', xAvatar || '');
        window.history.replaceState({}, '', window.location.pathname);
    } else if (xError) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    renderXBtn(btn);
}

function renderXBtn(btn) {
    const id = localStorage.getItem('x_id');
    const username = localStorage.getItem('x_username');
    const avatar = localStorage.getItem('x_avatar');

    if (id && username) {
        btn.classList.add('linked');
        btn.innerHTML = '';

        if (avatar) {
            try {
                const avatarUrl = new URL(avatar);
                if (avatarUrl.protocol === 'https:' && avatarUrl.hostname.endsWith('.twimg.com')) {
                    const img = document.createElement('img');
                    img.src = avatarUrl.href;
                    img.alt = username;
                    img.className = 'x-avatar';
                    btn.appendChild(img);
                }
            } catch (e) {
                // Invalid URL, skip avatar
            }
        }

        const label = document.createElement('span');
        label.className = 'link-x-label';
        label.textContent = '@' + username;
        btn.appendChild(label);

        btn.title = 'Click to unlink X';
        btn.onclick = () => {
            if (confirm('Unlink your X account?')) {
                localStorage.removeItem('x_id');
                localStorage.removeItem('x_username');
                localStorage.removeItem('x_avatar');
                location.reload();
            }
        };
    } else {
        btn.onclick = () => {
            window.location.href = '/api/x/auth';
        };
    }
}

// Add shake animation + portal entrance styles dynamically
const style = document.createElement('style');
style.textContent = `
    .portal-btn {
        transition: opacity 0.6s ease, transform 0.6s ease, background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .portal-btn.visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }

    .portal-btn.visible:hover {
        transform: translateY(-6px) !important;
    }
`;
document.head.appendChild(style);

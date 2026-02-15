// Leaderboard page logic
let currentType = 'score';

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Background music
const BACKGROUND_MUSIC = new Audio('sounds/background.mp3');
BACKGROUND_MUSIC.loop = true;
BACKGROUND_MUSIC.volume = 0.3;
let isMuted = false;

function startBackgroundMusic() {
    if (!isMuted) {
        BACKGROUND_MUSIC.play().catch(() => {});
    }
}

function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) {
        BACKGROUND_MUSIC.pause();
    } else {
        BACKGROUND_MUSIC.play().catch(() => {});
    }
    document.getElementById('muteBtn').textContent = isMuted ? '🔇' : '🔊';
}

// Start music on page load or first click
startBackgroundMusic();
document.addEventListener('click', function startMusicOnClick() {
    startBackgroundMusic();
    document.removeEventListener('click', startMusicOnClick);
}, { once: true });

async function fetchLeaderboard(type) {
    try {
        const response = await fetch(`/api/fishing/leaderboard?type=${type}&limit=25`);
        const data = await response.json();
        return data.leaderboard || [];
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        return [];
    }
}

async function fetchStats() {
    try {
        // Get catches leaderboard to calculate totals
        const catchesRes = await fetch('/api/fishing/leaderboard?type=catches&limit=100');
        const catchesData = await catchesRes.json();

        if (catchesData.leaderboard && catchesData.leaderboard.length > 0) {
            const totalCatches = catchesData.leaderboard.reduce((sum, entry) => sum + parseInt(entry.score), 0);
            document.getElementById('totalCatches').textContent = totalCatches;
            document.getElementById('totalPlayers').textContent = catchesData.leaderboard.length;
        } else {
            document.getElementById('totalCatches').textContent = '0';
            document.getElementById('totalPlayers').textContent = '0';
        }
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

function displayLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboardList');

    if (leaderboard.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">No catches yet! Be the first to fish!</div>';
        return;
    }

    container.innerHTML = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        const score = (currentType === 'weight' || currentType === 'score') ? parseFloat(entry.score).toFixed(1) : entry.score;
        let displayName;
        if (entry.discordName) {
            const isValidAvatar = entry.discordAvatar && entry.discordAvatar.startsWith('https://cdn.discordapp.com/');
            const avatarImg = isValidAvatar
                ? `<img src="${escapeHTML(entry.discordAvatar)}" alt="" class="discord-avatar" onerror="this.style.display='none'">`
                : '';
            displayName = `<span class="discord-name">${avatarImg}${escapeHTML(entry.discordName)}</span>`;
        } else {
            displayName = `<span class="wallet-name">${entry.wallet}</span>`;
        }
        return `
            <div class="leaderboard-entry">
                <span class="lb-rank">${medal || entry.rank}</span>
                <span class="lb-wallet">${displayName}</span>
                <span class="lb-score">${score}</span>
            </div>
        `;
    }).join('');
}

async function switchType(type) {
    currentType = type;

    document.querySelectorAll('.lb-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    document.getElementById('leaderboardList').innerHTML = '<div class="leaderboard-empty">Loading...</div>';

    const leaderboard = await fetchLeaderboard(type);
    displayLeaderboard(leaderboard);
}

// Event listeners (no inline onclick)
document.getElementById('muteBtn').addEventListener('click', toggleMute);

document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => switchType(tab.dataset.type));
});

// Initial load
async function init() {
    await fetchStats();
    const leaderboard = await fetchLeaderboard('score');
    displayLeaderboard(leaderboard);
}

init();

// Auto-refresh every 30 seconds
setInterval(async () => {
    await fetchStats();
    const leaderboard = await fetchLeaderboard(currentType);
    displayLeaderboard(leaderboard);
}, 30000);

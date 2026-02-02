// The Horde - MidEvils DAO

document.addEventListener('DOMContentLoaded', () => {
    // Handle "Coming Soon" buttons
    const comingSoonBtns = document.querySelectorAll('.coming-soon');

    comingSoonBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();

            // Add a shake animation
            btn.style.animation = 'shake 0.5s ease';

            setTimeout(() => {
                btn.style.animation = '';
            }, 500);
        });
    });

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

    // Add entrance animations
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

    // Observe elements for fade-in
    document.querySelectorAll('.portal-btn').forEach(btn => {
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(20px)';
        observer.observe(btn);
    });
});

// Discord Link functionality
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

// X Link functionality
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
            const img = document.createElement('img');
            img.src = avatar;
            img.alt = username;
            img.className = 'x-avatar';
            btn.appendChild(img);
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

// Add shake animation dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        60% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
    }

    .portal-btn {
        transition: opacity 0.6s ease, transform 0.6s ease;
    }

    .portal-btn.visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }

    .portal-btn.visible:hover {
        transform: translateY(-3px) !important;
    }

    .coming-soon.visible:hover {
        transform: translateY(0) !important;
    }
`;
document.head.appendChild(style);

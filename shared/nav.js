(function() {
    // Check URL params for Discord/X callback data
    var params = new URLSearchParams(window.location.search);

    // Discord callback handling
    var discordId = params.get('discord_id');
    var discordUsername = params.get('discord_username');
    var discordAvatar = params.get('discord_avatar');
    if (discordId && discordUsername) {
        localStorage.setItem('discord_id', discordId);
        localStorage.setItem('discord_username', discordUsername);
        localStorage.setItem('discord_avatar', discordAvatar || '');
        window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('discord_error')) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // X callback handling
    var xId = params.get('x_id');
    var xUsername = params.get('x_username');
    var xAvatar = params.get('x_avatar');
    if (xId && xUsername) {
        localStorage.setItem('x_id', xId);
        localStorage.setItem('x_username', xUsername);
        localStorage.setItem('x_avatar', xAvatar || '');
        window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('x_error')) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // Render Discord button
    var discordBtn = document.getElementById('nav-link-discord');
    if (discordBtn) renderNavDiscord(discordBtn);

    // Render X button
    var xBtn = document.getElementById('nav-link-x');
    if (xBtn) renderNavX(xBtn);

    function renderNavDiscord(btn) {
        var id = localStorage.getItem('discord_id');
        var username = localStorage.getItem('discord_username');
        var avatar = localStorage.getItem('discord_avatar');
        if (id && username) {
            btn.classList.add('linked');
            btn.innerHTML = '';
            if (avatar) {
                var img = document.createElement('img');
                img.src = 'https://cdn.discordapp.com/avatars/' + id + '/' + avatar + '.png?size=40';
                img.alt = username;
                img.className = 'nav-avatar';
                btn.appendChild(img);
            }
            btn.appendChild(Object.assign(document.createElement('span'), { textContent: username }));
            btn.title = 'Click to unlink Discord';
            btn.onclick = function() {
                if (confirm('Unlink your Discord account?')) {
                    localStorage.removeItem('discord_id');
                    localStorage.removeItem('discord_username');
                    localStorage.removeItem('discord_avatar');
                    location.reload();
                }
            };
        } else {
            btn.onclick = function() {
                window.location.href = '/api/discord/auth?return_to=' + encodeURIComponent(window.location.pathname);
            };
        }
    }

    function renderNavX(btn) {
        var id = localStorage.getItem('x_id');
        var username = localStorage.getItem('x_username');
        var avatar = localStorage.getItem('x_avatar');
        if (id && username) {
            btn.classList.add('linked');
            btn.innerHTML = '';
            if (avatar) {
                try {
                    var avatarUrl = new URL(avatar);
                    if (avatarUrl.protocol === 'https:' && avatarUrl.hostname.endsWith('.twimg.com')) {
                        var img = document.createElement('img');
                        img.src = avatarUrl.href;
                        img.alt = username;
                        img.className = 'nav-avatar';
                        btn.appendChild(img);
                    }
                } catch (e) {
                    // Invalid URL, skip avatar
                }
            }
            btn.appendChild(Object.assign(document.createElement('span'), { textContent: '@' + username }));
            btn.title = 'Click to unlink X';
            btn.onclick = function() {
                if (confirm('Unlink your X account?')) {
                    localStorage.removeItem('x_id');
                    localStorage.removeItem('x_username');
                    localStorage.removeItem('x_avatar');
                    location.reload();
                }
            };
        } else {
            btn.onclick = function() {
                window.location.href = '/api/x/auth?return_to=' + encodeURIComponent(window.location.pathname);
            };
        }
    }
})();

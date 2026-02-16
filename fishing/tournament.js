// Tournament Banner — countdown timer and expand/collapse
// Remove this file + HTML/CSS after tournament ends (post Feb 21)
(function () {
    // Feb 17, 2026 5:00 PM PST = Feb 18, 2026 1:00 AM UTC
    var START = new Date('2026-02-18T01:00:00Z');
    // Feb 21, 2026 12:00 PM PST = Feb 21, 2026 8:00 PM UTC
    var END = new Date('2026-02-21T20:00:00Z');

    function formatTime(ms) {
        var s = Math.floor(ms / 1000);
        var d = Math.floor(s / 86400);
        var h = Math.floor((s % 86400) / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
        if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
        return m + 'm ' + sec + 's';
    }

    // === Game page banner (expand/collapse with full details) ===
    var timerEl = document.getElementById('tournamentTimer');
    var bannerEl = document.getElementById('tournamentBanner');
    var panelEl = document.getElementById('tournamentPanel');
    var chevronEl = document.getElementById('tournamentChevron');
    var barEl = document.getElementById('tournamentBar');

    if (bannerEl && timerEl) {
        function updateGameTimer() {
            var now = new Date();
            if (now < START) {
                timerEl.textContent = 'Starts in ' + formatTime(START - now);
                bannerEl.className = 'tournament-banner';
            } else if (now < END) {
                timerEl.textContent = 'LIVE \u2014 Ends in ' + formatTime(END - now);
                bannerEl.className = 'tournament-banner live';
            } else {
                timerEl.textContent = 'Tournament Ended';
                bannerEl.className = 'tournament-banner ended';
            }
        }

        barEl.addEventListener('click', function () {
            var isOpen = panelEl.classList.toggle('open');
            chevronEl.innerHTML = isOpen ? '&#9650;' : '&#9660;';
        });

        updateGameTimer();
        setInterval(updateGameTimer, 1000);
    }

    // === Leaderboard page banner (simple countdown to lock) ===
    var lbBannerEl = document.getElementById('tournamentLbBanner');
    var lbTimerEl = document.getElementById('tournamentLbTimer');

    if (lbBannerEl && lbTimerEl) {
        function updateLbTimer() {
            var now = new Date();
            if (now < START) {
                lbTimerEl.textContent = 'Leaderboard resets at start \u2014 ' + formatTime(START - now);
                lbBannerEl.className = 'tournament-lb-banner';
            } else if (now < END) {
                lbTimerEl.textContent = 'Leaderboard locks in ' + formatTime(END - now);
                lbBannerEl.className = 'tournament-lb-banner live';
            } else {
                lbTimerEl.textContent = 'Leaderboard Locked \u2014 Final Results';
                lbBannerEl.className = 'tournament-lb-banner ended';
            }
        }

        updateLbTimer();
        setInterval(updateLbTimer, 1000);
    }
})();

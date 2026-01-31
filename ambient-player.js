// Ambient background music player
// Persists mute preference in localStorage
// Browsers block autoplay with sound, so we start muted and unmute on first interaction

(function () {
    // Inject styles
    var style = document.createElement('style');
    style.textContent = '#ambientToggle{position:fixed;bottom:16px;right:16px;z-index:9999;width:40px;height:40px;border-radius:50%;border:2px solid #c9a227;background:rgba(26,26,46,0.9);color:#c9a227;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s;box-shadow:0 2px 10px rgba(0,0,0,0.5);padding:0;line-height:1}#ambientToggle:hover{background:rgba(201,162,39,0.2);transform:scale(1.1)}#ambientToggle.is-muted{opacity:0.5}';
    document.head.appendChild(style);

    var STORAGE_KEY = 'horde_music_muted';

    var audio = document.createElement('audio');
    audio.src = '/ambient.mp3';
    audio.loop = true;
    audio.volume = 0.3;
    audio.preload = 'auto';

    var savedPref = localStorage.getItem(STORAGE_KEY);
    var isMuted = savedPref === null ? false : savedPref === 'true';

    var btn = document.createElement('button');
    btn.id = 'ambientToggle';
    btn.setAttribute('aria-label', 'Toggle music');
    btn.title = 'Toggle music';
    document.body.appendChild(btn);

    function updateButton() {
        btn.innerHTML = isMuted ? '&#9834;' : '&#9835;';
        btn.classList.toggle('is-muted', isMuted);
    }

    function tryPlay() {
        audio.play().catch(function () {});
    }

    if (!isMuted) {
        audio.muted = false;
        tryPlay();
    } else {
        audio.muted = true;
        tryPlay();
    }

    updateButton();

    btn.addEventListener('click', function () {
        isMuted = !isMuted;
        audio.muted = isMuted;
        localStorage.setItem(STORAGE_KEY, String(isMuted));
        updateButton();
        if (!isMuted && audio.paused) {
            tryPlay();
        }
    });

    function onFirstInteraction() {
        if (!isMuted && audio.paused) {
            tryPlay();
        }
        document.removeEventListener('click', onFirstInteraction);
        document.removeEventListener('keydown', onFirstInteraction);
    }
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);
})();

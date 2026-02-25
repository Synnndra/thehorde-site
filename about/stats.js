(async function() {
    try {
        const res = await fetch('/api/collection-stats');
        const data = await res.json();
        if (data.totalSupply) {
            document.getElementById('stat-nfts').textContent = data.totalSupply.toLocaleString();
        }
        if (data.holders) {
            document.getElementById('stat-holders').textContent = data.holders.toLocaleString();
        }
        if (data.floorPrice != null) {
            document.getElementById('stat-floor').textContent = data.floorPrice + ' SOL';
        }
    } catch (e) {
        document.getElementById('stat-nfts').textContent = '~4,500';
        document.getElementById('stat-holders').textContent = '~960';
    }
})();

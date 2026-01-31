// MidEvils NFT Swap - UI Utility Functions

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function sanitizeImageUrl(url) {
    if (!url) return PLACEHOLDER_IMAGE;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return escapeHtml(url);
        }
    } catch {}
    return PLACEHOLDER_IMAGE;
}

function showLoading(message) {
    if (elements.loading) {
        elements.loading.innerHTML = `<div class="spinner"></div><div class="loading-text">${escapeHtml(message || 'Loading...')}</div>`;
        elements.loading.style.display = 'flex';
        elements.loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (elements.error) {
        elements.error.style.display = 'none';
    }
}

function showSteppedLoading(steps, activeIndex) {
    if (!elements.loading) return;
    const stepsHtml = steps.map((step, i) => {
        let cls = 'pending';
        if (i < activeIndex) cls = 'done';
        else if (i === activeIndex) cls = 'active';
        return `<div class="loading-step ${cls}">${escapeHtml(step)}</div>`;
    }).join('');
    elements.loading.innerHTML = `<div class="spinner"></div><div class="loading-text">${escapeHtml(steps[activeIndex] || 'Processing...')}<div class="loading-steps">${stepsHtml}</div></div>`;
    elements.loading.style.display = 'flex';
    elements.loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (elements.error) {
        elements.error.style.display = 'none';
    }
}

function hideLoading() {
    if (elements.loading) {
        elements.loading.style.display = 'none';
    }
}

function showError(message) {
    hideLoading();
    if (elements.error) {
        elements.error.textContent = message;
        elements.error.style.display = 'block';
    }
    console.error(message);
}

function formatCountdown(expiresAt) {
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) {
        return { text: 'Expired', expired: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return { text: `${days}d ${hours % 24}h`, expired: false };
    } else if (hours > 0) {
        return { text: `${hours}h ${minutes}m`, expired: false };
    } else if (minutes > 0) {
        return { text: `${minutes}m ${seconds}s`, expired: false, urgent: true };
    } else {
        return { text: `${seconds}s`, expired: false, urgent: true };
    }
}

function startCountdown(element, expiresAt) {
    const updateCountdown = () => {
        const countdown = formatCountdown(expiresAt);
        element.textContent = countdown.expired ? 'Expired' : `Expires in ${countdown.text}`;

        if (countdown.expired) {
            element.classList.add('expired');
            element.classList.remove('urgent');
        } else if (countdown.urgent) {
            element.classList.add('urgent');
        }
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);
    countdownIntervals.push(interval);

    return interval;
}

function clearCountdowns() {
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];
}

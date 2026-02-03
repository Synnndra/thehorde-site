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

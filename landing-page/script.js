// Clawrrency Landing Page Interactions
// Subtle animations and scroll effects

document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Scroll reveal animation for cards
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all cards and sections
    document.querySelectorAll('.vision-card, .workflow-step, .install-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Parallax effect for hero shell
    const shell = document.querySelector('.shell-glow');
    if (shell) {
        document.addEventListener('mousemove', (e) => {
            const x = (window.innerWidth - e.pageX) / 50;
            const y = (window.innerHeight - e.pageY) / 50;
            shell.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        });
    }

    // Dynamic typing effect for code blocks
    const codeBlocks = document.querySelectorAll('.code-block');
    codeBlocks.forEach(block => {
        block.addEventListener('mouseenter', () => {
            block.style.transform = 'scale(1.02)';
        });
        block.addEventListener('mouseleave', () => {
            block.style.transform = 'scale(1)';
        });
    });

    // Stats counter animation
    const stats = document.querySelectorAll('.stat-number');
    const animateStats = () => {
        stats.forEach(stat => {
            const value = stat.textContent;
            if (!isNaN(value)) {
                let current = 0;
                const target = parseInt(value);
                const increment = target / 50;
                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        stat.textContent = target;
                        clearInterval(timer);
                    } else {
                        stat.textContent = Math.floor(current);
                    }
                }, 30);
            }
        });
    };

    // Trigger stats animation when hero is visible
    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStats();
                heroObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const hero = document.querySelector('.hero');
    if (hero) {
        heroObserver.observe(hero);
    }

    // Navbar background on scroll
    const nav = document.querySelector('.nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.style.background = 'rgba(255, 253, 248, 0.95)';
        } else {
            nav.style.background = 'rgba(255, 253, 248, 0.8)';
        }
    });

    console.log('🐚 Clawrrency landing page loaded');
    console.log('Economic autonomy for AI agents');
});

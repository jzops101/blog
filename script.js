const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const savedTheme = localStorage.getItem('qichi-theme');
const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem('qichi-theme', theme);
  themeMeta.content = theme === 'dark' ? '#171917' : '#f5f4ef';
}
setTheme(savedTheme || (preferredDark ? 'dark' : 'light'));
themeButton.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const slides = [...document.querySelectorAll('.hero-slide')];
const dots = [...document.querySelectorAll('.slider-dots button')];
const count = document.querySelector('.slider-count b');
let currentSlide = 0;
let sliderTimer;
function showSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === currentSlide);
    slide.setAttribute('aria-hidden', String(i !== currentSlide));
  });
  dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
  count.textContent = String(currentSlide + 1).padStart(2, '0');
}
function autoplay() {
  clearInterval(sliderTimer);
  sliderTimer = setInterval(() => showSlide(currentSlide + 1), 6000);
}
document.querySelector('.slider-arrow.prev').addEventListener('click', () => { showSlide(currentSlide - 1); autoplay(); });
document.querySelector('.slider-arrow.next').addEventListener('click', () => { showSlide(currentSlide + 1); autoplay(); });
dots.forEach(dot => dot.addEventListener('click', () => { showSlide(Number(dot.dataset.slide)); autoplay(); }));
autoplay();

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: .12 });
document.querySelectorAll('.reveal').forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  revealObserver.observe(element);
});

window.addEventListener('scroll', () => document.querySelector('.site-header').classList.toggle('scrolled', scrollY > 16), { passive: true });

document.querySelector('.search').addEventListener('submit', event => {
  event.preventDefault();
  const query = document.querySelector('#site-search').value.trim().toLowerCase();
  document.querySelectorAll('.article-card').forEach(card => {
    card.style.display = !query || card.textContent.toLowerCase().includes(query) ? 'grid' : 'none';
  });
  document.querySelector('#articles').scrollIntoView({ behavior: 'smooth' });
});

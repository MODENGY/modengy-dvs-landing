/* ============================================================
   MODENGY motion — сдержанная версия по корпоративному фидбеку:
   – без плавного скролла (Lenis удалён), нативный скролл
   – без 3D-сцен
   – только мягкие fade-up появления (один раз), счётчики,
     служебные мелочи (шапка, прогресс, плавающий CTA)
   ============================================================ */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let marqueeRaf = 0;
let ac: AbortController | null = null;

function prefersReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Мягкое появление: fade-up, один раз, без «вылетов» */
function buildReveals() {
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.set(el, { opacity: 0, y: 22 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', overwrite: true }),
    });
  });
}

/* Страховка: элементы выше вьюпорта после перезагрузки показываем сразу */
function revealSafetyNet() {
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
      gsap.set(el, { opacity: 1, y: 0 });
    }
  });
}

/* Счётчики показателей */
function fmtCount(v: number, decimals: number, suffix: string) {
  return v.toFixed(decimals).replace('.', ',') + suffix;
}
function buildCounters() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          v: end,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => (el.textContent = fmtCount(obj.v, decimals, suffix)),
        }),
    });
  });
}
function setCountersFinal() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    el.textContent = fmtCount(end, decimals, el.dataset.suffix || '');
  });
}

/* Тонкая линия прогресса чтения под шапкой */
function buildProgressRail() {
  const fill = document.querySelector<HTMLElement>('[data-rail-fill]');
  if (!fill) return;
  gsap.to(fill, {
    width: '100%',
    ease: 'none',
    scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
  });
}

/* Шапка: линия-тень при скролле */
function buildHeaderScroll() {
  const line = document.querySelector<HTMLElement>('[data-header-line]');
  if (!line) return;
  const onScroll = () => line.classList.toggle('opacity-100', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true, signal: ac?.signal });
  onScroll();
}

/* Плавающий CTA: после 1.5 экрана; прячется у формы */
function buildFloatingCta() {
  const cta = document.querySelector<HTMLElement>('[data-float-cta]');
  if (!cta) return;
  let past = false;
  let nearForm = false;
  const apply = () => cta.classList.toggle('on', past && !nearForm);
  ScrollTrigger.create({
    start: () => window.innerHeight * 1.5,
    onUpdate: (self) => {
      past = self.scroll() > window.innerHeight * 1.5;
      apply();
    },
  });
  const quiz = document.querySelector('#quiz');
  if (quiz) {
    ScrollTrigger.create({
      trigger: quiz,
      start: 'top 85%',
      end: 'bottom 20%',
      onToggle: (self) => {
        nearForm = self.isActive;
        apply();
      },
    });
  }
}

/* Плавающая карточка «Оставить отзыв» (соц. доказательство) */
function buildReviewCard() {
  const card = document.querySelector<HTMLElement>('[data-review-card]');
  if (!card) return;
  let closed = false;
  gsap.set(card, { xPercent: -150, autoAlpha: 0 });
  const st = ScrollTrigger.create({
    trigger: document.documentElement,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      if (closed) return;
      const on = self.progress > 0.38 && self.progress < 0.9;
      gsap.to(card, { xPercent: on ? 0 : -150, autoAlpha: on ? 1 : 0, duration: 0.45, ease: 'power2.out', overwrite: true });
    },
  });
  card.querySelector<HTMLElement>('[data-review-close]')?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closed = true;
      st.disable();
      gsap.to(card, { xPercent: -150, autoAlpha: 0, duration: 0.35, ease: 'power2.in', overwrite: true });
    },
    { signal: ac?.signal }
  );
  const stars = Array.from(card.querySelectorAll<HTMLElement>('[data-star]'));
  stars.forEach((star, i) => {
    star.addEventListener('pointerenter', () => stars.forEach((s, j) => s.classList.toggle('lit', j <= i)), { signal: ac?.signal });
  });
  card.addEventListener('pointerleave', () => stars.forEach((s) => s.classList.remove('lit')), { signal: ac?.signal });
}

/* Чертёж ДВС: хотспоты ↔ карточки (hover-подсветка, без анимаций) */
function buildBlueprint() {
  const scope = document.querySelector<HTMLElement>('[data-blueprint]');
  if (!scope) return;
  const parts = Array.from(scope.querySelectorAll<SVGGElement>('[data-part]'));
  const cards = Array.from(scope.querySelectorAll<HTMLElement>('[data-app-card]'));
  const spots = Array.from(scope.querySelectorAll<SVGAElement>('[data-hotspot]'));
  const activate = (slug: string | null) => {
    parts.forEach((p) => p.classList.toggle('lit', p.dataset.part === slug));
    cards.forEach((c) => c.classList.toggle('active', c.dataset.appCard === slug));
  };
  spots.forEach((s) => {
    s.addEventListener('pointerenter', () => activate(s.dataset.hotspot || null), { signal: ac?.signal });
    s.addEventListener('pointerleave', () => activate(null), { signal: ac?.signal });
  });
  cards.forEach((c) => {
    c.addEventListener('pointerenter', () => activate(c.dataset.appCard || null), { signal: ac?.signal });
    c.addEventListener('pointerleave', () => activate(null), { signal: ac?.signal });
  });
}

/* Слои MoS₂: разъезжаются один раз при появлении */
function buildLayers() {
  const fig = document.querySelector<HTMLElement>('[data-mos]');
  if (!fig) return;
  const layers = gsap.utils.toArray<SVGGElement>('[data-mos] .mos-layer');
  if (!layers.length) return;
  ScrollTrigger.create({
    trigger: fig,
    start: 'top 80%',
    once: true,
    onEnter: () => layers.forEach((l, i) => gsap.to(l, { x: i * 12, duration: 0.8, ease: 'power2.out', delay: i * 0.06 })),
  });
}

/* Конвейер линейки: спокойная постоянная лента (без ускорений от скролла) */
function buildMarquee() {
  const belts = Array.from(document.querySelectorAll<HTMLElement>('[data-marquee]'))
    .map((wrap) => {
      const track = wrap.querySelector<HTMLElement>('[data-marquee-track]');
      if (!track) return null;
      return { track, half: track.scrollWidth / 2, x: 0, setX: gsap.quickSetter(track, 'x', 'px') as (v: number) => void };
    })
    .filter(Boolean) as Array<{ track: HTMLElement; half: number; x: number; setX: (v: number) => void }>;
  if (!belts.length) return;
  const recalc = () => belts.forEach((b) => (b.half = b.track.scrollWidth / 2));
  window.addEventListener('resize', recalc, { signal: ac?.signal });
  window.addEventListener('load', recalc, { signal: ac?.signal, once: true });
  let last = 0;
  const SPEED = 26; // px/сек — спокойно
  const tick = (t: number) => {
    marqueeRaf = requestAnimationFrame(tick);
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    if (document.hidden) return;
    belts.forEach((b) => {
      b.x -= SPEED * dt;
      if (b.half > 0) {
        if (b.x <= -b.half) b.x += b.half;
        b.setX(b.x);
      }
    });
  };
  marqueeRaf = requestAnimationFrame(tick);
}

function init() {
  document.documentElement.classList.add('js-ready');

  if (prefersReduced()) {
    setCountersFinal();
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => (el.style.opacity = '1'));
    return;
  }

  ac = new AbortController();

  buildReveals();
  buildCounters();
  buildProgressRail();
  buildHeaderScroll();
  buildFloatingCta();
  buildReviewCard();
  buildBlueprint();
  buildLayers();
  buildMarquee();

  ScrollTrigger.refresh();
  requestAnimationFrame(revealSafetyNet);
  window.addEventListener('load', () => { ScrollTrigger.refresh(); revealSafetyNet(); }, { signal: ac?.signal, once: true });
}

function destroy() {
  cancelAnimationFrame(marqueeRaf);
  ac?.abort();
  ac = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', destroy);

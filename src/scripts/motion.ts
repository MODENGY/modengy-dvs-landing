/* ============================================================
   MODENGY motion island — Lenis + GSAP + ScrollTrigger
   Единый RAF, matchMedia, приоритет prefers-reduced-motion.
   Пересобирается при переходах Astro View Transitions.
   ============================================================ */
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const EASE = 'power4.out'; // ~ cubic-bezier(0.16,1,0.3,1)
let lenis: Lenis | null = null;
let mm: gsap.MatchMedia | null = null;
let marqueeCleanup: Array<() => void> = [];
let heroDone = false;
let particleRaf = 0;
let sprayRaf = 0;
let marqueeRaf = 0;
let mobileMode = false; // телефоны: короче/легче анимации
let ac: AbortController | null = null;

function prefersReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initLenis() {
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.2,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        lenis?.scrollTo(el as HTMLElement, { offset: -70 });
      }
    });
  });
}

/* ---------- Пословный сплит (для заголовков) ---------- */
function splitWords(el: HTMLElement): HTMLElement[] {
  const parts = el.textContent!.split(/(\s+)/);
  el.textContent = '';
  const inners: HTMLElement[] = [];
  parts.forEach((w) => {
    if (w.trim() === '') {
      el.appendChild(document.createTextNode(w));
      return;
    }
    const outer = document.createElement('span');
    outer.className = 'word';
    const inner = document.createElement('span');
    inner.className = 'word-inner';
    inner.textContent = w;
    outer.appendChild(inner);
    el.appendChild(outer);
    inners.push(inner);
  });
  return inners;
}

/* Заголовки секций — раскрытие по словам на входе */
function buildSplitHeadings() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const inners = splitWords(el);
    gsap.set(inners, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => gsap.to(inners, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.06 }),
    });
  });
}

/* Reveal-on-scroll — надёжный вылет из сторон, ПО ЭЛЕМЕНТУ (не batch).
   Per-element ScrollTrigger с once → onEnter срабатывает и при перезагрузке,
   если элемент уже в кадре (иначе после F5 внизу страницы всё оставалось невидимым). */
function makeReveal(el: HTMLElement, fromVars: gsap.TweenVars) {
  // телефоны: дистанция меньше, анимации короче — легче GPU
  const m = mobileMode ? 0.42 : 1;
  const hidden: gsap.TweenVars = { ...fromVars, opacity: 0 };
  if (typeof hidden.x === 'number') hidden.x = hidden.x * m;
  if (typeof hidden.y === 'number') hidden.y = hidden.y * m;
  gsap.set(el, hidden);
  const show = () => {
    el.dataset.revd = '1';
    gsap.to(el, { x: 0, y: 0, scale: 1, opacity: 1, duration: mobileMode ? 0.45 : 0.62, ease: 'power3.out', overwrite: true });
  };
  // обратный скролл — элемент «прячется в стену», при возврате вылетит снова
  const hide = () => {
    delete el.dataset.revd;
    gsap.to(el, { ...hidden, duration: mobileMode ? 0.3 : 0.45, ease: 'power2.in', overwrite: true });
  };
  ScrollTrigger.create({ trigger: el, start: 'top 92%', onEnter: show, onLeaveBack: hide });
}

/* data-reveal (пусто)=чередуем слева/справа · "left"/"right"=сбоку · "up"=снизу · "scale"=приближение */
function buildReveals() {
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el, idx) => {
    const dir = el.dataset.reveal;
    const from: gsap.TweenVars = {};
    if (dir === 'left') from.x = -120;
    else if (dir === 'right') from.x = 120;
    else if (dir === 'up') from.y = 64;
    else if (dir === 'scale') {
      from.scale = 0.86;
      from.y = 30;
    } else from.x = idx % 2 === 0 ? -110 : 110;
    makeReveal(el, from);
  });
}

/* Авто-reveal: всё, что НЕ отмечено data-reveal — заголовки, тексты, картинки, кнопки, иконки. */
function buildAutoReveal() {
  const sections = gsap
    .utils
    .toArray<HTMLElement>('section, footer')
    .filter((s) => !s.matches('[data-cases]') && !s.querySelector('[data-hero-media]'));
  const SEL = 'h2:not([data-split]), h3, h4, p, li, img, figcaption, figure, tr, details, a.btn-accent, a.btn-ghost-d, button, .icon-pad';
  let i = 0;
  sections.forEach((s) => {
    s.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (el.closest('[data-reveal]')) return;
      if (el.closest('[data-quiz], [data-cases], [data-marquee], [data-hscroll], [data-split], [data-spraylab]')) return;
      if (el.matches('[data-hero-media], [data-count]')) return;
      const anc = el.parentElement?.closest('[data-autorev]');
      if (anc) return; // предок уже вылетает — не дублируем
      el.dataset.autorev = '1';
      makeReveal(el, { x: i++ % 2 ? 95 : -95 });
    });
  });
}

/* Страховка: после refresh любой reveal-элемент, что уже в кадре/выше, но не проявился
   (onEnter не сработал) — показываем мгновенно. Убирает «после F5 внизу пусто». */
function revealSafetyNet() {
  document.querySelectorAll<HTMLElement>('[data-reveal], [data-autorev]').forEach((el) => {
    if (el.dataset.revd) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
      el.dataset.revd = '1';
      gsap.set(el, { x: 0, y: 0, scale: 1, opacity: 1, clearProps: 'willChange' });
    }
  });
}

/* Mask-раскрытие изображений (clip-path сверху вниз) */
function buildImageReveal() {
  document.querySelectorAll<HTMLElement>('[data-img-reveal]').forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () =>
        gsap.to(el, {
          clipPath: 'inset(0 0 0% 0)',
          duration: 1.1,
          ease: EASE,
          onComplete: () => (el.style.willChange = 'auto'),
        }),
    });
  });
}

/* Счётчики */
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
          duration: 1.5,
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

/* Линия прогресса чтения под хедером */
function buildProgressRail() {
  const fill = document.querySelector<HTMLElement>('[data-rail-fill]');
  if (!fill) return;
  gsap.to(fill, {
    width: '100%',
    ease: 'none',
    scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
  });
}

/* Интро-шторка: логотип + линия, уезжает вверх. Один раз за сессию. */
function buildIntro() {
  const el = document.querySelector<HTMLElement>('[data-intro]');
  if (!el) return;
  if (prefersReduced() || sessionStorage.getItem('mgIntro')) {
    el.remove();
    return;
  }
  sessionStorage.setItem('mgIntro', '1');
  const bar = el.querySelector<HTMLElement>('[data-intro-bar]');
  if (bar) gsap.to(bar, { width: '100%', duration: 0.6, ease: 'power2.inOut' });
  gsap.to(el, { yPercent: -100, duration: 0.7, ease: 'power4.inOut', delay: 0.8, onComplete: () => el.remove() });
}

/* Параллакс-слои (десктоп) */
function buildParallax() {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const speed = parseFloat(el.dataset.speed || '0.15');
    gsap.to(el, {
      yPercent: -speed * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('[data-parallax-scope]') || el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });
  // ВЕЗДЕ авто-параллакс: разные слои плывут с разной скоростью при скролле
  const auto: Array<[string, number]> = [
    ['.sheet-index', -34], // большие номера секций — заметно едут вверх
    ['.glow-soft', 22], // свечения плывут вниз (глубина)
    ['section img.drop-shadow-2xl', -12], // крупные продуктовые картинки
    ['section figure.card-d, section figure.rounded-\\[16px\\]', -8],
  ];
  auto.forEach(([sel, sp]) => {
    gsap.utils.toArray<HTMLElement>(sel).forEach((el) => {
      if (el.closest('[data-cases], [data-hero-media], .fly-overlay, [data-marquee]')) return;
      gsap.to(el, {
        yPercent: sp,
        ease: 'none',
        scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  });
}

/* Hero — кинематографичный вход + «дыхание» glow */
function heroIntro() {
  if (heroDone) return;
  heroDone = true;

  const glow = document.querySelector<HTMLElement>('[data-hero-glow]');
  if (glow) gsap.to(glow, { scale: 1.15, opacity: 0.9, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });

  const tl = gsap.timeline({ defaults: { ease: EASE } });

  const lines = gsap.utils.toArray<HTMLElement>('[data-hero-h1] .line > *');
  if (lines.length) {
    gsap.set(lines, { yPercent: 115 });
    tl.to(lines, { yPercent: 0, duration: 1, stagger: 0.12 }, 0.15);
  }

  const media = document.querySelector<HTMLElement>('[data-hero-media]');
  if (media) {
    gsap.set(media, { y: 34, scale: 0.94 });
    tl.to(media, { opacity: 1, y: 0, scale: 1, duration: 1.1 }, 0.2).add(() => {
      gsap.to(media, { y: -12, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
  }

  const items = gsap.utils.toArray<HTMLElement>('[data-hero-item]');
  if (items.length) {
    gsap.set(items, { y: 22 });
    tl.to(items, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 }, 0.45);
  }
}

/* Hero «вылет»: при скролле баллон уезжает вверх-вбок с наклоном + вспышка спрея */
function buildHeroExit() {
  const media = document.querySelector<HTMLElement>('[data-hero-media]');
  if (!media) return;
  const section = media.closest('section');
  const spray = document.querySelector<HTMLElement>('[data-hero-spray]');
  const tl = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: 1 },
  });
  // только трансформы, без autoAlpha — иначе на возврате баллон «пропадал»
  tl.to(media, { yPercent: -55, xPercent: 14, rotate: 6, scale: 0.9, ease: 'none' }, 0);
  if (spray) tl.fromTo(spray, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 0.85, scale: 1.5, ease: 'none' }, 0);
}

/* «Влёт» элементов: появляются со стороны с лёгким поворотом */
function buildFly() {
  document.querySelectorAll<HTMLElement>('[data-fly]').forEach((el) => {
    const dir = el.dataset.fly || 'up';
    const from =
      dir === 'left' ? { x: -90, rotate: -6 } : dir === 'right' ? { x: 90, rotate: 6 } : { y: 70 };
    gsap.set(el, from);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () =>
        gsap.to(el, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 1.1, ease: EASE }),
    });
  });
}

/* Горизонтальный «конвейер» (пин, десктоп) */
function buildHorizontal() {
  document.querySelectorAll<HTMLElement>('[data-hscroll]').forEach((section) => {
    const track = section.querySelector<HTMLElement>('[data-hscroll-track]');
    if (!track) return;
    track.style.overflow = 'visible'; // при пине скроллим translate'ом, не нативным скроллом
    gsap.to(track, {
      x: () => -(track.scrollWidth - section.clientWidth),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + (track.scrollWidth - section.clientWidth),
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
  });
}

/* Бесшовный конвейер (ручной rAF + wrap) — без прыжков loop и рывков timeScale.
   Скорость плавно растёт от скролла и затухает. Иммунен к reflow (пересчёт half). */
function buildMarquee() {
  const wraps = Array.from(document.querySelectorAll<HTMLElement>('[data-marquee]'));
  if (!wraps.length) return;
  const belts = wraps
    .map((wrap) => {
      const track = wrap.querySelector<HTMLElement>('[data-marquee-track]');
      if (!track) return null;
      const setX = gsap.quickSetter(track, 'x', 'px');
      const belt = { track, half: track.scrollWidth / 2, x: 0, boost: 0, setX };
      return belt;
    })
    .filter(Boolean) as Array<{ track: HTMLElement; half: number; x: number; boost: number; setX: (v: number) => void }>;

  const onScroll = ({ velocity }: { velocity: number }) => {
    const b = Math.min(Math.abs(velocity) * 5, 240);
    belts.forEach((belt) => (belt.boost = Math.max(belt.boost, b)));
  };
  lenis?.on('scroll', onScroll);
  const recalc = () => belts.forEach((belt) => (belt.half = belt.track.scrollWidth / 2));
  window.addEventListener('resize', recalc, { signal: ac?.signal });
  window.addEventListener('load', recalc, { signal: ac?.signal, once: true });

  let last = 0;
  const base = 34; // px/сек
  const tick = (t: number) => {
    marqueeRaf = requestAnimationFrame(tick);
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    if (document.hidden) return;
    belts.forEach((belt) => {
      belt.boost *= 0.9;
      belt.x -= (base + belt.boost) * dt;
      if (belt.half > 0) {
        if (belt.x <= -belt.half) belt.x += belt.half; // бесшовный wrap
        belt.setX(belt.x);
      }
    });
  };
  marqueeRaf = requestAnimationFrame(tick);
  marqueeCleanup.push(() => cancelAnimationFrame(marqueeRaf));
}

/* Магнитные кнопки (точный указатель) */
function buildMagnetic() {
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((btn) => {
    const xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.22);
    });
    btn.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });
}

/* Лёгкие канвас-частицы — жёлтая «пыль покрытия» в hero (десктоп) */
function buildParticles() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-particles]');
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0;
  let h = 0;
  const parts = Array.from({ length: 42 }, () => ({
    x: 0,
    y: 0,
    r: 0.6 + Math.random() * 1.8,
    s: 0.15 + Math.random() * 0.4,
    o: 0.12 + Math.random() * 0.45,
    d: (Math.random() - 0.5) * 0.2,
  }));
  const resize = () => {
    const rect = canvas.parentElement!.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  parts.forEach((p) => {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
  });
  window.addEventListener('resize', resize, { signal: ac?.signal });
  let visible = true;
  new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting)).observe(canvas);
  const tick = () => {
    particleRaf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = '#fdc100';
    for (const p of parts) {
      p.y -= p.s;
      p.x += p.d;
      if (p.y < -4) {
        p.y = h + 4;
        p.x = Math.random() * w;
      }
      if (p.x < -4) p.x = w + 4;
      else if (p.x > w + 4) p.x = -4;
      ctx2d.globalAlpha = p.o;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx2d.fill();
    }
  };
  tick();
}

/* Кинетическая типографика: широкая строка скользит по скроллу */
function buildKinetic() {
  document.querySelectorAll<HTMLElement>('[data-kinetic]').forEach((el) => {
    const toRight = el.dataset.kinetic === 'right';
    gsap.fromTo(
      el,
      { xPercent: toRight ? -22 : 2 },
      {
        xPercent: toRight ? 2 : -22,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      }
    );
  });
}

/* «Дорисовка» SVG-кривых на входе в кадр */
function buildDraw() {
  document.querySelectorAll<SVGPathElement>('path[data-draw]').forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    ScrollTrigger.create({
      trigger: p.closest('svg'),
      start: 'top 82%',
      once: true,
      onEnter: () => gsap.to(p, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }),
    });
  });
}


/* Хедер: при скролле — blur-тень и тонкая нижняя линия (всегда чёрный) */
function buildHeaderScroll() {
  const line = document.querySelector<HTMLElement>('[data-header-line]');
  if (!line) return;
  const onScroll = () => line.classList.toggle('opacity-100', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true, signal: ac?.signal });
  onScroll();
}

/* Плавающий CTA: после 1.5 экрана; прячется, когда форма в вьюпорте */
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

/* Чертёжные выноски hero: рисуются при загрузке (после входа) */
function buildDrawLoad() {
  const paths = gsap.utils.toArray<SVGPathElement>('path[data-draw-load]');
  paths.forEach((p, i) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    gsap.to(p, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut', delay: 1 + i * 0.18 });
  });
}

/* SIGNATURE: чертёж/3D ДВС — хотспоты ↔ карточки ↔ контуры узлов */
function buildBlueprint() {
  const scope = document.querySelector<HTMLElement>('[data-blueprint]');
  if (!scope) return;
  const parts = Array.from(scope.querySelectorAll<SVGGElement>('[data-part]'));
  const cards = Array.from(scope.querySelectorAll<HTMLElement>('[data-app-card]'));
  const spots = Array.from(scope.querySelectorAll<SVGAElement>('[data-hotspot]'));
  const spots3d = Array.from(scope.querySelectorAll<HTMLElement>('[data-spot3d]'));

  const activate = (slug: string | null) => {
    parts.forEach((p) => p.classList.toggle('lit', p.dataset.part === slug));
    cards.forEach((c) => c.classList.toggle('active', c.dataset.appCard === slug));
    spots3d.forEach((s) => s.classList.toggle('lit', s.dataset.spot3d === slug));
    spots.forEach((s) => {
      const on = s.dataset.hotspot === slug;
      gsap.to(s.querySelector('circle.core'), { attr: { r: on ? 7 : 5 }, duration: 0.25, ease: 'power2.out' });
    });
  };

  spots.forEach((s) => {
    s.addEventListener('pointerenter', () => activate(s.dataset.hotspot || null), { signal: ac?.signal });
    s.addEventListener('pointerleave', () => activate(null), { signal: ac?.signal });
  });
  spots3d.forEach((s) => {
    s.addEventListener('pointerenter', () => activate(s.dataset.spot3d || null), { signal: ac?.signal });
    s.addEventListener('pointerleave', () => activate(null), { signal: ac?.signal });
  });
  cards.forEach((c) => {
    c.addEventListener('pointerenter', () => activate(c.dataset.appCard || null), { signal: ac?.signal });
    c.addEventListener('pointerleave', () => activate(null), { signal: ac?.signal });
  });
}

/* 3D-двигатель в «Применении» (desktop): ленивая загрузка, жёлтые точки-проекции */
function buildEngine3D() {
  const wrap = document.querySelector<HTMLElement>('[data-engine3d-wrap]');
  const canvas = wrap?.querySelector<HTMLCanvasElement>('[data-engine3d]');
  if (!wrap || !canvas) return;
  const spotEls = new Map<string, HTMLElement>();
  wrap.querySelectorAll<HTMLElement>('[data-spot3d]').forEach((el) => spotEls.set(el.dataset.spot3d || '', el));

  // якоря узлов в юнитах нормализованной модели (max габарит ≈ 3)
  const ANCHORS = [
    { slug: 'porshni', pos: [0.3, 0.55, 0.5] as [number, number, number] },
    { slug: 'vkladyshi', pos: [0.0, -0.35, 0.55] as [number, number, number] },
    { slug: 'zaslonki', pos: [-0.85, 0.45, 0.3] as [number, number, number] },
    { slug: 'klapany', pos: [-0.2, 0.9, 0.3] as [number, number, number] },
    { slug: 'shlicy', pos: [0.75, -0.3, 0.35] as [number, number, number] },
    { slug: 'krepezh', pos: [0.55, 0.7, 0.4] as [number, number, number] },
  ];

  const base = import.meta.env.BASE_URL;
  let eng: import('./engine3d').Engine3D | null = null;
  ScrollTrigger.create({
    trigger: wrap,
    start: 'top 150%',
    once: true,
    onEnter: () => {
      import('./engine3d').then((mod) => {
        eng = mod.initEngine3D(canvas, `${base}models/engine.glb`, `${base}draco/`, ANCHORS, (slug, x, y, visible) => {
          const el = spotEls.get(slug);
          if (!el) return;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.opacity = visible ? '1' : '0';
          el.style.pointerEvents = visible ? 'auto' : 'none';
        });
        window.addEventListener('resize', () => eng?.resize(), { signal: ac?.signal });
        eng.setActive(ScrollTrigger.isInViewport(wrap)); // если уже в кадре — сразу крутится
      });
    },
  });
  // рендер только когда секция в кадре
  ScrollTrigger.create({
    trigger: wrap,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => eng?.setActive(self.isActive),
  });
}

/* Слои MoS₂: пластины каскадно «разъезжаются» — принцип скольжения слоёв */
function buildLayers() {
  const fig = document.querySelector<HTMLElement>('[data-mos]');
  if (!fig) return;
  const layers = gsap.utils.toArray<SVGGElement>('[data-mos] .mos-layer');
  if (!layers.length) return;
  gsap.set(layers, { x: 0 });
  ScrollTrigger.create({
    trigger: fig,
    start: 'top 78%',
    once: true,
    onEnter: () => {
      layers.forEach((l, i) => {
        gsap.to(l, { x: i * 12, duration: 1.1, ease: 'power4.out', delay: i * 0.08 });
        // лёгкое бесконечное «скольжение» верхних слоёв
        gsap.to(l, { x: `+=${4 + i}`, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.2 });
      });
    },
  });
}

/* Кейсы: каскадное проявление панелей (и десктоп, и мобайл) */
function buildCasesReveal() {
  const panels = gsap.utils.toArray<HTMLElement>('[data-case]');
  if (!panels.length) return;
  gsap.set(panels, { y: 54 });
  panels.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 82%',
      once: true,
      onEnter: () => gsap.to(el, { y: 0, opacity: 1, duration: 1, ease: EASE }),
    });
  });
}

/* Летящий баллон: траектория «плетётся» по вьюпорту, вращается — привязан к скроллу секции (десктоп) */
function buildSprayFlight() {
  const section = document.querySelector<HTMLElement>('[data-cases]');
  const can = section?.querySelector<HTMLElement>('[data-fly-can]');
  const overlay = document.querySelector<HTMLElement>('.fly-overlay');
  if (!section || !can || !overlay) return;
  // показываем fixed-оверлей только пока секция в кадре
  ScrollTrigger.create({
    trigger: section,
    start: 'top 55%',
    end: 'bottom 45%',
    onToggle: (self) => gsap.to(overlay, { autoAlpha: self.isActive ? 1 : 0, duration: 0.35, overwrite: true }),
  });
  const set = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    gsap.fromTo(
      can,
      { x: vw * 0.04, y: vh * 0.08, rotation: -20, scale: 0.8 },
      {
        keyframes: {
          x: [vw * 0.04, vw * 0.55, vw * 0.15, vw * 0.6, vw * 0.08],
          y: [vh * 0.08, vh * 0.3, vh * 0.5, vh * 0.66, vh * 0.82],
          scale: [0.8, 1.05, 0.9, 1.02, 0.85],
          easeEach: 'sine.inOut',
        },
        rotation: 880,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
        },
      }
    );
  };
  set();
  // пересчёт координат при ресайзе
  ScrollTrigger.addEventListener('refreshInit', set);
}

/* Спрей: жёлтые капли из носика баллона, эмиссия при скролле пока секция в кадре (десктоп) */
function buildSpray() {
  const section = document.querySelector<HTMLElement>('[data-cases]');
  const canvas = section?.querySelector<HTMLCanvasElement>('[data-spray]');
  const can = section?.querySelector<HTMLElement>('[data-fly-can]');
  if (!section || !canvas || !can) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0;
  let h = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize, { signal: ac?.signal });

  let inView = false;
  new IntersectionObserver(([e]) => (inView = !!e?.isIntersecting)).observe(section);
  let emit = 0;
  const kick = () => (emit = 7);
  lenis?.on('scroll', kick);
  window.addEventListener('scroll', kick, { passive: true, signal: ac?.signal });

  const parts: Array<{ x: number; y: number; vx: number; vy: number; life: number; r: number }> = [];
  const tick = () => {
    sprayRaf = requestAnimationFrame(tick);
    if (!inView || document.hidden) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    if (emit > 0) {
      emit--;
      const cr = can.getBoundingClientRect();
      const sr = canvas.getBoundingClientRect();
      const nx = cr.left + cr.width * 0.5 - sr.left;
      const ny = cr.top + cr.height * 0.32 - sr.top;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.2832;
        const sp = 1 + Math.random() * 3.2;
        parts.push({ x: nx, y: ny, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 1, r: 1 + Math.random() * 2.4 });
      }
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffb400';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;
      p.life -= 0.018;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life) * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (parts.length > 240) parts.splice(0, parts.length - 240);
  };
  tick();
}

/* Кейсы: горизонтальный пин-скролл ленты + большой баллон, летит справа→налево с поворотом по оси Y */
function buildCasesFly() {
  const section = document.querySelector<HTMLElement>('[data-cases]');
  const track = section?.querySelector<HTMLElement>('[data-cases-track]');
  const overlay = document.querySelector<HTMLElement>('.fly-overlay');
  const canvas = section?.querySelector<HTMLCanvasElement>('[data-can3d]');
  if (!section || !track || !overlay || !canvas) return;

  const glow = overlay.querySelector<HTMLElement>('[data-can-glow]');

  const base = import.meta.env.BASE_URL;
  const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
  const vw = window.innerWidth;

  // Ленивая загрузка three.js + 3D-модели (только у секции — не тормозит старт)
  let can3d: import('./can3d').Can3D | null = null;
  ScrollTrigger.create({
    trigger: section,
    start: 'top 200%',
    once: true,
    onEnter: () => {
      import('./can3d').then((mod) => {
        can3d = mod.initCan3D(canvas, `${base}models/can-capped.glb`, `${base}draco/`, { scale: 2.05 });
        window.addEventListener('resize', () => can3d?.resize(), { signal: ac?.signal });
      });
    },
  });

  const panels = gsap.utils.toArray<HTMLElement>('[data-case]', track);

  // старт: баллон справа за кадром; кейсы не проявлены; лента на месте
  gsap.set(canvas, { yPercent: -50, x: vw, autoAlpha: 0, transformOrigin: '50% 50%' });
  if (glow) gsap.set(glow, { yPercent: -50, x: vw, autoAlpha: 0 });
  gsap.set(panels, { autoAlpha: 0, scale: 0.86, filter: 'blur(12px)' });
  gsap.set(track, { x: 0 });

  // РАЗ И НАВСЕГДА: размер/позиция канваса считаются от реального окна.
  // Квадрат ≤ 56% высоты и ≤ 42% ширины, центр — в области ПОД шапкой → верх не режется никогда.
  const fit = () => {
    // блок КРУПНЕЕ, а модель внутри с запасом (scale 2.05) — при наклоне ничего не срезает
    const s = Math.round(Math.min(window.innerHeight * 0.62, window.innerWidth * 0.44));
    const top = Math.round(window.innerHeight * 0.56);
    [canvas as HTMLElement, glow].forEach((el) => {
      if (!el) return;
      el.style.width = `${s}px`;
      el.style.height = `${s}px`;
      el.style.top = `${top}px`;
    });
    can3d?.resize();
  };
  fit();
  ScrollTrigger.addEventListener('refreshInit', fit);
  marqueeCleanup.push(() => ScrollTrigger.removeEventListener('refreshInit', fit));

  const D = 10;
  const F = 2.2; // фаза 1 (полёт + спавн) — быстрее; дальше — листание кейсов
  const n = Math.max(1, panels.length);

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + (dist() + window.innerHeight * 0.5),
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle: (self) => {
        can3d?.setActive(self.isActive);
        gsap.to(overlay, { autoAlpha: self.isActive ? 1 : 0, duration: 0.3, overwrite: true });
      },
      // покачивание ±49° вокруг лицевой стороны — зад модели (кривой текст Tripo) не показываем
      onUpdate: (self) => can3d?.setRotationY(Math.sin(self.progress * Math.PI * 2.2) * 0.85),
    },
  });

  // ФАЗА 1 (0 → F): лента СТОИТ — листать нельзя. Баллон летит edge-to-edge (полностью),
  // а кейсы СПАВНЯТСЯ за ним каскадом.
  tl.fromTo(
    canvas,
    { x: vw, y: 0, autoAlpha: 0 },
    {
      duration: F,
      ease: 'none',
      keyframes: {
        x: [vw, vw * 0.5, -(vw * 0.5)], // за краем → центр → за краем
        autoAlpha: [0, 1, 1, 1, 0], // виден почти весь полёт
        easeEach: 'sine.inOut',
      },
    },
    0
  );
  if (glow) {
    tl.fromTo(
      glow,
      { x: vw, y: 0, autoAlpha: 0 },
      { duration: F, ease: 'none', keyframes: { x: [vw, vw * 0.5, -(vw * 0.5)], y: [0, -10, 8], autoAlpha: [0, 0.65, 0], easeEach: 'sine.inOut' } },
      0
    );
  }
  // кейсы появляются ПОСЛЕ пролёта баллона над ними: каждая панель ждёт,
  // пока баллон (правый→левый) пройдёт её центр, и плавно проявляется за его хвостом
  const canW = () => parseFloat(canvas.style.width) || window.innerHeight * 0.5;
  panels.forEach((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    // x баллона: vw → -0.5vw (путь 1.5vw); +0.7 ширины канваса = хвост уже прошёл
    const tAt = F * Math.min(0.92, Math.max(0.08, (vw - cx + canW() * 0.7) / (vw * 1.5)));
    tl.to(el, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power2.out' }, tAt);
    // внутренности панели вылетают каскадом из сторон вслед за спавном
    const bits = el.querySelectorAll<HTMLElement>('figure, h3, p, a, .font-mono');
    gsap.set(bits, { opacity: 0, x: (bi: number) => (bi % 2 ? 54 : -54) });
    tl.to(bits, { opacity: 1, x: 0, duration: 0.7, stagger: 0.07, ease: 'power2.out' }, tAt + 0.12);
  });

  // ФАЗА 2 (F → D): баллона нет — теперь ЛИСТАЕМ кейсы (лента едет справа→налево).
  tl.to(track, { x: () => -dist(), ease: 'none', duration: D - F }, F);
}

/* Живые зацикленные 3D-баллоны: hero (парит и крутится, подменяет картинку)
   + блок «Материал» (интерактивный — крути мышкой). Грузятся после простоя, не мешают LCP. */
function buildIdleCans() {
  const base = import.meta.env.BASE_URL;
  const make = (canvas: HTMLCanvasElement | null, drag: boolean, model: string, scale: number, dropY: number, onLoaded?: () => void) => {
    if (!canvas) return;
    import('./can3d').then((mod) => {
      const c3 = mod.initCan3D(canvas, `${base}models/${model}`, `${base}draco/`, { idle: true, drag, scale, dropY, soft: drag, onLoaded });
      new IntersectionObserver(([e]) => c3.setActive(!!e?.isIntersecting)).observe(canvas);
      window.addEventListener('resize', () => c3.resize(), { signal: ac?.signal });
    });
  };
  const heroCanvas = document.querySelector<HTMLCanvasElement>('[data-hero-can3d]');
  const heroImg = document.querySelector<HTMLElement>('[data-hero-img]');
  const matCanvas = document.querySelector<HTMLCanvasElement>('[data-mat-can3d]');
  if (!heroCanvas && !matCanvas) return;
  const start = () => {
    make(heroCanvas, false, 'can-capped.glb', 2.15, -0.44, () => {
      // hero-баллон ниже — стоит на glow
      gsap.to(heroCanvas, { autoAlpha: 1, duration: 0.9 });
      if (heroImg) gsap.to(heroImg, { autoAlpha: 0, duration: 0.9, delay: 0.25 });
    });
    make(matCanvas, true, 'can-nocap-clean.glb', 2.35, -0.42); // ОТКРЫТЫЙ баллон (крышка вырезана), ниже в кадре
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => void }).requestIdleCallback;
  if (ric) ric(start, { timeout: 4000 });
  else setTimeout(start, 2000);
}

/* 3D-коленвал в «Паспорте»: вращается вокруг горизонтальной оси; при 404 канвас прячется */
function buildCrank3D() {
  const wrap = document.querySelector<HTMLElement>('[data-crank-wrap]');
  const canvas = wrap?.querySelector<HTMLCanvasElement>('[data-crank3d]');
  if (!wrap || !canvas) return;
  const base = import.meta.env.BASE_URL;
  ScrollTrigger.create({
    trigger: wrap,
    start: 'top 140%',
    once: true,
    onEnter: () => {
      import('./can3d').then((mod) => {
        const c3 = mod.initCan3D(canvas, `${base}models/crankshaft.glb`, `${base}draco/`, {
          stroke: true,
          axis: 'x',
          drag: true,
          scale: 2.6,
          onError: () => {
            wrap.style.display = 'none'; // модели ещё нет — блок не показываем
            ScrollTrigger.refresh();
          },
        });
        new IntersectionObserver(([e]) => c3.setActive(!!e?.isIntersecting)).observe(canvas);
      });
    },
  });
}

/* ШОУКЕЙС БАЛЛОНА: пин, скролл вращает баллон на 360°, чипы-факты вылетают поэтапно */
function buildShowcase() {
  const section = document.querySelector<HTMLElement>('[data-showcase]');
  const canvas = section?.querySelector<HTMLCanvasElement>('[data-sc-can]');
  if (!section || !canvas) return;
  const chips = gsap.utils.toArray<HTMLElement>('[data-sc-chip]', section);
  const base = import.meta.env.BASE_URL;

  let c3: import('./can3d').Can3D | null = null;
  ScrollTrigger.create({
    trigger: section,
    start: 'top 180%',
    once: true,
    onEnter: () => {
      import('./can3d').then((mod) => {
        c3 = mod.initCan3D(canvas, `${base}models/can-capped.glb`, `${base}draco/`, { scale: 2.2 });
      });
    },
  });

  gsap.set(canvas, { scale: 0.72, autoAlpha: 0, yPercent: -44 });
  gsap.set(chips, { autoAlpha: 0 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: '+=240%',
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle: (self) => c3?.setActive(self.isActive),
      onUpdate: (self) => c3?.setRotationY(self.progress * Math.PI * 2), // полный оборот
    },
  });
  // баллон плавно «выплывает»
  tl.to(canvas, { scale: 1, autoAlpha: 1, yPercent: -50, duration: 1.6, ease: 'power2.out' }, 0);
  // чипы вылетают из своих стен по очереди
  chips.forEach((chip, i) => {
    tl.fromTo(
      chip,
      { x: i % 2 ? 110 : -110, autoAlpha: 0 }, // левые чипы — слева, правые — справа
      { x: 0, autoAlpha: 1, duration: 1.1, ease: 'power3.out' },
      1.4 + i * 1.35
    );
  });
  // финал: лёгкое общее «дыхание»
  tl.to(canvas, { scale: 1.04, duration: 1.4, ease: 'sine.inOut' }, 1.4 + chips.length * 1.35);
}

/* 3D-цех нанесения: баллон облетает поршень и напыляет частицы (ниже двигателя) */
function buildCoat3D() {
  const wrap = document.querySelector<HTMLElement>('[data-coat3d-wrap]');
  const canvas = wrap?.querySelector<HTMLCanvasElement>('[data-coat3d]');
  if (!wrap || !canvas) return;
  const base = import.meta.env.BASE_URL;
  ScrollTrigger.create({
    trigger: wrap,
    start: 'top 150%',
    once: true,
    onEnter: () => {
      import('./coat3d').then((mod) => {
        const c3 = mod.initCoat3D(canvas, `${base}models/engine.glb`, `${base}models/can-nocap.glb`, `${base}draco/`);
        new IntersectionObserver(([e]) => c3.setActive(!!e?.isIntersecting)).observe(canvas);
      });
    },
  });
}

/* 3D-поршень в «Проблеме»: ходит вверх-вниз как в цилиндре + медленно вращается */
function buildPiston3D() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-piston3d]');
  if (!canvas) return;
  const base = import.meta.env.BASE_URL;
  ScrollTrigger.create({
    trigger: canvas,
    start: 'top 140%',
    once: true,
    onEnter: () => {
      import('./can3d').then((mod) => {
        const c3 = mod.initCan3D(canvas, `${base}models/piston.glb`, `${base}draco/`, { stroke: true, scale: 2.0, dropY: -0.05 });
        new IntersectionObserver(([e]) => c3.setActive(!!e?.isIntersecting)).observe(canvas);
      });
    },
  });
}

/* Плавающая карточка «Оставить отзыв»: выезжает слева на середине прокрутки,
   звёзды подсвечиваются, клик → реальная страница отзывов MODENGY. */
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
      gsap.to(card, { xPercent: on ? 0 : -150, autoAlpha: on ? 1 : 0, duration: 0.5, ease: 'power3.out', overwrite: true });
    },
  });
  // крестик закрытия — прячем на всю сессию
  card.querySelector<HTMLElement>('[data-review-close]')?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closed = true;
      st.disable();
      gsap.to(card, { xPercent: -150, autoAlpha: 0, duration: 0.4, ease: 'power3.in', overwrite: true });
    },
    { signal: ac?.signal }
  );
  // звёзды подсвечиваются слева-направо
  const stars = Array.from(card.querySelectorAll<HTMLElement>('[data-star]'));
  stars.forEach((star, i) => {
    star.addEventListener('pointerenter', () => stars.forEach((s, j) => s.classList.toggle('lit', j <= i)), { signal: ac?.signal });
  });
  card.addEventListener('pointerleave', () => stars.forEach((s) => s.classList.remove('lit')), { signal: ac?.signal });
}

function init() {
  document.documentElement.classList.add('js-ready');
  buildIntro();

  if (prefersReduced()) {
    setCountersFinal();
    return;
  }

  ac = new AbortController();
  initLenis();

  mm = gsap.matchMedia();
  mm.add(
    {
      isDesktop: '(min-width: 1024px) and (hover: hover) and (pointer: fine)',
      isMobile: '(max-width: 1023px)',
    },
    (ctx) => {
      const { isDesktop } = ctx.conditions as { isDesktop: boolean; isMobile: boolean };
      mobileMode = !isDesktop;
      heroIntro();
      buildSplitHeadings();
      buildReveals();
      buildAutoReveal();
      buildImageReveal();
      buildFly();
      buildCounters();
      buildMarquee();
      buildKinetic();
      buildDraw();
      buildDrawLoad();
      buildHeaderScroll();
      buildProgressRail();
      buildReviewCard();
      buildBlueprint();
      buildLayers();
      if (isDesktop) {
        buildParallax();
        buildHorizontal();
        buildMagnetic();
        buildHeroExit();
        buildParticles();
        buildFloatingCta();
        buildCasesFly();
        buildEngine3D();
        buildIdleCans();
        buildPiston3D();
        buildCrank3D();
      }
    }
  );

  ScrollTrigger.refresh();
  // страховка от «после F5 внизу пусто»: показать всё, что уже в кадре и не проявилось
  requestAnimationFrame(revealSafetyNet);
  ScrollTrigger.addEventListener('refresh', revealSafetyNet);
  // ещё раз после полной загрузки картинок (лэйаут мог сдвинуться)
  window.addEventListener('load', () => { ScrollTrigger.refresh(); revealSafetyNet(); }, { signal: ac?.signal, once: true });
}

function destroy() {
  cancelAnimationFrame(particleRaf);
  cancelAnimationFrame(sprayRaf);
  cancelAnimationFrame(marqueeRaf);
  ac?.abort();
  ac = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  marqueeCleanup.forEach((fn) => fn());
  marqueeCleanup = [];
  mm?.revert();
  mm = null;
  lenis?.destroy();
  lenis = null;
  heroDone = false;
  gsap.ticker.lagSmoothing(1000, 16);
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', destroy);

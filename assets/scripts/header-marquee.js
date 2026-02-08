/**
 * Ping-pong marquee for clipped header titles.
 *
 * Uses the native scrollLeft property on the overflow:hidden container.
 * Re-queries the DOM element each frame to handle MkDocs Material replacing
 * the element when scrolling past section headings.
 *
 * Configurable via CSS custom properties:
 *   --ub-marquee-speed      scroll speed in px/sec  (default 40)
 *   --ub-marquee-pause-ms   pause at each end in ms (default 1200)
 */
document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  const cssSpeed  = parseFloat(getComputedStyle(root).getPropertyValue('--ub-marquee-speed')) || 0;
  const SPEED     = cssSpeed > 0 ? cssSpeed : 40;
  const cssPause  = parseInt(getComputedStyle(root).getPropertyValue('--ub-marquee-pause-ms'), 10) || 0;
  const PAUSE     = cssPause > 0 ? cssPause : 1200;

  const SELECTOR = '.md-header__title .md-ellipsis';

  /* ---- animation state (global, not per-element) ---- */
  let raf      = null;
  let prev     = 0;
  let pos      = 0;
  let dir      = 1;
  let going    = false;
  let paused   = false;
  let lastText = '';

  function getEl() {
    return document.querySelector(SELECTOR);
  }

  function maxScroll(el) {
    return el ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
  }

  function tick(ts) {
    if (!going || paused) return;

    const el = getEl();
    if (!el) { raf = requestAnimationFrame(tick); return; }

    /* Check if text changed — if so, reset to start */
    const currentText = el.textContent.trim();
    if (currentText !== lastText) {
      lastText = currentText;
      pos = 0;
      dir = 1;
      prev = 0;
      el.scrollLeft = 0;
      // Re-evaluate if marquee is needed
      const mx = maxScroll(el);
      if (mx > 2) {
        el.classList.add('is-marquee');
      } else {
        el.classList.remove('is-marquee');
        going = false;
        return;
      }
    }

    if (!prev) { prev = ts; raf = requestAnimationFrame(tick); return; }
    const dt = (ts - prev) / 1000;
    prev = ts;

    pos += SPEED * dt * dir;
    const mx = maxScroll(el);

    /* hit far end */
    if (dir === 1 && pos >= mx) {
      pos = mx;
      el.scrollLeft = pos;
      paused = true;
      setTimeout(() => { dir = -1; prev = 0; paused = false; raf = requestAnimationFrame(tick); }, PAUSE);
      return;
    }

    /* hit home end */
    if (dir === -1 && pos <= 0) {
      pos = 0;
      el.scrollLeft = 0;
      paused = true;
      setTimeout(() => { dir = 1; prev = 0; paused = false; raf = requestAnimationFrame(tick); }, PAUSE);
      return;
    }

    el.scrollLeft = pos;
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (going) return;
    const el = getEl();
    if (!el) return;
    if (maxScroll(el) < 2) return;
    lastText = el.textContent.trim();
    el.classList.add('is-marquee');
    going  = true;
    paused = false;
    prev   = 0;
    raf    = requestAnimationFrame(tick);
  }

  function stop() {
    going  = false;
    paused = false;
    if (raf) cancelAnimationFrame(raf);
    raf  = null;
    pos  = 0;
    dir  = 1;
    prev = 0;
    const el = getEl();
    if (el) {
      el.scrollLeft = 0;
      el.classList.remove('is-marquee');
    }
  }

  function check() {
    const el = getEl();
    if (!el) return;
    if (maxScroll(el) > 2) {
      start();
    } else {
      stop();
    }
  }

  /* ---- observers ---- */
  window.addEventListener('resize', () => { stop(); requestAnimationFrame(check); });

  /* Initial start */
  requestAnimationFrame(check);
  setTimeout(check, 600);
});

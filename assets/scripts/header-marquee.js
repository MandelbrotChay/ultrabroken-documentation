/**
 * Ping-pong marquee for clipped header titles.
 *
 * Uses the native scrollLeft property on the overflow:hidden container.
 * Overflow detection is simply  el.scrollWidth > el.clientWidth — no
 * inner-span wrappers or transform tricks needed.
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

  document.querySelectorAll('.md-header__title .md-ellipsis').forEach(el => {
    if (el.dataset.ubMarquee) return;
    el.dataset.ubMarquee = '1';

    /* ---- clean up DOM left by earlier marquee versions ---- */
    const oldInner = el.querySelector('.ub-marquee-inner');
    if (oldInner) el.textContent = oldInner.textContent;
    const oldTrack = el.querySelector('.marquee-track');
    if (oldTrack) {
      const items = oldTrack.querySelectorAll('.marquee-item');
      el.textContent = items.length ? items[0].textContent : oldTrack.textContent;
    }

    /* ---- animation state ---- */
    let raf   = null;
    let prev  = 0;      // previous rAF timestamp
    let pos   = 0;      // virtual scrollLeft position
    let dir   = 1;      // 1 = forward (right), -1 = backward (left)
    let going = false;

    function maxScroll() {
      return Math.max(0, el.scrollWidth - el.clientWidth);
    }

    function tick(ts) {
      if (!going) return;
      if (!prev) { prev = ts; raf = requestAnimationFrame(tick); return; }
      const dt = (ts - prev) / 1000;
      prev = ts;

      pos += SPEED * dt * dir;
      const mx = maxScroll();

      /* hit far end */
      if (dir === 1 && pos >= mx) {
        pos = mx;
        el.scrollLeft = pos;
        going = false;
        setTimeout(() => { dir = -1; prev = 0; going = true; raf = requestAnimationFrame(tick); }, PAUSE);
        return;
      }

      /* hit home end */
      if (dir === -1 && pos <= 0) {
        pos = 0;
        el.scrollLeft = 0;
        going = false;
        setTimeout(() => { dir = 1; prev = 0; going = true; raf = requestAnimationFrame(tick); }, PAUSE);
        return;
      }

      el.scrollLeft = pos;
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (going) return;
      if (maxScroll() < 2) return;
      going = true;
      prev  = 0;
      raf   = requestAnimationFrame(tick);
    }

    function stop() {
      going = false;
      if (raf) cancelAnimationFrame(raf);
      raf  = null;
      pos  = 0;
      dir  = 1;
      prev = 0;
      el.scrollLeft = 0;
    }

    function check() {
      if (maxScroll() > 2) {
        el.classList.add('is-marquee');
        start();
      } else {
        el.classList.remove('is-marquee');
        stop();
      }
    }

    /* ---- observers ---- */
    if (window.ResizeObserver) {
      new ResizeObserver(() => { stop(); requestAnimationFrame(check); }).observe(el);
    } else {
      window.addEventListener('resize', () => { stop(); requestAnimationFrame(check); });
    }

    /* Track text content and reset marquee only when it actually changes
       (e.g. when scrolling past section headings and MkDocs updates the
       header to show the current section name). */
    let lastText = el.textContent.trim();
    if (window.MutationObserver) {
      const mo = new MutationObserver(() => {
        const newText = el.textContent.trim();
        if (newText !== lastText) {
          lastText = newText;
          stop();
          requestAnimationFrame(check);
        }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }

    requestAnimationFrame(check);
    setTimeout(check, 600);
  });
});

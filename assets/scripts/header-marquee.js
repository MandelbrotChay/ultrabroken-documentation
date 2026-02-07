document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Allow overriding speed via CSS variable `--ub-marquee-speed` (px/sec).
  const cssSpeed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ub-marquee-speed')) || 0;
  const SPEED_PX_PER_SEC = cssSpeed > 0 ? cssSpeed : 40; // unified scroll speed (px/sec)
  // Allow overriding pause via CSS variable `--ub-marquee-pause-ms` (ms).
  const cssPause = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ub-marquee-pause-ms')) || 0;
  const PAUSE_MS = cssPause > 0 ? cssPause : 1200; // pause at each end (ms)
  const GAP = 24; // px gap before reset

  const containers = document.querySelectorAll('.md-header__title .md-ellipsis');
  containers.forEach(container => {
    if (container.dataset.ubMarqueeInitialized) return;
    container.dataset.ubMarqueeInitialized = '1';

    const contentHtml = container.innerHTML.trim();
    const inner = document.createElement('span');
    inner.className = 'ub-marquee-inner';
    inner.style.display = 'inline-block';
    inner.style.whiteSpace = 'nowrap';
    inner.innerHTML = contentHtml;

    container.innerHTML = '';
    container.appendChild(inner);

    let rafId = null;
    let lastTs = 0;
    let offset = 0;
    let running = false;
    let dir = 1; // 1 = scroll right-to-left (increase offset), -1 = scroll left-to-right (decrease offset)

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      offset += SPEED_PX_PER_SEC * dt * dir;

      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      const maxShift = Math.max(0, itemWidth - containerWidth + GAP);

      // reached right end (max scroll)
      if (offset >= maxShift) {
        offset = maxShift;
        inner.style.transform = `translateX(${-offset}px)`;
        running = false;
        setTimeout(() => {
          dir = -1; // reverse direction
          lastTs = 0;
          running = true;
          rafId = requestAnimationFrame(tick);
        }, PAUSE_MS);
        return;
      }

      // reached left end (no scroll)
      if (offset <= 0) {
        offset = 0;
        inner.style.transform = 'translateX(0)';
        running = false;
        setTimeout(() => {
          dir = 1; // reverse direction
          lastTs = 0;
          running = true;
          rafId = requestAnimationFrame(tick);
        }, PAUSE_MS);
        return;
      }

      inner.style.transform = `translateX(${-offset}px)`;
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      offset = 0;
      inner.style.transform = 'translateX(0)';
      lastTs = 0;
      dir = 1; // reset direction
    }

    function update() {
      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      if (itemWidth > containerWidth + 2) {
        container.classList.add('is-marquee');
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', inner.textContent.trim());
        start();
      } else {
        container.classList.remove('is-marquee');
        container.removeAttribute('tabindex');
        container.removeAttribute('aria-label');
        stop();
      }
    }

    container.addEventListener('pointerenter', () => start());
    container.addEventListener('focus', () => start());

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        stop();
        requestAnimationFrame(update);
      });
      ro.observe(container);
      ro.observe(inner);
    } else {
      window.addEventListener('resize', () => {
        stop();
        requestAnimationFrame(update);
      });
    }

    requestAnimationFrame(update);
    setTimeout(update, 500);
  });
});

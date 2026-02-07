document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SPEED_PX_PER_SEC = 40; // unified scroll speed
  const GAP = 24; // px gap before reset
  const PAUSE_MS = 1200; // pause at each end (increased)

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
    let dir = 1; // 1 -> move left (increase offset), -1 -> move right (decrease offset)

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      offset += SPEED_PX_PER_SEC * dt * dir;

      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      const maxShift = Math.max(0, itemWidth - containerWidth + GAP);

      if (offset >= maxShift) {
        offset = maxShift;
        inner.style.transform = `translateX(${-offset}px)`;
        running = false;
        setTimeout(() => {
          dir = -1;
          lastTs = 0;
          running = true;
          rafId = requestAnimationFrame(tick);
        }, PAUSE_MS);
        return;
      }

      if (offset <= 0) {
        offset = 0;
        inner.style.transform = 'translateX(0)';
        running = false;
        setTimeout(() => {
          dir = 1;
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
      dir = 1;
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

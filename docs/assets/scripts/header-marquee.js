document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const containers = document.querySelectorAll('.md-header__title .md-ellipsis');
  containers.forEach(container => {
    // avoid processing twice
    if (container.dataset.ubMarqueeInitialized) return;
    container.dataset.ubMarqueeInitialized = '1';

    // wrap existing text into marquee item
    const contentHtml = container.innerHTML.trim();
    // create track and two items for seamless loop
    const track = document.createElement('div');
    track.className = 'marquee-track';
    const item1 = document.createElement('span');
    item1.className = 'marquee-item';
    item1.innerHTML = contentHtml;
    const item2 = item1.cloneNode(true);
    // clear and append
    container.innerHTML = '';
    container.appendChild(track);
    track.appendChild(item1);
    track.appendChild(item2);

    // measurements and toggle
    function updateMarquee() {
      // ensure track items are inline-block for accurate width
      item1.style.display = 'inline-block';
      item2.style.display = 'inline-block';
      item1.style.whiteSpace = 'nowrap';
      item2.style.whiteSpace = 'nowrap';

      const containerWidth = container.clientWidth;
      const itemWidth = item1.scrollWidth;
      const gap = 24; // px gap between repetitions

      if (itemWidth > containerWidth + 2) {
        const distance = itemWidth + gap;
        const speed = 60; // px per second
        const duration = Math.max(4, Math.round(distance / speed));

        // set CSS vars and animation duration
        track.style.setProperty('--marquee-distance', distance + 'px');
        track.style.animationDuration = duration + 's';

        container.classList.add('is-marquee');
        // Autoplay when clipped
        track.style.animationPlayState = 'running';
        // keyboard accessibility
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', item1.textContent.trim());
      } else {
        container.classList.remove('is-marquee');
        track.style.animationDuration = '';
        track.style.removeProperty('--marquee-distance');
        track.style.animationPlayState = 'paused';
        container.removeAttribute('tabindex');
        container.removeAttribute('aria-label');
      }
    }

    // start/pause on pointer enter/leave for pointer devices
    container.addEventListener('pointerenter', () => {
      const trackEl = container.querySelector('.marquee-track');
      if (trackEl) trackEl.style.animationPlayState = 'running';
    });
    container.addEventListener('pointerleave', () => {
      const trackEl = container.querySelector('.marquee-track');
      if (trackEl) trackEl.style.animationPlayState = 'paused';
    });

    // focus/blur for keyboard
    container.addEventListener('focus', () => {
      const trackEl = container.querySelector('.marquee-track');
      if (trackEl) trackEl.style.animationPlayState = 'running';
    });
    container.addEventListener('blur', () => {
      const trackEl = container.querySelector('.marquee-track');
      if (trackEl) trackEl.style.animationPlayState = 'paused';
    });

    // react to resize and content changes
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => requestAnimationFrame(updateMarquee));
      ro.observe(container);
      ro.observe(item1);
    } else {
      window.addEventListener('resize', () => requestAnimationFrame(updateMarquee));
    }

    // initial and delayed update (fonts/images)
    requestAnimationFrame(updateMarquee);
    setTimeout(updateMarquee, 500);
  });
});
// Unified RAF-based marquee only (old CSS-animation implementation removed)
document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SPEED_PX_PER_SEC = 40; // unified scroll speed for all titles
  const GAP = 24; // gap before reset

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

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      offset += SPEED_PX_PER_SEC * dt;

      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      const maxShift = Math.max(0, itemWidth - containerWidth + GAP);

      if (offset >= maxShift) {
        // reach end — pause briefly then reset
        inner.style.transform = `translateX(${-maxShift}px)`;
        running = false;
        setTimeout(() => {
          offset = 0;
          inner.style.transform = `translateX(0)`;
          lastTs = performance.now();
          running = true;
          rafId = requestAnimationFrame(tick);
        }, 600);
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
    }

    function update() {
      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      if (itemWidth > containerWidth + 2) {
        container.classList.add('is-marquee');
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', inner.textContent.trim());
        start(); // autoplay when clipped
      } else {
        container.classList.remove('is-marquee');
        container.removeAttribute('tabindex');
        container.removeAttribute('aria-label');
        stop();
      }
    }

    // pointer/focus controls
    container.addEventListener('pointerenter', () => start());
    container.addEventListener('pointerleave', () => {}); // keep autoplay
    container.addEventListener('focus', () => start());
    container.addEventListener('blur', () => {});

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
document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SPEED_PX_PER_SEC = 40; // unified scroll speed for all titles
  const GAP = 24; // gap before reset

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

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      offset += SPEED_PX_PER_SEC * dt;

      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      const maxShift = Math.max(0, itemWidth - containerWidth + GAP);

      if (offset >= maxShift) {
        // reach end — pause briefly then reset
        inner.style.transform = `translateX(${-maxShift}px)`;
        running = false;
        setTimeout(() => {
          offset = 0;
          inner.style.transform = `translateX(0)`;
          lastTs = performance.now();
          running = true;
          rafId = requestAnimationFrame(tick);
        }, 600);
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
    }

    function update() {
      const itemWidth = inner.scrollWidth;
      const containerWidth = container.clientWidth;
      if (itemWidth > containerWidth + 2) {
        container.classList.add('is-marquee');
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', inner.textContent.trim());
        start(); // autoplay when clipped
      } else {
        container.classList.remove('is-marquee');
        container.removeAttribute('tabindex');
        container.removeAttribute('aria-label');
        stop();
      }
    }

    // pointer/focus controls
    container.addEventListener('pointerenter', () => start());
    container.addEventListener('pointerleave', () => {}); // keep autoplay
    container.addEventListener('focus', () => start());
    container.addEventListener('blur', () => {});

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

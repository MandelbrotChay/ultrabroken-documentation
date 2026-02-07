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

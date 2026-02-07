document.addEventListener('DOMContentLoaded', function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return; // respect reduced motion
  }

  const containers = document.querySelectorAll('.md-header__title .md-ellipsis');
  containers.forEach(function (container) {
    // Ensure element exists and has measurable overflow
    const inner = container.querySelector('.marquee-inner') || (function () {
      // wrap existing children into marquee-inner
      const span = document.createElement('span');
      span.className = 'marquee-inner';
      while (container.firstChild) {
        span.appendChild(container.firstChild);
      }
      container.appendChild(span);
      return span;
    })();

    function update() {
      // Ensure inner uses inline-block for accurate width measurement
      inner.style.display = 'inline-block';
      inner.style.whiteSpace = 'nowrap';
      // Use clientWidth and scrollWidth to detect overflow
      const containerWidth = container.clientWidth;
      const contentWidth = inner.scrollWidth;
      if (contentWidth > containerWidth + 2) { // slight tolerance
        const distance = contentWidth - containerWidth;
        // Set CSS vars on container for use by CSS animation
        container.style.setProperty('--marquee-distance', distance + 'px');
        // duration proportional to distance (50px/sec pace) and min 4s
        const duration = Math.max(4, Math.round(distance / 50));
        inner.style.animationDuration = duration + 's';
        container.classList.add('is-marquee');
        // Make keyboard accessible
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', inner.textContent.trim());
      } else {
        container.classList.remove('is-marquee');
        container.removeAttribute('tabindex');
        container.removeAttribute('aria-label');
        inner.style.animationDuration = '';
        container.style.removeProperty('--marquee-distance');
      }
    }

    // Initial check and on resize
    // Use rAF to ensure layout is settled before measuring
    requestAnimationFrame(update);
    let resizeObserver = null;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(function () { requestAnimationFrame(update); });
      resizeObserver.observe(container);
      resizeObserver.observe(inner);
    } else {
      window.addEventListener('resize', function () { requestAnimationFrame(update); });
    }

    // Start/stop on pointer enter/leave for pointer-capable devices
    container.addEventListener('pointerenter', function () {
      if (container.classList.contains('is-marquee')) inner.style.animationPlayState = 'running';
    });
    container.addEventListener('pointerleave', function () {
      inner.style.animationPlayState = 'paused';
    });
  });
});

/**
 * Clipboard Permalink Script
 * Click any heading to copy its permalink to clipboard
 * Uses event delegation for instant navigation compatibility
 */

(function() {
  // Use event delegation - attach ONE listener that works for all headings, 
  // present and future (handles instant navigation automatically)
  document.addEventListener('click', function(e) {
    // Check if the clicked element is a heading within .md-content
    const heading = e.target.closest('.md-content h1, .md-content h2, .md-content h3, .md-content h4, .md-content h5, .md-content h6');
    
    if (heading && heading.id) {
      const id = heading.id;
      const permalink = window.location.href.split('#')[0] + '#' + id;
      
      navigator.clipboard.writeText(permalink).then(() => {
          // Show a transient checkmark next to the heading instead of replacing text
        try {
          // If a previous check exists, clear its timeout and remove it first
          const prev = heading.querySelector('.ub-copy-check');
          if (prev) {
            if (prev._ubTimeout) clearTimeout(prev._ubTimeout);
            prev.remove();
          }

          const check = document.createElement('span');
          check.className = 'ub-copy-check';
          check.setAttribute('aria-hidden', 'true');
          // Use the local share SVG instead of a plain checkmark character
            // Insert the SVG inline so it inherits `color` and scales with the
            // heading's font-size. Use DOM creation with the same path data
            // as `share-local.svg`.
            const SVG_NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-hidden', 'true');
            svg.style.width = '1em';
            svg.style.height = '1em';
            svg.style.display = 'inline-block';
            svg.style.verticalAlign = 'text-bottom';
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 0 0 3-3 3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66 0 1.61 1.31 2.91 2.92 2.91s2.92-1.3 2.92-2.91A2.92 2.92 0 0 0 18 16.08');
            path.setAttribute('fill', 'currentColor');
            svg.appendChild(path);
            check.appendChild(svg);
          heading.appendChild(check);

          // Trigger visible state for CSS transition
          requestAnimationFrame(() => check.classList.add('ub-copy-check--visible'));

          // Remove after short delay
          const t = setTimeout(() => {
            check.classList.remove('ub-copy-check--visible');
            setTimeout(() => { if (check.parentNode) check.parentNode.removeChild(check); }, 180);
          }, 1400);
          // store timeout so we can clear if another copy happens quickly
          check._ubTimeout = t;
        } catch (err) {
          console.error('Clipboard feedback error:', err);
        }
        // Also show global copied-to-clipboard toast to match search share UI
        try {
          showCopiedToast && showCopiedToast('Copied to clipboard');
        } catch (e) {}
      }).catch(err => {
        console.error('Failed to copy permalink:', err);
      });
    }
  });
})();

// Lightweight global toast for "Copied to clipboard" messages.
// Exposed at module level so other scripts can reuse it.
function showCopiedToast(message) {
  try {
    // Reuse Material's dialog markup so the theme's built-in styles apply.
    const id = 'ub-global-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'md-dialog';
      el.setAttribute('data-md-component', 'dialog');
      document.body.appendChild(el);
    }
    // Use the theme dialog inner so fonts, sizing and shadow match exactly.
    el.innerHTML = '<div class="md-dialog__inner md-typeset" role="status" aria-live="polite">' + (message || 'Copied to clipboard') + '</div>';
    // Show by adding the active class the theme watches
    el.classList.add('md-dialog--active');
    // Clear any previous hide timer
    if (el._ubHideTimer) {
      clearTimeout(el._ubHideTimer);
      el._ubHideTimer = null;
    }
    // Hide after a short delay, then remove element after the theme's hide animation
    el._ubHideTimer = setTimeout(() => {
      el.classList.remove('md-dialog--active');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 1400);
  } catch (e) { console.error('showCopiedToast error', e); }
}

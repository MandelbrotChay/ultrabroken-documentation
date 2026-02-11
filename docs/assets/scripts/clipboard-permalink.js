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
            const img = document.createElement('img');
            img.alt = '';
            // Resolve the SVG path relative to this script's URL so hosting under
            // a subpath (site base) still resolves correctly. This avoids relying
            // on the site root.
            const scriptSrc = (document.currentScript && document.currentScript.src) || (function() {
              const scripts = document.getElementsByTagName('script');
              for (let i = scripts.length - 1; i >= 0; i--) {
                const s = scripts[i];
                if (s.src && s.src.indexOf('clipboard-permalink.js') !== -1) return s.src;
              }
              return location.href;
            })();
            img.src = new URL('../images/share-local.svg', scriptSrc).href;
            img.width = 16;
            img.height = 16;
            img.style.display = 'inline-block';
            img.style.verticalAlign = 'text-bottom';
            check.appendChild(img);
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
    const id = 'ub-global-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'ub-toast';
      document.body.appendChild(el);
    }
    el.textContent = message || 'Copied to clipboard';
    // trigger visible state
    requestAnimationFrame(() => el.classList.add('ub-toast--visible'));
    // reset hide timer
    if (el._ubHideTimer) clearTimeout(el._ubHideTimer);
    el._ubHideTimer = setTimeout(() => {
      el.classList.remove('ub-toast--visible');
    }, 1600);
  } catch (e) { console.error('showCopiedToast error', e); }
}

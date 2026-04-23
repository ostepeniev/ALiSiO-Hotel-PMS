/**
 * ALiSiO PMS — Booking Widget v4 (Iframe-based)
 * Usage: <div id="alisio-booking-widget" data-site="your-site-slug"></div>
 *        <script src="https://your-pms.com/widget/embed.v2.js"></script>
 */
(function() {
  'use strict';

  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.v2.js"]');
  const API_BASE = scriptTag ? scriptTag.src.replace(/\/widget\/embed\.v2\.js.*$/, '') : '';
  
  const container = document.getElementById('alisio-booking-widget') || document.querySelector('[data-site]');
  if (!container) {
    console.error('ALiSiO Widget: Container #alisio-booking-widget not found.');
    return;
  }

  const siteSlug = container.getAttribute('data-site') || (scriptTag ? scriptTag.getAttribute('data-site') : '');
  const unitId = container.getAttribute('data-unit') || (scriptTag ? scriptTag.getAttribute('data-unit') : '');
  
  if (!siteSlug) {
    console.error('ALiSiO Widget: data-site attribute (slug) is missing.');
    return;
  }

  // Clear container
  container.innerHTML = '';
  
  // Create Iframe
  const iframe = document.createElement('iframe');
  let iframeUrl = `${API_BASE}/w/${siteSlug}`;
  if (unitId) {
    iframeUrl += `?unitId=${encodeURIComponent(unitId)}`;
  }
  
  iframe.src = iframeUrl;
  iframe.style.width = '100%';
  iframe.style.height = '700px'; // Initial height
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  iframe.id = 'alisio-iframe';

  container.appendChild(iframe);

  // Auto-resize logic via postMessage
  window.addEventListener('message', function(e) {
    if (e.data && e.data.source === 'alisio-widget' && e.data.event === 'resize') {
      iframe.style.height = e.data.height + 'px';
    }
  });

})();

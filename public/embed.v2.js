(function() {
  // 1. Find the script tag that loaded this file
  const script = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  // 2. Get configuration from data attributes
  const siteSlug = script.getAttribute('data-site');
  if (!siteSlug) {
    console.error('ALiSiO Widget Error: data-site attribute is missing.');
    return;
  }
  
  const unitId = script.getAttribute('data-unit') || '';
  const lang = script.getAttribute('data-lang') || 'uk';
  const baseUrl = script.src.split('/embed.v2.js')[0];

  // 3. Create a unique container for the widget
  const container = document.createElement('div');
  container.className = 'alisio-widget-container';
  container.style.width = '100%';
  container.style.position = 'relative';
  
  // Insert container before the script tag
  script.parentNode.insertBefore(container, script);

  // 4. Create the iframe
  const iframe = document.createElement('iframe');
  const queryParams = new URLSearchParams({
    unitId: unitId,
    lang: lang,
    embed: 'true',
    v: Date.now() // Cache busting
  });

  const url = `${baseUrl}/w/${siteSlug}?${queryParams.toString()}`;
  
  iframe.src = url;
  iframe.style.width = '1px';
  iframe.style.minWidth = '100%';
  iframe.style.height = '700px'; // Initial height
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');
  
  container.appendChild(iframe);

  // 5. Robust Resize Listener
  window.addEventListener('message', function(e) {
    // Only accept messages from the same origin as the script (or the specified baseUrl)
    if (e.data && e.data.type === 'resize' && e.data.height) {
      // Ensure we are resizing the correct iframe
      if (e.source === iframe.contentWindow) {
        iframe.style.height = e.data.height + 'px';
      }
    }
  }, false);

  console.log('ALiSiO Widget V3 Loaded for site:', siteSlug);
})();

/* ==========================================================
   HARTTECH - LOAD PROJECTS FROM SUPABASE (projects.html)
   Shows a friendly message if there are none yet.
   ========================================================== */
(function () {
  'use strict';

  var cfg = window.HARTTECH_CONFIG || {};
  var grid = document.getElementById('project-grid');
  if (!grid || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  var url = cfg.SUPABASE_URL.replace(/\/$/, '') +
    '/rest/v1/projects?select=title,description,image_url,link_url&visible=eq.true&order=sort_order.asc';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text; // textContent keeps user text safe
    return node;
  }
  var isHttps = function (u) { return typeof u === 'string' && /^https:\/\//i.test(u); };

  function buildCard(p) {
    var card = el('article', 'project-card reveal visible');

    var media = el('div', 'project-media');
    if (isHttps(p.image_url)) {
      var img = el('img', 'project-image');
      img.src = p.image_url;
      img.alt = p.title;
      img.width = 600;
      img.height = 400;
      img.loading = 'lazy';
      media.appendChild(img);
    } else {
      media.appendChild(el('span', 'project-initial text-serif', p.title.charAt(0).toUpperCase()));
    }
    card.appendChild(media);

    var body = el('div', 'project-body');
    body.appendChild(el('h3', 'project-title text-serif', p.title));
    if (p.description) body.appendChild(el('p', 'project-desc', p.description));
    if (isHttps(p.link_url)) {
      var link = el('a', 'read-more');
      link.href = p.link_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(document.createTextNode('View project '));
      var arrow = el('span', 'arrow', '\u2192');
      arrow.setAttribute('aria-hidden', 'true');
      link.appendChild(arrow);
      body.appendChild(link);
    }
    card.appendChild(body);
    return card;
  }

  fetch(url, { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY } })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (items) {
      if (!items.length) return; // keep the "coming soon" message
      grid.textContent = '';
      items.forEach(function (p) { grid.appendChild(buildCard(p)); });
    })
    .catch(function () { /* keep the "coming soon" message */ });
})();

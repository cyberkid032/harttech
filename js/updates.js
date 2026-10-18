/* ==========================================================
   HARTTECH - LATEST UPDATES (community.html)
   Loads visible announcements from Supabase. The section stays
   hidden if there are none or if Supabase is not reachable.
   ========================================================== */
(function () {
  'use strict';

  var cfg = window.HARTTECH_CONFIG || {};
  var section = document.getElementById('updates');
  var list = document.getElementById('update-list');
  if (!section || !list || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  var url = cfg.SUPABASE_URL.replace(/\/$/, '') +
    '/rest/v1/announcements?select=title,body,event_date,created_at&visible=eq.true&order=created_at.desc&limit=6';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text; // textContent keeps user text safe
    return node;
  }

  fetch(url, { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY } })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (items) {
      if (!items.length) return;
      items.forEach(function (item) {
        var li = el('li', 'update-item');
        if (item.event_date) {
          var d = new Date(item.event_date + 'T00:00:00');
          li.appendChild(el('p', 'update-date', d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })));
        }
        li.appendChild(el('h3', 'update-title text-serif', item.title));
        if (item.body) li.appendChild(el('p', 'update-body', item.body));
        list.appendChild(li);
      });
      section.hidden = false;
    })
    .catch(function () { /* keep the section hidden */ });
})();

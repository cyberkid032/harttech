/* ==========================================================
   HARTTECH - LOAD TEAM FROM SUPABASE (about.html)
   Falls back to the team written in the HTML if Supabase is
   not set up yet or cannot be reached.
   ========================================================== */
(function () {
  'use strict';

  var cfg = window.HARTTECH_CONFIG || {};
  var grid = document.getElementById('team-grid');
  if (!grid) return;
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    if (window.console) console.warn('Harttech: add your Supabase URL and anon key to js/config.js');
    return;
  }

  var url = cfg.SUPABASE_URL.replace(/\/$/, '') +
    '/rest/v1/team_members?select=name,title,bio,photo_url&visible=eq.true&order=sort_order.asc';

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(function (w) {
      return w.charAt(0).toUpperCase();
    }).join('');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text; // textContent keeps user text safe
    return node;
  }

  function buildMember(person) {
    var article = el('article', 'team-member reveal visible');
    var photo;

    // Only accept https photo links
    if (person.photo_url && /^https:\/\//i.test(person.photo_url)) {
      photo = el('img', 'team-photo');
      photo.src = person.photo_url;
      photo.alt = 'Portrait of ' + person.name;
      photo.width = 220;
      photo.height = 220;
      photo.loading = 'lazy';
    } else {
      photo = el('div', 'team-photo team-initials');
      photo.setAttribute('role', 'img');
      photo.setAttribute('aria-label', 'Portrait placeholder for ' + person.name);
      photo.appendChild(el('span', '', initials(person.name)));
    }

    article.appendChild(photo);
    article.appendChild(el('h3', 'team-name text-serif', person.name));
    if (person.title) article.appendChild(el('p', 'team-role', person.title));
    if (person.bio) article.appendChild(el('p', 'team-bio', person.bio));
    return article;
  }

  fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY
    }
  })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (people) {
      grid.textContent = ''; // remove the built-in placeholder team
      if (!people.length) {
        grid.appendChild(el('p', 'team-empty', 'Our team will appear here soon.'));
        return;
      }
      people.forEach(function (person) { grid.appendChild(buildMember(person)); });
    })
    .catch(function (err) {
      /* Keep the built-in team if anything goes wrong */
      if (window.console) console.warn('Harttech: could not load team from Supabase.', err);
    });
})();

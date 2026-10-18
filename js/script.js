/* ==========================================================
   HARTTECH - MAIN SCRIPT
   Sections: 1 Setup · 2 Mobile menu · 3 Header on scroll
             4 Scroll reveal · 5 Form validation
   ========================================================== */

(function () {
  'use strict';

  /* ---------- 1. SETUP ---------- */
  // Tells the CSS that JavaScript is running, so .reveal elements
  // are only hidden when they can actually be revealed again.
  document.documentElement.classList.add('js');

  /* ---------- 2. MOBILE MENU TOGGLE ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var mainNav = document.getElementById('main-nav');

  function setMenu(open) {
    if (!navToggle || !mainNav) return;
    navToggle.setAttribute('aria-expanded', String(open));
    mainNav.classList.toggle('open', open);
  }

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      setMenu(!isOpen);
    });

    // Close the menu after tapping a link
    mainNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });

    // Close with the Escape key
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        setMenu(false);
        navToggle.focus();
      }
    });

    // Reset when resizing up to the desktop layout
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768) setMenu(false);
    });
  }

  /* ---------- 3. HEADER BACKGROUND ON SCROLL ---------- */
  var header = document.getElementById('site-header');

  function updateHeader() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 50);
  }

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* ---------- 4. SCROLL REVEAL ANIMATIONS ---------- */
  var revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target); // animate once only
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    // Very old browsers: just show everything
    revealItems.forEach(function (item) { item.classList.add('visible'); });
  }

  /* ---------- 5. FORM VALIDATION (contact + join forms) ---------- */
  // Supabase settings come from js/config.js
  var cfg = window.HARTTECH_CONFIG || {};
  var hasDb = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  function dbHeaders(extra) {
    var h = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  // Saves a registration. Resolves on success, rejects with a friendly Error.
  function sendRegistration(form) {
    if (form.elements.website && form.elements.website.value) {
      return Promise.resolve(); // spam trap filled: pretend success, save nothing
    }
    if (!hasDb) return Promise.resolve(); // not connected yet: demo mode

    var body = {
      full_name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim().toLowerCase(),
      interest: form.elements.interest.value,
      consent: form.elements.consent.checked
    };

    return fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/members', {
      method: 'POST',
      headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(body)
    }).then(function (response) {
      if (response.ok) return;
      if (response.status === 409) throw new Error('This email is already registered. Thank you!');
      throw new Error('Sorry, we could not register you right now. Please try again later.');
    }, function () {
      throw new Error('Network error. Please check your connection and try again.');
    });
  }

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Returns an error message, or "" if the field is valid
  function getError(field) {
    if (field.type === 'checkbox') {
      return field.checked ? '' : 'Please tick the box to continue.';
    }
    var value = field.value.trim();

    if (value === '') {
      return field.tagName === 'SELECT' ? 'Please choose an option.' : 'This field is required.';
    }
    if (field.name === 'name' && value.length < 2) return 'Please enter your full name.';
    if (field.name === 'email' && !emailPattern.test(value)) return 'Please enter a valid email address.';
    if (field.name === 'message' && value.length < 10) return 'Please write at least 10 characters.';
    return '';
  }

  // Shows or clears the error for one field
  function showError(field, message) {
    var group = field.closest('.form-group');
    var errorBox = document.getElementById(field.id + '-error');

    group.classList.toggle('invalid', message !== '');
    field.setAttribute('aria-invalid', message !== '' ? 'true' : 'false');
    if (errorBox) errorBox.textContent = message;
  }

  function setupForm(form, successText, send, afterSuccess) {
    var status = form.querySelector('.form-status');
    var fields = form.querySelectorAll('input:not([name="website"]), textarea, select');

    fields.forEach(function (field) {
      field.addEventListener('blur', function () { showError(field, getError(field)); });
      field.addEventListener('input', function () {
        if (field.closest('.form-group').classList.contains('invalid')) {
          showError(field, getError(field));
        }
      });
      field.addEventListener('change', function () {
        if (field.closest('.form-group').classList.contains('invalid')) {
          showError(field, getError(field));
        }
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      status.textContent = '';

      var firstInvalid = null;
      fields.forEach(function (field) {
        var message = getError(field);
        showError(field, message);
        if (message && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      function done() {
        status.textContent = successText;
        form.reset();
      }

      if (!send) { done(); return; }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      status.textContent = 'Sending...';

      send(form).then(function () {
        done();
        if (afterSuccess) afterSuccess(status);
      }, function (err) {
        status.textContent = err.message || 'Something went wrong. Please try again.';
      }).then(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  // Saves a contact message. Resolves on success, rejects with a friendly Error.
  function sendMessage(form) {
    if (form.elements.website && form.elements.website.value) return Promise.resolve(); // spam trap
    if (!hasDb) return Promise.resolve(); // not connected yet: demo mode

    var body = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim().toLowerCase(),
      subject: form.elements.subject.value.trim(),
      message: form.elements.message.value.trim()
    };

    return fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/messages', {
      method: 'POST',
      headers: dbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(body)
    }).then(function (response) {
      if (response.ok) return;
      throw new Error('Sorry, your message could not be sent. Please try again later.');
    }, function () {
      throw new Error('Network error. Please check your connection and try again.');
    });
  }

  var contactForm = document.getElementById('contact-form');
  if (contactForm) {
    setupForm(contactForm, 'Thank you! Your message has been received. We will reply soon.', sendMessage);
  }

  // After registering, offer the group chat link (set COMMUNITY_CHAT_URL in js/config.js)
  function addChatButton(status) {
    var url = cfg.COMMUNITY_CHAT_URL;
    if (!url || !/^https:\/\//i.test(url)) return;
    var link = document.createElement('a');
    link.className = 'btn-outline chat-btn';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Join our group chat';
    status.appendChild(link);
  }

  var joinForm = document.getElementById('join-form');
  if (joinForm) {
    setupForm(joinForm, 'Registration received. Welcome, new member! We will email you shortly.', sendRegistration, addChatButton);
  }

  /* ---------- 5b. REGISTRATION POP-UP ---------- */
  var registerDialog = document.getElementById('register-dialog');

  if (registerDialog && typeof registerDialog.showModal === 'function') {
    var openRegister = function () {
      if (!registerDialog.open) registerDialog.showModal();
      var firstField = registerDialog.querySelector('input[name="name"]');
      if (firstField) firstField.focus();
    };

    document.querySelectorAll('[data-open-register]').forEach(function (btn) {
      btn.addEventListener('click', openRegister);
    });
    document.querySelectorAll('[data-close-register]').forEach(function (btn) {
      btn.addEventListener('click', function () { registerDialog.close(); });
    });

    // Clicking the dark area outside the box closes it
    registerDialog.addEventListener('click', function (event) {
      if (event.target === registerDialog) registerDialog.close();
    });

    // Links like community.html#join open it straight away
    if (window.location.hash === '#join') openRegister();
  }

  /* ---------- 6. LIVE MEMBER COUNT (from the database) ---------- */
  var liveCounters = document.querySelectorAll('[data-member-count]');
  if (hasDb && liveCounters.length) {
    fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/active_member_count', {
      method: 'POST',
      headers: dbHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (n) {
      if (typeof n !== 'number') return;
      liveCounters.forEach(function (node) {
        node.setAttribute('data-count', String(n));
        node.textContent = n;
      });
    }).catch(function () { /* keep the number written in the HTML */ });
  }

  /* ---------- 7. COUNT-UP NUMBERS (member counts) ---------- */
  var counters = document.querySelectorAll('[data-count]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function runCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target) || reduceMotion) { el.textContent = target; return; }

    var duration = 1600;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out
      el.textContent = Math.round(target * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  }
})();

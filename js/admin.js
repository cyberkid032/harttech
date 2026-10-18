/* ==========================================================
   HARTTECH - ADMIN DASHBOARD (login + team manager)
   Security is enforced by Supabase (login + row-level rules).
   This page only provides the interface.
   ========================================================== */
(function () {
  'use strict';

  var cfg = window.HARTTECH_CONFIG || {};
  var BUCKET = 'team-photos';
  var MAX_PHOTO = 2 * 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };
  var notice = $('admin-notice');
  var loginView = $('login-view');
  var dashView = $('dashboard-view');
  var logoutBtn = $('logout-btn');

  function say(message, isError) {
    notice.textContent = message || '';
    notice.classList.toggle('error', !!isError);
  }

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    say('Add your Supabase URL and anon key to js/config.js first.', true);
    return;
  }
  if (!window.supabase) {
    say('Could not load the Supabase library. Check your internet connection.', true);
    return;
  }

  var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var team = []; // current rows, in display order

  /* ---------- helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function button(label, handler, className) {
    var b = el('button', className || 'btn-small', label);
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  }

  /* ---------- views ---------- */
  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
    logoutBtn.hidden = true;
  }
  function showDashboard() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    loadTeam();
    loadMembers();
    loadMessages();
    loadProjects();
    loadUpdates();
  }

  // Confirms the logged-in user is listed in the admins table
  function verifyAdmin(session) {
    return db.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) {
          say('This account is not an admin.', true);
          return db.auth.signOut().then(showLogin);
        }
        say('');
        showDashboard();
      });
  }

  /* ---------- login / logout ---------- */
  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = $('login-email').value.trim();
    var password = $('login-password').value;
    if (!email || !password) { say('Enter your email and password.', true); return; }

    say('Signing in...');
    db.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) { say('Login failed. Check your email and password.', true); return; }
      $('login-password').value = '';
      verifyAdmin(res.data.session);
    });
  });

  logoutBtn.addEventListener('click', function () {
    db.auth.signOut().then(function () { say('You have been signed out.'); showLogin(); });
  });

  /* ---------- team list ---------- */
  function loadTeam() {
    db.from('team_members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { say('Could not load the team: ' + res.error.message, true); return; }
        team = res.data;
        renderTeam();
      });
  }

  function renderTeam() {
    var list = $('team-list');
    list.textContent = '';
    if (!team.length) {
      list.appendChild(el('li', 'admin-empty', 'No team members yet. Add your first one above.'));
      return;
    }
    team.forEach(function (person, index) {
      var row = el('li', 'admin-row');

      var thumb;
      if (person.photo_url && /^https:\/\//i.test(person.photo_url)) {
        thumb = el('img', 'admin-thumb');
        thumb.src = person.photo_url;
        thumb.alt = '';
        thumb.width = 56;
        thumb.height = 56;
      } else {
        thumb = el('span', 'admin-thumb admin-thumb-initials', initials(person.name));
      }

      var info = el('div', 'admin-info');
      info.appendChild(el('strong', 'admin-name', person.name));
      info.appendChild(el('span', 'admin-role', person.title || 'No title'));
      info.appendChild(el('span', person.visible ? 'badge badge-on' : 'badge', person.visible ? 'Visible' : 'Hidden'));

      var actions = el('div', 'admin-actions');
      var up = button('Up', function () { move(index, -1); });
      var down = button('Down', function () { move(index, 1); });
      up.disabled = index === 0;
      down.disabled = index === team.length - 1;
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(button('Edit', function () { startEdit(person); }));
      actions.appendChild(button(person.visible ? 'Hide' : 'Show', function () { toggleVisible(person); }));
      actions.appendChild(button('Delete', function () { remove(person); }, 'btn-small btn-danger'));

      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  /* ---------- row actions ---------- */
  function move(index, step) {
    var other = index + step;
    if (other < 0 || other >= team.length) return;
    var reordered = team.slice();
    var tmp = reordered[index];
    reordered[index] = reordered[other];
    reordered[other] = tmp;

    Promise.all(reordered.map(function (person, i) {
      return db.from('team_members').update({ sort_order: i }).eq('id', person.id);
    })).then(loadTeam);
  }

  function toggleVisible(person) {
    db.from('team_members').update({ visible: !person.visible }).eq('id', person.id).then(function (res) {
      if (res.error) say('Update failed: ' + res.error.message, true);
      loadTeam();
    });
  }

  function remove(person) {
    if (!window.confirm('Delete ' + person.name + '? This cannot be undone.')) return;
    db.from('team_members').delete().eq('id', person.id).then(function (res) {
      if (res.error) { say('Delete failed: ' + res.error.message, true); return; }
      removePhotoFile(person.photo_url);
      say(person.name + ' was deleted.');
      resetForm();
      loadTeam();
    });
  }

  // Best-effort cleanup of the stored image file
  function removePhotoFile(url) {
    if (!url) return;
    var marker = '/' + BUCKET + '/';
    var i = url.indexOf(marker);
    if (i === -1) return;
    db.storage.from(BUCKET).remove([url.slice(i + marker.length)]);
  }

  /* ---------- add / edit form ---------- */
  var form = $('team-form');

  function resetForm() {
    form.reset();
    $('team-id').value = '';
    $('team-visible').checked = true;
    $('team-form-title').textContent = 'Add a team member';
    $('team-save').textContent = 'Save';
    $('team-cancel').hidden = true;
  }

  function startEdit(person) {
    $('team-id').value = person.id;
    $('team-name').value = person.name;
    $('team-title').value = person.title || '';
    $('team-bio').value = person.bio || '';
    $('team-visible').checked = person.visible;
    $('team-photo').value = '';
    $('team-form-title').textContent = 'Edit ' + person.name;
    $('team-save').textContent = 'Save changes';
    $('team-cancel').hidden = false;
    say('Editing ' + person.name + '. Leave the photo empty to keep the current one.');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('team-cancel').addEventListener('click', function () { resetForm(); say(''); });

  // Uploads the chosen photo and resolves with its public URL (or null)
  function uploadPhoto(file) {
    if (!file) return Promise.resolve(null);
    var types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    var ext = types[file.type];
    if (!ext) return Promise.reject(new Error('Photo must be a JPG, PNG or WebP image.'));
    if (file.size > MAX_PHOTO) return Promise.reject(new Error('Photo is too large (max 2 MB).'));

    var path = window.crypto.randomUUID() + '.' + ext;
    return db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      .then(function (res) {
        if (res.error) throw new Error('Photo upload failed: ' + res.error.message);
        return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var id = $('team-id').value;
    var name = $('team-name').value.trim();
    if (name.length < 2) { say('Please enter a name (at least 2 characters).', true); $('team-name').focus(); return; }

    var fields = {
      name: name,
      title: $('team-title').value.trim() || null,
      bio: $('team-bio').value.trim() || null,
      visible: $('team-visible').checked
    };

    var file = $('team-photo').files[0];
    var oldPerson = id ? team.filter(function (p) { return p.id === id; })[0] : null;
    $('team-save').disabled = true;
    say('Saving...');

    uploadPhoto(file).then(function (photoUrl) {
      if (photoUrl) fields.photo_url = photoUrl;

      if (id) {
        return db.from('team_members').update(fields).eq('id', id).then(function (res) {
          if (res.error) throw new Error(res.error.message);
          if (photoUrl && oldPerson) removePhotoFile(oldPerson.photo_url);
        });
      }
      fields.sort_order = team.length ? Math.max.apply(null, team.map(function (p) { return p.sort_order; })) + 1 : 0;
      return db.from('team_members').insert(fields).then(function (res) {
        if (res.error) throw new Error(res.error.message);
      });
    }).then(function () {
      say(name + ' was saved.');
      resetForm();
      loadTeam();
    }).catch(function (err) {
      say(err.message || 'Something went wrong.', true);
    }).then(function () {
      $('team-save').disabled = false;
    });
  });

  /* ---------- tabs ---------- */
  var tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      var name = tab.getAttribute('data-tab');
      if (name === 'members' && !membersSeen) {
        membersSeen = true;
        try { window.localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
        updateMembersTab();
      }
      ['team', 'members', 'messages', 'projects', 'updates'].forEach(function (n) { $(n + '-panel').hidden = n !== name; });
    });
  });

  /* ---------- members ---------- */
  var members = [];
  var currentShown = [];

  // "New since your last visit" tracking (stored only in this browser)
  var SEEN_KEY = 'harttech-members-seen';
  var membersSeen = false;
  var seenAt = (function () {
    try {
      var saved = window.localStorage.getItem(SEEN_KEY);
      if (!saved) { window.localStorage.setItem(SEEN_KEY, new Date().toISOString()); return new Date(); }
      return new Date(saved);
    } catch (e) { return new Date(); }
  })();

  function isNewMember(m) { return new Date(m.created_at) > seenAt; }

  function updateMembersTab() {
    var n = membersSeen ? 0 : members.filter(isNewMember).length;
    $('tab-members').textContent = n ? 'Members (' + n + ' new)' : 'Members';
  }
  var INTERESTS = { web: 'Web development', design: 'UI / UX design', security: 'Cybersecurity', other: 'Something else' };

  function loadMembers() {
    db.from('members').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { say('Could not load members: ' + res.error.message, true); return; }
      members = res.data;
      renderMembers();
    });
  }

  function renderMembers() {
    var filter = $('member-filter').value;
    var q = ($('member-search').value || '').trim().toLowerCase();
    var shown = members.filter(function (m) {
      var okStatus = filter === 'all' || m.status === filter;
      var okSearch = !q || m.full_name.toLowerCase().indexOf(q) !== -1 || m.email.toLowerCase().indexOf(q) !== -1;
      return okStatus && okSearch;
    });
    currentShown = shown;
    updateMembersTab();
    var count = function (s) { return members.filter(function (m) { return m.status === s; }).length; };

    $('member-summary').textContent = members.length + ' registered: ' +
      count('pending') + ' pending, ' + count('active') + ' active, ' + count('rejected') + ' rejected.';

    var list = $('member-list');
    list.textContent = '';
    if (!shown.length) {
      list.appendChild(el('li', 'admin-empty', 'No registrations to show.'));
      return;
    }

    shown.forEach(function (m) {
      var row = el('li', 'admin-row admin-row-member');

      var info = el('div', 'admin-info');
      info.appendChild(el('strong', 'admin-name', m.full_name));
      info.appendChild(el('span', 'admin-role', m.email));
      info.appendChild(el('span', 'admin-role', (INTERESTS[m.interest] || 'No interest chosen') + ' · joined ' + new Date(m.created_at).toLocaleDateString()));
      info.appendChild(el('span', m.status === 'active' ? 'badge badge-on' : 'badge', m.status));
      if (isNewMember(m)) info.appendChild(el('span', 'badge badge-new', 'New'));
      if (m.note) info.appendChild(el('span', 'admin-note', 'Note: ' + m.note));

      var actions = el('div', 'admin-actions');

      var roleSelect = el('select', 'role-select');
      roleSelect.setAttribute('aria-label', 'Role for ' + m.full_name);
      ['member', 'moderator', 'admin'].forEach(function (r) {
        var opt = el('option', '', r);
        opt.value = r;
        if (r === m.role) opt.selected = true;
        roleSelect.appendChild(opt);
      });
      roleSelect.addEventListener('change', function () { updateMember(m, { role: roleSelect.value }, 'Role updated.'); });
      actions.appendChild(roleSelect);

      if (m.status !== 'active') actions.appendChild(button('Approve', function () { updateMember(m, { status: 'active' }, m.full_name + ' approved.'); }));
      if (m.status !== 'rejected') actions.appendChild(button('Reject', function () { updateMember(m, { status: 'rejected' }, m.full_name + ' rejected.'); }));
      actions.appendChild(button(m.note ? 'Edit note' : 'Add note', function () { editNote(m); }));
      actions.appendChild(button('Delete', function () { removeMember(m); }, 'btn-small btn-danger'));

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function updateMember(m, changes, message) {
    db.from('members').update(changes).eq('id', m.id).then(function (res) {
      if (res.error) say('Update failed: ' + res.error.message, true);
      else say(message);
      loadMembers();
    });
  }

  function removeMember(m) {
    if (!window.confirm('Delete ' + m.full_name + ' (' + m.email + ')? This cannot be undone.')) return;
    db.from('members').delete().eq('id', m.id).then(function (res) {
      if (res.error) say('Delete failed: ' + res.error.message, true);
      else say(m.full_name + ' was deleted.');
      loadMembers();
    });
  }

  $('member-filter').addEventListener('change', renderMembers);

  function editNote(m) {
    var text = window.prompt('Private note about ' + m.full_name + ' (only you can see this, max 500 characters):', m.note || '');
    if (text === null) return;
    updateMember(m, { note: text.trim().slice(0, 500) || null }, 'Note saved.');
  }

  $('member-search').addEventListener('input', renderMembers);

  // Export the list currently shown as a CSV file
  function csvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $('member-export').addEventListener('click', function () {
    if (!currentShown.length) { say('Nothing to export.', true); return; }
    var rows = [['Name', 'Email', 'Interest', 'Role', 'Status', 'Joined', 'Note']];
    currentShown.forEach(function (m) {
      rows.push([m.full_name, m.email, INTERESTS[m.interest] || '', m.role, m.status, new Date(m.created_at).toISOString().slice(0, 10), m.note || '']);
    });
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'harttech-members.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    say('Exported ' + currentShown.length + ' members.');
  });

  /* ---------- messages ---------- */
  var messages = [];

  function loadMessages() {
    db.from('messages').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { say('Could not load messages: ' + res.error.message, true); return; }
      messages = res.data;
      renderMessages();
    });
  }

  function renderMessages() {
    var unread = messages.filter(function (m) { return !m.read; }).length;
    $('tab-messages').textContent = unread ? 'Messages (' + unread + ')' : 'Messages';
    $('message-summary').textContent = messages.length + ' messages, ' + unread + ' unread.';

    var list = $('message-list');
    list.textContent = '';
    if (!messages.length) { list.appendChild(el('li', 'admin-empty', 'No messages yet.')); return; }

    messages.forEach(function (m) {
      var row = el('li', 'admin-row admin-row-member');
      var info = el('div', 'admin-info');
      info.appendChild(el('strong', 'admin-name', m.subject));
      info.appendChild(el('span', 'admin-role', m.name + ' · ' + m.email + ' · ' + new Date(m.created_at).toLocaleString()));
      info.appendChild(el('p', 'admin-message', m.message));
      info.appendChild(el('span', m.read ? 'badge' : 'badge badge-on', m.read ? 'Read' : 'Unread'));

      var actions = el('div', 'admin-actions');
      var reply = el('a', 'btn-small', 'Reply');
      reply.href = 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + m.subject);
      actions.appendChild(reply);
      actions.appendChild(button(m.read ? 'Mark unread' : 'Mark read', function () {
        db.from('messages').update({ read: !m.read }).eq('id', m.id).then(loadMessages);
      }));
      actions.appendChild(button('Delete', function () {
        if (!window.confirm('Delete this message from ' + m.name + '?')) return;
        db.from('messages').delete().eq('id', m.id).then(loadMessages);
      }, 'btn-small btn-danger'));

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  /* ---------- projects ---------- */
  var PROJ_BUCKET = 'project-images';
  var projects = [];

  function loadProjects() {
    db.from('projects').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { say('Could not load projects: ' + res.error.message, true); return; }
        projects = res.data;
        renderProjects();
      });
  }

  function renderProjects() {
    var list = $('project-list');
    list.textContent = '';
    if (!projects.length) { list.appendChild(el('li', 'admin-empty', 'No projects yet. Add your first one above.')); return; }

    projects.forEach(function (p, index) {
      var row = el('li', 'admin-row');

      var thumb;
      if (p.image_url && /^https:\/\//i.test(p.image_url)) {
        thumb = el('img', 'admin-thumb admin-thumb-square');
        thumb.src = p.image_url; thumb.alt = ''; thumb.width = 56; thumb.height = 56;
      } else {
        thumb = el('span', 'admin-thumb admin-thumb-square admin-thumb-initials', p.title.charAt(0).toUpperCase());
      }

      var info = el('div', 'admin-info');
      info.appendChild(el('strong', 'admin-name', p.title));
      if (p.description) info.appendChild(el('span', 'admin-role', p.description));
      info.appendChild(el('span', p.visible ? 'badge badge-on' : 'badge', p.visible ? 'Visible' : 'Hidden'));

      var actions = el('div', 'admin-actions');
      var up = button('Up', function () { moveProject(index, -1); });
      var down = button('Down', function () { moveProject(index, 1); });
      up.disabled = index === 0;
      down.disabled = index === projects.length - 1;
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(button(p.visible ? 'Hide' : 'Show', function () {
        db.from('projects').update({ visible: !p.visible }).eq('id', p.id).then(loadProjects);
      }));
      actions.appendChild(button('Delete', function () { removeProject(p); }, 'btn-small btn-danger'));

      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function moveProject(index, step) {
    var other = index + step;
    if (other < 0 || other >= projects.length) return;
    var reordered = projects.slice();
    var tmp = reordered[index]; reordered[index] = reordered[other]; reordered[other] = tmp;
    Promise.all(reordered.map(function (p, i) {
      return db.from('projects').update({ sort_order: i }).eq('id', p.id);
    })).then(loadProjects);
  }

  function removeProject(p) {
    if (!window.confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
    db.from('projects').delete().eq('id', p.id).then(function (res) {
      if (res.error) { say('Delete failed: ' + res.error.message, true); return; }
      if (p.image_url) {
        var marker = '/' + PROJ_BUCKET + '/';
        var i = p.image_url.indexOf(marker);
        if (i !== -1) db.storage.from(PROJ_BUCKET).remove([p.image_url.slice(i + marker.length)]);
      }
      say('"' + p.title + '" was deleted.');
      loadProjects();
    });
  }

  function uploadProjectImage(file) {
    if (!file) return Promise.resolve(null);
    var types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    var ext = types[file.type];
    if (!ext) return Promise.reject(new Error('Image must be a JPG, PNG or WebP file.'));
    if (file.size > MAX_PHOTO) return Promise.reject(new Error('Image is too large (max 2 MB).'));
    var path = window.crypto.randomUUID() + '.' + ext;
    return db.storage.from(PROJ_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      .then(function (res) {
        if (res.error) throw new Error('Image upload failed: ' + res.error.message);
        return db.storage.from(PROJ_BUCKET).getPublicUrl(path).data.publicUrl;
      });
  }

  $('project-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var title = $('project-title').value.trim();
    var link = $('project-link').value.trim();
    if (title.length < 2) { say('Please enter a title (at least 2 characters).', true); $('project-title').focus(); return; }
    if (link && !/^https:\/\//i.test(link)) { say('The link must start with https://', true); $('project-link').focus(); return; }

    $('project-save').disabled = true;
    say('Saving...');

    uploadProjectImage($('project-image').files[0]).then(function (imageUrl) {
      var next = projects.length ? Math.max.apply(null, projects.map(function (p) { return p.sort_order; })) + 1 : 0;
      return db.from('projects').insert({
        title: title,
        description: $('project-desc').value.trim() || null,
        link_url: link || null,
        image_url: imageUrl,
        visible: $('project-visible').checked,
        sort_order: next
      }).then(function (res) { if (res.error) throw new Error(res.error.message); });
    }).then(function () {
      say('"' + title + '" was added.');
      $('project-form').reset();
      $('project-visible').checked = true;
      loadProjects();
    }).catch(function (err) {
      say(err.message || 'Something went wrong.', true);
    }).then(function () {
      $('project-save').disabled = false;
    });
  });

  /* ---------- updates / announcements ---------- */
  var updates = [];

  function loadUpdates() {
    db.from('announcements').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { say('Could not load updates: ' + res.error.message, true); return; }
      updates = res.data;
      renderUpdates();
    });
  }

  function renderUpdates() {
    var list = $('update-list-admin');
    list.textContent = '';
    if (!updates.length) { list.appendChild(el('li', 'admin-empty', 'No updates yet.')); return; }

    updates.forEach(function (u) {
      var row = el('li', 'admin-row admin-row-member');
      var info = el('div', 'admin-info');
      info.appendChild(el('strong', 'admin-name', u.title));
      if (u.event_date) info.appendChild(el('span', 'admin-role', 'Date: ' + u.event_date));
      if (u.body) info.appendChild(el('p', 'admin-message', u.body));
      info.appendChild(el('span', u.visible ? 'badge badge-on' : 'badge', u.visible ? 'Visible' : 'Hidden'));

      var actions = el('div', 'admin-actions');
      actions.appendChild(button(u.visible ? 'Hide' : 'Show', function () {
        db.from('announcements').update({ visible: !u.visible }).eq('id', u.id).then(loadUpdates);
      }));
      actions.appendChild(button('Delete', function () {
        if (!window.confirm('Delete "' + u.title + '"?')) return;
        db.from('announcements').delete().eq('id', u.id).then(loadUpdates);
      }, 'btn-small btn-danger'));

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  $('update-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var title = $('update-title').value.trim();
    if (title.length < 2) { say('Please enter a title (at least 2 characters).', true); $('update-title').focus(); return; }

    $('update-save').disabled = true;
    db.from('announcements').insert({
      title: title,
      body: $('update-body').value.trim() || null,
      event_date: $('update-date').value || null,
      visible: $('update-visible').checked
    }).then(function (res) {
      $('update-save').disabled = false;
      if (res.error) { say('Could not save: ' + res.error.message, true); return; }
      say('Update published.');
      $('update-form').reset();
      $('update-visible').checked = true;
      loadUpdates();
    });
  });

  /* ---------- start: already signed in? ---------- */
  db.auth.getSession().then(function (res) {
    if (res.data && res.data.session) verifyAdmin(res.data.session);
    else showLogin();
  });
})();

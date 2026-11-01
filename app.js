(function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  var ROLE_LABELS = { admin: 'Admin', staff: 'Staff', viewer: 'View only' };
  var state = { session: null, role: null, employees: null, countries: null, parsed: null };
  var routedFor;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showOnly(id) {
    ['boot', 'login', 'noaccess', 'app'].forEach(function (s) { $(s).hidden = s !== id; });
  }

  function message(id, text, kind) {
    var el = $(id);
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  // ---- Session and role routing -------------------------------------------

  sb.auth.onAuthStateChange(function (event, session) {
    var key = session && session.user ? session.user.id : 'none';
    state.session = session;
    if (key === routedFor) return;
    routedFor = key;
    // Defer so we never call the client from inside its own auth callback.
    setTimeout(route, 0);
  });

  async function route() {
    state.employees = null;
    state.parsed = null;
    if (!state.session) {
      state.role = null;
      $('login-password').value = '';
      showOnly('login');
      return;
    }
    var res = await sb.from('user_roles').select('role').eq('user_id', state.session.user.id).maybeSingle();
    if (res.error) {
      showOnly('login');
      message('login-msg', 'Could not load your role: ' + res.error.message, 'error');
      return;
    }
    state.role = res.data ? res.data.role : null;
    if (!state.role) { showOnly('noaccess'); return; }
    showApp();
  }

  $('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    message('login-msg', '');
    var btn = $('login-btn');
    btn.disabled = true;
    var res = await sb.auth.signInWithPassword({
      email: $('login-email').value.trim(),
      password: $('login-password').value
    });
    btn.disabled = false;
    if (res.error) message('login-msg', res.error.message, 'error');
  });

  function signOut() { sb.auth.signOut(); }
  $('signout').addEventListener('click', signOut);
  $('noaccess-signout').addEventListener('click', signOut);

  // ---- App shell and tabs ---------------------------------------------------

  function showApp() {
    showOnly('app');
    $('who').textContent = state.session.user.email + ' · ' + (ROLE_LABELS[state.role] || state.role);
    var tabs = [['employees', 'Employees']];
    if (state.role === 'admin' || state.role === 'staff') tabs.push(['import', 'Import CSV']);
    if (state.role === 'admin') tabs.push(['users', 'Users']);
    $('tabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab" data-tab="' + esc(t[0]) + '">' + esc(t[1]) + '</button>';
    }).join('');
    openTab('employees');
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (b) openTab(b.getAttribute('data-tab'));
  });

  function openTab(name) {
    ['employees', 'import', 'users'].forEach(function (n) { $('tab-' + n).hidden = n !== name; });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    if (name === 'employees') loadEmployees();
    if (name === 'users') loadUsers();
  }

  // ---- Employees ----------------------------------------------------------------

  async function loadEmployees() {
    if (state.employees) { renderEmployees(); return; }
    message('employees-msg', 'Loading employees…');
    var all = [];
    var from = 0;
    var size = 1000;
    for (;;) {
      var res = await sb.from('employees')
        .select('id,first_name,last_name,email,employee_phones(phone_number,phone_type,is_primary),employee_addresses(address_type,is_primary,addresses(address_line1,address_line2,city,region,postal_code,country_code))')
        .order('last_name').order('first_name')
        .range(from, from + size - 1);
      if (res.error) { message('employees-msg', res.error.message, 'error'); return; }
      all = all.concat(res.data);
      if (res.data.length < size || all.length >= 10000) break;
      from += size;
    }
    state.employees = all;
    message('employees-msg', '');
    renderEmployees();
  }

  function primaryOf(list) {
    if (!list || !list.length) return null;
    return list.find(function (x) { return x.is_primary; }) || list[0];
  }

  function formatAddress(a) {
    return [a.address_line1, a.address_line2, a.city, a.region, a.postal_code, a.country_code]
      .filter(Boolean).join(', ');
  }

  function renderEmployees() {
    var q = $('search').value.trim().toLowerCase();
    var all = (state.employees || []).map(function (e) {
      var ph = primaryOf(e.employee_phones);
      var link = primaryOf(e.employee_addresses);
      return {
        name: e.first_name + ' ' + e.last_name,
        email: e.email,
        phone: ph ? ph.phone_number : '',
        morePhones: (e.employee_phones || []).length - 1,
        addr: link && link.addresses ? formatAddress(link.addresses) : ''
      };
    });
    var rows = all.filter(function (r) {
      return !q || (r.name + ' ' + r.email + ' ' + r.phone + ' ' + r.addr).toLowerCase().indexOf(q) !== -1;
    });
    var shown = rows.slice(0, 200);
    $('count').textContent = rows.length === all.length
      ? all.length + ' employees'
      : rows.length + ' of ' + all.length + ' employees';
    if (rows.length > shown.length) $('count').textContent += ' (showing first 200, refine your search)';
    $('employees-body').innerHTML = shown.length ? shown.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.email) + '</td><td>' + esc(r.phone) +
        (r.morePhones > 0 ? ' <span class="tag">+' + r.morePhones + ' more</span>' : '') +
        '</td><td>' + esc(r.addr) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">No employees yet.</td></tr>';
  }

  $('search').addEventListener('input', renderEmployees);

  // ---- CSV import ---------------------------------------------------------------

  async function getCountries() {
    if (state.countries) return state.countries;
    var res = await sb.from('countries').select('code');
    if (res.error) throw res.error;
    state.countries = new Set(res.data.map(function (r) { return String(r.code).toUpperCase(); }));
    return state.countries;
  }

  async function getExistingEmails() {
    var set = new Set();
    var from = 0;
    var size = 1000;
    for (;;) {
      var res = await sb.from('employees').select('email').range(from, from + size - 1);
      if (res.error) throw res.error;
      res.data.forEach(function (r) { set.add(String(r.email).toLowerCase()); });
      if (res.data.length < size) break;
      from += size;
    }
    return set;
  }

  function resetImportUi() {
    state.parsed = null;
    message('import-msg', '');
    $('import-report').innerHTML = '';
    $('import-go').hidden = true;
    $('import-go').disabled = true;
  }

  $('csv-file').addEventListener('change', async function (e) {
    var file = e.target.files[0];
    resetImportUi();
    if (!file) return;
    message('import-msg', 'Checking ' + file.name + '…');
    try {
      var text = (await file.text()).replace(/^\uFEFF/, '');
      var parsed = window.Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: function (h) { return h.trim().toLowerCase(); }
      });
      var ctx = { countryCodes: await getCountries(), existingEmails: await getExistingEmails() };
      var result = window.EmployeeCsv.validate(parsed.meta.fields || [], parsed.data, ctx, parsed.errors);
      state.parsed = result;
      message('import-msg', '');
      renderReport(result);
    } catch (err) {
      message('import-msg', 'Could not check the file: ' + (err.message || err), 'error');
    }
  });

  function renderReport(r) {
    var html = '';
    var s = r.summary;
    if (s.total) {
      html += '<p><strong>' + s.total + '</strong> rows: ' + s.newCount + ' new, ' + s.updateCount + ' updates.</p>';
    }
    if (r.errors.length) {
      var shownErrors = r.errors.slice(0, 100);
      html += '<p class="msg error">' + r.errors.length + ' problem(s) found. Fix them and upload the file again. Nothing has been saved.</p><ul class="issues">' +
        shownErrors.map(function (x) { return '<li>Line ' + x.line + ': ' + esc(x.message) + '</li>'; }).join('') +
        (r.errors.length > shownErrors.length ? '<li>…and ' + (r.errors.length - shownErrors.length) + ' more</li>' : '') +
        '</ul>';
    }
    if (r.warnings.length) {
      html += '<ul class="issues">' + r.warnings.map(function (w) { return '<li class="warn">' + esc(w) + '</li>'; }).join('') + '</ul>';
    }
    if (r.rows.length && !r.errors.length) {
      html += '<div class="scroll"><table><thead><tr><th>Line</th><th>Name</th><th>Email</th><th>Phone</th><th>Home</th><th></th></tr></thead><tbody>' +
        r.rows.slice(0, 25).map(function (x) {
          var d = x.data;
          var home = [d.home_city, d.home_country_code].filter(Boolean).join(', ');
          return '<tr><td>' + x.line + '</td><td>' + esc(d.first_name + ' ' + d.last_name) + '</td><td>' + esc(d.email) +
            '</td><td>' + esc(d.phone_1) + '</td><td>' + esc(home) + '</td><td class="pill-' + x.status + '">' + x.status + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (r.rows.length > 25 ? '<p class="muted">Showing the first 25 of ' + r.rows.length + ' rows.</p>' : '');
      $('import-go').textContent = 'Import ' + r.rows.length + ' employees';
      $('import-go').hidden = false;
      $('import-go').disabled = false;
    }
    $('import-report').innerHTML = html;
  }

  $('import-go').addEventListener('click', async function () {
    var r = state.parsed;
    if (!r || r.errors.length || !r.rows.length) return;
    $('import-go').disabled = true;
    message('import-msg', 'Importing…');
    var res = await sb.rpc('import_employees', { p_rows: r.rows.map(function (x) { return x.data; }) });
    if (res.error) {
      message('import-msg', 'Nothing was imported. ' + res.error.message, 'error');
      $('import-go').disabled = false;
      return;
    }
    state.employees = null;
    resetImportUi();
    $('csv-file').value = '';
    message('import-msg', 'Done: ' + res.data.created + ' created, ' + res.data.updated + ' updated.', 'ok');
  });

  $('download-template').addEventListener('click', function () {
    var blob = new Blob([window.EmployeeCsv.templateCsv()], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'employee-import-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ---- Users and roles (admins) -------------------------------------------------

  async function loadUsers() {
    message('users-msg', 'Loading…');
    var res = await sb.rpc('admin_list_users');
    if (res.error) { message('users-msg', res.error.message, 'error'); return; }
    message('users-msg', '');
    var me = state.session.user.id;
    var options = [['', 'No access'], ['viewer', 'View only'], ['staff', 'Staff'], ['admin', 'Admin']];
    $('users-body').innerHTML = res.data.map(function (u) {
      var self = u.user_id === me;
      var opts = options.map(function (o) {
        return '<option value="' + o[0] + '"' + ((u.role || '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('');
      return '<tr><td>' + esc(u.email || '(no email)') + (self ? ' <span class="tag">you</span>' : '') + '</td>' +
        '<td><select data-uid="' + esc(u.user_id) + '"' + (self ? ' disabled title="You cannot change your own role"' : '') + '>' + opts + '</select></td>' +
        '<td>' + esc(u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never') + '</td></tr>';
    }).join('');
  }

  $('users-body').addEventListener('change', async function (e) {
    var sel = e.target.closest('select[data-uid]');
    if (!sel) return;
    var uid = sel.getAttribute('data-uid');
    var val = sel.value;
    sel.disabled = true;
    var res = val === ''
      ? await sb.from('user_roles').delete().eq('user_id', uid)
      : await sb.from('user_roles').upsert({ user_id: uid, role: val }, { onConflict: 'user_id' });
    if (res.error) message('users-msg', res.error.message, 'error');
    else message('users-msg', 'Role updated.', 'ok');
    loadUsers();
  });
})();

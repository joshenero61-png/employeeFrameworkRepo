(function (root) {
  'use strict';

  // Every column the importer understands lives in this registry.
  // To support a new field later: add the database column, add its name here.
  var PHONE_TYPES = ['mobile', 'work', 'home', 'other'];
  var ADDRESS_GROUPS = ['home', 'mailing'];
  var ADDRESS_FIELDS = ['address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country_code'];
  var REQUIRED_COLUMNS = ['first_name', 'last_name', 'email'];
  var KNOWN_COLUMNS = ['first_name', 'last_name', 'email', 'phone_1', 'phone_1_type', 'phone_2', 'phone_2_type'];
  ADDRESS_GROUPS.forEach(function (g) {
    ADDRESS_FIELDS.forEach(function (f) { KNOWN_COLUMNS.push(g + '_' + f); });
  });

  var MAX_ROWS = 5000;
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var PHONE_RE = /^\+[1-9][0-9]{6,14}$/;

  function clean(v) { return v == null ? '' : String(v).trim(); }

  function normalizePhone(raw) {
    var s = clean(raw).replace(/[\s\-.()]/g, '');
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    return s;
  }

  // headers: normalised header names. records: array of objects keyed by header.
  // ctx: { countryCodes: Set, existingEmails: Set (lower-case) }
  // parserErrors: optional errors reported by the CSV parser.
  function validate(headers, records, ctx, parserErrors) {
    ctx = ctx || {};
    var errors = [];
    var warnings = [];
    var rows = [];

    var seenHeaders = {};
    headers.forEach(function (h) {
      if (seenHeaders[h]) errors.push({ line: 1, message: 'Column "' + h + '" appears more than once' });
      seenHeaders[h] = true;
    });

    var missing = REQUIRED_COLUMNS.filter(function (c) { return !seenHeaders[c]; });
    if (missing.length) errors.push({ line: 1, message: 'Missing required column(s): ' + missing.join(', ') });

    var unknown = headers.filter(function (h) { return h && KNOWN_COLUMNS.indexOf(h) === -1; });
    if (unknown.length) warnings.push('Ignored unrecognised column(s): ' + unknown.join(', '));

    if (!records.length) errors.push({ line: 2, message: 'The file has no data rows' });
    if (records.length > MAX_ROWS) errors.push({ line: 1, message: 'Too many rows (' + records.length + '). The limit is ' + MAX_ROWS + ' per file' });

    (parserErrors || []).forEach(function (e) {
      if (e.code === 'UndetectableDelimiter') return;
      var line = e.row != null ? e.row + 2 : 1;
      if (e.code === 'TooFewFields') warnings.push('Line ' + line + ' has fewer values than the header row');
      else errors.push({ line: line, message: e.message });
    });

    if (errors.length) return finish();

    var seenEmail = {};
    records.forEach(function (rec, i) {
      var line = i + 2;
      var rowErrors = [];
      var d = {};
      KNOWN_COLUMNS.forEach(function (c) { d[c] = clean(rec[c]); });

      REQUIRED_COLUMNS.forEach(function (c) { if (!d[c]) rowErrors.push(c + ' is required'); });

      d.email = d.email.toLowerCase();
      if (d.email && !EMAIL_RE.test(d.email)) rowErrors.push('email "' + d.email + '" is not a valid email address');
      if (d.email) {
        if (seenEmail[d.email]) rowErrors.push('email already appears on line ' + seenEmail[d.email]);
        else seenEmail[d.email] = line;
      }

      [1, 2].forEach(function (n) {
        var pk = 'phone_' + n;
        var tk = pk + '_type';
        var p = normalizePhone(d[pk]);
        var t = d[tk].toLowerCase();
        if (p) {
          if (!PHONE_RE.test(p)) rowErrors.push(pk + ' "' + d[pk] + '" is not a valid international number (example: +353871234567)');
        } else if (t) {
          rowErrors.push(tk + ' is set but ' + pk + ' is empty');
        }
        if (t && PHONE_TYPES.indexOf(t) === -1) rowErrors.push(tk + ' "' + d[tk] + '" must be one of: ' + PHONE_TYPES.join(', '));
        d[pk] = p;
        d[tk] = p ? (t || 'mobile') : '';
      });
      if (d.phone_1 && d.phone_1 === d.phone_2) rowErrors.push('phone_1 and phone_2 are the same number');

      ADDRESS_GROUPS.forEach(function (g) {
        var any = ADDRESS_FIELDS.some(function (f) { return d[g + '_' + f]; });
        if (!any) return;
        ['address_line1', 'city', 'country_code'].forEach(function (f) {
          if (!d[g + '_' + f]) rowErrors.push(g + '_' + f + ' is required when any ' + g + ' address field is filled in');
        });
        var cc = d[g + '_country_code'].toUpperCase();
        d[g + '_country_code'] = cc;
        if (cc && ctx.countryCodes && !ctx.countryCodes.has(cc)) {
          rowErrors.push(g + '_country_code "' + cc + '" is not a valid 2-letter country code');
        }
      });

      rowErrors.forEach(function (m) { errors.push({ line: line, message: m }); });
      var status = ctx.existingEmails && ctx.existingEmails.has(d.email) ? 'update' : 'new';
      rows.push({ line: line, data: d, status: status });
    });

    return finish();

    function finish() {
      var newCount = rows.filter(function (r) { return r.status === 'new'; }).length;
      return {
        rows: rows,
        errors: errors,
        warnings: warnings,
        summary: { total: rows.length, newCount: newCount, updateCount: rows.length - newCount }
      };
    }
  }

  function templateCsv() {
    var header = KNOWN_COLUMNS.join(',');
    var r1 = ['Aoife', 'Murphy', 'aoife.murphy@example.com', '+353871234567', 'mobile', '+35316789012', 'work',
      '12 Main Street', '', 'Dublin', 'Dublin', 'D02 X285', 'IE', '', '', '', '', '', ''];
    var r2 = ['Sam', 'Rivera', 'sam.rivera@example.com', '+14155550123', 'mobile', '', '',
      '742 Evergreen Terrace', 'Apt 3', 'Springfield', 'Oregon', '97477', 'US', 'PO Box 12', '', 'Springfield', 'Oregon', '97477', 'US'];
    return [header, r1.join(','), r2.join(',')].join('\r\n') + '\r\n';
  }

  var api = {
    validate: validate,
    templateCsv: templateCsv,
    KNOWN_COLUMNS: KNOWN_COLUMNS,
    REQUIRED_COLUMNS: REQUIRED_COLUMNS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EmployeeCsv = api;
})(typeof window !== 'undefined' ? window : globalThis);

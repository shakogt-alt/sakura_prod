// Field validation for the admin write API. Kept strict on purpose: the
// public site's renderer (index.html) reads these JSON files by exact
// field name with no fallback, so a malformed save here would silently
// break the live site. Returns an array of human-readable problem
// strings; an empty array means the payload is valid.

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isString(v) {
  return typeof v === 'string';
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; });
}

// price category `icon` (raw SVG) and blog post `body` (Quill HTML) are
// both rendered unescaped on the public site by design - that's what lets
// <path> show up as an actual icon and headings/bold/lists show up as real
// formatting instead of literal tag text. Neither legitimately needs
// script/style/event-handler markup, so block the constructs that could
// turn a compromised admin session into script execution for every site
// visitor (stored XSS served off the public pages).
var DANGEROUS_MARKUP_PATTERN = /<\s*(script|iframe|style|foreignObject|embed|object)\b|on[a-zA-Z]+\s*=|javascript\s*:/i;

function validateTeamLang(lang, obj, problems) {
  var prefix = lang + '.';
  if (!obj || typeof obj !== 'object') {
    problems.push(prefix + ' is required');
    return;
  }
  if (!isNonEmptyString(obj.name)) problems.push(prefix + 'name is required');
  if (!isNonEmptyString(obj.cardTagline)) problems.push(prefix + 'cardTagline is required');
  if (!isNonEmptyString(obj.modalTagline)) problems.push(prefix + 'modalTagline is required');
  if (!isNonEmptyString(obj.intro)) problems.push(prefix + 'intro is required');
  if (!isNonEmptyString(obj.background)) problems.push(prefix + 'background is required');
  if (!isStringArray(obj.specializes) || obj.specializes.length === 0) {
    problems.push(prefix + 'specializes must be a non-empty array of strings');
  }
  if (!isNonEmptyString(obj.closing)) problems.push(prefix + 'closing is required');
}

function validateTeamMember(payload) {
  var problems = [];
  if (!isNonEmptyString(payload.photo)) problems.push('photo is required (e.g. images/xxx.jpg)');
  ['ru', 'en', 'ka'].forEach(function (lang) {
    validateTeamLang(lang, payload[lang], problems);
  });
  return problems;
}

function validateBlogLang(lang, obj, problems) {
  var prefix = lang + '.';
  if (!obj || typeof obj !== 'object') {
    problems.push(prefix + ' is required');
    return;
  }
  if (!isNonEmptyString(obj.eyebrow)) problems.push(prefix + 'eyebrow is required');
  if (!isNonEmptyString(obj.title)) problems.push(prefix + 'title is required');
  if (!isNonEmptyString(obj.cardTitle)) problems.push(prefix + 'cardTitle is required');
  if (!isNonEmptyString(obj.sub)) problems.push(prefix + 'sub is required');
  if (!isNonEmptyString(obj.cardBadge)) problems.push(prefix + 'cardBadge is required');
  if (!isNonEmptyString(obj.cardExcerpt)) problems.push(prefix + 'cardExcerpt is required');
  if (!isNonEmptyString(obj.readLabel)) problems.push(prefix + 'readLabel is required');
  if (!isNonEmptyString(obj.body)) {
    problems.push(prefix + 'body is required');
  } else if (DANGEROUS_MARKUP_PATTERN.test(obj.body)) {
    problems.push(prefix + 'body contains disallowed markup (script/style/event handlers are not permitted)');
  }
}

function validateBlogPost(payload) {
  var problems = [];
  if (!isNonEmptyString(payload.image)) problems.push('image is required (e.g. images/xxx.jpg)');
  if (!payload.alt || typeof payload.alt !== 'object') {
    problems.push('alt is required ({ ru, en, ka })');
  } else {
    ['ru', 'en', 'ka'].forEach(function (lang) {
      if (!isNonEmptyString(payload.alt[lang])) problems.push('alt.' + lang + ' is required');
    });
  }
  ['ru', 'en', 'ka'].forEach(function (lang) {
    validateBlogLang(lang, payload[lang], problems);
  });
  return problems;
}

function validatePriceItem(item, index, problems) {
  var prefix = 'items[' + index + '].';
  if (!item || typeof item !== 'object') {
    problems.push(prefix + ' must be an object');
    return;
  }
  if (!isNonEmptyString(item.amount)) problems.push(prefix + 'amount is required');
  ['ru', 'en', 'ka'].forEach(function (lang) {
    if (!isNonEmptyString(item[lang])) problems.push(prefix + lang + ' is required');
  });
}

function validatePriceLang(lang, obj, problems) {
  var prefix = lang + '.';
  if (!obj || typeof obj !== 'object') {
    problems.push(prefix + ' is required');
    return;
  }
  if (!isNonEmptyString(obj.title)) problems.push(prefix + 'title is required');
  if (obj.includes !== undefined && !isStringArray(obj.includes)) {
    problems.push(prefix + 'includes must be an array of strings when present');
  }
}

function validatePriceCategory(payload) {
  var problems = [];
  if (payload.fullWidth !== undefined && typeof payload.fullWidth !== 'boolean') {
    problems.push('fullWidth must be a boolean when present');
  }
  if (!isString(payload.icon) || payload.icon.trim().length === 0) {
    problems.push('icon is required (raw SVG <path>/<circle>/... markup string)');
  } else if (DANGEROUS_MARKUP_PATTERN.test(payload.icon)) {
    problems.push('icon contains disallowed markup (script/style/event handlers are not permitted)');
  }
  ['ru', 'en', 'ka'].forEach(function (lang) {
    validatePriceLang(lang, payload[lang], problems);
  });
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    problems.push('items must be a non-empty array');
  } else {
    payload.items.forEach(function (item, i) { validatePriceItem(item, i, problems); });
  }
  return problems;
}

module.exports = { validateTeamMember, validateBlogPost, validatePriceCategory };

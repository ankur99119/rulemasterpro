/* Rule Master Pro — Hindi reading mode
 *
 * The app already had a per-rule "हिंदी सहायता" button. It worked, but it made
 * the reader tap once per paragraph — fine for looking one rule up, useless for
 * reading a chapter. This turns it into a mode: switch Hindi on once and every
 * rule you open translates itself and stays translated.
 *
 * It shares the existing translator and, more importantly, the existing cache
 * (window.rmpHindi), so a rule translated either way counts for both and is
 * never fetched twice. Cached rules render with no network at all, so a chapter
 * you have read before works in a tunnel; one you have not needs a signal.
 *
 * Every translated rule carries a notice that it is machine translation and the
 * English is the official text. These are safety rules — a reader has to be
 * able to tell which version is authoritative.
 */
(function () {
  'use strict';

  var MODE_KEY = 'rmp.hindiMode.v1';
  var mode = false;
  try { mode = localStorage.getItem(MODE_KEY) === '1'; } catch (e) {}

  var inFlight = {};       // cardKey -> true, so a card is never fetched twice
  var failed = {};

  function api() { return window.rmpHindi; }

  function isOn() { return mode; }

  function setMode(on) {
    mode = !!on;
    try { localStorage.setItem(MODE_KEY, mode ? '1' : '0'); } catch (e) {}
    document.documentElement.setAttribute('data-hindi', mode ? '1' : '0');
    if (mode) {
      // Translate everything already open, so switching on has a visible effect
      // rather than only applying to the next card the reader touches.
      document.querySelectorAll('.rule-card.expanded').forEach(apply);
    } else {
      document.querySelectorAll('.rmp-hi-auto').forEach(function (n) { n.remove(); });
      document.querySelectorAll('.rule-card').forEach(function (c) {
        delete c.dataset.hiAuto;
      });
    }
    document.dispatchEvent(new CustomEvent('rmp:hindi-mode', { detail: { on: mode } }));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function block(state, text) {
    var d = document.createElement('div');
    d.className = 'rmp-hi-auto rmp-hi-auto-' + state;
    if (state === 'loading') {
      d.innerHTML = '<div class="rmp-hi-auto-wait">हिंदी अनुवाद हो रहा है…</div>';
    } else if (state === 'error') {
      d.innerHTML = '<div class="rmp-hi-auto-wait">' + esc(text) + '</div>';
    } else {
      d.innerHTML =
        '<div class="rmp-hi-auto-note">' +
          'स्वचालित अनुवाद · अनौपचारिक। ऊपर दिया गया अंग्रेज़ी पाठ ही आधिकारिक है।' +
          '<span>Automatic translation, unofficial. The English above is the official text.</span>' +
        '</div>' +
        '<div class="rmp-hi-auto-text">' + esc(text) + '</div>';
    }
    return d;
  }

  /* Translate one expanded card, if it is not already done or in progress. */
  function apply(card) {
    if (!mode || !card) return;
    var a = api();
    if (!a) return;
    if (!card.classList.contains('expanded')) return;
    if (card.dataset.hiAuto === '1') return;

    var body = card.querySelector('.rule-text-content');
    if (!body) return;

    var key = a.keyFor(card);
    if (inFlight[key]) return;

    card.dataset.hiAuto = '1';
    var old = card.querySelector('.rmp-hi-auto');
    if (old) old.remove();

    var cached = a.read(key);
    if (cached && cached.translated) {
      body.parentNode.insertBefore(block('done', cached.translated), body.nextSibling);
      return;
    }
    if (failed[key]) {
      body.parentNode.insertBefore(
        block('error', 'हिंदी अनुवाद उपलब्ध नहीं — इंटरनेट जाँचें। Translation unavailable offline.'),
        body.nextSibling);
      return;
    }

    var wait = block('loading');
    body.parentNode.insertBefore(wait, body.nextSibling);
    inFlight[key] = true;

    var pieces = a.pieces(card);
    a.translate(pieces.source).then(function (translated) {
      delete inFlight[key];
      wait.remove();
      if (!translated) throw new Error('empty');
      a.write(key, { translated: translated, savedAt: Date.now(), source: pieces.source });
      if (mode && card.dataset.hiAuto === '1') {
        body.parentNode.insertBefore(block('done', translated), body.nextSibling);
      }
    }).catch(function () {
      delete inFlight[key];
      failed[key] = true;
      wait.remove();
      if (mode && card.dataset.hiAuto === '1') {
        body.parentNode.insertBefore(
          block('error', 'हिंदी अनुवाद अभी नहीं मिला — इंटरनेट जाँचें। Could not translate; check your connection.'),
          body.nextSibling);
      }
    });
  }

  /* Bubble phase, after the inline onclick that adds .expanded — the same trap
   * that stopped highlighting from ever attaching. */
  document.addEventListener('click', function (e) {
    if (!mode) return;
    var header = e.target.closest && e.target.closest('.rule-header');
    if (!header) return;
    var card = header.parentElement;
    if (card && card.classList.contains('expanded')) apply(card);
  });

  /* Cards arrive as chapters render; catch any that are already open. */
  function sweep() {
    if (!mode) return;
    document.querySelectorAll('.rule-card.expanded').forEach(apply);
  }

  window.rmpHindiMode = {
    isOn: isOn,
    set: setMode,
    toggle: function () { setMode(!mode); },
    cachedCount: function () {
      var n = 0;
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('rmp_hi_') === 0) n++;
        });
      } catch (e) {}
      return n;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.setAttribute('data-hindi', mode ? '1' : '0');
    try {
      if (typeof MutationObserver === 'function') {
        var t = null;
        new MutationObserver(function () {
          clearTimeout(t); t = setTimeout(sweep, 120);
        }).observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) { console.warn('[hindi]', e); }
    window.addEventListener('hashchange', function () { setTimeout(sweep, 200); });
    sweep();
  });
})();

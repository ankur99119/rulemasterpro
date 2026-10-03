/* Rule Master Pro — Delhi Division safety portal
 *
 * Brings the division's Google Site (dli-operational-safety) into the app:
 * the JPO, divisional safety circulars, safety drives, headquarters and
 * Railway Board circulars.
 *
 * The first version framed the site inside the app. That does not work:
 * Google Sites sends X-Frame-Options, so every section showed "sites.google.com
 * refused to connect". The watchdog meant to catch that never fired either,
 * because the browser raises `load` on Google's own refusal page — so the frame
 * looked like it had loaded successfully while showing an error.
 *
 * There is no way around it from this side; whether a page may be framed is the
 * other server's decision. So the sections open in the browser instead, which
 * is reliable, and the screen says that is what the buttons do rather than
 * pretending otherwise.
 *
 * This is the one part of the app that cannot work offline. The manuals are on
 * the device; these circulars live on Google's servers and are updated there.
 * That is said plainly on the screen rather than left for a signalman in a
 * block hut to discover.
 */
(function () {
  'use strict';

  var BASE = 'https://sites.google.com/view/dli-operational-safety/';

  var SECTIONS = [
    { slug: 'jpo',                      hi: 'संयुक्त प्रक्रिया आदेश',        en: 'Joint Procedure Orders',        icon: '📋' },
    { slug: 'divisional-safety-circulars', hi: 'मंडल संरक्षा परिपत्र',      en: 'Divisional Safety Circulars',   icon: '🛡️' },
    { slug: 'safety-drives',            hi: 'संरक्षा अभियान',                en: 'Safety Drives',                 icon: '🚦' },
    { slug: 'headquarters-circulars',   hi: 'उत्तर रेलवे मुख्यालय परिपत्र',  en: "Headquarters Circulars",        icon: '🏛️' },
    { slug: 'railway-boards-circulars', hi: 'रेलवे बोर्ड परिपत्र',           en: "Railway Board Circulars",       icon: '📜' },
    { slug: 'correction-slips',         hi: 'नियमावली में संशोधन पत्र',      en: 'Correction Slips (portal copy)', icon: '✏️' },
    { slug: 'rule-books',               hi: 'नियमावली',                      en: 'Rule Books (portal copy)',      icon: '📚' }
  ];

  var overlay = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
    if ((location.hash || '').indexOf('#safety') === 0) {
      history.replaceState(null, '', location.pathname + location.search + '#home');
    }
  }

  function urlFor(sec) { return BASE + sec.slug; }

  function showIndex() {
    var stage = overlay.querySelector('.rmp-sf-stage');
    var title = overlay.querySelector('.rmp-sf-title');
    title.textContent = 'Delhi Division · Operating';

    var html =
      '<div class="rmp-sf-intro">' +
        '<h2>दिल्ली मंडल परिचालन डिजिटल संग्रह</h2>' +
        '<p>Safety circulars, drives, joint procedure orders and headquarters ' +
        'instructions for Delhi Division.</p>' +
        '<p class="rmp-sf-warn">These open in your browser, on the division portal, ' +
        'and need an internet connection. Google does not allow its Sites pages to ' +
        'be shown inside another app. The seven manuals here work offline; these ' +
        'circulars do not.</p>' +
      '</div><div class="rmp-sf-grid">';

    // Real anchors, not buttons. A link the browser owns opens reliably from a
    // PWA, restores long-press "open in new tab", and shows the destination.
    SECTIONS.forEach(function (s) {
      html += '<a class="rmp-sf-card" href="' + esc(urlFor(s)) + '" target="_blank" rel="noopener">' +
                '<span class="rmp-sf-ic">' + s.icon + '</span>' +
                '<span class="rmp-sf-hi">' + esc(s.hi) + '</span>' +
                '<span class="rmp-sf-en">' + esc(s.en) + ' ↗</span>' +
              '</a>';
    });

    html += '</div><a class="rmp-sf-whole" href="' + BASE + 'home" target="_blank" rel="noopener">' +
            'Open the full portal in your browser ↗</a>';

    stage.innerHTML = html;
  }

  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'rmp-sf';
    overlay.innerHTML =
      '<div class="rmp-sf-head">' +
        '<span class="rmp-sf-title">Delhi Division · Operating</span>' +
        '<button type="button" class="rmp-sf-x" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="rmp-sf-stage"></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.rmp-sf-x').onclick = close;
    showIndex();
  }

  window.rmpSafetyPortal = { open: open, close: close };

  /* First thing on the home screen, above the manuals and above Continue
   * reading. The manuals change a few times a year; safety circulars, drives
   * and JPOs change constantly, so this is the item most likely to be the
   * reason someone opened the app today. */
  function mountCard() {
    if (document.getElementById('rmp-sf-open')) return;
    var lib = document.querySelector('#home .rmp-lib');
    if (!lib) return;
    var card = document.createElement('button');
    card.id = 'rmp-sf-open';
    card.type = 'button';
    card.className = 'rmp-sf-entry';
    card.innerHTML =
      '<span class="rmp-sf-entry-ic">🛡️</span>' +
      '<span class="rmp-sf-entry-txt">' +
        '<b>Safety Circulars &amp; Drives</b>' +
        '<em>JPO · divisional and HQ circulars · Delhi Division portal</em>' +
      '</span><span class="rmp-sf-entry-go">›</span>';
    card.onclick = open;
    lib.insertBefore(card, lib.firstChild);
  }

  function routeCheck() {
    if ((location.hash || '').indexOf('#safety') === 0) open();
  }

  document.addEventListener('DOMContentLoaded', function () {
    mountCard();
    routeCheck();
    try {
      if (typeof MutationObserver === 'function') {
        var t = null;
        new MutationObserver(function () {
          clearTimeout(t); t = setTimeout(mountCard, 160);
        }).observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) { console.warn('[safety]', e); }
    window.addEventListener('hashchange', function () {
      if ((location.hash || '').indexOf('#safety') === 0) open();
      else close();
    });
  });
})();

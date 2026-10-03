/* Rule Master Pro — Delhi Division safety portal
 *
 * Brings the division's Google Site (dli-operational-safety) into the app:
 * the JPO, divisional safety circulars, safety drives, headquarters and
 * Railway Board circulars.
 *
 * The site is loaded in a frame so it reads as part of the app rather than a
 * jump out to a browser. Google Sites is not guaranteed to allow framing, and
 * a blocked frame fails silently — it just stays blank, which would look like
 * the app was broken. So every section is opened with a watchdog: if the frame
 * has not reported a load within a few seconds, the section is offered as an
 * external link instead, with the reason stated.
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

  function openSection(sec) {
    var stage = overlay.querySelector('.rmp-sf-stage');
    var title = overlay.querySelector('.rmp-sf-title');
    var back = overlay.querySelector('.rmp-sf-back');
    title.textContent = sec.en;
    back.style.display = '';

    var url = BASE + sec.slug;
    stage.innerHTML =
      '<div class="rmp-sf-loading">' + esc(sec.hi) + ' — loading from the division portal…</div>' +
      '<iframe class="rmp-sf-frame" src="' + esc(url) + '" title="' + esc(sec.en) + '" ' +
      'referrerpolicy="no-referrer-when-downgrade"></iframe>';

    var frame = stage.querySelector('.rmp-sf-frame');
    var note = stage.querySelector('.rmp-sf-loading');
    var settled = false;

    frame.addEventListener('load', function () {
      settled = true;
      if (note) note.remove();
      frame.classList.add('is-ready');
    });

    // A frame Google refuses to serve never fires load, and never errors
    // either — it simply stays blank. Without this the screen would just sit
    // there looking broken.
    setTimeout(function () {
      if (settled || !overlay || !stage.contains(frame)) return;
      stage.innerHTML =
        '<div class="rmp-sf-fallback">' +
          '<p><strong>' + esc(sec.hi) + '</strong></p>' +
          '<p>This section would not open inside the app. Google Sites does not ' +
          'always allow its pages to be embedded, and that is decided on their ' +
          'side, not here.</p>' +
          '<a class="rmp-sf-ext" href="' + esc(url) + '" target="_blank" rel="noopener">' +
            'Open ' + esc(sec.en) + ' in your browser</a>' +
        '</div>';
    }, 6000);
  }

  function showIndex() {
    var stage = overlay.querySelector('.rmp-sf-stage');
    var title = overlay.querySelector('.rmp-sf-title');
    var back = overlay.querySelector('.rmp-sf-back');
    title.textContent = 'Delhi Division · Operating';
    back.style.display = 'none';

    var html =
      '<div class="rmp-sf-intro">' +
        '<h2>दिल्ली मंडल परिचालन डिजिटल संग्रह</h2>' +
        '<p>Safety circulars, drives, joint procedure orders and headquarters ' +
        'instructions for Delhi Division.</p>' +
        '<p class="rmp-sf-warn">These pages come from the division portal and need ' +
        'an internet connection. The seven manuals in this app work offline; this ' +
        'section does not.</p>' +
      '</div><div class="rmp-sf-grid">';

    SECTIONS.forEach(function (s, i) {
      html += '<button type="button" class="rmp-sf-card" data-i="' + i + '">' +
                '<span class="rmp-sf-ic">' + s.icon + '</span>' +
                '<span class="rmp-sf-hi">' + esc(s.hi) + '</span>' +
                '<span class="rmp-sf-en">' + esc(s.en) + '</span>' +
              '</button>';
    });

    html += '</div><a class="rmp-sf-whole" href="' + BASE + 'home" target="_blank" rel="noopener">' +
            'Open the full portal in your browser ↗</a>';

    stage.innerHTML = html;
    stage.querySelectorAll('.rmp-sf-card').forEach(function (b) {
      b.onclick = function () { openSection(SECTIONS[Number(b.dataset.i)]); };
    });
  }

  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'rmp-sf';
    overlay.innerHTML =
      '<div class="rmp-sf-head">' +
        '<button type="button" class="rmp-sf-back" aria-label="Back to sections">‹</button>' +
        '<span class="rmp-sf-title">Delhi Division · Operating</span>' +
        '<button type="button" class="rmp-sf-x" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="rmp-sf-stage"></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.rmp-sf-x').onclick = close;
    overlay.querySelector('.rmp-sf-back').onclick = showIndex;
    showIndex();
  }

  window.rmpSafetyPortal = { open: open, close: close };

  /* A card on the home screen, next to the other tools. */
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
    lib.appendChild(card);
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

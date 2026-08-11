/* Rule Master Pro — continuous reading view
 *
 * The chapter screen is a stack of collapsed cards: you tap one, it opens, you
 * read a paragraph, you tap the next. That is a lookup tool. It is the right
 * shape for "what does 3.06 say" and the wrong shape for reading a chapter,
 * which is what this adds — the whole chapter as one continuous column of text,
 * with the rule number set as a heading and nothing to tap.
 *
 * It reads the cards the app has already rendered rather than the manual data
 * directly. Each of the seven manuals stores its paragraphs differently, and
 * the card renderers have already resolved all of that, plus the correction
 * slip badges and the per-manual paragraph styling. Cloning their output means
 * the reading view can never disagree with the card view about what a rule says.
 *
 * Figures and tables are rendered into the flow at the paragraph they belong to,
 * on demand as that paragraph nears the viewport, so opening a chapter with 129
 * diagrams does not rasterise 129 PDF regions up front.
 */
(function () {
  'use strict';

  var POS_KEY = 'rmp.readpos.v1';
  var view = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function currentChapterKey() {
    return (location.hash || '').replace(/^#/, '');
  }

  function savePos(frac) {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      all[currentChapterKey()] = frac;
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function loadPos() {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      return all[currentChapterKey()] || 0;
    } catch (e) { return 0; }
  }

  /* Collect what is on the chapter screen right now. */
  function collect() {
    var cards = document.querySelectorAll('#content-list .rule-card');
    var out = [];
    cards.forEach(function (card) {
      var id = card.getAttribute('data-id') || '';
      var parts = id.split('-');
      var manual = parts.shift();
      var num = parts.join('-');
      var badge = card.querySelector('.rule-badges');
      var titleEl = card.querySelector('.para-card-title, .rule-name');
      var body = card.querySelector('.rule-text-content');
      if (!body) return;
      out.push({
        manual: manual,
        num: num,
        // The title is hidden on cards whose "title" is only the body's first
        // line — see .title-preview. Same judgement applies here.
        title: card.classList.contains('title-preview') ? '' :
               (titleEl ? titleEl.textContent.trim() : ''),
        // The badge markup is spread over several lines, so its textContent
        // arrives as "GR\n        3.01". Collapse it to "GR · 3.01".
        badge: badge ? badge.textContent.replace(/\s+/g, ' ').trim().replace(/^(\S+)\s/, '$1 · ') : num,
        html: body.innerHTML
      });
    });
    return out;
  }

  function chapterTitle() {
    var el = document.getElementById('content-chapter-title');
    return el ? el.textContent.trim() : 'Reading';
  }

  function close() {
    if (!view) return;
    var sc = view.querySelector('.rmp-read-scroll');
    if (sc && sc.scrollHeight > sc.clientHeight) {
      savePos(sc.scrollTop / (sc.scrollHeight - sc.clientHeight));
    }
    view.remove();
    view = null;
    document.body.style.overflow = '';
    document.documentElement.removeAttribute('data-reading');
  }

  function open() {
    var items = collect();
    if (!items.length) return;
    close();

    view = document.createElement('div');
    view.className = 'rmp-read';
    view.innerHTML =
      '<div class="rmp-read-bar">' +
        '<button type="button" class="rmp-read-close" aria-label="Close reading view">✕</button>' +
        '<span class="rmp-read-title">' + esc(chapterTitle()) + '</span>' +
        '<button type="button" class="rmp-read-aa" aria-label="Reading settings">Aa</button>' +
      '</div>' +
      '<div class="rmp-read-progress"><i></i></div>' +
      '<div class="rmp-read-scroll"><article class="rmp-read-flow"></article></div>';

    var flow = view.querySelector('.rmp-read-flow');

    items.forEach(function (it) {
      var sec = document.createElement('section');
      sec.className = 'rmp-read-para';
      sec.setAttribute('data-id', it.manual + '-' + it.num);
      sec.innerHTML =
        '<div class="rmp-read-num">' + esc(it.badge) + '</div>' +
        (it.title ? '<h3 class="rmp-read-h">' + esc(it.title) + '</h3>' : '') +
        '<div class="rule-text-content rmp-read-body">' + it.html + '</div>';
      flow.appendChild(sec);
    });

    document.body.appendChild(view);
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-reading', '1');

    view.querySelector('.rmp-read-close').onclick = close;
    view.querySelector('.rmp-read-aa').onclick = function () {
      if (window.rmpOpenReaderControls) window.rmpOpenReaderControls();
    };

    var sc = view.querySelector('.rmp-read-scroll');
    var bar = view.querySelector('.rmp-read-progress i');
    sc.addEventListener('scroll', function () {
      var max = sc.scrollHeight - sc.clientHeight;
      var f = max > 0 ? sc.scrollTop / max : 0;
      bar.style.width = Math.round(f * 100) + '%';
    }, { passive: true });

    // Highlighting, Hindi and the figure/table blocks, per paragraph, as each
    // one comes near the viewport.
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        hydrate(en.target);
      });
    }, { root: sc, rootMargin: '400px 0px' }) : null;

    view.querySelectorAll('.rmp-read-para').forEach(function (sec) {
      if (io) io.observe(sec); else hydrate(sec);
    });

    var frac = loadPos();
    if (frac > 0) {
      requestAnimationFrame(function () {
        sc.scrollTop = frac * (sc.scrollHeight - sc.clientHeight);
      });
    }

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  }

  function hydrate(sec) {
    var id = sec.getAttribute('data-id') || '';
    var parts = id.split('-');
    var manual = parts.shift();
    var num = parts.join('-');
    var body = sec.querySelector('.rmp-read-body');
    if (!body) return;

    if (window.rmpEnableHighlighting) window.rmpEnableHighlighting(body, manual, num);

    var width = Math.min(body.clientWidth || 340, 620);
    if (window.rmpRenderTables) window.rmpRenderTables(num, sec, { width: width, manual: manual });
    if (window.rmpRenderFigures) window.rmpRenderFigures(num, sec, { width: width, manual: manual });

    // Hindi, if the mode is on, using the same shared cache as everywhere else.
    var h = window.rmpHindi;
    if (h && window.rmpHindiMode && window.rmpHindiMode.isOn()) {
      var key = 'rmp_hi_' + id.replace(/[^a-z0-9._-]+/gi, '_');
      var cached = h.read(key);
      var add = function (txt) {
        var d = document.createElement('div');
        d.className = 'rmp-hi-auto rmp-hi-auto-done';
        d.innerHTML =
          '<div class="rmp-hi-auto-note">स्वचालित अनुवाद · अनौपचारिक। ऊपर दिया गया अंग्रेज़ी पाठ ही आधिकारिक है।' +
          '<span>Automatic translation, unofficial. The English above is the official text.</span></div>' +
          '<div class="rmp-hi-auto-text">' + esc(txt) + '</div>';
        body.parentNode.insertBefore(d, body.nextSibling);
      };
      if (cached && cached.translated) add(cached.translated);
      else {
        var src = body.textContent.trim();
        h.translate(src).then(function (t) {
          if (t) { h.write(key, { translated: t, savedAt: Date.now(), source: src }); add(t); }
        }).catch(function () {});
      }
    }
  }

  /* The entry point: a button on the chapter screen. */
  function mountButton() {
    var host = document.getElementById('content-list');
    if (!host) return;
    var onChapter = !!document.querySelector('#content-list .rule-card');
    var btn = document.getElementById('rmp-read-open');
    if (!onChapter) { if (btn) btn.remove(); return; }
    if (btn) return;

    btn = document.createElement('button');
    btn.id = 'rmp-read-open';
    btn.className = 'rmp-read-open';
    btn.type = 'button';
    btn.innerHTML = '<span>Read this chapter</span><em>continuous view</em>';
    btn.onclick = open;
    host.parentNode.insertBefore(btn, host);
  }

  window.rmpReadingView = { open: open, close: close };

  document.addEventListener('DOMContentLoaded', function () {
    mountButton();
    try {
      if (typeof MutationObserver === 'function') {
        var t = null;
        new MutationObserver(function () {
          clearTimeout(t); t = setTimeout(mountButton, 150);
        }).observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) { console.warn('[read]', e); }
    window.addEventListener('hashchange', function () {
      close();
      setTimeout(mountButton, 220);
    });
  });
})();

/* Rule Master Pro — the book
 *
 * The first attempt at this was a long scrolling column, and it was wrong. A
 * scroll is a document. A book has pages you turn, and that single difference
 * is most of what "reading a book" feels like — you always know where the page
 * ends, your eye returns to a fixed left margin, and progress is a page number
 * rather than a shrinking scrollbar.
 *
 * So the text is paginated for real. The chapter is laid out with CSS
 * multi-column, each column exactly one screen wide, and turning a page
 * translates the whole block sideways by one column. The browser does the
 * line-breaking and the column-filling; nothing is measured or guessed. That
 * also means a page never splits a word, and re-flows correctly when the reader
 * changes the type size — at which point we find the page holding the sentence
 * they were on and land them back there.
 *
 * Content comes from the cards the app has already rendered, not from the
 * manual data, so the book and the card view can never disagree about what a
 * rule says.
 */
(function () {
  'use strict';

  var POS_KEY = 'rmp.bookpos.v1';
  var book = null;
  var state = { page: 0, pages: 1, colW: 0, gap: 44 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function chapterKey() { return (location.hash || '').replace(/^#/, ''); }

  function savePage() {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      all[chapterKey()] = { page: state.page, pages: state.pages };
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function loadPage() {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      return all[chapterKey()] || null;
    } catch (e) { return null; }
  }

  function collect() {
    var out = [];
    document.querySelectorAll('#content-list .rule-card').forEach(function (card) {
      var id = card.getAttribute('data-id') || '';
      var parts = id.split('-');
      var manual = parts.shift();
      var num = parts.join('-');
      var body = card.querySelector('.rule-text-content');
      if (!body) return;
      var titleEl = card.querySelector('.para-card-title, .rule-name');
      out.push({
        id: id, manual: manual, num: num,
        title: card.classList.contains('title-preview') ? '' :
               (titleEl ? titleEl.textContent.trim() : ''),
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
    if (!book) return;
    savePage();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('rmp:reader-prefs', relayout);
    book.remove();
    book = null;
    document.body.style.overflow = '';
    document.documentElement.removeAttribute('data-reading');
  }

  /* ── pagination ─────────────────────────────────────────────────────── */

  function measure() {
    if (!book) return;
    var stage = book.querySelector('.rmp-bk-stage');
    var flow = book.querySelector('.rmp-bk-flow');
    state.colW = stage.clientWidth;
    flow.style.columnWidth = state.colW + 'px';
    flow.style.columnGap = state.gap + 'px';
    flow.style.height = stage.clientHeight + 'px';
    // scrollWidth rounds down on some engines; add most of a gap before dividing
    var total = flow.scrollWidth + state.gap - 1;
    state.pages = Math.max(1, Math.round(total / (state.colW + state.gap)));
  }

  function goto(p, animate) {
    if (!book) return;
    state.page = Math.max(0, Math.min(p, state.pages - 1));
    var flow = book.querySelector('.rmp-bk-flow');
    flow.style.transition = animate ? 'transform .26s cubic-bezier(.22,.61,.36,1)' : 'none';
    flow.style.transform = 'translateX(' + (-state.page * (state.colW + state.gap)) + 'px)';
    var foot = book.querySelector('.rmp-bk-folio');
    if (foot) foot.textContent = 'Page ' + (state.page + 1) + ' of ' + state.pages;
    var prog = book.querySelector('.rmp-bk-prog i');
    if (prog) prog.style.width = ((state.page + 1) / state.pages * 100) + '%';
    savePage();
  }

  function next() { if (state.page < state.pages - 1) goto(state.page + 1, true); }
  function prev() { if (state.page > 0) goto(state.page - 1, true); }

  /* Re-paginate after a type or theme change, keeping the reader on the same
   * sentence rather than the same page number — at a larger size the text they
   * were reading may be three pages further on. */
  function relayout() {
    if (!book) return;
    var flow = book.querySelector('.rmp-bk-flow');
    var anchorId = null;
    var marks = flow.querySelectorAll('.rmp-bk-para');
    var left = state.page * (state.colW + state.gap);
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].offsetLeft >= left - 4) { anchorId = marks[i].getAttribute('data-id'); break; }
    }
    flow.style.transform = 'none';
    measure();
    if (anchorId) {
      var el = flow.querySelector('.rmp-bk-para[data-id="' + anchorId + '"]');
      if (el) { goto(Math.floor(el.offsetLeft / (state.colW + state.gap)), false); return; }
    }
    goto(state.page, false);
  }

  var resizeT = null;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(relayout, 180); }
  function onKey(e) {
    if (!book) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Escape') close();
  }

  /* ── open ───────────────────────────────────────────────────────────── */

  function open() {
    var items = collect();
    if (!items.length) return;
    close();

    book = document.createElement('div');
    book.className = 'rmp-bk';
    book.innerHTML =
      '<div class="rmp-bk-head">' +
        '<button type="button" class="rmp-bk-x" aria-label="Close book">✕</button>' +
        '<span class="rmp-bk-running">' + esc(chapterTitle()) + '</span>' +
        '<button type="button" class="rmp-bk-aa" aria-label="Reading settings">Aa</button>' +
      '</div>' +
      '<div class="rmp-bk-stage"><div class="rmp-bk-flow"></div></div>' +
      '<div class="rmp-bk-foot">' +
        '<div class="rmp-bk-prog"><i></i></div>' +
        '<div class="rmp-bk-folio">Page 1</div>' +
      '</div>';

    var flow = book.querySelector('.rmp-bk-flow');
    items.forEach(function (it) {
      var sec = document.createElement('section');
      sec.className = 'rmp-bk-para';
      sec.setAttribute('data-id', it.id);
      sec.innerHTML =
        '<p class="rmp-bk-num">' + esc(it.num) + '</p>' +
        (it.title ? '<h3 class="rmp-bk-h">' + esc(it.title) + '</h3>' : '') +
        '<div class="rule-text-content rmp-bk-body">' + it.html + '</div>';
      flow.appendChild(sec);
    });

    document.body.appendChild(book);
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-reading', '1');

    book.querySelector('.rmp-bk-x').onclick = close;
    book.querySelector('.rmp-bk-aa').onclick = function () {
      if (window.rmpOpenReaderControls) window.rmpOpenReaderControls();
    };

    var stage = book.querySelector('.rmp-bk-stage');

    /* Tap the right third to go forward, the left third to go back, and the
     * middle to do nothing — the same zones a Kindle uses. Selecting text must
     * not turn the page, so a tap only counts if nothing is selected and the
     * finger barely moved. */
    var sx = 0, sy = 0, moved = false;
    stage.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; moved = false;
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      var t = e.changedTouches[0];
      if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) moved = true;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0];
      var dx = t.clientX - sx;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (Math.abs(dx) > 45) { dx < 0 ? next() : prev(); return; }
      if (moved) return;
      var third = stage.clientWidth / 3;
      if (t.clientX > stage.clientWidth - third) next();
      else if (t.clientX < third) prev();
    });

    stage.addEventListener('click', function (e) {
      if (('ontouchstart' in window)) return;      // touch handled above
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      var third = stage.clientWidth / 3;
      var x = e.clientX - stage.getBoundingClientRect().left;
      if (x > stage.clientWidth - third) next();
      else if (x < third) prev();
    });

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('rmp:reader-prefs', relayout);

    // Hydrate first, because tables and figures change the height of the flow
    // and therefore the page count.
    hydrateAll(flow).then(function () {
      // The reader may have closed the book while the diagrams were still
      // rasterising — a real case, not a hypothetical, since a chapter can
      // carry a hundred of them.
      if (!book) return;
      measure();
      var saved = loadPage();
      if (saved && saved.pages) {
        goto(Math.round((saved.page / Math.max(1, saved.pages - 1)) * (state.pages - 1)) || 0, false);
      } else {
        goto(0, false);
      }
    });
  }

  function hydrateAll(flow) {
    var secs = [].slice.call(flow.querySelectorAll('.rmp-bk-para'));
    var width = Math.min(flow.clientWidth || 340, 620);
    var jobs = [];
    secs.forEach(function (sec) {
      var id = sec.getAttribute('data-id') || '';
      var parts = id.split('-');
      var manual = parts.shift();
      var num = parts.join('-');
      var body = sec.querySelector('.rmp-bk-body');
      if (body && window.rmpEnableHighlighting) window.rmpEnableHighlighting(body, manual, num);
      if (window.rmpRenderTables) jobs.push(window.rmpRenderTables(num, sec, { width: width, manual: manual }));
      if (window.rmpRenderFigures) jobs.push(window.rmpRenderFigures(num, sec, { width: width, manual: manual }));
      hindiFor(sec, body, id);
    });
    return Promise.all(jobs.map(function (p) {
      return (p && p.then) ? p.catch(function () {}) : Promise.resolve();
    })).then(function () {
      // Give the browser a frame to lay the new blocks out before measuring.
      return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    });
  }

  function hindiFor(sec, body, id) {
    var h = window.rmpHindi;
    if (!h || !body || !window.rmpHindiMode || !window.rmpHindiMode.isOn()) return;
    var key = 'rmp_hi_' + id.replace(/[^a-z0-9._-]+/gi, '_');
    var add = function (txt) {
      var d = document.createElement('div');
      d.className = 'rmp-hi-auto rmp-hi-auto-done';
      d.innerHTML =
        '<div class="rmp-hi-auto-note">स्वचालित अनुवाद · अनौपचारिक। ऊपर दिया गया अंग्रेज़ी पाठ ही आधिकारिक है।' +
        '<span>Automatic translation, unofficial. The English above is the official text.</span></div>' +
        '<div class="rmp-hi-auto-text">' + esc(txt) + '</div>';
      body.parentNode.insertBefore(d, body.nextSibling);
    };
    var cached = h.read(key);
    if (cached && cached.translated) { add(cached.translated); return; }
    var src = body.textContent.trim();
    h.translate(src).then(function (t) {
      if (!t) return;
      h.write(key, { translated: t, savedAt: Date.now(), source: src });
      add(t);
      relayout();
    }).catch(function () {});
  }

  /* ── entry point ────────────────────────────────────────────────────── */

  function mountButton() {
    var host = document.getElementById('content-list');
    if (!host) return;
    var onChapter = !!document.querySelector('#content-list .rule-card');
    var btn = document.getElementById('rmp-bk-open');
    if (!onChapter) { if (btn) btn.remove(); return; }
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'rmp-bk-open';
    btn.className = 'rmp-bk-open';
    btn.type = 'button';
    btn.innerHTML = '<span>Read as a book</span><em>turn pages · no scrolling</em>';
    btn.onclick = open;
    host.parentNode.insertBefore(btn, host);
  }

  window.rmpBook = { open: open, close: close, next: next, prev: prev,
                     state: function () { return state; } };
  window.rmpReadingView = window.rmpBook;   // old name kept working

  document.addEventListener('DOMContentLoaded', function () {
    mountButton();
    try {
      if (typeof MutationObserver === 'function') {
        var t = null;
        new MutationObserver(function () {
          clearTimeout(t); t = setTimeout(mountButton, 150);
        }).observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) { console.warn('[book]', e); }
    window.addEventListener('hashchange', function () {
      close(); setTimeout(mountButton, 220);
    });
  });
})();

/* Rule Master Pro — reading experience
 *
 * Everything a reader expects from an e-reader and the app did not have:
 * text selection with coloured highlights, those highlights saved and
 * revisitable, type and theme controls, and a remembered reading position.
 *
 * Highlights are anchored by character offset within a paragraph's plain text,
 * not by DOM node. Rule bodies are re-rendered constantly — on search, on
 * expand, on filter — so any DOM-based anchor would be lost the moment a card
 * was rebuilt. Offsets survive that, and survive a data update as long as the
 * paragraph's wording has not changed.
 *
 * Storage is localStorage, keyed per manual and paragraph. No account needed,
 * works offline, and nothing leaves the device.
 */
(function () {
  'use strict';

  var HL_KEY   = 'rmp.highlights.v1';
  var PREF_KEY = 'rmp.reader.v1';
  var POS_KEY  = 'rmp.position.v1';

  var COLOURS = [
    { id: 'y', label: 'Yellow', ink: '#92400E', bg: '#FEF3C7' },
    { id: 'g', label: 'Green',  ink: '#065F46', bg: '#D1FAE5' },
    { id: 'b', label: 'Blue',   ink: '#1E3A8A', bg: '#DBEAFE' },
    { id: 'p', label: 'Pink',   ink: '#9D174D', bg: '#FCE7F3' }
  ];

  /* ── storage ───────────────────────────────────────────────────────── */

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      // Quota exceeded, or Safari private mode. Tell the caller rather than
      // silently dropping the user's highlight.
      console.warn('[reader] could not save', key, e);
      return false;
    }
  }

  var store = readJSON(HL_KEY, {});          // "manual|num" -> [ {s,e,c,t,at} ]
  var prefs = readJSON(PREF_KEY, {
    size: 15, leading: 1.75, theme: 'light', serif: false, width: 'normal'
  });

  function keyFor(manual, num) { return manual + '|' + String(num).trim(); }

  window.rmpHighlights = {
    all: function () { return store; },
    for: function (manual, num) { return store[keyFor(manual, num)] || []; },
    count: function () {
      return Object.keys(store).reduce(function (n, k) { return n + store[k].length; }, 0);
    },
    remove: function (manual, num, at) {
      var k = keyFor(manual, num);
      if (!store[k]) return;
      store[k] = store[k].filter(function (h) { return h.at !== at; });
      if (!store[k].length) delete store[k];
      writeJSON(HL_KEY, store);
      document.dispatchEvent(new CustomEvent('rmp:highlights-changed'));
    },
    clearAll: function () {
      store = {}; writeJSON(HL_KEY, store);
      document.dispatchEvent(new CustomEvent('rmp:highlights-changed'));
    }
  };

  /* ── offsets ───────────────────────────────────────────────────────── */

  /* Character offset of a selection boundary within the container's text,
   * counting only text nodes so markup changes do not shift it. */
  function offsetOf(root, node, nodeOffset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var total = 0, n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + nodeOffset;
      total += n.nodeValue.length;
    }
    return total;
  }

  /* Paint saved highlights by walking text nodes and wrapping the ranges that
   * fall inside them. Done after render, and re-done whenever a card rebuilds. */
  function paint(root, list) {
    if (!list || !list.length) return;
    var ordered = list.slice().sort(function (a, b) { return b.s - a.s; });
    ordered.forEach(function (h) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var pos = 0, n;
      while ((n = walker.nextNode())) {
        var len = n.nodeValue.length;
        if (h.s < pos + len && h.e > pos) {
          var from = Math.max(0, h.s - pos);
          var to   = Math.min(len, h.e - pos);
          if (to > from) {
            try {
              var r = document.createRange();
              r.setStart(n, from); r.setEnd(n, to);
              var mark = document.createElement('mark');
              mark.className = 'rmp-hl rmp-hl-' + (h.c || 'y');
              mark.dataset.at = h.at;
              r.surroundContents(mark);
            } catch (e) { /* range spans an element boundary — skip this node */ }
            // The tree changed under the walker, so restart for this highlight.
            break;
          }
        }
        pos += len;
      }
    });
  }

  window.rmpPaintHighlights = function (root, manual, num) {
    paint(root, window.rmpHighlights.for(manual, num));
  };

  /* ── selection toolbar ─────────────────────────────────────────────── */

  var bar = null;

  function hideBar() { if (bar) { bar.remove(); bar = null; } }

  function showBar(rect, onPick, onCopy) {
    hideBar();
    bar = document.createElement('div');
    bar.className = 'rmp-hlbar';
    COLOURS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rmp-hlbar-dot';
      b.style.background = c.bg;
      b.style.borderColor = c.ink;
      b.setAttribute('aria-label', 'Highlight in ' + c.label.toLowerCase());
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () { onPick(c.id); };
      bar.appendChild(b);
    });
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'rmp-hlbar-copy';
    copy.textContent = 'Copy';
    copy.onmousedown = function (e) { e.preventDefault(); };
    copy.onclick = onCopy;
    bar.appendChild(copy);

    document.body.appendChild(bar);

    /* Below the selection by default. Chrome on Android puts its own
     * Copy / Share bar directly above the selected text, and the first version
     * of this sat in exactly that spot — the two overlapped and the colour dots
     * were unreachable. Above is used only when there is no room below. */
    var below = rect.bottom + window.scrollY + 12;
    var above = rect.top + window.scrollY - bar.offsetHeight - 12;
    var viewportBottom = window.scrollY + window.innerHeight;
    var top = (below + bar.offsetHeight + 70 < viewportBottom) ? below : above;
    if (top < window.scrollY + 8) top = below;

    var left = rect.left + window.scrollX + (rect.width / 2) - (bar.offsetWidth / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - bar.offsetWidth - 8));
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
  }

  /* Attach highlighting to one rendered body. `host` is the element holding the
   * paragraph text; manual and num identify it for storage. */
  window.rmpEnableHighlighting = function (host, manual, num) {
    if (!host || host.dataset.hlReady === '1') return;
    host.dataset.hlReady = '1';
    host.classList.add('rmp-selectable');

    function onSelect() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideBar(); return; }
      var range = sel.getRangeAt(0);
      if (!host.contains(range.commonAncestorContainer)) { hideBar(); return; }
      var text = sel.toString();
      if (!text.trim()) { hideBar(); return; }

      var s = offsetOf(host, range.startContainer, range.startOffset);
      var e = offsetOf(host, range.endContainer, range.endOffset);
      if (e <= s) { hideBar(); return; }

      showBar(range.getBoundingClientRect(), function (colour) {
        var k = keyFor(manual, num);
        store[k] = store[k] || [];
        store[k].push({ s: s, e: e, c: colour, t: text.slice(0, 400), at: Date.now() });
        if (!writeJSON(HL_KEY, store)) {
          store[k].pop();
          alert('Could not save the highlight — this device is out of storage space.');
        }
        sel.removeAllRanges();
        hideBar();
        document.dispatchEvent(new CustomEvent('rmp:highlights-changed'));
        // Repaint from scratch so overlapping highlights merge cleanly.
        if (host.dataset.originalHtml) host.innerHTML = host.dataset.originalHtml;
        paint(host, store[k]);
      }, function () {
        try { navigator.clipboard.writeText(text); } catch (e) {}
        sel.removeAllRanges(); hideBar();
      });
    }

    /* Driven from selectionchange, not mouseup/touchend.
     *
     * On Android a long press selects a word and raises Chrome's own
     * Copy / Share / Select all bar, and no touchend lands on the paragraph —
     * so the highlight toolbar never appeared on a phone, which is where this
     * app is actually used. selectionchange fires in every case, on both touch
     * and mouse, and is debounced here because it fires continuously while the
     * selection handles are being dragged.
     *
     * The native bar still appears; ours sits below it. Both work. */
    var selTimer = null;
    function onSelectionChange() {
      clearTimeout(selTimer);
      selTimer = setTimeout(onSelect, 220);
    }
    document.addEventListener('selectionchange', onSelectionChange);
    host.addEventListener('mouseup', function () { setTimeout(onSelect, 0); });

    if (!host.dataset.originalHtml) host.dataset.originalHtml = host.innerHTML;
    paint(host, window.rmpHighlights.for(manual, num));
  };

  document.addEventListener('mousedown', function (e) {
    if (bar && !bar.contains(e.target)) hideBar();
  });
  document.addEventListener('scroll', hideBar, { passive: true });

  /* Tapping an existing highlight offers to remove it. */
  document.addEventListener('click', function (e) {
    var mark = e.target.closest && e.target.closest('.rmp-hl');
    if (!mark) return;
    var card = mark.closest('[data-id]');
    if (!card) return;
    var parts = String(card.getAttribute('data-id')).split('-');
    var manual = parts.shift();
    var num = parts.join('-');
    if (confirm('Remove this highlight?')) {
      window.rmpHighlights.remove(manual, num, Number(mark.dataset.at));
      var host = mark.closest('.rmp-selectable');
      if (host && host.dataset.originalHtml) {
        host.innerHTML = host.dataset.originalHtml;
        paint(host, window.rmpHighlights.for(manual, num));
      }
    }
  });

  /* Cards are built by several different renderers and expanded by an inline
   * toggle, so rather than patch each one, highlighting is attached the first
   * time a card is opened. The listener runs after the inline handler, so the
   * expanded class is already set. */
  /* Bubble phase, deliberately. The card is opened by an inline
   * onclick="this.parentElement.classList.toggle('expanded')" on the header.
   * A capture-phase listener runs before that handler, sees a card that is
   * still collapsed, and returns — which is exactly what went wrong: nothing
   * was ever made selectable. Bubbling runs after the toggle. */
  document.addEventListener('click', function (e) {
    var header = e.target.closest && e.target.closest('.rule-header');
    if (!header) return;
    var card = header.parentElement;
    if (!card || !card.classList.contains('expanded')) return;
    var id = card.getAttribute('data-id');
    if (!id) return;
    var parts = String(id).split('-');
    var manual = parts.shift();
    var num = parts.join('-');
    var body = card.querySelector('.rule-text-content');
    if (!body) return;
    window.rmpEnableHighlighting(body, manual, num);
    mountAa();
  });

  /* ── reading preferences ───────────────────────────────────────────── */

  function applyPrefs() {
    var r = document.documentElement;
    r.style.setProperty('--read-size', prefs.size + 'px');
    r.style.setProperty('--read-leading', String(prefs.leading));
    r.setAttribute('data-read-theme', prefs.theme);
    r.setAttribute('data-read-serif', prefs.serif ? '1' : '0');
    r.setAttribute('data-read-width', prefs.width);
    writeJSON(PREF_KEY, prefs);
    // The book has to re-paginate when the type changes: at a larger size the
    // same chapter is more pages, and the reader must not lose their place.
    document.dispatchEvent(new CustomEvent('rmp:reader-prefs'));
  }

  window.rmpReaderPrefs = {
    get: function () { return prefs; },
    set: function (patch) { Object.assign(prefs, patch); applyPrefs(); }
  };

  /* ── reading position ──────────────────────────────────────────────── */

  window.rmpRememberPosition = function (route, label) {
    writeJSON(POS_KEY, { route: route, label: label, at: Date.now() });
  };
  window.rmpLastPosition = function () { return readJSON(POS_KEY, null); };

  /* ── controls panel ────────────────────────────────────────────────── */

  function row(label, inner) {
    var d = document.createElement('div');
    d.className = 'rmp-rc-row';
    d.innerHTML = '<span class="rmp-rc-label">' + label + '</span>';
    d.appendChild(inner);
    return d;
  }

  function segmented(options, current, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'rmp-rc-seg';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.className = (o.value === current) ? 'is-on' : '';
      b.onclick = function () {
        wrap.querySelectorAll('button').forEach(function (x) { x.className = ''; });
        b.className = 'is-on';
        onPick(o.value);
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  window.rmpOpenReaderControls = function () {
    var old = document.querySelector('.rmp-rc');
    if (old) { old.remove(); return; }

    var panel = document.createElement('div');
    panel.className = 'rmp-rc';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Reading settings');

    var head = document.createElement('div');
    head.className = 'rmp-rc-head';
    head.innerHTML = '<strong>Reading</strong>';
    var close = document.createElement('button');
    close.className = 'rmp-rc-close'; close.textContent = '✕';
    close.setAttribute('aria-label', 'Close reading settings');
    close.onclick = function () { panel.remove(); };
    head.appendChild(close);
    panel.appendChild(head);

    var size = document.createElement('input');
    size.type = 'range'; size.min = '13'; size.max = '22'; size.step = '1';
    size.value = String(prefs.size);
    size.oninput = function () { window.rmpReaderPrefs.set({ size: Number(size.value) }); };
    panel.appendChild(row('Text size', size));

    var lead = document.createElement('input');
    lead.type = 'range'; lead.min = '1.4'; lead.max = '2.2'; lead.step = '0.05';
    lead.value = String(prefs.leading);
    lead.oninput = function () { window.rmpReaderPrefs.set({ leading: Number(lead.value) }); };
    panel.appendChild(row('Line spacing', lead));

    panel.appendChild(row('Theme', segmented([
      { label: 'Light', value: 'light' },
      { label: 'Sepia', value: 'sepia' },
      { label: 'Night', value: 'night' }
    ], prefs.theme, function (v) { window.rmpReaderPrefs.set({ theme: v }); })));

    panel.appendChild(row('Typeface', segmented([
      { label: 'Sans', value: false },
      { label: 'Serif', value: true }
    ], prefs.serif, function (v) { window.rmpReaderPrefs.set({ serif: v }); })));

    panel.appendChild(row('Line width', segmented([
      { label: 'Narrow', value: 'narrow' },
      { label: 'Normal', value: 'normal' },
      { label: 'Full',   value: 'wide' }
    ], prefs.width, function (v) { window.rmpReaderPrefs.set({ width: v }); })));

    /* Hindi lives here rather than in its own control because it is a reading
     * preference like the others, and because it is the panel a reader already
     * opens to make the text comfortable. */
    if (window.rmpHindiMode) {
      panel.appendChild(row('भाषा · Language', segmented([
        { label: 'English', value: false },
        { label: 'हिंदी', value: true }
      ], window.rmpHindiMode.isOn(), function (v) { window.rmpHindiMode.set(v); })));

      var note = document.createElement('div');
      note.className = 'rmp-rc-note';
      var n = window.rmpHindiMode.cachedCount();
      note.textContent = window.rmpHindiMode.isOn()
        ? 'Rules translate as you open them. ' + n + ' already saved for offline use.'
        : 'Automatic translation. The English text remains the official version.';
      panel.appendChild(note);
    }

    document.body.appendChild(panel);
  };

  /* The "Aa" button. Shown only where there is prose to read — on the home,
   * quiz or search screens the type controls would have nothing to act on. */
  function mountAa() {
    var btn = document.getElementById('rmp-aa');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'rmp-aa';
      btn.className = 'rmp-aa';
      btn.type = 'button';
      btn.textContent = 'Aa';
      btn.setAttribute('aria-label', 'Reading settings');
      btn.onclick = window.rmpOpenReaderControls;
      document.body.appendChild(btn);
    }
    var reading = !!document.querySelector('.rule-card, .rmp-selectable');
    btn.classList.toggle('is-on', reading);
    if (reading) showHint();
  }

  /* Highlighting is invisible until someone happens to select text, so say so
   * once. Shown the first time a card is opened, dismissed on tap or after the
   * first highlight is made, and never shown again. */
  function showHint() {
    if (readJSON(HL_KEY, null) || localStorage.getItem('rmp.hintSeen') === '1') return;
    if (document.getElementById('rmp-hint')) return;
    var el = document.createElement('div');
    el.id = 'rmp-hint';
    el.className = 'rmp-hint';
    el.innerHTML = '<span>Select any text to highlight it. Tap <b>Aa</b> for text size and night mode.</span>' +
                   '<button type="button" aria-label="Dismiss">✕</button>';
    el.querySelector('button').onclick = dismissHint;
    document.body.appendChild(el);
  }

  function dismissHint() {
    var el = document.getElementById('rmp-hint');
    if (el) el.remove();
    try { localStorage.setItem('rmp.hintSeen', '1'); } catch (e) {}
  }

  document.addEventListener('rmp:highlights-changed', dismissHint);

  document.addEventListener('DOMContentLoaded', function () {
    mountAa();
    // Cards arrive asynchronously as chapters render, so re-check on change.
    // Guarded: if anything here throws it takes the whole listener with it, and
    // this listener is also what mounts the button in the first place.
    try {
      if (typeof MutationObserver === 'function') {
        new MutationObserver(function () { mountAa(); })
          .observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) { console.warn('[reader]', e); }
    window.addEventListener('hashchange', function () { setTimeout(mountAa, 60); });
  });

  applyPrefs();
})();

/* Rule Master Pro — library home
 *
 * Replaces the hand-written manual tiles, whose counts were typed in and had
 * drifted from the data (the Accident Manual tile claimed 186 paragraphs; there
 * are 208), with cards built from the data itself. Every number here is counted
 * at load, so it cannot go stale again.
 *
 * Styles are scoped under .rmp-lib and set inline or in one block below. The
 * app's existing CSS is 331 KB across 44 <style> blocks with 124 selectors
 * declared four or more times; adding to that cascade is how the counts drifted
 * in the first place. Nothing here depends on it.
 */
(function () {
  'use strict';

  var MANUALS = [
    { id: 'gsr',   route: '#manual/gsr',   name: 'General & Subsidiary Rules',
      sub: 'Reprinted Edition 2025',      accent: '#1D4ED8', data: 'RULES_DATA', unit: 'rules' },
    { id: 'om',    route: '#manual/om',    name: 'Operating Manual',
      sub: 'Northern Railway · 2016',     accent: '#16A34A', data: 'OM_DATA',    unit: 'paras' },
    { id: 'bwm',   route: '#manual/bwm',   name: 'Block Working Manual',
      sub: 'Northern Railway',            accent: '#2563EB', data: 'BWM_DATA',   unit: 'paras' },
    { id: 'acc',   route: '#manual/acc',   name: 'Accident Manual',
      sub: 'Northern Railway · 2008',     accent: '#DC2626', data: 'ACC_DATA',   unit: 'paras' },
    { id: 'irpwm', route: '#manual/irpwm', name: 'IRPWM',
      sub: 'Permanent Way · 2024',        accent: '#EA580C', data: 'IRPWM_DATA', unit: 'paras' },
    { id: 'irsem', route: '#manual/irsem', name: 'IRSEM',
      sub: 'Signal Engineering · v3',     accent: '#0891B2', data: 'IRSEM_DATA', unit: 'paras' },
    { id: 'ira',   route: '#manual/ira',   name: 'Railways Act 1989',
      sub: 'Legal sections',              accent: '#7C3AED', data: 'IRA_DATA',   unit: 'sections' }
  ];

  function countItems(m) {
    var D = window[m.data];
    if (!D) return { items: 0, chapters: 0, words: 0 };
    var items = 0, chapters = 0, words = 0;
    Object.keys(D).forEach(function (k) {
      var ch = D[k];
      if (!ch || typeof ch !== 'object') return;
      var list = (ch.paras || []).concat(ch.rules || []);
      if (!list.length) return;
      chapters++;
      items += list.length;
      list.forEach(function (p) {
        var t = String(p.body || '').replace(/<[^>]+>/g, ' ');
        words += (t.match(/\S+/g) || []).length;
      });
    });
    return { items: items, chapters: chapters, words: words };
  }

  function countFigures(id) {
    var F = window['FIGURES_' + id.toUpperCase()];
    return (F && F.figures) ? F.figures.length : 0;
  }

  function countTables(id) {
    var T = window['TABLES_' + id.toUpperCase()];
    if (!T || !T.tables) return 0;
    var n = 0;
    Object.keys(T.tables).forEach(function (k) { n += T.tables[k].length; });
    return n;
  }

  function fmt(n) { return n.toLocaleString('en-IN'); }

  function build() {
    if (document.querySelector('#home .rmp-lib')) return;   // already built
    // The old tiles are the anchor while they are still present; once they have
    // been removed the section heading is. Either way this is safe to call twice.
    var grid = document.querySelector('#home .manuals-grid');
    var anchor = grid || document.querySelector('#home .browse-label');
    if (!anchor) return;

    var wrap = document.createElement('div');
    wrap.className = 'rmp-lib';
    wrap.dataset.rmpLib = '1';

    // Continue reading — only when there is somewhere to continue to.
    var last = (typeof window.rmpLastPosition === 'function') ? window.rmpLastPosition() : null;
    if (last && last.route) {
      var cont = document.createElement('a');
      cont.className = 'rmp-lib-cont';
      cont.href = last.route;
      cont.innerHTML =
        '<span class="rmp-lib-cont-tag">Continue reading</span>' +
        '<span class="rmp-lib-cont-title">' + escapeHtml(last.label || 'Where you left off') + '</span>';
      wrap.appendChild(cont);
    }

    var cards = document.createElement('div');
    cards.className = 'rmp-lib-grid';

    MANUALS.forEach(function (m) {
      var c = countItems(m);
      var card = document.createElement('a');
      card.className = 'rmp-lib-card';
      card.href = m.route;
      card.style.setProperty('--accent', m.accent);

      // One line of substance, not a specification sheet. Diagram and table
      // counts were on here and read as boasting; they belong inside the
      // manual, on the paragraph that actually carries them.
      var meta = c.chapters + ' chapters · ' + fmt(c.items) + ' ' + m.unit;

      card.innerHTML =
        '<span class="rmp-lib-rule"></span>' +
        '<span class="rmp-lib-name">' + escapeHtml(m.name) + '</span>' +
        '<span class="rmp-lib-sub">' + escapeHtml(m.sub) + '</span>' +
        '<span class="rmp-lib-meta">' + escapeHtml(meta) + '</span>';
      cards.appendChild(card);
    });

    wrap.appendChild(cards);
    if (grid) {
      grid.parentNode.insertBefore(wrap, grid);
      // Remove the old tiles rather than hiding them. An inline display:none
      // loses to "#home .manuals-grid { display:grid !important }", which is
      // why both sets of tiles were showing at once.
      grid.parentNode.removeChild(grid);
    } else {
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.rmpBuildLibraryHome = build;

  /* Record where the reader is, so the home screen can offer to resume.
   * Driven off the hash rather than patched into each renderer: every screen
   * change goes through the hash, and the chapter heading is on the page by the
   * time this runs. Only reading routes are remembered — returning someone to
   * the quiz or the search box is not "continue reading". */
  function remember() {
    if (typeof window.rmpRememberPosition !== 'function') return;
    var h = location.hash || '';
    if (!/^#(chapter|om-ch|acc-ch|bwm-ch|irpwm-ch|irsem-ch|ira-ch|appendix)\//.test(h)) return;
    var el = document.getElementById('content-chapter-title');
    var label = el && el.textContent.trim();
    if (!label) return;
    window.rmpRememberPosition(h, label);
  }

  window.addEventListener('hashchange', function () { setTimeout(remember, 120); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

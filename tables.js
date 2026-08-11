/* Rule Master Pro — tables
 *
 * The manuals' tables were flattened into running prose when the text was first
 * extracted: a three-column inspection schedule ends up as one paragraph reading
 * "Sl. Type of Inspection Schedule of Inspection No. 1 Foot Inspection…".
 *
 * tools/build.py rebuilds them from the PDFs — reading the printed ruling lines
 * and text alignment to recover column and row boundaries — and ships the result
 * as data. Clean tables therefore need no PDF at read time and work offline.
 *
 * Merged-cell forms (acknowledgement registers, statistical returns) have no
 * honest HTML equivalent: a header spanning four columns cannot be represented
 * without inventing structure. Those ship as a page region and are rendered from
 * the PDF exactly as printed — not selectable, but true to the book.
 *
 * Requires: data/tables-gsr.js, data/tables-om.js. pdf.js only for the image kind.
 */
(function () {
  'use strict';

  var PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var docs = {}, pdfjsReady = null;
  var queue = Promise.resolve();          // one rasterise at a time
  function enqueue(fn) {
    var run = queue.then(fn, fn);
    queue = run.catch(function () {});
    return run;
  }

  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_SRC;
      s.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { reject(new Error('PDF renderer unavailable')); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  function getDoc(file) {
    if (!docs[file]) {
      docs[file] = ensurePdfJs().then(function (lib) {
        return lib.getDocument({ url: './' + file.split('/').map(encodeURIComponent).join('/') }).promise;
      });
    }
    return docs[file];
  }

  /* ── index ─────────────────────────────────────────────────────────── */
  /* Keyed "manual|target" with a bare "target" fallback — para numbers repeat
   * across manuals, so an unscoped lookup can attach one book's tables to
   * another book's paragraph. See the same note in figures.js. */
  var index = null;
  function buildIndex() {
    if (index) return index;
    index = {};
    [['gsr',   window.TABLES_GSR],
     ['om',    window.TABLES_OM],
     ['acc',   window.TABLES_ACC],
     ['irsem', window.TABLES_IRSEM],
     ['irpwm', window.TABLES_IRPWM]].forEach(function (pair) {
      var manual = pair[0], set = pair[1];
      if (!set) return;
      Object.keys(set.tables).forEach(function (target) {
        set.tables[target].forEach(function (t) {
          var entry = {
            file: set.file, page: t.p, cols: t.c, rows: t.r, img: t.img,
            why: t.why, manual: manual
          };
          (index[manual + '|' + target] = index[manual + '|' + target] || []).push(entry);
          (index[target] = index[target] || []).push(entry);
        });
      });
    });
    return index;
  }

  window.rmpTablesForTarget = function (target, manual) {
    var ix = buildIndex();
    if (manual) return ix[manual + '|' + String(target)] || [];
    return ix[String(target)] || [];
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* A cell is a string, or {t,cs,rs} when it spans, or null when an earlier
   * cell's span covers it. Nulls emit no element at all — the span fills them. */
  function cellText(v) { return (v && v.t !== undefined) ? v.t : (v == null ? '' : v); }

  function cellHtml(tag, v) {
    if (v === null) return '';
    var span = '';
    if (v && v.cs > 1) span += ' colspan="' + v.cs + '"';
    if (v && v.rs > 1) span += ' rowspan="' + v.rs + '"';
    return '<' + tag + span + '>' + esc(cellText(v)) + '</' + tag + '>';
  }

  function toHtml(entry) {
    var rows = entry.rows, cols = entry.cols;
    var head = rows[0] || [];
    var headCells = head.filter(function (c) { return c !== null; });
    // Treat row 0 as a header only if it is mostly filled and made of short labels.
    var isHeader = headCells.filter(function (c) { return cellText(c).trim(); }).length >=
                     Math.max(2, Math.floor(cols * 0.5)) &&
                   headCells.every(function (c) { return cellText(c).length < 60; });
    var html = '<table class="rmp-table">';
    if (isHeader) {
      html += '<thead><tr>' + head.map(function (c) { return cellHtml('th', c); }).join('') + '</tr></thead>';
    }
    html += '<tbody>';
    for (var r = isHeader ? 1 : 0; r < rows.length; r++) {
      html += '<tr>' + rows[r].map(function (c) { return cellHtml('td', c); }).join('') + '</tr>';
    }
    return html + '</tbody></table>';
  }

  /* Render a page region — used for the merged-cell forms. Boxes are stored
   * top-left origin, matching the orientation pdf.js viewports render in. */
  function renderRegion(entry, canvas, cssWidth) {
    return enqueue(function () {
      return getDoc(entry.file).then(function (doc) { return doc.getPage(entry.page); })
        .then(function (page) {
          var box = entry.img;
          var dpr = Math.min(window.devicePixelRatio || 1, 3);
          var scale = (cssWidth / box[2]) * dpr;
          var vp = page.getViewport({ scale: scale });
          canvas.width  = Math.round(box[2] * scale);
          canvas.height = Math.round(box[3] * scale);
          canvas.style.width  = cssWidth + 'px';
          canvas.style.height = Math.round(box[3] * (cssWidth / box[2])) + 'px';
          var ctx = canvas.getContext('2d', { alpha: false });
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.translate(-box[0] * scale, -box[1] * scale);
          return page.render({ canvasContext: ctx, viewport: vp }).promise;
        });
    });
  }

  /* ── public ────────────────────────────────────────────────────────── */
  window.rmpRenderTables = function (target, container, opts) {
    opts = opts || {};
    var entries = window.rmpTablesForTarget(target, opts.manual);
    if (!entries.length) return Promise.resolve(0);

    var width = opts.width || Math.min(container.clientWidth || 320, 560);

    var block = document.createElement('div');
    block.className = 'rmp-tables';
    block.innerHTML = '<div class="rmp-tbl-head">' +
      (entries.length === 1 ? 'Table from the manual' : entries.length + ' tables from the manual') +
      '</div>';
    container.appendChild(block);

    entries.forEach(function (entry) {
      var wrap = document.createElement('div');
      wrap.className = 'rmp-tbl';
      block.appendChild(wrap);

      if (entry.rows) {
        // Shipped as data — no PDF needed, so it renders immediately and offline.
        wrap.innerHTML = '<div class="rmp-tbl-scroll">' + toHtml(entry) + '</div>' +
          '<div class="rmp-tbl-cap">Page ' + entry.page + ' · ' +
          entry.rows.length + ' rows × ' + entry.cols + ' columns</div>';
        return;
      }

      // Merged-cell form: render the printed region, but only once it is near view.
      wrap.innerHTML = '<div class="rmp-tbl-loading">Loading form from page ' + entry.page + '…</div>';
      function draw() {
        var canvas = document.createElement('canvas');
        canvas.className = 'rmp-tbl-img';
        wrap.innerHTML = '';
        wrap.appendChild(canvas);
        var cap = document.createElement('div');
        cap.className = 'rmp-tbl-cap';
        cap.textContent = 'Form as printed — page ' + entry.page;
        wrap.appendChild(cap);
        renderRegion(entry, canvas, width).catch(function () {
          wrap.innerHTML = '<div class="rmp-tbl-error">Could not load the form on page ' +
            entry.page + '. Use “View original page”.</div>';
        });
      }
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (e) {
          if (!e[0].isIntersecting) return;
          io.disconnect();
          draw();
        }, { rootMargin: '600px 0px' });
        io.observe(wrap);
      } else draw();
    });

    return Promise.resolve(entries.length);
  };
})();

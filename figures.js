/* Rule Master Pro — figure renderer
 *
 * Draws the printed artwork from the manual PDFs directly into the reader.
 * Nothing is pre-extracted as an image file: the figures are vector line drawings,
 * so they are rendered from the PDF at the resolution the screen actually needs
 * and stay sharp at any zoom.
 *
 * Requires: pdf.js (loaded on demand), data/figures-gsr.js, data/figures-om.js
 */
(function () {
  'use strict';

  var PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var docCache = {};   // file -> Promise<PDFDocumentProxy>
  var pdfjsReady = null;
  var bitmapCache = {};  // "file|page|box|width" -> dataURL

  /* Renders are serialised. Firing several at once saturates the pdf.js worker —
   * during development four concurrent renders locked the tab hard enough that it
   * stopped responding. Everything below queues through this one chain. */
  var renderQueue = Promise.resolve();
  function enqueue(fn) {
    var run = renderQueue.then(fn, fn);
    renderQueue = run.catch(function () {});
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
      s.onerror = function () { reject(new Error('Could not load the PDF renderer')); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  function getDoc(file) {
    if (!docCache[file]) {
      docCache[file] = ensurePdfJs().then(function (lib) {
        var path = file.split('/').map(encodeURIComponent).join('/');
        return lib.getDocument({ url: './' + path }).promise;
      });
    }
    return docCache[file];
  }

  /* Index: "manual|rule" -> [figure, ...], plus a bare "rule" fallback.
   *
   * Keying on the rule number alone is not safe. Para numbers repeat across
   * manuals — the Block Working Manual's 2002, 2020, 3002 and 11008 are all
   * live paragraph numbers in the Operating Manual too — so an unscoped lookup
   * renders one book's diagrams on another book's page. Callers that know their
   * manual pass it; the bare key stays for anything that does not. */
  var index = null;
  function buildIndex() {
    if (index) return index;
    index = {};
    var sets = [['gsr',   window.FIGURES_GSR],
                ['om',    window.FIGURES_OM],
                ['acc',   window.FIGURES_ACC],
                ['irsem', window.FIGURES_IRSEM],
                ['irpwm', window.FIGURES_IRPWM],
                ['bwm',   window.FIGURES_BWM]];
    sets.forEach(function (pair) {
      var manual = pair[0], set = pair[1];
      if (!set) return;
      set.figures.forEach(function (f) {
        var entry = {
          file: set.file, page: f[0], x: f[1], y: f[2], w: f[3], h: f[4], manual: manual
        };
        var rule = String(f[5]);
        (index[manual + '|' + rule] = index[manual + '|' + rule] || []).push(entry);
        (index[rule] = index[rule] || []).push(entry);
      });
    });
    return index;
  }

  window.rmpFiguresForRule = function (ruleNum, manual) {
    var ix = buildIndex();
    if (manual) return ix[manual + '|' + String(ruleNum)] || [];
    return ix[String(ruleNum)] || [];
  };

  /* Render one figure into a canvas, clipped to its bounding box.
   * Serialised via enqueue(), and the result is cached so scrolling back to a
   * figure does not re-rasterise the page. */
  function renderFigure(fig, canvas, cssWidth) {
    var key = fig.file + '|' + fig.page + '|' + fig.x + ',' + fig.y + ',' + fig.w + ',' + fig.h + '|' + cssWidth;
    if (bitmapCache[key]) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          canvas.width = img.width; canvas.height = img.height;
          canvas.style.width = cssWidth + 'px';
          canvas.style.height = Math.round(fig.h * (cssWidth / fig.w)) + 'px';
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve();
        };
        img.src = bitmapCache[key];
      });
    }
    return enqueue(function () { return rasterise(fig, canvas, cssWidth, key); });
  }

  function rasterise(fig, canvas, cssWidth, key) {
    return getDoc(fig.file).then(function (doc) {
      return doc.getPage(fig.page);
    }).then(function (page) {
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      // Scale so the figure's own width fills the space available to it.
      var scale = (cssWidth / fig.w) * dpr;
      var vp = page.getViewport({ scale: scale });

      canvas.width  = Math.round(fig.w * scale);
      canvas.height = Math.round(fig.h * scale);
      canvas.style.width  = cssWidth + 'px';
      canvas.style.height = Math.round(fig.h * (cssWidth / fig.w)) + 'px';

      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Boxes are stored top-left origin (PyMuPDF convention), which is the same
      // orientation pdf.js viewports render in — so this is a straight translate.
      ctx.translate(-fig.x * scale, -fig.y * scale);

      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        try { bitmapCache[key] = canvas.toDataURL('image/png'); } catch (e) {}
      });
    });
  }

  /* Rotation is applied with a CSS transform rather than by re-rasterising, so
   * turning a plate is instant and costs no extra PDF work. At 90° and 270° the
   * wrapper has to swap its reserved width and height or the neighbouring text
   * reflows around the wrong box. */
  function rotKey(fig) {
    return 'rmp.figrot.' + fig.file + '|' + fig.page + '|' + fig.x + ',' + fig.y;
  }

  function applyRotation(wrap, canvas, fig, width, deg) {
    var drawnH = Math.round(fig.h * (width / fig.w));
    canvas.style.transformOrigin = 'center center';
    canvas.style.transform = deg ? 'rotate(' + deg + 'deg)' : '';
    if (deg === 90 || deg === 270) {
      // Fit the long edge into the column, then reserve the transposed box.
      var s = width / drawnH;
      canvas.style.transform = 'rotate(' + deg + 'deg) scale(' + s + ')';
      wrap.style.setProperty('--fig-h', Math.round(fig.w * (width / fig.h)) + 'px');
    } else {
      wrap.style.setProperty('--fig-h', drawnH + 'px');
    }
  }

  /* Public: build the figure block for a rule and append it to `container`. */
  window.rmpRenderFigures = function (ruleNum, container, opts) {
    opts = opts || {};
    var figs = window.rmpFiguresForRule(ruleNum, opts.manual);
    if (!figs.length) return Promise.resolve(0);

    var width = opts.width || Math.min(container.clientWidth || 340, 520);

    var block = document.createElement('div');
    block.className = 'rmp-figures';
    block.innerHTML = '<div class="rmp-fig-head">' +
      // "From the printed manual" rather than "Figures": in IRSEM the certificates
      // and requisition forms are raster images, structurally indistinguishable
      // from a photograph, so this block legitimately contains both.
      (figs.length === 1 ? 'From the printed manual' : figs.length + ' items from the printed manual') +
      '</div>';
    container.appendChild(block);

    // Build every placeholder immediately so the page does not reflow later,
    // then rasterise each one only when it comes near the viewport.
    figs.forEach(function (fig) {
      var wrap = document.createElement('figure');
      wrap.className = 'rmp-fig';
      // Reserve the right height up front — prevents the text jumping as figures land.
      wrap.style.setProperty('--fig-h', Math.round(fig.h * (width / fig.w)) + 'px');

      var canvas = document.createElement('canvas');
      canvas.className = 'rmp-fig-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Figure from page ' + fig.page + ' of the printed manual');

      var cap = document.createElement('figcaption');
      cap.className = 'rmp-fig-cap';
      cap.textContent = 'Page ' + fig.page + ' of the printed manual';

      var zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.className = 'rmp-fig-zoom';
      zoom.textContent = 'Full screen';
      zoom.onclick = function () { openLightbox(fig); };

      /* Some plates are printed sideways — the rule 8.16 signalling layouts and
       * several IRPWM proformas are landscape drawings turned 90° to fit a
       * portrait page. With a paper manual you turn the book.
       *
       * I tried to detect these and rotate them automatically. Neither test
       * worked: the sideways text lives inside a raster image so PyMuPDF's
       * writing direction never sees it, and a projection profile misreads line
       * drawings — it called the upright semaphore on page 40 sideways and the
       * genuinely sideways layout on page 199 upright. A wrong auto-rotation is
       * worse than none, so the reader turns it, and the choice sticks. */
      var turn = document.createElement('button');
      turn.type = 'button';
      turn.className = 'rmp-fig-rotate';
      turn.setAttribute('aria-label', 'Rotate this figure');
      turn.textContent = '⟳';
      turn.onclick = function () {
        var next = ((parseInt(wrap.dataset.rot || '0', 10) + 90) % 360);
        wrap.dataset.rot = String(next);
        applyRotation(wrap, canvas, fig, width, next);
        try { localStorage.setItem(rotKey(fig), String(next)); } catch (e) {}
      };

      wrap.appendChild(canvas);
      wrap.appendChild(zoom);
      wrap.appendChild(turn);
      wrap.appendChild(cap);
      block.appendChild(wrap);

      var saved = 0;
      try { saved = parseInt(localStorage.getItem(rotKey(fig)) || '0', 10) || 0; } catch (e) {}
      if (saved) { wrap.dataset.rot = String(saved); }

      function onError(err) {
        wrap.innerHTML = '<div class="rmp-fig-error">Could not load this figure. ' +
          'Tap "View original page" to open page ' + fig.page + '.</div>';
        console.warn('[figures]', err);
      }

      function draw() {
        wrap.classList.add('is-loading');
        renderFigure(fig, canvas, width)
          .then(function () {
            wrap.classList.remove('is-loading');
            var r = parseInt(wrap.dataset.rot || '0', 10);
            if (r) applyRotation(wrap, canvas, fig, width, r);
          })
          .catch(function (e) { wrap.classList.remove('is-loading'); onError(e); });
      }

      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          io.disconnect();
          draw();
        }, { rootMargin: '600px 0px' });
        io.observe(wrap);
      } else {
        draw();
      }
    });

    return Promise.resolve(figs.length);
  };

  /* Full-screen view, rendered larger so the drawing stays crisp. */
  function openLightbox(fig) {
    var box = document.createElement('div');
    box.className = 'rmp-fig-lightbox';
    box.innerHTML = '<button class="rmp-fig-close" aria-label="Close">✕</button>';
    var canvas = document.createElement('canvas');
    canvas.className = 'rmp-fig-full';
    box.appendChild(canvas);
    document.body.appendChild(box);

    function close() { box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.querySelector('.rmp-fig-close').onclick = close;
    box.onclick = function (e) { if (e.target === box) close(); };
    document.addEventListener('keydown', onKey);

    var w = Math.min(window.innerWidth - 24, 900);
    renderFigure(fig, canvas, w).catch(function () {
      box.innerHTML = '<div class="rmp-fig-error">Could not render this figure.</div>';
    });
  }
})();

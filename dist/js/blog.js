// public/js/blog.js — shared script for blog.html + blog/*.html (standalone pages)
//
// Features:
//   - Reading progress bar (top-fixed, width = scroll %)
//   - Footer year auto-update
//   - Prism syntax highlighting init (waits for all prism component scripts via defer)
//
// Loaded via <script defer> after prism component scripts. No dependencies
// beyond Prism (optional — degrades gracefully if Prism is absent).

(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    // ── Footer year ──
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // ── Reading progress bar ──
    var bar = document.querySelector('.jlz-reading-progress__bar');
    if (bar) {
      var ticking = false;
      var update = function () {
        var h = document.documentElement;
        var scroll = h.scrollTop || document.body.scrollTop;
        var height = h.scrollHeight - h.clientHeight;
        var pct = height > 0 ? (scroll / height) * 100 : 0;
        bar.style.transform = 'scaleX(' + (pct / 100) + ')';
        ticking = false;
      };
      var onScroll = function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      };
      update();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
    }

    // ── Prism syntax highlighting ──
    // All prism-*.js scripts load via <script defer> before this file, so
    // window.Prism is available. highlightAll() is idempotent.
    if (window.Prism && typeof window.Prism.highlightAll === 'function') {
      window.Prism.highlightAll();
    }
  });
})();

/* 東雲的秘密基地 — 站点脚本
 * 主题切换（跟随 next-themes 行为：localStorage 优先，其次系统偏好）
 * 移动端菜单、代码复制、年份
 * 与 css/webf-ui.css 配套使用，可被任意子页面引入。
 */
(function () {
  'use strict';

  var STORE_KEY = 'nd-theme';
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function systemPref() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff');
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      btns[i].setAttribute('title', theme === 'dark' ? '浅色主题' : '深色主题');
    }
  }

  apply(stored() || systemPref());

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacy(text, done); });
    } else {
      legacy(text, done);
    }
  }
  function legacy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  document.addEventListener('click', function (e) {
    var el = e.target;

    var themeBtn = el.closest && el.closest('[data-theme-toggle]');
    if (themeBtn) {
      e.preventDefault();
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORE_KEY, next); } catch (err) {}
      apply(next);
      return;
    }

    var drawerBtn = el.closest && el.closest('[data-drawer-toggle]');
    if (drawerBtn) {
      e.preventDefault();
      var menu = document.querySelector('.nb-mobile-menu');
      if (!menu) return;
      var open = menu.getAttribute('data-open') === 'true';
      menu.setAttribute('data-open', open ? 'false' : 'true');
      drawerBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      return;
    }

    var copyBtn = el.closest && el.closest('[data-copy]');
    if (copyBtn) {
      e.preventDefault();
      var target = document.querySelector(copyBtn.getAttribute('data-copy'));
      if (!target) return;
      copyText(target.textContent, function () {
        var old = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        setTimeout(function () { copyBtn.textContent = old; }, 1400);
      });
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var y = String(new Date().getFullYear());
    var nodes = document.querySelectorAll('[data-year]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = y;
  });
})();

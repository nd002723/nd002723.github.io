/* 站点内轻量 SPA 路由
 * - 拦截同源内部链接：fetch 目标 HTML，只替换 <main> 与页脚，保留导航栏（因此 BGM 播放器不断）
 * - 按目标页顺序重新执行页面脚本与样式（webf-ui.css / site.css / site.js / bgm.js / router.js 常驻）
 * - 支持浏览器前进后退、锚点、滚动位置与加载进度条；失败时自动退化为整页跳转
 */
(function () {
  'use strict';
  if (!window.fetch || !window.history || !window.history.pushState || !window.DOMParser) return;

  var KEEP_CSS = ['/css/webf-ui.css', '/css/site.css'];
  var KEEP_SCRIPTS = ['/js/site.js', '/js/bgm.js', '/js/router.js'];
  var PERSIST_SELECTOR = ['header.nb-navbar', '.nb-mobile-menu', 'script'].join(',');
  var loadToken = 0;

  /* ---------- 进度条 ---------- */
  var style = document.createElement('style');
  style.id = 'router-style';
  style.textContent =
    '#nb-route-progress{position:fixed;top:0;left:0;z-index:9999;height:2px;width:0;' +
    'background:linear-gradient(90deg,#2563EB,#1D4ED8);opacity:0;' +
    'transition:width .25s ease,opacity .3s ease;pointer-events:none}' +
    '#nb-route-progress.is-loading{opacity:1}';
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.id = 'nb-route-progress';
  document.body.appendChild(bar);

  function startProgress() {
    bar.classList.add('is-loading');
    bar.style.width = '0%';
    requestAnimationFrame(function () { bar.style.width = '65%'; });
  }
  function finishProgress() {
    bar.style.width = '100%';
    setTimeout(function () {
      bar.classList.remove('is-loading');
      setTimeout(function () { bar.style.width = '0%'; }, 260);
    }, 120);
  }

  /* ---------- 链接判定 ---------- */
  function isHtmlPath(path) {
    if (path === '' || path === '/' || /\/$/.test(path)) return true;
    if (/\.html?$/i.test(path)) return true;
    return !/\.[a-z0-9]{1,8}$/i.test(path);  /* 无扩展名的页面路径；静态资源交给浏览器 */
  }

  function interceptable(a) {
    if (!a || !a.getAttribute) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return false;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return false; }
    if (url.origin !== location.origin) return false;
    if (!isHtmlPath(url.pathname)) return false;
    return true;
  }

  /* ---------- 头部样式同步 ---------- */
  function isKeepCss(href) {
    try { return KEEP_CSS.indexOf(new URL(href, location.href).pathname) >= 0; } catch (e) { return false; }
  }

  function syncHead(parsed, baseUrl) {
    var head = document.head;
    Array.prototype.slice.call(head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(function (el) {
      if (el.id === 'router-style') return;
      if (el.tagName === 'STYLE') { el.remove(); return; }
      if (isKeepCss(el.getAttribute('href'))) return;
      el.remove();
    });
    Array.prototype.slice.call(parsed.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(function (el) {
      if (el.tagName === 'STYLE') {
        head.appendChild(document.importNode(el, true));
        return;
      }
      var href = el.getAttribute('href');
      if (isKeepCss(href)) return;
      var abs;
      try { abs = new URL(href, baseUrl).href; } catch (e) { return; }
      var link = el.cloneNode(true);
      link.setAttribute('href', abs);
      head.appendChild(link);
    });

    var desc = parsed.querySelector('meta[name="description"]');
    var myDesc = document.querySelector('meta[name="description"]');
    if (desc && myDesc) myDesc.setAttribute('content', desc.getAttribute('content') || '');
    if (parsed.title) document.title = parsed.title;
  }

  /* ---------- 脚本执行 ---------- */
  function execInline(code) {
    var el = document.createElement('script');
    el.textContent = code;
    document.head.appendChild(el);
    el.remove();
  }

  function loadScript(src) {
    return new Promise(function (resolve) {
      var el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = function () { resolve(); };
      el.onerror = function () { resolve(); };
      document.head.appendChild(el);
    });
  }

  function runScripts(parsed, baseUrl) {
    var scripts = Array.prototype.slice.call(parsed.querySelectorAll('script'));
    var chain = Promise.resolve();
    scripts.forEach(function (s) {
      var src = s.getAttribute('src');
      if (src) {
        var abs;
        try { abs = new URL(src, baseUrl); } catch (e) { return; }
        if (abs.origin !== location.origin) return;
        if (KEEP_SCRIPTS.indexOf(abs.pathname) >= 0) return;
        chain = chain.then(function () { return loadScript(abs.href); });
      } else {
        var code = s.textContent;
        if (!code || !code.trim()) return;
        chain = chain.then(function () { execInline(code); });
      }
    });
    return chain;
  }

  /* ---------- 页面切换 ---------- */
  function markActive() {
    var path = location.pathname;
    document.querySelectorAll('.nb-navbar__menu a[href], .nb-mobile-menu a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.indexOf('#') >= 0 || /^https?:/i.test(href)) return;
      var p;
      try { p = new URL(a.href, location.href).pathname; } catch (e) { return; }
      if (p === path) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var y = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = y; });
  }

  function scrollToTarget(hash, top) {
    if (hash) {
      var el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) { el.scrollIntoView({ block: 'start' }); return; }
    }
    window.scrollTo(0, top || 0);
  }

  function apply(html, url, opts) {
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    var newMain = parsed.querySelector('main');
    if (!newMain) throw new Error('no main element');

    var oldMain = document.querySelector('main');
    var oldFoot = document.querySelector('footer.nb-footer');
    var newFoot = parsed.querySelector('footer.nb-footer');

    /* 清掉上一页遗留的顶层节点（例如 404 页的 audio） */
    Array.prototype.slice.call(document.body.children).forEach(function (node) {
      if (node.matches && node.matches(PERSIST_SELECTOR)) return;
      if (node.id === 'nb-route-progress') return;
      if (node.tagName === 'MAIN' || (node.classList && node.classList.contains('nb-footer'))) return;
      node.remove();
    });

    if (oldMain) oldMain.remove();
    if (oldFoot) oldFoot.remove();

    var anchor = document.querySelector('.nb-mobile-menu') || document.querySelector('header.nb-navbar');
    var parent = document.body;
    var newMainNode = document.importNode(newMain, true);
    if (anchor && anchor.nextSibling) parent.insertBefore(newMainNode, anchor.nextSibling);
    else parent.appendChild(newMainNode);

    if (newFoot) {
      var footNode = document.importNode(newFoot, true);
      parent.appendChild(footNode);
    }

    syncHead(parsed, url);

    return runScripts(parsed, url).then(function () {
      markActive();
      var top = opts && typeof opts.scroll === 'number' ? opts.scroll : 0;
      scrollToTarget(location.hash, top);
    });
  }

  function go(url, opts) {
    opts = opts || {};
    var token = ++loadToken;
    if (!opts.pop) startProgress();
    fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'spa' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (!/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('not html');
        return res.text();
      })
      .then(function (html) {
        if (token !== loadToken) return;
        /* 先改地址再渲染：页面里的相对路径（sites.json、music/*.mp3、css/*）才会按新目录解析 */
        if (opts.pop) {
          history.replaceState({ spa: true, url: url, scroll: opts.scroll || 0 }, '', url);
        } else {
          history.pushState({ spa: true, url: url, scroll: 0 }, '', url);
        }
        return apply(html, url, opts);
      })
      .then(function () {
        if (token !== loadToken) return;
        finishProgress();
      })
      .catch(function () {
        if (token !== loadToken) return;
        window.location.href = url;
      });
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !interceptable(a)) return;
    var url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) {
        e.preventDefault();
        scrollToTarget(url.hash, 0);
      }
      return;
    }
    e.preventDefault();
    var state = history.state || {};
    state.scroll = window.scrollY;
    try { history.replaceState(state, '', location.href); } catch (err) {}
    go(url.href, {});
  }, false);

  window.addEventListener('popstate', function (e) {
    var state = e.state || {};
    go(location.href, { pop: true, scroll: state.scroll || 0 });
  });

  /* 悬停预取，点击后几乎无等待 */
  var prefetched = {};
  document.addEventListener('pointerover', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !interceptable(a)) return;
    var url = new URL(a.href, location.href);
    if (prefetched[url.href]) return;
    prefetched[url.href] = true;
    if (url.pathname === location.pathname) return;
    fetch(url.href, { credentials: 'same-origin', priority: 'low' }).catch(function () {});
  }, { passive: true });

  document.documentElement.setAttribute('data-router', 'on');
})();

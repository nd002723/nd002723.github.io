/* 导航栏 BGM 播放器
 * 首次打开：随机挑一首开始播放；之后按播放列表顺序循环。
 * 跨页面续播：用 sessionStorage 记住曲目与进度，换页不中断（浏览器允许自动播放时）。
 * 曲库来自 /media/playlist.json（media 仓库的 music/ 目录）。
 */
(function () {
  'use strict';

  var PLAYLIST_URL = '/media/playlist.json';
  var STORE_KEY = 'nd-bgm';
  var VOLUME_KEY = 'nd-bgm-volume';
  var MUTE_KEY = 'nd-bgm-muted';
  var DEFAULT_VOLUME = 0.6;

  var ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h3l4 3V6L7 9H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h3l4 3V6L7 9H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="7" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="6" cy="17" r="1.4"/><path d="M10 6.2h9v1.6h-9zM10 11.2h9v1.6h-9zM10 16.2h9v1.6h-9z"/></svg>'
  };

  function readVolume() {
    var v = parseFloat(localStorage.getItem(VOLUME_KEY));
    return isNaN(v) ? DEFAULT_VOLUME : Math.min(1, Math.max(0, v));
  }

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeState(state) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function buildUI() {
    var root = document.createElement('div');
    root.className = 'nb-player';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', '背景音乐');
    root.innerHTML =
      '<button class="nb-player__btn" type="button" data-bgm="prev" aria-label="上一首" title="上一首">' + ICONS.prev + '</button>' +
      '<button class="nb-player__btn nb-player__btn--play" type="button" data-bgm="toggle" aria-label="播放" title="播放 / 暂停">' + ICONS.play + '</button>' +
      '<button class="nb-player__btn" type="button" data-bgm="next" aria-label="下一首" title="下一首">' + ICONS.next + '</button>' +
      '<button class="nb-player__btn nb-player__btn--menu" type="button" data-bgm="menu" aria-label="播放列表" aria-expanded="false" title="播放列表 / 音量">' + ICONS.list + '</button>' +
      '<span class="nb-player__title" data-bgm="title">背景音乐</span>' +
      '<span class="nb-player__progress" aria-hidden="true"><span class="nb-player__bar" data-bgm="bar"></span></span>' +
      '<div class="nb-player__panel">' +
        '<div class="nb-player__panel-inner">' +
          '<div class="nb-player__label"><span>播放列表</span><span data-bgm="count"></span></div>' +
          '<div class="nb-player__list" data-bgm="list" role="listbox" aria-label="曲目列表"></div>' +
          '<div class="nb-player__volume">' +
            '<button class="nb-player__mute" type="button" data-bgm="mute" aria-label="静音" title="一键静音">' + ICONS.volume + '</button>' +
            '<input type="range" min="0" max="1" step="0.01" data-bgm="volume" aria-label="音量">' +
            '<output data-bgm="volume-label">60%</output>' +
          '</div>' +
        '</div>' +
      '</div>';
    return root;
  }

  function init(tracks) {
    if (!tracks || !tracks.length) return;
    var actions = document.querySelector('.nb-navbar__actions');
    if (!actions || actions.querySelector('.nb-player')) return;

    var ui = buildUI();
    actions.insertBefore(ui, actions.firstChild);

    var btnToggle = ui.querySelector('[data-bgm="toggle"]');
    var btnPrev = ui.querySelector('[data-bgm="prev"]');
    var btnNext = ui.querySelector('[data-bgm="next"]');
    var titleEl = ui.querySelector('[data-bgm="title"]');
    var barEl = ui.querySelector('[data-bgm="bar"]');
    var listEl = ui.querySelector('[data-bgm="list"]');
    var countEl = ui.querySelector('[data-bgm="count"]');
    var volumeEl = ui.querySelector('[data-bgm="volume"]');
    var volumeLabel = ui.querySelector('[data-bgm="volume-label"]');
    var muteEl = ui.querySelector('[data-bgm="mute"]');
    var menuEl = ui.querySelector('[data-bgm="menu"]');

    var audio = new Audio();
    audio.preload = 'metadata';
    audio.setAttribute('data-bgm', 'audio');
    audio.style.display = 'none';
    ui.appendChild(audio);

    var saved = readState();
    var index = saved && Number.isInteger(saved.i) && saved.i >= 0 && saved.i < tracks.length
      ? saved.i
      : Math.floor(Math.random() * tracks.length);
    var wantPlay = saved ? !!saved.playing : true;
    var resumeAt = saved && typeof saved.t === 'number' ? saved.t : 0;
    var lastSaved = 0;
    var gestureBound = false;

    function track() { return tracks[index]; }

    function render() {
      titleEl.textContent = track().title;
      titleEl.title = track().title + ' · 悬停选曲 / 调音量';
      btnToggle.innerHTML = audio.paused ? ICONS.play : ICONS.pause;
      btnToggle.setAttribute('aria-label', audio.paused ? '播放' : '暂停');
      renderList();
    }

    function renderList() {
      var items = listEl.children;
      for (var i = 0; i < items.length; i++) {
        var active = i === index;
        items[i].classList.toggle('is-active', active);
        items[i].setAttribute('aria-selected', active ? 'true' : 'false');
        items[i].firstElementChild.textContent = active ? (audio.paused ? '❚❚' : '▶') : String(i + 1);
      }
    }

    function renderVolume() {
      var v = audio.volume;
      volumeEl.value = String(v);
      muteEl.innerHTML = audio.muted ? ICONS.muted : ICONS.volume;
      muteEl.setAttribute('aria-label', audio.muted ? '取消静音' : '静音');
      muteEl.title = audio.muted ? '取消静音' : '一键静音';
      muteEl.classList.toggle('is-muted', audio.muted);
      volumeLabel.textContent = audio.muted ? '静音' : Math.round(v * 100) + '%';
    }

    function setMuted(flag) {
      audio.muted = !!flag;
      try { localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0'); } catch (e) {}
      renderVolume();
    }

    function buildList() {
      var frag = document.createDocumentFragment();
      tracks.forEach(function (t, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nb-player__track';
        btn.setAttribute('role', 'option');
        btn.title = t.title;
        var mark = document.createElement('i');
        mark.textContent = String(i + 1);
        var name = document.createElement('span');
        name.textContent = t.title;
        btn.appendChild(mark);
        btn.appendChild(name);
        btn.addEventListener('click', function () {
          if (i === index) {
            if (audio.paused) tryPlay(); else audio.pause();
          } else {
            load(i, 0, true);
          }
          ui.classList.add('is-open');
        });
        frag.appendChild(btn);
      });
      listEl.innerHTML = '';
      listEl.appendChild(frag);
      countEl.textContent = tracks.length + ' 首';
    }

    function save() {
      writeState({ i: index, t: audio.currentTime || 0, playing: !audio.paused });
    }

    function bindGestureStart() {
      if (gestureBound) return;
      gestureBound = true;
      var start = function () {
        document.removeEventListener('pointerdown', start, true);
        document.removeEventListener('keydown', start, true);
        ui.classList.remove('is-blocked');
        audio.play().catch(function () {});
      };
      document.addEventListener('pointerdown', start, true);
      document.addEventListener('keydown', start, true);
    }

    function tryPlay() {
      var p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          ui.classList.add('is-blocked');
          bindGestureStart();
          render();
        });
      }
    }

    function load(i, time, autoPlay) {
      index = (i + tracks.length) % tracks.length;
      audio.src = track().src;
      if (time) {
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = Math.min(time, (audio.duration || time) - 1); } catch (e) {}
        });
      }
      render();
      writeState({ i: index, t: time || 0, playing: !!autoPlay });
      if (autoPlay) tryPlay();
    }

    function next(step) {
      load(index + (step || 1), 0, true);
    }

    buildList();
    audio.volume = readVolume();
    audio.muted = localStorage.getItem(MUTE_KEY) === '1';
    renderVolume();

    muteEl.addEventListener('click', function () { setMuted(!audio.muted); });

    volumeEl.addEventListener('input', function () {
      var v = Math.min(1, Math.max(0, parseFloat(volumeEl.value) || 0));
      audio.volume = v;
      if (audio.muted && v > 0) setMuted(false);   /* 拖动滑块自动取消静音 */
      else renderVolume();
      try { localStorage.setItem(VOLUME_KEY, String(v)); } catch (e) {}
    });

    function setOpen(open) {
      ui.classList.toggle('is-open', open);
      menuEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /* 点标题 / 列表按钮展开收起（触屏没有 hover 时用） */
    titleEl.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!ui.classList.contains('is-open'));
    });
    menuEl.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!ui.classList.contains('is-open'));
    });
    document.addEventListener('click', function (e) {
      if (!ui.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    btnToggle.addEventListener('click', function () {
      if (audio.paused) { tryPlay(); } else { audio.pause(); }
    });
    btnPrev.addEventListener('click', function () { next(-1); });
    btnNext.addEventListener('click', function () { next(1); });

    audio.addEventListener('play', function () { ui.classList.remove('is-blocked'); render(); save(); });
    audio.addEventListener('pause', function () { render(); save(); });
    audio.addEventListener('ended', function () { next(1); });
    audio.addEventListener('loadedmetadata', function () { render(); });
    audio.addEventListener('error', function () { next(1); });
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration || 0;
      barEl.style.width = d ? (audio.currentTime / d * 100).toFixed(2) + '%' : '0%';
      var now = Date.now();
      if (now - lastSaved > 1200) { lastSaved = now; save(); }
    });

    /* 页面里其它音频（比如 /media/ 的列表）开始播放时，暂停 BGM，避免两首一起响 */
    document.addEventListener('play', function (e) {
      if (e.target && e.target.tagName === 'AUDIO' && e.target !== audio && !audio.paused) {
        audio.pause();
      }
    }, true);

    /* 离开页面时记录进度 */
    window.addEventListener('pagehide', save);

    load(index, resumeAt, wantPlay);
  }

  function boot() {
    if (!document.querySelector('.nb-navbar')) return;
    fetch(PLAYLIST_URL, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.tracks && data.tracks.length) init(data.tracks); })
      .catch(function () { /* 曲库不可用时静默隐藏播放器 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
/* ============================================================
   app.js — state, persistence and every control on the page.
   State lives in localStorage and is mirrored to other open
   tabs through the `storage` event, so the app looks the same
   after a reload and in a second window.
   ============================================================ */

(function () {
  'use strict';

  var STATE_KEY = 'nexagon.state.v1';
  var THEME_KEY = 'nexagon.theme';

  /* Series colours. Keep in sync with the html[data-palette] rules in css/styles.css. */
  var PALETTES = [
    { id: 'signal',   label: 'Signal',   colors: ['#7C5CFF', '#4CC9F0', '#38E8B0', '#FFB84D', '#FF6B9A', '#B0FF6B'] },
    { id: 'ember',    label: 'Ember',    colors: ['#FF6B35', '#FFC145', '#EF476F', '#FF9F1C', '#C1121F', '#FFD9A0'] },
    { id: 'tide',     label: 'Tide',     colors: ['#2E9FFF', '#14B8B8', '#5D7BFF', '#48D597', '#8AB6FF', '#0E7490'] },
    { id: 'bloom',    label: 'Bloom',    colors: ['#F472B6', '#C084FC', '#FB7185', '#A78BFA', '#FDBA74', '#67E8F9'] },
    { id: 'moss',     label: 'Moss',     colors: ['#4ADE80', '#A3E635', '#14B8A6', '#84CC16', '#22C55E', '#CFF67B'] },
    { id: 'graphite', label: 'Graphite', colors: ['#6C7A93', '#9AA7BD', '#3F4A5F', '#C6D0E0', '#818CA0', '#525E75'] }
  ];

  /* Chart-surface colours per theme. Mirrors the --chart-bg/--ink/--grid tokens. */
  var THEME_COLORS = {
    dark:  { bg: '#0B101B', ink: '#E9EEF9', dim: '#8A97AF', grid: '#2A3547' },
    light: { bg: '#FFFFFF', ink: '#111726', dim: '#5C6880', grid: '#D3DAE7' }
  };

  var DEFAULT_ATTRS = ['Speed', 'Power', 'Stamina', 'Technique', 'Vision', 'Composure'];
  var MAX_SERIES = 6;
  var MAX_ATTRS = 24;
  var SLOTS = PALETTES[0].colors.length;

  function defaults() {
    return {
      title: 'Player profile',
      attributes: DEFAULT_ATTRS.slice(),
      series: [{ name: 'Set A', values: [72, 58, 84, 66, 90, 49], visible: true, color: 0 }],
      active: 0,
      max: 100,
      levels: 5,
      shape: 'polygon',
      palette: 'signal',
      fillOpacity: 0.28,
      strokeWidth: 2.5,
      showLabels: true,
      showValues: false,
      showGrid: true,
      showPoints: true,
      showTitle: true,
      showLegend: true,
      exportLabels: true,
      exportTitle: true,
      exportLegend: true,
      format: 'image/png',
      size: '1024',
      customSize: 1200,
      exportBg: 'theme'
    };
  }

  var state = defaults();
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- persistence ---------- */

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 180);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var base = defaults();
      Object.keys(base).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) base[k] = saved[k];
      });
      state = base;
      normalise();
    } catch (e) {}
  }

  function clamp(v, lo, hi, fallback) {
    var x = Number(v);
    return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback;
  }

  function oneOf(v, allowed, fallback) {
    return allowed.indexOf(v) === -1 ? fallback : v;
  }

  /* Keep every series the same length as the axis list, and every setting
     inside the range its control can produce. Anything persisted by an older
     build — or hand-edited in devtools — otherwise renders a dead chart with
     no way back to a working state from the interface. */
  function normalise() {
    var d = defaults();

    state.title = String(state.title == null ? d.title : state.title).slice(0, 60);
    state.max = Math.round(clamp(state.max, 5, 1000, d.max));
    state.levels = Math.round(clamp(state.levels, 2, 10, d.levels));
    state.fillOpacity = clamp(state.fillOpacity, 0, 0.7, d.fillOpacity);
    state.strokeWidth = clamp(state.strokeWidth, 1, 6, d.strokeWidth);
    state.customSize = Math.round(clamp(state.customSize, 64, 8192, d.customSize));
    state.shape = oneOf(state.shape, ['polygon', 'circle'], d.shape);
    state.palette = oneOf(state.palette, PALETTES.map(function (p) { return p.id; }), d.palette);
    state.format = oneOf(state.format,
      ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'svg'], d.format);
    state.size = oneOf(String(state.size),
      ['512', '800', '1024', '1600', '2048', '4096', 'custom'], d.size);
    state.exportBg = oneOf(state.exportBg, ['theme', 'dark', 'light', 'transparent'], d.exportBg);
    ['showLabels', 'showValues', 'showGrid', 'showPoints', 'showTitle', 'showLegend',
     'exportLabels', 'exportTitle', 'exportLegend'].forEach(function (k) {
      state[k] = !!state[k];
    });

    if (!Array.isArray(state.attributes) || state.attributes.length === 0) {
      state.attributes = DEFAULT_ATTRS.slice();
    }
    state.attributes = state.attributes.slice(0, MAX_ATTRS)
      .map(function (a) { return String(a).slice(0, 40); });
    if (!Array.isArray(state.series) || !state.series.length) {
      state.series = [{ name: 'Set A', values: [], visible: true, color: 0 }];
    }
    state.series = state.series.slice(0, MAX_SERIES).map(function (s, i) {
      var vals = Array.isArray(s.values) ? s.values.slice(0, state.attributes.length) : [];
      while (vals.length < state.attributes.length) vals.push(Math.round(state.max * 0.5));
      return {
        name: String(s.name || 'Set ' + String.fromCharCode(65 + i)).slice(0, 28),
        /* Values are NOT clamped to the scale — lowering the scale must not destroy data. */
        values: vals.map(function (v) { return Math.max(0, Math.min(1000, Number(v) || 0)); }),
        visible: s.visible !== false,
        color: s.color == null ? i % SLOTS : Math.abs(s.color | 0) % SLOTS
      };
    });
    state.active = Math.max(0, Math.min(state.series.length - 1, state.active | 0));
  }

  /* ---------- theme ---------- */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F2F4F9' : '#080B12');
    var btn = $('theme-toggle');
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    btn.title = theme === 'light' ? 'Switch to dark' : 'Switch to light';
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
    drawChart();
  }

  /* ---------- palette ---------- */

  function paletteColors() {
    var p = PALETTES.filter(function (x) { return x.id === state.palette; })[0] || PALETTES[0];
    return p.colors;
  }

  function seriesColor(set) { return paletteColors()[Math.abs(set.color | 0) % SLOTS]; }

  /* Lowest palette slot not already taken. */
  function freeColor() {
    var used = state.series.map(function (s) { return s.color; });
    for (var c = 0; c < SLOTS; c++) if (used.indexOf(c) === -1) return c;
    return state.series.length % SLOTS;
  }

  /* ---------- chart ---------- */

  function chartConfig(opts) {
    opts = opts || {};
    var theme = currentTheme();
    var bgMode = opts.bgMode || 'theme';
    var themeForColors = bgMode === 'light' ? 'light' : bgMode === 'dark' ? 'dark' : theme;
    var tc = THEME_COLORS[themeForColors];

    return {
      width: opts.size || 1000,
      height: opts.size || 1000,
      title: state.title,
      attributes: state.attributes,
      series: state.series.map(function (s) {
        return { name: s.name, values: s.values, visible: s.visible, color: seriesColor(s) };
      }),
      max: state.max,
      levels: state.levels,
      shape: state.shape,
      fillOpacity: state.fillOpacity,
      strokeWidth: state.strokeWidth,
      showLabels: opts.showLabels != null ? opts.showLabels : state.showLabels,
      showValues: state.showValues,
      showGrid: state.showGrid,
      showPoints: state.showPoints,
      showTitle: opts.showTitle != null ? opts.showTitle : state.showTitle,
      showLegend: opts.showLegend != null ? opts.showLegend : state.showLegend,
      bg: bgMode === 'transparent' ? null : tc.bg,
      pointRing: bgMode === 'transparent' ? 'none' : tc.bg,
      ink: tc.ink,
      dim: tc.dim,
      grid: tc.grid
    };
  }

  var frame = null;
  function drawChart() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = null;
      var cfg = chartConfig({ size: 1000, bgMode: 'theme' });
      cfg.bg = null; /* the card supplies the backdrop on screen */
      cfg.pointRing = THEME_COLORS[currentTheme()].bg;
      $('scope').innerHTML = Nexagon.build(cfg);
      updateMeta();
    });
  }

  function updateMeta() {
    var setCount = state.series.length;
    $('stamp').textContent = state.attributes.length + ' ' +
      (state.attributes.length === 1 ? 'axis' : 'axes') + ' · ' +
      setCount + ' ' + (setCount === 1 ? 'set' : 'sets');

    var s = state.series[state.active];
    if (s && state.attributes.length) {
      var sum = s.values.reduce(function (a, b) { return a + b; }, 0);
      var avg = Math.round(sum / s.values.length);
      var peak = 0;
      s.values.forEach(function (v, i) { if (v > s.values[peak]) peak = i; });
      $('readout').textContent = s.name + ' · avg ' + avg + ' · peak ' +
        state.attributes[peak] + ' ' + Math.round(s.values[peak]);
    } else {
      $('readout').textContent = '—';
    }

    var chosen = $('format').selectedOptions[0];
    var label = (chosen ? chosen.textContent : 'PNG').replace(/ \(.*\)$/, '');
    var px = exportSize();
    $('dims').textContent = state.format === 'svg'
      ? 'vector · ' + px + ' × ' + px + ' frame · SVG'
      : px + ' × ' + px + ' · ' + label;
  }

  /* ---------- reordering ---------- */

  /* Set after a keyboard move so the grip keeps focus through the re-render. */
  var focusGrip = null;

  function move(arr, from, to) {
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    return arr;
  }

  function permute(arr, order) {
    return order.map(function (i) { return arr[i]; });
  }

  /* Rows carry their original index, so DOM order reads back as a permutation. */
  function domOrder(list) {
    return Array.prototype.map.call(list.children, function (el) { return el._idx; });
  }

  function unchanged(order) {
    return order.every(function (v, i) { return v === i; });
  }

  function restoreGrip(kind) {
    if (!focusGrip || focusGrip.kind !== kind) return;
    var list = $(kind === 'axis' ? 'axis-list' : 'series-list');
    var row = list.children[focusGrip.index];
    var grip = row && row.querySelector('.grip');
    if (grip) grip.focus();
    focusGrip = null;
  }

  /* Pointer drag: works with mouse, pen and touch. The row itself moves in the
     DOM as you go, and the new order is committed to state on release. */
  function enableDrag(handle, row, list, commit) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      row.classList.add('dragging');
      list.classList.add('sorting');

      var onMove = function (ev) {
        var others = Array.prototype.filter.call(list.children, function (c) { return c !== row; });
        var before = null;
        for (var i = 0; i < others.length; i++) {
          var r = others[i].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { before = others[i]; break; }
        }
        if (before) list.insertBefore(row, before);
        else list.appendChild(row);
      };
      var onStop = function () {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onStop);
        handle.removeEventListener('pointercancel', onStop);
        row.classList.remove('dragging');
        list.classList.remove('sorting');
        commit();
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onStop);
      handle.addEventListener('pointercancel', onStop);
    });
  }

  function commitAxisOrder() {
    var order = domOrder($('axis-list'));
    if (!unchanged(order)) {
      state.attributes = permute(state.attributes, order);
      state.series.forEach(function (s) { s.values = permute(s.values, order); });
      drawChart(); save();
    }
    renderAxes();
  }

  function moveAxis(from, to) {
    if (to < 0 || to >= state.attributes.length) return;
    move(state.attributes, from, to);
    state.series.forEach(function (s) { move(s.values, from, to); });
    focusGrip = { kind: 'axis', index: to };
    renderAxes(); drawChart(); save();
  }

  function commitSeriesOrder() {
    var order = domOrder($('series-list'));
    if (!unchanged(order)) {
      var held = state.series[state.active];
      state.series = permute(state.series, order);
      state.active = Math.max(0, state.series.indexOf(held));
      drawChart(); save();
    }
    renderSeries();
  }

  function moveSeries(from, to) {
    if (to < 0 || to >= state.series.length) return;
    var held = state.series[state.active];
    move(state.series, from, to);
    state.active = Math.max(0, state.series.indexOf(held));
    focusGrip = { kind: 'series', index: to };
    renderSeries(); drawChart(); save();
  }

  /* ---------- scale overflow ---------- */

  /* Values above the scale are kept, not cut, so raising the scale brings them back. */
  function overflow() {
    var count = 0, peak = 0;
    state.series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (v > state.max) { count++; peak = Math.max(peak, v); }
      });
    });
    return { count: count, peak: peak };
  }

  function refreshScaleNotice() {
    var o = overflow();
    var box = $('scale-notice');
    box.hidden = o.count === 0;
    if (!o.count) return;
    $('scale-notice-text').textContent = o.count === 1
      ? 'One value sits above the scale. It is held at its real number and drawn at the rim.'
      : o.count + ' values sit above the scale. They are held at their real numbers and drawn at the rim.';
    var fit = Math.min(1000, Math.ceil(o.peak / 5) * 5);
    $('fit-scale').textContent = 'Raise scale to ' + fit;
    $('fit-scale').dataset.fit = String(fit);
    $('clamp-scale').textContent = 'Set them to ' + state.max;
  }

  /* ---------- axis rows ---------- */

  function renderAxes() {
    var list = $('axis-list');
    list.textContent = '';
    var active = state.series[state.active];

    state.attributes.forEach(function (name, i) {
      var row = document.createElement('div');
      row.className = 'axis-row';
      row._idx = i;

      /* The position number doubles as the drag handle. */
      var grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'axis-index grip';
      grip.textContent = String(i + 1).padStart(2, '0');
      grip.title = 'Drag to reorder, or use the up and down arrow keys';
      grip.setAttribute('aria-label', 'Reorder ' + name + ', currently ' + (i + 1) + ' of ' + state.attributes.length);
      grip.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp') { e.preventDefault(); moveAxis(i, i - 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveAxis(i, i + 1); }
      });
      enableDrag(grip, row, list, commitAxisOrder);

      var nameInput = document.createElement('input');
      nameInput.className = 'axis-name';
      nameInput.type = 'text';
      nameInput.value = name;
      nameInput.maxLength = 40;
      nameInput.setAttribute('aria-label', 'Axis ' + (i + 1) + ' name');
      nameInput.addEventListener('input', function () {
        state.attributes[i] = nameInput.value;
        drawChart(); save();
      });

      var value = active.values[i];
      var over = value > state.max;
      if (over) row.classList.add('over');

      var range = document.createElement('input');
      range.className = 'range';
      range.type = 'range';
      range.min = 0;
      range.max = state.max;
      range.step = 1;
      range.value = Math.min(value, state.max);
      range.setAttribute('aria-label', name + ' value');

      var out = document.createElement('output');
      out.className = 'axis-value';
      out.textContent = Math.round(value) + (over ? ' ↑' : '');
      if (over) out.title = 'Held above the current scale of ' + state.max;

      paintRange(range);
      range.addEventListener('input', function () {
        state.series[state.active].values[i] = Number(range.value);
        out.textContent = range.value;
        out.removeAttribute('title');
        row.classList.remove('over');
        paintRange(range);
        refreshScaleNotice();
        drawChart(); save();
      });

      var kill = document.createElement('button');
      kill.className = 'axis-kill';
      kill.type = 'button';
      kill.innerHTML = '&times;';
      kill.title = 'Remove ' + name;
      kill.setAttribute('aria-label', 'Remove ' + name);
      kill.disabled = state.attributes.length <= 3;
      kill.addEventListener('click', function () {
        state.attributes.splice(i, 1);
        state.series.forEach(function (s) { s.values.splice(i, 1); });
        renderAxes(); drawChart(); save();
      });

      row.append(grip, nameInput, range, out, kill);
      list.appendChild(row);
    });

    $('add-axis').disabled = state.attributes.length >= MAX_ATTRS;
    refreshScaleNotice();
    restoreGrip('axis');
  }

  function paintRange(el) {
    var min = Number(el.min), max = Number(el.max);
    var pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--pct', pct + '%');
  }

  /* ---------- series rows ---------- */

  function renderSeries() {
    var list = $('series-list');
    list.textContent = '';

    state.series.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'series-row';
      row._idx = i;
      row.dataset.active = String(i === state.active);
      row.tabIndex = 0;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Data set ' + s.name);
      row.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.target !== row) return;
        state.active = i;
        renderSeries(); renderAxes(); updateMeta(); save();
      });
      row.style.setProperty('--swatch', seriesColor(s));
      row.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
        state.active = i;
        renderSeries(); renderAxes(); updateMeta(); save();
      });

      /* The colour swatch doubles as the drag handle. */
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'series-dot grip';
      dot.title = 'Drag to reorder, or use the up and down arrow keys';
      dot.setAttribute('aria-label', 'Reorder ' + s.name + ', currently ' + (i + 1) + ' of ' + state.series.length);
      dot.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp') { e.preventDefault(); moveSeries(i, i - 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveSeries(i, i + 1); }
      });
      enableDrag(dot, row, list, commitSeriesOrder);

      var name = document.createElement('input');
      name.className = 'series-name';
      name.type = 'text';
      name.value = s.name;
      name.maxLength = 28;
      name.setAttribute('aria-label', 'Set ' + (i + 1) + ' name');
      name.addEventListener('input', function () {
        state.series[i].name = name.value;
        drawChart(); save();
      });

      var eye = document.createElement('button');
      eye.className = 'mini-btn';
      eye.type = 'button';
      eye.textContent = s.visible ? '◉' : '○';
      eye.title = s.visible ? 'Hide on chart' : 'Show on chart';
      eye.setAttribute('aria-label', eye.title);
      eye.addEventListener('click', function () {
        state.series[i].visible = !state.series[i].visible;
        renderSeries(); drawChart(); save();
      });

      var kill = document.createElement('button');
      kill.className = 'mini-btn';
      kill.type = 'button';
      kill.innerHTML = '&times;';
      kill.title = 'Remove set';
      kill.setAttribute('aria-label', 'Remove set ' + s.name);
      kill.disabled = state.series.length <= 1;
      kill.addEventListener('click', function () {
        state.series.splice(i, 1);
        state.active = Math.max(0, Math.min(state.series.length - 1, state.active));
        renderSeries(); renderAxes(); drawChart(); save();
      });

      var meta = document.createElement('span');
      meta.className = 'series-meta';
      meta.textContent = i === state.active ? 'editing' : '';

      row.append(dot, name, meta, eye, kill);
      list.appendChild(row);
    });

    $('add-series').disabled = state.series.length >= MAX_SERIES;
    restoreGrip('series');
  }

  /* ---------- palette chips ---------- */

  function renderPalettes() {
    var wrap = $('palette-list');
    wrap.textContent = '';
    PALETTES.forEach(function (p) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'palette-chip';
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(p.id === state.palette));

      var bars = document.createElement('span');
      bars.className = 'bars';
      p.colors.slice(0, 4).forEach(function (c) {
        var b = document.createElement('i');
        b.style.background = c;
        bars.appendChild(b);
      });

      var nm = document.createElement('span');
      nm.className = 'name';
      nm.textContent = p.label;

      chip.append(bars, nm);
      chip.addEventListener('click', function () {
        state.palette = p.id;
        document.documentElement.setAttribute('data-palette', p.id);
        renderPalettes(); renderSeries(); drawChart(); save();
      });
      wrap.appendChild(chip);
    });
  }

  /* ---------- import ---------- */

  function status(el, message, tone) {
    el.textContent = message;
    if (tone) el.setAttribute('data-tone', tone); else el.removeAttribute('data-tone');
  }

  function parseFile(text, filename) {
    var name = filename.toLowerCase();
    if (name.endsWith('.json')) return parseJson(text);
    if (name.endsWith('.csv') || name.endsWith('.tsv')) return parseDelimited(text, name.endsWith('.tsv') ? '\t' : ',');
    return { attributes: text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean) };
  }

  function parseJson(text) {
    var data = JSON.parse(text);
    if (Array.isArray(data)) {
      if (typeof data[0] === 'string') return { attributes: data };
      return {
        attributes: data.map(function (d) { return d.name || d.label || d.axis; }),
        series: [{ name: 'Imported', values: data.map(function (d) { return Number(d.value) || 0; }) }]
      };
    }
    var attrs = data.attributes || data.axes || data.labels;
    if (!attrs) throw new Error('No "attributes" list found in that JSON.');
    return {
      title: data.title,
      max: data.max,
      attributes: attrs.map(function (a) { return typeof a === 'string' ? a : (a.name || a.label); }),
      series: data.series
    };
  }

  /* RFC 4180: a quoted field may hold the separator, newlines and "" escapes.
     Splitting on the bare separator corrupts any label with a comma in it. */
  function splitDelimited(text, sep) {
    var rows = [], row = [], cell = '', quoted = false, wasQuoted = false;

    function endCell() {
      row.push(wasQuoted ? cell : cell.trim());
      cell = ''; wasQuoted = false;
    }
    function endRow() { endCell(); rows.push(row); row = []; }

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch !== '"') { cell += ch; continue; }
        if (text.charAt(i + 1) === '"') { cell += '"'; i++; continue; }
        quoted = false;
        continue;
      }
      if (ch === '"' && cell.trim() === '') { quoted = true; wasQuoted = true; cell = ''; continue; }
      if (ch === sep) { endCell(); continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { endRow(); continue; }
      cell += ch;
    }
    endRow();

    return rows.filter(function (r) {
      return r.some(function (c) { return c !== ''; });
    });
  }

  function parseDelimited(text, sep) {
    var rows = splitDelimited(text, sep);
    if (!rows.length) throw new Error('That file has no rows.');

    var head = rows[0];
    /* A single-column file is a plain list — it has no header row to drop. */
    var headerIsText = head.length > 1 &&
      head.slice(1).every(function (c) { return c !== '' && isNaN(Number(c)); });
    var body = headerIsText ? rows.slice(1) : rows;
    var setNames = headerIsText ? head.slice(1) : [];

    var attributes = body.map(function (r) { return r[0]; }).filter(Boolean);
    var colCount = body.reduce(function (m, r) { return Math.max(m, r.length - 1); }, 0);
    var series = [];
    for (var c = 0; c < Math.min(colCount, MAX_SERIES); c++) {
      series.push({
        name: setNames[c] || 'Set ' + String.fromCharCode(65 + c),
        values: body.map(function (r) { return Number(r[c + 1]) || 0; })
      });
    }
    return { attributes: attributes, series: series.length ? series : undefined };
  }

  function applyImport(parsed) {
    if (!parsed.attributes || parsed.attributes.length < 3) {
      throw new Error('Need at least three axis names.');
    }
    state.attributes = parsed.attributes.slice(0, MAX_ATTRS).map(String);
    if (parsed.title) state.title = String(parsed.title).slice(0, 60);
    if (parsed.max) state.max = Math.max(5, Math.min(1000, Number(parsed.max)));
    if (parsed.series && parsed.series.length) {
      /* Lift the scale so imported values are not silently clipped. */
      var peak = 0;
      parsed.series.forEach(function (s) {
        (s.values || []).forEach(function (v) { peak = Math.max(peak, Number(v) || 0); });
      });
      if (peak > state.max) state.max = Math.min(1000, Math.ceil(peak / 5) * 5);

      state.series = parsed.series.slice(0, MAX_SERIES).map(function (s, i) {
        return { name: s.name || 'Set ' + String.fromCharCode(65 + i), values: s.values || [], visible: true, color: i % 6 };
      });
      state.active = 0;
    }
    normalise();
    syncInputs();
    renderAxes(); renderSeries(); drawChart(); save();
  }

  /* ---------- export ---------- */

  /* Quote anything that would otherwise break the row apart on re-import. */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportSize() {
    return state.size === 'custom'
      ? Math.max(64, Math.min(8192, Number(state.customSize) || 1200))
      : Number(state.size);
  }

  function exportSvg() {
    var px = exportSize();
    return Nexagon.build(chartConfig({
      size: px,
      bgMode: state.exportBg,
      showLabels: state.exportLabels,
      showTitle: state.exportTitle,
      showLegend: state.exportLegend
    }));
  }

  function extensionFor(mime) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'svg': 'svg' }[mime];
  }

  function download() {
    var px = exportSize();
    var mime = state.format;
    var svg = exportSvg();
    var file = Exporter.slug(state.title) + '-' + px + '.' + extensionFor(mime);
    var el = $('export-status');

    if (mime === 'svg') {
      Exporter.save(Exporter.svgBlob(svg), file);
      status(el, 'Saved ' + file);
      return;
    }
    /* JPG has no alpha, so transparent falls back to a flat surface. */
    var flat = null;
    if (mime === 'image/jpeg') {
      flat = state.exportBg === 'transparent'
        ? THEME_COLORS[currentTheme()].bg
        : null;
    }
    status(el, 'Encoding ' + px + ' px…');
    Exporter.rasterize(svg, px, mime, flat)
      .then(function (blob) {
        Exporter.save(blob, file);
        status(el, 'Saved ' + file + ' · ' + Math.round(blob.size / 1024) + ' KB');
      })
      .catch(function (err) {
        status(el, err.message, 'error');
      });
  }

  function refreshFormatHint() {
    var sel = $('format');
    Array.prototype.forEach.call(sel.options, function (opt) {
      var ok = Exporter.supports(opt.value);
      opt.disabled = !ok;
      opt.textContent = opt.textContent.replace(/ \(not supported here\)$/, '') + (ok ? '' : ' (not supported here)');
    });
    if (!Exporter.supports(state.format)) {
      state.format = 'image/png';
      sel.value = 'image/png';
    }
    var hint = $('format-hint');
    if (state.format === 'svg') {
      hint.textContent = 'Vector output — text stays selectable and it scales to any size.';
    } else if (state.format === 'image/jpeg') {
      hint.textContent = 'JPG cannot hold transparency; a solid background is used instead.';
    } else if (!Exporter.supports('image/avif')) {
      hint.textContent = 'AVIF encoding is unavailable in this browser. WEBP is the next smallest.';
    } else {
      hint.textContent = '';
    }
  }

  /* ---------- wiring ---------- */

  function syncInputs() {
    $('title').value = state.title;
    $('shape').value = state.shape;
    $('levels').value = state.levels;
    $('levels-out').textContent = state.levels;
    $('max').max = Math.max(200, state.max);
    $('max').value = state.max;
    $('max-out').textContent = state.max;
    $('fill').value = Math.round(state.fillOpacity * 100);
    $('fill-out').textContent = Math.round(state.fillOpacity * 100) + '%';
    $('stroke').value = state.strokeWidth;
    $('stroke-out').textContent = state.strokeWidth;
    $('show-labels').checked = state.showLabels;
    $('show-values').checked = state.showValues;
    $('show-grid').checked = state.showGrid;
    $('show-points').checked = state.showPoints;
    $('show-title').checked = state.showTitle;
    $('show-legend').checked = state.showLegend;
    $('export-labels').checked = state.exportLabels;
    $('export-title').checked = state.exportTitle;
    $('export-legend').checked = state.exportLegend;
    $('format').value = state.format;
    $('size').value = state.size;
    $('custom-size').value = state.customSize;
    $('custom-size-field').hidden = state.size !== 'custom';
    $('export-bg').value = state.exportBg;
    document.documentElement.setAttribute('data-palette', state.palette);
    ['levels', 'max', 'fill', 'stroke'].forEach(function (id) { paintRange($(id)); });
  }

  function bind() {
    $('theme-toggle').addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    $('title').addEventListener('input', function () {
      state.title = this.value; drawChart(); save();
    });
    $('shape').addEventListener('change', function () {
      state.shape = this.value; drawChart(); save();
    });

    $('levels').addEventListener('input', function () {
      state.levels = Number(this.value);
      $('levels-out').textContent = this.value;
      paintRange(this); drawChart(); save();
    });

    $('max').addEventListener('input', function () {
      state.max = Number(this.value);
      $('max-out').textContent = this.value;
      paintRange(this);
      /* Values are left alone; anything above the new scale is flagged, not cut. */
      renderAxes(); drawChart(); save();
    });

    $('fill').addEventListener('input', function () {
      state.fillOpacity = Number(this.value) / 100;
      $('fill-out').textContent = this.value + '%';
      paintRange(this); drawChart(); save();
    });

    $('stroke').addEventListener('input', function () {
      state.strokeWidth = Number(this.value);
      $('stroke-out').textContent = this.value;
      paintRange(this); drawChart(); save();
    });

    [['show-labels', 'showLabels'], ['show-values', 'showValues'], ['show-grid', 'showGrid'],
     ['show-points', 'showPoints'], ['show-title', 'showTitle'], ['show-legend', 'showLegend'],
     ['export-labels', 'exportLabels'], ['export-title', 'exportTitle'], ['export-legend', 'exportLegend']
    ].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function () {
        state[pair[1]] = this.checked;
        drawChart(); save();
      });
    });

    $('add-axis').addEventListener('click', function () {
      if (state.attributes.length >= MAX_ATTRS) return;
      state.attributes.push('Axis ' + (state.attributes.length + 1));
      state.series.forEach(function (s) { s.values.push(Math.round(state.max * 0.5)); });
      renderAxes(); drawChart(); save();
    });

    $('reset-axes').addEventListener('click', function () {
      state.attributes = DEFAULT_ATTRS.slice();
      state.series.forEach(function (s) {
        s.values = DEFAULT_ATTRS.map(function () { return Math.round(state.max * 0.5); });
      });
      renderAxes(); drawChart(); save();
      status($('upload-status'), 'Default axes restored');
    });

    $('add-series').addEventListener('click', function () {
      if (state.series.length >= MAX_SERIES) return;
      var i = state.series.length;
      state.series.push({
        name: 'Set ' + String.fromCharCode(65 + i),
        values: state.attributes.map(function () { return Math.round(state.max * 0.5); }),
        visible: true,
        color: freeColor()
      });
      state.active = i;
      renderSeries(); renderAxes(); drawChart(); save();
    });

    $('randomise').addEventListener('click', function () {
      var s = state.series[state.active];
      s.values = s.values.map(function () {
        return Math.round(state.max * (0.35 + Math.random() * 0.6));
      });
      renderAxes(); drawChart(); save();
    });

    $('upload').addEventListener('change', function () {
      var file = this.files && this.files[0];
      var el = $('upload-status');
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyImport(parseFile(String(reader.result), file.name));
          status(el, 'Loaded ' + file.name + ' · ' + state.attributes.length + ' axes');
        } catch (err) {
          status(el, err.message, 'error');
        }
      };
      reader.onerror = function () { status(el, 'That file could not be read.', 'error'); };
      reader.readAsText(file);
      this.value = '';
    });

    $('save-json').addEventListener('click', function () {
      var payload = {
        version: 1,
        title: state.title,
        max: state.max,
        attributes: state.attributes,
        series: state.series.map(function (s) { return { name: s.name, values: s.values, color: s.color }; })
      };
      Exporter.saveText(JSON.stringify(payload, null, 2),
        Exporter.slug(state.title) + '.json', 'application/json');
      status($('upload-status'), 'Saved axis set as JSON');
    });

    $('save-csv').addEventListener('click', function () {
      var head = ['Axis'].concat(state.series.map(function (s) { return s.name; })).map(csvCell).join(',');
      var rows = state.attributes.map(function (a, i) {
        return [a].concat(state.series.map(function (s) { return s.values[i]; })).map(csvCell).join(',');
      });
      Exporter.saveText([head].concat(rows).join('\n'),
        Exporter.slug(state.title) + '.csv', 'text/csv');
      status($('upload-status'), 'Saved axis set as CSV');
    });

    $('format').addEventListener('change', function () {
      state.format = this.value; refreshFormatHint(); updateMeta(); save();
    });
    $('size').addEventListener('change', function () {
      state.size = this.value;
      $('custom-size-field').hidden = this.value !== 'custom';
      updateMeta(); save();
    });
    $('custom-size').addEventListener('input', function () {
      state.customSize = Number(this.value) || 1200; updateMeta(); save();
    });
    $('export-bg').addEventListener('change', function () {
      state.exportBg = this.value; refreshFormatHint(); save();
    });

    $('fit-scale').addEventListener('click', function () {
      state.max = Number(this.dataset.fit) || state.max;
      syncInputs(); renderAxes(); drawChart(); save();
    });

    $('clamp-scale').addEventListener('click', function () {
      state.series.forEach(function (s) {
        s.values = s.values.map(function (v) { return Math.min(v, state.max); });
      });
      renderAxes(); drawChart(); save();
    });

    $('reset-all').addEventListener('click', function () {
      if (!confirm('Discard this chart and return every setting to its default?')) return;
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
      state = defaults();
      normalise();
      syncInputs(); renderPalettes(); renderSeries(); renderAxes();
      refreshFormatHint(); drawChart(); save();
      status($('upload-status'), 'Everything reset to defaults');
    });

    $('download').addEventListener('click', download);

    $('copy-png').addEventListener('click', function () {
      var el = $('export-status');
      status(el, 'Copying…');
      Exporter.copyPng(exportSvg(), exportSize(), null)
        .then(function () { status(el, 'PNG copied to the clipboard'); })
        .catch(function (err) { status(el, err.message, 'error'); });
    });

    /* other tabs */
    window.addEventListener('storage', function (e) {
      if (e.key === THEME_KEY && e.newValue) {
        applyTheme(e.newValue === 'light' ? 'light' : 'dark', false);
      }
      if (e.key === STATE_KEY && e.newValue) {
        load();
        syncInputs(); renderPalettes(); renderSeries(); renderAxes(); drawChart();
      }
    });

    /* follow the OS only while the user has not picked a side */
    var mq = matchMedia('(prefers-color-scheme: light)');
    var onScheme = function (e) {
      var chosen = null;
      try { chosen = localStorage.getItem(THEME_KEY); } catch (err) {}
      if (!chosen) applyTheme(e.matches ? 'light' : 'dark', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);

  }

  /* ---------- start ---------- */

  load();
  normalise();
  syncInputs();
  bind();
  renderPalettes();
  renderSeries();
  renderAxes();
  refreshFormatHint();
  applyTheme(currentTheme(), false);
  drawChart();
})();

/* ============================================================
   chart.js — builds a self-contained radar chart as SVG markup.
   Same output feeds the on-screen preview and every download,
   so what you see is exactly what lands in the file.
   Internal canvas is always 1000 × 1000 units; the caller only
   changes width/height, which keeps stroke weights proportional.
   ============================================================ */

var Nexagon = (function () {
  'use strict';

  var S = 1000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function n(v) { return Math.round(v * 100) / 100; }

  function polar(cx, cy, r, i, count) {
    var a = (-90 + (360 / count) * i) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  }

  /* Split a long label over at most two lines at a space. */
  function wrap(label, limit) {
    if (label.length <= limit) return [label];
    var words = label.split(/\s+/);
    if (words.length === 1) return [label.slice(0, limit - 1) + '…'];
    var a = '', b = '';
    for (var i = 0; i < words.length; i++) {
      if (a.length < limit - 3 && (a + ' ' + words[i]).trim().length <= limit) a = (a + ' ' + words[i]).trim();
      else b = (b + ' ' + words[i]).trim();
    }
    if (!a) { a = words[0]; b = words.slice(1).join(' '); }
    if (b.length > limit) b = b.slice(0, limit - 1) + '…';
    return b ? [a, b] : [a];
  }

  function build(cfg) {
    var attrs = cfg.attributes || [];
    var count = attrs.length;
    var out = [];

    var width = cfg.width || 1000;
    var height = cfg.height || width;

    var series = (cfg.series || []).filter(function (s) { return s.visible !== false; });
    var withLegend = cfg.showLegend && series.length > 0;
    var withTitle = cfg.showTitle && String(cfg.title || '').trim().length > 0;

    var top = withTitle ? 118 : 44;
    var bottom = withLegend ? 96 : 44;
    var boxH = S - top - bottom;
    var cx = S / 2;
    var cy = top + boxH / 2;
    var R = Math.min(boxH / 2, S / 2 - 44) * (cfg.showLabels ? 0.745 : 0.95);

    var ink = cfg.ink, dim = cfg.dim, grid = cfg.grid;
    var levels = Math.max(2, cfg.levels || 5);
    var max = cfg.max || 100;
    var sw = (cfg.strokeWidth || 2.5) * 1.4;
    var fillOp = (cfg.fillOpacity == null ? 0.28 : cfg.fillOpacity);

    var labelFont = count > 12 ? 20 : count > 8 ? 23 : 26;
    var labelLimit = count > 10 ? 15 : count > 6 ? 18 : 22;

    var fonts = "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
    var monos = "ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace";

    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'viewBox="0 0 ' + S + ' ' + S + '" width="' + width + '" height="' + height + '" ' +
      'role="img" aria-label="' + esc(cfg.title || 'Radar chart') + '">');

    if (cfg.bg) {
      out.push('<rect x="0" y="0" width="' + S + '" height="' + S + '" fill="' + cfg.bg + '"/>');
    }

    if (withTitle) {
      out.push('<text x="' + cx + '" y="76" text-anchor="middle" font-family="' + fonts +
        '" font-size="42" font-weight="600" letter-spacing="-1" fill="' + ink + '">' +
        esc(cfg.title) + '</text>');
    }

    if (count < 3) {
      out.push('<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-family="' + monos +
        '" font-size="26" fill="' + dim + '">Add at least three axes</text></svg>');
      return out.join('');
    }

    /* ---- grid ---- */
    if (cfg.showGrid) {
      out.push('<g fill="none" stroke="' + grid + '" stroke-width="1.6" stroke-linejoin="round">');
      for (var L = 1; L <= levels; L++) {
        var r = R * (L / levels);
        var last = L === levels;
        if (cfg.shape === 'circle') {
          out.push('<circle cx="' + cx + '" cy="' + n(cy) + '" r="' + n(r) + '" opacity="' + (last ? 1 : 0.55) + '"/>');
        } else {
          var pts = [];
          for (var i = 0; i < count; i++) {
            var p = polar(cx, cy, r, i, count);
            pts.push(n(p.x) + ',' + n(p.y));
          }
          out.push('<polygon points="' + pts.join(' ') + '" opacity="' + (last ? 1 : 0.55) + '"/>');
        }
      }
      var spokes = [];
      for (var s = 0; s < count; s++) {
        var sp = polar(cx, cy, R, s, count);
        spokes.push('M' + n(cx) + ' ' + n(cy) + 'L' + n(sp.x) + ' ' + n(sp.y));
      }
      out.push('<path d="' + spokes.join('') + '" opacity="0.5"/>');
      out.push('</g>');
    }

    /* ---- data ---- */
    series.forEach(function (set, si) {
      var pts = [];
      for (var i = 0; i < count; i++) {
        var v = Math.max(0, Math.min(max, Number(set.values[i]) || 0));
        var p = polar(cx, cy, R * (v / max), i, count);
        pts.push({ x: p.x, y: p.y, v: v, cos: p.cos, sin: p.sin });
      }
      var poly = pts.map(function (p) { return n(p.x) + ',' + n(p.y); }).join(' ');

      out.push('<g>');
      out.push('<polygon points="' + poly + '" fill="' + set.color + '" fill-opacity="' + fillOp +
        '" stroke="' + set.color + '" stroke-width="' + n(sw) + '" stroke-linejoin="round" stroke-linecap="round"/>');

      if (cfg.showPoints) {
        pts.forEach(function (p) {
          out.push('<circle cx="' + n(p.x) + '" cy="' + n(p.y) + '" r="' + n(sw * 1.55) +
            '" fill="' + set.color + '" stroke="' + (cfg.bg || cfg.pointRing || ink) +
            '" stroke-width="' + n(sw * 0.55) + '"/>');
        });
      }

      if (cfg.showValues) {
        pts.forEach(function (p, i) {
          /* Near the rim the number would sit on top of the axis label, so tuck it inside. */
          var pr = R * (p.v / max);
          var lp = polar(cx, cy, p.v / max > 0.78 ? pr - 34 - si * 4 : pr + 30 + si * 4, i, count);
          out.push('<text x="' + n(lp.x) + '" y="' + n(lp.y + 7) + '" text-anchor="middle" font-family="' +
            monos + '" font-size="20" font-weight="500" fill="' + set.color + '">' + n(p.v) + '</text>');
        });
      }
      out.push('</g>');
    });

    /* ---- axis labels ---- */
    if (cfg.showLabels) {
      for (var k = 0; k < count; k++) {
        var lp2 = polar(cx, cy, R + 44, k, count);
        var anchor = lp2.cos > 0.25 ? 'start' : lp2.cos < -0.25 ? 'end' : 'middle';
        var lines = wrap(String(attrs[k]), labelLimit);
        var shift = lp2.sin < -0.6 ? -lines.length * labelFont * 0.55 :
                    lp2.sin > 0.6 ? labelFont * 0.5 : -(lines.length - 1) * labelFont * 0.55;
        for (var li = 0; li < lines.length; li++) {
          out.push('<text x="' + n(lp2.x) + '" y="' + n(lp2.y + shift + li * labelFont * 1.15 + labelFont * 0.35) +
            '" text-anchor="' + anchor + '" font-family="' + fonts + '" font-size="' + labelFont +
            '" font-weight="500" fill="' + ink + '">' + esc(lines[li]) + '</text>');
        }
      }
    }

    /* ---- legend ---- */
    /* One centred row where it fits; otherwise a balanced second row, and a
       uniform shrink after that. Anything else runs off the 1000-unit canvas
       and gets clipped in the export as well as on screen. */
    if (withLegend) {
      var charW = 12.4, gapItem = 46, box = 20, gapBox = 12, lineH = 34;
      var maxW = S - 88;

      var items = series.map(function (set) {
        var label = String(set.name);
        return { name: label, color: set.color, w: box + gapBox + label.length * charW };
      });

      var rowWidth = function (list) {
        return list.reduce(function (a, it) { return a + it.w; }, 0) + gapItem * (list.length - 1);
      };

      var rows;
      if (items.length < 2 || rowWidth(items) <= maxW) {
        rows = [items];
      } else {
        var splitAt = 1, closest = Infinity;
        for (var q = 1; q < items.length; q++) {
          var diff = Math.abs(rowWidth(items.slice(0, q)) - rowWidth(items.slice(q)));
          if (diff < closest) { closest = diff; splitAt = q; }
        }
        rows = [items.slice(0, splitAt), items.slice(splitAt)];
      }

      var widest = Math.max.apply(null, rows.map(rowWidth));
      var k = Math.min(1, maxW / widest);
      var pivotY = S - bottom / 2;
      var shrink = k < 1
        ? ' transform="translate(' + n(cx) + ' ' + n(pivotY) + ') scale(' + n(k) +
          ') translate(' + n(-cx) + ' ' + n(-pivotY) + ')"'
        : '';

      out.push('<g' + shrink + ' font-family="' + monos + '" font-size="22" font-weight="500">');
      var y0 = pivotY - 4 - (rows.length - 1) * lineH / 2;
      rows.forEach(function (row, ri) {
        var x = cx - rowWidth(row) / 2;
        var y = y0 + ri * lineH;
        row.forEach(function (it) {
          out.push('<rect x="' + n(x) + '" y="' + n(y - box + 4) + '" width="' + box + '" height="' + box +
            '" rx="5" fill="' + it.color + '"/>');
          out.push('<text x="' + n(x + box + gapBox) + '" y="' + n(y) + '" fill="' + dim + '">' +
            esc(it.name) + '</text>');
          x += it.w + gapItem;
        });
      });
      out.push('</g>');
    }

    out.push('</svg>');
    return out.join('');
  }

  return { build: build, SIZE: S };
})();

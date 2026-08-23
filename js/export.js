/* ============================================================
   export.js — turns chart markup into a downloadable file.
   Raster formats go SVG string → Image → canvas → encoder,
   so nothing leaves the page and no library is needed.
   ============================================================ */

var Exporter = (function () {
  'use strict';

  var supportCache = {};

  /* Does this browser have an encoder for the format? */
  function supports(mime) {
    if (mime === 'svg' || mime === 'image/png') return true;
    if (supportCache[mime] != null) return supportCache[mime];
    var c = document.createElement('canvas');
    c.width = c.height = 2;
    var ok = false;
    try { ok = c.toDataURL(mime).indexOf('data:' + mime) === 0; } catch (e) { ok = false; }
    supportCache[mime] = ok;
    return ok;
  }

  function svgToDataUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('The chart could not be rendered to an image.')); };
      img.src = src;
    });
  }

  /* svg → Blob in the requested raster format */
  function rasterize(svg, size, mime, background) {
    return Promise.resolve()
      .then(function () { return loadImage(svgToDataUri(svg)); })
      .then(function (img) {
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        if (background) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, size, size);
        }
        ctx.drawImage(img, 0, 0, size, size);
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('This browser could not encode that format.'));
          }, mime, 0.95);
        });
      });
  }

  function svgBlob(svg) {
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  }

  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function saveText(text, filename, type) {
    save(new Blob([text], { type: type || 'text/plain;charset=utf-8' }), filename);
  }

  function copyPng(svg, size, background) {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      return Promise.reject(new Error('This browser has no image clipboard.'));
    }
    return rasterize(svg, size, 'image/png', background).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
  }

  function slug(s) {
    return String(s || 'nexagon-chart').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'nexagon-chart';
  }

  return {
    supports: supports,
    rasterize: rasterize,
    svgBlob: svgBlob,
    save: save,
    saveText: saveText,
    copyPng: copyPng,
    slug: slug
  };
})();

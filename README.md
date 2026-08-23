# Nexagon — radar chart studio

Build a radar chart, style it, download it. No build step, no dependencies, no
network calls. Everything runs in the browser and nothing leaves the device.

Live at **[radar.reizu.dev](https://radar.reizu.dev/)**.

## Run it

**Locally** — open `index.html` in any modern browser. That's it. Every path in
the site is relative, so it works from `file://`, from a subdirectory, or from a
custom domain without changes.

**Hosted** — the repository root *is* the site. Push it and point any static
host at it.

```
.
├── index.html
├── 404.html
├── CNAME                    custom domain for GitHub Pages
├── .nojekyll                serve files as-is, no Jekyll pass
├── site.webmanifest
├── robots.txt / sitemap.xml
├── css/styles.css
├── js/chart.js              SVG builder — the only thing that draws
├── js/export.js             serialisation, raster encoding, downloads
├── js/app.js                state, persistence, all controls
├── assets/                  icons + social card
├── samples/                 example files you can load
└── .github/workflows/pages.yml
```

## Deploying to GitHub Pages

Everything the deploy needs is already in the repository.

**1. Push the files.** They go at the repository root, not inside a folder.

```bash
git init
git add .
git commit -m "Nexagon"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

**2. Turn Pages on.** Settings → Pages → Build and deployment → Source →
**GitHub Actions**. The included workflow publishes the root on every push to
`main`, with no build step. If you'd rather not use Actions, pick *Deploy from a
branch* → `main` → `/ (root)` instead and delete `.github/workflows/pages.yml`.

**3. Set the custom domain.** Settings → Pages → Custom domain →
`radar.reizu.dev`. The `CNAME` file already carries that value, so this should
already be filled in after the first deploy.

**4. Check the DNS record.** At your registrar, `radar.reizu.dev` must be a
CNAME pointing at `<you>.github.io.` — your *user* domain, not the repository
URL. Verify with:

```bash
dig +short radar.reizu.dev CNAME
```

**5. Tick "Enforce HTTPS"** once the certificate is issued. That takes anywhere
from a few minutes to an hour after DNS resolves; the checkbox stays greyed out
until then.

Changing the domain later means editing four places: `CNAME`, the `canonical`
and `og:`/`twitter:` URLs in `index.html`, `robots.txt`, and `sitemap.xml`.
Nothing else hard-codes it.

## What it does

**Axes** — rename any axis inline, drag its fader to set the value, remove what
you don't need (three is the minimum, 24 the maximum). Add your own list by
uploading a file, or export the current one to reuse later.

**Data sets** — overlay up to six sets on one chart to compare profiles. Hide a
set without deleting it using the ◉ button. A set keeps its colour for life, so
reordering never reshuffles the palette.

**Reordering** — the position number on an axis row and the colour swatch on a
set row are drag handles. Drag with a mouse, pen or finger, or focus a handle
and use the up and down arrow keys; focus follows the row so you can move
something several places without reaching for the mouse. Moving an axis carries
its value in every set along with it.

**Scale** — changing the maximum never rewrites your numbers. A value above the
current scale is kept as it is and drawn at the rim, flagged with ↑ next to the
fader. A notice then offers the two ways out: *raise the scale* to fit the
largest value, or *set them to the limit*, which is the only action that
actually overwrites data. Drop the scale to 40, change your mind, put it back at
100, and the original values are still there.

**Look** — six palettes, polygon or circle grid, ring count, scale maximum,
fill opacity, line weight, and independent toggles for labels, value numbers,
grid, points, title and legend.

**Download** — PNG, JPG, WEBP, AVIF or SVG at 512 / 800 / 1024 / 1600 / 2048 /
4096 px, or a custom size. Background can match the current theme, be forced to
light or dark, or be transparent. Labels, title and legend each have their own
export toggle, so the on-screen chart can stay annotated while the file ships
clean.

Formats your browser can't encode are marked and disabled rather than failing
silently. AVIF encoding in particular is still missing from most browsers —
WEBP is the next smallest file.

## Theme

The sun/moon button flips between dark and light. The choice is written to
`localStorage` and applied before first paint, so there's no flash on reload,
and a `storage` listener mirrors it into every other open tab instantly. Until
a choice is made, the app follows the operating system setting and keeps
following it live.

The full chart state — axes, values, sets, palette, style and export
preferences — is persisted and synced the same way.

Storage keys: `nexagon.theme`, `nexagon.state.v1`.

## Importing axis lists

Three shapes are accepted; there's one of each in `samples/`.

**Plain text** — one label per line.

```
Speed
Power
Stamina
```

**CSV / TSV** — first column is the axis label. Any further columns become data
sets, and a text header row is used for their names.

```csv
Axis,Alex,Priya
Communication,72,88
Delivery,84,66
```

**JSON** — either a bare array of names, an array of `{name, value}` objects, or
the full document that the *Export .json* button produces:

```json
{
  "title": "Team review",
  "max": 100,
  "attributes": ["Communication", "Delivery"],
  "series": [{ "name": "Alex", "values": [72, 84] }]
}
```

## Customising

**Palettes** live in two places that must agree: the `html[data-palette=…]`
rules in `css/styles.css` (used for interface accents) and the `PALETTES` array
in `js/app.js` (used for the chart itself). Add an entry to both to add a
palette.

**Default axes** are the `DEFAULT_ATTRS` array in `js/app.js`.

**Chart surface colours** are `THEME_COLORS` in `js/app.js`, mirroring the
`--chart-bg` / `--ink` / `--grid` tokens in the stylesheet.

**Drawing** is entirely in `js/chart.js`. It takes a config object and returns
an SVG string on a fixed 1000 × 1000 grid, which is why stroke weights stay
proportional at every export size — and why the preview and the downloaded file
are the same artwork.

## Browser support

Anything current. Chart rendering and PNG/JPG/WEBP export work everywhere;
`Copy PNG` needs the async clipboard API, and AVIF depends on the browser
shipping an encoder.

# vendor/bike-app-astro

`build-map-style.ts` is a verbatim copy of `scripts/build-map-style.ts` from
[eljojo/bike-app-astro](https://github.com/eljojo/bike-app-astro), the
open-source whereto.bike cycling map ("Oasis in the Desert" design). It is the
style builder that `tools/generate-style.mts` imports to produce
`style-default.json` and `style-high-contrast.json`.

## Provenance

| | |
| --- | --- |
| Upstream | https://github.com/eljojo/bike-app-astro |
| Path | `scripts/build-map-style.ts` |
| Commit | `9275025ab54126322aceed4dd1d33e23f0eb5ae2` (`main`, 2026-08-01) |
| Blob SHA | `0ddfbebaef83bdc39f4d6d58a02723c80662e685` |
| Last upstream change to this file | `ebd0f9e`, 2026-07-11 |
| Vendored | 2026-09-02 |

The committed `style-*.json` files were generated on 2026-08-06, after the
last upstream change to this file — so this copy is the version they were
built from, and regenerating with it reproduces them byte for byte.

## Why it is vendored

Before this, `tools/generate-style.mts` imported the file from a sibling
checkout named `bike-app-astro-main` that had to be cloned by hand and was
absent from every fresh checkout — so nobody could regenerate the style
without going and finding it, and the build path depended on a repo this
project does not control. The copy lives here so a clone of this repo can
regenerate the style on its own.

The site itself never needed this: `style-default.json` and
`style-high-contrast.json` are committed and served as-is. This only affects
the ability to *rebuild* them (to rotate the Thunderforest API key, or to
change a base layer at its source).

## Updating it

A vendored copy is frozen — there is no `git pull` for it. To take upstream
changes, re-download the file, update the provenance table above, then run
both steps in order (see the README section "Regenerating the map style"):

```sh
npx tsx tools/generate-style.mts <THUNDERFOREST_API_KEY>
node tools/street-contrast.mjs
```

Diff the resulting `style-*.json` before committing — an upstream change can
silently alter or drop layers this map depends on.

## Licence

Upstream is AGPL-3.0. `LICENSE` in this folder is the upstream licence text,
copied alongside the code. The generated `style-*.json` files are derivative
works of it, and the map's own credits link back to the upstream project.

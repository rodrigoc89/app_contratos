# `[manual]` release checklist — walk record

The office panel's six `[manual]` scenarios (`spec.md`, R-3.5 through R-3.9)
are release-checklist entries, never passing assertions: jsdom performs no
layout and Vitest loads no stylesheets, so no number of green tests can
discharge them. This file records the walk.

**Walked**: 2026-08-13, against `master` with PRs #43/#45/#46/#47 merged.
**How**: by the maintainer in a real browser, and measured in headless
Chromium (Puppeteer, already a dependency of `apps/api`) at 360×740,
1366×768 and 1920×1080 against 26 seeded fictional contracts.

## Result

| # | Scenario | Req | Outcome |
|---|---|---|---|
| 1 | Usable at the narrow end (360px) | R-3.6 | **Fixed, then verified** — see defect 1 |
| 2 | Usable at the wide end (1920px) | R-3.6 | Pass — content capped at 1280px, no stretched column |
| 3 | Focus is genuinely visible on screen | R-3.7 | Pass — measured |
| 4 | Hover reads correctly to a mouse user | R-3.8 | Pass — measured |
| 5 | Real controls are comfortably tappable | R-3.5 | Pass |
| 6 | Pagination stays reachable at the narrow end | R-3.9 | **Fixed, then verified** — see defect 2 |
| — | Every control hit first time on a touch notebook | R-3.5 | **NOT VERIFIED** — see below |

## Two defects the walk found, that the test suite could not

**1. 132px of invisible horizontal overflow below 640px (R-3.6).** At 360px
the document's `scrollWidth` measured **492** against a 360px viewport. The
visually-hidden `thead` was `position: absolute` with no positioned ancestor,
so its containing block was the initial containing block: it escaped the
table's own `overflow-x: auto` region and widened the page. `clip-path`
hides an element's pixels and leaves its layout intact, and the sr-only
recipe's usual containment is banned by this repo's first CSS guard — the one
protecting the document viewer's reading gate. Fixed by displacing the header
horizontally instead. Re-measured: **360 against 360**.

Note the shape of this one: **a correct guard caused the defect**, by pushing
the author onto a substitute that does not do the same job.

**2. The paginator sat far below the fold (R-3.9).** At 1366×768 it landed at
y=1386 — 618px down — so changing page meant scrolling past the entire list
first. `DESIGN.md` D14 predicted the row count exactly and accepted this,
explicitly rejecting a sticky paginator to save ~72px. First contact with the
built screen overruled that: the maintainer reported it as broken within
seconds of use.

Two changes, in this order. Page size 20 → 10 **in the web only** (the API
default stays 20 — how many rows fit a screen is presentation, not an API
contract). That alone fixed 1920×1080 but left the paginator 177px below the
fold at 1366×768, and the arithmetic showed no useful page size would clear
it. So the paginator became `position: sticky`, reversing D14 on measurement
D14 did not have.

## Measurements

Keyboard (R-3.7), at 1366×768 — 10 tab stops, in reading order:

```
 1. input   search box            focus ring solid 3px    tabIndex=0
 2. button  Borrador              focus ring solid 3px    tabIndex=0
 3. button  Vigente               focus ring solid 3px    tabIndex=0
 4. button  Dado de baja          focus ring solid 3px    tabIndex=0
 5. button  Anulado               focus ring solid 3px    tabIndex=0
 6. div     table scroll region   focus ring solid 3px    tabIndex=0
 7. button  1                     focus ring solid 3px    tabIndex=0
 8. button  2                     focus ring solid 3px    tabIndex=0
 9. button  3                     focus ring solid 3px    tabIndex=0
10. button  Página siguiente      focus ring solid 3px    tabIndex=0
```

No element carries `tabIndex > 0`; no stop lacks a visible ring. `Página
anterior` is correctly absent — it is disabled on page 1.

Pointer (R-3.8) — the distinction rows must never blur:

| Element | cursor | background on hover | underline |
|---|---|---|---|
| table row | `auto` | tints | none |
| pagination button | `pointer` | darkens | none |

A row tints without ever claiming to be actionable, which matters because no
office contract-detail screen exists to click through to.

Sticky paginator (R-3.9), at 1366×768:

| Scroll position | Paginator rect (viewport 768) | Visible | Covers last row |
|---|---|---|---|
| top | 677–768 | yes, 5/5 buttons | no |
| bottom | 677–768 | yes, 5/5 buttons | no |

Buttons falling outside the viewport, before and after the whole walk:

| Viewport | Before | After |
|---|---|---|
| 360×740 | 2 | **0** |
| 1366×768 | 5 | **0** |
| 1920×1080 | 4 | **0** |

No horizontal overflow at any of the three.

## The item that was not verified

**"Every control hit on the first attempt on a touch-screen notebook"
(R-3.5) was not tested. No touch-screen notebook was available.**

The maintainer scoped it out on the grounds that the office panel is used on
desktops and notebooks with a mouse, while touch input belongs to the
técnico's tablet flow — which this change does not touch and which has its
own coverage.

That is a reasonable call about a known deployment, and it is recorded here
rather than ticked, because an unwalked scenario marked "pass" is worse than
one marked "not run". If the office ever moves to touch-screen notebooks,
this is the scenario to walk before trusting the screen there. The 48px
minimum target is enforced by `convencionesDeEstilos.spec.ts` regardless, so
the sizing is guarded even though the ergonomics are unverified.

## Reproducing the walk

The diagnostics were deliberately not committed — they depend on seeded demo
data and a running dev server. To repeat it: start Postgres, seed the users
and some fictional contracts, run `apps/api` and `apps/web`, then drive the
panel with Puppeteer, measuring `document.scrollingElement.scrollWidth`
against `window.innerWidth` and each control's `getBoundingClientRect()`
against the viewport. Measuring beats screenshotting: the 132px overflow was
invisible in every screenshot taken of it.

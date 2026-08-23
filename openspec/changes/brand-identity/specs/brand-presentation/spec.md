# Brand Presentation Specification

## Purpose

Where the IES.NET mark appears inside the running UI — the session header
and the login screen — and the contrast rule that governs brand blue
wherever it carries text or a control, so `#008bff` (3.42:1 on white, fails
WCAG) never lands on readable text. Out of scope: a repaint of the green
palette, and flat button/form styling (`organismos.css:143-153`), neither of
which this capability touches.

## Requirements

### Requirement: Session header wordmark

`CabeceraDeSesion` MUST render the IES.NET Contratos wordmark alongside the
existing username and "Cerrar sesión" button, on every authenticated screen
(técnico tablet and office panel share this component).

#### Scenario: wordmark renders next to the existing controls

- GIVEN `CabeceraDeSesion` is rendered with a signed-in user
- WHEN the header mounts
- THEN an element naming "IES.NET" (text or an image with an accessible name
  matching `/IES\.NET/`) is present in the header
- AND the existing username text and the "Cerrar sesión" button still render
  (regression: neither is displaced)

### Requirement: Login screen wordmark

`PaginaLogin` MUST render the wordmark above the existing
`<h1>Ingresar</h1>` heading.

#### Scenario: wordmark precedes the heading

- GIVEN `PaginaLogin` is rendered
- WHEN the form mounts
- THEN an element naming "IES.NET" appears before the `<h1>` in document order
- AND the heading still reads "Ingresar" (regression)

### Requirement: Brand-blue contrast rule

No shipped CSS rule's resolved text or interactive-control colour (`color`
or `border-color` on a selector that carries readable text or matches this
project's existing interactive-selector detection) MAY equal `#008bff`.
Where blue carries text or a control, it MUST resolve to a value with a WCAG
contrast ratio of at least 4.5:1 against `#ffffff` — `#0076d9` (4.57:1)
satisfies this. `#008bff` MAY still be used as a non-text, large-scale mark
(the icon, or a logo image's fill) — the rule scopes to text/control
selectors, not to decorative marks.

#### Scenario: a new contrast guard exists and passes

- GIVEN the shipped stylesheets under `apps/web/src/estilos/`
- WHEN a new guard in `convencionesDeEstilos.spec.ts` resolves every declared
  `color`/`border-color` value via the existing `valorDeColor`/`contraste`
  helpers (the same pattern as the estado-chip contrast test)
- THEN no resolved value on a text or interactive-control selector equals `#008bff`
- AND every resolved brand-blue value on such a selector has a computed
  contrast ratio ≥ 4.5:1 against `#ffffff`

#### Scenario: a regression is caught

- GIVEN a hypothetical CSS rule sets `color: #008bff` on a text or control
  selector (e.g. a link or button)
- WHEN the guard runs
- THEN the test fails, naming the offending selector and its computed ratio

#### Scenario: the icon and wordmark mark are exempt

- GIVEN the icon asset and any wordmark rendered as a large, non-text mark
  (an image, not live CSS text)
- WHEN the guard scans CSS
- THEN it MUST NOT flag `#008bff` used only as that mark's fill — the guard
  scopes to text/control selectors, not to decorative or image-based marks

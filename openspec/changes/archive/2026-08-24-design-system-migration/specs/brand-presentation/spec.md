# Delta for Brand Presentation

## MODIFIED Requirements

### Requirement: Brand-blue contrast rule

No resolved text or interactive-control colour — whether declared in the
compiled `@theme` token layer or reached through a Tailwind utility class
bound to it in JSX/`cva` (e.g. `text-marca-azul`) — MAY equal `#008bff`.
Where blue carries text or a control, it MUST resolve to a value with a WCAG
contrast ratio of at least 4.5:1 against `#ffffff` — `#0076d9` (4.57:1)
satisfies this. `#008bff` MAY still be used as a non-text, large-scale mark
(the icon, or a logo image's fill) — the rule scopes to text/control usage,
not to decorative marks.

(Previously: bound to "the shipped stylesheets under
`apps/web/src/estilos/`" and a CSS-selector scan; the migration removes
those hand-authored BEM sheets, so the mechanism moves to the `@theme`
token layer and Tailwind class-name resolution in JSX/`cva`.)

#### Scenario: a rebuilt contrast guard exists and passes

- GIVEN the compiled `@theme` token block and every component's JSX/`cva`
  variant map
- WHEN a rebuilt guard resolves every colour used as text or
  interactive-control colour — via the `@theme` custom-property map, using
  the same `valorDeColor`/`contraste` resolvers ported to read Tailwind
  class names instead of CSS selectors
- THEN no resolved value on a text or interactive-control usage equals
  `#008bff`
- AND every resolved brand-blue usage has a computed contrast ratio ≥ 4.5:1
  against `#ffffff`

#### Scenario: a regression is caught

- GIVEN a hypothetical component applies a Tailwind class bound to
  `#008bff` (e.g. `text-marca-azul` where `--color-marca-azul: #008bff`) to
  a text or interactive-control element
- WHEN the rebuilt guard runs
- THEN the test fails, naming the offending component/class and its
  computed ratio

#### Scenario: the raw brand blue never reaches the token layer or a stylesheet at all

- GIVEN D1's decision that the wordmark ships as live text, leaving the raw
  `#008bff` to exist only inside the raster icon assets
- WHEN the `@theme` token block and every remaining compiled CSS output are
  scanned
- THEN none of them contains the literal value `#008bff` — so the mark is
  outside the guard's reach by construction, not by a scoping rule the
  guard would have to implement and could silently lose

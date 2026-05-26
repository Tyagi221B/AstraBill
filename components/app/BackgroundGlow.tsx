/**
 * BackgroundGlow — the ambient depth layer behind the authed app shell.
 *
 * Two large blurred radial gradients positioned in opposite corners of
 * the viewport. The effect is intentionally quiet: cool tones (indigo +
 * sky) complement — not match — the warm-paper background, giving the
 * surface a sense of depth without ever competing with content.
 *
 * Lives behind everything (z-index: 0, pointer-events: none) and never
 * scrolls with the page — `app-glow` is `position: fixed` with `contain:
 * strict` so the blur doesn't trigger expensive repaints. All the actual
 * styling lives in `app/globals.css` under the `Background glow` section
 * so the dark-theme variant flows through the token system automatically.
 *
 * Rendered once by `BrandedAppShell` so every authed page gets the wash
 * without re-mounting on navigation.
 */
export function BackgroundGlow() {
  return <div aria-hidden className="app-glow" />;
}

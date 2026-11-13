# US-ACCOUNT-13 — Change my theme preference

As a visitor, I want to switch between light and dark themes so that the interface matches my preference.

**Status:** Current in Hypermedia and Inertia React; source-reviewed, not runtime-tested here.
**Access:** Anyone who can open a page with the Hypermedia or React theme control and JavaScript enabled.
**Entry:** Use the theme toggle in Hypermedia or React app and marketing layouts.
**Documentation:** [Hypermedia app](../../apps/hypermedia/README.md), [React app](../../apps/inertia-react/README.md).
**Source:** [Hypermedia toggle](../../apps/hypermedia/resources/views/components/theme_toggle.edge), [theme persistence](../../apps/hypermedia/resources/js/app.js), [React toggle](../../apps/inertia-react/inertia/components/theme_toggle.tsx).

## Acceptance criteria

- The control label is **Switch to dark theme** in light mode and **Switch to light theme** in dark mode. Initial state comes from the saved `app_theme` cookie, defaulting to light when absent.
- Selecting it updates document `data-theme` and stores `app_theme` in a one-year, path-wide, SameSite=Lax cookie. This is a device-local preference, not an account setting.
- The toggle requires JavaScript: Hypermedia hides its Alpine control with `x-cloak` until initialized; React requires its client click handler. No account record is written.
- Hypermedia and React expose this toggle. Vue reads the cookie for its theme but does not expose the toggle.

## User flow

```mermaid
flowchart TD
    A["Open a Hypermedia or React page"] --> J{"JavaScript available?"}
    J -->|No| K["No working theme toggle; retain rendered theme"]
    J -->|Yes| B{"Current saved theme, or light by default?"}
    B -->|Light| C["Choose Switch to dark theme"]
    B -->|Dark| D["Choose Switch to light theme"]
    C --> E["Page changes theme and remembers it on this device"]
    D --> E
```

## Code flow

```mermaid
flowchart TD
    A["Hypermedia theme_toggle.edge reads app_theme with light default"] --> B["Alpine themeToggle.init reads data-initial-theme"]
    F["React InertiaMiddleware.share reads app_theme with light default"] --> G["ThemeToggle uses page.props.preferences.theme"]
    B --> C["JavaScript toggle handler changes local theme"]
    G --> C
    C --> D["Set documentElement data-theme"]
    D --> E["Write app_theme cookie for one year, path /, SameSite=Lax"]
```

**Code references:** [Hypermedia toggle](../../apps/hypermedia/resources/views/components/theme_toggle.edge), [Hypermedia JS](../../apps/hypermedia/resources/js/app.js), [React toggle](../../apps/inertia-react/inertia/components/theme_toggle.tsx), [React shared preference producer](../../apps/inertia-react/app/middleware/inertia_middleware.ts), [React layout](../../apps/inertia-react/inertia/layouts/app.tsx), [Vue layout cookie reader](../../apps/inertia-vue/resources/views/inertia_layout.edge).

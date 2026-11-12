# US-ACCOUNT-13 — Change my theme preference

As a visitor, I want to switch between light and dark themes so that the interface matches my preference.

**Status:** Current in Hypermedia and Inertia React; source-reviewed, not runtime-tested here.
**Access:** Anyone who can open a page with the theme control.
**Entry:** Use the theme toggle in Hypermedia or React app and marketing layouts.
**Documentation:** [Hypermedia app](../../apps/hypermedia/README.md), [React app](../../apps/inertia-react/README.md).
**Source:** [Hypermedia toggle](../../apps/hypermedia/resources/views/components/theme_toggle.edge), [theme persistence](../../apps/hypermedia/resources/js/app.js), [React toggle](../../apps/inertia-react/inertia/components/theme_toggle.tsx).

## Acceptance criteria

- The control label is **Switch to dark theme** in light mode and **Switch to light theme** in dark mode. Both implementations default to light.
- Selecting it updates document `data-theme` and stores `app_theme` in a one-year, path-wide, SameSite=Lax cookie. This is a device-local preference, not an account setting.
- Hypermedia and React expose this toggle. Vue reads the cookie for its theme but does not expose the toggle.

## User flow

```mermaid
flowchart TD
    A["Open a page with the theme toggle"] --> B{"Current theme?"}
    B -->|Light| C["Choose Switch to dark theme"]
    B -->|Dark| D["Choose Switch to light theme"]
    C --> E["Page changes theme and remembers it on this device"]
    D --> E
```

## Code flow

```mermaid
flowchart TD
    A["Hypermedia toggle or React ThemeToggle"] --> B["Read app_theme cookie; default to light"]
    B --> C["User switches theme"]
    C --> D["Set documentElement data-theme"]
    D --> E["Write app_theme cookie for one year, path /, SameSite=Lax"]
```

**Code references:** [Hypermedia toggle](../../apps/hypermedia/resources/views/components/theme_toggle.edge), [Hypermedia JS](../../apps/hypermedia/resources/js/app.js), [React toggle](../../apps/inertia-react/inertia/components/theme_toggle.tsx), [React layout](../../apps/inertia-react/inertia/layouts/app.tsx), [Vue layout cookie reader](../../apps/inertia-vue/resources/views/inertia_layout.edge).

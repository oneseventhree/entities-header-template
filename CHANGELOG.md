# Changelog

## V1.2

- Keep the last rendered header visible while editing the fallback title or entity rows, preventing a temporary switch to the native header.
- Use the current rendered title when reconfiguring the underlying Entities card.
- Ignore outdated template results and finish resubscribing after rapid template edits.

## V1.1

- Keep fallback and live template titles in the same styled header text element, so they inherit the same font size, weight and alignment.
- Avoid replacing the outer header if Home Assistant has not rendered its text element yet.

## V1.0

Initial stable release of Entities Header Template.

- Live Jinja2-powered headers for Home Assistant's native Entities card.
- Optional fallback title, including consistent styling and alignment with the rendered header.
- Optional centred header text.
- Header tap, hold and double-tap actions.
- Collapsible visual editor for templates and interactions.
- Compatibility with native and custom entity rows.


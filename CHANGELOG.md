# Changelog

## V1.12

- Remove the automatic first-row spacing adjustment introduced in V1.8. Live diagnostics showed it added approximately 22px of unwanted spacing on templated cards versus native Entities cards.
- Let Home Assistant position icons, labels and rows naturally, including custom multiple-entity rows, without changing the first-row margin.
- Remove the associated animation-frame retry, MutationObserver and ResizeObserver spacing logic.
- Keep header templates, fallback titles, horizontal centring, actions, and card_mod compatibility unchanged.
- Add regression tests verifying the native row margin is not modified.

## V1.11

- Align the first visible entity row's icon badge to a consistent position beneath the header across cards.
- Use the icon's location instead of the entity name, since secondary text and multiple-entity rows change text positioning independently.
- Retain the 20px header-to-first-icon target and the existing relative spacing between entity rows.
- Skip adjustments for unsupported first rows rather than shift an unrelated entity row.

## V1.10

- Reduce the target gap between the bottom of the header title and the top of the first entity name from 36px to 20px.
- Retain first-row layout detection and all existing font, centering, and subsequent row styling.

## V1.9

- Fix inconsistent space between the header and first entity caused by V1.8 measuring rows before Home Assistant finished rendering.
- Retry initial row measurement for a limited time and measure the visible first line instead of its multiline info container.
- Allow the full normal spacing adjustment rather than stopping at the old 48px limit.
- Recalculate for changed/hidden rows while ignoring the card's own spacing changes to prevent feedback loops.
- Add tests for delayed row rendering, wide initial gaps and first-line label placement.

## V1.8

- Keep a consistent 36px gap between the bottom of the header text and the top of the first visible entity name, whether its row has secondary text or not.
- Measure the first row in the rendered card, supporting Home Assistant native rows, multiple-entity-row and visible template-entity-row names.
- Adjust the entity rows as a group, retaining their relative spacing, internal alignment and existing header style.
- Recalculate after relevant entity changes and resize, and disconnect observers when the card is removed.
- Leave unsupported first-row types at their normal native spacing rather than shifting unrelated rows.

## V1.7

- Restore the native Home Assistant Entities card header's vertical positioning and padding.
- Remove artificial title translation and vertical alignment overrides that could move the heading into the first entity row.
- Keep the live template and fallback title in the same native header, with optional horizontal centring and existing custom font styling.

## V1.6

- Restore the previous approximately 20px top-to-title spacing from V1.4, undoing V1.5's additional downward offset.
- Preserve the existing header font, centering, fallback styling and entity-row layout.

## V1.5

- Move the header text down by a total of 11px from its original position, targeting approximately 30px between the card top and the title in the supplied screenshot.
- Keep the entity rows, header font size and horizontal alignment unchanged.

## V1.4

- Move the header text down by 1px to make the spacing above it closer to 20px, without altering the card height, font, or entity rows.
- Apply the same adjustment to live template and fallback text for centred and non-centred headers.

## V1.3

- Prevent the visual editor from rebuilding the card on each fallback-title keystroke.
- Apply fallback title changes when the text field loses focus, keeping the live header style stable while typing.
- Preserve unsaved fallback text during editor synchronisation and add regression tests.

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


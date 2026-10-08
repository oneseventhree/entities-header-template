# Entities Header Template

A Home Assistant dashboard custom card that combines the standard **Entities** card with a live, Jinja2-powered header. Entity rows are rendered by Home Assistant's existing Entities card, so built-in rows and separately installed custom rows work normally.

The header uses Home Assistant's `render_template` WebSocket subscription to update when referenced entities change.

## Features

- Live Jinja2 title template.
- Optional fallback title displayed while the template loads, or if it is empty or fails.
- Optional centered header with space reserved for the header toggle.
- Optional tap, hold, and double-tap actions on the header.
- Visual editor with a collapsible **Header template** section, nested **Interactions** section, and Home Assistant's standard Entities row editor.
- Pass-through support for standard Entities card options, including `show_header_toggle` and `state_color`.

## Installation with HACS

1. Open **HACS** in Home Assistant.
2. Open the top-right menu and choose **Custom repositories**.
3. Add `https://github.com/oneseventhree/entities-header-template` as a **Dashboard** repository.
4. Find **Entities Header Template** in HACS and install it.
5. Reload the Home Assistant frontend if prompted. If the resource is not added automatically, register the JavaScript module listed below under dashboard resources.
6. Edit a dashboard and add the **Entities Header Template** card, or use YAML.

> This is a **Dashboard** card, not an integration with a `custom_components` directory.

## Manual installation

Save `entities-header-template.js` to:

```text
/config/www/community/entities-header-template/entities-header-template.js
```

Add this dashboard **JavaScript module** resource if not already registered:

```text
/local/community/entities-header-template/entities-header-template.js
```

For manual updates, hard-reload the browser or change a cache-busting query string on the resource URL.

## Basic example

```yaml
type: custom:entities-header-template
title_template: >-
  Living room: {{ states('sensor.example_temperature') }} °C
fallback_title: Living room
center_header_template: true
show_header_toggle: false
entities:
  - entity: light.example_light
    name: Main light
  - entity: switch.example_switch
    name: Power
```

Replace the example entity IDs with entities from your Home Assistant instance.

## Header interactions example

```yaml
type: custom:entities-header-template
title_template: "Lights: {{ states('sensor.example_light_count') }}"
fallback_title: Lights
show_header_actions: true
tap_action:
  action: more-info
  entity: light.example_light
hold_action:
  action: navigate
  navigation_path: /lovelace/lights
double_tap_action:
  action: none
entities:
  - entity: light.example_light
```

When `show_header_actions` is `false` (the default), header actions do not run. A `more-info` or `toggle` action needs an entity via its own `entity` / `entity_id` / `target.entity_id`, or the card's top-level `entity`.

## Configuration

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | Yes | | `custom:entities-header-template` |
| `title_template` | string | Yes | | Jinja2 template for the header |
| `entities` | list | Yes | | Standard Entities card rows; custom rows require their own installation |
| `fallback_title` | string | No | Empty | Plain title while loading or on empty/error result |
| `center_header_template` | boolean | No | `false` | Center header text |
| `show_header_actions` | boolean | No | `false` | Enable actions on the header |
| `tap_action` | action | No | `none` | Tap action |
| `hold_action` | action | No | `none` | Hold action |
| `double_tap_action` | action | No | `none` | Double-tap action |
| `show_header_toggle` | boolean | No | HA default | Standard Entities card option |
| `state_color` | boolean | No | HA default | Standard Entities card option |
| Other Entities card options | varies | No | HA default | Passed through to the Entities card |

Supported action types: `none`, `more-info`, `toggle`, `navigate`, `url`, `perform-action` (also `call-service`), and `assist`.

## How fallback titles work

The fallback is the native title of the wrapped Entities card and is visible immediately. When the template resolves successfully, its result replaces the fallback in the same header element. This means a brief fallback-to-template transition can occur during normal loading. Set the fallback close to the base text of the template to reduce the visible change.

## Compatibility and notes

- Designed for Home Assistant dashboards using the native Entities card and its visual editor.
- Custom row types such as `custom:template-entity-row` are **not bundled** and must be installed separately.
- The card uses Home Assistant frontend internals such as `hui-entities-card`. Future frontend changes may require updates.
- This repository contains the JavaScript dashboard card only. No backend Home Assistant integration is installed.
- If your dashboard uses YAML-managed resources, add the resource in the appropriate YAML configuration instead of the Resources UI.

## Support

If a problem occurs, include your Home Assistant version, steps to reproduce, and the relevant browser console error when opening a GitHub issue. Replace private URLs, entity IDs, and device identifiers before posting diagnostics.

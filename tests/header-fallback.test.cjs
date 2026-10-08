const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "entities-header-template.js"),
  "utf8"
);
const elements = new Map();
const context = {
  HTMLElement: class {},
  customElements: {
    define(name, constructor) { elements.set(name, constructor); },
    get(name) { return elements.get(name); }
  },
  window: { customCards: [] },
  console: { info() {} },
  requestAnimationFrame(callback) { callback(); }
};
vm.runInNewContext(source, context, { filename: "entities-header-template.js" });

const Header = elements.get("entities-header-template");
const Editor = elements.get("entities-header-template-editor");

test("fallback draft is committed once on blur, not while typing", () => {
  const editor = new Editor();
  editor._config = { fallback_title: "Home" };
  let changes = 0;
  editor._fire = () => { changes += 1; };

  editor._fallbackDraft = "Home: Away";
  assert.equal(editor._config.fallback_title, "Home");
  assert.equal(changes, 0);

  editor._commitFallbackTitle();
  assert.equal(editor._config.fallback_title, "Home: Away");
  assert.equal(editor._fallbackDraft, null);
  assert.equal(changes, 1);

  editor._commitFallbackTitle();
  assert.equal(changes, 1);
});

test("clearing fallback commits and removes the optional key", () => {
  const editor = new Editor();
  editor._config = { fallback_title: "Home" };
  let changes = 0;
  editor._fire = () => { changes += 1; };
  editor._fallbackDraft = "";
  editor._commitFallbackTitle();
  assert.equal(Object.hasOwn(editor._config, "fallback_title"), false);
  assert.equal(changes, 1);
});

test("fallback edits never reconfigure native header when a live title exists", () => {
  const card = new Header();
  const forwarded = [];
  card._card = {
    shadowRoot: null,
    setConfig(config) { forwarded.push(config); }
  };
  card._setHeaderText = () => {};
  card._bindHeaderActions = () => {};
  card._subscribeTemplate = () => {};
  const base = { title_template: "Home", entities: [] };

  card.setConfig({ ...base, fallback_title: "Home" });
  card._renderedTitle = "Home: Away";
  card.setConfig({ ...base, fallback_title: "Home: Away" });
  assert.equal(forwarded.length, 2);

  card.setConfig({ ...base, fallback_title: "Home: Away--" });
  assert.equal(forwarded.length, 2);
  assert.equal(forwarded[1].title, "Home: Away");
});

test("fallback editing listens for blur instead of emitting config per keystroke", () => {
  const start = source.indexOf('this._fallbackSelector.addEventListener("value-changed"');
  const stop = source.indexOf("if (this._fallbackField)", start);
  const handler = source.slice(start, stop);
  assert.ok(start > 0 && stop > start);
  assert.ok(handler.includes("this._fallbackDraft ="));
  assert.ok(handler.includes('addEventListener("focusout"'));
  assert.ok(!handler.includes("this._fire()"));
});

test("template header preserves native vertical position and padding", () => {
  const start = source.indexOf("  _applyHeaderStyle() {");
  const stop = source.indexOf("\n}\nclass EntitiesHeaderTemplateEditor", start);
  const style = source.slice(start, stop);
  assert.ok(start > 0 && stop > start);
  assert.ok(!style.includes("translateY("));
  assert.ok(!style.includes("padding-top:"));
  assert.ok(!style.includes("padding-bottom:"));
  assert.ok(!style.includes("padding-left: 48px"));
  assert.ok(!style.includes("padding-right: 48px"));
  assert.ok(!style.includes("align-items: center !important"));
  assert.ok(style.includes("text-align: center !important"));
  assert.ok(source.includes('const ENTITIES_HEADER_TEMPLATE_VERSION = "1.7";'));
});

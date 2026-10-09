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
const frames = new Map();
let frameId = 0;
const context = {
  HTMLElement: class {},
  customElements: {
    define(name, constructor) { elements.set(name, constructor); },
    get(name) { return elements.get(name); }
  },
  window: { customCards: [] },
  console: { info() {} },
  requestAnimationFrame(callback) {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) { frames.delete(id); },
  getComputedStyle() { return { marginTop: "0px" }; },
  document: {
    createRange() {
      let textNode = null;
      return {
        selectNodeContents(node) { textNode = node; },
        getBoundingClientRect() { return textNode.rect(); }
      };
    }
  }
};
vm.runInNewContext(source, context, { filename: "entities-header-template.js" });

const Header = elements.get("entities-header-template");
const Editor = elements.get("entities-header-template-editor");
function runFrames(max = 100) {
  let count = 0;
  while (frames.size && count < max) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback();
    count++;
  }
  return count;
}

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
  assert.ok(source.includes('const ENTITIES_HEADER_TEMPLATE_VERSION = "1.11";'));
});

function makeFirstRowFixture(firstGap, textOffset = 0) {
  const states = {
    style: { marginTop: "" },
    children: []
  };
  const header = {
    getBoundingClientRect: () => ({ bottom: 100 }),
    getClientRects: () => [{}]
  };
  const icon = {
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({
      top: 100 + firstGap + (parseFloat(states.style.marginTop) || 0),
      height: 40
    })
  };
  const name = {
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({
      top: icon.getBoundingClientRect().top + textOffset
    })
  };
  const row = {
    localName: "div",
    hidden: false,
    style: { display: "" },
    getClientRects: () => [{}],
    children: [{
      localName: "hui-generic-entity-row",
      shadowRoot: {
        querySelector: (selector) => selector === ".row > state-badge" ? icon :
          selector === ".info" ? name : null,
        children: []
      },
      children: []
    }]
  };
  states.children = [row];
  const card = new Header();
  card._card = {
    shadowRoot: {
      querySelector: (selector) => ({
        "#states": states,
        ".card-header .name": header
      })[selector] || null
    }
  };
  return { card, states, header, icon, name, row };
}

test("align first-row icon badges regardless of label or secondary-text offset", () => {
  const office = makeFirstRowFixture(52, 0);
  const home = makeFirstRowFixture(12, -8);
  const living = makeFirstRowFixture(30, 6);
  const fixtures = [office, home, living];
  fixtures.forEach(({card}) => card._updateFirstRowSpacing());
  const gap = ({ icon, header }) =>
    icon.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  fixtures.forEach((fixture) => assert.equal(gap(fixture), 20));
  assert.equal(parseFloat(office.states.style.marginTop), -32);
  assert.equal(parseFloat(home.states.style.marginTop), 8);
  assert.equal(parseFloat(living.states.style.marginTop), -10);
  // Text positions remain native to each row instead of being forced to match.
  assert.equal(home.name.getBoundingClientRect().top -
    home.icon.getBoundingClientRect().top, -8);
  fixtures.forEach(({card, states}) => {
    card._clearFirstRowSpacing();
    assert.equal(states.style.marginTop, "");
  });
});

test("missing first row icon leaves native spacing intact", () => {
  const fixture = makeFirstRowFixture(52);
  fixture.row.children = [];
  fixture.card._updateFirstRowSpacing();
  assert.equal(fixture.states.style.marginTop, "");
  fixture.card._clearFirstRowSpacing();
});

test("custom rows use the visible nested state badge, not hidden staging", () => {
  const card = new Header();
  const visible = { getClientRects: () => [{}] };
  const staging = { getClientRects: () => [] };
  const customRow = {
    localName: "template-entity-row",
    shadowRoot: {
      querySelector: () => null,
      children: [{
        localName: "hui-generic-entity-row",
        shadowRoot: {
          querySelector: (selector) =>
            selector === ".row > state-badge" ? staging : null,
          children: []
        },
        children: []
      }, {
        localName: "hui-generic-entity-row",
        shadowRoot: {
          querySelector: (selector) =>
            selector === ".row > state-badge" ? visible : null,
          children: []
        },
        children: []
      }]
    },
    children: []
  };
  assert.equal(card._findFirstRowIcon(customRow), visible);
});

test("unsupported first visible row does not shift later rows", () => {
  const fixture = makeFirstRowFixture(18);
  const unsupported = {
    localName: "custom-unsupported-row",
    hidden: false,
    style: { display: "" },
    getClientRects: () => [{}],
    children: []
  };
  fixture.states.children.unshift(unsupported);
  fixture.card._updateFirstRowSpacing();
  assert.equal(fixture.states.style.marginTop, "");
  fixture.card._clearFirstRowSpacing();
});

test("large native header gaps are corrected beyond the old 48px limit", () => {
  const fixture = makeFirstRowFixture(116);
  fixture.card._updateFirstRowSpacing();
  assert.equal(parseFloat(fixture.states.style.marginTop), -96);
  assert.equal(
    fixture.icon.getBoundingClientRect().top - fixture.header.getBoundingClientRect().bottom,
    20
  );
  fixture.card._clearFirstRowSpacing();
});

test("first visible row is retried if it finishes rendering a few frames later", () => {
  runFrames();
  const fixture = makeFirstRowFixture(104);
  const root = fixture.card._card.shadowRoot;
  const originalLookup = root.querySelector;
  let ready = false;
  root.querySelector = (selector) => ready ? originalLookup(selector) : null;
  fixture.card._scheduleFirstRowSpacing();
  runFrames(3);
  assert.equal(fixture.states.style.marginTop, "");
  ready = true;
  runFrames(5);
  assert.equal(parseFloat(fixture.states.style.marginTop), -84);
  fixture.card._clearFirstRowSpacing();
});

test("text height changes do not alter an already aligned icon position", () => {
  const fixture = makeFirstRowFixture(48, -8);
  fixture.card._updateFirstRowSpacing();
  assert.equal(parseFloat(fixture.states.style.marginTop), -28);
  fixture.name.getBoundingClientRect = () => ({
    top: fixture.icon.getBoundingClientRect().top + 21
  });
  fixture.card._updateFirstRowSpacing();
  assert.equal(parseFloat(fixture.states.style.marginTop), -28);
  fixture.card._clearFirstRowSpacing();
});

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
  assert.ok(source.includes('const ENTITIES_HEADER_TEMPLATE_VERSION = "1.16";'));
});

test("native first-row spacing is never modified during configuration or refresh", () => {
  const card = new Header();
  const states = { style: { marginTop: "" } };
  const forwarded = [];
  card._card = {
    shadowRoot: {
      querySelector(selector) {
        return selector === "#states" ? states : null;
      }
    },
    setConfig(config) { forwarded.push(config); }
  };
  card._applyHeaderStyle = () => {};
  card._setHeaderText = () => {};
  card._bindHeaderActions = () => {};
  card._subscribeTemplate = () => {};

  const config = {
    title_template: "Living Room",
    fallback_title: "Living Room",
    center_header_template: true,
    entities: [{ entity: "light.example" }],
    card_mod: { style: ".card-header { padding: 5px !important; }" }
  };
  card.setConfig(config);
  runFrames();
  card.hass = { states: {} };
  runFrames();
  assert.equal(states.style.marginTop, "");
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].title, "Living Room");
  assert.equal(forwarded[0].card_mod.style, config.card_mod.style);
  assert.equal(Object.hasOwn(card, "_spacingOffset"), false);
});

test("first row remains natively positioned regardless of icon and text geometry", () => {
  for (const iconTop of [90, 120, 155]) {
    const card = new Header();
    const states = {
      style: { marginTop: "" },
      children: [{ iconTop }]
    };
    card._card = {
      shadowRoot: { querySelector: () => states },
      setConfig() {}
    };
    card._applyHeaderStyle = () => {};
    card._setHeaderText = () => {};
    card._bindHeaderActions = () => {};
    card._subscribeTemplate = () => {};
    card.setConfig({ title_template: "Room", entities: [{}] });
    runFrames();
    assert.equal(states.style.marginTop, "");
  }
});

test("no spacing corrections or observers remain in the card runtime", () => {
  for (const obsolete of [
    "ENTITIES_HEADER_TEMPLATE_FIRST_ICON_GAP",
    "_scheduleFirstRowSpacing",
    "_updateFirstRowSpacing",
    "_clearFirstRowSpacing",
    "_spacingOffset",
    "states.style.marginTop",
    "ResizeObserver",
    "MutationObserver"
  ]) {
    assert.equal(source.includes(obsolete), false, obsolete);
  }
});

test("first visible conditional entity has native header-to-row spacing", () => {
  assert.ok(!source.includes("firstConditionalRowStyle"));
  assert.ok(!source.includes("padding-block-start: 6px"));
  assert.ok(!source.includes("combinedStyleText"));
  assert.ok(source.includes("style.textContent = styleText;"));
  assert.ok(!source.includes("states.style.marginTop"));
});

test("conditional spacing uses CSS without observers or animation polling", () => {
  for (const obsolete of [
    "_scheduleFirstRowSpacing",
    "_updateFirstRowSpacing",
    "_spacingOffset",
    "MutationObserver",
    "ResizeObserver"
  ]) {
    assert.equal(source.includes(obsolete), false, obsolete);
  }
});

function conditionalFirstRowFixture(iconTop = 114, textTop = 82, textHeight = 24) {
  const icon = {
    style: { translate: "" },
    getClientRects: () => [{}],
    getBoundingClientRect() {
      const parts = this.style.translate.split(" ");
      const offset = parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
      return { top: iconTop + offset, height: 40 };
    }
  };
  const info = {
    getClientRects: () => [{}],
    childNodes: [{
      nodeType: 3,
      textContent: "Pill Vibration Sensor",
      rect: () => ({ top: textTop, height: textHeight })
    }]
  };
  const root = {
    querySelector(selector) {
      if (selector === "#wrapper > .icon") return icon;
      if (selector === "#wrapper > .info") return info;
      return null;
    }
  };
  const template = { shadowRoot: root };
  const conditional = {
    hidden: false,
    querySelector(selector) {
      return selector === "template-entity-row" ? template : null;
    }
  };
  const row = {
    hidden: false,
    querySelector(selector) {
      return selector === "hui-conditional-row" ? conditional : null;
    }
  };
  const states = {
    children: [row],
    style: { marginTop: "" }
  };
  const card = new Header();
  card.isConnected = true;
  card._card = {
    shadowRoot: {
      querySelector(selector) {
        return selector === "#states" ? states : null;
      }
    }
  };
  return { card, icon, info, states, row, conditional, template };
}

test("first conditional icon aligns with the primary text line only", () => {
  const { card, icon, info, states } = conditionalFirstRowFixture();
  const before = icon.getBoundingClientRect().top;
  assert.equal(card._alignFirstConditionalIcon(), false);
  const rect = icon.getBoundingClientRect();
  assert.ok(rect.top < before);
  assert.equal(rect.top + rect.height / 2, 82 + 24 / 2);
  assert.equal(info.childNodes[0].rect().top, 82);
  assert.equal(states.style.marginTop, "");
  card._clearFirstIconAlignment();
  assert.equal(icon.style.translate, "");
  assert.equal(card._firstIconShift, 0);
});

test("conditional icon alignment updates when the first row changes", () => {
  const first = conditionalFirstRowFixture(118, 82);
  first.card._alignFirstConditionalIcon();
  assert.notEqual(first.icon.style.translate, "");
  const ordinaryRow = { hidden: false, querySelector: () => null };
  first.states.children.unshift(ordinaryRow);
  first.card._alignFirstConditionalIcon();
  assert.equal(first.icon.style.translate, "");
  assert.equal(first.states.style.marginTop, "");
  first.states.children.shift();
  first.conditional.hidden = true;
  first.card._alignFirstConditionalIcon();
  assert.equal(first.icon.style.translate, "");
  first.conditional.hidden = false;
  first.card._alignFirstConditionalIcon();
  assert.notEqual(first.icon.style.translate, "");
  first.card._clearFirstIconAlignment();
});

test("conditional rows rendering late get bounded retries and no leftover frame", () => {
  runFrames();
  const fixture = conditionalFirstRowFixture(112, 86);
  fixture.template.shadowRoot = null;
  fixture.card._scheduleFirstIconAlignment();
  runFrames(4);
  assert.equal(fixture.icon.style.translate, "");
  fixture.template.shadowRoot = {
    querySelector(selector) {
      if (selector === "#wrapper > .icon") return fixture.icon;
      if (selector === "#wrapper > .info") return fixture.info;
      return null;
    }
  };
  runFrames(10);
  assert.notEqual(fixture.icon.style.translate, "");
  assert.equal(fixture.card._firstIconFrame, null);
  fixture.card.disconnectedCallback = () => fixture.card._clearFirstIconAlignment();
  fixture.card.disconnectedCallback();
  assert.equal(fixture.icon.style.translate, "");
  assert.equal(frames.size, 0);
});

test("conditional row not yet mounted is retried before giving up", () => {
  runFrames();
  const fixture = conditionalFirstRowFixture(116, 84);
  fixture.conditional.querySelector = () => null;
  fixture.card._scheduleFirstIconAlignment();
  runFrames(3);
  assert.equal(fixture.icon.style.translate, "");
  fixture.conditional.querySelector = (selector) =>
    selector === "template-entity-row" ? fixture.template : null;
  runFrames(5);
  assert.notEqual(fixture.icon.style.translate, "");
  fixture.card._clearFirstIconAlignment();
});

test("ordinary rows remain untouched by conditional icon alignment", () => {
  const { card, icon, states } = conditionalFirstRowFixture();
  states.children = [{ hidden: false, querySelector: () => null }];
  card._alignFirstConditionalIcon();
  assert.equal(icon.style.translate, "");
  assert.equal(states.style.marginTop, "");
  assert.equal(card._shiftedFirstIcon, null);
});

test("conditional icon alignment does not override native card header padding", () => {
  assert.ok(!source.includes("padding-block-start: 6px"));
  assert.ok(!source.includes("states.style.marginTop"));
  assert.ok(!source.includes("_spacingOffset"));
  assert.ok(!source.includes("MutationObserver"));
  assert.ok(!source.includes("ResizeObserver"));
  assert.ok(source.includes('removeEventListener("row-visibility-changed"'));
});

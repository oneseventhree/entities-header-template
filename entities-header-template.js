const ENTITIES_HEADER_TEMPLATE_VERSION = "1.1";

class EntitiesHeaderTemplate extends HTMLElement {
  static async getConfigElement() {
    return document.createElement("entities-header-template-editor");
  }
  static getStubConfig() {
    return {
      title_template: "Header",
      fallback_title: "",
      center_header_template: false,
      show_header_actions: false,
      show_header_toggle: true,
      state_color: true,
      tap_action: {
        action: "none"
      },
      hold_action: {
        action: "none"
      },
      double_tap_action: {
        action: "none"
      },
      entities: []
    };
  }
  constructor() {
    super();
    this._config = null;
    this._hass = null;
    this._card = null;
    this._renderedTitle = "";
    this._lastEntitiesConfigJson = "";
    this._unsubTemplate = null;
    this._subscribedTemplate = "";
    this._subscribing = false;
    this._holdTimer = null;
    this._tapTimer = null;
    this._held = false;
    this._boundHeader = null;
    this._headerActionAbort = null;
  }
  disconnectedCallback() {
    this._unsubscribeTemplate();
    this._clearHoldTimer();
    this._clearTapTimer();
    if (this._headerActionAbort) {
      this._headerActionAbort.abort();
      this._headerActionAbort = null;
    }
    this._boundHeader = null;
  }
  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    if (!config.title_template) throw new Error("title_template is required");
    if (!config.entities) throw new Error("entities is required");
    this._config = {
      ...config,
      tap_action: config.tap_action || { action: "none" },
      hold_action: config.hold_action || { action: "none" },
      double_tap_action: config.double_tap_action || { action: "none" }
    };
    this._renderedTitle = "";
    if (!this._card) {
      this._card = document.createElement("hui-entities-card");
      this.appendChild(this._card);
    }
    this._updateEntitiesCardConfig();
    this._subscribeTemplate();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._card) {
      this._card.hass = hass;
    }
    this._subscribeTemplate();
  }
  getCardSize() {
    return this._card?.getCardSize ? this._card.getCardSize() : 3;
  }
  _headerActionsEnabled() {
    return this._config?.show_header_actions === true;
  }
  async _subscribeTemplate() {
    if (!this._config || !this._hass?.connection || this._subscribing) return;
    const template = this._config.title_template || "";
    if (!template) return;
    if (this._subscribedTemplate === template && this._unsubTemplate) return;
    this._subscribing = true;
    this._unsubscribeTemplate();
    try {
      this._subscribedTemplate = template;
      this._unsubTemplate = await this._hass.connection.subscribeMessage(
        message => {
          if (!message) return;
          if (message.result !== undefined && message.result !== null) {
            const result = String(message.result || "").trim();
            const newTitle = result || (this._config.fallback_title || "");
            if (newTitle !== this._renderedTitle) {
              this._renderedTitle = newTitle;
              this._setHeaderText(newTitle);
            }
            return;
          }
          if (message.error) {
            const fallback = this._config.fallback_title || "Template error";
            if (fallback !== this._renderedTitle) {
              this._renderedTitle = fallback;
              this._setHeaderText(fallback);
            }
            console.error("Entities Header Template render error:", message.error);
          }
        },
        {
          type: "render_template",
          template: template,
          variables: {}
        }
      );
    } catch (error) {
      this._subscribedTemplate = "";
      const fallback = this._config.fallback_title || "Template error";
      if (fallback !== this._renderedTitle) {
        this._renderedTitle = fallback;
        this._setHeaderText(fallback);
      }
      console.error("Entities Header Template subscription error:", error);
    }
    this._subscribing = false;
  }
  _unsubscribeTemplate() {
    if (this._unsubTemplate) {
      this._unsubTemplate();
      this._unsubTemplate = null;
    }
    this._subscribedTemplate = "";
  }
  _updateEntitiesCardConfig() {
    if (!this._config || !this._card) return;
    // Style the native fallback header before Home Assistant renders it.
    this._applyHeaderStyle();
    const entitiesConfig = {
      ...this._config,
      type: "entities",
      title: this._config.fallback_title || " "
    };
    delete entitiesConfig.title_template;
    delete entitiesConfig.center_header_template;
    delete entitiesConfig.show_header_actions;
    delete entitiesConfig.fallback_title;
    delete entitiesConfig.tap_action;
    delete entitiesConfig.hold_action;
    delete entitiesConfig.double_tap_action;
    const json = JSON.stringify(entitiesConfig);
    if (json !== this._lastEntitiesConfigJson) {
      this._lastEntitiesConfigJson = json;
      this._card.setConfig(entitiesConfig);
      if (this._hass) {
        this._card.hass = this._hass;
      }
    }
    // Home Assistant may replace shadow-root content during setConfig.
    this._applyHeaderStyle();
    requestAnimationFrame(() => {
      this._applyHeaderStyle();
      this._setHeaderText(this._renderedTitle || this._config.fallback_title || "");
      this._bindHeaderActions();
    });
  }
  _getHeaderTextElement() {
    // Never write the title into the outer h1. The fallback and rendered
    // template must use the same .name element and inherit identical styling.
    return this._card?.shadowRoot?.querySelector(".card-header .name") || null;
  }
  _getHeaderElement() {
    if (!this._card?.shadowRoot) return null;
    return this._card.shadowRoot.querySelector(".card-header");
  }
  _setHeaderText(text, attempt = 0) {
    requestAnimationFrame(() => {
      const header = this._getHeaderTextElement();
      if (!header) {
        if (attempt < 10) {
          this._setHeaderText(text, attempt + 1);
        }
        return;
      }
      this._applyHeaderStyle();
      if (header.textContent !== (text || "")) {
        header.textContent = text || "";
      }
      this._applyHeaderStyle();
      this._bindHeaderActions();
    });
  }
  _bindHeaderActions() {
    const header = this._getHeaderElement();
    if (!header) return;
    if (this._boundHeader === header) return;
    if (this._headerActionAbort) {
      this._headerActionAbort.abort();
      this._headerActionAbort = null;
    }
    this._boundHeader = header;
    this._headerActionAbort = new AbortController();
    const signal = this._headerActionAbort.signal;
    header.addEventListener(
      "click",
      ev => {
        if (!this._headerActionsEnabled()) return;
        if (this._held) {
          this._held = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        this._clearTapTimer();
        this._tapTimer = window.setTimeout(() => {
          this._tapTimer = null;
          this._handleAction("tap");
        }, 240);
      },
      { signal }
    );
    header.addEventListener(
      "dblclick",
      ev => {
        if (!this._headerActionsEnabled()) return;
        ev.preventDefault();
        ev.stopPropagation();
        this._clearTapTimer();
        this._handleAction("double_tap");
      },
      { signal }
    );
    header.addEventListener(
      "pointerdown",
      () => {
        if (!this._headerActionsEnabled()) return;
        this._held = false;
        this._clearHoldTimer();
        this._holdTimer = window.setTimeout(() => {
          this._held = true;
          this._clearTapTimer();
          this._handleAction("hold");
        }, 500);
      },
      { signal }
    );
    header.addEventListener(
      "pointerup",
      () => {
        this._clearHoldTimer();
      },
      { signal }
    );
    header.addEventListener(
      "pointerleave",
      () => {
        this._clearHoldTimer();
      },
      { signal }
    );
    header.addEventListener(
      "pointercancel",
      () => {
        this._clearHoldTimer();
      },
      { signal }
    );
  }
  _clearHoldTimer() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }
  _clearTapTimer() {
    if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
    }
  }
  _getActionConfig(type) {
    if (type === "hold") return this._config.hold_action || { action: "none" };
    if (type === "double_tap") return this._config.double_tap_action || { action: "none" };
    return this._config.tap_action || { action: "none" };
  }
  _getActionEntity(actionConfig) {
    const entity =
      actionConfig.entity ||
      actionConfig.entity_id ||
      actionConfig.target?.entity_id ||
      this._config.entity;
    if (Array.isArray(entity)) return entity[0];
    return entity || "";
  }
  _handleAction(type) {
    if (!this._config || !this._hass || !this._headerActionsEnabled()) return;
    const actionConfig = this._getActionConfig(type);
    const action = actionConfig?.action || "none";
    if (action === "none") return;
    if (action === "more-info") {
      const entity = this._getActionEntity(actionConfig);
      if (!entity) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: entity },
        bubbles: true,
        composed: true
      }));
      return;
    }
    if (action === "toggle") {
      const target =
        actionConfig.target && typeof actionConfig.target === "object"
          ? { ...actionConfig.target }
          : {};
      const entity =
        actionConfig.entity ||
        actionConfig.entity_id ||
        target.entity_id ||
        this._config.entity;
      if (entity) {
        target.entity_id = entity;
      }
      if (Object.keys(target).length === 0) return;
      this._hass.callService(
        "homeassistant",
        "toggle",
        {},
        target
      );
      return;
    }
    if (action === "navigate") {
      if (!actionConfig.navigation_path) return;
      history.pushState(null, "", actionConfig.navigation_path);
      window.dispatchEvent(new Event("location-changed"));
      return;
    }
    if (action === "url") {
      if (!actionConfig.url_path) return;
      window.open(
        actionConfig.url_path,
        actionConfig.new_tab === false ? "_self" : "_blank"
      );
      return;
    }
    if (action === "perform-action" || action === "call-service") {
      const serviceName = actionConfig.perform_action || actionConfig.service;
      if (!serviceName) return;
      const [domain, service] = serviceName.split(".");
      if (!domain || !service) return;
      const data =
        actionConfig.data && typeof actionConfig.data === "object"
          ? actionConfig.data
          : actionConfig.service_data && typeof actionConfig.service_data === "object"
            ? actionConfig.service_data
            : {};
      const target =
        actionConfig.target && typeof actionConfig.target === "object"
          ? actionConfig.target
          : {};
      this._hass.callService(domain, service, data, target);
      return;
    }
    if (action === "assist") {
      this.dispatchEvent(new CustomEvent("hass-start-voice-assistant", {
        bubbles: true,
        composed: true
      }));
    }
  }
  _applyHeaderStyle() {
    const root = this._card?.shadowRoot;
    if (!root || !this._config) return;
    const cursor = this._headerActionsEnabled() ? "pointer" : "default";
    const styleText = this._config.center_header_template
        ? `
          .card-header {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: relative !important;
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding-left: 48px !important;
            padding-right: 48px !important;
            overflow: hidden !important;
            text-align: center !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            cursor: ${cursor} !important;
            user-select: none !important;
          }
          .card-header .name {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            text-align: center !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            pointer-events: none !important;
          }
          .card-header ha-switch,
          .card-header ha-icon-button {
            position: absolute !important;
            right: 8px !important;
            flex-shrink: 0 !important;
          }
        `
        : `
          .card-header {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            cursor: ${cursor} !important;
            user-select: none !important;
          }
          .card-header .name {
            display: block !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
            pointer-events: none !important;
          }
        `;
    let style = root.querySelector("#entities-header-template-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "entities-header-template-style";
      root.appendChild(style);
    }
    if (style.textContent !== styleText) {
      style.textContent = styleText;
    }
  }
}
class EntitiesHeaderTemplateEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._entitiesEditor = null;
    this._templateEditor = null;
    this._centerToggle = null;
    this._fallbackField = null;
    this._fallbackSelector = null;
    this._configPanel = null;
    this._configHeader = null;
    this._interactionsPanel = null;
    this._interactionsHeader = null;
    this._showActionsToggle = null;
    this._actionSection = null;
    this._tapAction = null;
    this._holdAction = null;
    this._doubleTapAction = null;
    this._tapActionEntity = null;
    this._holdActionEntity = null;
    this._doubleTapActionEntity = null;
    this._tapActionEntitySelector = null;
    this._holdActionEntitySelector = null;
    this._doubleTapActionEntitySelector = null;
    this._built = false;
    this._syncing = false;
    this._configOpen = false;
    this._interactionsOpen = false;
    this._lastEntitiesEditorConfigJson = "";
  }
  setConfig(config) {
    this._config = {
      ...(config || {}),
      tap_action: config?.tap_action || { action: "none" },
      hold_action: config?.hold_action || { action: "none" },
      double_tap_action: config?.double_tap_action || { action: "none" }
    };
    this._interactionsOpen = this._config.show_header_actions === true;
    this._build();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._entitiesEditor) this._entitiesEditor.hass = hass;
    if (this._templateEditor) this._templateEditor.hass = hass;
    if (this._fallbackSelector) this._fallbackSelector.hass = hass;
    this._updateActionSelectorsHass();
    this._syncActionEntitySelectors();
  }
  async _build() {
    if (this._built) {
      this._sync();
      return;
    }
    this.innerHTML = "Loading...";
    const helpers = await window.loadCardHelpers();
    const wrapper = document.createElement("div");
    wrapper.style.display = "grid";
    wrapper.style.gap = "24px";
    wrapper.style.width = "100%";
    wrapper.style.maxWidth = "100%";
    wrapper.style.minWidth = "0";
    wrapper.style.overflow = "hidden";
    wrapper.style.boxSizing = "border-box";
    const templateSection = document.createElement("div");
    templateSection.style.width = "100%";
    templateSection.style.maxWidth = "100%";
    templateSection.style.minWidth = "0";
    templateSection.style.overflow = "hidden";
    templateSection.style.boxSizing = "border-box";
    templateSection.innerHTML = `
      <style>
        .entities-header-template-editor-box {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          box-sizing: border-box;
          contain: inline-size;
        }
        .entities-header-template-editor-box ha-code-editor {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          overflow: hidden;
        }
        .entities-header-template-config {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card-background-color);
        }
        .entities-header-template-config-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 42px;
          width: 100%;
          padding: 0 12px;
          box-sizing: border-box;
          border: none;
          outline: none;
          background: rgba(255,255,255,0.035);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }
        .entities-header-template-config-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .entities-header-template-config-icon {
          --mdc-icon-size: 20px;
          color: var(--secondary-text-color);
          line-height: 1;
        }
        .entities-header-template-config-title {
          font-size: 15px;
          font-weight: 600;
          line-height: 1;
        }
        .entities-header-template-config-chevron {
          --mdc-icon-size: 20px;
          line-height: 1;
          transition: transform 0.15s ease;
        }
        .entities-header-template-config[data-open="true"] .entities-header-template-config-chevron {
          transform: rotate(180deg);
        }
        .entities-header-template-config-content {
          display: none;
          padding: 12px;
          box-sizing: border-box;
          border-top: 1px solid rgba(255,255,255,0.04);
        }
        .entities-header-template-config[data-open="true"] .entities-header-template-config-content {
          display: grid;
          gap: 16px;
        }
        .entities-header-template-heading {
          font-size: 18px;
        }
        .entities-header-template-fallback {
          display: grid;
          gap: 4px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .entities-header-template-fallback ha-selector {
          display: block;
          width: 100%;
        }
        .entities-header-template-fallback-note {
          font-size: 12px;
          color: var(--secondary-text-color);
          line-height: 1.3;
        }
        .entities-header-template-interactions {
          display: block;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          overflow: hidden;
          background: var(--card-background-color);
        }
        .entities-header-template-interactions-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 42px;
          width: 100%;
          padding: 0 12px;
          box-sizing: border-box;
          border: none;
          outline: none;
          background: rgba(255,255,255,0.035);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }
        .entities-header-template-interactions-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .entities-header-template-interactions-icon {
          --mdc-icon-size: 20px;
          color: var(--secondary-text-color);
          line-height: 1;
        }
        .entities-header-template-interactions-title {
          font-size: 15px;
          font-weight: 600;
          line-height: 1;
        }
        .entities-header-template-interactions-switch {
          margin-left: 8px;
        }
        .entities-header-template-interactions-chevron {
          --mdc-icon-size: 20px;
          line-height: 1;
          transition: transform 0.15s ease;
        }
        .entities-header-template-interactions[data-enabled="false"] .entities-header-template-interactions-chevron {
          display: none;
        }
        .entities-header-template-interactions[data-open="true"] .entities-header-template-interactions-chevron {
          transform: rotate(180deg);
        }
        .entities-header-template-interactions-content {
          display: none;
          padding: 12px;
          box-sizing: border-box;
          border-top: 1px solid rgba(255,255,255,0.04);
        }
        .entities-header-template-interactions[data-open="true"] .entities-header-template-interactions-content {
          display: grid;
          gap: 12px;
        }
        .entities-header-template-action-section {
          display: grid;
          gap: 12px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .entities-header-template-action-block {
          display: grid;
          gap: 8px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .entities-header-template-action-block ha-selector {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .entities-header-template-action-entity {
          display: none;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
      </style>
      <div id="config-panel" class="entities-header-template-config" data-open="false">
        <button id="config-header" type="button" class="entities-header-template-config-header">
          <div class="entities-header-template-config-left">
            <ha-icon class="entities-header-template-config-icon" icon="mdi:code-braces"></ha-icon>
            <div class="entities-header-template-config-title">Header template</div>
          </div>
          <ha-icon class="entities-header-template-config-chevron" icon="mdi:chevron-up"></ha-icon>
        </button>
        <div id="config-content" class="entities-header-template-config-content">
          <div class="entities-header-template-heading">
            Header template*
          </div>
          <div class="entities-header-template-editor-box">
            <ha-code-editor
              id="tpl"
              mode="jinja2"
              autocomplete-entities
              autocomplete-icons
              style="width:100%;max-width:100%;min-width:0;min-height:120px;"
            ></ha-code-editor>
          </div>
          <ha-formfield label="Centre header template">
            <ha-switch id="center"></ha-switch>
          </ha-formfield>
          <div class="entities-header-template-fallback">
            <div id="fallback"></div>
            <div class="entities-header-template-fallback-note">
              Plain header shown if the template fails to load. Uses the same size and styling as the templated header.
            </div>
          </div>
          <div id="interactions-panel" class="entities-header-template-interactions" data-open="false" data-enabled="false">
            <button id="interactions-header" type="button" class="entities-header-template-interactions-header">
              <div class="entities-header-template-interactions-left">
                <ha-icon class="entities-header-template-interactions-icon" icon="mdi:gesture-tap-button"></ha-icon>
                <div class="entities-header-template-interactions-title">Interactions</div>
                <ha-switch id="show-actions" class="entities-header-template-interactions-switch"></ha-switch>
              </div>
              <ha-icon class="entities-header-template-interactions-chevron" icon="mdi:chevron-up"></ha-icon>
            </button>
            <div id="interactions-content" class="entities-header-template-interactions-content">
              <div id="action-section" class="entities-header-template-action-section">
                <div class="entities-header-template-action-block">
                  <ha-selector id="tap-action"></ha-selector>
                  <div id="tap-action-entity" class="entities-header-template-action-entity"></div>
                </div>
                <div class="entities-header-template-action-block">
                  <ha-selector id="hold-action"></ha-selector>
                  <div id="hold-action-entity" class="entities-header-template-action-entity"></div>
                </div>
                <div class="entities-header-template-action-block">
                  <ha-selector id="double-tap-action"></ha-selector>
                  <div id="double-tap-action-entity" class="entities-header-template-action-entity"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    this._templateEditor = templateSection.querySelector("#tpl");
    this._centerToggle = templateSection.querySelector("#center");
    this._fallbackField = templateSection.querySelector("#fallback");
    this._configPanel = templateSection.querySelector("#config-panel");
    this._configHeader = templateSection.querySelector("#config-header");
    this._interactionsPanel = templateSection.querySelector("#interactions-panel");
    this._interactionsHeader = templateSection.querySelector("#interactions-header");
    this._showActionsToggle = templateSection.querySelector("#show-actions");
    this._actionSection = templateSection.querySelector("#action-section");
    this._tapAction = templateSection.querySelector("#tap-action");
    this._holdAction = templateSection.querySelector("#hold-action");
    this._doubleTapAction = templateSection.querySelector("#double-tap-action");
    this._tapActionEntity = templateSection.querySelector("#tap-action-entity");
    this._holdActionEntity = templateSection.querySelector("#hold-action-entity");
    this._doubleTapActionEntity = templateSection.querySelector("#double-tap-action-entity");
    this._setupActionSelector(this._tapAction, "Tap behavior", "tap_action");
    this._setupActionSelector(this._holdAction, "Hold behavior", "hold_action");
    this._setupActionSelector(this._doubleTapAction, "Double tap behavior", "double_tap_action");
    this._setupActionEntitySelector(this._tapActionEntity, "Tap entity", "tap_action");
    this._setupActionEntitySelector(this._holdActionEntity, "Hold entity", "hold_action");
    this._setupActionEntitySelector(this._doubleTapActionEntity, "Double tap entity", "double_tap_action");
    this._fallbackSelector = document.createElement("ha-selector");
    this._fallbackSelector.hass = this._hass;
    this._fallbackSelector.label = "Fallback title";
    this._fallbackSelector.selector = { text: {} };
    this._fallbackSelector.addEventListener("value-changed", e => {
      if (this._syncing) return;
      const next = e.detail.value == null ? "" : String(e.detail.value);
      if ((this._config.fallback_title || "") === next) return;
      if (next) {
        this._config.fallback_title = next;
      } else {
        delete this._config.fallback_title;
      }
      this._fire();
    });
    if (this._fallbackField) {
      this._fallbackField.appendChild(this._fallbackSelector);
    }
    this._configHeader.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this._configOpen = !this._configOpen;
      this._syncConfigPanel();
      if (this._configOpen) {
        requestAnimationFrame(() => {
          const ed = this._templateEditor;
          if (ed && ed.codemirror && typeof ed.codemirror.requestMeasure === "function") {
            ed.codemirror.requestMeasure();
          }
        });
      }
    });
    this._interactionsHeader.addEventListener("click", ev => {
      const path = ev.composedPath();
      if (path.includes(this._showActionsToggle)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (this._config.show_header_actions !== true) {
        this._interactionsOpen = false;
        this._syncInteractionsPanel();
        return;
      }
      this._interactionsOpen = !this._interactionsOpen;
      this._syncInteractionsPanel();
    });
    this._showActionsToggle.addEventListener("click", ev => {
      ev.stopPropagation();
    });
    this._showActionsToggle.addEventListener("change", e => {
      if (this._syncing) return;
      e.stopPropagation();
      const next = e.target.checked === true;
      if (this._config.show_header_actions === next) return;
      this._config.show_header_actions = next;
      this._interactionsOpen = next;
      this._syncInteractionsPanel();
      this._syncActionSectionVisibility();
      this._fire();
    });
    this._templateEditor.addEventListener("value-changed", e => {
      if (this._syncing) return;
      const next = e.detail.value || "";
      if (this._config.title_template === next) return;
      this._config.title_template = next;
      this._fire();
    });
    this._centerToggle.addEventListener("change", e => {
      if (this._syncing) return;
      const next = e.target.checked === true;
      if (this._config.center_header_template === next) return;
      this._config.center_header_template = next;
      this._fire();
    });
    const entitiesCard = await helpers.createCardElement({
      type: "entities",
      entities: this._config.entities || []
    });
    this._entitiesEditor = await entitiesCard.constructor.getConfigElement();
    this._entitiesEditor.addEventListener("config-changed", e => {
      e.stopPropagation();
      if (this._syncing) return;
      const cfg = e.detail.config || {};
      const fallbackTitle = this._config.fallback_title;
      this._config = {
        ...cfg,
        type: "custom:entities-header-template",
        title_template: this._config.title_template,
        center_header_template: this._config.center_header_template,
        show_header_actions: this._config.show_header_actions,
        tap_action: this._normaliseAction(this._config.tap_action),
        hold_action: this._normaliseAction(this._config.hold_action),
        double_tap_action: this._normaliseAction(this._config.double_tap_action)
      };
      if (fallbackTitle) {
        this._config.fallback_title = fallbackTitle;
      } else {
        delete this._config.fallback_title;
      }
      delete this._config.title;
      this._fire();
    });
    wrapper.appendChild(templateSection);
    wrapper.appendChild(this._entitiesEditor);
    this.innerHTML = "";
    this.appendChild(wrapper);
    this._built = true;
    this._configOpen = false;
    this._syncConfigPanel();
    this._sync();
  }
  _setupActionSelector(selector, label, key) {
    if (!selector) return;
    selector.hass = this._hass;
    selector.label = label;
    selector.selector = {
      ui_action: {}
    };
    selector.addEventListener("value-changed", e => {
      if (this._syncing) return;
      const next = this._normaliseAction(e.detail.value);
      const current = this._normaliseAction(this._config[key]);
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      this._config[key] = next;
      this._syncActionEntitySelector(key);
      this._fire();
    });
  }
  _setupActionEntitySelector(container, label, key) {
    if (!container) return;
    const entitySelector = document.createElement("ha-selector");
    entitySelector.hass = this._hass;
    entitySelector.label = label;
    entitySelector.selector = {
      entity: {}
    };
    entitySelector.addEventListener("value-changed", e => {
      if (this._syncing) return;
      const nextEntity = Array.isArray(e.detail.value)
        ? e.detail.value[0] || ""
        : e.detail.value || "";
      const currentEntity = this._getActionEntityValue(this._config[key]);
      if (nextEntity === currentEntity) return;
      this._setActionEntity(key, nextEntity);
      this._fire();
    });
    container.appendChild(entitySelector);
    if (key === "tap_action") {
      this._tapActionEntitySelector = entitySelector;
    }
    if (key === "hold_action") {
      this._holdActionEntitySelector = entitySelector;
    }
    if (key === "double_tap_action") {
      this._doubleTapActionEntitySelector = entitySelector;
    }
  }
  _normaliseAction(value) {
    if (!value || typeof value !== "object") {
      return { action: "none" };
    }
    if (!value.action) {
      return { action: "none" };
    }
    return value;
  }
  _actionNeedsEntity(actionConfig) {
    return ["more-info", "toggle"].includes(actionConfig?.action);
  }
  _getActionEntityValue(actionConfig) {
    const entity =
      actionConfig?.entity ||
      actionConfig?.entity_id ||
      actionConfig?.target?.entity_id ||
      "";
    if (Array.isArray(entity)) return entity[0];
    return entity || "";
  }
  _setActionEntity(key, entity) {
    const current = this._normaliseAction(this._config[key]);
    const next = { ...current };
    delete next.entity_id;
    if (next.target && typeof next.target === "object") {
      const target = { ...next.target };
      delete target.entity_id;
      if (Object.keys(target).length > 0) {
        next.target = target;
      } else {
        delete next.target;
      }
    }
    if (entity) {
      next.entity = entity;
    } else {
      delete next.entity;
    }
    this._config[key] = next;
  }
  _getActionEntityContainer(key) {
    if (key === "tap_action") return this._tapActionEntity;
    if (key === "hold_action") return this._holdActionEntity;
    if (key === "double_tap_action") return this._doubleTapActionEntity;
    return null;
  }
  _getActionEntitySelector(key) {
    if (key === "tap_action") return this._tapActionEntitySelector;
    if (key === "hold_action") return this._holdActionEntitySelector;
    if (key === "double_tap_action") return this._doubleTapActionEntitySelector;
    return null;
  }
  _syncActionEntitySelectors() {
    this._syncActionEntitySelector("tap_action");
    this._syncActionEntitySelector("hold_action");
    this._syncActionEntitySelector("double_tap_action");
  }
  _syncActionEntitySelector(key) {
    const container = this._getActionEntityContainer(key);
    const selector = this._getActionEntitySelector(key);
    if (!container || !selector) return;
    const actionConfig = this._normaliseAction(this._config[key]);
    const shouldShow = this._actionNeedsEntity(actionConfig);
    container.style.display = shouldShow ? "block" : "none";
    if (!shouldShow) return;
    selector.hass = this._hass;
    const value = this._getActionEntityValue(actionConfig);
    if (selector.value !== value) {
      selector.value = value;
    }
  }
  _updateActionSelectorsHass() {
    if (this._tapAction) this._tapAction.hass = this._hass;
    if (this._holdAction) this._holdAction.hass = this._hass;
    if (this._doubleTapAction) this._doubleTapAction.hass = this._hass;
    if (this._tapActionEntitySelector) this._tapActionEntitySelector.hass = this._hass;
    if (this._holdActionEntitySelector) this._holdActionEntitySelector.hass = this._hass;
    if (this._doubleTapActionEntitySelector) this._doubleTapActionEntitySelector.hass = this._hass;
  }
  _syncConfigPanel() {
    if (!this._configPanel) return;
    this._configPanel.dataset.open = this._configOpen ? "true" : "false";
  }
  _syncInteractionsPanel() {
    if (!this._interactionsPanel) return;
    const enabled = this._config.show_header_actions === true;
    if (!enabled) {
      this._interactionsOpen = false;
    }
    this._interactionsPanel.dataset.enabled = enabled ? "true" : "false";
    this._interactionsPanel.dataset.open =
      enabled && this._interactionsOpen ? "true" : "false";
  }
  _syncActionSectionVisibility() {
    if (!this._actionSection) return;
    this._actionSection.style.display =
      this._config.show_header_actions === true ? "grid" : "none";
  }
  _syncEntitiesEditorConfig() {
    if (!this._entitiesEditor) return;
    const cfg = {
      ...this._config,
      type: "entities",
      title: ""
    };
    delete cfg.title_template;
    delete cfg.center_header_template;
    delete cfg.show_header_actions;
    delete cfg.fallback_title;
    delete cfg.tap_action;
    delete cfg.hold_action;
    delete cfg.double_tap_action;
    const json = JSON.stringify(cfg);
    if (json !== this._lastEntitiesEditorConfigJson) {
      this._lastEntitiesEditorConfigJson = json;
      this._entitiesEditor.setConfig(cfg);
    }
    if (this._hass) {
      this._entitiesEditor.hass = this._hass;
    }
  }
  _sync() {
    if (!this._built) return;
    this._syncing = true;
    this._templateEditor.value = this._config.title_template || "";
    this._centerToggle.checked = this._config.center_header_template === true;
    if (this._fallbackSelector) {
      this._fallbackSelector.hass = this._hass;
      const fb = this._config.fallback_title || "";
      if (this._fallbackSelector.value !== fb) {
        this._fallbackSelector.value = fb;
      }
    }
    this._showActionsToggle.checked = this._config.show_header_actions === true;
    if (this._config.show_header_actions !== true) {
      this._interactionsOpen = false;
    }
    this._updateActionSelectorsHass();
    const tapAction = this._normaliseAction(this._config.tap_action);
    const holdAction = this._normaliseAction(this._config.hold_action);
    const doubleTapAction = this._normaliseAction(this._config.double_tap_action);
    if (this._tapAction && JSON.stringify(this._tapAction.value) !== JSON.stringify(tapAction)) {
      this._tapAction.value = tapAction;
    }
    if (this._holdAction && JSON.stringify(this._holdAction.value) !== JSON.stringify(holdAction)) {
      this._holdAction.value = holdAction;
    }
    if (this._doubleTapAction && JSON.stringify(this._doubleTapAction.value) !== JSON.stringify(doubleTapAction)) {
      this._doubleTapAction.value = doubleTapAction;
    }
    this._syncActionEntitySelectors();
    this._syncConfigPanel();
    this._syncInteractionsPanel();
    this._syncActionSectionVisibility();
    this._syncEntitiesEditorConfig();
    if (this._hass) {
      this._templateEditor.hass = this._hass;
    }
    this._syncing = false;
  }
  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    }));
  }
}
if (!customElements.get("entities-header-template")) {
  customElements.define("entities-header-template", EntitiesHeaderTemplate);
}
if (!customElements.get("entities-header-template-editor")) {
  customElements.define("entities-header-template-editor", EntitiesHeaderTemplateEditor);
}
window.customCards = window.customCards || [];
window.customCards = window.customCards.filter(card => card.type !== "entities-header-template");
window.customCards.push({
  type: "entities-header-template",
  name: "Entities Header Template",
  description: "Entities card with a templated header"
});

console.info(`Entities Header Template V${ENTITIES_HEADER_TEMPLATE_VERSION} loaded`);

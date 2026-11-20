"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CssSnippetDescriptionsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/css-description.ts
var CssDescriptionError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CssDescriptionError";
  }
};
var DESCRIPTION_COMMENT = /^\/\*[ \t]*@description:[ \t]*(.*?)[ \t]*\*\/$/;
var VALID_CHARSET = /^@charset[ \t]+"[^"\r\n]*"[ \t]*;/;
function normalizeCssDescription(value) {
  if (value.includes("\n") || value.includes("\r") || value.includes("\u2028") || value.includes("\u2029")) {
    throw new CssDescriptionError("Descriptions must be a single line.");
  }
  if (value.includes("*/")) {
    throw new CssDescriptionError("Descriptions cannot contain */.");
  }
  return value.trim();
}
function readCssDescription(css) {
  var _a;
  const header = scanHeader(css);
  return (_a = header.comments[0]) == null ? void 0 : _a.description;
}
function writeCssDescription(css, value) {
  const description = normalizeCssDescription(value);
  const header = scanHeader(css);
  if (description.length === 0) {
    return removeDescriptionComments(css, header.comments);
  }
  if (header.comments.length > 0) {
    if (header.comments.every((comment) => comment.description === description)) {
      return css;
    }
    return replaceDescriptionComments(css, header.comments, description);
  }
  return insertDescription(css, header, description);
}
function scanHeader(css) {
  var _a;
  const bomLength = css.startsWith("\uFEFF") ? 1 : 0;
  let cursor = bomLength;
  const charsetMatch = VALID_CHARSET.exec(css.slice(cursor));
  if (charsetMatch !== null) {
    cursor += charsetMatch[0].length;
  }
  let headerEnd = cursor;
  const comments = [];
  while (cursor < css.length) {
    if (isCssWhitespace(css[cursor])) {
      cursor++;
      continue;
    }
    if (!css.startsWith("/*", cursor)) {
      break;
    }
    const commentStart = cursor;
    const commentClose = css.indexOf("*/", commentStart + 2);
    if (commentClose === -1) {
      throw new CssDescriptionError("Cannot edit the description because the leading CSS comment is not closed.");
    }
    const commentEnd = commentClose + 2;
    const lineStart = findLineStart(css, commentStart, bomLength);
    const lineContentEnd = skipHorizontalWhitespace(css, commentEnd);
    const lineEnd = includeLineEnding(css, lineContentEnd);
    const followingCharacter = css[lineContentEnd];
    const isStandalone = /^[ \t]*$/.test(css.slice(lineStart, commentStart)) && (followingCharacter === void 0 || followingCharacter === "\r" || followingCharacter === "\n");
    const commentText = css.slice(commentStart, commentEnd);
    const descriptionMatch = isStandalone ? DESCRIPTION_COMMENT.exec(commentText) : null;
    const description = descriptionMatch == null ? void 0 : descriptionMatch[1];
    if (typeof description === "string") {
      comments.push({ commentStart, commentEnd, lineStart, lineEnd, description: description.trim() });
    }
    cursor = commentEnd;
    headerEnd = commentEnd;
  }
  const newlineMatch = /\r\n|\n|\r/.exec(css);
  return {
    comments,
    // Leave indentation before the first rule with the rule, not with the new comment.
    insertionOffset: Math.max(headerEnd, findLineStart(css, cursor, bomLength)),
    newline: (_a = newlineMatch == null ? void 0 : newlineMatch[0]) != null ? _a : "\n",
    hasFinalNewline: css.endsWith("\n") || css.endsWith("\r"),
    bomLength
  };
}
function isCssWhitespace(character) {
  return character === " " || character === "	" || character === "\n" || character === "\r" || character === "\f";
}
function findLineStart(css, offset, bomLength) {
  let lineStart = offset;
  while (lineStart > bomLength) {
    const previous = css[lineStart - 1];
    if (previous === "\n" || previous === "\r") {
      break;
    }
    lineStart--;
  }
  return lineStart;
}
function skipHorizontalWhitespace(css, offset) {
  let cursor = offset;
  while (css[cursor] === " " || css[cursor] === "	") {
    cursor++;
  }
  return cursor;
}
function includeLineEnding(css, offset) {
  if (css.startsWith("\r\n", offset)) {
    return offset + 2;
  }
  if (css[offset] === "\r" || css[offset] === "\n") {
    return offset + 1;
  }
  return offset;
}
function removeDescriptionComments(css, comments) {
  if (comments.length === 0) {
    return css;
  }
  const output = [];
  let cursor = 0;
  for (const comment of comments) {
    output.push(css.slice(cursor, comment.lineStart));
    cursor = comment.lineEnd;
  }
  output.push(css.slice(cursor));
  return output.join("");
}
function replaceDescriptionComments(css, comments, description) {
  const output = [];
  let cursor = 0;
  const replacement = `/* @description: ${description} */`;
  for (const comment of comments) {
    output.push(css.slice(cursor, comment.commentStart), replacement);
    cursor = comment.commentEnd;
  }
  output.push(css.slice(cursor));
  return output.join("");
}
function insertDescription(css, header, description) {
  const prefix = css.slice(0, header.insertionOffset);
  const suffix = css.slice(header.insertionOffset);
  const lastLineBreak = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
  const currentLinePrefix = prefix.slice(lastLineBreak + 1).replace(/^\uFEFF/, "");
  const needsLeadingNewline = !/^[ \t]*$/.test(currentLinePrefix);
  const before = needsLeadingNewline ? header.newline : "";
  const after = suffix.length > 0 || header.hasFinalNewline ? header.newline : "";
  const comment = `/* @description: ${description} */`;
  return `${prefix}${before}${comment}${after}${suffix}`;
}

// src/editor-modal.ts
var import_obsidian = require("obsidian");
var CssSnippetDescriptionEditorModal = class extends import_obsidian.Modal {
  constructor(options) {
    super(options.app);
    this.errorEl = null;
    this.setSaveDisabled = null;
    this.isSaving = false;
    this.isClosed = false;
    this.snippetName = options.snippetName;
    this.snippetPath = options.snippetPath;
    this.value = options.initialDescription;
    this.onSaved = options.onSaved;
    this.onClosed = options.onClosed;
  }
  onOpen() {
    this.setTitle("Edit CSS snippet description");
    new import_obsidian.Setting(this.contentEl).setName(this.snippetName).setDesc("Leave the description blank to remove its CSS comment.");
    new import_obsidian.Setting(this.contentEl).setName("Description").setDesc("Use one line of plain text.").addTextArea((component) => {
      component.setValue(this.value);
      component.inputEl.rows = 2;
      component.inputEl.setAttribute("aria-label", "Description");
      component.inputEl.focus();
      component.onChange((value) => {
        this.value = value;
      });
    });
    this.errorEl = this.contentEl.createDiv({ cls: "css-snippet-description-error" });
    this.errorEl.setAttribute("role", "alert");
    this.errorEl.hidden = true;
    new import_obsidian.Setting(this.contentEl).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        void this.save();
      });
      this.setSaveDisabled = (disabled) => {
        button.setDisabled(disabled);
      };
    }).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }
  onClose() {
    this.isClosed = true;
    this.contentEl.empty();
    this.onClosed();
  }
  async save() {
    var _a, _b;
    if (this.isSaving || this.isClosed) {
      return;
    }
    let description;
    try {
      description = normalizeCssDescription(this.value);
    } catch (error) {
      this.showError(errorMessage(error));
      return;
    }
    this.isSaving = true;
    (_a = this.setSaveDisabled) == null ? void 0 : _a.call(this, true);
    this.showError("");
    try {
      await this.app.vault.adapter.process(this.snippetPath, (css) => writeCssDescription(css, description));
      if (this.isClosed) {
        return;
      }
      this.onSaved(description.length === 0 ? null : description);
      this.close();
    } catch (error) {
      if (!this.isClosed) {
        this.showError(`Could not save the description for ${this.snippetName}: ${errorMessage(error)}`);
      }
    } finally {
      if (!this.isClosed) {
        this.isSaving = false;
        (_b = this.setSaveDisabled) == null ? void 0 : _b.call(this, false);
      }
    }
  }
  showError(message) {
    if (this.errorEl === null) {
      return;
    }
    this.errorEl.setText(message);
    this.errorEl.hidden = message.length === 0;
  }
};
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/main.ts
var SETTINGS_MODAL_SELECTOR = ".modal.mod-settings";
var DESCRIPTION_BUTTON_SELECTOR = "button[data-css-snippet-description-edit]";
var DESCRIPTION_TEXT_SELECTOR = ".css-snippet-description-text";
var CssSnippetDescriptionsPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.descriptionCache = /* @__PURE__ */ new Map();
    this.pendingReads = /* @__PURE__ */ new Map();
    this.openingRows = /* @__PURE__ */ new Set();
    this.bodyObserver = null;
    this.settingsObserver = null;
    this.settingsModal = null;
    this.snippetItems = null;
    this.editorModal = null;
    this.descriptionRevision = 0;
    this.isDisposed = false;
    this.debouncedRefresh = (0, import_obsidian2.debounce)(() => this.refreshSettings(), 40, false);
  }
  onload() {
    this.register(() => this.cleanup());
    this.register(() => this.debouncedRefresh.cancel());
    this.registerEvent(this.app.workspace.on("css-change", () => this.invalidateDescriptions()));
    this.app.workspace.onLayoutReady(() => this.startObservingSettings());
  }
  startObservingSettings() {
    if (this.isDisposed) {
      return;
    }
    const body = activeDocument.body;
    this.registerDomEvent(body, "click", (event) => this.handleSettingsClick(event), true);
    this.bodyObserver = new MutationObserver((records) => this.handleBodyMutations(records, body));
    this.bodyObserver.observe(body, { childList: true });
    const existingModal = activeDocument.querySelector(SETTINGS_MODAL_SELECTOR);
    if (isHTMLElement(existingModal)) {
      this.attachSettingsModal(existingModal);
    }
  }
  handleBodyMutations(records, body) {
    if (this.settingsModal !== null && !this.settingsModal.isConnected) {
      this.detachSettingsModal();
    }
    for (const record of records) {
      if (record.target !== body) {
        continue;
      }
      for (const addedNode of Array.from(record.addedNodes)) {
        if (!isHTMLElement(addedNode)) {
          continue;
        }
        const modal = this.findSettingsModal(addedNode);
        if (modal !== null) {
          this.attachSettingsModal(modal);
        }
      }
    }
  }
  findSettingsModal(node) {
    if (node.matches(SETTINGS_MODAL_SELECTOR)) {
      return node;
    }
    if (!node.matches(".modal-container")) {
      return null;
    }
    const modal = node.querySelector(SETTINGS_MODAL_SELECTOR);
    return isHTMLElement(modal) ? modal : null;
  }
  attachSettingsModal(modal) {
    if (this.settingsModal === modal) {
      return;
    }
    this.detachSettingsModal();
    this.settingsModal = modal;
    this.settingsObserver = new MutationObserver(() => this.debouncedRefresh());
    this.settingsObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      subtree: true
    });
    this.debouncedRefresh();
  }
  detachSettingsModal() {
    var _a;
    (_a = this.settingsObserver) == null ? void 0 : _a.disconnect();
    this.settingsObserver = null;
    this.settingsModal = null;
    this.openingRows.clear();
    this.setSnippetItems(null);
  }
  refreshSettings() {
    var _a;
    if (this.isDisposed) {
      return;
    }
    const modal = this.settingsModal;
    if (modal === null || !modal.isConnected) {
      return;
    }
    const items = this.findSnippetItems(modal);
    this.setSnippetItems(items);
    if (items === null) {
      this.removePluginElements(modal);
      return;
    }
    this.removePluginElementsOutside(items, modal);
    for (const candidate of Array.from(items.children)) {
      if (!isHTMLElement(candidate) || !candidate.matches(".setting-item.mod-toggle")) {
        continue;
      }
      const name = this.getSnippetName(candidate);
      if (name === null || this.getSnippetPath(name) === null) {
        this.removeRowElements(candidate);
        continue;
      }
      this.ensureEditButton(candidate, name);
      if (this.descriptionCache.has(name)) {
        this.setRowDescription(candidate, (_a = this.descriptionCache.get(name)) != null ? _a : null);
      } else {
        this.loadDescriptionForRow(candidate, name);
      }
    }
  }
  setSnippetItems(items) {
    if (this.snippetItems !== items) {
      this.snippetItems = items;
      this.descriptionRevision++;
      this.descriptionCache.clear();
    }
  }
  findSnippetItems(modal) {
    if (modal.querySelector('.vertical-tab-nav-item.is-active[data-setting-id="appearance"]') === null) {
      return null;
    }
    for (const candidate of Array.from(modal.querySelectorAll(".setting-group"))) {
      if (!isHTMLElement(candidate)) {
        continue;
      }
      let heading = null;
      let items = null;
      for (const child of Array.from(candidate.children)) {
        if (!isHTMLElement(child)) {
          continue;
        }
        if (child.matches(".setting-item-heading")) {
          heading = child;
        } else if (child.matches(".setting-items")) {
          items = child;
        }
      }
      if (heading !== null && heading.querySelector(".setting-item-control svg.lucide-refresh-cw") !== null && items !== null) {
        return items;
      }
    }
    return null;
  }
  getSnippetName(row) {
    const nameEl = row.querySelector(".setting-item-info .setting-item-name");
    const name = nameEl == null ? void 0 : nameEl.textContent;
    return typeof name === "string" && name.length > 0 ? name : null;
  }
  getSnippetPath(name) {
    if (!isSafeSnippetName(name)) {
      return null;
    }
    return (0, import_obsidian2.normalizePath)(`${this.app.vault.configDir}/snippets/${name}.css`);
  }
  ensureEditButton(row, name) {
    const control = row.querySelector(".setting-item-control");
    if (!isHTMLElement(control)) {
      return;
    }
    const accessibleName = `Edit description for ${name}`;
    const existing = control.querySelector(DESCRIPTION_BUTTON_SELECTOR);
    let button;
    if (isHTMLButtonElement(existing)) {
      button = existing;
    } else {
      button = control.createEl("button", {
        cls: "clickable-icon css-snippet-description-edit",
        attr: {
          type: "button",
          "aria-label": accessibleName,
          title: accessibleName,
          "data-css-snippet-description-edit": ""
        }
      });
      (0, import_obsidian2.setIcon)(button, "pencil");
    }
    button.setAttribute("aria-label", accessibleName);
    button.setAttribute("title", accessibleName);
    const toggleLabel = control.querySelector("label.checkbox-container");
    if (isHTMLElement(toggleLabel) && button.previousElementSibling !== toggleLabel) {
      toggleLabel.after(button);
    } else if (button.parentElement !== control) {
      control.appendChild(button);
    }
  }
  setRowDescription(row, description) {
    const host = row.querySelector(".setting-item-description");
    if (!isHTMLElement(host)) {
      return;
    }
    const existing = host.querySelector(DESCRIPTION_TEXT_SELECTOR);
    if (description === null || description.length === 0) {
      existing == null ? void 0 : existing.remove();
      return;
    }
    if (isHTMLElement(existing)) {
      if (existing.textContent !== description) {
        existing.setText(description);
      }
      return;
    }
    host.createSpan({ cls: "css-snippet-description-text", text: description });
  }
  removeRowElements(row) {
    var _a, _b;
    (_a = row.querySelector(DESCRIPTION_BUTTON_SELECTOR)) == null ? void 0 : _a.remove();
    (_b = row.querySelector(DESCRIPTION_TEXT_SELECTOR)) == null ? void 0 : _b.remove();
  }
  removePluginElementsOutside(items, modal) {
    for (const element of Array.from(modal.querySelectorAll(
      `${DESCRIPTION_BUTTON_SELECTOR}, ${DESCRIPTION_TEXT_SELECTOR}`
    ))) {
      if (!items.contains(element)) {
        element.remove();
      }
    }
  }
  removePluginElements(modal) {
    for (const element of Array.from(modal.querySelectorAll(
      `${DESCRIPTION_BUTTON_SELECTOR}, ${DESCRIPTION_TEXT_SELECTOR}`
    ))) {
      element.remove();
    }
  }
  loadDescriptionForRow(row, name) {
    if (this.pendingReads.has(name)) {
      return;
    }
    const path = this.getSnippetPath(name);
    if (path === null) {
      return;
    }
    const revision = this.descriptionRevision;
    const request = this.readAndDisplayDescription(row, name, path, revision);
    this.pendingReads.set(name, request);
  }
  async readAndDisplayDescription(row, name, path, revision) {
    try {
      const css = await this.app.vault.adapter.read(path);
      if (revision !== this.descriptionRevision || !this.isCurrentSnippetRow(row, name)) {
        return;
      }
      const description = readCssDescription(css);
      const displayDescription = description === void 0 || description.length === 0 ? null : description;
      this.descriptionCache.set(name, displayDescription);
      this.setRowDescription(row, displayDescription);
    } catch (error) {
      if (revision === this.descriptionRevision && this.isCurrentSnippetRow(row, name)) {
        this.descriptionCache.set(name, null);
        this.setRowDescription(row, null);
        console.error(`Could not read the description for CSS snippet ${name}.`, error);
      }
    } finally {
      this.pendingReads.delete(name);
      if (!this.isDisposed && (revision !== this.descriptionRevision || !this.isCurrentSnippetRow(row, name) && this.hasCurrentRowNamed(name))) {
        this.debouncedRefresh();
      }
    }
  }
  isCurrentSnippetRow(row, name) {
    const modal = this.settingsModal;
    if (this.isDisposed || !row.isConnected || modal === null || !modal.contains(row)) {
      return false;
    }
    const items = this.findSnippetItems(modal);
    return items !== null && items.contains(row) && this.getSnippetName(row) === name;
  }
  hasCurrentRowNamed(name) {
    const modal = this.settingsModal;
    if (modal === null || !modal.isConnected) {
      return false;
    }
    const items = this.findSnippetItems(modal);
    if (items === null) {
      return false;
    }
    for (const row of Array.from(items.children)) {
      if (isHTMLElement(row) && row.matches(".setting-item.mod-toggle") && this.getSnippetName(row) === name) {
        return true;
      }
    }
    return false;
  }
  handleSettingsClick(event) {
    var _a;
    const target = event.target;
    if (!isElement(target) || this.settingsModal === null || !this.settingsModal.contains(target)) {
      return;
    }
    const button = target.closest(DESCRIPTION_BUTTON_SELECTOR);
    if (!isHTMLButtonElement(button)) {
      const reload = target.closest(".setting-item-heading .extra-setting-button");
      if (reload !== null && reload.closest(".setting-group") === ((_a = this.snippetItems) == null ? void 0 : _a.parentElement) && reload.querySelector("svg.lucide-refresh-cw") !== null) {
        this.invalidateDescriptions();
      }
      return;
    }
    const modal = button.closest(SETTINGS_MODAL_SELECTOR);
    const row = button.closest(".setting-item.mod-toggle");
    if (modal !== this.settingsModal || !isHTMLElement(row)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.openEditor(row);
  }
  async openEditor(row) {
    var _a;
    const name = this.getSnippetName(row);
    if (name === null || this.editorModal !== null || this.openingRows.has(row) || !this.isCurrentSnippetRow(row, name)) {
      return;
    }
    const path = this.getSnippetPath(name);
    if (path === null) {
      return;
    }
    this.openingRows.add(row);
    try {
      const css = await this.app.vault.adapter.read(path);
      if (this.isDisposed || !this.isCurrentSnippetRow(row, name) || this.editorModal !== null) {
        return;
      }
      const editor = new CssSnippetDescriptionEditorModal({
        app: this.app,
        snippetName: name,
        snippetPath: path,
        initialDescription: (_a = readCssDescription(css)) != null ? _a : "",
        onSaved: (description) => this.handleDescriptionSaved(name, description),
        onClosed: () => {
          this.editorModal = null;
        }
      });
      this.editorModal = editor;
      editor.open();
    } catch (error) {
      if (!this.isDisposed && this.isCurrentSnippetRow(row, name)) {
        new import_obsidian2.Notice(`Could not read the description for CSS snippet ${name}: ${errorMessage2(error)}`);
      }
    } finally {
      this.openingRows.delete(row);
    }
  }
  handleDescriptionSaved(name, description) {
    if (this.isDisposed) {
      return;
    }
    this.descriptionRevision++;
    this.descriptionCache.set(name, description);
    const modal = this.settingsModal;
    const items = modal === null ? null : this.findSnippetItems(modal);
    if (items === null) {
      return;
    }
    for (const row of Array.from(items.children)) {
      if (isHTMLElement(row) && row.matches(".setting-item.mod-toggle") && this.getSnippetName(row) === name) {
        this.setRowDescription(row, description);
      }
    }
  }
  invalidateDescriptions() {
    if (this.isDisposed) {
      return;
    }
    this.descriptionRevision++;
    this.descriptionCache.clear();
    this.debouncedRefresh();
  }
  cleanup() {
    var _a, _b, _c;
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    (_a = this.bodyObserver) == null ? void 0 : _a.disconnect();
    this.bodyObserver = null;
    (_b = this.settingsObserver) == null ? void 0 : _b.disconnect();
    this.settingsObserver = null;
    const modal = this.settingsModal;
    if (modal !== null) {
      this.removePluginElements(modal);
    }
    (_c = this.editorModal) == null ? void 0 : _c.close();
    this.editorModal = null;
    this.settingsModal = null;
    this.snippetItems = null;
    this.descriptionCache.clear();
    this.pendingReads.clear();
    this.openingRows.clear();
  }
};
function isHTMLElement(node) {
  return node !== null && node.nodeType === 1 && "createEl" in node && typeof node.createEl === "function";
}
function isElement(target) {
  return target !== null && "nodeType" in target && target.nodeType === 1 && "closest" in target && typeof target.closest === "function";
}
function isHTMLButtonElement(element) {
  return element !== null && element.tagName === "BUTTON";
}
function isSafeSnippetName(name) {
  return name.length > 0 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") && !name.includes(":") && !containsControlCharacters(name);
}
function containsControlCharacters(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

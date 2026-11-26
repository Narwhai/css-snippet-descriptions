/* global activeDocument -- activeDocument is a runtime global in Obsidian's popout-aware DOM API */
import { debounce, normalizePath, Notice, Plugin, setIcon } from "obsidian";
import { readCssDescription } from "./css-description";
import { CssSnippetDescriptionEditorModal } from "./editor-modal";

const SETTINGS_MODAL_SELECTOR = ".modal.mod-settings";
const DESCRIPTION_BUTTON_SELECTOR = "button[data-css-snippet-description-edit]";
const DESCRIPTION_TEXT_SELECTOR = ".css-snippet-description-text";

export default class CssSnippetDescriptionsPlugin extends Plugin {
  private readonly descriptionCache = new Map<string, string | null>();
  private readonly pendingReads = new Map<string, Promise<void>>();
  private readonly openingRows = new Set<HTMLElement>();
  private bodyObserver: MutationObserver | null = null;
  private settingsObserver: MutationObserver | null = null;
  private settingsModal: HTMLElement | null = null;
  private settingsNavigation: Element | null = null;
  private snippetItems: HTMLElement | null = null;
  private editorModal: CssSnippetDescriptionEditorModal | null = null;
  private descriptionRevision = 0;
  private isDisposed = false;

  private readonly debouncedRefresh = debounce(() => this.refreshSettings(), 40, false);

  override onload(): void {
    this.register(() => this.cleanup());
    this.register(() => this.debouncedRefresh.cancel());
    this.registerEvent(this.app.workspace.on("css-change", () => this.invalidateDescriptions()));
    this.app.workspace.onLayoutReady(() => this.startObservingSettings());
  }

  private startObservingSettings(): void {
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

  private handleBodyMutations(records: MutationRecord[], body: HTMLElement): void {
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

  private findSettingsModal(node: HTMLElement): HTMLElement | null {
    if (node.matches(SETTINGS_MODAL_SELECTOR)) {
      return node;
    }
    if (!node.matches(".modal-container")) {
      return null;
    }
    const modal = node.querySelector(SETTINGS_MODAL_SELECTOR);
    return isHTMLElement(modal) ? modal : null;
  }

  private attachSettingsModal(modal: HTMLElement): void {
    if (this.settingsModal === modal) {
      return;
    }
    this.detachSettingsModal();
    this.settingsModal = modal;
    // Phones detach this header when a settings tab opens, but still update its active item.
    this.settingsNavigation = modal.querySelector(".vertical-tab-header");
    this.settingsObserver = new MutationObserver(() => this.debouncedRefresh());
    this.settingsObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      subtree: true,
    });
    this.debouncedRefresh();
  }

  private detachSettingsModal(): void {
    this.settingsObserver?.disconnect();
    this.settingsObserver = null;
    this.settingsModal = null;
    this.settingsNavigation = null;
    this.openingRows.clear();
    this.setSnippetItems(null);
  }

  private refreshSettings(): void {
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
        this.setRowDescription(candidate, this.descriptionCache.get(name) ?? null);
      } else {
        this.loadDescriptionForRow(candidate, name);
      }
    }
  }

  private setSnippetItems(items: HTMLElement | null): void {
    if (this.snippetItems !== items) {
      // The native reload button can rebuild this list without emitting css-change.
      this.snippetItems = items;
      this.descriptionRevision++;
      this.descriptionCache.clear();
    }
  }

  private getCachedSnippetItems(): HTMLElement | null {
    const items = this.snippetItems;
    const modal = this.settingsModal;
    if (items === null || modal === null || !items.isConnected || !modal.contains(items)) {
      return null;
    }
    return items;
  }

  private findSnippetItems(modal: HTMLElement): HTMLElement | null {
    // A tab already open when the plugin loaded may not have its header attached yet.
    this.settingsNavigation ??= modal.querySelector(".vertical-tab-header");
    const navigation = this.settingsNavigation ?? modal;
    if (navigation.querySelector(".vertical-tab-nav-item.is-active[data-setting-id=\"appearance\"]") === null) {
      return null;
    }

    for (const candidate of Array.from(modal.querySelectorAll(".setting-group"))) {
      if (!isHTMLElement(candidate)) {
        continue;
      }

      let heading: HTMLElement | null = null;
      let items: HTMLElement | null = null;
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

  private getSnippetName(row: HTMLElement): string | null {
    const nameEl = row.querySelector(".setting-item-info .setting-item-name");
    const name = nameEl?.textContent;
    return typeof name === "string" && name.length > 0 ? name : null;
  }

  private getSnippetPath(name: string): string | null {
    if (!isSafeSnippetName(name)) {
      return null;
    }
    return normalizePath(`${this.app.vault.configDir}/snippets/${name}.css`);
  }

  private ensureEditButton(row: HTMLElement, name: string): void {
    const control = row.querySelector(".setting-item-control");
    if (!isHTMLElement(control)) {
      return;
    }

    const accessibleName = `Edit description for ${name}`;
    const existing = control.querySelector(DESCRIPTION_BUTTON_SELECTOR);
    let button: HTMLButtonElement;
    if (isHTMLButtonElement(existing)) {
      button = existing;
    } else {
      button = control.createEl("button", {
        cls: "clickable-icon css-snippet-description-edit",
        attr: {
          type: "button",
          "aria-label": accessibleName,
          "data-css-snippet-description-edit": "",
        },
      });
      setIcon(button, "pencil");
    }

    button.setAttribute("aria-label", accessibleName);
    const toggleLabel = control.querySelector("label.checkbox-container");
    if (isHTMLElement(toggleLabel) && button.previousElementSibling !== toggleLabel) {
      toggleLabel.after(button);
    } else if (button.parentElement !== control) {
      control.appendChild(button);
    }
  }

  private setRowDescription(row: HTMLElement, description: string | null): void {
    const host = row.querySelector(".setting-item-description");
    if (!isHTMLElement(host)) {
      return;
    }
    const existing = host.querySelector(DESCRIPTION_TEXT_SELECTOR);
    if (description === null || description.length === 0) {
      existing?.remove();
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

  private removeRowElements(row: HTMLElement): void {
    row.querySelector(DESCRIPTION_BUTTON_SELECTOR)?.remove();
    row.querySelector(DESCRIPTION_TEXT_SELECTOR)?.remove();
  }

  private removePluginElementsOutside(items: HTMLElement, modal: HTMLElement): void {
    for (const element of Array.from(modal.querySelectorAll(
      `${DESCRIPTION_BUTTON_SELECTOR}, ${DESCRIPTION_TEXT_SELECTOR}`,
    ))) {
      if (!items.contains(element)) {
        element.remove();
      }
    }
  }

  private removePluginElements(modal: HTMLElement): void {
    for (const element of Array.from(modal.querySelectorAll(
      `${DESCRIPTION_BUTTON_SELECTOR}, ${DESCRIPTION_TEXT_SELECTOR}`,
    ))) {
      element.remove();
    }
  }

  private loadDescriptionForRow(row: HTMLElement, name: string): void {
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

  private async readAndDisplayDescription(
    row: HTMLElement,
    name: string,
    path: string,
    revision: number,
  ): Promise<void> {
    try {
      const css = await this.app.vault.adapter.read(path);
      if (revision !== this.descriptionRevision || !this.isCurrentSnippetRow(row, name)) {
        return;
      }
      const description = readCssDescription(css);
      const displayDescription = description === undefined || description.length === 0 ? null : description;
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
      if (!this.isDisposed && (
        revision !== this.descriptionRevision
        || (!this.isCurrentSnippetRow(row, name) && this.hasCurrentRowNamed(name))
      )) {
        this.debouncedRefresh();
      }
    }
  }

  private isCurrentSnippetRow(row: HTMLElement, name: string): boolean {
    const modal = this.settingsModal;
    if (this.isDisposed || !row.isConnected || modal === null || !modal.contains(row)) {
      return false;
    }
    const items = this.getCachedSnippetItems();
    return items !== null && items.contains(row) && this.getSnippetName(row) === name;
  }

  private hasCurrentRowNamed(name: string): boolean {
    const modal = this.settingsModal;
    if (modal === null || !modal.isConnected) {
      return false;
    }
    const items = this.getCachedSnippetItems();
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

  private handleSettingsClick(event: MouseEvent): void {
    const target = event.target;
    if (!isElement(target) || this.settingsModal === null || !this.settingsModal.contains(target)) {
      return;
    }
    const button = target.closest(DESCRIPTION_BUTTON_SELECTOR);
    if (!isHTMLButtonElement(button)) {
      const reload = target.closest(".setting-item-heading .extra-setting-button");
      if (reload !== null && reload.closest(".setting-group") === this.snippetItems?.parentElement
        && reload.querySelector("svg.lucide-refresh-cw") !== null) {
        // Obsidian can reuse the existing rows and skip css-change when disabled snippets change.
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

  private async openEditor(row: HTMLElement): Promise<void> {
    const name = this.getSnippetName(row);
    if (
      name === null
      || this.editorModal !== null
      || this.openingRows.has(row)
      || !this.isCurrentSnippetRow(row, name)
    ) {
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
        initialDescription: readCssDescription(css) ?? "",
        onSaved: (description) => this.handleDescriptionSaved(name, description),
        onClosed: () => {
          this.editorModal = null;
        },
      });
      this.editorModal = editor;
      editor.open();
    } catch (error) {
      if (!this.isDisposed && this.isCurrentSnippetRow(row, name)) {
        new Notice(`Could not read the description for CSS snippet ${name}: ${errorMessage(error)}`);
      }
    } finally {
      this.openingRows.delete(row);
    }
  }

  private handleDescriptionSaved(name: string, description: string | null): void {
    if (this.isDisposed) {
      return;
    }
    this.descriptionRevision++;
    this.descriptionCache.set(name, description);
    const items = this.getCachedSnippetItems();
    if (items === null) {
      return;
    }
    for (const row of Array.from(items.children)) {
      if (isHTMLElement(row) && row.matches(".setting-item.mod-toggle") && this.getSnippetName(row) === name) {
        this.setRowDescription(row, description);
      }
    }
  }

  private invalidateDescriptions(): void {
    if (this.isDisposed) {
      return;
    }
    this.descriptionRevision++;
    this.descriptionCache.clear();
    this.debouncedRefresh();
  }

  private cleanup(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.settingsObserver?.disconnect();
    this.settingsObserver = null;

    const modal = this.settingsModal;
    if (modal !== null) {
      this.removePluginElements(modal);
    }
    this.editorModal?.close();
    this.editorModal = null;
    this.settingsModal = null;
    this.settingsNavigation = null;
    this.snippetItems = null;
    this.descriptionCache.clear();
    this.pendingReads.clear();
    this.openingRows.clear();
  }
}

function isHTMLElement(node: Node | null): node is HTMLElement {
  return node !== null
    && node.nodeType === 1
    && "createEl" in node
    && typeof node.createEl === "function";
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null
    && "nodeType" in target
    && target.nodeType === 1
    && "closest" in target
    && typeof target.closest === "function";
}

function isHTMLButtonElement(element: Element | null): element is HTMLButtonElement {
  return element !== null && element.tagName === "BUTTON";
}

function isSafeSnippetName(name: string): boolean {
  return name.length > 0
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\")
    && !containsControlCharacters(name);
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

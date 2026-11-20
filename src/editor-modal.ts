import { App, Modal, Notice, Setting } from "obsidian";
import { normalizeCssDescription, writeCssDescription } from "./css-description";

interface EditorModalOptions {
  readonly app: App;
  readonly snippetName: string;
  readonly snippetPath: string;
  readonly initialDescription: string;
  readonly onSaved: (description: string | null) => void;
  readonly onClosed: () => void;
}

export class CssSnippetDescriptionEditorModal extends Modal {
  private readonly snippetName: string;
  private readonly snippetPath: string;
  private readonly onSaved: (description: string | null) => void;
  private readonly onClosed: () => void;
  private value: string;
  private errorEl: HTMLElement | null = null;
  private setSaveDisabled: ((disabled: boolean) => void) | null = null;
  private isSaving = false;
  private isClosed = false;
  private hasNotifiedClosed = false;

  constructor(options: EditorModalOptions) {
    super(options.app);
    this.snippetName = options.snippetName;
    this.snippetPath = options.snippetPath;
    this.value = options.initialDescription;
    this.onSaved = options.onSaved;
    this.onClosed = options.onClosed;
  }

  override onOpen(): void {
    this.setTitle("Edit CSS snippet description");
    this.modalEl.addClass("css-snippet-description-modal");
    new Setting(this.contentEl)
      .setName(this.snippetName)
      .setDesc("Leave the description blank to remove its CSS comment.");

    new Setting(this.contentEl)
      .setName("Description")
      .setDesc("Use one line of plain text.")
      .addText((component) => {
        component.setValue(this.value);
        component.inputEl.setAttribute("aria-label", "Description");
        component.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            void this.save();
          }
        });
        component.inputEl.focus();
        component.onChange((value) => {
          this.value = value;
        });
      });

    this.errorEl = this.contentEl.createDiv({ cls: "css-snippet-description-error" });
    this.errorEl.setAttribute("role", "alert");
    this.errorEl.hidden = true;

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Save");
        button.setCta();
        button.onClick(() => {
          void this.save();
        });
        this.setSaveDisabled = (disabled) => {
          button.setDisabled(disabled);
        };
      })
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      });
  }

  override onClose(): void {
    this.isClosed = true;
    this.contentEl.empty();
    if (!this.isSaving) {
      this.notifyClosed();
    }
  }

  private async save(): Promise<void> {
    if (this.isSaving || this.isClosed) {
      return;
    }

    let description: string;
    try {
      description = normalizeCssDescription(this.value);
    } catch (error) {
      this.showError(errorMessage(error));
      return;
    }

    this.isSaving = true;
    this.setSaveDisabled?.(true);
    this.showError("");

    try {
      await this.app.vault.adapter.process(this.snippetPath, (css) => writeCssDescription(css, description));
      this.onSaved(description.length === 0 ? null : description);
      if (!this.isClosed) {
        this.close();
      }
    } catch (error) {
      const message = `Could not save the description for ${this.snippetName}: ${errorMessage(error)}`;
      if (this.isClosed) {
        new Notice(message);
      } else {
        this.showError(message);
      }
    } finally {
      this.isSaving = false;
      if (this.isClosed) {
        this.notifyClosed();
      } else {
        this.setSaveDisabled?.(false);
      }
    }
  }

  private showError(message: string): void {
    if (this.errorEl === null) {
      return;
    }
    this.errorEl.setText(message);
    this.errorEl.hidden = message.length === 0;
  }

  private notifyClosed(): void {
    if (this.hasNotifiedClosed) {
      return;
    }
    this.hasNotifiedClosed = true;
    this.onClosed();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

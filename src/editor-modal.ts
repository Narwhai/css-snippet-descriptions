import { App, Modal, Setting } from "obsidian";
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
    new Setting(this.contentEl)
      .setName(this.snippetName)
      .setDesc("Leave the description blank to remove its CSS comment.");

    new Setting(this.contentEl)
      .setName("Description")
      .setDesc("Use one line of plain text.")
      .addTextArea((component) => {
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
    this.onClosed();
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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

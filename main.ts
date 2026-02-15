import { Plugin, FuzzySuggestModal, TFolder, TFile, TAbstractFile } from "obsidian";

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (folder: TFolder) => void;
  private onDismiss: () => void;
  private chosen = false;
  private currentFolderPath: string;

  constructor(
    plugin: Plugin,
    folders: TFolder[],
    currentFolderPath: string,
    onChoose: (folder: TFolder) => void,
    onDismiss: () => void
  ) {
    super(plugin.app);
    this.folders = folders;
    this.currentFolderPath = currentFolderPath;
    this.onChoose = onChoose;
    this.onDismiss = onDismiss;
    this.setPlaceholder("Choose a folder for the new file...");
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path === "/" ? "/" : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.chosen = true;
    this.onChoose(folder);
  }

  onOpen(): void {
    super.onOpen();
    const { inputEl } = this;
    inputEl.value = this.currentFolderPath === "/" ? "/" : this.currentFolderPath;
    inputEl.select();
  }

  onClose(): void {
    super.onClose();
    if (!this.chosen) {
      this.onDismiss();
    }
  }
}

export default class AskFolderPlugin extends Plugin {
  private isMoving = false;

  async onload(): Promise<void> {
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        this.handleCreate(file);
      })
    );
  }

  private handleCreate(file: TAbstractFile): void {
    if (this.isMoving) return;
    if (!(file instanceof TFile)) return;
    if (file.extension !== "md") return;

    const allFolders = this.getAllFolders();
    const currentFolderPath = file.parent?.path ?? "/";

    // Sort: current folder first, then alphabetical
    allFolders.sort((a, b) => {
      const aPath = a.path === "/" ? "/" : a.path;
      const bPath = b.path === "/" ? "/" : b.path;
      if (aPath === currentFolderPath) return -1;
      if (bPath === currentFolderPath) return 1;
      return aPath.localeCompare(bPath);
    });

    const modal = new FolderSuggestModal(
      this,
      allFolders,
      currentFolderPath,
      (folder: TFolder) => {
        this.moveFile(file, folder);
      },
      () => {
        // dismissed — leave file where it is
      }
    );
    modal.open();
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const root = this.app.vault.getRoot();
    folders.push(root);
    this.collectFolders(root, folders);
    return folders;
  }

  private collectFolders(folder: TFolder, result: TFolder[]): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        result.push(child);
        this.collectFolders(child, result);
      }
    }
  }

  private async moveFile(file: TFile, folder: TFolder): Promise<void> {
    const destPath = folder.path === "/" ? file.name : `${folder.path}/${file.name}`;
    if (destPath === file.path) return;

    // Check if a file already exists at the destination
    const existing = this.app.vault.getAbstractFileByPath(destPath);
    if (existing) {
      // Don't overwrite existing files
      return;
    }

    this.isMoving = true;
    try {
      await this.app.vault.rename(file, destPath);
    } finally {
      this.isMoving = false;
    }
  }
}

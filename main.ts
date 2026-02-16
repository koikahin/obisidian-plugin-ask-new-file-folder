import { Plugin, FuzzySuggestModal, TFolder, TFile, TAbstractFile, Notice } from "obsidian";

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
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("create", (file: TAbstractFile) => {
          this.handleCreate(file);
        })
      );

      try {
        // @ts-ignore — accessing Templater's internal settings; best-effort only
        const templater = (this.app as any).plugins?.plugins?.["templater-obsidian"];
        if (templater?.settings?.trigger_on_file_creation) {
          new Notice(
            "Ask New File Folder plugin: Templater's auto-trigger is enabled. Disable it to avoid conflicts.",
            10000
          );
        }
      } catch {
        // Templater not installed or settings structure changed — ignore
      }
    });
  }

  private async handleCreate(file: TAbstractFile): Promise<void> {
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

    let moved = false;
    let dismissed = false;

    while (!moved && !dismissed) {
      const folder = await this.showFolderModal(allFolders, currentFolderPath);

      if (!folder) {
        dismissed = true;
      } else {
        moved = await this.moveFile(file, folder);
      }
    }

    this.triggerTemplater();
  }

  private showFolderModal(folders: TFolder[], currentFolderPath: string): Promise<TFolder | null> {
    return new Promise((resolve) => {
      const modal = new FolderSuggestModal(
        this,
        folders,
        currentFolderPath,
        (folder: TFolder) => resolve(folder),
        () => resolve(null)
      );
      modal.open();
    });
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

  private triggerTemplater(): void {
    (this.app as any).commands.executeCommandById("templater-obsidian:insert-templater");
  }

  private async moveFile(file: TFile, folder: TFolder): Promise<boolean> {
    const destPath = folder.path === "/" ? file.name : `${folder.path}/${file.name}`;
    if (destPath === file.path) return true;

    const existing = this.app.vault.getAbstractFileByPath(destPath);
    if (existing) {
      new Notice(`A file named "${file.name}" already exists in ${folder.path === "/" ? "the root folder" : folder.path}.`);
      return false;
    }

    this.isMoving = true;
    try {
      await this.app.vault.rename(file, destPath);
      return true;
    } finally {
      this.isMoving = false;
    }
  }
}

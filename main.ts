import { Plugin, FuzzySuggestModal, TFolder, TFile, TAbstractFile, Notice, WorkspaceLeaf, MarkdownView } from "obsidian";

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

    const activeFile1 = this.app.workspace.getActiveFile();
    console.log(`[AskFolder] CREATE event for: "${file.path}". Active file: "${activeFile1?.path}". Active leaf type: "${this.app.workspace.activeLeaf?.view?.getViewType()}"`);

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
      console.log(`[AskFolder] Showing folder modal. Active file now: "${this.app.workspace.getActiveFile()?.path}"`);
      const folder = await this.showFolderModal(allFolders, currentFolderPath);

      if (!folder) {
        dismissed = true;
      } else {
        console.log(`[AskFolder] Folder chosen: "${folder.path}". Active file before move: "${this.app.workspace.getActiveFile()?.path}"`);
        moved = await this.moveFile(file, folder);
        console.log(`[AskFolder] After move. moved=${moved}. Active file now: "${this.app.workspace.getActiveFile()?.path}"`);
      }
    }

    // Re-focus the new file's leaf before triggering Templater.
    // The folder modal closing causes Obsidian to shift focus back to the previous tab.
    await this.focusFile(file);

    const activeFileFinal = this.app.workspace.getActiveFile();
    console.log(`[AskFolder] About to trigger Templater. Active file: "${activeFileFinal?.path}". File we created: "${file.path}"`);
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

  /**
   * Find the leaf displaying the given file and make it the active leaf.
   * Falls back to opening the file in the current leaf if no existing leaf is found.
   */
  private async focusFile(file: TFile): Promise<void> {
    let targetLeaf: WorkspaceLeaf | null = null;

    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file === file) {
        targetLeaf = leaf;
      }
    });

    if (targetLeaf) {
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
    } else {
      // File isn't open in any leaf — open it
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }

    // Give Obsidian a moment to finish the focus/layout change
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log(`[AskFolder] After focusFile. Active file: "${this.app.workspace.getActiveFile()?.path}". Target: "${file.path}"`);
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

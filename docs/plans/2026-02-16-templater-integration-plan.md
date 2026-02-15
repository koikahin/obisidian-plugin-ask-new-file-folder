# Templater Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After folder selection (or dismissal), trigger Templater's template picker via Obsidian's command system.

**Architecture:** Modify the existing single-file plugin (`main.ts`) to chain Templater's `insert-templater` command after the folder modal completes. Handle file conflicts with a retry loop. Add a best-effort warning if Templater's auto-trigger is enabled.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild

**Design doc:** `docs/plans/2026-02-16-templater-integration-design.md`

---

### Task 1: Add `Notice` import and `triggerTemplater` method

**Files:**
- Modify: `main.ts:1` (import line)
- Modify: `main.ts:53-62` (AskFolderPlugin class)

**Step 1: Add `Notice` to the import**

Change line 1 from:
```typescript
import { Plugin, FuzzySuggestModal, TFolder, TFile, TAbstractFile } from "obsidian";
```
to:
```typescript
import { Plugin, FuzzySuggestModal, TFolder, TFile, TAbstractFile, Notice } from "obsidian";
```

**Step 2: Add `triggerTemplater` method to `AskFolderPlugin`**

Add after the `collectFolders` method (after line 110):

```typescript
private triggerTemplater(): void {
  this.app.commands.executeCommandById("templater-obsidian:insert-templater");
}
```

**Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add main.ts
git commit -m "feat: add triggerTemplater method and Notice import"
```

---

### Task 2: Add Templater auto-trigger warning in `onload`

**Files:**
- Modify: `main.ts:56-62` (`onload` method)

**Step 1: Add warning check at the end of `onload`**

After the existing `registerEvent` block (after line 61), add:

```typescript
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
```

Note: `this.app.plugins` is not in Obsidian's public types, so we cast through `any`. The try/catch ensures this never breaks the plugin.

**Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add main.ts
git commit -m "feat: warn if Templater auto-trigger is enabled on load"
```

---

### Task 3: Restructure `handleCreate` to always trigger Templater after folder modal

**Files:**
- Modify: `main.ts:64-93` (`handleCreate` method)
- Modify: `main.ts:3-51` (`FolderSuggestModal` constructor/callbacks)

**Step 1: Change the modal callbacks to both call `triggerTemplater`**

Replace the modal creation block (lines 81-92) with:

```typescript
const modal = new FolderSuggestModal(
  this,
  allFolders,
  currentFolderPath,
  async (folder: TFolder) => {
    await this.moveFile(file, folder);
    this.triggerTemplater();
  },
  () => {
    // dismissed — leave file where it is, still trigger Templater
    this.triggerTemplater();
  }
);
modal.open();
```

Both the `onChoose` and `onDismiss` callbacks now call `triggerTemplater()`. The `onChoose` callback is now `async` because `moveFile` is async and we need to wait for the move to complete before triggering Templater.

**Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add main.ts
git commit -m "feat: trigger Templater template picker after folder selection or dismissal"
```

---

### Task 4: Handle file conflicts with retry loop in `moveFile`

**Files:**
- Modify: `main.ts:112-129` (`moveFile` method)
- Modify: `main.ts:64-93` (`handleCreate` method)

This is the most involved change. The current `moveFile` silently returns on conflict. We need it to show a warning and re-open the folder modal.

**Step 1: Extract folder modal display into its own method**

Create a new `showFolderModal` method that returns a `Promise<TFolder | null>` (null = dismissed):

```typescript
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
```

**Step 2: Rewrite `handleCreate` to use the extracted method and a retry loop**

Replace `handleCreate` (lines 64-93) with:

```typescript
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
```

**Step 3: Change `moveFile` to return success/failure and show conflict notice**

Replace `moveFile` (lines 112-129) with:

```typescript
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
```

Key changes:
- Returns `boolean` — `true` if move succeeded (including same-path no-op), `false` if conflict
- Shows `Notice` on conflict instead of silently returning
- Same-path case returns `true` (no move needed, not a conflict)

**Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add main.ts
git commit -m "feat: retry folder selection on file conflict with warning notice"
```

---

### Task 5: Manual verification in Obsidian

**No code changes. Manual testing only.**

**Step 1: Build the final plugin**

Run: `npm run build`

**Step 2: Test in Obsidian — verify these scenarios:**

1. **Happy path:** Create new `.md` file → folder modal appears → pick folder → file moves → Templater modal appears
2. **Dismiss folder modal:** Create new `.md` file → folder modal appears → press Escape → file stays → Templater modal still appears
3. **File conflict:** Create new `.md` file with same name as existing file in target folder → warning notice → folder modal re-appears → pick different folder → works
4. **Templater not installed:** Disable Templater → create new `.md` file → folder modal works → no Templater modal (graceful)
5. **Auto-trigger warning:** Enable Templater's auto-trigger → reload plugin → warning notice appears
6. **Non-md file:** Create a `.canvas` or other file → nothing happens (plugin ignores)

**Step 3: Commit build output**

```bash
git add main.js
git commit -m "build: compile plugin for Obsidian"
```

---

## File change summary

| File | Changes |
|---|---|
| `main.ts:1` | Add `Notice` to imports |
| `main.ts:56-62` | Add Templater auto-trigger warning in `onload` |
| `main.ts:64-93` | Rewrite `handleCreate` with retry loop, always call `triggerTemplater` |
| `main.ts:112-129` | Change `moveFile` to return `boolean`, add conflict notice |
| `main.ts` (new methods) | Add `triggerTemplater()`, `showFolderModal()` |

No new files created. No dependencies added. No settings UI.

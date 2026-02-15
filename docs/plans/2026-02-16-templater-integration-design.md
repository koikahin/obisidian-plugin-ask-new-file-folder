# Templater Integration Design

## Overview

Add template selection to the Ask New File Folder plugin by triggering Templater's own template picker after the folder selection step. Uses only Obsidian's stable command system to minimize coupling.

## Flow

```
create event (.md file)
  -> folder modal opens
    -> user picks folder -> move file (loop if conflict, with warning)
    -> user dismisses -> file stays in place
  -> trigger templater-obsidian:insert-templater command
```

Templater's template picker fires in every case. The only way to skip it is to not create a `.md` file.

## Code Changes

All changes in `main.ts`. No new files.

### Modified: `FolderSuggestModal`

- `onClose`: trigger Templater on dismiss (not just on choose)

### Modified: `moveFile`

- Handle file conflicts: show `Notice` warning that file already exists, re-open folder modal
- Loop until user picks a valid folder or dismisses

### New: `triggerTemplater()`

- Calls `app.commands.executeCommandById("templater-obsidian:insert-templater")`
- If Templater not installed/disabled, command returns false silently — graceful degradation
- May need `app.workspace.getLeaf().openFile(file)` before triggering to ensure file is active

### New: Templater auto-trigger warning (in `onload`)

- Check `app.plugins.plugins["templater-obsidian"]?.settings?.trigger_on_file_creation`
- If enabled, show: "Ask New File Folder plugin: Templater's auto-trigger is enabled. Disable it to avoid conflicts."
- Wrapped in try/catch — if Templater changes settings structure, warning silently stops appearing
- Shows once on load, not per file creation

## Edge Cases

| Scenario | Behavior |
|---|---|
| Templater not installed | Folder picker works normally, no template modal |
| Templater installed but disabled | Same as not installed |
| User dismisses folder modal | File stays in place, Templater modal still opens |
| User dismisses Templater modal | File is in chosen folder (or original), no template applied |
| File conflict on move | Warning notice, folder modal re-opens, loop until resolved |
| Templater auto-trigger enabled | Warning notice on plugin load |

## Coupling Surface

- One command string: `"templater-obsidian:insert-templater"`
- One best-effort settings check: `plugins["templater-obsidian"]?.settings?.trigger_on_file_creation` (non-critical, wrapped in try/catch)

## User Prerequisite

Disable Templater's "Trigger on file creation" setting to avoid race conditions.

## What Does NOT Change

- `onload` event registration logic
- `handleCreate` filtering logic
- `getAllFolders` / `collectFolders`
- No new settings UI or settings tab
- No Templater imports or de facto API usage for core functionality

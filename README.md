# Ask New File Folder

An [Obsidian](https://obsidian.md) plugin that prompts you to choose a folder every time you create a new markdown file.

By default, Obsidian drops new files into a fixed location. This plugin intercepts file creation and opens a fuzzy-search folder picker so you can place the file exactly where you want it.

## Features

- **Folder picker on every new file** - A fuzzy-search modal appears whenever a `.md` file is created, listing all vault folders sorted with the current folder first.
- **File conflict handling** - If a file with the same name already exists in the chosen folder, you get a warning and the picker re-opens so you can choose a different location.
- **Templater integration** - After folder selection (or dismissal), the plugin triggers Templater's template picker so you can apply a template to the new file. Works gracefully when Templater isn't installed.
- **Dismiss to keep in place** - Press Escape to skip folder selection and leave the file where Obsidian originally created it.

## Installation

1. Clone or download this repository
2. Run `npm install && npm run build`
3. Copy `main.js` and `manifest.json` into your vault's `.obsidian/plugins/ask-new-file-folder/` directory
4. Restart Obsidian
5. Enable the plugin in **Settings > Community plugins**

## Usage with Templater

If you use the [Templater](https://github.com/SilentVoid13/Templater) plugin, disable its **"Trigger Templater on new file creation"** setting to avoid conflicts. This plugin will trigger Templater's template picker itself after the folder selection step.

## Building from Source

```bash
npm install
npm run build
```

For development with auto-rebuild on changes:

```bash
npm run dev
```

import esbuild from "esbuild";
import builtins from "builtin-modules";
import process from "process";

const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}

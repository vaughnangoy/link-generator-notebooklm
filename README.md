# Link Generator for NotebookLM

A macOS desktop app that takes a URL, fetches the page, and extracts a curated list of links to other pages — ready to paste into [NotebookLM](https://notebooklm.google.com/) as sources.

Built with [Tauri 2](https://tauri.app/) (Rust backend + React/TypeScript frontend).

## What it does

1. **Paste a URL** — the app fetches the page and instantly returns candidate links.
2. **Background validation** — each link is checked in parallel to confirm it has real article content. Skeleton placeholders animate while validation runs.
3. **Select links** — check individual links or use "Select all", then copy the URLs to your clipboard in one click.
4. **Preview** — click any link title to see a preview pane with its URL and a button to open it in your browser.
5. **History** — every extraction run is saved to a local SQLite database with zero overwrites. History is grouped by URL, with each run stored as a separate timestamped snapshot. You can collapse/expand groups and snapshots, select across multiple runs, and delete individual snapshots.

## Building a production version

Requirements: [Rust](https://www.rust-lang.org/tools/install), [Node.js](https://nodejs.org/), Xcode Command Line Tools.

```bash
npm install
npm run tauri build
```

The compiled app is output to:

```
src-tauri/target/release/bundle/macos/Link Generator for NotebookLM.app
```

Copy it to `/Applications` or double-click to run. On first launch macOS Gatekeeper will block an unsigned app — right-click the `.app` and choose **Open** to bypass it.

## How to use it

1. Launch the app.
2. Paste any URL into the input bar at the top (e.g. `https://news.ycombinator.com/newest`).
3. Press **Enter** or click **Extract**. Candidate links appear immediately; a progress bar shows background validation.
4. Check the links you want. Use the **Select all** checkbox to grab everything.
5. Click **Copy** to copy all selected URLs to your clipboard.
6. Paste into NotebookLM's "Add sources" dialog.

To revisit a previous extraction, switch to the **History** tab, expand a URL group, and click any timestamped snapshot to reload its links.

## Development

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm install`         | Install dependencies                            |
| `npm run tauri dev`   | Start the app in development mode (hot reload)  |
| `npm run tauri build` | Build a production `.app` bundle                |
| `npm run dev`         | Start the Vite frontend only (no native window) |

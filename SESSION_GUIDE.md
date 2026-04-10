# Link Generator for NotebookLM — Session Guide & Learning Path

## Part 1: Session Prompts (Chronological)

| #   | Prompt                                                                                 | What It Produced                                                                                          |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | _"What's the best framework for making a macOS desktop app in TypeScript in 2026?"_    | Recommendation: **Tauri 2** (Rust backend + web frontend)                                                 |
| 2   | _"Git init and setup Tauri 2"_                                                         | Scaffolded project with Vite + React + TypeScript, updated Rust toolchain                                 |
| 3   | _"Add key commands to README"_                                                         | Commands table in README.md                                                                               |
| 4   | _Described the app: URL link extractor for NotebookLM with checkboxes, previews, copy_ | Detailed implementation plan                                                                              |
| 5   | _"Start implementation"_                                                               | Full Rust backend (`extract_links` with content detection) + React frontend (5 components) + Tauri config |
| 6   | _"Add select all checkbox"_                                                            | Select-all toggle in LinkList component                                                                   |
| 7   | _"Open the app"_                                                                       | Ran `npm run tauri dev`                                                                                   |
| 8   | _"Add history pane with tabs"_                                                         | Tab bar (Links/History), HistoryList component, localStorage persistence                                  |
| 9   | _"Smarter content extraction — only main body links"_                                  | 3-tier extraction strategy: semantic selectors → nav exclusion → fallback                                 |
| 10  | _"Deep changes: content validation per link, SQLite DB, collapsible history tree"_     | Major rewrite: SQLite persistence, `has_article_content` validation, hierarchical HistoryList             |
| 11  | _"It's taking way too long — need a status bar"_                                       | Streaming Tauri events, parallel validation (6 threads), status bar component                             |
| 12  | _"Sort the history out"_                                                               | History copy support, relative timestamps, accurate selection counts                                      |
| 13  | _"Still slow — batch of 10, parallel process, update UI batch by batch"_               | Batch size → 10, `batch-complete` events, single GET (removed HEAD), faster timeouts                      |
| 14  | _"Benchmark it — 30 seconds for anything to appear, needs to be instant"_              | **Architecture rewrite**: 2-phase async (instant candidates → background validation), 8× speedup          |
| 15  | _"Animated shadow placeholders for the list, replace with valid links as processed"_   | Skeleton shimmer rows with CSS animation, progressive reveal                                              |
| 16  | _"Status bar should be permanent"_                                                     | Always-visible status bar with contextual idle info                                                       |
| 17  | _"How to produce a production version for macOS"_                                      | `npm run tauri build` → `.app` + `.dmg`                                                                   |
| 18  | _"Make a splash screen using this image"_                                              | Dual-window Tauri config, splash HTML with animated loading bar, 2.5s transition                          |
| 19  | _"Extract all prompts into a learning guide"_                                          | This document                                                                                             |

---

## Part 2: What Was Built

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Tauri 2 Shell                   │
│  ┌───────────────────┐  ┌────────────────────┐  │
│  │   Rust Backend    │  │  React Frontend    │  │
│  │   (src-tauri/)    │◄─┤  (src/)            │  │
│  │                   │  │                    │  │
│  │  • HTTP fetching  │  │  • UrlInput        │  │
│  │  • HTML parsing   │  │  • LinkList        │  │
│  │  • Link extract   │  │  • Preview         │  │
│  │  • Validation     │  │  • CopyButton      │  │
│  │  • SQLite DB      │  │  • HistoryList     │  │
│  │  • Event emitter  │  │  • Status bar      │  │
│  └───────────────────┘  └────────────────────┘  │
│              ▲  Tauri Commands + Events  ▲       │
└─────────────────────────────────────────────────┘
```

### File Structure

```
link-generator-notebooklm/
├── src/                          # React + TypeScript frontend
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Main app: state, event listeners, layout
│   ├── App.css                   # All styles (dark mode, shimmer, status bar)
│   ├── types.ts                  # Shared TypeScript interfaces
│   └── components/
│       ├── UrlInput.tsx          # URL input + Extract button
│       ├── LinkList.tsx          # Checkbox list with skeleton placeholders
│       ├── Preview.tsx           # iframe preview (YouTube embed or web)
│       ├── CopyButton.tsx        # Copy selected URLs to clipboard
│       └── HistoryList.tsx       # Collapsible tree with relative timestamps
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri config (windows, CSP, bundle)
│   └── src/
│       ├── main.rs               # Entry point → calls lib::run()
│       └── lib.rs                # All backend logic (673 lines)
├── public/
│   ├── splash.html               # Splash screen page
│   └── splash.png                # Splash screen artwork
└── package.json                  # Node dependencies + scripts
```

### Key Features

1. **URL extraction** — Paste any URL, get a list of outbound links
2. **Smart filtering** — 3-tier strategy to find main content links (not nav/footer)
3. **Content validation** — Each link checked for real article content (>50 words in `<p>` or semantic tags)
4. **YouTube playlist support** — Parses `ytInitialData` JSON for video lists
5. **Skeleton loading** — Animated shimmer placeholders while validating
6. **Parallel processing** — 10-thread batches with streaming events
7. **SQLite history** — Persistent collapsible tree of past extractions
8. **Copy to clipboard** — Works on both Links and History tabs
9. **Splash screen** — Borderless window with custom artwork on startup
10. **Production build** — `.app` bundle + `.dmg` installer

---

## Part 3: Step-by-Step Build Guide

### Step 1: Project Scaffolding

```bash
# Install prerequisites
rustup update
npm install -g @tauri-apps/cli

# Scaffold a new Tauri 2 + React + TypeScript project
npm create tauri-app@latest link-generator-notebooklm -- \
  --template react-ts --manager npm

cd link-generator-notebooklm
npm install
```

**Concepts learned:**

- Tauri project structure (Rust backend + web frontend)
- Vite as the frontend build tool
- TypeScript configuration with `tsconfig.json`

### Step 2: Define TypeScript Interfaces

```typescript
// src/types.ts
export interface LinkItem {
  title: string;
  url: string;
  link_type: "webpage" | "youtube";
}

export interface HistoryEntry {
  id: number;
  url: string;
  timestamp: number;
  children: HistoryChild[];
}
```

**Concepts learned:**

- TypeScript interfaces and union types
- Shared types between components

### Step 3: Build the Rust Backend

Key Rust crates added to `Cargo.toml`:

```toml
reqwest = { version = "0.12", features = ["blocking"] }  # HTTP client
scraper = "0.22"                                          # HTML DOM parsing
regex = "1"                                               # Pattern matching
url = "2"                                                 # URL parsing/resolving
rusqlite = { version = "0.32", features = ["bundled"] }   # SQLite database
```

**Backend components built:**

| Function                                                        | Purpose                                              |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `build_client()`                                                | Creates an HTTP client with timeouts and user-agent  |
| `extract_webpage_links()`                                       | 3-tier link extraction from HTML                     |
| `extract_youtube_playlist()`                                    | Parses YouTube `ytInitialData` JSON                  |
| `has_article_content()`                                         | Validates a URL has real article content             |
| `extract_links` (command)                                       | Fetches page → parses candidates → returns instantly |
| `validate_links` (command)                                      | Background validation with event streaming           |
| `get_history` / `load_history_links` / `delete_history_entries` | SQLite CRUD                                          |

**Concepts learned:**

- Rust ownership, borrowing, and lifetimes
- `Arc<Mutex<T>>` for shared state across threads
- `std::thread::spawn` for parallelism
- Tauri command system (`#[tauri::command]`)
- Tauri event emission (`app_handle.emit()`)
- SQLite with `rusqlite` (prepared statements, parameterized queries)
- HTML parsing with `scraper` (CSS selectors on a DOM)
- Error handling with `Result<T, String>` and `.map_err()`

### Step 4: Build React Components

**Component hierarchy:**

```
App
├── UrlInput          — Controlled input + button
├── CopyButton        — Clipboard API
├── Tab bar           — Links / History toggle
├── LinkList          — Checkbox list with skeleton shimmer
│   └── Skeleton rows — CSS animation placeholders
├── Preview           — iframe (YouTube embed or web page)
├── HistoryList       — Collapsible tree with relative timestamps
└── Status bar        — Permanent footer with progress/idle info
```

**Concepts learned:**

- React 19 with hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
- Controlled components (UrlInput value/onChange)
- Set and Map in state (`Set<number>`, `Map<string, boolean>`)
- Conditional rendering and derived state (`displayLinks`)
- Component composition and prop drilling
- Tauri frontend API:
  - `invoke()` for calling Rust commands
  - `listen()` for receiving Rust events
  - `UnlistenFn` cleanup pattern

### Step 5: Implement the Two-Phase Async Architecture

This was the critical performance insight:

```
BEFORE (synchronous — 23s to first link):
  invoke("extract_links") ──blocks──▶ fetch + parse + validate ALL ──▶ return

AFTER (async — 2.8s to first link):
  invoke("extract_links") ──▶ fetch + parse ──▶ return candidates INSTANTLY
  invoke("validate_links") ──▶ background thread ──emits events──▶ UI updates
```

**Frontend event flow:**

```typescript
// 1. Set up listeners BEFORE invoking
const unlistenValidated = await listen("link-validated", (event) => {
  setCheckedUrls((prev) =>
    new Map(prev).set(event.payload.url, event.payload.valid),
  );
});

// 2. Get candidates instantly
const candidates = await invoke("extract_links", { url });
setLinks(candidates); // Show immediately as skeleton rows

// 3. Kick off background validation (don't await)
invoke("validate_links", { url, candidates });
```

**Concepts learned:**

- Async/await with Tauri commands
- Event-driven architecture (pub/sub between Rust and JS)
- Optimistic UI (show data immediately, refine later)
- Background thread spawning in Rust

### Step 6: Add Skeleton Loading Animation

```css
@keyframes shimmer {
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
}

.skeleton-text {
  background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
  background-size: 400px 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}
```

**Concepts learned:**

- CSS `@keyframes` animation
- `linear-gradient` for shimmer effects
- `background-size` + `background-position` animation trick
- Conditional class rendering in React

### Step 7: Add SQLite Persistence

```rust
fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS master_links (...);
         CREATE TABLE IF NOT EXISTS sub_links (...);"
    );
}
```

**Concepts learned:**

- SQLite schema design (parent/child relationships)
- Foreign keys with `ON DELETE CASCADE`
- `rusqlite` query mapping with closures
- Tauri managed state (`app.manage()` + `tauri::State<'_>`)
- App data directory (`app.path().app_data_dir()`)

### Step 8: Add Splash Screen

```json
// tauri.conf.json — two windows
{
  "windows": [
    { "label": "main", "visible": false, ... },
    { "label": "splash", "url": "splash.html", "decorations": false, ... }
  ]
}
```

```rust
// Close splash after 2.5s, show main
std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(2500));
    splash.close();
    main.show();
});
```

**Concepts learned:**

- Tauri multi-window configuration
- Window management (`visible`, `decorations`, `resizable`)
- `get_webview_window()` API
- Serving static HTML alongside the SPA

### Step 9: Production Build

```bash
npm run tauri build
# Outputs:
#   src-tauri/target/release/bundle/macos/*.app
#   src-tauri/target/release/bundle/dmg/*.dmg
```

**Concepts learned:**

- Vite production build (`tsc && vite build`)
- Rust release compilation optimizations
- macOS `.app` bundle structure
- DMG installer packaging

---

## Part 4: Learning Path & Documentation Links

### Tier 1: Foundations

| Topic                  | What to Learn                                   | Documentation                                                                   |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| **Rust basics**        | Ownership, borrowing, lifetimes, error handling | [The Rust Book](https://doc.rust-lang.org/book/)                                |
| **TypeScript basics**  | Types, interfaces, generics, union types        | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)            |
| **React fundamentals** | Components, hooks, state, effects               | [React Docs](https://react.dev/learn)                                           |
| **CSS layout**         | Flexbox, grid, responsive design                | [MDN CSS Layout](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout) |
| **HTML/DOM**           | Semantic HTML, DOM API                          | [MDN HTML Guide](https://developer.mozilla.org/en-US/docs/Learn/HTML)           |

### Tier 2: Framework-Specific

| Topic              | What to Learn                                     | Documentation                                                           |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| **Tauri 2**        | Commands, events, windows, config, plugins        | [Tauri v2 Docs](https://v2.tauri.app/)                                  |
| **Tauri commands** | `#[tauri::command]`, `invoke()`, state management | [Tauri Commands Guide](https://v2.tauri.app/develop/calling-rust/)      |
| **Tauri events**   | `Emitter`, `listen()`, frontend↔backend messaging | [Tauri Events Guide](https://v2.tauri.app/develop/calling-rust/#events) |
| **Vite**           | Dev server, HMR, build config, public dir         | [Vite Docs](https://vite.dev/guide/)                                    |
| **React 19**       | Hooks, controlled inputs, derived state           | [React Reference](https://react.dev/reference/react)                    |

### Tier 3: Rust Crates Used

| Crate        | Purpose                         | Documentation                                     |
| ------------ | ------------------------------- | ------------------------------------------------- |
| **reqwest**  | HTTP client (blocking mode)     | [reqwest docs](https://docs.rs/reqwest/latest/)   |
| **scraper**  | HTML parsing with CSS selectors | [scraper docs](https://docs.rs/scraper/latest/)   |
| **rusqlite** | SQLite database bindings        | [rusqlite docs](https://docs.rs/rusqlite/latest/) |
| **serde**    | Serialization/deserialization   | [serde docs](https://serde.rs/)                   |
| **regex**    | Regular expressions             | [regex docs](https://docs.rs/regex/latest/)       |
| **url**      | URL parsing and resolution      | [url docs](https://docs.rs/url/latest/)           |

### Tier 4: Advanced Patterns

| Pattern                       | Where Used                        | Learn More                                                                                             |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Arc<Mutex<T>>**             | Shared state across threads       | [Rust Book Ch.16](https://doc.rust-lang.org/book/ch16-03-shared-state.html)                            |
| **Thread spawning & joining** | Parallel link validation          | [Rust Book Ch.16](https://doc.rust-lang.org/book/ch16-01-threads.html)                                 |
| **Event-driven architecture** | Streaming validation results      | [Tauri Events](https://v2.tauri.app/develop/calling-rust/#events)                                      |
| **Optimistic UI**             | Show candidates, validate later   | [Patterns.dev](https://www.patterns.dev/react/optimistic-ui/)                                          |
| **Skeleton loading**          | CSS shimmer animation             | [CSS Tricks Skeleton Screens](https://css-tricks.com/building-skeleton-screens-css-custom-properties/) |
| **Content Security Policy**   | Controlling iframe/script sources | [MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)                                 |
| **Multi-window apps**         | Splash screen pattern             | [Tauri Windows](https://v2.tauri.app/reference/config/#windowconfig)                                   |

### Tier 5: Tooling & DevOps

| Tool          | Purpose                           | Documentation                                              |
| ------------- | --------------------------------- | ---------------------------------------------------------- |
| **Cargo**     | Rust package manager & build tool | [Cargo Book](https://doc.rust-lang.org/cargo/)             |
| **npm**       | Node package manager              | [npm Docs](https://docs.npmjs.com/)                        |
| **Vite**      | Frontend dev server + bundler     | [Vite Docs](https://vite.dev/)                             |
| **rustup**    | Rust toolchain manager            | [rustup Docs](https://rust-lang.github.io/rustup/)         |
| **Tauri CLI** | Build, dev, icon generation       | [Tauri CLI Reference](https://v2.tauri.app/reference/cli/) |

---

## Part 5: Key Lessons Learned

1. **Architecture matters more than optimization** — Moving validation to a background thread (prompt 14) gave an 8× speedup, more than any timeout/batch tuning.

2. **Show something immediately** — The shift from "wait for everything" to "show candidates instantly with skeletons" transformed the perceived performance.

3. **Tauri events bridge the async gap** — Rust threads can't return values directly to the frontend, but events (`emit` + `listen`) create a real-time data channel.

4. **SQLite is perfect for desktop apps** — No server needed, bundled with the binary, handles the history use case with zero configuration.

5. **CSS can do a lot** — Skeleton shimmer, dark mode via `prefers-color-scheme`, flexbox layouts — no UI framework needed beyond React itself.

6. **Iterate in small steps** — Each prompt refined one aspect. The app evolved from a basic extractor to a polished desktop tool through 18 incremental improvements.

---

_Generated from a VS Code Copilot session — April 10, 2026_

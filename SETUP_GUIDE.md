# Setup Guide - Fresh Mac Installation

Complete guide to set up and run the Link Generator for NotebookLM on a fresh macOS system.

## Prerequisites Installation

### Step 1: Install Homebrew

Homebrew is a package manager for macOS that makes installing development tools easy.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After installation completes, follow the on-screen instructions to add Homebrew to your PATH. You'll need to run commands similar to:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Verify Homebrew is installed:

```bash
brew --version
```

### Step 2: Install Xcode Command Line Tools

Required for compiling Rust and native dependencies. This also includes Git.

```bash
xcode-select --install
```

A dialog will appear - click **Install** and accept the license agreement. This may take several minutes.

Verify installation:

```bash
xcode-select -p
# Should output: /Library/Developer/CommandLineTools

git --version
# Should output: git version 2.x.x
```

### Step 3: Install Rust

Rust is required for the Tauri backend.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, select option **1** (default installation).

After installation, reload your shell configuration:

```bash
source $HOME/.cargo/env
```

Verify Rust is installed:

```bash
rustc --version
cargo --version
```

### Step 4: Install Node.js

Using Homebrew to install Node.js (includes npm):

```bash
brew install node
```

Verify installation:

```bash
node --version
npm --version
```

**Alternative:** If you prefer using a Node version manager like `nvm`:

```bash
brew install nvm
mkdir ~/.nvm
```

Then add to your `~/.zshrc`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
```

Reload shell and install Node:

```bash
source ~/.zshrc
nvm install --lts
nvm use --lts
```

## Project Setup

### Step 5: Clone the Repository

```bash
# Navigate to where you want to store the project
cd ~/code  # or your preferred directory

# Clone the repository
git clone https://github.com/YOUR_USERNAME/link-generator-notebooklm-PERSONAL.git

# Navigate into the project
cd link-generator-notebooklm-PERSONAL
```

### Step 6: Install Project Dependencies

Install Node.js dependencies:

```bash
npm install
```

This will install:

- React and React DOM
- Tauri API and plugins
- TypeScript and build tools
- All development dependencies

Rust dependencies are automatically downloaded when you first build/run the app.

## Running the Application

### Development Mode (Hot Reload)

Run the app in development mode with hot reload enabled:

```bash
npm run tauri dev
```

The first run will take several minutes as Rust compiles all dependencies. Subsequent runs are much faster.

### Build for Production

To create a production build:

```bash
npm run tauri build
```

The compiled app will be output to:

```
src-tauri/target/release/bundle/macos/Link Generator for NotebookLM.app
```

#### Installing the Production Build

1. **Copy to Applications:**

   ```bash
   cp -r "src-tauri/target/release/bundle/macos/Link Generator for NotebookLM.app" /Applications/
   ```

2. **First Launch - Bypass Gatekeeper:**
   - Right-click the app in `/Applications`
   - Select **Open**
   - Click **Open** in the security dialog

   Alternatively, from the command line:

   ```bash
   open "/Applications/Link Generator for NotebookLM.app"
   ```

## Troubleshooting

### Command Not Found Errors

If you get "command not found" errors after installing Rust or Node:

```bash
# Reload your shell configuration
source ~/.zshrc
# or
exec zsh
```

### Rust Compilation Errors

If you encounter Rust compilation errors:

```bash
# Update Rust to the latest version
rustup update

# Clean the build cache and rebuild
cd src-tauri
cargo clean
cd ..
npm run tauri dev
```

### Node/npm Permission Errors

If you get permission errors with npm:

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
```

### Port Already in Use

If the Vite dev server port (usually 1420) is already in use:

```bash
# Find and kill the process using the port
lsof -ti:1420 | xargs kill -9
```

### macOS Gatekeeper Blocks the App

For unsigned apps, macOS Gatekeeper will block execution:

1. Go to **System Settings** → **Privacy & Security**
2. Scroll down to find the blocked app warning
3. Click **Open Anyway**

Or use the command line:

```bash
xattr -cr "/Applications/Link Generator for NotebookLM.app"
```

## Available Commands

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm install`         | Install dependencies                            |
| `npm run tauri dev`   | Start the app in development mode (hot reload)  |
| `npm run tauri build` | Build a production `.app` bundle                |
| `npm run dev`         | Start the Vite frontend only (no native window) |
| `npm run build`       | Build the frontend only                         |

## System Requirements

- **macOS**: 10.15 (Catalina) or later
- **Disk Space**: ~2GB for all development tools and dependencies
- **RAM**: 4GB minimum, 8GB recommended
- **Internet**: Required for initial setup and dependency downloads

## Next Steps

After successful setup:

1. Launch the app with `npm run tauri dev`
2. Paste any URL into the input bar
3. Press Enter or click Extract
4. Select the links you want
5. Click Copy to copy URLs to clipboard
6. Paste into NotebookLM

For more details on how to use the app, see [README.md](README.md).

## Verification Checklist

Before running the app, verify all prerequisites are installed:

- [ ] Homebrew installed: `brew --version`
- [ ] Xcode Command Line Tools: `xcode-select -p`
- [ ] Git installed: `git --version`
- [ ] Rust installed: `rustc --version`
- [ ] Cargo installed: `cargo --version`
- [ ] Node.js installed: `node --version`
- [ ] npm installed: `npm --version`
- [ ] Project dependencies installed: `npm install` completed successfully
- [ ] Repository cloned and in project directory

If all checks pass, you're ready to run:

```bash
npm run tauri dev
```

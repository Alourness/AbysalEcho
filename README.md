# AbyssalEcho

A fast-paced 2D top-down plasma action game set in a stone arena with real-time WebGL GLSL shader lighting, dynamic combat effects, and multi-phase boss fights.

## Features

- **Real-Time WebGL Lighting:** Dynamic glow from lasers, explosions, plasma trails, and arena braziers.
- **3 Handcrafted Levels:**
  - **Level 1:** 15 enemies — arena warm-up.
  - **Level 2:** 40 enemies + Titan boss fight with precision aiming lasers.
  - **Level 3:** 55 enemies, elite shooting/dashing squads, dual Titans, and the **Aegis Overlord** boss with a rotating barrier and radial plasma bursts.
- **Combat & Stamina:** Guided plasma beam, charged plasma shot, and a ramming force shield (`+40%` speed, destroys enemies on contact, deflects projectiles).
- **2-Second Damage Cooldown:** Brief invulnerability window with ground lightning effects after taking a hit.
- **Desktop & Standalone Build:** Runs in a clean standalone desktop window or compiles into a portable `AbyssalEcho.exe`.

## Controls

| Input | Action |
| :--- | :--- |
| **Mouse Cursor** | Move and steer (farther cursor = faster movement) |
| **Right Click (Hold)** | Aim guided plasma beam |
| **Right Click (Release)** | Fire plasma projectile |
| **Space** | Activate ramming force shield |
| **Esc** | Pause game |

## Quick Start (WebGL Version)

> **Windows note:** Make sure the project folder path does not contain `&` (e.g., rename the folder to `AbyssalEcho`).

**Requirements:** [Node.js](https://nodejs.org/) (LTS)

### One-Click Launch (Windows)
Double-click **`START_GAME.bat`** to install dependencies (first run only) and open the game in a standalone `920×740` desktop window.

### Terminal / VS Code
```bash
npm install --legacy-peer-deps
npm run dev
```
*(In Windows PowerShell, use `npm.cmd` if script execution is restricted.)*

## Build Portable `.exe` (Windows)

Run **`BUILD_EXE.bat`**, or execute:
```bash
npm run package-exe
```
The compiled **`AbyssalEcho.exe`** will be generated inside the `dist/` folder.

## Python Edition (Pygame + ModernGL)

A native Python version is also included in the root directory.

```bash
pip install -r requirements.txt
python main.py
```

## Project Structure

- `src/components/GameCanvas.tsx` — Main WebGL shader engine, 3 levels, bosses, audio, and UI
- `electron-main.cjs` — Electron wrapper for standalone desktop builds
- `START_GAME.bat` / `BUILD_EXE.bat` — Windows launcher and `.exe` builder
- `main.py`, `engine.py`, `game.py`, `boss.py`, `entities.py`, `ui.py`, `audio.py`, `config.py` — Native Python (Pygame + ModernGL) edition

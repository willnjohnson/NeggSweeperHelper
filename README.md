# Neopets NeggSweeper Helper & Autoplayer

This repository contains two GreaseMonkey scripts, a helper (visual guide) and an autoplayer (auto-clicker + logic solver) for the NeggSweeper game on Neopets.

## Features

### NeggSweeper Helper

* **Real-Time Solver Logic:**
  * Highlights safe tiles based on Minesweeper logic.
  * Calculates and flags tiles that are most likely to be traps (i.e., bad neggs or empty neggs).

* **Visual Assistance:**
  * Uses color-coded tiles to help you make the safest decision possible.
  * Safe tiles are marked in green; suspected traps in red.

### NeggSweeper Autoplayer

* **Automatic Gameplay:**
  * Autoplays the game using an optimized Minesweeper algorithm.
  * Starts the game, clicks tiles, avoids traps, and completes the game if possible.
  * Automatically clicks “Collect Winnings” and “Play Again” after each round.

* **Human-Like Behavior:**
  * Randomized click timing and pathing to reduce detection risk.
  * Delay values are customizable in the script.

## Installation

These scripts require a user script manager like Tampermonkey or Greasemonkey.

1. **Install a User Script Manager:**

2. **Create a New User Script:**
    * Click the Greasemonkey/Tampermonkey icon in your browser’s toolbar.
    * Select “Create a new script…” or equivalent.

3. **Paste the Script:**
    * Delete any existing boilerplate.
    * Paste the contents of either the `NeggSweeper Helper` or `NeggSweeper Autoplayer` script.

4. **Save the Script:**
    * Save using `Ctrl+S` or via the file menu.

## Usage

1. Navigate to the NeggSweeper game on Neopets.

2. The script will activate automatically:
    * The **Helper** shows safe tiles and potential traps to guide your choices.
    * The **Autoplayer** will play the game on your behalf and restart once finished.

## Compatibility

* **Browser:** Works on Chrome, Firefox, Edge, and Opera with a script manager.
* **Game:** Built specifically for the Neopets NeggSweeper game.

## Contributing

Suggestions and improvements are welcome, although these scripts are already well-optimized. Feel free to share fixes or strategy refinements.

## License

This project is open-source under the MIT License.

**Disclaimer:** "Neopets" is a registered trademark of Neopets, Inc. This is an unofficial fan-made project and is not affiliated with or endorsed by Neopets, Inc.

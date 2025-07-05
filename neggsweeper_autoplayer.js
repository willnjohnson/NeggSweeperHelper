// ==UserScript==
// @name         NeggSweeper Autosolver
// @namespace    GreaseMonkey
// @version      1.0
// @description  Automates NeggSweeper gameplay.
// @author       @willnjohnson
// @match        *://www.neopets.com/games/neggsweeper/neggsweeper.phtml*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // console.log("NeggSweeper Autosolver: Script loaded.");

    // --- Configuration Variables ---
    const MIN_RETRY_DELAY_MS = 1000; // Minimum delay for retrying board parsing or re-evaluating state
    const MAX_RETRY_DELAY_MS = 2000; // Maximum delay for retrying
    const MIN_ACTION_DELAY_MS = 200; // Minimum delay before making a move
    const MAX_ACTION_DELAY_MS = 1000; // Maximum delay before making a move
    const GAME_OVER_RESTART_DELAY_MS = 2500; // Delay before restarting after win/lose screen (e.g., 2.5 seconds)
    const GAME_URL = "https://www.neopets.com/games/neggsweeper/neggsweeper.phtml";
  	const DIFFICULTY = "3" // Hard

    /**
     * Generates a random integer delay between min and max (inclusive).
     * @param {number} min Minimum delay in milliseconds.
     * @param {number} max Maximum delay in milliseconds.
     * @returns {number} A random delay in milliseconds.
     */
    function getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Represents the NeggSweeper game grid and provides methods to parse it from the DOM.
     */
    class NeggSweeperGrid {
        constructor(mainTableElement) {
            if (!mainTableElement) {
                throw new Error("NeggSweeperGrid: Main game table element is required.");
            }
            this.mainTable = mainTableElement;
            this.remaining = 0;
            this.grid = []; // Stores the parsed grid data (e.g., numbers, 'C', 'B')
            this.domCellMap = new Map(); // Maps "r_c" string to the actual <td> DOM element
        }

        /**
         * Parses the content of a single table cell (<td>) based on clarified definitions.
         * @param {HTMLElement} cell The <td> element to parse.
         * @returns {string|number} 'C' for covered/clickable, 'B' for blank/cleared, a number for numbered tiles, or '?' for unknown.
         * @private
         */
        static _parseCellContent(cell) {
            const img = cell.querySelector('img');
            if (img && img.src.includes('images.neopets.com/x/gn.gif')) {
                return 'C'; // Covered/Clickable tile
            }

            const font = cell.querySelector('font > b');
            if (font) {
                const value = parseInt(font.innerText.trim(), 10);
                return isNaN(value) ? '?' : value; // Number or fallback
            }

            const cellInnerHTML = cell.innerHTML.trim();
            // Whitespace are "islands that were cleared"
            return (cellInnerHTML === '' || cellInnerHTML === '&nbsp;') ? 'B' : '?'; // Blank/Cleared tile
        }

        /**
         * Parses the entire NeggSweeper game board from the DOM.
         */
        parse() {
            // Clear previous state
            this.grid = [];
            this.domCellMap = new Map();

            // 1. Get the 'remaining' tiles count
            const remainingElement = this.mainTable.querySelector('tbody > tr[bgcolor="silver"] table[bgcolor="black"] > tbody > tr[bgcolor="white"] > td:first-child > b');
            this.remaining = remainingElement ? parseInt(remainingElement.innerText.trim(), 10) : 0;
            // console.log('NeggSweeperGrid: Remaining Tiles:', this.remaining);

            // 2. Parse the game grid rows
            const gridRows = this.mainTable.querySelectorAll('tbody > tr[bgcolor="silver"] ~ tr[bgcolor="white"]');

            if (gridRows.length === 0) {
                // // console.warn('NeggSweeperGrid: No game grid rows found. Grid might be empty or HTML structure changed.');
                return;
            }

            gridRows.forEach((row, rIdx) => {
                const rowData = [];
                const domCells = row.querySelectorAll('td');
                domCells.forEach((cell, cIdx) => {
                    rowData.push(NeggSweeperGrid._parseCellContent(cell));
                    this.domCellMap.set(`${rIdx}_${cIdx}`, cell); // Store reference to DOM cell
                });
                this.grid.push(rowData);
            });

            // console.log('NeggSweeperGrid: Parsed NeggSweeper Grid (', this.grid.length, 'rows):');
            this.grid.forEach(row => {
                // console.log(row.join('\t'));
            });
        }

        /**
         * Gets the DOM cell element for a given coordinate.
         * @param {number} r Row index.
         * @param {number} c Column index.
         * @returns {HTMLElement|null} The <td> element or null if not found.
         */
        getDomCell(r, c) {
            return this.domCellMap.get(`${r}_${c}`) || null;
        }
    }

    /**
     * Solves the NeggSweeper grid using various strategies.
     */
    class NeggSweeperSolver {
        constructor(initialGrid) {
            // Create a deep copy of the grid to avoid modifying the original parsed grid directly
            this.grid = initialGrid.map(row => [...row]);
            this.rows = this.grid.length;
            this.cols = this.grid[0] ? this.grid[0].length : 0;

            // Store coordinates of identified cells (unused?)
            this.safeCoords = new Set(); // Stores "r_c" strings for safe cells
            this.mineCoords = new Set(); // Stores "r_c" strings for mine cells
            this.uncertainCoords = null; // Stores "[r, c]" array for the best probabilistic guess

            // console.log(`NeggSweeperSolver: Initialized with ${this.rows}x${this.cols} grid.`);
            // console.log('NeggSweeperSolver: Input Grid (DEBUG):');
            this.grid.forEach(row => {
                // console.log(row.join('\t'));
            });
        }

        /**
         * Checks if a given coordinate is within the grid boundaries.
         * @param {number} r Row index.
         * @param {number} c Column index.
         * @returns {boolean} True if valid, false otherwise.
         * @private
         */
        _isValid(r, c) {
            return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
        }

        /**
         * Gets the coordinates of valid neighbors for a given cell.
         * @param {number} r Row index.
         * @param {number} c Column index.
         * @returns {Array<Array<number>>} An array of [row, col] pairs for valid neighbors.
         * @private
         */
        _getNeighbors(r, c) {
            const neighbors = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue; // Skip the cell itself
                    const nr = r + dr;
                    const nc = c + dc;
                    if (this._isValid(nr, nc)) {
                        neighbors.push([nr, nc]);
                    }
                }
            }
            return neighbors;
        }

        /**
         * Applies the primary neighbor-based deduction rules.
         * Marks 'X' for mines and 'S' for safe cells.
         * Updates `this.safeCoords` and `this.mineCoords`.
         * @returns {boolean} True if any changes were made to the grid, false otherwise.
         * @private
         */
        _solveByNeighbors() {
            let changed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cellValue = this.grid[r][c];

                    if (typeof cellValue === 'number') {
                        const neighbors = this._getNeighbors(r, c);
                        let unknownCoveredNeighbors = []; // These are 'C' or '?'
                        let mineNeighborsCount = 0;

                        neighbors.forEach(([nr, nc]) => {
                            if (this.grid[nr][nc] === 'X') {
                                mineNeighborsCount++;
                            } else if (this.grid[nr][nc] === 'C' || this.grid[nr][nc] === '?') {
                                unknownCoveredNeighbors.push([nr, nc]);
                            }
                        });

                        const minesRemaining = cellValue - mineNeighborsCount;

                        // Rule 1: If remaining mines equals unknown covered neighbors, all unknown are mines
                        if (minesRemaining > 0 && minesRemaining === unknownCoveredNeighbors.length) {
                            unknownCoveredNeighbors.forEach(([nr, nc]) => {
                                if (this.grid[nr][nc] !== 'X') {
                                    this.grid[nr][nc] = 'X';
                                    this.mineCoords.add(`${nr}_${nc}`);
                                    changed = true;
                                }
                            });
                        }
                        // Rule 2: If all mines are accounted for, all unknown covered are safe
                        else if (minesRemaining === 0 && unknownCoveredNeighbors.length > 0) {
                            unknownCoveredNeighbors.forEach(([nr, nc]) => {
                                if (this.grid[nr][nc] !== 'S') {
                                    this.grid[nr][nc] = 'S';
                                    this.safeCoords.add(`${nr}_${nc}`);
                                    changed = true;
                                }
                            });
                        }
                    }
                }
            }
            return changed;
        }

        /**
         * Applies a basic "subset" deduction strategy for multiple cells.
         * Updates `this.safeCoords` and `this.mineCoords`.
         * @returns {boolean} True if any changes were made to the grid, false otherwise.
         * @private
         */
        _solveByMultiple() {
            let changed = false;

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cellValue = this.grid[r][c];

                    if (typeof cellValue === 'number') {
                        const neighbors1 = this._getNeighbors(r, c);
                        const unknownCoveredNeighbors1 = neighbors1.filter(([nr, nc]) => this.grid[nr][nc] === 'C' || this.grid[nr][nc] === '?');
                        const mineNeighbors1 = neighbors1.filter(([nr, nc]) => this.grid[nr][nc] === 'X').length;
                        const requiredMines1 = cellValue - mineNeighbors1;

                        neighbors1.forEach(([r2, c2]) => {
                            const cellValue2 = this.grid[r2][c2];
                            if (typeof cellValue2 === 'number') {
                                const neighbors2 = this._getNeighbors(r2, c2);
                                const unknownCoveredNeighbors2 = neighbors2.filter(([nr, nc]) => this.grid[nr][nc] === 'C' || this.grid[nr][nc] === '?');
                                const mineNeighbors2 = neighbors2.filter(([nr, nc]) => this.grid[nr][nc] === 'X').length;
                                const requiredMines2 = cellValue2 - mineNeighbors2;

                                const set1 = new Set(unknownCoveredNeighbors1.map(coord => coord.join(',')));
                                const set2 = new Set(unknownCoveredNeighbors2.map(coord => coord.join(',')));

                                // Check if set1 is a subset of set2
                                const isSubset1of2 = Array.from(set1).every(coord => set2.has(coord));
                                if (isSubset1of2 && set1.size < set2.size) {
                                    const uniqueToSet2 = Array.from(set2).filter(coord => !set1.has(coord)).map(coordStr => coordStr.split(',').map(Number));
                                    const mineDiff = requiredMines2 - requiredMines1;

                                    if (mineDiff === uniqueToSet2.length) {
                                        uniqueToSet2.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'X') {
                                                this.grid[nr][nc] = 'X';
                                                this.mineCoords.add(`${nr}_${nc}`);
                                                changed = true;
                                            }
                                        });
                                    } else if (mineDiff === 0) {
                                        uniqueToSet2.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'S') {
                                                this.grid[nr][nc] = 'S';
                                                this.safeCoords.add(`${nr}_${nc}`);
                                                changed = true;
                                            }
                                        });
                                    }
                                }

                                // Symmetric case: Check if set2 is a subset of set1
                                const isSubset2of1 = Array.from(set2).every(coord => set1.has(coord));
                                if (isSubset2of1 && set2.size < set1.size) {
                                    const uniqueToSet1 = Array.from(set1).filter(coord => !set2.has(coord)).map(coordStr => coordStr.split(',').map(Number));
                                    const mineDiff = requiredMines1 - requiredMines2;

                                    if (mineDiff === uniqueToSet1.length) {
                                        uniqueToSet1.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'X') {
                                                this.grid[nr][nc] = 'X';
                                                this.mineCoords.add(`${nr}_${nc}`);
                                                changed = true;
                                            }
                                        });
                                    } else if (mineDiff === 0) {
                                        uniqueToSet1.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'S') {
                                                this.grid[nr][nc] = 'S';
                                                this.safeCoords.add(`${nr}_${nc}`);
                                                changed = true;
                                            }
                                        });
                                    }
                                }
                            }
                        });
                    }
                }
            }
            return changed;
        }

        /**
         * If no deterministic moves are found, suggests a "best" tile to click.
         * Marks the chosen tile with '?' and updates `this.uncertainCoords`.
         * @returns {boolean} True if a tile was marked, false otherwise.
         * @private
         */
        _solveProbabilistically() {
            let bestGuessCoord = null;
            let minAdjacentNumber = Infinity;

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c] === 'C') { // Only consider truly covered/clickable tiles
                        const neighbors = this._getNeighbors(r, c);
                        let currentMinAdjacentNumber = Infinity;
                        let hasNumberedNeighbor = false;

                        neighbors.forEach(([nr, nc]) => {
                            const neighborValue = this.grid[nr][nc];
                            if (typeof neighborValue === 'number') {
                                hasNumberedNeighbor = true;
                                if (neighborValue < currentMinAdjacentNumber) {
                                    currentMinAdjacentNumber = neighborValue;
                                }
                            }
                        });

                        if (hasNumberedNeighbor && currentMinAdjacentNumber < minAdjacentNumber) {
                            minAdjacentNumber = currentMinAdjacentNumber;
                            bestGuessCoord = [r, c];
                        } else if (!hasNumberedNeighbor && bestGuessCoord === null) {
                            bestGuessCoord = [r, c];
                        }
                    }
                }
            }

            if (bestGuessCoord) {
                const [br, bc] = bestGuessCoord;
                if (this.grid[br][bc] === 'C') {
                    this.grid[br][bc] = '?';
                    this.uncertainCoords = bestGuessCoord;
                    // console.log(`NeggSweeperSolver: Probabilistic guess: Marked [${br}, ${bc}] with '?'.`);
                    return true;
                }
            }
            return false;
        }

        /**
         * Solves the NeggSweeper grid by applying strategies iteratively.
         * @returns {Array<Array<string|number>>} The solved grid.
         */
        solve() {
            let changedInIteration = true;
            let iterationCount = 0;

            this.safeCoords.clear(); // Clear previous solution data
            this.mineCoords.clear();
            this.uncertainCoords = null;

            while (changedInIteration && iterationCount < 100) {
                changedInIteration = false;
                iterationCount++;

                const changedByNeighbors = this._solveByNeighbors();
                const changedByMultiple = this._solveByMultiple();

                if (changedByNeighbors || changedByMultiple) {
                    changedInIteration = true;
                    // console.log(`NeggSweeperSolver: Iteration ${iterationCount}: Changes made (Neighbors: ${changedByNeighbors}, Multiple: ${changedByMultiple}).`);
                } else {
                    // console.log(`NeggSweeperSolver: Iteration ${iterationCount}: No deterministic changes made.`);
                }
            }

            const hasCoveredTiles = this.grid.some(row => row.includes('C'));
            if (!changedInIteration && hasCoveredTiles) {
                this._solveProbabilistically();
            }

            return this.grid;
        }

        /**
         * Returns a list of coordinates for all currently unknown (covered) cells.
         * @returns {Array<Array<number>>} An array of [row, col] pairs.
         */
        getUnknownCells() {
            const unknownCells = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c] === 'C') {
                        unknownCells.push([r, c]);
                    }
                }
            }
            return unknownCells;
        }
    }

    /**
     * Modifies the game table's appearance based on the solved grid.
     */
    class GameBoardVisualizer {
        constructor(gameGridInstance, solvedGrid) {
            if (!gameGridInstance || !gameGridInstance.mainTable) {
                throw new Error("GameBoardVisualizer: NeggSweeperGrid instance with mainTable is required.");
            }
            if (!solvedGrid || solvedGrid.length === 0) {
                // console.warn("GameBoardVisualizer: Solved grid is empty or invalid, no modifications will be applied.");
                this.gameGrid = null;
                this.solvedGrid = null;
                return;
            }
            this.gameGrid = gameGridInstance;
            this.solvedGrid = solvedGrid;
        }

        /**
         * Applies the solution (colors, question marks) to the live HTML table.
         */
        applySolutionToTable() {
            if (!this.gameGrid || !this.gameGrid.mainTable) {
                // console.warn("GameBoardVisualizer: Cannot apply solution, game grid not initialized.");
                return;
            }

            // console.log("GameBoardVisualizer: Applying solution to the game table...");

            this.solvedGrid.forEach((rowData, rowIndex) => {
                rowData.forEach((cellValue, colIndex) => {
                    const domCell = this.gameGrid.getDomCell(rowIndex, colIndex);
                    if (!domCell) {
                        // console.warn(`GameBoardVisualizer: DOM cell not found for [${rowIndex}, ${colIndex}]. Skipping visual update.`);
                        return;
                    }

                    const originalImg = domCell.querySelector('img');

                    // Reset background-color on the TD itself to clear previous states
                    domCell.style.removeProperty('background-color');

                    // Handle cells that were originally clickable (had an image)
                    if (originalImg) {
                        const originalOnClick = originalImg.getAttribute('onclick');

                        // Create a new span element to replace the image
                        const newSpan = document.createElement('span');
                        newSpan.style.cssText = `
                            display: flex !important;
                            justify-content: center !important;
                            align-items: center !important;
                            width: 100% !important;
                            height: 100% !important;
                            cursor: pointer !important; /* Indicate clickable */
                            box-sizing: border-box !important; /* Include padding/border in element's total width and height */
                        `;

                        // Copy all attributes from original img to new span, including onclick
                        Array.from(originalImg.attributes).forEach(attr => {
                            newSpan.setAttribute(attr.name, attr.value);
                        });

                        // Replace the original image with the new span
                        domCell.innerHTML = ''; // Clear existing content (including img)
                        domCell.appendChild(newSpan);

                        switch (cellValue) {
                            case 'S':
                                newSpan.style.setProperty('background-color', 'limegreen', 'important');
                                newSpan.innerHTML = ''; // Safe cells don't need text
                                break;
                            case 'X':
                                newSpan.style.setProperty('background-color', 'red', 'important');
                                newSpan.innerHTML = ''; // Mine cells don't need text
                                newSpan.removeAttribute('onclick'); // Mines are not clickable
                                newSpan.style.removeProperty('cursor'); // Remove cursor pointer
                                break;
                            case '?':
                                newSpan.style.setProperty('background-color', 'yellow', 'important');
                                newSpan.innerHTML = '<font color="black" size="+1"><b>?</b></font>';
                                break;
                            case 'C': // If it remains 'C', revert to original image appearance
                                // Remove the temporary span and re-insert the original image structure
                                domCell.innerHTML = ''; // Clear the span
                                const restoredImg = originalImg.cloneNode(true); // Clone to avoid issues with element being removed
                                restoredImg.style.cssText = ''; // Clear any inline styles from previous runs
                                domCell.appendChild(restoredImg);
                                break;
                            default:
                                // console.warn(`GameBoardVisualizer: Unexpected cell value for original img cell [${rowIndex}, ${colIndex}]: ${cellValue}`);
                                domCell.innerHTML = ''; // Clear content if unexpected
                                break;
                        }
                    } else {
                        // This cell was originally 'B' (blank) or a number.
                        switch (cellValue) {
                            case 'S':
                                domCell.style.setProperty('background-color', 'limegreen', 'important');
                                // Ensure no text if it was originally blank and now safe
                                if (domCell.innerHTML.trim() === '' || domCell.innerHTML.trim() === '&nbsp;') {
                                    domCell.innerHTML = '';
                                }
                                break;
                            case 'X':
                                domCell.style.setProperty('background-color', 'red', 'important');
                                // Ensure no text if it was originally blank and now a mine
                                if (domCell.innerHTML.trim() === '' || domCell.innerHTML.trim() === '&nbsp;') {
                                    domCell.innerHTML = '';
                                }
                                domCell.onclick = null; // Ensure no click handler on the TD for mines
                                domCell.style.removeProperty('cursor');
                                break;
                            case '?': // A '?' on a blank cell should also be clickable
                                domCell.style.setProperty('background-color', 'yellow', 'important');
                                domCell.innerHTML = '<font color="black" size="+1"><b>?</b></font>';
                                domCell.style.setProperty('cursor', 'pointer', 'important');
                                break;
                            default:
                                // For 'B' or numbers, ensure no helper-applied background remains
                                domCell.style.removeProperty('background-color');
                                domCell.style.removeProperty('cursor');
                                break;
                        }
                    }
                });
            });
            // console.log("GameBoardVisualizer: Solution application complete.");
        }
    }

    /**
     * Orchestrates the NeggSweeper automation.
     */
    class GameAutomation {
        constructor() {
            this.gameParser = null;
            this.solver = null;
            this.visualizer = null;
        }

        /**
         * Simulates a click on a game cell.
         * It finds the appropriate DOM element and triggers its click handler.
         * @param {number} r Row index of the cell.
         * @param {number} c Column index of the cell.
         */
        performClick(r, c) {
            const domCell = this.gameParser.getDomCell(r, c);
            if (!domCell) {
                console.error(`GameAutomation: Could not find DOM cell for [${r}, ${c}] to click.`);
                return;
            }

            // The clickable element will be the span (for S, X, ?) or the original img (for C)
            const clickableElement = domCell.querySelector('span[onclick]') || domCell.querySelector('img[onclick]');

            if (clickableElement && typeof clickableElement.click === 'function') {
                // console.log(`GameAutomation: Clicking cell [${r}, ${c}] via .click() on element:`, clickableElement);
                clickableElement.click();
            } else {
                console.error(`GameAutomation: Element for [${r}, ${c}] is not clickable via .click() method. Element:`, clickableElement);
            }
        }

        /**
         * Main function to automate Neggsweeper gameplay.
         * It detects the current page state and performs actions.
         */
        async startGameSelector() {
            // Check for Difficulty Selection Form (Play Again!!! page)
            // This is the highest priority if it's present, regardless of game over text.
            // The "You Lose!!!" or "You Win!!!" text will be on this page.
            const difficultyForm = document.querySelector('form[action="/games/neggsweeper/neggsweeper.phtml"][method="post"]');
            const isGameOverScreen = document.body.innerText.includes('You Lose!!!') || document.body.innerText.includes('You Win!!!');

            if (difficultyForm) {
                if (isGameOverScreen) {
                    // console.log("[GameAutomation] Detected Game Over screen with difficulty selection. Waiting to restart...");
                    setTimeout(() => {
                        this._handleDifficultySelection(difficultyForm);
                    }, GAME_OVER_RESTART_DELAY_MS);
                } else {
                    // console.log("[GameAutomation] Detected difficulty selection page (initial load/manual navigation).");
                    this._handleDifficultySelection(difficultyForm);
                }
                return; // Action taken, stop current flow
            }

            // Check for Gameplay Indicator ("Hold down the CONTROL key...")
            const gameplayIndicator = document.body.textContent.includes("Hold down the CONTROL key while clicking on a negg to add or remove a flag!");
            if (gameplayIndicator) {
                // console.log("[GameAutomation] Detected gameplay page. Starting solver and action sequence...");

                const mainGameTable = document.querySelector('table[bgcolor="black"]');
                if (!mainGameTable) {
                    console.error('GameAutomation: Could not find the main game table on the gameplay page. Retrying...');
                    setTimeout(() => this.startGameSelector(), getRandomDelay(MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS));
                    return;
                }

                // Initialize parser and solver if not already
                if (!this.gameParser) {
                    this.gameParser = new NeggSweeperGrid(mainGameTable);
                }
                this.gameParser.parse(); // Always re-parse for the latest board state

                if (this.gameParser.grid.length === 0 || this.gameParser.grid[0].length === 0) {
                    // console.warn('GameAutomation: Parsed grid is empty, cannot run solver. Retrying...');
                    setTimeout(() => this.startGameSelector(), getRandomDelay(MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS));
                    return;
                }

                if (!this.solver) {
                    this.solver = new NeggSweeperSolver(this.gameParser.grid);
                } else {
                    // Update solver's internal grid with the newly parsed one
                    this.solver.grid = this.gameParser.grid.map(row => [...row]);
                }

                // Solve the grid
                const solvedGrid = this.solver.solve();

                // Visualize the solution
                if (!this.visualizer) {
                    this.visualizer = new GameBoardVisualizer(this.gameParser, solvedGrid);
                } else {
                    this.visualizer.solvedGrid = solvedGrid; // Update visualizer with new solution
                }
                this.visualizer.applySolutionToTable();

                // Determine next action based on solver's output
                setTimeout(() => {
                    let cellToClick = null;

                    // Prioritize safe cells
                    const safeCellsCoords = Array.from(this.solver.safeCoords).map(id => id.split('_').map(Number));
                    const clickableSafeCells = safeCellsCoords.filter(([r, c]) => {
                        const domCell = this.gameParser.getDomCell(r, c);
                        // Ensure it's still a clickable element (span or img)
                        return domCell && (domCell.querySelector('span[onclick]') || domCell.querySelector('img[onclick]'));
                    });

                    if (clickableSafeCells.length > 0) {
                        const randomIndex = Math.floor(Math.random() * clickableSafeCells.length);
                        cellToClick = clickableSafeCells[randomIndex];
                        // console.log("[GameAutomation] Found safe cells. Clicking a random one:", cellToClick);
                    } else if (this.solver.uncertainCoords) {
                        const [r, c] = this.solver.uncertainCoords;
                        const domCell = this.gameParser.getDomCell(r, c);
                        // Ensure the probabilistic guess is still a clickable element
                        if (domCell && (domCell.querySelector('span[onclick]') || domCell.querySelector('img[onclick]'))) {
                            cellToClick = this.solver.uncertainCoords;
                            // console.log("[GameAutomation] No safe cells. Clicking best probabilistic guess:", cellToClick);
                        }
                    } else {
                        // Fallback: Click any remaining 'C' (covered) cell
                        const remainingUnknownCells = this.solver.getUnknownCells();
                        if (remainingUnknownCells.length > 0) {
                            cellToClick = remainingUnknownCells[0]; // Pick the first available
                            // console.log("[GameAutomation] No definitive or probabilistic moves. Clicking top-leftmost unknown cell:", cellToClick);
                        }
                    }

                    if (cellToClick) {
                        this.performClick(cellToClick[0], cellToClick[1]);
                        // After a click, the page will likely reload or update.
                        // Re-run Selector after a random delay to re-evaluate the new board state.
                        setTimeout(() => this.startGameSelector(), getRandomDelay(MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS) + getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS));
                    } else {
                        // console.log("[GameAutomation] No available moves identified. Board might be fully solved or in an unhandled state. Halting automation.");
                    }

                }, getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS)); // Initial delay before making the first move
                return; // Action taken, stop current flow
            }

            // Check for "Continue Playing" form (e.g., after a short break)
            const continuePlayingForm = document.querySelector('form[method="post"][action="neggsweeper.phtml"] input[type="submit"][value="Continue Playing"]');
            if (continuePlayingForm) {
                // console.log("[GameAutomation] Detected 'Continue Playing' form. Submitting to return to game.");
                setTimeout(() => {
                    continuePlayingForm.click();
                }, getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS));
                return; // Action taken, stop current flow
            }

            // Fallback: If none of the above, navigate to the base game URL or refresh if already there
            if (window.location.href !== GAME_URL) {
                // console.log("[GameAutomation] Unknown page state. Redirecting to base game URL.");
                setTimeout(() => {
                    window.location.href = GAME_URL;
                }, getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS));
            } else {
                // console.log("[GameAutomation] Correct page, but not in a recognized game state (e.g., Internal Error). Refreshing.");
                setTimeout(() => {
                    // Prevent POST resubmission warning by forcing a clean GET
                    window.location.replace(GAME_URL);
                }, getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS));
            }
        }

        /**
         * Handles selecting difficulty and clicking 'Play Again!!!'
         * @param {HTMLElement} difficultyForm The form element.
         * @private
         */
        _handleDifficultySelection(difficultyForm) {
            const gameLevelSelect = difficultyForm.querySelector('select[name="game_level"]');
            const playAgainButton = difficultyForm.querySelector('input[type="submit"][value="Play Again!!!"]');

            if (gameLevelSelect && playAgainButton) {
                gameLevelSelect.value = DIFFICULTY; // Select Hard difficulty
                setTimeout(() => {
                    playAgainButton.click();
                    // console.log("[GameAutomation] Clicked 'Play Again!!!' (Hard).");
                }, getRandomDelay(MIN_ACTION_DELAY_MS, MAX_ACTION_DELAY_MS));
            } else {
                // console.log("[GameAutomation] Could not find difficulty select or Play Again button on form. Manual intervention may be needed.");
            }
        }
    }

    // --- Initial Script Execution ---
    let gameAutomationInstance = null; // Declare instance here to be accessible globally within the IIFE

    window.addEventListener('load', () => {
        // console.log("[NeggSweeper Autosolver] Page loaded. Starting automation sequence.");

        // Start the main automation flow after a short delay to allow page rendering
        gameAutomationInstance = new GameAutomation(); // Initialize the instance
        setTimeout(() => gameAutomationInstance.startGameSelector(), getRandomDelay(MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS));
    });

})();

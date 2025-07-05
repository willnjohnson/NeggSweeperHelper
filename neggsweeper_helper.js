// ==UserScript==
// @name         NeggSweeper Helper
// @namespace    GreaseMonkey
// @version      1.0
// @description  Parses, solves, and visually updates NeggSweeper. Does not automate gameplay.
// @author       @willnjohnson
// @match        *://www.neopets.com/games/neggsweeper/neggsweeper.phtml*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // console.log("NeggSweeper Helper: Script loaded.");

    /**
     * Represents the NeggSweeper game grid and provides methods to parse it.
     */
    class NeggSweeperGrid {
        constructor(mainTableElement) {
            if (!mainTableElement) {
                throw new Error("NeggSweeperGrid: Main game table element is required.");
            }
            this.mainTable = mainTableElement;
            this.remaining = 0;
            this.grid = []; // Stores the parsed grid data
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
            // 1. Get the 'remaining' tiles count
            const remainingElement = this.mainTable.querySelector('tbody > tr[bgcolor="silver"] table[bgcolor="black"] > tbody > tr[bgcolor="white"] > td:first-child > b');
            this.remaining = remainingElement ? parseInt(remainingElement.innerText.trim(), 10) : 0;
            // console.log('NeggSweeper Helper: Remaining Tiles:', this.remaining);

            // 2. Parse the game grid rows
            const gridRows = this.mainTable.querySelectorAll('tbody > tr[bgcolor="silver"] ~ tr[bgcolor="white"]');

            if (gridRows.length === 0) {
                // // console.warn('NeggSweeper Helper: No game grid rows found. Grid might be empty or HTML structure changed.');
                return;
            }

            gridRows.forEach(row => {
                const rowData = [];
                row.querySelectorAll('td').forEach(cell => {
                    rowData.push(NeggSweeperGrid._parseCellContent(cell));
                });
                this.grid.push(rowData);
            });

            // console.log('NeggSweeper Helper: Parsed NeggSweeper Grid (', this.grid.length, 'rows):');
            this.grid.forEach(row => {
                // console.log(row.join('\t'));
            });
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

          	// console.log(`NeggSweeperSolver: Initialized with ${this.rows}x${this.cols} grid.`);
            // console.log('NeggSweeperSolver: Input Grid (DEBUG):');
            this.grid.forEach(row => { // This shows the exact grid the solver is working with
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
         * @returns {boolean} True if any changes were made to the grid, false otherwise.
         * @private
         */
        _solveByNeighbors() {
            let changed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cellValue = this.grid[r][c];

                    // Only apply rules to numbered cells
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
                                if (this.grid[nr][nc] !== 'X') { // Only mark if not already a mine
                                    this.grid[nr][nc] = 'X';
                                    changed = true;
                                }
                            });
                        }
                        // Rule 2: If all mines are accounted for, all unknown covered are safe
                        else if (minesRemaining === 0 && unknownCoveredNeighbors.length > 0) {
                            unknownCoveredNeighbors.forEach(([nr, nc]) => {
                                if (this.grid[nr][nc] !== 'S') { // Only mark if not already safe
                                    this.grid[nr][nc] = 'S';
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
         * This looks for patterns where one numbered cell's unknown neighbors are a subset
         * of an adjacent numbered cell's unknown neighbors.
         * @returns {boolean} True if any changes were made, false otherwise.
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

                        // Iterate through adjacent numbered cells (cell2)
                        neighbors1.forEach(([r2, c2]) => {
                            const cellValue2 = this.grid[r2][c2];
                            if (typeof cellValue2 === 'number') {
                                const neighbors2 = this._getNeighbors(r2, c2);
                                const unknownCoveredNeighbors2 = neighbors2.filter(([nr, nc]) => this.grid[nr][nc] === 'C' || this.grid[nr][nc] === '?');
                                const mineNeighbors2 = neighbors2.filter(([nr, nc]) => this.grid[nr][nc] === 'X').length;
                                const requiredMines2 = cellValue2 - mineNeighbors2;

                                // Convert unknown neighbor arrays to sets for easier comparison
                                const set1 = new Set(unknownCoveredNeighbors1.map(coord => coord.join(',')));
                                const set2 = new Set(unknownCoveredNeighbors2.map(coord => coord.join(',')));

                                // Check if set1 is a subset of set2 (set1 is smaller or equal, and all elements of set1 are in set2)
                                const isSubset1of2 = Array.from(set1).every(coord => set2.has(coord));
                                if (isSubset1of2 && set1.size < set2.size) { // Strictly smaller subset
                                    const uniqueToSet2 = Array.from(set2).filter(coord => !set1.has(coord)).map(coordStr => coordStr.split(',').map(Number));
                                    const mineDiff = requiredMines2 - requiredMines1;

                                    if (mineDiff === uniqueToSet2.length) { // If difference in required mines equals count of unique unknowns, they are all mines
                                        uniqueToSet2.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'X') {
                                                this.grid[nr][nc] = 'X';
                                                changed = true;
                                            }
                                        });
                                    } else if (mineDiff === 0) { // If difference in required mines is zero, they are all safe
                                        uniqueToSet2.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'S') {
                                                this.grid[nr][nc] = 'S';
                                                changed = true;
                                            }
                                        });
                                    }
                                }

                                // Symmetric case: Check if set2 is a subset of set1
                                const isSubset2of1 = Array.from(set2).every(coord => set1.has(coord));
                                if (isSubset2of1 && set2.size < set1.size) { // Strictly smaller subset
                                    const uniqueToSet1 = Array.from(set1).filter(coord => !set2.has(coord)).map(coordStr => coordStr.split(',').map(Number));
                                    const mineDiff = requiredMines1 - requiredMines2; // Note: mineDiff direction reversed

                                    if (mineDiff === uniqueToSet1.length) { // If difference in required mines equals count of unique unknowns, they are all mines
                                        uniqueToSet1.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'X') {
                                                this.grid[nr][nc] = 'X';
                                                changed = true;
                                            }
                                        });
                                    } else if (mineDiff === 0) { // If difference in required mines is zero, they are all safe
                                        uniqueToSet1.forEach(([nr, nc]) => {
                                            if (this.grid[nr][nc] !== 'S') {
                                                this.grid[nr][nc] = 'S';
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
         * Marks the chosen tile with '?'.
         * @returns {boolean} True if a tile was marked, false otherwise.
         * @private
         */
        _solveProbabilistically() {
            let bestGuessCoord = null;
            let minAdjacentNumber = Infinity; // To find the lowest numbered adjacent cell

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

                        // Prioritize cells adjacent to the lowest numbers
                        if (hasNumberedNeighbor && currentMinAdjacentNumber < minAdjacentNumber) {
                            minAdjacentNumber = currentMinAdjacentNumber;
                            bestGuessCoord = [r, c];
                        } else if (!hasNumberedNeighbor && bestGuessCoord === null) {
                            // If no numbered neighbors found yet, just pick the first truly unknown covered cell
                            // This ensures we always have a fallback guess if no numbered cells are visible
                            bestGuessCoord = [r, c];
                        }
                    }
                }
            }

            if (bestGuessCoord) {
                const [br, bc] = bestGuessCoord;
                if (this.grid[br][bc] === 'C') { // Ensure it's still a covered tile
                    this.grid[br][bc] = '?';
                    // console.log(`NeggSweeper Helper: Probabilistic guess: Marked [${br}, ${bc}] with '?'.`);
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

            // Loop deterministic strategies until no more changes are made
            while (changedInIteration && iterationCount < 100) { // Safety limit for iterations
                changedInIteration = false;
                iterationCount++;

                const changedByNeighbors = this._solveByNeighbors();
                const changedByMultiple = this._solveByMultiple();

                if (changedByNeighbors || changedByMultiple) {
                    changedInIteration = true;
                    // console.log(`NeggSweeper Helper: Iteration ${iterationCount}: Changes made (Neighbors: ${changedByNeighbors}, Multiple: ${changedByMultiple}).`);
                } else {
                    // console.log(`NeggSweeper Helper: Iteration ${iterationCount}: No deterministic changes made.`);
                }
            }

            // If no deterministic moves, make a probabilistic guess
            // Only make a guess if there are still 'C' tiles left
            const hasCoveredTiles = this.grid.some(row => row.includes('C'));
            if (!changedInIteration && hasCoveredTiles) {
                this._solveProbabilistically();
            }

            return this.grid;
        }
    }

    /**
     * Modifies the game table's appearance based on the solved grid.
     */
    class ModifyGameTable {
        constructor(mainTableElement, solvedGrid) {
            if (!mainTableElement) {
                throw new Error("ModifyGameTable: Main game table element is required.");
            }
            if (!solvedGrid || solvedGrid.length === 0) {
                // console.warn("ModifyGameTable: Solved grid is empty or invalid, no modifications will be applied.");
                this.mainTable = null; // Mark as invalid to prevent operations
                return;
            }
            this.mainTable = mainTableElement;
            this.solvedGrid = solvedGrid;
        }

        /**
         * Applies the solution (colors, question marks) to the live HTML table.
         */
        applySolutionToTable() {
            if (!this.mainTable) {
                // console.warn("ModifyGameTable: Cannot apply solution, main table not initialized.");
                return;
            }

            // console.log("ModifyGameTable: Applying solution to the game table...");

            const gridRows = this.mainTable.querySelectorAll('tbody > tr[bgcolor="silver"] ~ tr[bgcolor="white"]');

            if (gridRows.length === 0) {
                console.error('ModifyGameTable: No game grid rows found in the DOM for applying solution.');
                return;
            }

            this.solvedGrid.forEach((rowData, rowIndex) => {
                const domRow = gridRows[rowIndex];
                if (!domRow) {
                    // console.warn(`ModifyGameTable: DOM row not found for solved grid row ${rowIndex}. Skipping.`);
                    return;
                }

                const domCells = domRow.querySelectorAll('td');
                rowData.forEach((cellValue, colIndex) => {
                    const domCell = domCells[colIndex];
                    if (!domCell) {
                        // console.warn(`ModifyGameTable: DOM cell not found for solved grid cell [${rowIndex}, ${colIndex}]. Skipping.`);
                        return;
                    }

                    const originalImg = domCell.querySelector('img');

                    // Reset any previous helper-applied background color on the TD itself
                    domCell.style.removeProperty('background-color');

                    // Create a new element (span) to replace the image, if it was a clickable cell
                    if (originalImg) {
                        const newElement = document.createElement('span');
                        newElement.style.cssText = `
                            display: flex !important;
                            justify-content: center !important;
                            align-items: center !important;
                            width: 100% !important;
                            height: 100% !important;
                            cursor: pointer !important; /* Indicate clickable */
                        `;

                        // Copy all attributes from original img to new span
                        Array.from(originalImg.attributes).forEach(attr => {
                            newElement.setAttribute(attr.name, attr.value);
                        });

                        // Clear the original image's content and replace it with the new element
                        domCell.innerHTML = ''; // Clear existing content (including img)
                        domCell.appendChild(newElement);

                        switch (cellValue) {
                            case 'S':
                                newElement.style.setProperty('background-color', 'limegreen', 'important');
                                newElement.innerHTML = ''; // Ensure no text in safe cells
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (S) - replaced img with span, set background.`);
                                break;
                            case 'X':
                                newElement.style.setProperty('background-color', 'red', 'important');
                                newElement.innerHTML = ''; // Ensure no text in mine cells
                                newElement.removeAttribute('onclick'); // Remove clickability for mines
                                newElement.style.removeProperty('cursor'); // Remove cursor pointer
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (X) - replaced img with span, set background, removed onclick.`);
                                break;
                            case '?':
                                newElement.style.setProperty('background-color', 'yellow', 'important');
                                newElement.innerHTML = '<font color="black" size="+1"><b>?</b></font>';
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (?) - replaced img with span, set background and text.`);
                                break;
                            case 'C': // If it remains 'C', revert to original image appearance
                                // Remove the temporary span and re-insert the original image structure
                                domCell.innerHTML = ''; // Clear the span
                                const originalImgClone = originalImg.cloneNode(true); // Clone to avoid issues with element being removed
                                originalImgClone.style.cssText = ''; // Clear any inline styles from previous runs
                                domCell.appendChild(originalImgClone);
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (C) - restored original img.`);
                                break;
                            default:
                                // This case should ideally not happen for cells that originally had an image,
                                // as they should be 'S', 'X', '?', or 'C'.
                                // console.warn(`ModifyGameTable: Unexpected cell value for original img cell [${rowIndex}, ${colIndex}]: ${cellValue}`);
                                break;
                        }
                    } else {
                        // This cell was originally 'B' (blank) or a number.
                        // Apply background directly to the TD itself.
                        switch (cellValue) {
                            case 'S':
                                domCell.style.setProperty('background-color', 'limegreen', 'important');
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (S from B) - set td background.`);
                                break;
                            case 'X':
                                domCell.style.setProperty('background-color', 'red', 'important');
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (X from B) - set td background.`);
                                break;
                            case '?': // A '?' on a blank cell should also be clickable
                                domCell.style.setProperty('background-color', 'yellow', 'important');
                                domCell.innerHTML = '<font color="black" size="+1"><b>?</b></font>';
                                domCell.style.setProperty('cursor', 'pointer', 'important');
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (? from B) - set td background and text.`);
                                break;
                            default:
                                // For 'B' or numbers, ensure no helper-applied background remains
                                domCell.style.removeProperty('background-color');
                                domCell.style.removeProperty('cursor');
                                // console.log(`ModifyGameTable: Cell [${rowIndex}, ${colIndex}] (value: ${cellValue}) - td background and cursor cleared.`);
                                break;
                        }
                    }
                });
            });
            // console.log("ModifyGameTable: Solution application complete.");
        }
    }

    // Main execution logic
    function initializeNeggSweeperHelper() {
        // Check for "You Lose!!!" or "You Win!!!" text first
        if (document.body.innerText.includes('You Lose!!!') || document.body.innerText.includes('You have won')) {
            // console.log('NeggSweeper Helper: Game is over ("You Lose!!!" or "You Win!!!" detected). Skipping visual modifications.');
            return; // Exit early if game is over
        }

        const mainGameTable = document.querySelector('table[bgcolor="black"]');

        if (!mainGameTable) {
            console.error('NeggSweeper Helper: Could not find the main game table on the page.');
            return;
        }

        try {
            // Parse the initial grid
            const gameParser = new NeggSweeperGrid(mainGameTable);
            gameParser.parse(); // This populates gameParser.grid and gameParser.remaining

            if (gameParser.grid.length === 0 || gameParser.grid[0].length === 0) {
                // console.warn('NeggSweeper Helper: Parsed grid is empty, cannot run solver.');
                return;
            }

            // Create a solver instance with the parsed grid
            const solver = new NeggSweeperSolver(gameParser.grid);

            // Solve the grid
            const solvedGrid = solver.solve();

            // Print the solved grid to console
            // console.log('NeggSweeper Helper: Final Solved Grid:');
            solvedGrid.forEach(row => {
                // console.log(row.join('\t'));
            });

            // Apply the solved grid visually to the game table
            const gameTableModifier = new ModifyGameTable(mainGameTable, solvedGrid);
            gameTableModifier.applySolutionToTable();

        } catch (error) {
            console.error('NeggSweeper Helper: An error occurred during initialization, solving, or applying solution:', error);
        }
    }

    // Run the helper when the document is fully loaded
    window.addEventListener('load', initializeNeggSweeperHelper);

})();

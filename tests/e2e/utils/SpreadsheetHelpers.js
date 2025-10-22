/**
 * Spreadsheet Interaction Helpers
 * Utilities for interacting with Luckysheet spreadsheet in E2E tests
 */

import { e2eLogger } from './E2ETestLogger.js';

/**
 * Wait for wallet connection (auto-connect in test mode)
 */
export async function waitForWalletConnection(page, timeout = 15000) {
  e2eLogger.setup('Waiting for wallet connection...');

  try {
    // Check if we're in test mode by looking for the test mode banner
    const isTestMode = await page.evaluate(() => {
      return window.location.href.includes('localhost') &&
             (import.meta.env?.VITE_TEST_AUTH_BYPASS === 'true' ||
              document.querySelector('[class*="test-mode"], [class*="TestMode"]'));
    });

    if (isTestMode) {
      // In test mode, just wait a bit for React to initialize
      await page.waitForTimeout(500);
      e2eLogger.success('Test mode: Wallet mocked');
      return true;
    }

    // Not in test mode - wait for actual wallet connection
    // Wait for either "Create New" button or wallet-connected state
    await page.waitForFunction(
      () => {
        // Check for create button (indicates wallet connected)
        const createButton = Array.from(document.querySelectorAll('button')).find(
          btn => /create|new/i.test(btn.textContent)
        );
        if (createButton) return true;

        // Check for wallet-connected class or attribute
        const walletConnected = document.body.classList.contains('wallet-connected') ||
          document.body.hasAttribute('data-wallet-connected');
        if (walletConnected) return true;

        return false;
      },
      { timeout }
    );

    e2eLogger.success('Wallet connected');
    return true;
  } catch (error) {
    e2eLogger.warn('Wallet auto-connection timeout - may need manual connection');
    return false;
  }
}

/**
 * Wait for Luckysheet to be ready
 */
export async function waitForLuckysheet(page, timeout = 10000) {
  e2eLogger.setup('Waiting for Luckysheet to initialize...');

  await page.waitForSelector('#luckysheet-container canvas', { timeout });
  await page.waitForTimeout(1000); // Additional wait for formula injection

  e2eLogger.success('Luckysheet initialized');
}

/**
 * Get cell position in pixels
 */
export async function getCellPosition(page, row, col) {
  return await page.evaluate((r, c) => {
    // Approximate cell positions (depends on Luckysheet config)
    const cellWidth = 80;
    const cellHeight = 25;
    const headerHeight = 40;
    const rowHeaderWidth = 46;

    return {
      x: rowHeaderWidth + (c * cellWidth) + (cellWidth / 2),
      y: headerHeight + (r * cellHeight) + (cellHeight / 2)
    };
  }, row, col);
}

/**
 * Click a cell by row and column
 */
export async function clickCell(page, row, col) {
  const position = await getCellPosition(page, row, col);

  e2eLogger.action('click', `Click cell (${row}, ${col})`, { position });

  const canvas = await page.locator('#luckysheet-container canvas').first();
  await canvas.click({ position });

  await page.waitForTimeout(300); // Wait for cell selection
}

/**
 * Get cell reference (e.g., "A1")
 */
export function getCellRef(row, col) {
  const colLetter = String.fromCharCode(65 + col);
  return `${colLetter}${row + 1}`;
}

/**
 * Type text into current cell
 */
export async function typeInCell(page, text) {
  e2eLogger.action('keyboard', `Type in cell: "${text}"`);

  await page.keyboard.type(text);
  await page.waitForTimeout(200);
}

/**
 * Get cell value
 */
export async function getCellValue(page, row, col) {
  const value = await page.evaluate((r, c) => {
    if (window.luckysheet && window.luckysheet.getCellValue) {
      return window.luckysheet.getCellValue(r, c);
    }
    return null;
  }, row, col);

  e2eLogger.result(`Cell (${row}, ${col}) value`, value);

  return value;
}

/**
 * Verify cell value
 */
export async function verifyCellValue(page, row, col, expectedValue) {
  const actualValue = await getCellValue(page, row, col);
  const match = actualValue === expectedValue || String(actualValue) === String(expectedValue);

  e2eLogger.assertion(match, `Cell (${row}, ${col}) = "${expectedValue}" (actual: "${actualValue}")`);

  return match;
}

/**
 * Select cell range
 */
export async function selectRange(page, startRow, startCol, endRow, endCol) {
  e2eLogger.action('click', `Select range (${startRow},${startCol}) to (${endRow},${endCol})`);

  const startPos = await getCellPosition(page, startRow, startCol);
  const endPos = await getCellPosition(page, endRow, endCol);

  const canvas = await page.locator('#luckysheet-container canvas').first();

  // Click and drag
  await canvas.click({ position: startPos });
  await page.mouse.down();
  await page.mouse.move(endPos.x, endPos.y);
  await page.mouse.up();

  await page.waitForTimeout(300);
}

/**
 * Press keyboard shortcut
 */
export async function pressShortcut(page, keys) {
  const modifiers = keys.split('+').map(k => k.trim());
  const mainKey = modifiers.pop();

  e2eLogger.action('keyboard', `Press shortcut: ${keys}`);

  for (const mod of modifiers) {
    await page.keyboard.down(mod);
  }

  await page.keyboard.press(mainKey);

  for (const mod of modifiers) {
    await page.keyboard.up(mod);
  }

  await page.waitForTimeout(200);
}

/**
 * Check formula bar content
 */
export async function getFormulaBarValue(page) {
  const value = await page.evaluate(() => {
    const formulaBar = document.querySelector('#luckysheet-rich-text-editor, #luckysheet-input-box');
    return formulaBar ? formulaBar.textContent || formulaBar.value : null;
  });

  e2eLogger.result('Formula bar value', value);

  return value;
}

/**
 * Wait for autocomplete dropdown
 */
export async function waitForAutocomplete(page, timeout = 5000) {
  e2eLogger.setup('Waiting for autocomplete dropdown...');

  const dropdown = await page.locator('.luckysheet-formula-search, .formula-search-c').first();
  await dropdown.waitFor({ state: 'visible', timeout });

  e2eLogger.success('Autocomplete dropdown appeared');

  return dropdown;
}

/**
 * Select autocomplete item
 */
export async function selectAutocompleteItem(page, itemText) {
  e2eLogger.action('click', `Select autocomplete item: ${itemText}`);

  const item = await page.locator('.luckysheet-formula-search-item').filter({ hasText: itemText }).first();
  await item.click();

  await page.waitForTimeout(300);
}

/**
 * Navigate with arrow keys
 */
export async function navigateWithArrows(page, direction, count = 1) {
  const keyMap = {
    'up': 'ArrowUp',
    'down': 'ArrowDown',
    'left': 'ArrowLeft',
    'right': 'ArrowRight'
  };

  const key = keyMap[direction.toLowerCase()];
  if (!key) {
    throw new Error(`Invalid direction: ${direction}`);
  }

  e2eLogger.action('keyboard', `Navigate ${direction} (${count} times)`);

  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
}

/**
 * Check cell formatting
 */
export async function getCellFormat(page, row, col) {
  const format = await page.evaluate((r, c) => {
    if (window.luckysheet && window.luckysheet.getCellValue) {
      const cellInfo = window.luckysheet.getCellValue(r, c, { type: 'object' });
      return cellInfo && cellInfo.s ? cellInfo.s : {};
    }
    return {};
  }, row, col);

  e2eLogger.result(`Cell (${row}, ${col}) format`, format);

  return format;
}

/**
 * Verify cell is bold
 */
export async function verifyCellBold(page, row, col, shouldBeBold = true) {
  const format = await getCellFormat(page, row, col);
  const isBold = format.bl === 1;
  const match = isBold === shouldBeBold;

  e2eLogger.assertion(match, `Cell (${row}, ${col}) ${shouldBeBold ? 'is' : 'is not'} bold`);

  return match;
}

/**
 * Verify cell is italic
 */
export async function verifyCellItalic(page, row, col, shouldBeItalic = true) {
  const format = await getCellFormat(page, row, col);
  const isItalic = format.it === 1;
  const match = isItalic === shouldBeItalic;

  e2eLogger.assertion(match, `Cell (${row}, ${col}) ${shouldBeItalic ? 'is' : 'is not'} italic`);

  return match;
}

/**
 * Verify cell is underlined
 */
export async function verifyCellUnderline(page, row, col, shouldBeUnderlined = true) {
  const format = await getCellFormat(page, row, col);
  const isUnderlined = format.un === 1;
  const match = isUnderlined === shouldBeUnderlined;

  e2eLogger.assertion(match, `Cell (${row}, ${col}) ${shouldBeUnderlined ? 'is' : 'is not'} underlined`);

  return match;
}

/**
 * Copy cell(s)
 */
export async function copyCells(page) {
  e2eLogger.action('keyboard', 'Copy cells (Ctrl+C)');
  await pressShortcut(page, 'Control+C');
}

/**
 * Paste cell(s)
 */
export async function pasteCells(page) {
  e2eLogger.action('keyboard', 'Paste cells (Ctrl+V)');
  await pressShortcut(page, 'Control+V');
}

/**
 * Undo last action
 */
export async function undo(page) {
  e2eLogger.action('keyboard', 'Undo (Ctrl+Z)');
  await pressShortcut(page, 'Control+Z');
}

/**
 * Redo last action
 */
export async function redo(page) {
  e2eLogger.action('keyboard', 'Redo (Ctrl+Y)');
  await pressShortcut(page, 'Control+Y');
}

/**
 * Save spreadsheet
 */
export async function save(page) {
  e2eLogger.action('keyboard', 'Save (Ctrl+S)');
  await pressShortcut(page, 'Control+S');
  await page.waitForTimeout(500); // Wait for save to initiate
}

/**
 * Check if save button/indicator shows success
 */
export async function verifySaveStatus(page, expectedStatus = 'saved') {
  const status = await page.evaluate(() => {
    const saveButton = document.querySelector('.save-status-indicator, .save-button');
    if (!saveButton) return null;

    const text = saveButton.textContent || saveButton.innerText;
    return text.toLowerCase();
  });

  const match = status && status.includes(expectedStatus.toLowerCase());

  e2eLogger.assertion(match, `Save status is "${expectedStatus}" (actual: "${status}")`);

  return match;
}

/**
 * Clear cell
 */
export async function clearCell(page, row, col) {
  await clickCell(page, row, col);

  e2eLogger.action('keyboard', 'Clear cell (Delete)');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
}

/**
 * Get active cell coordinates
 */
export async function getActiveCell(page) {
  const coords = await page.evaluate(() => {
    if (window.luckysheet && window.luckysheet.getRange) {
      try {
        const ranges = window.luckysheet.getRange();
        if (ranges && ranges.length > 0) {
          const range = ranges[0];
          return {
            row: range.row ? range.row[0] : range.r,
            col: range.column ? range.column[0] : range.c
          };
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  e2eLogger.result('Active cell', coords);

  return coords;
}

/**
 * Verify active cell
 */
export async function verifyActiveCell(page, expectedRow, expectedCol) {
  const coords = await getActiveCell(page);
  const match = coords && coords.row === expectedRow && coords.col === expectedCol;

  e2eLogger.assertion(match, `Active cell is (${expectedRow}, ${expectedCol})`);

  return match;
}

export default {
  waitForWalletConnection,
  waitForLuckysheet,
  getCellPosition,
  clickCell,
  getCellRef,
  typeInCell,
  getCellValue,
  verifyCellValue,
  selectRange,
  pressShortcut,
  getFormulaBarValue,
  waitForAutocomplete,
  selectAutocompleteItem,
  navigateWithArrows,
  getCellFormat,
  verifyCellBold,
  verifyCellItalic,
  verifyCellUnderline,
  copyCells,
  pasteCells,
  undo,
  redo,
  save,
  verifySaveStatus,
  clearCell,
  getActiveCell,
  verifyActiveCell
};

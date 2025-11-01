/**
 * Pure utility for spreadsheet template data
 * Zero dependencies - safe to import without side effects
 */

/**
 * Convert A1 notation to row/column coordinates
 * e.g., 'A1' -> {r: 0, c: 0}, 'B2' -> {r: 1, c: 1}
 */
function convertA1ToCoords(a1) {
  const match = a1.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const col = match[1];
  const row = parseInt(match[2], 10) - 1; // Convert to 0-based

  // Convert column letter(s) to number: A=0, B=1, Z=25, AA=26, etc.
  let c = 0;
  for (let i = 0; i < col.length; i++) {
    c = c * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  c--; // Convert to 0-based

  return { r: row, c };
}

/**
 * Convert A1-style template data to Luckysheet celldata format
 */
function convertTemplateToCelldata(a1Cells) {
  const celldata = [];

  for (const [a1, cellValue] of Object.entries(a1Cells)) {
    const coords = convertA1ToCoords(a1);
    if (!coords) continue;

    // Ensure cellValue has proper Luckysheet format: {v: value, m: display}
    const v = cellValue.v !== undefined ? cellValue.v : cellValue;
    const m = cellValue.m !== undefined ? cellValue.m : String(v);

    celldata.push({
      r: coords.r,
      c: coords.c,
      v: { v, m },
      s: cellValue.s // Include style if present
    });
  }

  return celldata;
}

/**
 * Get template data for different spreadsheet types
 */
export function getTemplateData(template) {
  const templates = {
    blank: {
      celldata: [],
      rows: 100,
      cols: 26,
      sheets: [{ name: 'Sheet1', index: 0, order: 0, status: 1 }],
      description: 'Empty spreadsheet ready for your data'
    },
    budget: {
      a1Cells: {
        'A1': { v: 'Personal Budget', m: 'Personal Budget', s: { bl: 1, fs: 16 } },
        'A3': { v: 'Income', m: 'Income' },
        'A4': { v: 'Salary', m: 'Salary' },
        'A5': { v: 'Freelance', m: 'Freelance' },
        'A6': { v: 'Other', m: 'Other' },
        'A8': { v: 'Expenses', m: 'Expenses' },
        'A9': { v: 'Rent/Mortgage', m: 'Rent/Mortgage' },
        'A10': { v: 'Utilities', m: 'Utilities' },
        'A11': { v: 'Food', m: 'Food' },
        'A12': { v: 'Transportation', m: 'Transportation' },
        'A13': { v: 'Entertainment', m: 'Entertainment' },
        'B3': { v: 'Amount', m: 'Amount' },
        'B8': { v: 'Amount', m: 'Amount' }
      },
      rows: 20,
      cols: 3,
      sheets: [{ name: 'Budget', index: 0, order: 0, status: 1 }],
      description: 'Pre-structured budget template with income and expense categories'
    },
    project: {
      a1Cells: {
        'A1': { v: 'Project Tracker', m: 'Project Tracker', s: { bl: 1, fs: 16 } },
        'A3': { v: 'Task', m: 'Task' },
        'B3': { v: 'Status', m: 'Status' },
        'C3': { v: 'Assigned To', m: 'Assigned To' },
        'D3': { v: 'Due Date', m: 'Due Date' },
        'E3': { v: 'Priority', m: 'Priority' },
        'A4': { v: 'Project Setup', m: 'Project Setup' },
        'A5': { v: 'Requirements Gathering', m: 'Requirements Gathering' },
        'A6': { v: 'Design Phase', m: 'Design Phase' },
        'A7': { v: 'Development', m: 'Development' },
        'A8': { v: 'Testing', m: 'Testing' },
        'A9': { v: 'Deployment', m: 'Deployment' }
      },
      rows: 20,
      cols: 5,
      sheets: [{ name: 'Tasks', index: 0, order: 0, status: 1 }],
      description: 'Task tracking template for project management'
    },
    inventory: {
      a1Cells: {
        'A1': { v: 'Inventory List', m: 'Inventory List', s: { bl: 1, fs: 16 } },
        'A3': { v: 'Item', m: 'Item' },
        'B3': { v: 'SKU', m: 'SKU' },
        'C3': { v: 'Quantity', m: 'Quantity' },
        'D3': { v: 'Unit Price', m: 'Unit Price' },
        'E3': { v: 'Total Value', m: 'Total Value' },
        'F3': { v: 'Supplier', m: 'Supplier' },
        'G3': { v: 'Location', m: 'Location' }
      },
      rows: 50,
      cols: 7,
      sheets: [{ name: 'Inventory', index: 0, order: 0, status: 1 }],
      description: 'Inventory management template with pricing and supplier tracking'
    },
    schedule: {
      a1Cells: {
        'A1': { v: 'Schedule Planner', m: 'Schedule Planner', s: { bl: 1, fs: 16 } },
        'A3': { v: 'Time', m: 'Time' },
        'B3': { v: 'Monday', m: 'Monday' },
        'C3': { v: 'Tuesday', m: 'Tuesday' },
        'D3': { v: 'Wednesday', m: 'Wednesday' },
        'E3': { v: 'Thursday', m: 'Thursday' },
        'F3': { v: 'Friday', m: 'Friday' },
        'G3': { v: 'Saturday', m: 'Saturday' },
        'H3': { v: 'Sunday', m: 'Sunday' },
        'A4': { v: '9:00 AM', m: '9:00 AM' },
        'A5': { v: '10:00 AM', m: '10:00 AM' },
        'A6': { v: '11:00 AM', m: '11:00 AM' },
        'A7': { v: '12:00 PM', m: '12:00 PM' },
        'A8': { v: '1:00 PM', m: '1:00 PM' },
        'A9': { v: '2:00 PM', m: '2:00 PM' },
        'A10': { v: '3:00 PM', m: '3:00 PM' },
        'A11': { v: '4:00 PM', m: '4:00 PM' },
        'A12': { v: '5:00 PM', m: '5:00 PM' }
      },
      rows: 25,
      cols: 8,
      sheets: [{ name: 'Schedule', index: 0, order: 0, status: 1 }],
      description: 'Weekly schedule template with hourly time slots'
    },
    contacts: {
      a1Cells: {
        'A1': { v: 'Contact List', m: 'Contact List', s: { bl: 1, fs: 16 } },
        'A3': { v: 'Name', m: 'Name' },
        'B3': { v: 'Email', m: 'Email' },
        'C3': { v: 'Phone', m: 'Phone' },
        'D3': { v: 'Company', m: 'Company' },
        'E3': { v: 'Role', m: 'Role' },
        'F3': { v: 'Notes', m: 'Notes' }
      },
      rows: 50,
      cols: 6,
      sheets: [{ name: 'Contacts', index: 0, order: 0, status: 1 }],
      description: 'Contact management template with professional details'
    }
  };

  const templateConfig = templates[template] || templates.blank;

  // Convert A1 cells to celldata if needed
  if (templateConfig.a1Cells) {
    return {
      celldata: convertTemplateToCelldata(templateConfig.a1Cells),
      rows: templateConfig.rows,
      cols: templateConfig.cols,
      sheets: templateConfig.sheets || [{ name: 'Sheet1', index: 0, order: 0, status: 1 }],
      description: templateConfig.description
    };
  }

  return templateConfig;
}

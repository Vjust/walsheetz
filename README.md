# WalSheetz - Web-based Spreadsheet Application

A powerful web-based spreadsheet application that provides Excel-like functionality with robust save/import capabilities.

## Features

### Core Spreadsheet Functionality
- ✅ **Full spreadsheet editing** - Create, edit, and format cells with Excel-like interface
- ✅ **Formula support** - Use formulas and functions for calculations
- ✅ **Multiple sheets** - Work with multiple sheets in a single document
- ✅ **Rich formatting** - Format cells with fonts, colors, borders, and more
- ✅ **Cell operations** - Copy, paste, insert/delete rows and columns

### Save & Import System
- ✅ **JSON format** - Saves complete spreadsheet data including:
  - Cell positions and values (preserved exactly)
  - Formulas and formatting
  - Document title
  - All sheets and their configurations
- ✅ **CSV support** - Import and export CSV files for compatibility
- ✅ **Title synchronization** - Document title syncs between custom header and spreadsheet
- ✅ **Complete data persistence** - All cell positions are maintained exactly as entered

### User Interface
- ✅ **Google Sheets-like design** - Clean, familiar interface
- ✅ **Editable document title** - Click the title to rename your spreadsheet (two locations)
- ✅ **File menu** - Easy access to New, Import, Save, and Download options
- ✅ **Toolbar** - Quick access buttons for common operations
- ✅ **Formula bar** - View and edit cell formulas
- ✅ **Status bar** - Shows save status and storage information

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fortunesheet.git
cd fortunesheet
```

2. Open `index.html` in a web browser:
```bash
# Using Python's built-in server
python -m http.server 8000

# Or using Node.js http-server
npx http-server

# Or simply open index.html directly in your browser
```

## Usage

### Creating a Spreadsheet

1. Open the application in your browser
2. Click on the document title (either at the top or in the spreadsheet header) to rename it
3. Enter data in cells by clicking and typing
4. Use formulas by starting with `=` (e.g., `=A1+B1`, `=SUM(A1:A10)`)

### Saving Your Work

1. Click the **💾 Save** button in the toolbar or use **File → Save as JSON**
2. The file will download as `[document_name]_[date].json`
3. Your document title, all cell data, formulas, and formatting are preserved
4. Cell positions are saved exactly (B2 stays in B2, D5 stays in D5)

### Importing a Spreadsheet

1. Click the **📂 Import** button or use **File → Import File**
2. Select a previously saved `.json` file or a `.csv` file
3. The spreadsheet will load with all data in the correct positions
4. Document title is automatically restored
5. All formulas and formatting are preserved (for JSON files)

### Exporting as CSV

1. Click the **⬇️ Download** button or use **File → Download as CSV**
2. Exports the full spreadsheet in standard CSV format
3. Compatible with Excel, Google Sheets, and other applications

### Keyboard Shortcuts

- `Enter` - Confirm cell entry and move down
- `Tab` - Confirm cell entry and move right
- `Esc` - Cancel cell editing
- `Ctrl/Cmd + C` - Copy
- `Ctrl/Cmd + V` - Paste
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Y` - Redo
- `Delete` - Clear cell content

## File Formats

### JSON Format (Recommended)
The application saves spreadsheets in a structured JSON format that preserves everything:
```json
{
  "sheets": [{
    "name": "Sheet1",
    "celldata": [
      {
        "r": 0,    // row index (0 = row 1)
        "c": 0,    // column index (0 = column A)
        "v": {     // value object
          "v": "Hello",  // actual value
          "m": "Hello",  // displayed value
          "f": "=A1+B1", // formula (if any)
          "ct": {...}    // cell type/format
        }
      }
    ],
    // ... other sheet properties
  }],
  "info": {
    "name": "My Spreadsheet",
    "creator": "WalSheetz",
    "lastModified": "2024-01-01T00:00:00.000Z",
    "version": "1.0"
  }
}
```

### CSV Format
- Standard CSV files can be imported
- Downloads available as CSV for compatibility with other applications
- Note: CSV format does not preserve formulas or formatting

## Storage System

### RAM Storage
- Fast, in-memory event tracking
- Stores recent edits and metadata
- Maintains save history

### Auto-Save Features
- Automatic batching of edits for efficiency
- Configurable save intervals
- Visual save status indicators

## Developer Tools

Open the browser console and use these commands:

```javascript
// Force save current state
devTools.forceSave()

// View memory storage
devTools.inspectRAM()

// List saved files
devTools.listBlobs()

// Clear all storage
devTools.reset()

// Get system status
devTools.getStatus()
```

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Any modern browser with JavaScript enabled

## Technologies Used

- **WalSheetz Engine** - Core spreadsheet functionality
- **Vanilla JavaScript** - No framework dependencies
- **HTML5/CSS3** - Modern web standards
- **File API** - For import/export functionality
- **Blob API** - For file generation

## Testing Guide

### Test Save/Import Functionality

1. **Enter test data:**
   - A1: "Hello"
   - B2: "World"
   - C3: 100
   - D4: =C3+50
   - E5: "Test Data"

2. **Save the spreadsheet:**
   - Click 💾 Save button
   - Note the filename (includes your document title)

3. **Clear and reload:**
   - Refresh the page or click File → New Spreadsheet

4. **Import the saved file:**
   - Click 📂 Import button
   - Select your saved JSON file

5. **Verify:**
   - All data appears in the exact same cells
   - Formula in D4 still works
   - Document title is restored

## Known Issues & Limitations

- Large spreadsheets (>10,000 cells) may impact performance
- Some advanced Excel features may not be fully supported
- CSV import/export does not preserve formulas or cell formatting
- Auto-save only triggered by user edits, not programmatic changes

## Architecture

The application is built with modularity in mind:

- `index.html` - Main application structure
- `app.js` - Core application logic and spreadsheet initialization
- `ui.js` - UI components, file operations, and title management
- `storage.js` - Storage system and save/load functionality
- `styles.css` - Google Sheets-like styling

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - This project is open source and available under the MIT License.

## Acknowledgments

- Inspired by Google Sheets UI/UX design
- Built with modern web technologies
- Thanks to all contributors and testers

## Changelog

### Latest Updates
- ✅ Fixed save/import to preserve exact cell positions
- ✅ Added bidirectional title synchronization
- ✅ Improved JSON save format with complete data preservation
- ✅ Enhanced import functionality for both JSON and CSV
- ✅ Removed simulation features for production stability
- ✅ Added visual feedback for editable title field
- ✅ Improved file naming with document title and date
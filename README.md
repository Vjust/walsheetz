# WalSheetz 📊

A powerful web-based spreadsheet application that provides Excel-like functionality with robust save/import capabilities.

![WalSheetz Logo](logo.svg)

## 🚀 Features

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
- ✅ **Custom WalSheetz branding** - Professional logo and consistent design
- ✅ **Editable document title** - Click the title to rename your spreadsheet
- ✅ **File menu** - Easy access to New, Import, Save, and Download options
- ✅ **Toolbar** - Quick access buttons for common operations
- ✅ **Formula bar** - View and edit cell formulas
- ✅ **Status bar** - Shows save status and storage information

## 🎨 Logo & Branding

WalSheetz features a custom-designed logo that represents its spreadsheet functionality:

- **Main Logo** (`logo.svg`) - A modern spreadsheet grid icon with the "W" monogram
- **Alternative Logo** (`logo-alt.svg`) - Gradient design with contemporary styling
- **Favicon** (`favicon.svg`) - Simplified version for browser tabs
- **Color Scheme** - Professional blue (#4285f4) inspired by modern productivity tools

## 🛠️ Installation

1. Clone the repository:
```bash
git clone git@github.com:Vjust/walsheetz.git
cd walsheetz
```

2. Open `index.html` in a web browser:
```bash
# Using Python's built-in server
python -m http.server 8000

# Or using Node.js http-server
npx http-server

# Or simply open index.html directly in your browser
open index.html  # macOS
start index.html # Windows
xdg-open index.html # Linux
```

## 📖 Usage

### Creating a Spreadsheet
1. Open the application in your browser
2. Click on the document title to rename it
3. Enter data in cells by clicking and typing
4. Use formulas by starting with `=` (e.g., `=A1+B1`, `=SUM(A1:A10)`)

### Saving Your Work
1. Click the **💾 Save** button or use **File → Save as JSON**
2. The file downloads as `[document_name]_[date].json`
3. All data, formulas, and formatting are preserved

### Importing a Spreadsheet
1. Click the **📂 Import** button or use **File → Import File**
2. Select a `.json` or `.csv` file
3. Data loads with exact cell positions preserved

### Keyboard Shortcuts
- `Enter` - Confirm cell entry and move down
- `Tab` - Confirm cell entry and move right
- `Esc` - Cancel cell editing
- `Ctrl/Cmd + C` - Copy
- `Ctrl/Cmd + V` - Paste
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Y` - Redo

## 🗂️ File Structure

```
walsheetz/
├── index.html          # Main HTML file
├── app.js             # Core application logic
├── ui.js              # UI components and file operations
├── storage.js         # Storage and save/load functionality
├── styles.css         # Application styling
├── logo.svg           # Main WalSheetz logo
├── logo-alt.svg       # Alternative logo design
├── favicon.svg        # Browser tab icon
└── README.md          # This file
```

## 💻 Developer Tools

Open the browser console and use these commands:

```javascript
devTools.forceSave()    // Force save current state
devTools.inspectRAM()   // View memory storage
devTools.listBlobs()    // List saved files
devTools.reset()        // Clear all storage
devTools.getStatus()    // Get system status
```

## 🌐 Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Any modern browser with JavaScript enabled

## 🔧 Technologies Used

- **WalSheetz Engine** - Core spreadsheet functionality
- **Vanilla JavaScript** - No framework dependencies
- **HTML5/CSS3** - Modern web standards
- **File API** - Import/export functionality
- **SVG Graphics** - Scalable logo and icons

## 📝 License

MIT License - This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Inspired by Google Sheets UI/UX design
- Built with modern web technologies
- Thanks to all contributors and testers

## 🚀 Live Demo

You can try WalSheetz directly by opening `index.html` in your browser - no server required!

## 📧 Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/Vjust/walsheetz).

---

**WalSheetz** - Powerful spreadsheets in your browser 📊
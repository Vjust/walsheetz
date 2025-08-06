// UI Components and File Operations

// File Operations Menu
const fileMenu = {
    // New spreadsheet (clear everything)
    new: () => {
        if (window.autoSaveManager.saveQueue.length > 0) {
            if (confirm('Save current work before creating new spreadsheet?')) {
                window.autoSaveManager.forceSave();
            }
        }
        
        // Clear spreadsheet
        if (window.luckysheet) {
            luckysheet.create({
                container: 'luckysheet',
                data: [getEmptySheet()],
                title: 'WalSheetz',
                lang: 'en'
            });
        }
        
        // Clear storage
        window.ramStorage.events = [];
        window.ramStorage.blobIndex = {};
        window.ramStorage.cellOwners = {};
        window.ramStorage.pendingBatches = {};
        
        // Update UI
        window.autoSaveManager.updateStorageStatus();
        window.autoSaveManager.updateSaveStatus('saved');
        
        // Update document name
        const docName = document.querySelector('.document-name');
        if (docName) {
            docName.textContent = 'Untitled Spreadsheet';
        }
        
        console.log('Created new spreadsheet');
    },
    
    // Import CSV file (cell data or standard CSV)
    import: () => {
        document.getElementById('file-loader').click();
    },
    
    // Save complete spreadsheet data as JSON
    save: () => {
        if (!window.luckysheet) {
            alert('No spreadsheet data to save');
            return;
        }
        
        try {
            // Get ALL sheets data using getAllSheets()
            const allSheets = luckysheet.getAllSheets();
            
            if (!allSheets || allSheets.length === 0) {
                alert('No data to save');
                return;
            }
            
            // Create complete data structure for WalSheetz
            const saveData = {
                sheets: allSheets.map(sheet => {
                    // Create a clean sheet object
                    const processedSheet = {
                        name: sheet.name || "Sheet1",
                        index: sheet.index !== undefined ? sheet.index : 0,
                        status: sheet.status !== undefined ? sheet.status : 1,
                        order: sheet.order !== undefined ? sheet.order : 0,
                        hide: sheet.hide || 0,
                        row: sheet.row || 100,
                        column: sheet.column || 26,
                        defaultRowHeight: sheet.defaultRowHeight || 25,
                        defaultColWidth: sheet.defaultColWidth || 80,
                        celldata: [],
                        config: sheet.config || {},
                        scrollLeft: sheet.scrollLeft || 0,
                        scrollTop: sheet.scrollTop || 0,
                        luckysheet_select_save: sheet.luckysheet_select_save || [],
                        calcChain: sheet.calcChain || [],
                        isPivotTable: sheet.isPivotTable || false,
                        pivotTable: sheet.pivotTable || {},
                        filter_select: sheet.filter_select || {},
                        filter: sheet.filter || null,
                        luckysheet_alternateformat_save: sheet.luckysheet_alternateformat_save || [],
                        luckysheet_alternateformat_save_modelCustom: sheet.luckysheet_alternateformat_save_modelCustom || [],
                        luckysheet_conditionformat_save: sheet.luckysheet_conditionformat_save || {},
                        frozen: sheet.frozen || {},
                        chart: sheet.chart || [],
                        zoomRatio: sheet.zoomRatio || 1,
                        image: sheet.image || [],
                        showGridLines: sheet.showGridLines !== undefined ? sheet.showGridLines : 1,
                        dataVerification: sheet.dataVerification || {}
                    };
                    
                    // Get the current sheet data properly
                    // If celldata exists, use it directly
                    if (sheet.celldata && sheet.celldata.length > 0) {
                        processedSheet.celldata = sheet.celldata;
                    } 
                    // Otherwise, try to extract from data array
                    else if (sheet.data && sheet.data.length > 0) {
                        processedSheet.celldata = [];
                        for (let r = 0; r < sheet.data.length; r++) {
                            const row = sheet.data[r];
                            if (row && Array.isArray(row)) {
                                for (let c = 0; c < row.length; c++) {
                                    const cell = row[c];
                                    // Only save cells that have content
                                    if (cell && (cell.v !== undefined || cell.f || cell.ct || cell.bg || cell.fc)) {
                                        processedSheet.celldata.push({
                                            r: r,
                                            c: c,
                                            v: cell
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // If neither celldata nor data exists, try to get current sheet data
                    else {
                        // Try to get the current sheet's data directly
                        const currentSheetData = luckysheet.getSheetData();
                        if (currentSheetData && currentSheetData.length > 0) {
                            processedSheet.celldata = [];
                            for (let r = 0; r < currentSheetData.length; r++) {
                                const row = currentSheetData[r];
                                if (row && Array.isArray(row)) {
                                    for (let c = 0; c < row.length; c++) {
                                        const cell = row[c];
                                        // Only save cells that have content
                                        if (cell && (cell.v !== undefined || cell.f)) {
                                            processedSheet.celldata.push({
                                                r: r,
                                                c: c,
                                                v: cell
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    return processedSheet;
                }),
                info: {
                    name: (() => {
                        // Try to get title from spreadsheet input first (most up-to-date)
                        const luckysheetInput = document.getElementById('luckysheet_info_detail_input');
                        if (luckysheetInput && luckysheetInput.value.trim()) {
                            return luckysheetInput.value.trim();
                        }
                        // Fallback to custom header title
                        return document.querySelector('.document-name')?.textContent?.trim() || 'Untitled Spreadsheet';
                    })(),
                    creator: 'WalSheetz',
                    lastModified: new Date().toISOString(),
                    version: '1.0'
                }
            };
            
            // Save as JSON
            const jsonStr = JSON.stringify(saveData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Create filename from document title
            const docTitle = saveData.info.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            a.download = `${docTitle}_${timestamp}.json`;
            
            a.click();
            URL.revokeObjectURL(url);
            
            // Log what we saved for debugging
            console.log('Saved data structure:', saveData);
            console.log(`Saved ${saveData.sheets.length} sheet(s) with ${saveData.sheets[0].celldata.length} cells`);
            
            // Update status
            if (window.autoSaveManager) {
                window.autoSaveManager.updateSaveStatus('saved');
            }
        } catch (error) {
            console.error('Save failed:', error);
            alert('Failed to save spreadsheet');
        }
    },
    
    // Download full spreadsheet as standard CSV
    download: () => {
        if (!window.luckysheet) {
            alert('No spreadsheet data to download');
            return;
        }
        
        window.autoSaveManager.saveFullSpreadsheet();
        console.log('Downloading full spreadsheet...');
    },
    
    // Show save history
    showHistory: () => {
        const modal = createHistoryModal();
        modal.show();
    }
};

// Create history modal
function createHistoryModal() {
    return {
        show: () => {
            const modalHtml = `
                <div id="history-modal" class="modal" style="display:flex;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Save History</h2>
                            <span class="modal-close" onclick="this.closest('.modal').style.display='none'">&times;</span>
                        </div>
                        <div class="modal-body">
                            <div class="history-list">
                                ${generateHistoryList()}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
            const existing = document.getElementById('history-modal');
            if (existing) {
                existing.remove();
            }
            
            // Add modal to page
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    };
}

// Generate history list HTML
function generateHistoryList() {
    const blobs = window.ramStorage.blobIndex;
    const entries = Object.entries(blobs).reverse(); // Most recent first
    
    if (entries.length === 0) {
        return '<p>No save history available</p>';
    }
    
    return entries.map(([blobId, info]) => {
        const date = new Date(info.timestamp).toLocaleString();
        return `
            <div class="history-entry">
                <div class="history-info">
                    <strong>${info.fileName}</strong>
                    <span>${date}</span>
                    <span>${info.recordCount || 0} edits</span>
                </div>
            </div>
        `;
    }).join('');
}

// Get empty sheet configuration
function getEmptySheet() {
    return {
        name: "Sheet1",
        color: "",
        index: 0,
        status: 1,
        order: 0,
        hide: 0,
        row: 100,
        column: 26,
        defaultRowHeight: 25,
        defaultColWidth: 80,
        celldata: [],
        config: {},
        scrollLeft: 0,
        scrollTop: 0,
        luckysheet_select_save: [],
        calcChain: [],
        isPivotTable: false,
        pivotTable: {},
        filter_select: {},
        filter: null,
        luckysheet_alternateformat_save: [],
        luckysheet_alternateformat_save_modelCustom: [],
        luckysheet_conditionformat_save: {},
        frozen: {},
        chart: [],
        zoomRatio: 1,
        image: [],
        showGridLines: 1,
        dataVerification: {}
    };
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const fileContent = e.target.result;
            
            // Check if it's JSON or CSV based on file extension or content
            const isJSON = file.name.endsWith('.json') || fileContent.trim().startsWith('{');
            
            if (isJSON) {
                // Parse JSON file
                const jsonData = JSON.parse(fileContent);
                
                // Check if it's our saved format
                if (jsonData.sheets && Array.isArray(jsonData.sheets)) {
                    // Process each sheet to ensure correct format
                    const processedSheets = jsonData.sheets.map(sheet => {
                        // Create a properly formatted sheet
                        const formattedSheet = {
                            name: sheet.name || "Sheet1",
                            index: sheet.index !== undefined ? sheet.index : 0,
                            status: sheet.status !== undefined ? sheet.status : 1,
                            order: sheet.order !== undefined ? sheet.order : 0,
                            hide: sheet.hide || 0,
                            row: sheet.row || 100,
                            column: sheet.column || 26,
                            defaultRowHeight: sheet.defaultRowHeight || 25,
                            defaultColWidth: sheet.defaultColWidth || 80,
                            celldata: [],
                            config: sheet.config || {},
                            scrollLeft: sheet.scrollLeft || 0,
                            scrollTop: sheet.scrollTop || 0,
                            luckysheet_select_save: sheet.luckysheet_select_save || [],
                            calcChain: sheet.calcChain || [],
                            isPivotTable: sheet.isPivotTable || false,
                            pivotTable: sheet.pivotTable || {},
                            filter_select: sheet.filter_select || {},
                            filter: sheet.filter || null,
                            luckysheet_alternateformat_save: sheet.luckysheet_alternateformat_save || [],
                            luckysheet_alternateformat_save_modelCustom: sheet.luckysheet_alternateformat_save_modelCustom || [],
                            luckysheet_conditionformat_save: sheet.luckysheet_conditionformat_save || {},
                            frozen: sheet.frozen || {},
                            chart: sheet.chart || [],
                            zoomRatio: sheet.zoomRatio || 1,
                            image: sheet.image || [],
                            showGridLines: sheet.showGridLines !== undefined ? sheet.showGridLines : 1,
                            dataVerification: sheet.dataVerification || {}
                        };
                        
                        // Process celldata to ensure correct format
                        if (sheet.celldata && Array.isArray(sheet.celldata)) {
                            formattedSheet.celldata = sheet.celldata.map(cell => {
                                // Ensure the cell has r and c properties
                                const formattedCell = {
                                    r: cell.r !== undefined ? cell.r : 0,
                                    c: cell.c !== undefined ? cell.c : 0,
                                    v: null
                                };
                                
                                // Process the value object
                                if (cell.v && typeof cell.v === 'object') {
                                    formattedCell.v = {
                                        ...cell.v
                                    };
                                    
                                    // Ensure required properties exist
                                    if (formattedCell.v.v !== undefined && formattedCell.v.m === undefined) {
                                        formattedCell.v.m = String(formattedCell.v.v);
                                    }
                                    if (!formattedCell.v.ct) {
                                        formattedCell.v.ct = { fa: "General", t: "g" };
                                    }
                                } else if (cell.v !== undefined) {
                                    // If v is not an object, convert it
                                    formattedCell.v = {
                                        v: cell.v,
                                        m: String(cell.v),
                                        ct: { fa: "General", t: "g" }
                                    };
                                }
                                
                                return formattedCell;
                            }).filter(cell => cell.v !== null); // Remove cells without values
                        }
                        
                        // Update sheet dimensions based on celldata
                        if (formattedSheet.celldata.length > 0) {
                            const maxRow = Math.max(...formattedSheet.celldata.map(c => c.r), 0) + 1;
                            const maxCol = Math.max(...formattedSheet.celldata.map(c => c.c), 0) + 1;
                            formattedSheet.row = Math.max(maxRow + 10, formattedSheet.row);
                            formattedSheet.column = Math.max(maxCol + 5, formattedSheet.column);
                        }
                        
                        return formattedSheet;
                    });
                    
                    // Load into WalSheetz with complete options
                    if (window.luckysheet) {
                        // Get the title from the saved info or use filename
                        const documentTitle = jsonData.info?.name || file.name.replace('.json', '');
                        
                        luckysheet.create({
                            container: 'luckysheet',
                            data: processedSheets,
                            title: documentTitle,
                            lang: 'en',
                            allowUpdate: true,
                            allowCopy: true,
                            showtoolbar: true,
                            showinfobar: true,
                            showsheetbar: true,
                            showstatisticBar: true,
                            sheetFormulaBar: true,
                            allowEdit: true,
                            enableAddRow: true,
                            enableAddCol: true,
                            showRowBar: true,
                            showColumnBar: true
                        });
                        
                        // Update both document name elements
                        const docNameElement = document.querySelector('.document-name');
                        if (docNameElement) {
                            docNameElement.textContent = documentTitle;
                        }
                        
                        // Also update spreadsheet's title input if it exists
                        setTimeout(() => {
                            const luckysheetInput = document.getElementById('luckysheet_info_detail_input');
                            if (luckysheetInput) {
                                luckysheetInput.value = documentTitle;
                            }
                        }, 100); // Small delay to ensure spreadsheet has created the input
                    }
                    
                    console.log('Imported sheets:', processedSheets);
                    console.log(`Imported ${processedSheets.length} sheet(s) with ${processedSheets[0].celldata.length} cells from ${file.name}`);
                } else {
                    alert('Invalid JSON format. Please use a file saved from this application.');
                }
            } else {
                // Handle CSV format (legacy support)
                const firstLine = fileContent.split('\n')[0];
                let sheetData;
                
                if (firstLine.toLowerCase().includes('cell_ref')) {
                    // It's our cell data format
                    const celldata = window.blobStorage.parseCellDataCSV(fileContent);
                    sheetData = getEmptySheet();
                    sheetData.celldata = celldata;
                    
                    // Set sheet dimensions based on data
                    if (celldata.length > 0) {
                        const maxRow = Math.max(...celldata.map(c => c.r), 0) + 1;
                        const maxCol = Math.max(...celldata.map(c => c.c), 0) + 1;
                        sheetData.row = Math.max(maxRow, 100);
                        sheetData.column = Math.max(maxCol, 26);
                    }
                    
                    console.log(`Imported ${celldata.length} cells from ${file.name}`);
                } else {
                    // It's a standard CSV
                    const data = window.blobStorage.parseCSV(fileContent);
                    sheetData = convertCSVToSheetData(data);
                    console.log(`Imported ${data.length} rows from ${file.name}`);
                }
                
                // Load into spreadsheet
                if (window.luckysheet) {
                    luckysheet.create({
                        container: 'luckysheet',
                        data: [sheetData],
                        title: file.name.replace('.csv', ''),
                        lang: 'en'
                    });
                }
            }
            
            // For CSV files, update document name
            if (!isJSON) {
                const docName = document.querySelector('.document-name');
                if (docName) {
                    docName.textContent = file.name.replace(/\.(json|csv)$/i, '');
                }
            }
            
            // Clear RAM and update status
            window.ramStorage.events = [];
            window.autoSaveManager.updateStorageStatus();
            window.autoSaveManager.updateSaveStatus('saved');
            
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import file: ' + error.message);
        }
    };
    
    reader.readAsText(file);
    
    // Clear file input
    event.target.value = '';
}

// Convert CSV data to WalSheetz sheet format
function convertCSVToSheetData(csvData) {
    const sheet = getEmptySheet();
    const celldata = [];
    
    // If csvData is array of objects (from our format)
    if (csvData.length > 0 && typeof csvData[0] === 'object') {
        csvData.forEach((row, index) => {
            if (row.cell_ref && row.value) {
                const col = row.cell_ref.charCodeAt(0) - 65;
                const rowNum = parseInt(row.cell_ref.substring(1)) - 1;
                
                celldata.push({
                    r: rowNum,
                    c: col,
                    v: {
                        v: row.value,
                        m: row.value,
                        ct: { fa: "General", t: "g" }
                    }
                });
            }
        });
    } else {
        // If csvData is array of arrays (standard CSV)
        csvData.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                if (cell !== '') {
                    celldata.push({
                        r: rowIndex,
                        c: colIndex,
                        v: {
                            v: cell,
                            m: cell,
                            ct: { fa: "General", t: "g" }
                        }
                    });
                }
            });
        });
    }
    
    sheet.celldata = celldata;
    return sheet;
}

// UI Event Handlers
function initializeUIHandlers() {
    // Document title editing - sync both custom and spreadsheet title
    const docNameElement = document.querySelector('.document-name');
    
    // Function to sync titles between custom header and spreadsheet
    const syncTitles = (source, newTitle) => {
        const cleanTitle = newTitle.trim() || 'Untitled Spreadsheet';
        
        // Update custom title if needed
        if (source !== 'custom' && docNameElement) {
            docNameElement.textContent = cleanTitle;
        }
        
        // Update spreadsheet title input if it exists
        const luckysheetInput = document.getElementById('luckysheet_info_detail_input');
        if (source !== 'luckysheet' && luckysheetInput) {
            luckysheetInput.value = cleanTitle;
        }
        
        console.log('Document title synchronized:', cleanTitle);
    };
    
    // Watch for spreadsheet title input creation and changes
    const observeSpreadsheetTitle = () => {
        // Use MutationObserver to detect when spreadsheet creates its title input
        const observer = new MutationObserver(() => {
            const luckysheetInput = document.getElementById('luckysheet_info_detail_input');
            if (luckysheetInput && !luckysheetInput.hasAttribute('data-synced')) {
                luckysheetInput.setAttribute('data-synced', 'true');
                
                // Sync initial value from custom title to spreadsheet
                if (docNameElement) {
                    luckysheetInput.value = docNameElement.textContent.trim() || 'Untitled Spreadsheet';
                }
                
                // Listen for changes on spreadsheet input
                luckysheetInput.addEventListener('input', () => {
                    syncTitles('luckysheet', luckysheetInput.value);
                });
                
                luckysheetInput.addEventListener('blur', () => {
                    syncTitles('luckysheet', luckysheetInput.value);
                });
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    };
    
    if (docNameElement) {
        // Save title when user finishes editing (blur or Enter key)
        docNameElement.addEventListener('blur', () => {
            const newTitle = docNameElement.textContent.trim();
            if (newTitle === '') {
                docNameElement.textContent = 'Untitled Spreadsheet';
            }
            syncTitles('custom', docNameElement.textContent);
        });
        
        // Handle Enter key to finish editing
        docNameElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                docNameElement.blur();
            }
        });
        
        // Prevent multi-line input
        docNameElement.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            selection.getRangeAt(0).insertNode(document.createTextNode(text));
        });
    }
    
    // Start observing for spreadsheet title input
    observeSpreadsheetTitle();
    
    // File menu button
    const fileMenuBtn = document.getElementById('menu-file');
    if (fileMenuBtn) {
        fileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('file-menu-dropdown');
            if (dropdown) {
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                dropdown.style.left = fileMenuBtn.offsetLeft + 'px';
            }
        });
    }
    
    // File menu items
    const newSheet = document.getElementById('new-sheet');
    if (newSheet) {
        newSheet.addEventListener('click', () => {
            fileMenu.new();
            document.getElementById('file-menu-dropdown').style.display = 'none';
        });
    }
    
    const importFile = document.getElementById('import-file');
    if (importFile) {
        importFile.addEventListener('click', () => {
            fileMenu.import();
            document.getElementById('file-menu-dropdown').style.display = 'none';
        });
    }
    
    const saveFile = document.getElementById('save-file');
    if (saveFile) {
        saveFile.addEventListener('click', () => {
            fileMenu.save();
            document.getElementById('file-menu-dropdown').style.display = 'none';
        });
    }
    
    const downloadFile = document.getElementById('download-file');
    if (downloadFile) {
        downloadFile.addEventListener('click', () => {
            fileMenu.download();
            document.getElementById('file-menu-dropdown').style.display = 'none';
        });
    }
    
    const showHistory = document.getElementById('show-history');
    if (showHistory) {
        showHistory.addEventListener('click', () => {
            fileMenu.showHistory();
            document.getElementById('file-menu-dropdown').style.display = 'none';
        });
    }
    
    // Toolbar buttons
    const importBtn = document.getElementById('import-csv');
    if (importBtn) {
        importBtn.addEventListener('click', fileMenu.import);
    }
    
    const saveBtn = document.getElementById('save-csv');
    if (saveBtn) {
        saveBtn.addEventListener('click', fileMenu.save);
    }
    
    const downloadBtn = document.getElementById('download-csv');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', fileMenu.download);
    }
    
    // File loader
    const fileLoader = document.getElementById('file-loader');
    if (fileLoader) {
        fileLoader.addEventListener('change', handleFileUpload);
    }
    
    
    // Developer console button
    const devConsoleBtn = document.getElementById('dev-console');
    if (devConsoleBtn) {
        devConsoleBtn.addEventListener('click', () => {
            const modal = document.getElementById('dev-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
        });
    }
    
    // Close modal button
    const closeModal = document.getElementById('close-dev-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            const modal = document.getElementById('dev-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Developer console actions
    initializeDevConsole();
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#menu-file')) {
            const dropdown = document.getElementById('file-menu-dropdown');
            if (dropdown) {
                dropdown.style.display = 'none';
            }
        }
    });
}

// Initialize developer console
function initializeDevConsole() {
    
    // Force save
    const devForceSave = document.getElementById('dev-force-save');
    if (devForceSave) {
        devForceSave.addEventListener('click', () => {
            window.autoSaveManager.forceSave();
            logToDevConsole('Forced batch save');
        });
    }
    
    // Inspect RAM
    const devInspectRAM = document.getElementById('dev-inspect-ram');
    if (devInspectRAM) {
        devInspectRAM.addEventListener('click', () => {
            console.table(window.ramStorage.events);
            logToDevConsole(`RAM contains ${window.ramStorage.events.length} events`);
        });
    }
    
    // List blobs
    const devListBlobs = document.getElementById('dev-list-blobs');
    if (devListBlobs) {
        devListBlobs.addEventListener('click', () => {
            console.table(window.ramStorage.blobIndex);
            const count = Object.keys(window.ramStorage.blobIndex).length;
            logToDevConsole(`${count} blobs saved`);
        });
    }
    
    // Clear storage
    const devClearStorage = document.getElementById('dev-clear-storage');
    if (devClearStorage) {
        devClearStorage.addEventListener('click', () => {
            if (confirm('Clear all storage?')) {
                window.ramStorage = {
                    events: [],
                    activeUsers: {},
                    pendingBatches: {},
                    blobIndex: {},
                    cellOwners: {}
                };
                logToDevConsole('All storage cleared');
                window.autoSaveManager.updateStorageStatus();
            }
        });
    }
    
}

// Log to developer console output
function logToDevConsole(message) {
    const output = document.getElementById('dev-console-output');
    if (output) {
        const timestamp = new Date().toLocaleTimeString();
        output.textContent += `[${timestamp}] ${message}\n`;
        output.scrollTop = output.scrollHeight;
    }
}

// Export for use in other modules
window.fileMenu = fileMenu;
window.initializeUIHandlers = initializeUIHandlers;
window.logToDevConsole = logToDevConsole;
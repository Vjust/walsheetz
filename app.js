// Main Application Entry Point

// Developer Tools for Console Testing
window.devTools = {
    // Force save current state
    forceSave: () => {
        window.autoSaveManager.forceSave();
        console.log('Forced save initiated');
    },
    
    // View RAM contents
    inspectRAM: () => {
        console.table(window.ramStorage.events);
        console.log(`Total events in RAM: ${window.ramStorage.events.length}`);
    },
    
    // View blob index
    listBlobs: () => {
        console.table(window.ramStorage.blobIndex);
        console.log(`Total blobs saved: ${Object.keys(window.ramStorage.blobIndex).length}`);
    },
    
    // Clear all storage
    reset: () => {
        window.ramStorage = {
            events: [],
            activeUsers: {},
            pendingBatches: {},
            blobIndex: {},
            cellOwners: {}
        };
        
        if (window.luckysheet) {
            luckysheet.create({
                container: 'luckysheet',
                data: [getEmptySheet()],
                title: 'WalSheetz',
                lang: 'en'
            });
        }
        
        window.autoSaveManager.updateStorageStatus();
        console.log('Storage and spreadsheet reset');
    },
    
    // Get current state summary
    getStatus: () => {
        return {
            ramEvents: window.ramStorage.events.length,
            activeUsers: Object.keys(window.ramStorage.activeUsers).length,
            savedBlobs: Object.keys(window.ramStorage.blobIndex).length,
            pendingEdits: window.autoSaveManager.saveQueue.length
        };
    }
};

// Initialize WalSheetz spreadsheet configuration
function initializeSpreadsheet() {
    const options = {
        container: 'luckysheet',
        title: 'WalSheetz',
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
        userInfo: false,
        showRowBar: true,
        showColumnBar: true,
        sheetRightClickConfig: {
            delete: true,
            copy: true,
            rename: true,
            color: true,
            hide: true,
            move: true
        },
        cellRightClickConfig: {
            copy: true,
            copyAs: true,
            paste: true,
            insertRow: true,
            insertColumn: true,
            deleteRow: true,
            deleteColumn: true,
            deleteCell: true,
            hideRow: true,
            hideColumn: true,
            rowHeight: true,
            columnWidth: true,
            clear: true,
            matrix: true,
            sort: true,
            filter: true,
            chart: true,
            image: true,
            link: true,
            data: true,
            cellFormat: true
        },
        data: [getEmptySheet()],
        hook: {
            // Cell updated hook
            cellUpdated: function(r, c, oldValue, newValue, isRefresh) {
                if (!isRefresh && newValue) {
                    // Get cell reference - handle multi-column
                    const colToLetter = (col) => {
                        let letter = '';
                        let num = col;
                        while (num >= 0) {
                            letter = String.fromCharCode(65 + (num % 26)) + letter;
                            num = Math.floor(num / 26) - 1;
                            if (num < 0) break;
                        }
                        return letter;
                    };
                    
                    const cell = colToLetter(c) + (r + 1);
                    
                    // Queue edit for saving
                    window.autoSaveManager.queueEdit({
                        userId: 'current_user',
                        userName: 'You',
                        cell: cell,
                        value: newValue.v !== undefined ? newValue.v : '',
                        formula: newValue.f || '',
                        color: '#1a73e8',
                        timestamp: Date.now()
                    });
                    
                    
                    // Update formula bar
                    updateFormulaBar(cell, newValue);
                }
            },
            
            // Range selected hook
            rangeSelect: function(range) {
                if (range && range.length > 0) {
                    const r = range[0];
                    const col = String.fromCharCode(65 + r.column[0]);
                    const row = r.row[0] + 1;
                    const cell = `${col}${row}`;
                    
                    // Update cell reference display
                    const cellRef = document.getElementById('cell-ref');
                    if (cellRef) {
                        cellRef.textContent = cell;
                    }
                    
                    // Update formula input
                    const cellValue = luckysheet.getCellValue(r.row[0], r.column[0]);
                    updateFormulaBar(cell, cellValue);
                }
            }
        }
    };
    
    // Create WalSheetz spreadsheet instance
    luckysheet.create(options);
}

// Update formula bar display
function updateFormulaBar(cell, value) {
    const cellRef = document.getElementById('cell-ref');
    const formulaInput = document.getElementById('formula-input');
    
    if (cellRef) {
        cellRef.textContent = cell;
    }
    
    if (formulaInput) {
        if (value) {
            formulaInput.value = value.f || value.v || '';
        } else {
            formulaInput.value = '';
        }
    }
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

// Show welcome message
function showWelcomeMessage() {
    console.log('%c📊 WalSheetz - Spreadsheet Application', 'font-size: 20px; font-weight: bold; color: #1a73e8;');
    console.log('');
    console.log('Available developer tools:');
    console.log('  devTools.forceSave()    - Force save current edits');
    console.log('  devTools.inspectRAM()   - View RAM storage contents');
    console.log('  devTools.listBlobs()    - List all saved blobs');
    console.log('  devTools.reset()        - Clear all storage');
    console.log('  devTools.getStatus()    - Get current system status');
}

// Initialize application
function initializeApp() {
    // Initialize UI handlers
    initializeUIHandlers();
    
    // Initialize WalSheetz spreadsheet
    initializeSpreadsheet();
    
    // Update initial storage status
    window.autoSaveManager.updateStorageStatus();
    window.autoSaveManager.updateSaveStatus('saved');
    
    // Show welcome message in console
    showWelcomeMessage();
    
    // Log initialization
    logToDevConsole('WalSheetz initialized successfully');
    logToDevConsole('Ready for collaborative editing');
    
    // Update any dynamically generated CloudSheet references
    setTimeout(() => {
        const logo = document.querySelector('.luckysheet-share-logo');
        if (logo) {
            logo.setAttribute('title', 'WalSheetz');
        }
        // Also check for any other CloudSheet text that might appear
        document.querySelectorAll('*').forEach(el => {
            if (el.title === 'CloudSheet') {
                el.title = 'WalSheetz';
            }
            if (el.textContent === 'CloudSheet' && !el.children.length) {
                el.textContent = 'WalSheetz';
            }
        });
    }, 1000);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready
    initializeApp();
}
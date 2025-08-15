// Main Application Entry Point
import './storage.js';
import './ui-handlers.js';
import './utils.js';

// Arctic Theme Configuration
window.arcticTheme = {
    enabled: false,
    toggle: function() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            document.body.classList.add('arctic-mode');
            console.log('❄️ Arctic mode activated');
        } else {
            document.body.classList.remove('arctic-mode');
            console.log('☀️ Standard mode activated');
        }
    }
};

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
    },
    
    // Toggle arctic theme
    toggleArctic: () => {
        window.arcticTheme.toggle();
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
        column: 20,
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
    console.log('%c🦭 WalSheetz - Arctic Spreadsheet Application', 'font-size: 20px; font-weight: bold; color: #0369A1;');
    console.log('%c❄️  Navigate your data like a walrus on ice  ❄️', 'font-size: 14px; color: #7DD3FC;');
    console.log('');
    console.log('Available developer tools:');
    console.log('  devTools.forceSave()    - Force save current edits');
    console.log('  devTools.inspectRAM()   - View RAM storage contents');
    console.log('  devTools.listBlobs()    - List all saved blobs');
    console.log('  devTools.reset()        - Clear all storage');
    console.log('  devTools.getStatus()    - Get current system status');
    console.log('  devTools.toggleArctic() - Toggle arctic theme');
}

// Application initialization: show welcome and init spreadsheet
function initializeApp() {
    showWelcomeMessage();
    initializeSpreadsheet();
}

// Export for Vite HMR
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        console.log('🔥 HMR: App module updated');
        initializeApp();
    });
}

// Initialize on module load
initializeApp();

export { initializeSpreadsheet, updateFormulaBar, getEmptySheet, showWelcomeMessage };
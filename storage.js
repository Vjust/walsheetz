// Dual Storage System: RAM (Sui simulation) + File System (Walrus simulation)

// Initialize RAM Storage (simulates Sui blockchain)
window.ramStorage = {
    events: [],           // Edit events with blob references
    activeUsers: {},      // Current users and their colors
    pendingBatches: {},   // Edits being batched
    blobIndex: {},        // Maps blobIds to file names
    cellOwners: {}        // Track who's editing what
};

// BlobStorage Class (simulates Walrus blob storage)
class BlobStorage {
    constructor() {
        // Headers for cell data format (position + value)
        this.cellDataHeaders = ['cell_ref', 'value', 'formula', 'format'];
    }

    // Convert cell data to CSV format (just the cells with data)
    convertCellDataToCSV() {
        if (!window.luckysheet) {
            return '';
        }
        
        // Get current sheet data - WalSheetz stores data in 'data' array, not 'celldata'
        const currentSheetData = luckysheet.getSheetData();
        
        const rows = [this.cellDataHeaders.join(',')];
        
        // Process the data array
        if (currentSheetData && currentSheetData.length > 0) {
            // Convert column number to letters (0=A, 25=Z, 26=AA, etc.)
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
            
            for (let r = 0; r < currentSheetData.length; r++) {
                const row = currentSheetData[r];
                if (row && row.length > 0) {
                    for (let c = 0; c < row.length; c++) {
                        const cell = row[c];
                        if (cell && (cell.v !== undefined && cell.v !== null && cell.v !== '')) {
                            const cellRef = colToLetter(c) + (r + 1);
                            
                            const value = cell.v !== undefined ? cell.v : '';
                            const formula = cell.f || '';
                            const format = cell.ct ? JSON.stringify(cell.ct) : '';
                            
                            // Create CSV row
                            const csvRow = [
                                cellRef,
                                `"${String(value).replace(/"/g, '""')}"`,
                                formula ? `"${formula.replace(/"/g, '""')}"` : '""',
                                format ? `"${format.replace(/"/g, '""')}"` : '""'
                            ];
                            
                            rows.push(csvRow.join(','));
                        }
                    }
                }
            }
        }
        
        return rows.join('\n');
    }
    
    // Convert entire spreadsheet to standard CSV format (for download)
    convertSpreadsheetToCSV() {
        if (!window.luckysheet) {
            return '';
        }
        
        const sheets = luckysheet.getAllSheets();
        if (!sheets || sheets.length === 0) {
            return '';
        }
        
        const sheet = sheets[0];
        const rows = [];
        
        // Get max row and column with data
        let maxRow = 0;
        let maxCol = 0;
        
        if (sheet.celldata && sheet.celldata.length > 0) {
            sheet.celldata.forEach(cell => {
                if (cell.r > maxRow) maxRow = cell.r;
                if (cell.c > maxCol) maxCol = cell.c;
            });
        }
        
        // Build standard CSV from celldata
        for (let r = 0; r <= maxRow; r++) {
            const row = [];
            for (let c = 0; c <= maxCol; c++) {
                // Find cell data
                const cell = sheet.celldata.find(item => item.r === r && item.c === c);
                if (cell && cell.v) {
                    const value = cell.v.v !== undefined ? cell.v.v : '';
                    // Escape quotes and handle commas
                    if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) {
                        row.push(`"${String(value).replace(/"/g, '""')}"`);
                    } else {
                        row.push(value);
                    }
                } else {
                    row.push('');
                }
            }
            rows.push(row.join(','));
        }
        
        return rows.join('\n');
    }

    // Parse CSV back to data
    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = this.parseCSVLine(lines[i]);
            const item = {};
            
            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });
            
            data.push(item);
        }
        
        return data;
    }
    
    // Parse cell data CSV and convert to WalSheetz format
    parseCellDataCSV(csvText) {
        const data = this.parseCSV(csvText);
        const celldata = [];
        
        data.forEach(item => {
            if (item.cell_ref) {
                // Parse cell reference (e.g., A1, B2, AA1, AB10)
                const match = item.cell_ref.match(/^([A-Z]+)(\d+)$/);
                if (match) {
                    // Convert column letters to number (A=0, B=1, ... Z=25, AA=26, etc.)
                    const colStr = match[1];
                    let col = 0;
                    for (let i = 0; i < colStr.length; i++) {
                        col = col * 26 + (colStr.charCodeAt(i) - 64);
                    }
                    col = col - 1; // Zero-indexed
                    
                    const row = parseInt(match[2]) - 1;
                    
                    // Parse the value - handle numbers and strings
                    let value = item.value || '';
                    // Remove surrounding quotes if they exist
                    if (typeof value === 'string') {
                        value = value.replace(/^"(.*)"$/, '$1');
                        value = value.replace(/""/g, '"'); // Unescape double quotes
                    }
                    
                    // Try to convert to number if possible
                    const numValue = Number(value);
                    if (!isNaN(numValue) && value !== '') {
                        value = numValue;
                    }
                    
                    const cellValue = {
                        r: row,
                        c: col,
                        v: {
                            v: value,
                            m: String(value),
                            ct: { fa: "General", t: "g" }
                        }
                    };
                    
                    // Handle format if present
                    if (item.format && item.format !== '""' && item.format !== '') {
                        try {
                            let formatStr = item.format;
                            // Remove surrounding quotes
                            formatStr = formatStr.replace(/^"(.*)"$/, '$1');
                            if (formatStr) {
                                cellValue.v.ct = JSON.parse(formatStr);
                            }
                        } catch (e) {
                            // Keep default format if parse fails
                        }
                    }
                    
                    // Handle formula
                    if (item.formula && item.formula !== '""' && item.formula !== '') {
                        let formula = item.formula;
                        // Remove surrounding quotes
                        formula = formula.replace(/^"(.*)"$/, '$1');
                        if (formula) {
                            cellValue.v.f = formula;
                            // For formulas, the display value might be different
                            cellValue.v.m = formula;
                        }
                    }
                    
                    celldata.push(cellValue);
                }
            }
        });
        
        return celldata;
    }

    // Parse a single CSV line handling quoted values
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    // Auto-save edits to CSV files
    async saveToFile(data, blobId) {
        const csv = this.convertToCSV(data);
        const blob = new Blob([csv], { type: 'text/csv' });
        const fileName = `sheet_${blobId}_${Date.now()}.csv`;
        
        
        // Auto-download to user's downloads folder
        this.downloadBlob(blob, fileName);
        
        // Store reference in RAM
        window.ramStorage.blobIndex[blobId] = {
            fileName: fileName,
            timestamp: Date.now(),
            size: blob.size,
            recordCount: data.length
        };
        
        return blobId;
    }

    // Download blob as file
    downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Load from file upload
    async loadFromFile(file) {
        const text = await file.text();
        return this.parseCSV(text);
    }

    // Generate unique blob ID
    generateBlobId() {
        return `blob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// AutoSaveManager Class
class AutoSaveManager {
    constructor() {
        this.saveQueue = [];
        this.saveInterval = 10000; // 10 seconds (increased to reduce frequency)
        this.batchThreshold = 20; // Save every 20 edits (increased threshold)
        this.blobStorage = new BlobStorage();
        this.isSaving = false;
        this.saveTimer = null;
        
        // Start auto-save timer
        this.startAutoSave();
    }

    // Start auto-save timer
    startAutoSave() {
        this.saveTimer = setInterval(() => {
            if (this.saveQueue.length > 0 && !this.isSaving) {
                this.saveBatch();
            }
        }, this.saveInterval);
    }

    // Stop auto-save timer
    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    // Queue an edit for saving
    queueEdit(edit) {
        this.saveQueue.push({
            ...edit,
            timestamp: Date.now()
        });
        
        // Update RAM immediately
        window.ramStorage.events.push({
            type: 'edit',
            userId: edit.userId,
            cell: edit.cell,
            timestamp: Date.now(),
            pending: true
        });
        
        // Update UI
        this.updateStorageStatus();
        this.updateSaveStatus('pending');
        
        // Save if batch threshold reached
        if (this.saveQueue.length >= this.batchThreshold) {
            this.saveBatch();
        }
    }

    // Save current batch to file (saves only cell data)
    async saveBatch() {
        if (this.isSaving) return;
        
        this.isSaving = true;
        this.updateSaveStatus('saving');
        
        const batch = this.saveQueue.splice(0);
        const blobId = this.blobStorage.generateBlobId();
        
        try {
            // Save only the cell data (positions and values)
            const csvData = this.blobStorage.convertCellDataToCSV();
            
            if (!csvData || csvData === this.blobStorage.cellDataHeaders.join(',')) {
                this.updateSaveStatus('saved');
                this.isSaving = false;
                return;
            }
            
            const blob = new Blob([csvData], { type: 'text/csv' });
            const fileName = `celldata_${blobId}_${Date.now()}.csv`;
            
            
            // Auto-download to user's downloads folder
            this.blobStorage.downloadBlob(blob, fileName);
            
            // Store reference in RAM
            window.ramStorage.blobIndex[blobId] = {
                fileName: fileName,
                timestamp: Date.now(),
                size: blob.size,
                recordCount: batch.length,
                type: 'cell_data'
            };
            
            // Update RAM with reference
            window.ramStorage.events.push({
                type: 'cell_data_saved',
                blobId: blobId,
                cellRefs: batch.map(e => e.cell),
                timestamp: Date.now(),
                recordCount: batch.length
            });
            
            // Mark pending events as saved
            window.ramStorage.events.forEach(event => {
                if (event.pending && batch.some(b => b.cell === event.cell)) {
                    event.pending = false;
                    event.blobId = blobId;
                }
            });
            
            this.updateSaveStatus('saved');
            this.updateStorageStatus();
            
            console.log(`Cell data saved: ${fileName} with ${batch.length} recent edits`);
            
        } catch (error) {
            console.error('Save failed:', error);
            this.updateSaveStatus('error');
            // Re-queue failed edits
            this.saveQueue.unshift(...batch);
        } finally {
            this.isSaving = false;
        }
    }
    
    // Save full spreadsheet (for download button)
    async saveFullSpreadsheet() {
        const blobId = this.blobStorage.generateBlobId();
        
        try {
            // Save the entire spreadsheet as standard CSV
            const csvData = this.blobStorage.convertSpreadsheetToCSV();
            const blob = new Blob([csvData], { type: 'text/csv' });
            const fileName = `spreadsheet_export_${Date.now()}.csv`;
            
            // Download to user's downloads folder
            this.blobStorage.downloadBlob(blob, fileName);
            
            console.log(`Full spreadsheet exported: ${fileName}`);
            return true;
            
        } catch (error) {
            console.error('Export failed:', error);
            return false;
        }
    }

    // Update save status indicator
    updateSaveStatus(status) {
        const element = document.getElementById('save-status');
        if (!element) return;
        
        const states = {
            saved: { text: '✓ All changes saved', class: 'saved' },
            saving: { text: 'Saving...', class: 'saving' },
            pending: { text: '● Unsaved changes', class: 'pending' },
            error: { text: '⚠ Save failed', class: 'error' }
        };
        
        const state = states[status] || states.pending;
        element.textContent = state.text;
        element.className = `save-status ${state.class}`;
    }

    // Update storage status display
    updateStorageStatus() {
        const ramElement = document.getElementById('ram-status');
        const filesElement = document.getElementById('files-status');
        
        if (ramElement) {
            ramElement.textContent = `RAM: ${window.ramStorage.events.length} events`;
        }
        
        if (filesElement) {
            const blobCount = Object.keys(window.ramStorage.blobIndex).length;
            filesElement.textContent = `Files: ${blobCount} saved`;
        }
    }

    // Force save current queue
    forceSave() {
        // Always save even if queue is empty - get current spreadsheet state
        this.saveBatch();
    }
}

// BatchManager Class for optimized batching
class BatchManager {
    constructor() {
        this.batchConfig = {
            TIME_WINDOW: 500,      // Batch edits within 500ms
            MAX_BATCH_SIZE: 100,   // Max cells per batch
            SAVE_INTERVAL: 5000,   // Auto-save every 5 seconds
            RAM_LIMIT: 10000       // Max events in RAM before cleanup
        };
        this.pendingBatch = [];
        this.batchTimer = null;
    }

    // Add edit to batch
    addToBatch(edit) {
        this.pendingBatch.push(edit);
        
        // Clear existing timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        
        // Process batch if size limit reached
        if (this.pendingBatch.length >= this.batchConfig.MAX_BATCH_SIZE) {
            this.processBatch();
        } else {
            // Otherwise, set timer for time window
            this.batchTimer = setTimeout(() => {
                this.processBatch();
            }, this.batchConfig.TIME_WINDOW);
        }
    }

    // Process current batch
    processBatch() {
        if (this.pendingBatch.length === 0) return;
        
        const edits = this.pendingBatch.splice(0);
        
        // Group by user for better organization
        const userEdits = this.groupByUser(edits);
        
        // Create CSV blob
        const blobStorage = new BlobStorage();
        const csvData = blobStorage.convertToCSV(edits);
        const blob = new Blob([csvData], { type: 'text/csv' });
        
        // Generate unique blob ID
        const blobId = blobStorage.generateBlobId();
        
        // Save to file (triggers download)
        this.saveBlob(blob, blobId);
        
        // Update RAM with reference
        window.ramStorage.blobIndex[blobId] = {
            timestamp: Date.now(),
            cells: edits.map(e => e.cell),
            users: [...new Set(edits.map(e => e.userId))],
            fileName: `batch_${blobId}.csv`,
            recordCount: edits.length
        };
        
        // Clean old RAM entries if needed
        if (window.ramStorage.events.length > this.batchConfig.RAM_LIMIT) {
            this.cleanupRAM();
        }
        
        // Clear timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
    }

    // Group edits by user
    groupByUser(edits) {
        const grouped = {};
        edits.forEach(edit => {
            if (!grouped[edit.userId]) {
                grouped[edit.userId] = [];
            }
            grouped[edit.userId].push(edit);
        });
        return grouped;
    }

    // Save blob to file
    saveBlob(blob, blobId) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_${blobId}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Clean up old RAM entries
    cleanupRAM() {
        const limit = this.batchConfig.RAM_LIMIT;
        const events = window.ramStorage.events;
        
        if (events.length > limit) {
            // Keep only recent events
            const toRemove = events.length - limit;
            const removed = events.splice(0, toRemove);
            
            console.log(`Cleaned up ${removed.length} old events from RAM`);
        }
    }
}

// Initialize storage managers
window.blobStorage = new BlobStorage();
window.autoSaveManager = new AutoSaveManager();
window.batchManager = new BatchManager();
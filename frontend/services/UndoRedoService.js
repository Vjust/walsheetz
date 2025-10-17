import { logger, LogComponent } from '../utils/Logger.js';

/**
 * Service for managing undo/redo operations for imports and exports
 * Implements the Command pattern
 */
export class UndoRedoService {
  constructor(maxStackSize = 50) {
    this.maxStackSize = maxStackSize;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Execute a command and add to undo stack
   * @param {Object} command - Command to execute with undo/redo functions
   */
  execute(command) {
    try {
      if (!command.execute || typeof command.execute !== 'function') {
        throw new Error('Command must have an execute function');
      }

      // Execute the command
      command.execute();

      // Add to undo stack
      this.addToUndoStack(command);

      // Clear redo stack when new command is executed
      this.redoStack = [];

      logger.info(LogComponent.UI_COMPONENT, 'command_executed', 'Command executed', {
        commandType: command.type || 'unknown',
        description: command.description
      });
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'command_error', 'Failed to execute command', {
        error: error.message,
        commandType: command.type
      });
      throw error;
    }
  }

  /**
   * Undo the last command
   * @returns {Boolean} Whether undo was successful
   */
  undo() {
    if (!this.canUndo()) {
      logger.warn(LogComponent.UI_COMPONENT, 'undo_unavailable', 'Nothing to undo');
      return false;
    }

    try {
      const command = this.undoStack.pop();

      if (command.undo && typeof command.undo === 'function') {
        command.undo();
        this.redoStack.push(command);

        logger.info(LogComponent.UI_COMPONENT, 'undo_executed', 'Undo executed', {
          commandType: command.type,
          description: command.description
        });

        return true;
      }
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'undo_error', 'Failed to undo command', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Redo the last undone command
   * @returns {Boolean} Whether redo was successful
   */
  redo() {
    if (!this.canRedo()) {
      logger.warn(LogComponent.UI_COMPONENT, 'redo_unavailable', 'Nothing to redo');
      return false;
    }

    try {
      const command = this.redoStack.pop();

      if (command.redo && typeof command.redo === 'function') {
        command.redo();
        this.undoStack.push(command);

        logger.info(LogComponent.UI_COMPONENT, 'redo_executed', 'Redo executed', {
          commandType: command.type,
          description: command.description
        });

        return true;
      }
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'redo_error', 'Failed to redo command', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if undo is available
   * @returns {Boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   * @returns {Boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Get undo history
   * @returns {Array}
   */
  getUndoHistory() {
    return this.undoStack.map(cmd => ({
      type: cmd.type,
      description: cmd.description,
      timestamp: cmd.timestamp
    }));
  }

  /**
   * Get redo history
   * @returns {Array}
   */
  getRedoHistory() {
    return this.redoStack.map(cmd => ({
      type: cmd.type,
      description: cmd.description,
      timestamp: cmd.timestamp
    }));
  }

  /**
   * Clear all undo/redo stacks
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];

    logger.info(LogComponent.UI_COMPONENT, 'undo_redo_cleared', 'Undo/Redo history cleared');
  }

  /**
   * Get current state info
   * @returns {Object}
   */
  getState() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
      nextUndoDescription: this.undoStack[this.undoStack.length - 1]?.description,
      nextRedoDescription: this.redoStack[this.redoStack.length - 1]?.description
    };
  }

  /**
   * Add command to undo stack with size limit
   * @private
   */
  addToUndoStack(command) {
    this.undoStack.push(command);

    // Maintain max stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack = this.undoStack.slice(-this.maxStackSize);
    }
  }
}

/**
 * Base Command class for import operations
 */
export class ImportCommand {
  constructor(options = {}) {
    this.type = options.type || 'import';
    this.description = options.description || 'Import operation';
    this.timestamp = Date.now();
    this.previousState = options.previousState;
    this.newState = options.newState;
    this.spreadsheetEngine = options.spreadsheetEngine;
  }

  execute() {
    // Load new state
    if (this.spreadsheetEngine && this.newState) {
      this.spreadsheetEngine.loadData(this.newState);
    }
  }

  undo() {
    // Restore previous state
    if (this.spreadsheetEngine && this.previousState) {
      this.spreadsheetEngine.loadData(this.previousState);
    }
  }

  redo() {
    // Reload new state
    if (this.spreadsheetEngine && this.newState) {
      this.spreadsheetEngine.loadData(this.newState);
    }
  }
}

export default UndoRedoService;

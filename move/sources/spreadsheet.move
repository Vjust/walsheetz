/// WalSheetz Spreadsheet Storage Module
/// Stores spreadsheet metadata and version references on Sui blockchain
/// Data is stored in Walrus, with references and metadata on-chain
module walsheets::spreadsheet {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field;
    use std::string::{Self, String};
    use std::vector;
    use std::option;

    /// Module version for upgrade compatibility
    const MODULE_VERSION: u64 = 1;

    /// Error codes
    const E_NOT_OWNER: u64 = 0;
    const E_NOT_EDITOR: u64 = 1;
    const E_CELL_ALREADY_LOCKED: u64 = 2;
    const E_CELL_NOT_LOCKED: u64 = 3;
    const E_INVALID_INPUT: u64 = 4;
    const E_NOT_AUTHORIZED: u64 = 5;
    const E_INVALID_ADDRESS: u64 = 6;
    const E_EMPTY_STRING: u64 = 7;
    const E_INVALID_CELL_REF: u64 = 8;
    const E_VERSION_NOT_FOUND: u64 = 9;
    const E_LOCK_EXPIRED: u64 = 10;
    const E_INVALID_VERSION: u64 = 11;
    const E_WRONG_VERSION: u64 = 12;

    /// Constants
    const LOCK_TIMEOUT_MS: u64 = 300000; // 5 minutes
    const MAX_TITLE_LENGTH: u64 = 100;
    const MAX_DESCRIPTION_LENGTH: u64 = 500;
    const MAX_BLOB_ID_LENGTH: u64 = 100;
    const PAGE_SIZE: u64 = 100;
    const MAX_DELETION_BATCH_SIZE: u64 = 50; // Max versions to delete in one batch

    /// Dynamic field key for version tracking
    const VERSION_FIELD_KEY: vector<u8> = b"module_version";

    /// Permission levels for collaboration
    const PERMISSION_VIEW: u8 = 0;
    const PERMISSION_EDIT: u8 = 1;
    const PERMISSION_ADMIN: u8 = 2;

    /// Admin capability for spreadsheet module upgrades and migrations
    public struct SpreadsheetAdminCap has key {
        id: UID,
    }

    /// Cell lock information
    public struct CellLock has store, drop, copy {
        editor: address,
        version_id: address,
        locked_at: u64,
        expires_at: u64,
    }

    /// Collaborator permission
    public struct Permission has store, drop, copy {
        level: u8,
        granted_at: u64,
    }

    /// Spreadsheet registry object with efficient lookup
    public struct SpreadsheetRegistry has key {
        id: UID,
        /// Using Table for O(1) lookups instead of vector
        spreadsheets: Table<address, bool>,
        /// Keep a vector for pagination (can be optimized later)
        spreadsheet_list: vector<address>,
        total_count: u64,
    }

    /// Main spreadsheet object storing metadata and version history
    public struct Spreadsheet has key {
        id: UID,
        title: String,
        owner: address,
        created_at: u64,
        last_modified: u64,
        version_count: u64,
        current_version: address,
        /// Version history for tracking lineage
        version_history: vector<address>,
        is_public: bool,
        /// Cell locks for collaborative editing
        cell_locks: Table<String, CellLock>,
        /// Collaborators with permissions
        collaborators: Table<address, Permission>,
        /// Active editors currently working
        active_editors: Table<address, u64>,
    }

    /// Compression information for storage optimization
    public struct CompressionInfo has store, drop, copy {
        algorithm: String,
        original_size: u64,
        compressed_size: u64,
        compression_ratio: u64, // Stored as 1000x ratio (e.g., 2.5x = 2500)
    }

    /// Storage type for version data
    public struct StorageInfo has store, drop, copy {
        storage_type: String, // "full", "delta", "full_fallback"
        operations: u64, // Number of operations (cells for full, changes for delta)
        is_deduplicated: bool,
    }

    /// Version object storing reference to Walrus blob with enhanced metadata
    public struct Version has key, store {
        id: UID,
        spreadsheet_id: address,
        version_number: u64,
        /// Parent version for history tracking
        parent_version: option::Option<address>,
        walrus_blob_id: String,
        /// SHA-256 content hash for data integrity verification
        content_hash: String,
        cell_count: u64,
        created_at: u64,
        created_by: address,
        description: String,
        /// Compression metadata for storage optimization tracking
        compression_info: option::Option<CompressionInfo>,
        /// Storage type and optimization metadata
        storage_info: option::Option<StorageInfo>,
    }

    /// Events for frontend tracking
    public struct SpreadsheetCreated has copy, drop {
        spreadsheet_id: address,
        owner: address,
        title: String,
        timestamp: u64,
    }

    public struct VersionSaved has copy, drop {
        spreadsheet_id: address,
        version_id: address,
        version_number: u64,
        parent_version: option::Option<address>,
        walrus_blob_id: String,
        content_hash: String,
        cell_count: u64,
        timestamp: u64,
        /// Compression and storage optimization metadata
        compression_algorithm: String,
        original_size: u64,
        compressed_size: u64,
        storage_type: String,
        operations: u64,
        is_deduplicated: bool,
    }

    public struct CellLocked has copy, drop {
        spreadsheet_id: address,
        version_id: address,
        cell_ref: String,
        editor: address,
        timestamp: u64,
        expires_at: u64,
    }

    public struct CellUnlocked has copy, drop {
        spreadsheet_id: address,
        cell_ref: String,
        editor: address,
        timestamp: u64,
    }

    public struct CollaboratorAdded has copy, drop {
        spreadsheet_id: address,
        collaborator: address,
        permission_level: u8,
        timestamp: u64,
    }

    public struct SpreadsheetDeleted has copy, drop {
        spreadsheet_id: address,
        owner: address,
        title: String,
        version_count: u64,
        timestamp: u64,
    }

    public struct SpreadsheetMigrated has copy, drop {
        spreadsheet_id: address,
        old_version: u64,
        new_version: u64,
        timestamp: u64,
        outstanding_walrus_refs: u64,
    }

    public struct RegistryMigrated has copy, drop {
        registry_id: address,
        old_version: u64,
        new_version: u64,
        timestamp: u64,
    }

    /// Initialize the module with a global registry
    fun init(ctx: &mut TxContext) {
        let mut registry = SpreadsheetRegistry {
            id: object::new(ctx),
            spreadsheets: table::new(ctx),
            spreadsheet_list: vector::empty(),
            total_count: 0,
        };

        // Set registry version via dynamic field BEFORE sharing
        set_registry_version(&mut registry, MODULE_VERSION);

        transfer::share_object(registry);

        // Mint admin capability for module upgrades and migrations
        let admin_cap = SpreadsheetAdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    /// Validate string input
    fun validate_string(s: &String, max_length: u64): bool {
        let length = string::length(s);
        length > 0 && length <= max_length
    }

    /// Validate cell reference format (e.g., "A1", "B2", "AA10")
    fun validate_cell_ref(cell_ref: &String): bool {
        let bytes = string::as_bytes(cell_ref);
        let length = vector::length(bytes);
        
        if (length < 2) return false;
        
        let mut i = 0;
        let mut has_letter = false;
        let mut has_number = false;
        
        // Check for letters first (A-Z)
        while (i < length) {
            let byte = *vector::borrow(bytes, i);
            if (byte >= 65 && byte <= 90) { // A-Z
                has_letter = true;
                i = i + 1;
            } else {
                break
            }
        };
        
        // Then check for numbers (0-9)
        while (i < length) {
            let byte = *vector::borrow(bytes, i);
            if (byte >= 48 && byte <= 57) { // 0-9
                has_number = true;
                i = i + 1;
            } else {
                return false
            }
        };
        
        has_letter && has_number
    }

    /// Validate address is not zero
    fun validate_address(addr: address): bool {
        addr != @0x0
    }

    /// Get spreadsheet version from dynamic field (0 if legacy)
    fun get_spreadsheet_version(spreadsheet: &Spreadsheet): u64 {
        if (dynamic_field::exists_(&spreadsheet.id, VERSION_FIELD_KEY)) {
            *dynamic_field::borrow(&spreadsheet.id, VERSION_FIELD_KEY)
        } else {
            0 // Legacy object without version
        }
    }

    /// Set spreadsheet version in dynamic field
    fun set_spreadsheet_version(spreadsheet: &mut Spreadsheet, version: u64) {
        if (dynamic_field::exists_(&spreadsheet.id, VERSION_FIELD_KEY)) {
            *dynamic_field::borrow_mut(&mut spreadsheet.id, VERSION_FIELD_KEY) = version;
        } else {
            dynamic_field::add(&mut spreadsheet.id, VERSION_FIELD_KEY, version);
        }
    }

    /// Get registry version from dynamic field (0 if legacy)
    fun get_registry_version(registry: &SpreadsheetRegistry): u64 {
        if (dynamic_field::exists_(&registry.id, VERSION_FIELD_KEY)) {
            *dynamic_field::borrow(&registry.id, VERSION_FIELD_KEY)
        } else {
            0 // Legacy object without version
        }
    }

    /// Set registry version in dynamic field
    fun set_registry_version(registry: &mut SpreadsheetRegistry, version: u64) {
        if (dynamic_field::exists_(&registry.id, VERSION_FIELD_KEY)) {
            *dynamic_field::borrow_mut(&mut registry.id, VERSION_FIELD_KEY) = version;
        } else {
            dynamic_field::add(&mut registry.id, VERSION_FIELD_KEY, version);
        }
    }

    /// Assert that spreadsheet is using latest module version
    fun assert_latest_version(spreadsheet: &Spreadsheet) {
        let version = get_spreadsheet_version(spreadsheet);
        assert!(version == MODULE_VERSION, E_WRONG_VERSION);
    }

    /// Check if user has permission
    fun has_permission(spreadsheet: &Spreadsheet, user: address, required_level: u8): bool {
        if (user == spreadsheet.owner) return true;

        if (required_level == PERMISSION_VIEW && spreadsheet.is_public) return true;

        if (table::contains(&spreadsheet.collaborators, user)) {
            let permission = table::borrow(&spreadsheet.collaborators, user);
            permission.level >= required_level
        } else {
            false
        }
    }

    /// Clean up expired locks
    fun cleanup_expired_locks(_spreadsheet: &mut Spreadsheet, _current_time: u64) {
        
        // Note: In production, we'd need a more efficient way to iterate
        // This is a simplified version - Sui doesn't have native table iteration
        // We'd maintain a separate vector of cell refs or use events
    }

    /// Create a new spreadsheet with validation
    public fun create_spreadsheet(
        registry: &mut SpreadsheetRegistry,
        title: String,
        ctx: &mut TxContext
    ): address {
        // Validate input
        assert!(validate_string(&title, MAX_TITLE_LENGTH), E_EMPTY_STRING);

        let sender = tx_context::sender(ctx);
        let timestamp = tx_context::epoch_timestamp_ms(ctx);

        let mut spreadsheet = Spreadsheet {
            id: object::new(ctx),
            title,
            owner: sender,
            created_at: timestamp,
            last_modified: timestamp,
            version_count: 0,
            current_version: @0x0,
            version_history: vector::empty(),
            is_public: false,
            cell_locks: table::new(ctx),
            collaborators: table::new(ctx),
            active_editors: table::new(ctx),
        };

        // Set version via dynamic field
        set_spreadsheet_version(&mut spreadsheet, MODULE_VERSION);

        let spreadsheet_id = object::uid_to_address(&spreadsheet.id);

        // Add to registry with efficient Table lookup
        table::add(&mut registry.spreadsheets, spreadsheet_id, true);
        vector::push_back(&mut registry.spreadsheet_list, spreadsheet_id);
        registry.total_count = registry.total_count + 1;

        // Emit creation event
        event::emit(SpreadsheetCreated {
            spreadsheet_id,
            owner: sender,
            title,
            timestamp,
        });

        transfer::share_object(spreadsheet);
        spreadsheet_id
    }

    /// Save a new version with Walrus blob reference, content hash, and validation
    public fun save_version(
        spreadsheet: &mut Spreadsheet,
        walrus_blob_id: String,
        content_hash: String,
        cell_count: u64,
        description: String,
        clock: &Clock,
        ctx: &mut TxContext
    ): address {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        // Validate inputs
        assert!(validate_string(&walrus_blob_id, MAX_BLOB_ID_LENGTH), E_INVALID_INPUT);
        assert!(validate_string(&content_hash, MAX_BLOB_ID_LENGTH), E_INVALID_INPUT); // Reuse length limit for hash
        assert!(validate_string(&description, MAX_DESCRIPTION_LENGTH), E_INVALID_INPUT);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Check permission (must be owner or have EDIT permission)
        assert!(has_permission(spreadsheet, sender, PERMISSION_EDIT), E_NOT_AUTHORIZED);

        spreadsheet.version_count = spreadsheet.version_count + 1;
        spreadsheet.last_modified = timestamp;

        // Set parent version
        let parent_version = if (spreadsheet.current_version != @0x0) {
            option::some(spreadsheet.current_version)
        } else {
            option::none()
        };

        let version = Version {
            id: object::new(ctx),
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            version_number: spreadsheet.version_count,
            parent_version,
            walrus_blob_id,
            content_hash,
            cell_count,
            created_at: timestamp,
            created_by: sender,
            description,
            compression_info: option::none(),
            storage_info: option::none(),
        };

        let version_id = object::uid_to_address(&version.id);
        spreadsheet.current_version = version_id;
        
        // Add to version history
        vector::push_back(&mut spreadsheet.version_history, version_id);

        // Emit version saved event with content hash and optimization metadata
        event::emit(VersionSaved {
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            version_id,
            version_number: spreadsheet.version_count,
            parent_version,
            walrus_blob_id,
            content_hash,
            cell_count,
            timestamp,
            // Default values for backward compatibility
            compression_algorithm: string::utf8(b"none"),
            original_size: 0,
            compressed_size: 0,
            storage_type: string::utf8(b"full"),
            operations: cell_count,
            is_deduplicated: false,
        });

        transfer::share_object(version);
        version_id
    }

    /// Save a new version with enhanced optimization metadata
    public fun save_version_enhanced(
        spreadsheet: &mut Spreadsheet,
        walrus_blob_id: String,
        content_hash: String,
        cell_count: u64,
        description: String,
        compression_algorithm: String,
        original_size: u64,
        compressed_size: u64,
        storage_type: String,
        operations: u64,
        is_deduplicated: bool,
        clock: &Clock,
        ctx: &mut TxContext
    ): address {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        // Validate inputs
        assert!(validate_string(&walrus_blob_id, MAX_BLOB_ID_LENGTH), E_INVALID_INPUT);
        assert!(validate_string(&content_hash, MAX_BLOB_ID_LENGTH), E_INVALID_INPUT);
        assert!(validate_string(&description, MAX_DESCRIPTION_LENGTH), E_INVALID_INPUT);
        assert!(validate_string(&compression_algorithm, 50), E_INVALID_INPUT);
        assert!(validate_string(&storage_type, 50), E_INVALID_INPUT);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Check permission (must be owner or have EDIT permission)
        assert!(has_permission(spreadsheet, sender, PERMISSION_EDIT), E_NOT_AUTHORIZED);

        spreadsheet.version_count = spreadsheet.version_count + 1;
        spreadsheet.last_modified = timestamp;

        // Set parent version
        let parent_version = if (spreadsheet.current_version != @0x0) {
            option::some(spreadsheet.current_version)
        } else {
            option::none()
        };

        // Create compression info
        let compression_info = if (original_size > 0 && compressed_size > 0) {
            option::some(CompressionInfo {
                algorithm: compression_algorithm,
                original_size,
                compressed_size,
                compression_ratio: (original_size * 1000) / compressed_size // Store as 1000x ratio
            })
        } else {
            option::none()
        };

        // Create storage info
        let storage_info = option::some(StorageInfo {
            storage_type,
            operations,
            is_deduplicated,
        });

        let version = Version {
            id: object::new(ctx),
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            version_number: spreadsheet.version_count,
            parent_version,
            walrus_blob_id,
            content_hash,
            cell_count,
            created_at: timestamp,
            created_by: sender,
            description,
            compression_info,
            storage_info,
        };

        let version_id = object::uid_to_address(&version.id);
        spreadsheet.current_version = version_id;

        // Add to version history
        vector::push_back(&mut spreadsheet.version_history, version_id);

        // Emit enhanced version saved event
        event::emit(VersionSaved {
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            version_id,
            version_number: spreadsheet.version_count,
            parent_version,
            walrus_blob_id,
            content_hash,
            cell_count,
            timestamp,
            compression_algorithm,
            original_size,
            compressed_size,
            storage_type,
            operations,
            is_deduplicated,
        });

        transfer::share_object(version);
        version_id
    }

    /// Lock a cell for editing with atomic check-and-set
    public fun lock_cell(
        spreadsheet: &mut Spreadsheet,
        cell_ref: String,
        clock: &Clock,
        ctx: &mut TxContext
    ): bool {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        // Validate cell reference format
        assert!(validate_cell_ref(&cell_ref), E_INVALID_CELL_REF);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Check permission
        assert!(has_permission(spreadsheet, sender, PERMISSION_EDIT), E_NOT_AUTHORIZED);
        
        // Clean up any expired locks first
        cleanup_expired_locks(spreadsheet, timestamp);
        
        // Check if cell is already locked
        if (table::contains(&spreadsheet.cell_locks, cell_ref)) {
            let existing_lock = table::borrow(&spreadsheet.cell_locks, cell_ref);
            // If lock is expired, we can override it
            if (existing_lock.expires_at > timestamp) {
                return false // Cell is still locked by someone else
            };
            // Remove expired lock
            table::remove(&mut spreadsheet.cell_locks, cell_ref);
        };

        // Create new lock
        let new_lock = CellLock {
            editor: sender,
            version_id: spreadsheet.current_version,
            locked_at: timestamp,
            expires_at: timestamp + LOCK_TIMEOUT_MS,
        };

        // Atomic add
        table::add(&mut spreadsheet.cell_locks, cell_ref, new_lock);
        
        // Track active editor
        if (!table::contains(&spreadsheet.active_editors, sender)) {
            table::add(&mut spreadsheet.active_editors, sender, timestamp);
        } else {
            *table::borrow_mut(&mut spreadsheet.active_editors, sender) = timestamp;
        };

        // Emit lock event
        event::emit(CellLocked {
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            version_id: spreadsheet.current_version,
            cell_ref,
            editor: sender,
            timestamp,
            expires_at: timestamp + LOCK_TIMEOUT_MS,
        });

        true
    }

    /// Unlock a cell with cleanup
    public fun unlock_cell(
        spreadsheet: &mut Spreadsheet,
        cell_ref: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        
        // Check if cell is locked
        assert!(table::contains(&spreadsheet.cell_locks, cell_ref), E_CELL_NOT_LOCKED);
        
        let lock = table::borrow(&spreadsheet.cell_locks, cell_ref);
        
        // Only the editor or owner can unlock
        assert!(sender == lock.editor || sender == spreadsheet.owner, E_NOT_EDITOR);
        
        // Remove the lock (cleanup!)
        table::remove(&mut spreadsheet.cell_locks, cell_ref);

        // Emit unlock event
        event::emit(CellUnlocked {
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            cell_ref,
            editor: sender,
            timestamp,
        });
    }

    /// Add a collaborator with specific permissions
    public fun add_collaborator(
        spreadsheet: &mut Spreadsheet,
        collaborator: address,
        permission_level: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Only owner or admin can add collaborators
        assert!(has_permission(spreadsheet, sender, PERMISSION_ADMIN), E_NOT_OWNER);
        
        // Validate address
        assert!(validate_address(collaborator), E_INVALID_ADDRESS);
        assert!(permission_level <= PERMISSION_ADMIN, E_INVALID_INPUT);
        
        let permission = Permission {
            level: permission_level,
            granted_at: timestamp,
        };
        
        if (table::contains(&spreadsheet.collaborators, collaborator)) {
            // Update existing permission
            *table::borrow_mut(&mut spreadsheet.collaborators, collaborator) = permission;
        } else {
            // Add new collaborator
            table::add(&mut spreadsheet.collaborators, collaborator, permission);
        };
        
        // Emit event
        event::emit(CollaboratorAdded {
            spreadsheet_id: object::uid_to_address(&spreadsheet.id),
            collaborator,
            permission_level,
            timestamp,
        });
    }

    /// Remove a collaborator
    public fun remove_collaborator(
        spreadsheet: &mut Spreadsheet,
        collaborator: address,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        
        // Only owner or admin can remove collaborators
        assert!(has_permission(spreadsheet, sender, PERMISSION_ADMIN), E_NOT_OWNER);
        
        if (table::contains(&spreadsheet.collaborators, collaborator)) {
            table::remove(&mut spreadsheet.collaborators, collaborator);
        };
        
        // Also remove from active editors if present
        if (table::contains(&spreadsheet.active_editors, collaborator)) {
            table::remove(&mut spreadsheet.active_editors, collaborator);
        };
    }

    /// Get locked cells for a spreadsheet (returns cell refs)
    /// Note: In production, this would need pagination
    public fun get_locked_cells(_spreadsheet: &Spreadsheet, _clock: &Clock): vector<String> {
        let locked_cells = vector::empty<String>();
        
        // Note: This is a simplified version
        // In production, we'd maintain a separate index of locked cells
        // for efficient querying
        
        locked_cells
    }

    /// Get active editors
    public fun get_active_editors(_spreadsheet: &Spreadsheet): vector<address> {
        let editors = vector::empty<address>();
        
        // Note: This would need proper iteration support
        // Currently simplified for the example
        
        editors
    }

    /// Query spreadsheets with pagination
    public fun list_spreadsheets(
        registry: &SpreadsheetRegistry,
        offset: u64,
        limit: u64
    ): (vector<address>, u64) {
        let limit_capped = if (limit > PAGE_SIZE) PAGE_SIZE else limit;
        let mut result = vector::empty<address>();
        let total = vector::length(&registry.spreadsheet_list);
        
        let mut i = offset;
        let mut count = 0;
        while (i < total && count < limit_capped) {
            vector::push_back(&mut result, *vector::borrow(&registry.spreadsheet_list, i));
            i = i + 1;
            count = count + 1;
        };
        
        (result, total)
    }

    /// Remove a spreadsheet from registry (owner only)
    public fun remove_spreadsheet(
        registry: &mut SpreadsheetRegistry,
        spreadsheet: &Spreadsheet,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        let spreadsheet_id = object::uid_to_address(&spreadsheet.id);
        
        if (table::contains(&registry.spreadsheets, spreadsheet_id)) {
            table::remove(&mut registry.spreadsheets, spreadsheet_id);
            registry.total_count = registry.total_count - 1;
            
            // Also remove from list (expensive, but necessary for now)
            let mut i = 0;
            let len = vector::length(&registry.spreadsheet_list);
            while (i < len) {
                if (*vector::borrow(&registry.spreadsheet_list, i) == spreadsheet_id) {
                    vector::remove(&mut registry.spreadsheet_list, i);
                    break
                };
                i = i + 1;
            };
        };
    }

    /// Delete a spreadsheet completely (owner only) - WARNING: This is permanent!
    /// Deletes all version objects, removes from registry, and destroys the spreadsheet
    /// Validates that all versions match the spreadsheet's version history
    public entry fun delete_spreadsheet_with_versions(
        registry: &mut SpreadsheetRegistry,
        spreadsheet: Spreadsheet,
        mut versions: vector<Version>,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(&spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        let spreadsheet_id = object::uid_to_address(&spreadsheet.id);
        
        // Store info for event before destruction
        let title = spreadsheet.title;
        let owner = spreadsheet.owner;
        let version_count = spreadsheet.version_count;
        let timestamp = tx_context::epoch_timestamp_ms(ctx);
        
        // Verify versions match the version history
        let version_history = &spreadsheet.version_history;
        let versions_len = vector::length(&versions);
        let history_len = vector::length(version_history);
        
        // Check batch size limit for gas efficiency
        assert!(versions_len <= MAX_DELETION_BATCH_SIZE, E_INVALID_INPUT);
        
        // All versions in history must be provided for deletion
        assert!(versions_len == history_len, E_INVALID_VERSION);
        
        // Verify all version IDs match and belong to this spreadsheet
        let mut i = 0;
        while (i < versions_len) {
            let version = vector::borrow(&versions, i);
            let version_id = object::uid_to_address(&version.id);
            let expected_id = *vector::borrow(version_history, i);
            assert!(version_id == expected_id, E_INVALID_VERSION);
            
            // Verify this version belongs to this spreadsheet
            assert!(version.spreadsheet_id == spreadsheet_id, E_INVALID_VERSION);
            i = i + 1;
        };
        
        // Remove from registry first
        if (table::contains(&registry.spreadsheets, spreadsheet_id)) {
            table::remove(&mut registry.spreadsheets, spreadsheet_id);
            registry.total_count = registry.total_count - 1;
            
            // Also remove from list
            let mut j = 0;
            let list_len = vector::length(&registry.spreadsheet_list);
            while (j < list_len) {
                if (*vector::borrow(&registry.spreadsheet_list, j) == spreadsheet_id) {
                    vector::remove(&mut registry.spreadsheet_list, j);
                    break
                };
                j = j + 1;
            };
        };
        
        // Delete all version objects
        while (!vector::is_empty(&versions)) {
            let version = vector::pop_back(&mut versions);
            // Version objects are deleted when they go out of scope
            let Version { id, spreadsheet_id: _, version_number: _, parent_version: _, 
                         walrus_blob_id: _, content_hash: _, cell_count: _, created_at: _, created_by: _, 
                         description: _ } = version;
            object::delete(id);
        };
        vector::destroy_empty(versions);
        
        // Emit deletion event
        event::emit(SpreadsheetDeleted {
            spreadsheet_id,
            owner,
            title,
            version_count,
            timestamp,
        });
        
        // Delete the spreadsheet object
        let Spreadsheet { 
            id, title: _, owner: _, created_at: _, last_modified: _, version_count: _,
            current_version: _, version_history: _, is_public: _, cell_locks, 
            collaborators, active_editors 
        } = spreadsheet;
        
        table::destroy_empty(cell_locks);
        table::destroy_empty(collaborators);
        table::destroy_empty(active_editors);
        object::delete(id);
    }

    /// Delete a spreadsheet simply (owner only) - WARNING: This is permanent!
    /// This version ONLY works for spreadsheets with no versions
    /// For spreadsheets with versions, use delete_spreadsheet_with_versions
    public entry fun delete_spreadsheet(
        registry: &mut SpreadsheetRegistry,
        spreadsheet: Spreadsheet,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(&spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        let spreadsheet_id = object::uid_to_address(&spreadsheet.id);
        
        // Ensure no versions exist - prevents orphaned version objects
        let version_history_len = vector::length(&spreadsheet.version_history);
        assert!(version_history_len == 0, E_INVALID_INPUT);
        
        // Store info for event before destruction
        let title = spreadsheet.title;
        let owner = spreadsheet.owner;
        let version_count = spreadsheet.version_count;
        let timestamp = tx_context::epoch_timestamp_ms(ctx);
        
        // Remove from registry first
        if (table::contains(&registry.spreadsheets, spreadsheet_id)) {
            table::remove(&mut registry.spreadsheets, spreadsheet_id);
            registry.total_count = registry.total_count - 1;
            
            // Also remove from list
            let mut j = 0;
            let list_len = vector::length(&registry.spreadsheet_list);
            while (j < list_len) {
                if (*vector::borrow(&registry.spreadsheet_list, j) == spreadsheet_id) {
                    vector::remove(&mut registry.spreadsheet_list, j);
                    break
                };
                j = j + 1;
            };
        };
        
        // Emit deletion event
        event::emit(SpreadsheetDeleted {
            spreadsheet_id,
            owner,
            title,
            version_count,
            timestamp,
        });
        
        // Delete the spreadsheet object
        let Spreadsheet { 
            id, title: _, owner: _, created_at: _, last_modified: _, version_count: _,
            current_version: _, version_history: _, is_public: _, cell_locks, 
            collaborators, active_editors 
        } = spreadsheet;
        
        table::destroy_empty(cell_locks);
        table::destroy_empty(collaborators);
        table::destroy_empty(active_editors);
        object::delete(id);
    }

    /// Get spreadsheet info (for reading)
    public fun get_spreadsheet_info(spreadsheet: &Spreadsheet): (String, address, u64, u64, u64, address, bool) {
        (
            spreadsheet.title,
            spreadsheet.owner,
            spreadsheet.created_at,
            spreadsheet.last_modified,
            spreadsheet.version_count,
            spreadsheet.current_version,
            spreadsheet.is_public
        )
    }

    /// Get extended spreadsheet info including collaboration data
    public fun get_spreadsheet_stats(spreadsheet: &Spreadsheet): (u64, u64, u64) {
        let lock_count = table::length(&spreadsheet.cell_locks);
        let collaborator_count = table::length(&spreadsheet.collaborators);
        let active_editor_count = table::length(&spreadsheet.active_editors);
        
        (lock_count, collaborator_count, active_editor_count)
    }

    /// Get version info (for reading) including content hash
    public fun get_version_info(version: &Version): (address, u64, String, String, u64, u64, address, String, option::Option<address>) {
        (
            version.spreadsheet_id,
            version.version_number,
            version.walrus_blob_id,
            version.content_hash,
            version.cell_count,
            version.created_at,
            version.created_by,
            version.description,
            version.parent_version
        )
    }

    /// Get version chain for history
    public fun get_version_chain(spreadsheet: &Spreadsheet, max_depth: u64): vector<address> {
        let mut chain = vector::empty<address>();
        let history_len = vector::length(&spreadsheet.version_history);
        let start = if (history_len > max_depth) {
            history_len - max_depth
        } else {
            0
        };
        
        let mut i = start;
        while (i < history_len) {
            vector::push_back(&mut chain, *vector::borrow(&spreadsheet.version_history, i));
            i = i + 1;
        };
        
        chain
    }

    /// Update spreadsheet title with validation
    public fun update_title(
        spreadsheet: &mut Spreadsheet,
        new_title: String,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        assert!(validate_string(&new_title, MAX_TITLE_LENGTH), E_EMPTY_STRING);
        
        spreadsheet.title = new_title;
        spreadsheet.last_modified = tx_context::epoch_timestamp_ms(ctx);
    }

    /// Make spreadsheet public
    public fun make_public(
        spreadsheet: &mut Spreadsheet,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        spreadsheet.is_public = true;
        spreadsheet.last_modified = tx_context::epoch_timestamp_ms(ctx);
    }

    /// Make spreadsheet private
    public fun make_private(
        spreadsheet: &mut Spreadsheet,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        spreadsheet.is_public = false;
        spreadsheet.last_modified = tx_context::epoch_timestamp_ms(ctx);
    }

    /// Transfer ownership with validation
    public fun transfer_ownership(
        spreadsheet: &mut Spreadsheet,
        new_owner: address,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        assert!(validate_address(new_owner), E_INVALID_ADDRESS);
        
        spreadsheet.owner = new_owner;
        spreadsheet.last_modified = tx_context::epoch_timestamp_ms(ctx);
    }

    /// Rollback to a previous version
    public fun rollback_to_version(
        spreadsheet: &mut Spreadsheet,
        target_version: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(has_permission(spreadsheet, sender, PERMISSION_ADMIN), E_NOT_OWNER);
        
        // Verify the version exists in history
        let mut found = false;
        let mut i = 0;
        let len = vector::length(&spreadsheet.version_history);
        while (i < len) {
            if (*vector::borrow(&spreadsheet.version_history, i) == target_version) {
                found = true;
                break
            };
            i = i + 1;
        };
        
        assert!(found, E_VERSION_NOT_FOUND);
        
        spreadsheet.current_version = target_version;
        spreadsheet.last_modified = clock::timestamp_ms(clock);
    }

    /// Force unlock all cells (admin only)
    public fun force_unlock_all_cells(
        spreadsheet: &mut Spreadsheet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);
        
        // Clear all locks
        // Note: In production, we'd need proper table clearing
        // This is simplified - would need iteration support
        // In Sui Move, we can't reassign tables directly due to Drop ability
        // In production, we'd iterate and remove each entry individually
        // This function would need to be redesigned for production use
    }

    /// Enhanced version pruning with smart preservation strategy
    public fun prune_old_versions_enhanced(
        spreadsheet: &mut Spreadsheet,
        keep_count: u64,
        preserve_full_versions: bool,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);

        let history_len = vector::length(&spreadsheet.version_history);
        if (history_len <= keep_count) return;

        // If not preserving full versions, use simple pruning
        if (!preserve_full_versions) {
            let remove_count = history_len - keep_count;
            let mut i = 0;
            while (i < remove_count) {
                vector::remove(&mut spreadsheet.version_history, 0);
                i = i + 1;
            };
            return
        };

        // Smart pruning: keep recent versions + periodic full snapshots
        // Note: This is a simplified implementation
        // In production, we'd inspect Version objects to determine storage type
        let mut versions_to_keep = vector::empty<address>();
        let mut kept_count = 0;

        // Always keep the most recent versions
        let recent_keep = keep_count / 2; // Keep half as recent
        let mut i = history_len;
        while (i > 0 && kept_count < recent_keep) {
            i = i - 1;
            vector::push_back(&mut versions_to_keep, *vector::borrow(&spreadsheet.version_history, i));
            kept_count = kept_count + 1;
        };

        // Keep periodic snapshots from older versions
        let snapshot_interval = 10; // Keep every 10th version
        while (i > 0 && kept_count < keep_count) {
            if (i % snapshot_interval == 0) {
                vector::push_back(&mut versions_to_keep, *vector::borrow(&spreadsheet.version_history, i));
                kept_count = kept_count + 1;
            };
            i = i - 1;
        };

        // Reverse to maintain chronological order
        vector::reverse(&mut versions_to_keep);
        spreadsheet.version_history = versions_to_keep;
    }

    /// Simple version pruning keeping only the last N versions
    public fun prune_old_versions(
        spreadsheet: &mut Spreadsheet,
        keep_count: u64,
        ctx: &mut TxContext
    ) {
        // Assert spreadsheet is using latest module version
        assert_latest_version(spreadsheet);

        let sender = tx_context::sender(ctx);
        assert!(sender == spreadsheet.owner, E_NOT_OWNER);

        let history_len = vector::length(&spreadsheet.version_history);
        if (history_len <= keep_count) return;

        let remove_count = history_len - keep_count;
        let mut i = 0;
        while (i < remove_count) {
            vector::remove(&mut spreadsheet.version_history, 0);
            i = i + 1;
        };
    }

    /// Get storage optimization statistics for a spreadsheet
    public fun get_storage_stats(spreadsheet: &Spreadsheet): (u64, u64, u64, u64) {
        let total_versions = vector::length(&spreadsheet.version_history);
        let lock_count = table::length(&spreadsheet.cell_locks);
        let collaborator_count = table::length(&spreadsheet.collaborators);
        let active_editor_count = table::length(&spreadsheet.active_editors);

        (total_versions, lock_count, collaborator_count, active_editor_count)
    }

    /// Get version compression info (for reading) - Enhanced version
    public fun get_version_compression_info(version: &Version): (option::Option<String>, option::Option<u64>, option::Option<u64>, option::Option<u64>) {
        if (option::is_some(&version.compression_info)) {
            let info = option::borrow(&version.compression_info);
            (
                option::some(info.algorithm),
                option::some(info.original_size),
                option::some(info.compressed_size),
                option::some(info.compression_ratio)
            )
        } else {
            (option::none(), option::none(), option::none(), option::none())
        }
    }

    /// Get version storage info (for reading)
    public fun get_version_storage_info(version: &Version): (option::Option<String>, option::Option<u64>, option::Option<bool>) {
        if (option::is_some(&version.storage_info)) {
            let info = option::borrow(&version.storage_info);
            (
                option::some(info.storage_type),
                option::some(info.operations),
                option::some(info.is_deduplicated)
            )
        } else {
            (option::none(), option::none(), option::none())
        }
    }

    /// Get current module version for client verification
    public fun get_module_version(): u64 {
        MODULE_VERSION
    }

    /// Get spreadsheet module version (public for clients)
    public fun get_spreadsheet_version_public(spreadsheet: &Spreadsheet): u64 {
        get_spreadsheet_version(spreadsheet)
    }

    /// Get registry module version (public for clients)
    public fun get_registry_version_public(registry: &SpreadsheetRegistry): u64 {
        get_registry_version(registry)
    }

    /// Migrate a spreadsheet to the latest module version (admin only)
    public entry fun migrate_spreadsheet(
        spreadsheet: &mut Spreadsheet,
        _cap: &SpreadsheetAdminCap,
        ctx: &mut TxContext
    ) {
        let old_version = get_spreadsheet_version(spreadsheet);

        // Only migrate if needed
        assert!(old_version < MODULE_VERSION, E_INVALID_INPUT);

        // Update module version via dynamic field
        set_spreadsheet_version(spreadsheet, MODULE_VERSION);

        // Backfill any new fields here if needed
        // For now, compression_info and storage_info in Version are already optional

        let spreadsheet_id = object::uid_to_address(&spreadsheet.id);
        let timestamp = tx_context::epoch_timestamp_ms(ctx);
        let outstanding_walrus_refs = vector::length(&spreadsheet.version_history);

        // Emit migration event
        event::emit(SpreadsheetMigrated {
            spreadsheet_id,
            old_version,
            new_version: MODULE_VERSION,
            timestamp,
            outstanding_walrus_refs,
        });
    }

    /// Migrate the registry to the latest version (admin only)
    public entry fun migrate_registry(
        registry: &mut SpreadsheetRegistry,
        _cap: &SpreadsheetAdminCap,
        ctx: &mut TxContext
    ) {
        let old_version = get_registry_version(registry);

        // Only migrate if needed
        assert!(old_version < MODULE_VERSION, E_INVALID_INPUT);

        // Update registry version via dynamic field
        set_registry_version(registry, MODULE_VERSION);

        let registry_id = object::uid_to_address(&registry.id);
        let timestamp = tx_context::epoch_timestamp_ms(ctx);

        // Emit migration event
        event::emit(RegistryMigrated {
            registry_id,
            old_version,
            new_version: MODULE_VERSION,
            timestamp,
        });
    }
}
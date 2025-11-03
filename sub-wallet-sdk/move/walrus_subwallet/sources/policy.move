module walrus_subwallet::policy {
    use sui::coin;
    use sui::coin::Coin;
    use sui::event;

    const E_NOT_ADMIN: u64 = 0;
    const E_WRONG_POLICY: u64 = 1;
    const E_WRONG_SPONSOR: u64 = 2;
    const E_LENGTH_MISMATCH: u64 = 3;
    const E_AMOUNT_ZERO: u64 = 4;
    const E_AMOUNT_TOO_SMALL: u64 = 5;
    const E_SPONSOR_LIMIT: u64 = 6;
    const E_PER_TX_LIMIT: u64 = 7;

    const MIN_VECTOR_LEN: u64 = 1;

    /// Share object containing configuration for sponsored sub-wallet operations.
    public struct Policy has key, store {
        id: sui::object::UID,
        admin: address,
        min_sui_per_wallet: u64,
        min_walrus_per_wallet: u64,
    }

    /// Capability that allows the admin to mutate the policy and onboard sponsors.
    public struct AdminCap has key, store {
        id: sui::object::UID,
        policy_id: sui::object::ID,
    }

    /// Capability held by sponsors that authorizes funded operations.
    public struct SponsorCap has key, store {
        id: sui::object::UID,
        policy_id: sui::object::ID,
        sponsor: address,
        remaining_allowance: u64,
        per_tx_limit: u64,
    }

    /// Event emitted on each successful funding batch.
    public struct FundedEvent has copy, drop {
        policy_id: sui::object::ID,
        sponsor: address,
        recipients: vector<address>,
        amounts: vector<u64>,
        total: u64,
    }

    fun assert_admin(policy: &Policy, admin_cap: &AdminCap, ctx: &sui::tx_context::TxContext) {
        assert!(sui::object::id(policy) == admin_cap.policy_id, E_WRONG_POLICY);
        assert!(sui::tx_context::sender(ctx) == policy.admin, E_NOT_ADMIN);
    }

    fun assert_sponsor(policy: &Policy, sponsor_cap: &SponsorCap, ctx: &sui::tx_context::TxContext) {
        assert!(sui::object::id(policy) == sponsor_cap.policy_id, E_WRONG_POLICY);
        assert!(sui::tx_context::sender(ctx) == sponsor_cap.sponsor, E_WRONG_SPONSOR);
    }

    public entry fun create_policy(
        min_sui_per_wallet: u64,
        min_walrus_per_wallet: u64,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        let policy = Policy {
            id: sui::object::new(ctx),
            admin: sender,
            min_sui_per_wallet,
            min_walrus_per_wallet,
        };
        let admin_cap = AdminCap {
            id: sui::object::new(ctx),
            policy_id: sui::object::id(&policy),
        };

        sui::transfer::share_object(policy);
        sui::transfer::public_transfer(admin_cap, sender);
    }

    public entry fun register_sponsor(
        policy: &Policy,
        admin_cap: &AdminCap,
        sponsor: address,
        allowance: u64,
        per_tx_limit: u64,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_admin(policy, admin_cap, ctx);
        assert!(allowance > 0, E_AMOUNT_ZERO);
        assert!(per_tx_limit > 0, E_AMOUNT_ZERO);

        let cap = SponsorCap {
            id: sui::object::new(ctx),
            policy_id: sui::object::id(policy),
            sponsor,
            remaining_allowance: allowance,
            per_tx_limit,
        };

        sui::transfer::public_transfer(cap, sponsor);
    }

    public entry fun update_thresholds(
        policy: &mut Policy,
        admin_cap: &AdminCap,
        min_sui_per_wallet: u64,
        min_walrus_per_wallet: u64,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_admin(policy, admin_cap, ctx);
        policy.min_sui_per_wallet = min_sui_per_wallet;
        policy.min_walrus_per_wallet = min_walrus_per_wallet;
    }

    public entry fun set_sponsor_allowance(
        policy: &Policy,
        admin_cap: &AdminCap,
        sponsor_cap: &mut SponsorCap,
        new_allowance: u64,
        new_per_tx_limit: u64,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_admin(policy, admin_cap, ctx);
        assert!(sui::object::id(policy) == sponsor_cap.policy_id, E_WRONG_POLICY);
        assert!(new_allowance >= sponsor_cap.remaining_allowance, E_SPONSOR_LIMIT);
        assert!(new_per_tx_limit > 0, E_AMOUNT_ZERO);
        sponsor_cap.remaining_allowance = new_allowance;
        sponsor_cap.per_tx_limit = new_per_tx_limit;
    }

    public entry fun fund_wallets_sui(
        policy: &Policy,
        sponsor_cap: &mut SponsorCap,
        mut coin: Coin<sui::sui::SUI>,
        recipients: vector<address>,
        amounts: vector<u64>,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_sponsor(policy, sponsor_cap, ctx);
        let len = std::vector::length(&recipients);
        assert!(len == std::vector::length(&amounts), E_LENGTH_MISMATCH);
        assert!(len >= MIN_VECTOR_LEN, E_LENGTH_MISMATCH);

        let mut total: u64 = 0;
        let mut idx = 0;

        while (idx < len) {
            let amount = *std::vector::borrow(&amounts, idx);
            assert!(amount > 0, E_AMOUNT_ZERO);
            assert!(amount >= policy.min_sui_per_wallet, E_AMOUNT_TOO_SMALL);
            total = total + amount;
            idx = idx + 1;
        };

        assert!(total <= sponsor_cap.remaining_allowance, E_SPONSOR_LIMIT);
        assert!(total <= sponsor_cap.per_tx_limit, E_PER_TX_LIMIT);

        let mut idx2 = 0;
        while (idx2 < len) {
            let recipient = *std::vector::borrow(&recipients, idx2);
            let amount_each = *std::vector::borrow(&amounts, idx2);
            let piece = coin::split(&mut coin, amount_each, ctx);
            sui::transfer::public_transfer(piece, recipient);
            idx2 = idx2 + 1;
        };

        sponsor_cap.remaining_allowance = sponsor_cap.remaining_allowance - total;
        sui::transfer::public_transfer(coin, sponsor_cap.sponsor);

        let mut recipients_copy = std::vector::empty<address>();
        let mut amounts_copy = std::vector::empty<u64>();
        let mut idx3 = 0;
        while (idx3 < len) {
            std::vector::push_back(&mut recipients_copy, *std::vector::borrow(&recipients, idx3));
            std::vector::push_back(&mut amounts_copy, *std::vector::borrow(&amounts, idx3));
            idx3 = idx3 + 1;
        };

        event::emit(FundedEvent {
            policy_id: sponsor_cap.policy_id,
            sponsor: sponsor_cap.sponsor,
            recipients: recipients_copy,
            amounts: amounts_copy,
            total,
        });
    }

    #[test_only]
    public fun init_for_testing(
        admin: address,
        min_sui_per_wallet: u64,
        min_walrus_per_wallet: u64,
        ctx: &mut sui::tx_context::TxContext,
    ): (Policy, AdminCap) {
        let policy = Policy {
            id: sui::object::new(ctx),
            admin,
            min_sui_per_wallet,
            min_walrus_per_wallet,
        };
        let admin_cap = AdminCap {
            id: sui::object::new(ctx),
            policy_id: sui::object::id(&policy),
        };
        (policy, admin_cap)
    }

    #[test_only]
    public fun sponsor_cap_for_testing(
        policy: &Policy,
        sponsor: address,
        allowance: u64,
        per_tx_limit: u64,
        ctx: &mut sui::tx_context::TxContext,
    ): SponsorCap {
        SponsorCap {
            id: sui::object::new(ctx),
            policy_id: sui::object::id(policy),
            sponsor,
            remaining_allowance: allowance,
            per_tx_limit,
        }
    }
}

module walrus_subwallet::policy_tests {
    use walrus_subwallet::policy;
    use sui::coin;
    use sui::tx_context;

    #[test]
    fun fund_wallets_sui_reduces_allowance() {
        let admin = @0xa;
        let sponsor = @0xb;
        let recipient = @0xc;
        let mut ctx = tx_context::dummy();

        tx_context::set_sender_for_testing(&mut ctx, admin);
        let (policy_obj, _) = policy::init_for_testing(admin, 10, 0, &mut ctx);

        tx_context::set_sender_for_testing(&mut ctx, sponsor);
        let mut sponsor_cap = policy::sponsor_cap_for_testing(&policy_obj, sponsor, 100, 100, &mut ctx);
        let coin = coin::mint_for_testing::<sui::sui::SUI>(60, &mut ctx);

        let mut recipients = std::vector::empty<address>();
        std::vector::push_back(&mut recipients, recipient);

        let mut amounts = std::vector::empty<u64>();
        std::vector::push_back(&mut amounts, 60);

        policy::fund_wallets_sui(&policy_obj, &mut sponsor_cap, coin, recipients, amounts, &mut ctx);

        std::assert::assert(sponsor_cap.remaining_allowance == 40, 0);
    }

    #[test, expected_failure]
    fun fund_wallets_sui_min_threshold_enforced() {
        let admin = @0xd;
        let sponsor = @0xe;
        let mut ctx = tx_context::dummy();

        tx_context::set_sender_for_testing(&mut ctx, admin);
        let (policy_obj, _) = policy::init_for_testing(admin, 25, 0, &mut ctx);

        tx_context::set_sender_for_testing(&mut ctx, sponsor);
        let mut sponsor_cap = policy::sponsor_cap_for_testing(&policy_obj, sponsor, 30, 30, &mut ctx);
        let coin = coin::mint_for_testing::<sui::sui::SUI>(30, &mut ctx);

        let mut recipients = std::vector::empty<address>();
        std::vector::push_back(&mut recipients, sponsor);

        let mut amounts = std::vector::empty<u64>();
        std::vector::push_back(&mut amounts, 10);

        policy::fund_wallets_sui(&policy_obj, &mut sponsor_cap, coin, recipients, amounts, &mut ctx);
    }
}

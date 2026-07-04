#![cfg(test)]

use super::*;
use soroban_sdk::{contract, contractimpl, Env, Address};
use soroban_sdk::testutils::Address as _;

#[contract]
pub struct DummyCallerContract;

#[contractimpl]
impl DummyCallerContract {
    pub fn call_increment(
        env: Env,
        reputation_contract: Address,
        caller: Address,
        target: Address,
        amount: u32,
    ) -> Result<(), Error> {
        let client = ReputationContractClient::new(&env, &reputation_contract);
        client.increment_reputation(&caller, &target, &amount);
        Ok(())
    }
}

#[test]
fn test_reputation_contract() {
    let env = Env::default();
    
    // Enable mocking for all auth calls (including sub-contract calls)
    env.mock_all_auths_allowing_non_root_auth();

    // Deploy reputation contract
    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    // Deploy dummy caller contract
    let dummy_caller_id = env.register(DummyCallerContract, ());
    let dummy_caller_client = DummyCallerContractClient::new(&env, &dummy_caller_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let target = Address::generate(&env);

    // 1. Initial reputation is 0
    assert_eq!(reputation_client.get_reputation(&target), 0);

    // 2. Set authorized caller to the dummy caller contract ID
    reputation_client.set_authorized_caller(&admin, &dummy_caller_id);

    // 3. Call increment via dummy caller (authorized contract) -> succeeds
    let result = dummy_caller_client.try_call_increment(&reputation_id, &user1, &target, &5);
    if let Err(e) = &result {
        panic!("try_call_increment failed with host error: {:?}", e);
    }
    assert!(result.is_ok());
    assert_eq!(reputation_client.get_reputation(&target), 5);
}

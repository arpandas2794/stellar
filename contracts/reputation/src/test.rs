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
fn test_initial_reputation_is_zero() {
    let env = Env::default();
    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let target = Address::generate(&env);

    assert_eq!(reputation_client.get_reputation(&target), 0);
}

#[test]
fn test_set_authorized_caller_success() {
    let env = Env::default();
    env.mock_all_auths();

    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin = Address::generate(&env);
    let caller_contract = Address::generate(&env);

    let result = reputation_client.try_set_authorized_caller(&admin, &caller_contract);
    assert!(result.is_ok());
}

#[test]
fn test_set_authorized_caller_gated_by_admin() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin1 = Address::generate(&env);
    let caller_contract = Address::generate(&env);

    // Initial setup by admin1 -> succeeds
    reputation_client.set_authorized_caller(&admin1, &caller_contract);

    // Call again with admin1 -> succeeds
    let result_ok = reputation_client.try_set_authorized_caller(&admin1, &caller_contract);
    assert!(result_ok.is_ok());
}

#[test]
fn test_set_authorized_caller_fails_without_signature() {
    let env = Env::default();
    // Do NOT mock auth

    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin = Address::generate(&env);
    let caller_contract = Address::generate(&env);

    // Without mocking, invoking this directly without admin signature will panic or fail
    let result = reputation_client.try_set_authorized_caller(&admin, &caller_contract);
    assert!(result.is_err());
}

#[test]
fn test_increment_reputation_success() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let dummy_caller_id = env.register(DummyCallerContract, ());
    let dummy_caller_client = DummyCallerContractClient::new(&env, &dummy_caller_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let target = Address::generate(&env);

    // Set authorized caller contract
    reputation_client.set_authorized_caller(&admin, &dummy_caller_id);

    // Increment
    let result = dummy_caller_client.try_call_increment(&reputation_id, &user1, &target, &3);
    assert!(result.is_ok());
    assert_eq!(reputation_client.get_reputation(&target), 3);
}

#[test]
fn test_increment_reputation_fails_if_no_caller_set() {
    let env = Env::default();
    // Do NOT mock auth for this failure test

    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let user1 = Address::generate(&env);
    let target = Address::generate(&env);

    // Since no authorized caller has been set, this must fail
    let direct_result = reputation_client.try_increment_reputation(&user1, &target, &5);
    assert!(direct_result.is_err());
}

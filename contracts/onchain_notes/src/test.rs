#![cfg(test)]

use super::*;
use soroban_sdk::{Env, Address, String};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use reputation::{ReputationContract, ReputationContractClient};

#[test]
fn test_onchain_notes_upgrades() {
    let env = Env::default();
    // Enable non-root auth mocking so that the contract-to-contract require_auth works!
    env.mock_all_auths_allowing_non_root_auth();

    // Read default ledger info, modify timestamp, and write it back
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 123456789;
    env.ledger().set(ledger_info);

    // Register notes contract
    let contract_id = env.register(OnChainNotesContract, ());
    let client = OnChainNotesContractClient::new(&env, &contract_id);

    // Register reputation contract
    let reputation_id = env.register(ReputationContract, ());
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin = Address::generate(&env);
    let author1 = Address::generate(&env);
    let author2 = Address::generate(&env);

    // Setup reputation contract authorized caller
    reputation_client.set_authorized_caller(&admin, &contract_id);

    // Link reputation contract in notes contract
    client.set_reputation_contract(&admin, &reputation_id);

    let message1 = String::from_str(&env, "Note 1");
    let message2 = String::from_str(&env, "Note 2");

    // 1. Initial counts
    assert_eq!(client.get_note_count(&author1), 0);
    assert_eq!(client.get_note_count(&author2), 0);
    assert_eq!(reputation_client.get_reputation(&author1), 0);
    assert_eq!(client.get_notes().len(), 0);

    // 2. Add notes
    let note_id1 = client.add_note(&author1, &message1);
    let note_id2 = client.add_note(&author1, &message2);

    assert_eq!(note_id1, 1);
    assert_eq!(note_id2, 2);
    assert_eq!(client.get_note_count(&author1), 2);
    assert_eq!(client.get_note_count(&author2), 0);
    assert_eq!(client.get_notes().len(), 2);

    // 3. Liking note -> triggers cross-contract reputation call
    client.like_note(&author2, &note_id1);

    let notes = client.get_notes();
    // note_id1 (id 1) is at index 0
    let note1 = notes.get(0).unwrap();
    assert_eq!(note1.likes, 1);
    assert_eq!(note1.likers.len(), 1);
    assert_eq!(note1.likers.get(0).unwrap(), author2);

    // Verify target author1 reputation is now 1!
    assert_eq!(reputation_client.get_reputation(&author1), 1);

    // 4. Duplicate likes fail
    let result_like_dup = client.try_like_note(&author2, &note_id1);
    assert!(result_like_dup.is_err());

    // 5. Delete note ownership check (non-author cannot delete)
    let result_delete_unauth = client.try_delete_note(&author2, &note_id1);
    assert!(result_delete_unauth.is_err());

    // 6. Delete note by author
    client.delete_note(&author1, &note_id1);

    // Verify it is removed
    assert_eq!(client.get_notes().len(), 1);
    assert_eq!(client.get_note_count(&author1), 1);
    assert_eq!(client.get_notes().get(0).unwrap().id, note_id2);
}

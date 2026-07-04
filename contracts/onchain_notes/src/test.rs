#![cfg(test)]

use super::*;
use soroban_sdk::{Env, Address, String};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;

#[test]
fn test_onchain_notes_upgrades() {
    let env = Env::default();
    env.mock_all_auths(); // Mock auth checks so require_auth passes

    // Read default ledger info, modify timestamp, and write it back
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 123456789;
    env.ledger().set(ledger_info);

    let contract_id = env.register(OnChainNotesContract, ());
    let client = OnChainNotesContractClient::new(&env, &contract_id);

    let author1 = Address::generate(&env);
    let author2 = Address::generate(&env);

    let message1 = String::from_str(&env, "Note 1");
    let message2 = String::from_str(&env, "Note 2");

    // 1. Initial counts
    assert_eq!(client.get_note_count(&author1), 0);
    assert_eq!(client.get_note_count(&author2), 0);
    assert_eq!(client.get_notes().len(), 0);

    // 2. Add notes
    let note_id1 = client.add_note(&author1, &message1);
    let note_id2 = client.add_note(&author1, &message2);

    assert_eq!(note_id1, 1);
    assert_eq!(note_id2, 2);
    assert_eq!(client.get_note_count(&author1), 2);
    assert_eq!(client.get_note_count(&author2), 0);
    assert_eq!(client.get_notes().len(), 2);

    // 3. Liking note
    // Author 2 likes note 1
    client.like_note(&author2, &note_id1);

    let notes = client.get_notes();
    // note_id1 (id 1) is at index 0
    let note1 = notes.get(0).unwrap();
    assert_eq!(note1.likes, 1);
    assert_eq!(note1.likers.len(), 1);
    assert_eq!(note1.likers.get(0).unwrap(), author2);

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

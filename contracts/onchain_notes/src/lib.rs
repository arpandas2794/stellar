#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, Env, String, Symbol, Vec
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    EmptyMessage = 1,
    MessageTooLong = 2,
    NoteNotFound = 3,
    Unauthorized = 4,
    AlreadyLiked = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Note {
    pub id: u64,
    pub author: Address,
    pub message: String,
    pub timestamp: u64,
    pub likes: u32,
    pub likers: Vec<Address>,
}

#[contracttype]
pub enum DataKey {
    Notes,
    NextNoteId,
    ReputationContract,
    Admin,
}

#[contract]
pub struct OnChainNotesContract;

#[contractimpl]
impl OnChainNotesContract {
    pub fn add_note(env: Env, author: Address, message: String) -> Result<u64, Error> {
        // 1. Author must authorize
        author.require_auth();

        // 2. Validate message length
        let msg_len = message.len();
        if msg_len == 0 {
            return Err(Error::EmptyMessage);
        }
        if msg_len > 140 {
            return Err(Error::MessageTooLong);
        }

        // 3. Get ledger timestamp
        let timestamp = env.ledger().timestamp();

        // 4. Generate unique note ID
        let mut next_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextNoteId)
            .unwrap_or(1);
        let note_id = next_id;
        next_id += 1;
        env.storage().persistent().set(&DataKey::NextNoteId, &next_id);

        // 5. Retrieve existing notes
        let mut notes: Vec<Note> = env
            .storage()
            .persistent()
            .get(&DataKey::Notes)
            .unwrap_or_else(|| Vec::new(&env));

        // 6. Append new note
        let note = Note {
            id: note_id,
            author: author.clone(),
            message: message.clone(),
            timestamp,
            likes: 0,
            likers: Vec::new(&env),
        };
        notes.push_back(note);

        // 7. Save updated notes back to persistent storage
        env.storage().persistent().set(&DataKey::Notes, &notes);

        // 8. Emit note added event
        env.events().publish(
            (Symbol::new(&env, "note_added"),),
            (note_id, author, message, timestamp),
        );

        Ok(note_id)
    }

    pub fn delete_note(env: Env, author: Address, note_id: u64) -> Result<(), Error> {
        // 1. Author must authorize
        author.require_auth();

        // 2. Retrieve existing notes
        let mut notes: Vec<Note> = env
            .storage()
            .persistent()
            .get(&DataKey::Notes)
            .unwrap_or_else(|| Vec::new(&env));

        let mut index_to_remove: Option<u32> = None;

        // 3. Search note by ID
        for i in 0..notes.len() {
            if let Some(note) = notes.get(i) {
                if note.id == note_id {
                    // 4. Verify ownership
                    if note.author != author {
                        return Err(Error::Unauthorized);
                    }
                    index_to_remove = Some(i);
                    break;
                }
            }
        }

        // 5. Delete note if found
        if let Some(idx) = index_to_remove {
            notes.remove(idx);
            env.storage().persistent().set(&DataKey::Notes, &notes);

            // 6. Emit event
            env.events().publish(
                (Symbol::new(&env, "note_deleted"),),
                (note_id, author),
            );
            Ok(())
        } else {
            Err(Error::NoteNotFound)
        }
    }

    pub fn like_note(env: Env, liker: Address, note_id: u64) -> Result<(), Error> {
        // 1. Liker must authorize
        liker.require_auth();

        // 2. Retrieve notes
        let mut notes: Vec<Note> = env
            .storage()
            .persistent()
            .get(&DataKey::Notes)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found_and_updated = false;

        // 3. Search note and update
        for i in 0..notes.len() {
            if let Some(mut note) = notes.get(i) {
                if note.id == note_id {
                    // Check if already liked
                    let mut already_liked = false;
                    for j in 0..note.likers.len() {
                        if let Some(addr) = note.likers.get(j) {
                            if addr == liker {
                                already_liked = true;
                                break;
                            }
                        }
                    }

                    if already_liked {
                        return Err(Error::AlreadyLiked);
                    }

                    // Append liker and increment count
                    note.likers.push_back(liker.clone());
                    note.likes += 1;
                    notes.set(i, note.clone());
                    found_and_updated = true;

                    // Emit event
                    env.events().publish(
                        (Symbol::new(&env, "note_liked"),),
                        (note_id, liker.clone(), note.likes),
                    );

                    // Cross-contract call to the reputation contract if registered
                    let reputation_id_opt: Option<Address> = env
                        .storage()
                        .persistent()
                        .get(&DataKey::ReputationContract);

                    if let Some(reputation_id) = reputation_id_opt {
                        use soroban_sdk::IntoVal;
                        let target = note.author.clone();
                        let call_args = (liker.clone(), target.clone(), 1u32).into_val(&env);

                        let call_res = env.try_invoke_contract::<(), soroban_sdk::Error>(
                            &reputation_id,
                            &Symbol::new(&env, "increment_reputation"),
                            call_args,
                        );

                        match call_res {
                            Ok(Ok(())) => {
                                // Reputation successfully updated
                            }
                            _ => {
                                // Graceful failure: log/emit that reputation bump failed,
                                // but do not revert the note liking itself.
                                env.events().publish(
                                    (Symbol::new(&env, "reputation_failed"),),
                                    (note_id, target),
                                );
                            }
                        }
                    }

                    break;
                }
            }
        }

        if found_and_updated {
            env.storage().persistent().set(&DataKey::Notes, &notes);
            Ok(())
        } else {
            Err(Error::NoteNotFound)
        }
    }

    pub fn get_notes(env: Env) -> Vec<Note> {
        env.storage()
            .persistent()
            .get(&DataKey::Notes)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_note_count(env: Env, author: Address) -> u32 {
        let notes: Vec<Note> = env
            .storage()
            .persistent()
            .get(&DataKey::Notes)
            .unwrap_or_else(|| Vec::new(&env));

        let mut count = 0;
        for i in 0..notes.len() {
            if let Some(note) = notes.get(i) {
                if note.author == author {
                    count += 1;
                }
            }
        }
        count
    }

    pub fn set_reputation_contract(
        env: Env,
        admin: Address,
        reputation_id: Address,
    ) -> Result<(), Error> {
        if env.storage().persistent().has(&DataKey::Admin) {
            let stored_admin: Address = env
                .storage()
                .persistent()
                .get(&DataKey::Admin)
                .unwrap();
            stored_admin.require_auth();
        } else {
            admin.require_auth();
            env.storage().persistent().set(&DataKey::Admin, &admin);
        }

        env.storage()
            .persistent()
            .set(&DataKey::ReputationContract, &reputation_id);

        Ok(())
    }
}

mod test;

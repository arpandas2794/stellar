#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, Env, Symbol
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
}

#[contracttype]
pub enum DataKey {
    Admin,
    AuthorizedCaller,
    Reputation(Address),
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    pub fn increment_reputation(
        env: Env,
        caller: Address,
        target: Address,
        amount: u32,
    ) -> Result<(), Error> {
        // 1. Fetch the stored authorized caller contract ID
        let authorized_caller: Address = env
            .storage()
            .persistent()
            .get(&DataKey::AuthorizedCaller)
            .ok_or(Error::NotAuthorized)?;

        // 2. Enforce contract-to-contract auth:
        // We call require_auth() on the authorized contract ID. If the contract calling
        // this function is indeed the authorized contract ID, this will succeed.
        // Otherwise, it will fail.
        authorized_caller.require_auth();

        // 3. Verify that the user wallet (caller) has authorized this operation
        caller.require_auth();

        // 4. Update target reputation score
        let current_score: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(target.clone()))
            .unwrap_or(0);

        let new_score = current_score + amount;
        env.storage()
            .persistent()
            .set(&DataKey::Reputation(target.clone()), &new_score);

        // 5. Emit event
        env.events().publish(
            (Symbol::new(&env, "reputation_updated"),),
            (target, new_score),
        );

        Ok(())
    }

    pub fn get_reputation(env: Env, address: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation(address))
            .unwrap_or(0)
    }

    pub fn set_authorized_caller(
        env: Env,
        admin: Address,
        caller_contract_id: Address,
    ) -> Result<(), Error> {
        // 1. Gated setup: check if admin is already set in storage
        if env.storage().persistent().has(&DataKey::Admin) {
            let stored_admin: Address = env
                .storage()
                .persistent()
                .get(&DataKey::Admin)
                .unwrap();
            stored_admin.require_auth();
        } else {
            // First time setup, admin is recorded
            admin.require_auth();
            env.storage().persistent().set(&DataKey::Admin, &admin);
        }

        // 2. Save authorized caller contract ID
        env.storage()
            .persistent()
            .set(&DataKey::AuthorizedCaller, &caller_contract_id);

        Ok(())
    }
}

mod test;

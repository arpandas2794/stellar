import { TransactionBuilder, Networks, Operation, Asset, BASE_FEE, Account, Keypair } from "@stellar/stellar-sdk";

// Generate a valid public key
const keypair = Keypair.random();
const publicKey = keypair.publicKey();

// Create a dummy Account object with sequence number
const account = new Account(publicKey, "100");

const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.payment({
      destination: publicKey,
      asset: Asset.native(),
      amount: "1.00",
    })
  )
  .setTimeout(30)
  .build();

console.log("Transaction network passphrase:", tx.networkPassphrase);
console.log("Is it testnet?:", tx.networkPassphrase === Networks.TESTNET);
console.log("tx.toXDR():", tx.toXDR());

// Parse it back to verify network
const parsedTx = TransactionBuilder.fromXDR(tx.toXDR(), Networks.TESTNET);
console.log("Parsed network passphrase:", parsedTx.networkPassphrase);

import freighter from "@stellar/freighter-api";

const { isConnected, requestAccess, signTransaction } = freighter;

/**
 * Checks if the Freighter wallet extension is installed in the user's browser.
 * @returns {Promise<boolean>} Resolves to true if installed, false otherwise.
 */
export async function isFreighterInstalled() {
  try {
    const result = await isConnected();
    return !!result.isConnected;
  } catch (error) {
    console.error("Error detecting Freighter extension:", error);
    return false;
  }
}

/**
 * Connects to Freighter and retrieves the active account's public key.
 * This triggers a permission prompt in Freighter if the app is not yet authorized.
 * @returns {Promise<string>} The connected Stellar public key (G...).
 * @throws {Error} If connection fails or is rejected.
 */
export async function connectFreighter() {
  try {
    const result = await requestAccess();
    if (result.error) {
      throw new Error(typeof result.error === "string" ? result.error : result.error.message || "Access denied");
    }
    if (!result.address) {
      throw new Error("No public key returned. Please ensure your wallet is unlocked and authorized.");
    }
    return result.address;
  } catch (error) {
    console.error("Error connecting Freighter:", error);
    throw new Error(error.message || "Failed to retrieve public key from Freighter.");
  }
}

/**
 * Signs a transaction XDR string using Freighter on the Stellar Testnet.
 * @param {string} transactionXdr - The built transaction XDR to be signed.
 * @returns {Promise<string>} The signed transaction XDR.
 * @throws {Error} If signing is rejected or fails.
 */
export async function signTx(transactionXdr) {
  try {
    // signTransaction requests Freighter to sign the transaction XDR.
    // Providing both network and networkPassphrase explicitly to ensure no ambiguity in the wallet.
    const result = await signTransaction(transactionXdr, {
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    if (result.error) {
      throw new Error(typeof result.error === "string" ? result.error : result.error.message || "Signing failed");
    }

    if (!result.signedTxXdr) {
      throw new Error("Transaction signing was cancelled or rejected by the user.");
    }

    return result.signedTxXdr;
  } catch (error) {
    console.error("Error signing transaction with Freighter:", error);
    throw new Error(error.message || "Transaction signature rejected or failed.");
  }
}


import { Horizon, TransactionBuilder, Networks, Operation, Asset, BASE_FEE, Keypair, Memo } from "@stellar/stellar-sdk";

// Initialize the Horizon server for the Stellar Testnet
const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const server = new Horizon.Server(HORIZON_URL);

// Hardcode Testnet passphrase to avoid Vite/bundling ESM import resolution issues
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * Validates whether a given string is a valid Stellar public key (G...).
 * @param {string} address - The Stellar address to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export function isValidPublicKey(address) {
  if (!address || typeof address !== "string" || address.length !== 56 || !address.startsWith("G")) {
    return false;
  }
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fetches the native XLM balance and funding state of a public key.
 * If the account does not exist, Horizon returns a 404 error, which is caught and handled.
 * @param {string} publicKey - The public key of the account.
 * @returns {Promise<{ balance: string, isFunded: boolean }>} The balance and funded status.
 */
export async function fetchAccountState(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    const nativeAsset = account.balances.find((b) => b.asset_type === "native");
    return {
      balance: nativeAsset ? parseFloat(nativeAsset.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 }) : "0.00",
      rawBalance: nativeAsset ? parseFloat(nativeAsset.balance) : 0,
      isFunded: true,
    };
  } catch (error) {
    // If the account has not been funded yet, Horizon returns 404
    if (error.response && error.response.status === 404) {
      return {
        balance: "0.00",
        rawBalance: 0,
        isFunded: false,
      };
    }
    console.error("Error loading Stellar account state:", error);
    throw new Error("Unable to connect to Horizon. Check your internet connection.");
  }
}

/**
 * Builds an unsigned Payment transaction on the Stellar Testnet.
 * @param {Object} params - Build params.
 * @param {string} params.senderPublicKey - The source account public key.
 * @param {string} params.recipientAddress - The recipient Stellar address.
 * @param {string} params.amount - The amount of XLM to send.
 * @param {string} [params.memo] - Optional memo text.
 * @returns {Promise<Transaction>} The built, unsigned transaction object.
 */
export async function buildPaymentTransaction({ senderPublicKey, recipientAddress, amount, memo }) {
  // Load source account details (needed for sequence numbers)
  const sourceAccount = await server.loadAccount(senderPublicKey);

  // Build the transaction explicitly on Testnet
  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE, // default 100 stroops (0.00001 XLM)
    networkPassphrase: TESTNET_PASSPHRASE,
  });

  // Add the payment operation
  builder.addOperation(
    Operation.payment({
      destination: recipientAddress,
      asset: Asset.native(),
      amount: amount.toString(),
    })
  );

  // Add memo if provided and not empty
  if (memo && memo.trim().length > 0) {
    builder.addMemo(Memo.text(memo.trim()));
  }

  // Set timeout of 30 seconds
  builder.setTimeout(30);

  const tx = builder.build();
  console.log("Built Transaction Network Passphrase:", tx.networkPassphrase);
  return tx;
}

/**
 * Submits a signed transaction to the Horizon Testnet.
 * @param {string} signedXdr - The signed transaction XDR string.
 * @returns {Promise<Object>} The submission result containing the hash.
 */
export async function submitSignedTransaction(signedXdr) {
  try {
    const signedTx = TransactionBuilder.fromXDR(signedXdr, TESTNET_PASSPHRASE);
    const response = await server.submitTransaction(signedTx);
    return response;
  } catch (error) {
    console.error("Stellar transaction submission failed:", error);
    const parsedError = parseHorizonError(error);
    throw new Error(parsedError);
  }
}

/**
 * Parses Horizon transaction submission errors into human-readable messages.
 * @param {Error} error - The error caught during submission.
 * @returns {string} User-friendly error message.
 */
function parseHorizonError(error) {
  // Check if it's a Horizon response error
  const data = error.response?.data;
  if (data) {
    const resultCodes = data.extras?.result_codes;
    const opResultCodes = resultCodes?.operations;

    // Check specific operation errors
    if (opResultCodes && opResultCodes.length > 0) {
      const opCode = opResultCodes[0];
      switch (opCode) {
        case "op_no_destination":
          return "Destination account doesn't exist. Please fund the recipient account first or use create_account.";
        case "op_underfunded":
          return "Insufficient XLM balance. Ensure you have enough XLM to cover the amount and the minimum reserve.";
        case "op_no_trust":
          return "Destination asset trustline not found.";
        case "op_src_not_authorized":
          return "Source account is not authorized to send this asset.";
        case "op_invalid_limit":
          return "Payment amount exceeds trustline limit.";
        default:
          return `Payment operation failed with error code: ${opCode}`;
      }
    }

    // Check transaction-level codes
    if (resultCodes?.transaction) {
      const txCode = resultCodes.transaction;
      switch (txCode) {
        case "tx_underfunded":
          return "Insufficient XLM balance. You do not have enough XLM to cover the fee and transaction.";
        case "tx_bad_seq":
          return "Transaction sequence conflict. Please refresh and try again.";
        case "tx_insufficient_fee":
          return "Transaction fee is too low for the current network load.";
        case "tx_too_late":
          return "Transaction timed out. Please try again.";
        default:
          return `Transaction failed with code: ${txCode}`;
      }
    }

    // Generic horizon error description
    return data.detail || data.title || "Horizon node rejected the transaction.";
  }

  // Non-Horizon network error
  return error.message || "Network error. Unable to communicate with Stellar Horizon.";
}

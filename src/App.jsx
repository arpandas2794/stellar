import React, { useState, useEffect } from "react";
import WalletConnector from "./components/WalletConnector";
import BalanceDisplay from "./components/BalanceDisplay";
import SendForm from "./components/SendForm";
import TransactionResult from "./components/TransactionResult";

import {
  isFreighterInstalled,
  connectFreighter,
  signTx,
} from "./lib/freighter";

import {
  fetchAccountState,
  buildPaymentTransaction,
  submitSignedTransaction,
} from "./lib/stellar";

export default function App() {
  // Wallet Connection States
  const [publicKey, setPublicKey] = useState(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  // Account Balance States
  const [balance, setBalance] = useState("0.00");
  const [rawBalance, setRawBalance] = useState(0);
  const [isFunded, setIsFunded] = useState(true);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);

  // Transaction States
  const [isSending, setIsSending] = useState(false);
  const [txSuccessData, setTxSuccessData] = useState(null);
  const [txError, setTxError] = useState(null);

  // Detect if Freighter is installed on component mount
  useEffect(() => {
    async function detectWallet() {
      const installed = await isFreighterInstalled();
      setIsInstalled(installed);
    }
    detectWallet();
  }, []);

  /**
   * Connects the Freighter wallet, retrieves public key, and loads its balance.
   */
  const handleConnect = async () => {
    setIsConnecting(true);
    setTxError(null);
    try {
      const pubKey = await connectFreighter();
      setPublicKey(pubKey);
      await loadAccountBalance(pubKey);
    } catch (error) {
      console.error("Connection failed:", error);
      setTxError(error.message || "Failed to connect to Freighter wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Disconnects the wallet and resets the application state.
   */
  const handleDisconnect = () => {
    setPublicKey(null);
    setBalance("0.00");
    setRawBalance(0);
    setIsFunded(true);
    setTxSuccessData(null);
    setTxError(null);
  };

  /**
   * Loads the current balance and account funded status for a given public key.
   * @param {string} key - The public key of the account.
   */
  const loadAccountBalance = async (key) => {
    if (!key) return;
    setIsFetchingBalance(true);
    try {
      const accountState = await fetchAccountState(key);
      setBalance(accountState.balance);
      setRawBalance(accountState.rawBalance);
      setIsFunded(accountState.isFunded);
    } catch (error) {
      console.error("Failed to load balance:", error);
      setTxError("Failed to fetch account balance. Please check your network connectivity.");
    } finally {
      setIsFetchingBalance(false);
    }
  };

  /**
   * Triggers manual balance refresh.
   */
  const handleRefreshBalance = async () => {
    if (!publicKey) return;
    await loadAccountBalance(publicKey);
  };

  /**
   * Clears transaction success and error banners.
   */
  const handleClearResults = () => {
    setTxSuccessData(null);
    setTxError(null);
  };

  /**
   * Orchestrates the Stellar transaction flow:
   * 1. Builds payment transaction.
   * 2. Prompts Freighter signature.
   * 3. Submits signed transaction to Horizon.
   * 4. Auto-refreshes balance on success.
   *
   * @param {Object} txParams - Address, Amount, and optional Memo.
   */
  const handleSendTransaction = async ({ recipientAddress, amount, memo }) => {
    if (!publicKey) return;
    
    setIsSending(true);
    setTxError(null);
    setTxSuccessData(null);

    try {
      // Step 1: Build the transaction
      const tx = await buildPaymentTransaction({
        senderPublicKey: publicKey,
        recipientAddress,
        amount,
        memo,
      });

      // Step 2: Sign transaction using Freighter
      const unsignedXdr = tx.toXDR();
      const signedXdr = await signTx(unsignedXdr);

      // Step 3: Submit transaction to Horizon testnet
      const response = await submitSignedTransaction(signedXdr);

      // Step 4: Show success feedback
      setTxSuccessData({
        hash: response.hash,
        ledger: response.ledger,
      });

      // Step 5: Auto-refresh balance
      await loadAccountBalance(publicKey);

    } catch (error) {
      console.error("Transaction failed:", error);
      setTxError(error.message || "An unexpected error occurred during the transaction.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="app-container">
      {/* Wallet Connection Header & Setup Banner */}
      <WalletConnector
        publicKey={publicKey}
        isInstalled={isInstalled}
        isLoading={isConnecting}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      {/* Grid Dashboard */}
      <main className="app-dashboard">
        {/* Left Side: Balance Information Card */}
        <BalanceDisplay
          publicKey={publicKey}
          balance={balance}
          isFunded={isFunded}
          isFetching={isFetchingBalance}
          onRefresh={handleRefreshBalance}
        />

        {/* Right Side: Payment Submission Form */}
        <div className="form-column">
          <SendForm
            publicKey={publicKey}
            rawBalance={rawBalance}
            isFunded={isFunded}
            isSending={isSending}
            onSubmit={handleSendTransaction}
          />
          
          {/* Success/Error Transaction Display Banner */}
          <TransactionResult
            successData={txSuccessData}
            error={txError}
            onClear={handleClearResults}
          />
        </div>
      </main>

      {/* Premium Footer */}
      <footer className="app-footer">
        <p>
          Stellar Pay &copy; 2026. Powered by{" "}
          <a
            href="https://developers.stellar.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stellar Testnet Horizon API
          </a>{" "}
          and{" "}
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Freighter Wallet
          </a>.
        </p>
      </footer>
    </div>
  );
}

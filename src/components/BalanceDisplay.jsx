import React, { useState } from "react";
import { RefreshCw, Coins, HelpCircle, AlertCircle } from "lucide-react";

/**
 * BalanceDisplay Component
 * Displays the current XLM balance and funding warnings/helpers.
 *
 * @param {Object} props
 * @param {string|null} props.publicKey - The connected wallet public key.
 * @param {string} props.balance - Formatted XLM balance string.
 * @param {boolean} props.isFunded - False if the account does not exist on Testnet.
 * @param {boolean} props.isFetching - True when reloading balance.
 * @param {Function} props.onRefresh - Callback to reload balance.
 */
export default function BalanceDisplay({
  publicKey,
  balance,
  isFunded,
  isFetching,
  onRefresh,
}) {
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState("");

  const handleFundAccount = async () => {
    if (!publicKey) return;
    setFunding(true);
    setFundError("");
    try {
      // Call the Stellar Friendbot API to fund the testnet account
      const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
      if (!response.ok) {
        throw new Error("Friendbot funding failed. Please try funding manually.");
      }
      // Give Horizon a second to index the transaction
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await onRefresh();
    } catch (err) {
      console.error(err);
      setFundError(err.message || "Failed to contact Friendbot.");
    } finally {
      setFunding(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="card balance-card empty-state">
        <Coins size={36} className="text-muted mb-3" />
        <h3>Wallet Not Connected</h3>
        <p className="text-muted text-sm">
          Please connect your Freighter wallet to view your XLM balance.
        </p>
      </div>
    );
  }

  return (
    <div className="card balance-card">
      <div className="card-header">
        <div className="card-title-group">
          <Coins size={18} className="text-accent" />
          <h2 className="card-title">XLM Balance</h2>
        </div>
        <button
          id="balance-refresh-btn"
          className="btn-icon"
          onClick={onRefresh}
          disabled={isFetching || funding}
          title="Refresh Balance"
        >
          <RefreshCw className={`icon ${isFetching ? "animate-spin" : ""}`} size={16} />
        </button>
      </div>

      <div className="card-body">
        {isFunded ? (
          <div className="balance-display-wrapper">
            <div className="balance-amount-row">
              <span className="balance-value font-mono">{balance}</span>
              <span className="balance-currency">XLM</span>
            </div>
            <span className="balance-label">Available Balance</span>
          </div>
        ) : (
          <div className="unfunded-alert-card">
            <div className="alert-header">
              <AlertCircle className="alert-icon text-warning animate-bounce" size={20} />
              <h4>Account Not Funded</h4>
            </div>
            <p className="alert-text text-sm">
              This Stellar address has not been activated on the Testnet. Stellar accounts must be funded with a minimum starting balance to exist.
            </p>

            {fundError && (
              <div className="error-message text-xs mb-3">
                ⚠️ {fundError}
              </div>
            )}

            <div className="alert-actions">
              <button
                id="balance-fund-btn"
                className="btn btn-warning btn-sm"
                onClick={handleFundAccount}
                disabled={funding}
              >
                {funding ? (
                  <>
                    <span className="loader spinner-small mr-2"></span>
                    Funding...
                  </>
                ) : (
                  "Fund via Friendbot"
                )}
              </button>
              
              <a
                id="stellar-lab-link"
                href={`https://laboratory.stellar.org/#account-creator?network=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm"
              >
                Stellar Laboratory <HelpCircle size={14} className="ml-1" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

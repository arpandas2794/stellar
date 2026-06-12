import React, { useState } from "react";
import { CheckCircle2, AlertOctagon, ExternalLink, Copy, Check, X } from "lucide-react";

/**
 * TransactionResult Component
 * Shows success and error cards for transaction operations.
 *
 * @param {Object} props
 * @param {Object|null} props.successData - Transaction response data (contains hash, ledger, etc).
 * @param {string|null} props.error - Submission error message.
 * @param {Function} props.onClear - Callback to clear the results and reset form state.
 */
export default function TransactionResult({ successData, error, onClear }) {
  const [copied, setCopied] = useState(false);

  if (!successData && !error) return null;

  const handleCopyHash = async () => {
    if (!successData?.hash) return;
    try {
      await navigator.clipboard.writeText(successData.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy transaction hash:", err);
    }
  };

  const truncateHash = (hash) => {
    if (!hash) return "";
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
  };

  return (
    <div className="transaction-result-wrapper animate-fade-in">
      {successData && (
        <div className="result-card card-success">
          <button className="close-btn" onClick={onClear} title="Dismiss">
            <X size={16} />
          </button>
          
          <div className="result-header">
            <div className="result-icon-bg success-bg">
              <CheckCircle2 className="result-icon text-success animate-bounce" size={24} />
            </div>
            <div className="result-info">
              <h3>Transaction Successful!</h3>
              <p className="text-muted text-sm">
                Your payment of XLM was confirmed on the Stellar Testnet ledger.
              </p>
            </div>
          </div>

          <div className="result-body font-mono text-sm">
            <div className="result-row">
              <span className="row-label">Tx Hash:</span>
              <div className="hash-wrapper">
                <span className="hash-text">{truncateHash(successData.hash)}</span>
                <button
                  className="btn-icon-sm"
                  onClick={handleCopyHash}
                  title="Copy full transaction hash"
                >
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            {successData.ledger && (
              <div className="result-row">
                <span className="row-label">Ledger:</span>
                <span className="row-value">{successData.ledger}</span>
              </div>
            )}
          </div>

          <div className="result-actions">
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${successData.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-success btn-block"
            >
              View on Explorer <ExternalLink size={14} className="ml-2" />
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="result-card card-danger">
          <button className="close-btn" onClick={onClear} title="Dismiss">
            <X size={16} />
          </button>

          <div className="result-header">
            <div className="result-icon-bg danger-bg">
              <AlertOctagon className="result-icon text-danger" size={24} />
            </div>
            <div className="result-info">
              <h3>Transaction Failed</h3>
              <p className="text-muted text-sm">
                The transaction was rejected by Freighter or the Stellar network.
              </p>
            </div>
          </div>

          <div className="result-body">
            <div className="error-details font-mono text-xs">
              {error}
            </div>
          </div>

          <div className="result-actions">
            <button className="btn btn-outline-danger btn-block" onClick={onClear}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

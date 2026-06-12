import React, { useState, useEffect } from "react";
import { Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { isValidPublicKey } from "../lib/stellar";

/**
 * SendForm Component
 * Renders the recipient, amount, and memo inputs with real-time validations.
 *
 * @param {Object} props
 * @param {string|null} props.publicKey - Connected account public key.
 * @param {number} props.rawBalance - Available XLM balance for validation.
 * @param {boolean} props.isFunded - True if the source account is funded.
 * @param {boolean} props.isSending - True if transaction is being built/submitted.
 * @param {Function} props.onSubmit - Callback to execute transaction submit.
 */
export default function SendForm({
  publicKey,
  rawBalance,
  isFunded,
  isSending,
  onSubmit,
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  // Validation states
  const [recipientError, setRecipientError] = useState("");
  const [recipientValid, setRecipientValid] = useState(false);
  const [amountError, setAmountError] = useState("");
  const [amountValid, setAmountValid] = useState(false);
  const [memoError, setMemoError] = useState("");

  // Validate recipient on change
  useEffect(() => {
    if (!recipient) {
      setRecipientError("");
      setRecipientValid(false);
      return;
    }

    if (recipient === publicKey) {
      setRecipientError("Cannot send XLM to your own address.");
      setRecipientValid(false);
      return;
    }

    if (isValidPublicKey(recipient)) {
      setRecipientError("");
      setRecipientValid(true);
    } else {
      setRecipientError("Invalid Stellar public key format (must start with 'G' and be 56 characters).");
      setRecipientValid(false);
    }
  }, [recipient, publicKey]);

  // Validate amount on change
  useEffect(() => {
    if (!amount) {
      setAmountError("");
      setAmountValid(false);
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setAmountError("Amount must be a positive number.");
      setAmountValid(false);
      return;
    }

    // Stellar transaction fees are tiny (0.00001 XLM), but we also have base reserves (1 XLM)
    // We will validate against the raw balance.
    const maxSendable = Math.max(0, rawBalance - 1.0001); // 1 XLM base reserve + fee buffer

    if (numAmount > rawBalance) {
      setAmountError(`Insufficient funds. Your current balance is ${rawBalance} XLM.`);
      setAmountValid(false);
    } else if (numAmount > maxSendable) {
      setAmountError(`Warning: Sending this amount leaves you below the Stellar base reserve requirement (1 XLM + fees).`);
      setAmountValid(true); // Allow sending, but show a warning
    } else {
      setAmountError("");
      setAmountValid(true);
    }
  }, [amount, rawBalance]);

  // Validate memo on change
  useEffect(() => {
    // Stellar Text Memo limit is 28 bytes
    if (memo && memo.length > 28) {
      setMemoError("Text memo exceeds 28 character limit.");
    } else {
      setMemoError("");
    }
  }, [memo]);

  // Max Button handler
  const handleMaxClick = () => {
    if (!publicKey || rawBalance <= 0) return;
    // Account minimum reserve is 1 XLM, base fee is 0.00001 XLM.
    // We leave 1.001 XLM as a safe buffer.
    const maxSendable = Math.max(0, rawBalance - 1.001);
    setAmount(maxSendable.toFixed(5));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!recipientValid || !amountValid || !!memoError || isSending) return;

    onSubmit({
      recipientAddress: recipient.trim(),
      amount: amount.trim(),
      memo: memo.trim(),
    });
  };

  const isFormValid = recipientValid && amountValid && !memoError && publicKey && isFunded;

  return (
    <div className="card send-card">
      <div className="card-header">
        <div className="card-title-group">
          <Send size={18} className="text-accent" />
          <h2 className="card-title">Send XLM</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card-body send-form">
        {/* Recipient Input */}
        <div className="form-group">
          <label htmlFor="recipient">Recipient Address</label>
          <div className="input-wrapper">
            <input
              id="recipient"
              type="text"
              className={`form-input ${recipientError ? "input-error" : ""} ${recipientValid ? "input-success" : ""}`}
              placeholder="e.g. GABCD...XYZ"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={!publicKey || isSending}
              autoComplete="off"
            />
            {recipientValid && <CheckCircle2 className="input-feedback-icon text-success" size={16} />}
            {recipientError && <AlertCircle className="input-feedback-icon text-danger" size={16} />}
          </div>
          {recipientError && <span className="error-text">{recipientError}</span>}
        </div>

        {/* Amount Input */}
        <div className="form-group">
          <div className="label-row">
            <label htmlFor="amount">Amount (XLM)</label>
            {publicKey && isFunded && (
              <button
                id="send-max-btn"
                type="button"
                className="max-btn"
                onClick={handleMaxClick}
                disabled={isSending}
                title="Fill maximum safe sendable amount"
              >
                Use Max Safe (Balance - 1.001 XLM)
              </button>
            )}
          </div>
          <div className="input-wrapper">
            <input
              id="amount"
              type="number"
              step="any"
              className={`form-input ${amountError && !amountValid ? "input-error" : ""} ${amountValid && !amountError ? "input-success" : ""} ${amountError && amountValid ? "input-warning" : ""}`}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!publicKey || isSending}
            />
            <span className="input-addon">XLM</span>
          </div>
          {amountError && (
            <span className={`error-text ${amountValid ? "warning-text" : ""}`}>
              {amountError}
            </span>
          )}
        </div>

        {/* Memo Input */}
        <div className="form-group">
          <div className="label-row">
            <label htmlFor="memo">Memo <span className="text-muted">(Optional)</span></label>
            <span className={`char-counter ${memo.length > 28 ? "text-danger" : "text-muted"}`}>
              {memo.length}/28
            </span>
          </div>
          <input
            id="memo"
            type="text"
            className={`form-input ${memoError ? "input-error" : ""}`}
            placeholder="Text memo (max 28 chars)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={!publicKey || isSending}
            maxLength={35}
          />
          {memoError && <span className="error-text">{memoError}</span>}
        </div>

        {/* Submit Button */}
        <button
          id="send-submit-btn"
          type="submit"
          className="btn btn-primary btn-block submit-btn"
          disabled={!isFormValid || isSending}
        >
          {isSending ? (
            <>
              <span className="loader spinner-small mr-2"></span>
              Processing Transaction...
            </>
          ) : (
            <>
              <Send size={16} className="mr-2" />
              Send XLM
            </>
          )}
        </button>
      </form>
    </div>
  );
}

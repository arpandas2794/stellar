import React, { useState } from "react";
import { Wallet, LogOut, Check, Copy, AlertTriangle } from "lucide-react";

/**
 * WalletConnector Component
 * Displays the header status, connection options, and truncated address.
 *
 * @param {Object} props
 * @param {string|null} props.publicKey - Connected account public key.
 * @param {boolean} props.isInstalled - Whether Freighter extension is detected.
 * @param {boolean} props.isLoading - Wallet connection loading state.
 * @param {Function} props.onConnect - Callback to trigger wallet connection.
 * @param {Function} props.onDisconnect - Callback to trigger wallet disconnection.
 */
export default function WalletConnector({
  publicKey,
  isInstalled,
  isLoading,
  onConnect,
  onDisconnect,
}) {
  const [copied, setCopied] = useState(false);

  // Helper to truncate public key (GABCD...XYZ)
  const truncateKey = (key) => {
    if (!key) return "";
    return `${key.slice(0, 6)}...${key.slice(-6)}`;
  };

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy public key:", err);
    }
  };

  return (
    <div className="connector-container">
      {/* Installation Warning Banner */}
      {!isInstalled && (
        <div className="install-banner">
          <div className="banner-content">
            <AlertTriangle className="banner-icon animate-pulse" size={18} />
            <span>
              Freighter wallet extension not detected. Please install it to interact with Stellar Pay.
            </span>
          </div>
          <a
            id="freighter-install-link"
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="install-link"
          >
            Get Freighter
          </a>
        </div>
      )}

      {/* Header Panel */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <Wallet className="logo-icon" size={24} />
          </div>
          <div className="brand-info">
            <h1 className="app-title">Stellar Pay</h1>
            <span className="network-badge">Testnet</span>
          </div>
        </div>

        <div className="header-actions">
          {publicKey ? (
            <div className="connected-badge-group">
              <div 
                id="wallet-address-badge"
                className="address-badge" 
                onClick={handleCopy} 
                title="Click to copy full public key"
              >
                <span className="dot-indicator pulse-green"></span>
                <span className="address-text font-mono">{truncateKey(publicKey)}</span>
                {copied ? (
                  <Check className="copy-icon text-success" size={14} />
                ) : (
                  <Copy className="copy-icon text-muted" size={14} />
                )}
              </div>

              <button
                id="wallet-disconnect-btn"
                className="btn btn-outline-danger logout-btn"
                onClick={onDisconnect}
                disabled={isLoading}
                title="Disconnect Wallet"
              >
                <LogOut size={16} />
                <span className="btn-text">Disconnect</span>
              </button>
            </div>
          ) : (
            <button
              id="wallet-connect-btn"
              className="btn btn-primary connect-btn"
              onClick={onConnect}
              disabled={!isInstalled || isLoading}
            >
              {isLoading ? (
                <span className="loader spinner-small"></span>
              ) : (
                <Wallet size={16} />
              )}
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>
    </div>
  );
}

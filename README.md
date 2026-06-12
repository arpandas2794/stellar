# Stellar Pay — XLM Payment dApp (Level 1)

A simple, clean payment dApp built on the **Stellar Testnet** that allows users to connect their Freighter wallet, view their XLM balance, and send XLM to any Stellar address — with full transaction feedback.

🔗 **Live Demo:** [https://stellar-neon-ten.vercel.app](https://stellar-neon-ten.vercel.app)  
📁 **GitHub:** [https://github.com/arpandas2794/stellar](https://github.com/arpandas2794/stellar)

---

## ✅ Level 1 Requirements Checklist

| Requirement | Status |
|---|---|
| Freighter wallet setup | ✅ |
| Stellar Testnet configured | ✅ |
| Wallet connect functionality | ✅ |
| Wallet disconnect functionality | ✅ |
| Fetch XLM balance | ✅ |
| Display balance in UI | ✅ |
| Send XLM on Testnet | ✅ |
| Success state with transaction hash | ✅ |
| Failure / error state | ✅ |
| Clean UI + modular code structure | ✅ |

---

## 📸 Screenshots

### 1. Disconnected State — Connect Wallet
![Disconnected State](src/level_1_ss/ss1.png)

### 2. Connected — Wallet Address + XLM Balance
![Connected Wallet](src/level_1_ss/ss2.png)

### 3. Send Form — Filled In
![Send Form](src/level_1_ss/ss3.png)

### 4. Freighter Signing Popup
![Freighter Sign](src/level_1_ss/ss4.png)

### 5. Transaction Success — Hash Displayed
![Transaction Success](src/level_1_ss/ss5.png)

### 6. Stellar Explorer — Transaction Confirmed
![Explorer Confirmation](src/level_1_ss/ss6.png)

---

## 🚀 Features

- **Wallet Connection** — Detects Freighter extension, connects/disconnects with one click, displays truncated public key
- **Balance Display** — Fetches live XLM balance from Horizon Testnet API and displays it prominently
- **Send XLM** — Full transaction flow: recipient address, amount, optional memo
- **Max Safe Amount** — Auto-calculates max sendable amount (balance minus 1.001 XLM reserve)
- **Transaction Feedback** — Success message with clickable transaction hash linking to Stellar Expert explorer
- **Error Handling** — Handles account not found, insufficient balance, invalid address, user rejection, and network errors

---

## 🛠 Tech Stack

| Tool | Purpose |
|---|---|
| React + Vite | Frontend framework |
| `@stellar/stellar-sdk` | Transaction building & Horizon API |
| `@stellar/freighter-api` | Wallet connect, sign transactions |
| Stellar Horizon Testnet | `https://horizon-testnet.stellar.org` |
| Vercel | Deployment |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── WalletConnector.jsx     # Connect / disconnect wallet logic
│   ├── BalanceDisplay.jsx      # Fetch and display XLM balance
│   ├── SendForm.jsx            # Send XLM form with validation
│   └── TransactionResult.jsx  # Success / failure feedback UI
├── lib/
│   ├── stellar.js              # Transaction building & submission
│   └── freighter.js            # Wallet integration helpers
├── App.jsx
└── main.jsx
```

---

## ⚙️ How It Works

### Wallet Connection
```js
import { getPublicKey } from "@stellar/freighter-api";
const publicKey = await getPublicKey();
```

### Balance Fetch
```js
import { Horizon } from "@stellar/stellar-sdk";
const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const account = await server.loadAccount(publicKey);
const balance = account.balances.find(b => b.asset_type === "native")?.balance;
```

### Send Transaction
```js
import { TransactionBuilder, Networks, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

const sourceAccount = await server.loadAccount(senderPublicKey);
const tx = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({
    destination: recipientAddress,
    asset: Asset.native(),
    amount: amountString,
  }))
  .setTimeout(30)
  .build();

const signedXDR = await signTransaction(tx.toXDR(), { network: "TESTNET" });
const signedTx = TransactionBuilder.fromXDR(signedXDR, Networks.TESTNET);
const result = await server.submitTransaction(signedTx);
// result.hash → shown to user with explorer link
```

---

## 🧪 Running Locally

```bash
git clone https://github.com/arpandas2794/stellar.git
cd stellar
npm install
npm run dev
```

Then open `http://localhost:5173` in the browser where Freighter is installed.

---

## 🌐 Testnet Setup Guide

1. Install [Freighter Wallet](https://freighter.app)
2. Switch network to **Testnet** inside Freighter settings
3. Copy your public key (`G...` address)
4. Fund it via Friendbot: `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY`
5. Open the app, click Connect Wallet, and start sending

---

## 🔍 Live Transaction Example

Transaction confirmed on Stellar Testnet:  
[`17f1b3a728d218b56f57bc53eb742ac570023fd0a00656d94afba088121e928b`](https://stellar.expert/explorer/testnet/tx/17f1b3a728d218b56f57bc53eb742ac570023fd0a00656d94afba088121e928b)

---

## 📄 License

MIT

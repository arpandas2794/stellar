import {
  rpc,
  Contract,
  TransactionBuilder,
  Account,
  Networks,
  Keypair,
  Address,
  xdr,
  scValToNative,
} from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';

export interface Note {
  id: string; // Compound React list key
  noteId: number; // The stable contract-assigned ID (u64)
  author: string;
  message: string;
  timestamp: number;
  likes: number;
  likers: string[];
}

const rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID || 'CBIS5O7OC2Y5ZVEB6VPTCZTOM2LR6C7BC4FIJ2E56VNVE7PZPA3N3HDA';

// Initialize Soroban RPC server client
const server = new rpc.Server(rpcUrl);

/**
 * Get the latest ledger sequence from the network.
 */
export async function getLatestLedgerSequence(): Promise<number> {
  const info = await server.getLatestLedger();
  return info.sequence;
}

/**
 * Fetch all notes from the contract by simulating get_notes call.
 */
export async function fetchNotes(): Promise<Note[]> {
  if (!contractId) {
    console.warn('Contract ID is not set.');
    return [];
  }

  const contract = new Contract(contractId);
  const dummySource = Keypair.random();
  const dummyAccount = new Account(dummySource.publicKey(), '0');

  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call('get_notes'))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationSuccess(simResult)) {
    if (!simResult.result || !simResult.result.retval) {
      return [];
    }
    const nativeVal = scValToNative(simResult.result.retval);
    if (!Array.isArray(nativeVal)) {
      return [];
    }

    return nativeVal.map((item: any) => ({
      id: `${item.author}-${item.id.toString()}`,
      noteId: Number(item.id),
      author: item.author.toString(),
      message: item.message.toString(),
      timestamp: Number(item.timestamp),
      likes: Number(item.likes || 0),
      likers: Array.isArray(item.likers) ? item.likers.map((addr: any) => addr.toString()) : [],
    }));
  } else {
    throw new Error(`Simulation failed: ${simResult.error || 'Unknown error'}`);
  }
}

/**
 * Submit a note to the Soroban contract.
 */
export async function submitNote(publicKey: string, message: string): Promise<string> {
  if (!contractId) {
    throw new Error('Contract ID is not set in environment variables.');
  }

  const account = await server.getAccount(publicKey);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'add_note',
        new Address(publicKey).toScVal(),
        xdr.ScVal.scvString(message)
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembledTxBuilder = rpc.assembleTransaction(tx, simResult);
  const finalTx = assembledTxBuilder.build();
  const unsignedXdr = finalTx.toXDR();

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(unsignedXdr);

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error(`Transaction rejected by network: ${sendResponse.hash}`);
  }

  return sendResponse.hash;
}

/**
 * Delete a note (author-only check enforced in contract).
 */
export async function deleteNote(publicKey: string, noteId: number): Promise<string> {
  if (!contractId) {
    throw new Error('Contract ID is not set.');
  }

  const account = await server.getAccount(publicKey);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'delete_note',
        new Address(publicKey).toScVal(),
        xdr.ScVal.scvU64(xdr.Uint64.fromString(noteId.toString()))
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembledTxBuilder = rpc.assembleTransaction(tx, simResult);
  const finalTx = assembledTxBuilder.build();
  const unsignedXdr = finalTx.toXDR();

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(unsignedXdr);

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error(`Transaction rejected by network: ${sendResponse.hash}`);
  }

  return sendResponse.hash;
}

/**
 * Like a note (duplicate prevention enforced in contract).
 */
export async function likeNote(publicKey: string, noteId: number): Promise<string> {
  if (!contractId) {
    throw new Error('Contract ID is not set.');
  }

  const account = await server.getAccount(publicKey);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'like_note',
        new Address(publicKey).toScVal(),
        xdr.ScVal.scvU64(xdr.Uint64.fromString(noteId.toString()))
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembledTxBuilder = rpc.assembleTransaction(tx, simResult);
  const finalTx = assembledTxBuilder.build();
  const unsignedXdr = finalTx.toXDR();

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(unsignedXdr);

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    throw new Error(`Transaction rejected by network: ${sendResponse.hash}`);
  }

  return sendResponse.hash;
}

/**
 * Fetch the number of notes authored by a public address.
 */
export async function fetchNoteCount(publicKey: string): Promise<number> {
  if (!contractId || !publicKey) return 0;

  const contract = new Contract(contractId);
  const dummySource = Keypair.random();
  const dummyAccount = new Account(dummySource.publicKey(), '0');

  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'get_note_count',
        new Address(publicKey).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationSuccess(simResult)) {
    if (!simResult.result || !simResult.result.retval) return 0;
    return Number(scValToNative(simResult.result.retval));
  }
  return 0;
}

/**
 * Check the status of a transaction by hash.
 */
export async function getTransactionStatus(
  hash: string
): Promise<{ status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND'; error?: string }> {
  const result = await server.getTransaction(hash);
  if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { status: 'SUCCESS' };
  } else if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    return { status: 'FAILED', error: 'Transaction execution failed.' };
  }
  return { status: 'NOT_FOUND' };
}

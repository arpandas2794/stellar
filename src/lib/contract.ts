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

import { config } from './config';

const rpcUrl = config.rpcUrl;
const contractId = config.notesContractId;
const reputationContractId = config.reputationContractId;

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

/**
 * Fetch the reputation score of a public address.
 */
export async function fetchReputation(publicKey: string): Promise<number> {
  if (!reputationContractId || !publicKey) return 0;

  const contract = new Contract(reputationContractId);
  const dummySource = Keypair.random();
  const dummyAccount = new Account(dummySource.publicKey(), '0');

  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'get_reputation',
        new Address(publicKey).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  try {
    const simResult = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(simResult)) {
      if (!simResult.result || !simResult.result.retval) return 0;
      return Number(scValToNative(simResult.result.retval));
    }
  } catch (err) {
    console.error('Error fetching reputation:', err);
  }
  return 0;
}

export interface ContractEvent {
  type: 'note_added' | 'note_liked' | 'note_deleted' | 'reputation_updated' | 'reputation_failed';
  ledger: number;
  data: any;
}

/**
 * Poll for events from both contracts starting from a cursor (startLedger).
 */
export async function pollEvents(
  startLedger: number
): Promise<{ events: ContractEvent[]; latestLedger: number }> {
  const latestLedger = await getLatestLedgerSequence();
  if (startLedger > latestLedger) {
    return { events: [], latestLedger };
  }

  const filters = [
    {
      type: 'contract' as const,
      contractId: contractId,
    },
  ];

  if (reputationContractId) {
    filters.push({
      type: 'contract' as const,
      contractId: reputationContractId,
    });
  }

  const response = await server.getEvents({
    startLedger,
    filters,
    limit: 100,
  });

  const parsedEvents: ContractEvent[] = [];

  for (const event of response.events) {
    try {
      const topic = event.topic[0] ? scValToNative(event.topic[0]) : '';
      const rawData = event.value ? scValToNative(event.value) : null;
      const ledgerSeq = event.ledger;

      if (topic === 'note_added') {
        parsedEvents.push({
          type: 'note_added',
          ledger: ledgerSeq,
          data: {
            noteId: Number(rawData[0]),
            author: rawData[1].toString(),
            message: rawData[2].toString(),
            timestamp: Number(rawData[3]),
          },
        });
      } else if (topic === 'note_liked') {
        parsedEvents.push({
          type: 'note_liked',
          ledger: ledgerSeq,
          data: {
            noteId: Number(rawData[0]),
            liker: rawData[1].toString(),
            likes: Number(rawData[2]),
          },
        });
      } else if (topic === 'note_deleted') {
        parsedEvents.push({
          type: 'note_deleted',
          ledger: ledgerSeq,
          data: {
            noteId: Number(rawData[0]),
            author: rawData[1].toString(),
          },
        });
      } else if (topic === 'reputation_updated') {
        parsedEvents.push({
          type: 'reputation_updated',
          ledger: ledgerSeq,
          data: {
            target: rawData[0].toString(),
            score: Number(rawData[1]),
          },
        });
      } else if (topic === 'reputation_failed') {
        parsedEvents.push({
          type: 'reputation_failed',
          ledger: ledgerSeq,
          data: {
            noteId: Number(rawData[0]),
            target: rawData[1].toString(),
          },
        });
      }
    } catch (err) {
      console.warn('Failed to parse event:', event, err);
    }
  }

  return { events: parsedEvents, latestLedger };
}

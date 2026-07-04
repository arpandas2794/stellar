'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/components/WalletProvider';
import {
  fetchNotes,
  submitNote,
  deleteNote,
  likeNote,
  fetchNoteCount,
  getTransactionStatus,
  fetchReputation,
  pollEvents,
  ContractEvent,
  Note,
  getLatestLedgerSequence,
} from '@/lib/contract';
import {
  Wallet,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  HelpCircle,
  AlertTriangle,
  FileText,
  Wifi,
  WifiOff,
  ExternalLink,
  Trash2,
  Heart,
  User,
  Award,
  Activity,
  Zap,
} from 'lucide-react';
import { classifyStellarError } from '@/lib/errors';

interface InFlightTx {
  hash: string;
  message: string;
  type: 'add' | 'delete' | 'like';
  status: 'pending' | 'success' | 'failed';
  error?: string;
  timestamp: number;
}

interface ActivityLogItem {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'event';
}

export default function Home() {
  const {
    publicKey,
    walletId,
    connect,
    disconnect,
    error: walletError,
    clearError: clearWalletError,
  } = useWallet();

  // Notes feed and counts state
  const [notes, setNotes] = useState<Note[]>([]);
  const [isFetchingNotes, setIsFetchingNotes] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [userNoteCount, setUserNoteCount] = useState<number>(0);
  const [userReputation, setUserReputation] = useState<number>(0);
  const [authorCounts, setAuthorCounts] = useState<Record<string, number>>({});
  const [authorReputations, setAuthorReputations] = useState<Record<string, number>>({});

  // Note posting form state
  const [noteMessage, setNoteMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // In-flight transactions state
  const [inFlightTxs, setInFlightTxs] = useState<InFlightTx[]>([]);

  // Connection & Streaming State
  const [connectionStatus, setConnectionStatus] = useState<'live' | 'reconnecting' | 'disconnected'>('disconnected');
  const [latestLedger, setLatestLedger] = useState<number>(0);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  
  // Polling / Backoff references
  const cursorRef = useRef<number | null>(null);
  const backoffDelayRef = useRef<number>(2000);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);

  // Helper to add activity logs
  const addLog = (message: string, type: ActivityLogItem['type'] = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time, message, type },
      ...prev.slice(0, 49), // Keep last 50 logs
    ]);
  };

  // 1. Initial Load and Setup Cursor
  useEffect(() => {
    const initStream = async () => {
      setIsFetchingNotes(true);
      addLog('Initializing cursor and fetching current state...', 'info');
      try {
        // Fetch current sequence to start cursor
        const seq = await getLatestLedgerSequence();
        cursorRef.current = seq + 1;
        setLatestLedger(seq);
        
        // Fetch initial notes
        await handleFetchNotes();
        setConnectionStatus('live');
        addLog(`Cursor set to ledger sequence: ${cursorRef.current}`, 'success');
        
        // Start streaming
        startEventStream();
      } catch (err) {
        console.error('Failed to initialize event stream:', err);
        setConnectionStatus('disconnected');
        addLog('Failed to initialize stream. Retrying...', 'error');
        // Retry init after 5s
        pollTimeoutRef.current = setTimeout(initStream, 5000);
      } finally {
        setIsFetchingNotes(false);
      }
    };

    initStream();

    // Return cleanup function to cleanly cancel/unsubscribe any scheduled event polling timeouts.
    // This prevents memory leaks and overlapping execution threads when the component unmounts.
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Fetch User Specific Info when Wallet Connects
  useEffect(() => {
    if (publicKey) {
      handleFetchUserStats(publicKey);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserNoteCount(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserReputation(0);
    }
  }, [publicKey]);

  // 3. Monitor in-flight tx statuses periodically
  useEffect(() => {
    if (inFlightTxs.some((tx) => tx.status === 'pending')) {
      const interval = setInterval(checkPendingTransactions, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightTxs]);

  async function handleFetchUserStats(address: string) {
    try {
      const count = await fetchNoteCount(address);
      setUserNoteCount(count);
      const rep = await fetchReputation(address);
      setUserReputation(rep);
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    }
  };

  async function handleFetchNotes() {
    try {
      const data = await fetchNotes();
      const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);
      setNotes(sorted);
      setLastSynced(new Date());

      // Fetch note counts & reputations for all unique authors in the feed
      const uniqueAuthors = Array.from(new Set(sorted.map((n) => n.author)));
      const counts: Record<string, number> = {};
      const reps: Record<string, number> = {};
      
      await Promise.all(
        uniqueAuthors.map(async (author) => {
          try {
            const count = await fetchNoteCount(author);
            counts[author] = count;
            const rep = await fetchReputation(author);
            reps[author] = rep;
          } catch (err) {
            console.error(`Failed to fetch stats for author ${author}:`, err);
            counts[author] = 0;
            reps[author] = 0;
          }
        })
      );
      setAuthorCounts(counts);
      setAuthorReputations(reps);

      if (publicKey) {
        setUserNoteCount(counts[publicKey] ?? 0);
        setUserReputation(reps[publicKey] ?? 0);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch notes:', err);
      addLog('Failed to sync notes feed from RPC.', 'warning');
    }
  };

  // 4. Cursor-Based Event Stream Poller with Exponential Backoff
  function startEventStream() {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }

    const poll = async () => {
      if (isPollingRef.current || cursorRef.current === null) return;
      isPollingRef.current = true;

      try {
        const startLedger = cursorRef.current;
        const result = await pollEvents(startLedger);
        
        setLatestLedger(result.latestLedger);
        cursorRef.current = result.latestLedger + 1;

        // Process any returned events
        if (result.events.length > 0) {
          processIncomingEvents(result.events);
        }

        // Reset backoff delay on success
        backoffDelayRef.current = 2000;
        setConnectionStatus('live');
      } catch (err) {
        console.error('Event poll failed:', err);
        setConnectionStatus('reconnecting');
        
        // Increase backoff delay exponentially up to 30 seconds
        const nextDelay = Math.min(backoffDelayRef.current * 2, 30000);
        backoffDelayRef.current = nextDelay;
        addLog(`RPC Poll failed. Reconnecting in ${nextDelay / 1000}s...`, 'warning');
      } finally {
        isPollingRef.current = false;
        // Schedule next poll
        pollTimeoutRef.current = setTimeout(poll, backoffDelayRef.current);
      }
    };

    pollTimeoutRef.current = setTimeout(poll, backoffDelayRef.current);
  };

  // 5. Map incoming events to UI state updates
  function processIncomingEvents(events: ContractEvent[]) {
    // Group notes state updates
    let notesUpdated = false;
    let newNotes = [...notes];

    events.forEach((event) => {
      const { type, ledger, data } = event;
      addLog(`Event: ${type} on Ledger #${ledger}`, 'event');

      switch (type) {
        case 'note_added':
          // Check if we already have this note to prevent duplicates
          if (!newNotes.some((n) => n.noteId === data.noteId)) {
            newNotes.unshift({
              id: `${data.author}-${data.noteId}`,
              noteId: data.noteId,
              author: data.author,
              message: data.message,
              timestamp: data.timestamp,
              likes: 0,
              likers: [],
            });
            notesUpdated = true;
          }
          // Increment author note counts
          setAuthorCounts((prev) => ({
            ...prev,
            [data.author]: (prev[data.author] ?? 0) + 1,
          }));
          if (publicKey && data.author === publicKey) {
            setUserNoteCount((prev) => prev + 1);
          }
          addLog(`Note #${data.noteId} added by ${formatAddress(data.author)}`, 'success');
          break;

        case 'note_liked':
          newNotes = newNotes.map((note) => {
            if (note.noteId === data.noteId) {
              notesUpdated = true;
              return {
                ...note,
                likes: data.likes,
                likers: note.likers.includes(data.liker) ? note.likers : [...note.likers, data.liker],
              };
            }
            return note;
          });
          addLog(`Note #${data.noteId} liked by ${formatAddress(data.liker)}`, 'success');
          break;

        case 'note_deleted':
          if (newNotes.some((n) => n.noteId === data.noteId)) {
            newNotes = newNotes.filter((n) => n.noteId !== data.noteId);
            notesUpdated = true;
          }
          // Decrement author note counts
          setAuthorCounts((prev) => ({
            ...prev,
            [data.author]: Math.max(0, (prev[data.author] ?? 1) - 1),
          }));
          if (publicKey && data.author === publicKey) {
            setUserNoteCount((prev) => Math.max(0, prev - 1));
          }
          addLog(`Note #${data.noteId} deleted by author ${formatAddress(data.author)}`, 'warning');
          break;

        case 'reputation_updated':
          setAuthorReputations((prev) => ({
            ...prev,
            [data.target]: data.score,
          }));
          if (publicKey && data.target === publicKey) {
            setUserReputation(data.score);
          }
          addLog(`Reputation of ${formatAddress(data.target)} updated to ${data.score}`, 'success');
          break;

        case 'reputation_failed':
          addLog(`Reputation update failed for Note #${data.noteId} (graceful contract catch)`, 'error');
          break;
      }
    });

    if (notesUpdated) {
      // Keep notes sorted by timestamp descending
      setNotes(newNotes.sort((a, b) => b.timestamp - a.timestamp));
      setLastSynced(new Date());
    }
  };

  // 6. Check In-Flight Pending Transactions
  async function checkPendingTransactions() {
    const updatedTxs = await Promise.all(
      inFlightTxs.map(async (tx) => {
        if (tx.status !== 'pending') return tx;

        try {
          const check = await getTransactionStatus(tx.hash);
          if (check.status === 'SUCCESS') {
            addLog(`Transaction ${tx.hash.substring(0, 8)} succeeded`, 'success');
            // Do a manual state sync to be sure
            handleFetchNotes();
            if (publicKey) handleFetchUserStats(publicKey);
            return { ...tx, status: 'success' as const };
          } else if (check.status === 'FAILED') {
            addLog(`Transaction ${tx.hash.substring(0, 8)} execution failed`, 'error');
            return {
              ...tx,
              status: 'failed' as const,
              error: check.error || 'Execution failed',
            };
          }
        } catch (err) {
          console.error(`Error checking transaction status for ${tx.hash}:`, err);
        }
        return tx;
      })
    );
    setInFlightTxs(updatedTxs);
  };

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;

    const trimmedMsg = noteMessage.trim();
    if (trimmedMsg.length === 0) {
      setFormError('Message cannot be empty.');
      return;
    }
    if (trimmedMsg.length > 140) {
      setFormError('Message cannot exceed 140 characters.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    clearWalletError();

    try {
      const hash = await submitNote(publicKey, trimmedMsg);
      addLog(`Submitting post note transaction...`, 'info');
      
      setInFlightTxs((prev) => [
        {
          hash,
          message: `Post note: "${trimmedMsg.substring(0, 15)}..."`,
          type: 'add',
          status: 'pending',
          timestamp: Date.now(),
        },
        ...prev,
      ]);

      setNoteMessage('');
    } catch (err: unknown) {
      console.error('Submit note failed:', err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
      addLog(`Note submission failed: ${classified.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!publicKey) return;
    setFormError(null);
    clearWalletError();

    try {
      const hash = await deleteNote(publicKey, noteId);
      addLog(`Submitting delete note transaction...`, 'info');
      setInFlightTxs((prev) => [
        {
          hash,
          message: `Delete note #${noteId}`,
          type: 'delete',
          status: 'pending',
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } catch (err: unknown) {
      console.error(`Delete note #${noteId} failed:`, err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
      addLog(`Note delete failed: ${classified.message}`, 'error');
    }
  };

  const handleLikeNote = async (noteId: number) => {
    if (!publicKey) return;
    setFormError(null);
    clearWalletError();

    try {
      const hash = await likeNote(publicKey, noteId);
      addLog(`Submitting like note transaction...`, 'info');
      setInFlightTxs((prev) => [
        {
          hash,
          message: `Like note #${noteId}`,
          type: 'like',
          status: 'pending',
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } catch (err: unknown) {
      console.error(`Like note #${noteId} failed:`, err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
      addLog(`Note like failed: ${classified.message}`, 'error');
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Navigation */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-5 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl flex items-center gap-2">
              OnChain Notes
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/25">
                <Wifi className="h-3 w-3 animate-pulse" /> Testnet
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">Soroban Multi-Contract Workspace with Reputation Ranking</p>
          </div>
        </div>

        {/* Sync & Connection Status pills */}
        <div className="flex items-center gap-3 flex-wrap">
          {connectionStatus === 'live' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Sync (Ledger #{latestLedger})
            </span>
          ) : connectionStatus === 'reconnecting' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/25">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              Reconnecting...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/25">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </span>
          )}

          {publicKey ? (
            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-300">
                  Connected via <span className="capitalize font-semibold text-indigo-400">{walletId}</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">{formatAddress(publicKey)}</span>
              </div>
              <button
                onClick={disconnect}
                className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 border border-white/5 cursor-pointer min-h-[44px]"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/35 border border-indigo-400/20 cursor-pointer min-h-[44px]"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 mb-12">
        {/* Left Column: Form & Personal Stats */}
        <div className="md:col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Note Posting Card */}
          <div className="glass-panel rounded-2xl p-6 glow-blue relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-blue-500/5 rounded-full blur-2xl" />
            <h2 className="text-lg font-semibold text-white mb-4">Create a Note</h2>

            {/* Error Banners */}
            {(walletError || formError) && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-start gap-2.5 animate-soft-pulse">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-300">Transaction Failed</p>
                  <p className="mt-0.5 leading-relaxed">{formError || walletError}</p>
                  {(walletError || formError)?.includes('Friendbot') && (
                    <a
                      href={`https://friendbot.stellar.org/?addr=${publicKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:underline min-h-[44px]"
                    >
                      Fund with Friendbot <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => {
                    setFormError(null);
                    clearWalletError();
                  }}
                  className="text-red-400 hover:text-red-300 font-semibold text-xs shrink-0 self-start cursor-pointer min-h-[44px]"
                >
                  Dismiss
                </button>
              </div>
            )}

            <form onSubmit={handlePostNote} className="space-y-4">
              <div>
                <textarea
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  placeholder={
                    publicKey
                      ? "Write a message to be recorded permanently on-chain..."
                      : "Please connect your Stellar wallet to post notes."
                  }
                  disabled={!publicKey || isSubmitting}
                  maxLength={140}
                  rows={4}
                  className="w-full bg-[#070b13] border border-white/5 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 resize-none transition-all duration-200"
                />
                <div className="flex justify-between items-center mt-2 px-1">
                  <span className="text-xs text-slate-400">
                    {!publicKey && "Wallet disconnected"}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {noteMessage.length} / 140
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!publicKey || isSubmitting || noteMessage.trim().length === 0}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 disabled:from-slate-800 disabled:to-slate-800 disabled:hover:from-slate-800 disabled:hover:to-slate-800 text-white disabled:text-slate-500 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 disabled:shadow-none border border-indigo-400/10 disabled:border-transparent cursor-pointer disabled:cursor-not-allowed min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Signing Transaction...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Post Note to Chain
                  </>
                )}
              </button>
            </form>
          </div>

          {/* User Stats Card */}
          {publicKey && (
            <div className="glass-panel rounded-2xl p-6 glow-indigo relative overflow-hidden">
              <h2 className="text-lg font-semibold text-white mb-4">My Account Profile</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-[#070b13] border border-white/5 rounded-xl flex flex-col items-center justify-center text-center">
                  <FileText className="h-5 w-5 text-indigo-400 mb-1" />
                  <span className="text-2xl font-bold text-white">{userNoteCount}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Notes Posted</span>
                </div>
                <div className="p-3 bg-[#070b13] border border-white/5 rounded-xl flex flex-col items-center justify-center text-center">
                  <Award className="h-5 w-5 text-amber-400 mb-1" />
                  <span className="text-2xl font-bold text-white">{userReputation}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Reputation Score</span>
                </div>
              </div>
            </div>
          )}

          {/* Live Transactions Card */}
          <div className="glass-panel rounded-2xl p-6 glow-indigo flex-1 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
              Live Transactions
              {inFlightTxs.some((tx) => tx.status === 'pending') && (
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              )}
            </h2>

            {inFlightTxs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-xl">
                <Clock className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-400">No active transactions</p>
                <p className="text-xs text-slate-500 mt-1">Transactions submitted by you will be tracked here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[220px] space-y-3 pr-1">
                {inFlightTxs.map((tx) => (
                  <div
                    key={tx.hash}
                    className="p-3 bg-[#070b13] border border-white/5 rounded-xl flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 font-medium truncate">{tx.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-slate-500 font-mono">{tx.hash.substring(0, 8)}...</span>
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 font-semibold min-h-[44px]"
                        >
                          Explorer <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div>
                      {tx.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 animate-pulse">
                          <Clock className="h-3.5 w-3.5" /> Pending
                        </span>
                      ) : tx.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-red-500/10 text-red-400 border border-red-500/25" title={tx.error}>
                          <XCircle className="h-3.5 w-3.5" /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle Column: Notes Feed */}
        <div className="md:col-span-7 lg:col-span-5 flex flex-col">
          <div className="glass-panel rounded-2xl p-6 glow-blue flex-1 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  OnChain Notes Feed
                </h2>
                {lastSynced && (
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    Last synced: <span className="font-semibold text-slate-300">{lastSynced.toLocaleTimeString()}</span>
                  </p>
                )}
              </div>

              <button
                onClick={handleFetchNotes}
                disabled={isFetchingNotes}
                className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 border border-white/5 cursor-pointer min-h-[44px]"
              >
                <RefreshCw className={`h-3 w-3 ${isFetchingNotes ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>

            {isFetchingNotes && notes.length === 0 ? (
              <div className="flex-1 space-y-4 pr-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 bg-[#070b13] border border-white/5 rounded-xl flex flex-col gap-3 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full bg-slate-800" />
                        <div className="h-3 w-24 rounded bg-slate-800" />
                        <div className="h-3.5 w-12 rounded-full bg-slate-800" />
                        <div className="h-3.5 w-12 rounded-full bg-slate-800" />
                      </div>
                      <div className="h-3 w-16 rounded bg-slate-800" />
                    </div>
                    <div className="h-4 w-5/6 rounded bg-slate-800 mt-1" />
                    <div className="h-4 w-2/3 rounded bg-slate-800" />
                    <div className="flex items-center justify-between border-t border-white/5 pt-2.5 mt-2">
                      <div className="h-7 w-12 rounded-lg bg-slate-800" />
                      <div className="h-7 w-16 rounded-lg bg-slate-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <FileText className="h-12 w-12 text-slate-600 mb-3" />
                <p className="text-base font-semibold text-slate-300">No notes found on-chain</p>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">Be the first to leave a permanent message on the Stellar Soroban testnet!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[550px] space-y-4 pr-1">
                {notes.map((note) => {
                  const alreadyLiked = publicKey ? note.likers.includes(publicKey) : false;
                  const isAuthor = publicKey ? note.author === publicKey : false;
                  const authorNoteCount = authorCounts[note.author] ?? 0;
                  const reputation = authorReputations[note.author] ?? 0;

                  return (
                    <div
                      key={note.id}
                      className="p-4 bg-[#070b13] border border-white/5 rounded-xl flex flex-col gap-2 transition-all duration-300 hover:border-white/10 relative"
                    >
                      {/* Top bar: Author + Note badge & time */}
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="h-4 w-4 rounded bg-indigo-500/10 flex items-center justify-center text-[10px] text-indigo-400 font-bold">
                            U
                          </div>
                          <span
                            className="font-mono text-slate-300 hover:text-indigo-400 transition-colors duration-200 cursor-pointer font-medium"
                            title={note.author}
                          >
                            {formatAddress(note.author)}
                          </span>
                          
                          {/* Note Count Badge */}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[9px] font-semibold border border-white/5">
                            {authorNoteCount} {authorNoteCount === 1 ? 'note' : 'notes'}
                          </span>

                          {/* Reputation Badge */}
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-semibold border border-amber-500/20">
                            <Award className="h-2.5 w-2.5 shrink-0" />
                            Rep: {reputation}
                          </span>

                          {isAuthor && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold text-[9px] border border-indigo-500/25">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 shrink-0">
                          <span>{formatDate(note.timestamp)}</span>
                          <span>•</span>
                          <span>{formatTime(note.timestamp)}</span>
                        </div>
                      </div>

                      {/* Message body */}
                      <p className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap py-1">
                        {note.message}
                      </p>

                      {/* Action buttons (Like & Delete) */}
                      <div className="flex items-center justify-between border-t border-white/5 pt-2.5 mt-1">
                        <button
                          onClick={() => handleLikeNote(note.noteId)}
                          disabled={!publicKey || alreadyLiked}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border cursor-pointer min-h-[44px] min-w-[44px] ${
                            alreadyLiked
                              ? 'bg-pink-500/10 text-pink-400 border-pink-500/20 disabled:cursor-not-allowed opacity-80'
                              : publicKey
                              ? 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-pink-400 border-white/5 hover:border-pink-500/25'
                              : 'bg-slate-800/20 text-slate-500 border-transparent disabled:cursor-not-allowed'
                          }`}
                          title={alreadyLiked ? 'You already liked this note' : 'Like this note'}
                        >
                          <Heart className={`h-3.5 w-3.5 ${alreadyLiked ? 'fill-pink-500/80 text-pink-400' : ''}`} />
                          <span>{note.likes}</span>
                        </button>

                        {isAuthor && (
                          <button
                            onClick={() => handleDeleteNote(note.noteId)}
                            className="inline-flex items-center justify-center gap-1 text-xs font-semibold bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 text-slate-400 hover:border-red-500/25 border border-white/5 px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer min-h-[44px]"
                            title="Delete this note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Activity Stream / Console */}
        <div className="md:col-span-5 lg:col-span-3 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-6 glow-indigo flex-1 flex flex-col min-h-[300px]">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-400" />
              Event Console
            </h2>

            <div className="flex-1 bg-[#04060b] border border-white/5 rounded-xl p-4 font-mono text-[10px] leading-relaxed text-slate-400 overflow-y-auto max-h-[450px] space-y-2.5 scrollbar-thin">
              {activityLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <Zap className="h-6 w-6 text-slate-700 animate-pulse mb-1.5" />
                  <p className="text-[10px] text-slate-500">Listening to ledger events from notes & reputation contracts...</p>
                </div>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5 border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                    <span className="text-slate-600 shrink-0 font-medium">[{log.time}]</span>
                    <span className={`flex-1 break-all ${
                      log.type === 'success' ? 'text-emerald-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'event' ? 'text-blue-400 font-semibold' : 'text-slate-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* How it works Section */}
      <section className="glass-panel rounded-2xl p-6 mb-12 glow-indigo relative overflow-hidden">
        <div className="absolute top-0 left-0 h-32 w-32 bg-indigo-500/5 rounded-full blur-2xl" />
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-indigo-400" />
          Technical Details: Stellar Level 3 Upgrade
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Inter-Contract Reputation</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Liking a note triggers a cross-contract invocation to `reputation.increment_reputation`. It uses Soroban&apos;s native contract authorization verification (`require_auth` on the caller contract ID) to restrict updates to the notes contract alone.
            </p>
          </div>

          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Cursor-Based Event Sync</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Queries `getEvents` starting from the last-processed ledger sequence. Live contract events (`note_added`, `note_liked`, `note_deleted`, and `reputation_updated`) are streamed to update the feed instantly and reduce RPC queries.
            </p>
          </div>

          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Graceful Failure & Backoff</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              The contract uses non-atomic error handling: if the reputation update fails, it emits a failure event but saves the like. The frontend polling client implements exponential backoff to handle RPC drops gracefully.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 pt-5 text-center text-xs text-slate-500">
        <p>
          Stellar Level 3 — OnChain Notes & Reputation &copy; 2026. Built with Next.js, TypeScript, Tailwind CSS, and Soroban.
        </p>
      </footer>
    </div>
  );
}

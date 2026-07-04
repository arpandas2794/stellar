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
  Note,
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
  ExternalLink,
  Trash2,
  Heart,
  User,
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
  const [authorCounts, setAuthorCounts] = useState<Record<string, number>>({});

  // Note posting form state
  const [noteMessage, setNoteMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // In-flight transactions state
  const [inFlightTxs, setInFlightTxs] = useState<InFlightTx[]>([]);

  // Ref to track if we're currently polling to avoid overlapping requests
  const isPollingRef = useRef<boolean>(false);

  // 1. Fetch initial notes & counts on mount
  useEffect(() => {
    handleFetchNotes();
  }, []);

  // 2. Refresh user counts when publicKey changes
  useEffect(() => {
    if (publicKey) {
      handleFetchUserCount(publicKey);
    } else {
      setUserNoteCount(0);
    }
  }, [publicKey]);

  // 3. Poll for new notes & in-flight tx statuses every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      pollUpdates();
    }, 5000);

    return () => clearInterval(interval);
  }, [inFlightTxs, publicKey]);

  const handleFetchUserCount = async (address: string) => {
    try {
      const count = await fetchNoteCount(address);
      setUserNoteCount(count);
    } catch (err) {
      console.error('Failed to fetch user note count:', err);
    }
  };

  const handleFetchNotes = async () => {
    setIsFetchingNotes(true);
    try {
      const data = await fetchNotes();
      const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);
      setNotes(sorted);
      setLastSynced(new Date());

      // Fetch note counts for all unique authors in the feed
      const uniqueAuthors = Array.from(new Set(sorted.map((n) => n.author)));
      const counts: Record<string, number> = {};
      await Promise.all(
        uniqueAuthors.map(async (author) => {
          try {
            const count = await fetchNoteCount(author);
            counts[author] = count;
          } catch (err) {
            console.error(`Failed to fetch count for author ${author}:`, err);
            counts[author] = 0;
          }
        })
      );
      setAuthorCounts(counts);

      // If user is connected, refresh user's count too
      if (publicKey) {
        const count = counts[publicKey] !== undefined ? counts[publicKey] : await fetchNoteCount(publicKey);
        setUserNoteCount(count);
      }
    } catch (err: any) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setIsFetchingNotes(false);
    }
  };

  const pollUpdates = async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      // A. Fetch notes feed
      const data = await fetchNotes();
      const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);
      setNotes(sorted);
      setLastSynced(new Date());

      // B. Fetch note counts for authors
      const uniqueAuthors = Array.from(new Set(sorted.map((n) => n.author)));
      const counts: Record<string, number> = {};
      await Promise.all(
        uniqueAuthors.map(async (author) => {
          try {
            const count = await fetchNoteCount(author);
            counts[author] = count;
          } catch (err) {
            console.error(`Failed to fetch count for author ${author}:`, err);
            counts[author] = 0;
          }
        })
      );
      setAuthorCounts(counts);

      if (publicKey) {
        setUserNoteCount(counts[publicKey] || 0);
      }

      // C. Update in-flight transaction statuses
      if (inFlightTxs.some((tx) => tx.status === 'pending')) {
        const updatedTxs = await Promise.all(
          inFlightTxs.map(async (tx) => {
            if (tx.status !== 'pending') return tx;

            try {
              const check = await getTransactionStatus(tx.hash);
              if (check.status === 'SUCCESS') {
                return { ...tx, status: 'success' as const };
              } else if (check.status === 'FAILED') {
                return {
                  ...tx,
                  status: 'failed' as const,
                  error: check.error || 'Execution failed',
                };
              }
            } catch (err) {
              console.error(`Error polling status for tx ${tx.hash}:`, err);
            }
            return tx;
          })
        );
        setInFlightTxs(updatedTxs);
      }
    } catch (err) {
      console.error('Polling updates failed:', err);
    } finally {
      isPollingRef.current = false;
    }
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
    } catch (err: any) {
      console.error('Submit note failed:', err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
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
    } catch (err: any) {
      console.error(`Delete note #${noteId} failed:`, err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
    }
  };

  const handleLikeNote = async (noteId: number) => {
    if (!publicKey) return;
    setFormError(null);
    clearWalletError();

    try {
      const hash = await likeNote(publicKey, noteId);
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
    } catch (err: any) {
      console.error(`Like note #${noteId} failed:`, err);
      const classified = classifyStellarError(err);
      setFormError(classified.message);
    }
  };

  const formatAddress = (addr: string) => {
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
      <header className="flex items-center justify-between border-b border-white/5 pb-5 mb-8">
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
            <p className="text-xs text-slate-400 hidden sm:block font-medium">Soroban Smart Contract with Ownership & Likes</p>
          </div>
        </div>

        <div>
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
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 border border-white/5 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/35 border border-indigo-400/20 cursor-pointer"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        {/* Left Column: Form & In-flight status */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* Note Posting Card */}
          <div className="glass-panel rounded-2xl p-6 glow-blue relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-blue-500/5 rounded-full blur-2xl" />
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold text-white">Create a Note</h2>
              {publicKey && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                  <User className="h-3.5 w-3.5" /> {userNoteCount} {userNoteCount === 1 ? 'note' : 'notes'} posted
                </span>
              )}
            </div>

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
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:underline"
                    >
                      Fund with Friendbot <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {walletError?.includes('install') && (
                    <a
                      href="https://chromewebstore.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:underline"
                    >
                      Chrome Web Store <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => {
                    setFormError(null);
                    clearWalletError();
                  }}
                  className="text-red-400 hover:text-red-300 font-semibold text-xs shrink-0 self-start cursor-pointer"
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
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 disabled:from-slate-800 disabled:to-slate-800 disabled:hover:from-slate-800 disabled:hover:to-slate-800 text-white disabled:text-slate-500 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 disabled:shadow-none border border-indigo-400/10 disabled:border-transparent cursor-pointer disabled:cursor-not-allowed"
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

          {/* Live Transactions Card */}
          <div className="glass-panel rounded-2xl p-6 glow-indigo flex-1 min-h-[250px] flex flex-col">
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
                <p className="text-xs text-slate-500 mt-1">Submitted notes, likes, or deletes will be tracked here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-1">
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
                          className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 font-semibold"
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

        {/* Right Column: Notes Feed */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="glass-panel rounded-2xl p-6 glow-blue flex-1 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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
                className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 border border-white/5 cursor-pointer font-medium"
              >
                <RefreshCw className={`h-3 w-3 ${isFetchingNotes ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>

            {notes.length === 0 && !isFetchingNotes ? (
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
                  const authorNoteCount = authorCounts[note.author] || 0;

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
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 text-[9px] font-semibold border border-white/5">
                            {authorNoteCount} {authorNoteCount === 1 ? 'note' : 'notes'}
                          </span>

                          {isAuthor && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-semibold text-[9px] border border-indigo-500/25">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
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
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border cursor-pointer ${
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
                            className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 text-slate-400 hover:border-red-500/25 border border-white/5 px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer"
                            title="Delete this note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Delete</span>
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
      </main>

      {/* How it works Section */}
      <section className="glass-panel rounded-2xl p-6 mb-12 glow-indigo relative overflow-hidden">
        <div className="absolute top-0 left-0 h-32 w-32 bg-indigo-500/5 rounded-full blur-2xl" />
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-indigo-400" />
          Upgraded Walkthrough: Contract Ownership & Likes
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Ownership-Enforced Deletes</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Contract enforces `delete_note` authorization checks: it checks the original author address stored in the Note struct against the caller address. Unauthorized delete transactions fail directly on-chain.
            </p>
          </div>

          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Duplicate Like Protection</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              Liking a note calls the `like_note` contract operation. The contract checks if the liker address is in the note's `likers` array and rejects duplicate votes, returning a classified `AlreadyLiked` error.
            </p>
          </div>

          <div className="p-4 bg-[#070b13] border border-white/5 rounded-xl">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h4 className="text-sm font-semibold text-white mb-1.5">Per-Wallet Note Counters</h4>
            <p className="text-xs leading-relaxed text-slate-400">
              The read-only contract endpoint `get_note_count` counts notes authored by a given address. The UI uses this to display real-time note counts for every author in the feed and for the connected user.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 pt-5 text-center text-xs text-slate-500">
        <p>
          Stellar Level 2 — OnChain Notes &copy; 2026. Built with Next.js 15, TypeScript, Tailwind CSS, and Soroban.
        </p>
      </footer>
    </div>
  );
}

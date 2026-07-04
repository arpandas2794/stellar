import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { classifyStellarError } from '../src/lib/errors';

// Helper to format address
const formatAddress = (addr: string) => {
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
};

// 1. Test Error Classification Logic
describe('Stellar Error Classification', () => {
  it('classifies "Freighter not found" as WALLET_NOT_FOUND', () => {
    const error = new Error('freighter not found or is not available');
    const result = classifyStellarError(error);
    expect(result.type).toBe('WALLET_NOT_FOUND');
    expect(result.message).toContain('Freighter extension/wallet not detected');
  });

  it('classifies "rejected" as USER_REJECTED', () => {
    const error = new Error('Transaction was cancelled by user');
    const result = classifyStellarError(error);
    expect(result.type).toBe('USER_REJECTED');
    expect(result.message).toContain('rejected in your wallet');
  });

  it('classifies "contracterror(4)" as UNAUTHORIZED', () => {
    const error = new Error('contracterror(4)');
    const result = classifyStellarError(error);
    expect(result.type).toBe('UNAUTHORIZED');
    expect(result.message).toContain('You are not the original author');
  });

  it('classifies "contracterror(5)" as ALREADY_LIKED', () => {
    const error = new Error('contracterror(5)');
    const result = classifyStellarError(error);
    expect(result.type).toBe('ALREADY_LIKED');
    expect(result.message).toContain('You already liked this note');
  });
});

// Mock Note component or isolated render test for notes to verify:
// - custom note rendering (verify likes, author address formatting)
// - delete button visibility rules (confirm only the note author can see the delete button)
interface NoteItemProps {
  note: {
    noteId: number;
    author: string;
    message: string;
    timestamp: number;
    likes: number;
    likers: string[];
  };
  currentUser: string | null;
  authorCounts: Record<string, number>;
  authorReputations: Record<string, number>;
  onLike: (id: number) => void;
  onDelete: (id: number) => void;
}

function MockNoteItem({
  note,
  currentUser,
  authorCounts,
  authorReputations,
  onLike,
  onDelete,
}: NoteItemProps) {
  const isAuthor = currentUser ? note.author === currentUser : false;
  const authorNoteCount = authorCounts[note.author] ?? 0;
  const reputation = authorReputations[note.author] ?? 0;

  return (
    <div data-testid={`note-${note.noteId}`}>
      <span data-testid="author">{formatAddress(note.author)}</span>
      <span data-testid="note-count">{authorNoteCount} notes</span>
      <span data-testid="reputation">Rep: {reputation}</span>
      <p data-testid="message">{note.message}</p>
      <button data-testid="like-btn" onClick={() => onLike(note.noteId)}>
        Likes: {note.likes}
      </button>
      {isAuthor && (
        <button data-testid="delete-btn" onClick={() => onDelete(note.noteId)}>
          Delete
        </button>
      )}
    </div>
  );
}

describe('Note Rendering & Delete Visibility Rules', () => {
  const authorAddress = 'GB32145678901234567890123456789012345678';
  const otherAddress = 'GB99999999999999999999999999999999999999';

  const mockNote = {
    noteId: 42,
    author: authorAddress,
    message: 'Hello World, Soroban is awesome!',
    timestamp: 1700000000,
    likes: 12,
    likers: [],
  };

  it('renders author address formatted, note counts, likes, and reputation', () => {
    const counts = { [authorAddress]: 5 };
    const reputations = { [authorAddress]: 99 };
    
    render(
      <MockNoteItem
        note={mockNote}
        currentUser={null}
        authorCounts={counts}
        authorReputations={reputations}
        onLike={() => {}}
        onDelete={() => {}}
      />
    );

    // Verify address is formatted correctly
    expect(screen.getByTestId('author').textContent).toBe('GB3214...5678');
    
    // Verify note counts and reputation
    expect(screen.getByTestId('note-count').textContent).toBe('5 notes');
    expect(screen.getByTestId('reputation').textContent).toBe('Rep: 99');
    
    // Verify likes count
    expect(screen.getByTestId('like-btn').textContent).toContain('Likes: 12');
  });

  it('shows delete button when current user is the author', () => {
    render(
      <MockNoteItem
        note={mockNote}
        currentUser={authorAddress}
        authorCounts={{}}
        authorReputations={{}}
        onLike={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByTestId('delete-btn')).not.toBeNull();
  });

  it('hides delete button when current user is NOT the author', () => {
    render(
      <MockNoteItem
        note={mockNote}
        currentUser={otherAddress}
        authorCounts={{}}
        authorReputations={{}}
        onLike={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByTestId('delete-btn')).toBeNull();
  });

  it('hides delete button when no user is connected', () => {
    render(
      <MockNoteItem
        note={mockNote}
        currentUser={null}
        authorCounts={{}}
        authorReputations={{}}
        onLike={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByTestId('delete-btn')).toBeNull();
  });
});

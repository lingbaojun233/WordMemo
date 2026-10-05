import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { Word, Wordbook, ReviewResult } from '../lib/types';
import { applyReview } from '../lib/srs';
import { loadWordbooks, saveWordbooks } from '../lib/storage';
import { uid } from '../lib/utils';
import { ParsedEntry } from '../lib/parse';

type State = {
  wordbooks: Wordbook[];
  loaded: boolean;
};

type Action =
  | { type: 'LOADED'; wordbooks: Wordbook[] }
  | { type: 'CREATE_BOOK'; id: string; name: string; description?: string }
  | { type: 'RENAME_BOOK'; id: string; name: string }
  | { type: 'DELETE_BOOK'; id: string }
  | { type: 'ADD_WORD'; bookId: string; word: Word }
  | { type: 'UPDATE_WORD'; bookId: string; wordId: string; patch: Partial<Word> }
  | { type: 'DELETE_WORD'; bookId: string; wordId: string }
  | { type: 'IMPORT_WORDS'; bookId: string; words: Word[] }
  | { type: 'REVIEW_WORD'; bookId: string; wordId: string; result: ReviewResult }
  | { type: 'RESET_BOOK_PROGRESS'; bookId: string };

function buildWord(partial: {
  term: string;
  meaning: string;
  phonetic?: string;
  example?: string;
  createdAt?: number;
}): Word {
  return {
    id: uid(),
    term: partial.term.trim(),
    meaning: partial.meaning.trim(),
    phonetic: partial.phonetic?.trim(),
    example: partial.example?.trim(),
    box: 0,
    dueAt: 0,
    correctCount: 0,
    wrongCount: 0,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADED':
      return { wordbooks: action.wordbooks, loaded: true };

    case 'CREATE_BOOK': {
      const book: Wordbook = {
        id: action.id,
        name: action.name.trim(),
        description: action.description?.trim(),
        createdAt: Date.now(),
        words: [],
      };
      return { ...state, wordbooks: [book, ...state.wordbooks] };
    }

    case 'RENAME_BOOK':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.id ? { ...b, name: action.name.trim() } : b
        ),
      };

    case 'DELETE_BOOK':
      return {
        ...state,
        wordbooks: state.wordbooks.filter((b) => b.id !== action.id),
      };

    case 'ADD_WORD':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? { ...b, words: [action.word, ...b.words] }
            : b
        ),
      };

    case 'UPDATE_WORD':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? {
                ...b,
                words: b.words.map((w) =>
                  w.id === action.wordId ? { ...w, ...action.patch } : w
                ),
              }
            : b
        ),
      };

    case 'DELETE_WORD':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? { ...b, words: b.words.filter((w) => w.id !== action.wordId) }
            : b
        ),
      };

    case 'IMPORT_WORDS':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? { ...b, words: [...action.words, ...b.words] }
            : b
        ),
      };

    case 'REVIEW_WORD': {
      const now = Date.now();
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? {
                ...b,
                words: b.words.map((w) =>
                  w.id === action.wordId ? applyReview(w, action.result, now) : w
                ),
              }
            : b
        ),
      };
    }

    case 'RESET_BOOK_PROGRESS':
      return {
        ...state,
        wordbooks: state.wordbooks.map((b) =>
          b.id === action.bookId
            ? {
                ...b,
                words: b.words.map((w) => ({
                  ...w,
                  box: 0,
                  dueAt: 0,
                  correctCount: 0,
                  wrongCount: 0,
                  lastReviewedAt: undefined,
                })),
              }
            : b
        ),
      };

    default:
      return state;
  }
}

type ImportResult = { added: number; skipped: number };

type AppContextValue = {
  wordbooks: Wordbook[];
  loaded: boolean;
  createBook: (name: string, description?: string) => string;
  renameBook: (id: string, name: string) => void;
  deleteBook: (id: string) => void;
  addWord: (
    bookId: string,
    word: { term: string; meaning: string; phonetic?: string; example?: string }
  ) => void;
  updateWord: (bookId: string, wordId: string, patch: Partial<Word>) => void;
  deleteWord: (bookId: string, wordId: string) => void;
  importWords: (bookId: string, entries: ParsedEntry[]) => ImportResult;
  reviewWord: (bookId: string, wordId: string, result: ReviewResult) => void;
  resetBookProgress: (bookId: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    wordbooks: [],
    loaded: false,
  });

  // 让回调始终能读到最新状态（用于去重等需要在派发前计算的逻辑）
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadWordbooks().then((books) => dispatch({ type: 'LOADED', wordbooks: books }));
  }, []);

  useEffect(() => {
    if (state.loaded) {
      saveWordbooks(state.wordbooks).catch((e) =>
        console.warn('保存词库失败', e)
      );
    }
  }, [state.wordbooks, state.loaded]);

  const createBook = useCallback((name: string, description?: string) => {
    const id = uid();
    dispatch({ type: 'CREATE_BOOK', id, name, description });
    return id;
  }, []);

  const renameBook = useCallback(
    (id: string, name: string) => dispatch({ type: 'RENAME_BOOK', id, name }),
    []
  );

  const deleteBook = useCallback(
    (id: string) => dispatch({ type: 'DELETE_BOOK', id }),
    []
  );

  const addWord = useCallback(
    (
      bookId: string,
      word: { term: string; meaning: string; phonetic?: string; example?: string }
    ) => {
      dispatch({ type: 'ADD_WORD', bookId, word: buildWord(word) });
    },
    []
  );

  const updateWord = useCallback(
    (bookId: string, wordId: string, patch: Partial<Word>) =>
      dispatch({ type: 'UPDATE_WORD', bookId, wordId, patch }),
    []
  );

  const deleteWord = useCallback(
    (bookId: string, wordId: string) =>
      dispatch({ type: 'DELETE_WORD', bookId, wordId }),
    []
  );

  const importWords = useCallback((bookId: string, entries: ParsedEntry[]) => {
    const book = stateRef.current.wordbooks.find((b) => b.id === bookId);
    const existing = new Set(
      (book?.words ?? []).map((w) => w.term.toLowerCase())
    );
    const now = Date.now();
    const toAdd: Word[] = [];
    for (const e of entries) {
      const key = e.term.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      toAdd.push(
        buildWord({
          term: e.term,
          meaning: e.meaning,
          createdAt: now,
        })
      );
    }
    if (toAdd.length > 0) {
      dispatch({ type: 'IMPORT_WORDS', bookId, words: toAdd });
    }
    return { added: toAdd.length, skipped: entries.length - toAdd.length };
  }, []);

  const reviewWord = useCallback(
    (bookId: string, wordId: string, result: ReviewResult) =>
      dispatch({ type: 'REVIEW_WORD', bookId, wordId, result }),
    []
  );

  const resetBookProgress = useCallback(
    (bookId: string) => dispatch({ type: 'RESET_BOOK_PROGRESS', bookId }),
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      wordbooks: state.wordbooks,
      loaded: state.loaded,
      createBook,
      renameBook,
      deleteBook,
      addWord,
      updateWord,
      deleteWord,
      importWords,
      reviewWord,
      resetBookProgress,
    }),
    [
      state.wordbooks,
      state.loaded,
      createBook,
      renameBook,
      deleteBook,
      addWord,
      updateWord,
      deleteWord,
      importWords,
      reviewWord,
      resetBookProgress,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}

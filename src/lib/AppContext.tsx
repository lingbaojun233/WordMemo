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
import {
  AuthResult,
  User,
  generateSalt,
  hashPassword,
  newUserId,
  validatePassword,
  validateUsername,
} from '../lib/auth';
import {
  clearSession,
  loadSessionUserId,
  loadUsers,
  saveSessionUserId,
  saveUsers,
} from '../lib/authStorage';
import { BuiltinBookKey, getBuiltinBook } from '../data/builtinBooks';

type State = {
  users: User[];
  currentUser: User | null;
  wordbooks: Wordbook[];
  authReady: boolean; // 用户与会话加载完成
  dataLoaded: boolean; // 当前用户的词库加载完成
};

type Action =
  | { type: 'INIT'; users: User[]; currentUser: User | null; wordbooks: Wordbook[] }
  | { type: 'SET_USER'; user: User; users: User[]; wordbooks: Wordbook[] }
  | { type: 'LOGOUT' }
  | { type: 'CREATE_BOOK'; id: string; name: string; description?: string }
  | {
      type: 'ADD_BUILTIN_BOOK';
      bookId: string;
      name: string;
      description: string;
      builtinKey: string;
      words: Word[];
    }
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
    case 'INIT':
      return {
        users: action.users,
        currentUser: action.currentUser,
        wordbooks: action.wordbooks,
        authReady: true,
        dataLoaded: true,
      };

    case 'SET_USER':
      return {
        users: action.users,
        currentUser: action.user,
        wordbooks: action.wordbooks,
        authReady: true,
        dataLoaded: true,
      };

    case 'LOGOUT':
      return {
        ...state,
        currentUser: null,
        wordbooks: [],
        dataLoaded: true,
      };

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

    case 'ADD_BUILTIN_BOOK': {
      const book: Wordbook = {
        id: action.bookId,
        name: action.name,
        description: action.description,
        builtinKey: action.builtinKey,
        createdAt: Date.now(),
        words: action.words,
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
  users: User[];
  currentUser: User | null;
  wordbooks: Wordbook[];
  authReady: boolean;
  isLoggedIn: boolean;
  loaded: boolean; // 当前用户词库是否已加载
  register: (username: string, password: string) => Promise<AuthResult>;
  login: (username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  createBook: (name: string, description?: string) => string;
  addBuiltinBook: (key: BuiltinBookKey) => string | null;
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
    users: [],
    currentUser: null,
    wordbooks: [],
    authReady: false,
    dataLoaded: false,
  });

  // 让回调始终能读到最新状态
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 启动时加载用户与会话
  useEffect(() => {
    (async () => {
      const users = await loadUsers();
      const sessionId = await loadSessionUserId();
      const currentUser = users.find((u) => u.id === sessionId) ?? null;
      const wordbooks = currentUser ? await loadWordbooks(currentUser.id) : [];
      dispatch({ type: 'INIT', users, currentUser, wordbooks });
    })();
  }, []);

  // 词库变化时按当前用户保存
  useEffect(() => {
    if (state.currentUser && state.dataLoaded) {
      saveWordbooks(state.currentUser.id, state.wordbooks).catch((e) =>
        console.warn('保存词库失败', e)
      );
    }
  }, [state.currentUser, state.wordbooks, state.dataLoaded]);

  const register = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      const nameError = validateUsername(username);
      if (nameError) return { ok: false, error: nameError };
      const passError = validatePassword(password);
      if (passError) return { ok: false, error: passError };

      const u = username.trim();
      const exists = stateRef.current.users.some(
        (x) => x.username.toLowerCase() === u.toLowerCase()
      );
      if (exists) return { ok: false, error: '用户名已被注册' };

      const salt = await generateSalt();
      const passwordHash = await hashPassword(salt, password);
      const user: User = {
        id: newUserId(),
        username: u,
        passwordHash,
        salt,
        createdAt: Date.now(),
      };

      const users = [...stateRef.current.users, user];
      await saveUsers(users);
      await saveSessionUserId(user.id);

      const books = await loadWordbooks(user.id);
      dispatch({ type: 'SET_USER', user, users, wordbooks: books });
      return { ok: true, user };
    },
    []
  );

  const login = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      const u = username.trim();
      const user = stateRef.current.users.find(
        (x) => x.username.toLowerCase() === u.toLowerCase()
      );
      if (!user) return { ok: false, error: '用户名或密码错误' };

      const hash = await hashPassword(user.salt, password);
      if (hash !== user.passwordHash) {
        return { ok: false, error: '用户名或密码错误' };
      }

      await saveSessionUserId(user.id);
      const books = await loadWordbooks(user.id);
      dispatch({
        type: 'SET_USER',
        user,
        users: stateRef.current.users,
        wordbooks: books,
      });
      return { ok: true, user };
    },
    []
  );

  const logout = useCallback(async () => {
    await clearSession();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const createBook = useCallback((name: string, description?: string) => {
    const id = uid();
    dispatch({ type: 'CREATE_BOOK', id, name, description });
    return id;
  }, []);

  const addBuiltinBook = useCallback((key: BuiltinBookKey): string | null => {
    const def = getBuiltinBook(key);
    if (!def) return null;
    // 已添加过该内置词库则不重复添加
    if (stateRef.current.wordbooks.some((b) => b.builtinKey === key)) {
      return null;
    }
    const bookId = uid();
    const now = Date.now();
    const words: Word[] = def.words.map((w) => ({
      id: uid(),
      term: w.t,
      meaning: w.m,
      box: 0,
      dueAt: 0,
      correctCount: 0,
      wrongCount: 0,
      createdAt: now,
    }));
    dispatch({
      type: 'ADD_BUILTIN_BOOK',
      bookId,
      name: def.name,
      description: def.description,
      builtinKey: key,
      words,
    });
    return bookId;
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
        buildWord({ term: e.term, meaning: e.meaning, createdAt: now })
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
      users: state.users,
      currentUser: state.currentUser,
      wordbooks: state.wordbooks,
      authReady: state.authReady,
      isLoggedIn: state.currentUser !== null,
      loaded: state.dataLoaded,
      register,
      login,
      logout,
      createBook,
      addBuiltinBook,
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
      state.users,
      state.currentUser,
      state.wordbooks,
      state.authReady,
      state.dataLoaded,
      register,
      login,
      logout,
      createBook,
      addBuiltinBook,
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

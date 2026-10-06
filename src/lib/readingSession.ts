import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedPassage } from './ai';
import { Word } from './types';

/** AI 阅读的进行中会话：目标词、每篇生词、已生成短文、读到第几篇 */
export type ReadingSession = {
  targetWords: Word[]; // 本次阅读的全部目标生词
  chunks: { term: string; meaning: string }[][]; // 每篇短文的目标生词
  passages: (GeneratedPassage | null)[]; // 各篇短文（未生成的为 null）
  passageIdx: number; // 当前阅读到第几篇
};

function key(userId: string, bookId: string): string {
  return `wordmemo:reading:${userId}:${bookId}`;
}

export async function loadReadingSession(
  userId: string,
  bookId: string
): Promise<ReadingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, bookId));
    return raw ? (JSON.parse(raw) as ReadingSession) : null;
  } catch {
    return null;
  }
}

export async function saveReadingSession(
  userId: string,
  bookId: string,
  session: ReadingSession
): Promise<void> {
  await AsyncStorage.setItem(key(userId, bookId), JSON.stringify(session));
}

export async function clearReadingSession(userId: string, bookId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId, bookId));
}

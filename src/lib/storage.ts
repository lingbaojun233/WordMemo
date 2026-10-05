import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wordbook } from './types';

const KEY_PREFIX = 'wordmemo:wordbooks:v1';

// 每个用户的词库数据使用独立的存储 key，避免用户之间进度串号
function keyFor(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export async function loadWordbooks(userId: string): Promise<Wordbook[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Wordbook[]) : [];
  } catch (e) {
    console.warn('加载词库失败', e);
    return [];
  }
}

export async function saveWordbooks(userId: string, books: Wordbook[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(books));
}

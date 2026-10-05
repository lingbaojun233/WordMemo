import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wordbook } from './types';

const STORAGE_KEY = 'wordmemo:wordbooks:v1';

export async function loadWordbooks(): Promise<Wordbook[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Wordbook[]) : [];
  } catch (e) {
    console.warn('加载词库失败', e);
    return [];
  }
}

export async function saveWordbooks(books: Wordbook[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

export async function clearWordbooks(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

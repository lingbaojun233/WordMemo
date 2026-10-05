import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from './auth';

const USERS_KEY = 'wordmemo:users:v1';
const SESSION_KEY = 'wordmemo:session:v1';

export async function loadUsers(): Promise<User[]> {
  try {
    const raw = await AsyncStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as User[]) : [];
  } catch (e) {
    console.warn('加载用户失败', e);
    return [];
  }
}

export async function saveUsers(users: User[]): Promise<void> {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function loadSessionUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_KEY);
  } catch (e) {
    console.warn('加载会话失败', e);
    return null;
  }
}

export async function saveSessionUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, userId);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

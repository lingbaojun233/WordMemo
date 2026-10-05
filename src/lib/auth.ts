import * as Crypto from 'expo-crypto';

export type User = {
  id: string;
  username: string;
  passwordHash: string; // SHA-256(salt + password)
  salt: string; // 随机盐（hex）
  createdAt: number;
};

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3) return '用户名至少 3 个字符';
  if (u.length > 20) return '用户名最多 20 个字符';
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(u)) return '用户名只能包含字母、数字、下划线或中文';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return '密码至少 6 个字符';
  if (password.length > 64) return '密码最多 64 个字符';
  return null;
}

/** 生成随机盐（16 字节，hex 字符串） */
export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 计算密码哈希：SHA-256(salt + password) */
export async function hashPassword(salt: string, password: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + password
  );
}

export function newUserId(): string {
  return Crypto.randomUUID();
}

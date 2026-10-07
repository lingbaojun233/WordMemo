import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AbGroup, AiqState, LIMITS, emptyState } from './types';

const KEY_PREFIX = 'wordmemo:aiq:v1';

// 每个用户独立存储，核心数据全部留在本地
function keyFor(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

/** 本地随机分配 A/B 分组（A=采纳 AI 建议组，B=常规复习组） */
export function assignGroup(): AbGroup {
  return Math.random() < 0.5 ? 'A' : 'B';
}

/** 控制本地存储体积上限 */
export function trimState(state: AiqState): AiqState {
  const attempts = [...state.attempts].sort((a, b) => b.at - a.at).slice(0, LIMITS.attempts);
  const entries = [...state.entries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, LIMITS.entries);
  const advice = [...state.advice].sort((a, b) => b.at - a.at).slice(0, LIMITS.advice);
  return { ...state, attempts, entries, advice };
}

export async function loadAiqState(userId: string): Promise<AiqState> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return { ...emptyState(), group: assignGroup() };
    const parsed = JSON.parse(raw) as Partial<AiqState>;
    return trimState({
      ...emptyState(),
      ...parsed,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      advice: Array.isArray(parsed.advice) ? parsed.advice : [],
      proficiency: parsed.proficiency ?? {},
      group: parsed.group === 'A' || parsed.group === 'B' ? parsed.group : assignGroup(),
    });
  } catch (e) {
    console.warn('加载 AI 出题数据失败', e);
    return { ...emptyState(), group: assignGroup() };
  }
}

export async function saveAiqState(userId: string, state: AiqState): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(trimState(state)));
}

export async function clearAiqState(userId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(userId));
}

// ---------------------------------------------------------------------------
// 加密导出备份
// 说明：受限于「不引入额外加密依赖」，这里采用 SHA-256 派生的哈希流密码（counter 模式）
// 做加密 + Encrypt-then-MAC 完整性校验。它不是 AES，但可保证备份文件不落明文。
// ---------------------------------------------------------------------------

type BackupFile = { v: 1; salt: string; data: string; mac: string };

/** 字符串 <-> UTF-8 字节（不依赖 TextEncoder，兼容 Hermes） */
function toBytes(s: string): number[] {
  const enc = encodeURIComponent(s);
  const out: number[] = [];
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === '%') {
      out.push(parseInt(enc.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(enc.charCodeAt(i));
    }
  }
  return out;
}

function fromBytes(bytes: number[]): string {
  let enc = '';
  for (const b of bytes) enc += '%' + b.toString(16).padStart(2, '0');
  return decodeURIComponent(enc);
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/** 由密钥派生任意长度的密钥流（每 32 字节一个 SHA-256 块） */
async function keystream(key: string, length: number): Promise<number[]> {
  const out: number[] = [];
  let counter = 0;
  while (out.length < length) {
    const block = await sha256Hex(`${key}|${counter}`);
    for (let i = 0; i < block.length; i += 2) {
      out.push(parseInt(block.slice(i, i + 2), 16));
      if (out.length >= length) break;
    }
    counter++;
  }
  return out;
}

/** 加密导出：返回可直接保存/发送的 JSON 字符串 */
export async function encryptBackup(state: AiqState, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error('导出密码不能为空');
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = bytesToHex(Array.from(saltBytes));
  const key = await sha256Hex(`${salt}|${passphrase}`);

  const plain = toBytes(JSON.stringify({ ...state, exportedAt: Date.now() }));
  const stream = await keystream(key, plain.length);
  const cipher = plain.map((b, i) => b ^ stream[i]);

  const data = bytesToHex(cipher);
  const mac = await sha256Hex(`${key}|mac|${data}`);

  const file: BackupFile = { v: 1, salt, data, mac };
  return JSON.stringify(file, null, 2);
}

/** 解密导入：校验失败会抛出可读错误 */
export async function decryptBackup(json: string, passphrase: string): Promise<AiqState> {
  let file: BackupFile;
  try {
    file = JSON.parse(json) as BackupFile;
  } catch {
    throw new Error('备份文件不是合法的 JSON');
  }
  if (file?.v !== 1 || !file.salt || !file.data || !file.mac) {
    throw new Error('备份文件格式不受支持');
  }

  const key = await sha256Hex(`${file.salt}|${passphrase}`);
  const expectMac = await sha256Hex(`${key}|mac|${file.data}`);
  if (expectMac !== file.mac) {
    throw new Error('密码错误或文件已损坏');
  }

  const cipher: number[] = [];
  for (let i = 0; i < file.data.length; i += 2) {
    cipher.push(parseInt(file.data.slice(i, i + 2), 16));
  }
  const stream = await keystream(key, cipher.length);
  const plainBytes = cipher.map((b, i) => b ^ stream[i]);

  const parsed = JSON.parse(fromBytes(plainBytes)) as Partial<AiqState>;
  return trimState({
    ...emptyState(),
    ...parsed,
    attempts: parsed.attempts ?? [],
    entries: parsed.entries ?? [],
    advice: parsed.advice ?? [],
    proficiency: parsed.proficiency ?? {},
  });
}

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// 应用内日志：同时打印到控制台（Metro/logcat 可见）并写入文档目录 wordmemo.log，
// 便于在 App 内一键导出日志文件排查问题（如设备端模型不可用）。

const FILE_NAME = 'wordmemo.log';
const MAX_LINES = 1000;

const lines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function filePath(): string {
  return `${FileSystem.documentDirectory ?? ''}${FILE_NAME}`;
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message || String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function emit(level: 'INFO' | 'WARN' | 'ERROR', tag: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] [${tag}] ${args.map(fmt).join(' ')}`;
  console.log(`[WordMemo] [${level}] [${tag}]`, ...args);
  lines.push(line);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  if (Platform.OS === 'web') return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flush();
  }, 200);
}

async function flush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await FileSystem.writeAsStringAsync(filePath(), lines.join('\n') + '\n');
  } catch {
    // 写日志失败不阻断业务
  }
}

export function logInfo(tag: string, ...args: unknown[]): void {
  emit('INFO', tag, args);
}

export function logWarn(tag: string, ...args: unknown[]): void {
  emit('WARN', tag, args);
}

export function logError(tag: string, ...args: unknown[]): void {
  emit('ERROR', tag, args);
}

/** 读取完整日志内容（网页版读内存，原生读文件） */
export async function readLog(): Promise<string> {
  if (Platform.OS === 'web') return lines.join('\n');
  await flush();
  try {
    const info = await FileSystem.getInfoAsync(filePath());
    if (!info.exists) return lines.join('\n');
    return await FileSystem.readAsStringAsync(filePath());
  } catch {
    return lines.join('\n');
  }
}

/** 清空日志 */
export async function clearLog(): Promise<void> {
  lines.length = 0;
  if (Platform.OS !== 'web') {
    await FileSystem.writeAsStringAsync(filePath(), '').catch(() => {});
  }
}

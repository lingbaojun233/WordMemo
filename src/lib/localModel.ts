import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { LlamaContext } from 'llama.rn';

// 端侧模型（llama.cpp via llama.rn）封装。
// llama.rn 是原生库，仅 iOS/Android 可用；网页版通过动态 import + Platform 守卫，
// 不会真正加载原生模块。

type LlamaModule = typeof import('llama.rn');

let llamaPromise: Promise<LlamaModule> | null = null;

function getLlama(): Promise<LlamaModule> {
  if (Platform.OS === 'web') {
    return Promise.reject(
      new Error('设备端模型仅在手机 App 可用，网页版请改用联网模型')
    );
  }
  if (!llamaPromise) {
    llamaPromise = import('llama.rn');
  }
  return llamaPromise;
}

function modelDir(): string {
  return `${FileSystem.documentDirectory ?? ''}llm/`;
}

function modelPath(name: string): string {
  return `${modelDir()}${name}.gguf`;
}

export function isDeviceModelSupported(): boolean {
  return Platform.OS !== 'web';
}

export type DeviceModelInfo = {
  downloaded: boolean;
  path: string;
  size?: number;
};

/** 可选安装的预设模型 */
export type ModelPreset = {
  name: string; // 文件名（不含扩展名）
  url: string; // GGUF 下载地址
  label: string; // 显示名
  size: string; // 大小描述
};

export const MODEL_PRESETS: ModelPreset[] = [
  {
    name: 'qwen2.5-0.5b-instruct-q4_k_m',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    label: '0.5B · 最低配',
    size: '约 400MB',
  },
  {
    name: 'qwen2.5-1.5b-instruct-q4_k_m',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    label: '1.5B · 推荐',
    size: '约 1GB',
  },
  {
    name: 'qwen2.5-3b-instruct-q4_k_m',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    label: '3B · 效果更好',
    size: '约 2GB',
  },
];

export async function getDeviceModelInfo(name: string): Promise<DeviceModelInfo> {
  const path = modelPath(name);
  try {
    const info = await FileSystem.getInfoAsync(path);
    return {
      downloaded: info.exists,
      path,
      size: info.exists ? (info as { size?: number }).size : undefined,
    };
  } catch {
    return { downloaded: false, path };
  }
}

/** 下载 GGUF 模型到应用文档目录（已存在则跳过），返回本地文件 URI */
export async function downloadDeviceModel(
  url: string,
  name: string,
  onProgress?: (ratio: number) => void
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('设备端模型仅在手机 App 可用，网页版请改用联网模型');
  }
  await FileSystem.makeDirectoryAsync(modelDir(), { intermediates: true });
  const dest = modelPath(name);
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) return dest;

  const download = FileSystem.createDownloadResumable(
    url,
    dest,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    }
  );
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`模型下载失败（HTTP ${result?.status ?? '未知'}）`);
  }
  return dest;
}

export async function deleteDeviceModel(name: string): Promise<void> {
  const info = await getDeviceModelInfo(name);
  if (info.downloaded) {
    await FileSystem.deleteAsync(info.path, { idempotent: true });
  }
}

let context: LlamaContext | null = null;
let loadedName: string | null = null;

/** 初始化（或复用）端侧模型上下文 */
async function ensureContext(name: string, url: string): Promise<LlamaContext> {
  if (context && loadedName === name) return context;

  await releaseContext();

  let path = (await getDeviceModelInfo(name)).path;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    path = await downloadDeviceModel(url, name);
  }

  const { initLlama } = await getLlama();
  context = await initLlama({
    model: path,
    n_ctx: 2048,
    n_gpu_layers: 99, // 尽量使用 GPU/Metal 加速，无 GPU 时自动回退 CPU
    use_mlock: true,
  });
  loadedName = name;
  return context;
}

/** 用端侧模型做一次对话补全，返回纯文本 */
export async function generateWithDeviceModel(
  prompt: string,
  name: string,
  url: string
): Promise<string> {
  const ctx = await ensureContext(name, url);
  const result = await ctx.completion({
    messages: [{ role: 'user', content: prompt }],
    n_predict: 768,
    temperature: 0.8,
    top_p: 0.9,
  });
  return (result.text ?? '').trim();
}

/** 释放端侧模型上下文，释放内存 */
export async function releaseContext(): Promise<void> {
  if (context) {
    try {
      await context.release();
    } catch {
      // 忽略释放失败
    }
    context = null;
    loadedName = null;
  }
}

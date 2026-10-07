import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { LlamaContext } from 'llama.rn';
import { logInfo, logWarn } from './log';

// 端侧模型（llama.cpp via llama.rn）封装。
// llama.rn 是原生库，仅 iOS/Android 可用；网页版通过动态 import + Platform 守卫，
// 不会真正加载原生模块。
//
// 稳定性要点（这几个都会让原生层抛 "Exception in hostfunction" 这种没有细节的异常）：
//   1. 模型文件必须完整——半途中断的 GGUF 会让 initLlama 直接崩，所以下载后记录大小、加载前校验；
//   2. GPU 加速不是所有机型都可用，初始化失败要能自动退回纯 CPU；
//   3. 同一个 context 不能并发推理，必须串行；
//   4. 提示词 + 生成长度不能超过上下文窗口，否则 llama_decode 会失败。

type LlamaModule = typeof import('llama.rn');

// 设备端模型日志：统一写入应用内日志文件，可在「学习设置」中导出
function log(...args: unknown[]): void {
  logInfo('localAI', ...args);
}
function warn(...args: unknown[]): void {
  logWarn('localAI', ...args);
}

let llamaPromise: Promise<LlamaModule> | null = null;

function getLlama(): Promise<LlamaModule> {
  log('加载 llama.rn 模块，平台 =', Platform.OS);
  if (Platform.OS === 'web') {
    warn('设备端模型仅在手机 App 可用，网页版请改用联网模型');
    return Promise.reject(
      new Error('设备端模型仅在手机 App 可用，网页版请改用联网模型')
    );
  }
  if (!llamaPromise) {
    llamaPromise = import('llama.rn')
      .then((m) => {
        log('llama.rn 模块加载成功');
        return m;
      })
      .catch((e) => {
        warn('llama.rn 模块加载失败', e instanceof Error ? e.message : String(e));
        throw e;
      });
  }
  return llamaPromise;
}

function modelDir(): string {
  return `${FileSystem.documentDirectory ?? ''}llm/`;
}

function modelPath(name: string): string {
  return `${modelDir()}${name}.gguf`;
}

/** 记录模型预期大小的旁挂文件，用于校验下载完整性 */
function sizeRecordPath(name: string): string {
  return `${modelDir()}${name}.size`;
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

/** 小于这个体积的一定不是完整 GGUF（最小的 0.5B q4 也有数百 MB） */
const MIN_MODEL_BYTES = 4 * 1024 * 1024;
/** 上下文窗口：出题提示词（含分层提示词注入）较长，给足空间避免溢出 */
const N_CTX = 4096;
const DEFAULT_MAX_TOKENS = 768;

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

async function readSizeRecord(name: string): Promise<number | null> {
  try {
    const p = sizeRecordPath(name);
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(p);
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export type ModelCheck = { ok: boolean; size: number; reason?: string };

/** 从预设里解析出声明大小（如「约 1GB」-> 字节数），用于老下载的兜底校验 */
function declaredBytes(name: string): number | null {
  const preset = MODEL_PRESETS.find((p) => p.name === name);
  if (!preset) return null;
  const m = preset.size.match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return null;
  const mult = m[2].toUpperCase() === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024;
  return Math.round(parseFloat(m[1]) * mult);
}

/** 校验本地模型是否完整（有无残缺 / 是否小于下载时记录的大小） */
export async function verifyDeviceModel(name: string): Promise<ModelCheck> {
  const info = await getDeviceModelInfo(name);
  const size = info.size ?? 0;
  if (!info.downloaded) return { ok: false, size: 0, reason: '模型尚未下载' };
  if (size < MIN_MODEL_BYTES) {
    return { ok: false, size, reason: `文件只有 ${Math.round(size / 1024)} KB，明显没下载完整` };
  }

  const expected = await readSizeRecord(name);
  if (expected != null) {
    if (size < expected) {
      return {
        ok: false,
        size,
        reason: `文件不完整（${Math.round(size / 1048576)}MB / 应为 ${Math.round(expected / 1048576)}MB）`,
      };
    }
    return { ok: true, size };
  }

  // 没有大小记录（旧版本下载的）：与预设声明大小做宽松比对，粗判是否被截断
  const declared = declaredBytes(name);
  if (declared != null && size < declared * 0.6) {
    return {
      ok: false,
      size,
      reason: `文件明显偏小（${Math.round(size / 1048576)}MB / 预期约 ${Math.round(declared / 1048576)}MB）`,
    };
  }
  return { ok: true, size };
}

async function removeModelFiles(name: string): Promise<void> {
  await FileSystem.deleteAsync(modelPath(name), { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(sizeRecordPath(name), { idempotent: true }).catch(() => {});
}

/** 下载 GGUF 模型到应用文档目录（已存在且完整则跳过），返回本地文件 URI */
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
  log('开始下载模型', name, '->', dest);

  // 已存在且校验通过 -> 直接复用；残缺文件先清理，避免加载半个模型直接崩
  const existing = await verifyDeviceModel(name);
  if (existing.ok) {
    log('模型已存在且校验通过，直接复用', name);
    return dest;
  }
  if (existing.size > 0) {
    warn('模型文件不完整，先清理再重下', name, existing.size);
    await removeModelFiles(name);
  }

  // 依次尝试：原地址 -> 国内镜像（hf-mirror.com，国内直连 HuggingFace 常失败）
  const urls = [url];
  if (url.includes('huggingface.co')) {
    urls.push(url.replace('huggingface.co', 'hf-mirror.com'));
  }

  let lastError: unknown = null;
  for (const u of urls) {
    log('尝试下载地址', u);
    let expectedTotal = 0;
    try {
      const download = FileSystem.createDownloadResumable(
        u,
        dest,
        {},
        (p) => {
          if (p.totalBytesExpectedToWrite > 0) {
            expectedTotal = p.totalBytesExpectedToWrite;
            onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
          }
        }
      );
      const result = await download.downloadAsync();
      if (!result || result.status !== 200) {
        lastError = new Error(`HTTP ${result?.status ?? '未知'}`);
        continue;
      }

      const info = await FileSystem.getInfoAsync(dest);
      const actual = (info.exists && (info as { size?: number }).size) || 0;
      if (actual < MIN_MODEL_BYTES) {
        lastError = new Error('下载文件异常偏小');
        await removeModelFiles(name);
        continue;
      }
      if (expectedTotal > 0 && actual < expectedTotal) {
        lastError = new Error(
          `下载不完整（${Math.round(actual / 1048576)}MB / ${Math.round(expectedTotal / 1048576)}MB）`
        );
        await removeModelFiles(name);
        continue;
      }

      // 记录实际大小，下次加载前据此校验完整性
      await FileSystem.writeAsStringAsync(sizeRecordPath(name), String(actual));
      log('模型下载完成', name, actual, '字节');
      return dest;
    } catch (e) {
      warn('该地址下载失败', u, e instanceof Error ? e.message : String(e));
      lastError = e;
    }
  }

  throw new Error(
    `模型下载失败：${lastError instanceof Error ? lastError.message : String(lastError)}（已尝试原地址与国内镜像，请检查网络后重试）`
  );
}

export async function deleteDeviceModel(name: string): Promise<void> {
  await removeModelFiles(name);
}

// ---------------------------------------------------------------------------
// 上下文与推理
// ---------------------------------------------------------------------------

let context: LlamaContext | null = null;
let loadedName: string | null = null;
/** 一旦 GPU 路线失败过，后续直接走纯 CPU，避免每次都在同一处失败 */
let preferCpu = false;

/** 同一个 context 不能并发推理，这里把请求串起来排队 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function describeNativeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/hostfunction|<unknown>/i.test(raw)) {
    return '原生层异常（常见原因：模型文件不完整、内存不足、GPU 不兼容）';
  }
  return raw || '未知错误';
}

/** 初始化上下文：先试 GPU 加速，失败自动退回纯 CPU */
async function initContext(name: string): Promise<LlamaContext> {
  const { initLlama } = await getLlama();
  const path = modelPath(name);
  let lastError: unknown = null;

  log('初始化模型上下文', name, '策略 =', preferCpu ? '纯 CPU' : '先 GPU 后 CPU');
  for (const gpuLayers of preferCpu ? [0] : [99, 0]) {
    log('尝试加载模型', gpuLayers === 0 ? 'CPU' : `GPU(${gpuLayers} 层)`, '路径 =', path);
    try {
      const ctx = await initLlama({
        model: path,
        n_ctx: N_CTX,
        n_gpu_layers: gpuLayers,
        // Android 上 mlock 常因内存锁定限制失败，关掉更稳
        use_mlock: false,
      });
      log('模型加载成功', gpuLayers === 0 ? 'CPU' : 'GPU');
      return ctx;
    } catch (e) {
      lastError = e;
      warn('加载失败', gpuLayers === 0 ? 'CPU' : `GPU(${gpuLayers} 层)`, describeNativeError(e));
      if (gpuLayers !== 0) preferCpu = true; // GPU 不可用，下次直接用 CPU
    }
  }
  throw new Error(`本地模型加载失败（GPU 与 CPU 都试过）：${describeNativeError(lastError)}`);
}

async function ensureContext(name: string, url: string): Promise<LlamaContext> {
  if (context && loadedName === name) return context;
  await releaseContext();

  const check = await verifyDeviceModel(name);
  if (!check.ok) {
    if (check.size > 0) {
      // 残缺的 GGUF 会直接把原生层搞崩：先清掉，并给出可操作提示（设置页可带进度重新下载）
      await removeModelFiles(name);
      throw new Error(
        `本地模型文件不完整（${check.reason ?? '原因未知'}），已清理，请到「学习设置」重新下载模型`
      );
    }
    // 完全没有模型时自动下载
    await downloadDeviceModel(url, name);
  }

  context = await initContext(name);
  loadedName = name;
  return context;
}

/** 粗略估算 token 数：中日韩字符约 1 token/字，其它约 4 字符/token */
function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    if (/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(ch)) cjk++;
  }
  return Math.ceil(cjk + (text.length - cjk) / 4);
}

async function runCompletion(
  prompt: string,
  name: string,
  url: string,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const ctx = await ensureContext(name, url);

  // 生成长度必须给提示词留出空间，否则会超出上下文窗口导致原生推理失败
  const budget = Math.max(64, N_CTX - estimateTokens(prompt) - 64);
  const nPredict = Math.max(
    64,
    Math.min(opts?.maxTokens ?? DEFAULT_MAX_TOKENS, budget)
  );

  log('开始推理', name, '提示词约', estimateTokens(prompt), 'tokens，生成上限', nPredict);
  const result = await ctx.completion({
    messages: [{ role: 'user', content: prompt }],
    n_predict: nPredict,
    temperature: opts?.temperature ?? 0.8,
    top_p: 0.9,
  });
  const text = (result.text ?? '').trim();
  if (!text) {
    warn('推理返回空内容', name);
    throw new Error('本地模型没有输出内容（可能上下文已满或模型不支持当前提示词）');
  }
  log('推理完成', name, '输出', text.length, '字符');
  return text;
}

/**
 * 用端侧模型做一次对话补全，返回纯文本。
 * 首次失败会自动改用纯 CPU 重试一次——GPU（OpenCL）不兼容是这类原生异常最常见的原因。
 */
export async function generateWithDeviceModel(
  prompt: string,
  name: string,
  url: string,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  return serialize(async () => {
    try {
      return await runCompletion(prompt, name, url, opts);
    } catch (e) {
      const first = describeNativeError(e);
      warn('首次推理失败，改用纯 CPU 重试', first);
      preferCpu = true;
      await releaseContext();
      try {
        return await runCompletion(prompt, name, url, opts);
      } catch (e2) {
        await releaseContext();
        throw new Error(`本地模型推理失败：${first}；改用 CPU 重试仍失败：${describeNativeError(e2)}`);
      }
    }
  });
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

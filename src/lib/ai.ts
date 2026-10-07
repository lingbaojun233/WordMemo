import { StudySettings } from './studySettings';
import { generateWithDeviceModel } from './localModel';

export type GeneratedPassage = {
  title: string;
  passage: string; // 目标单词用 [[word]] 包裹
  glossary: { word: string; meaning: string }[];
};

/** 一次 AI 调用所需的连接配置：联网（OpenAI 兼容）或设备端（llama.cpp） */
export type AiConfig =
  | { provider: 'online'; baseUrl: string; model: string; apiKey: string }
  | { provider: 'device'; modelUrl: string; modelName: string };

/** 根据学习设置解析当前生效的 AI 配置 */
export function getAiConfig(
  s: Pick<
    StudySettings,
    | 'aiProvider'
    | 'aiApiKey'
    | 'aiBaseUrl'
    | 'aiModel'
    | 'deviceModelUrl'
    | 'deviceModelName'
  >
): AiConfig {
  if (s.aiProvider === 'device') {
    return {
      provider: 'device',
      modelUrl: s.deviceModelUrl,
      modelName: s.deviceModelName,
    };
  }
  return {
    provider: 'online',
    baseUrl: s.aiBaseUrl,
    model: s.aiModel,
    apiKey: s.aiApiKey,
  };
}

export type PassageSegment = {
  text: string;
  term?: string; // 若为高亮目标单词
  meaning?: string;
};

export function parsePassage(
  passage: string,
  glossary: Map<string, string>
): PassageSegment[] {
  const segments: PassageSegment[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(passage))) {
    if (m.index > last) {
      segments.push({ text: passage.slice(last, m.index) });
    }
    const word = m[1].trim();
    segments.push({
      text: word,
      term: word.toLowerCase(),
      meaning: glossary.get(word.toLowerCase()) ?? '',
    });
    last = m.index + m[0].length;
  }
  if (last < passage.length) {
    segments.push({ text: passage.slice(last) });
  }
  return segments;
}

/** 从模型返回内容中稳健地提取 JSON 对象 */
export function extractJson(content: string): unknown {
  const text = content.trim();
  // 去掉 markdown 代码块
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    // 尝试提取第一个 { 到最后一个 }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('无法解析 AI 返回的 JSON');
  }
}

export const LEVEL_DESC: Record<string, string> = {
  junior: '初中及以下',
  senior: '高中（高考）及以下',
  cet4: '四级及以下',
  cet6: '六级及以下',
  tem4: '专四及以下',
  tem8: '专八及以下',
  gre: 'GRE 及以下',
};

/** 联网模型：统一走 OpenAI 兼容 /chat/completions */
async function chatCompletion(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts?.temperature ?? 0.8,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  } catch (e) {
    throw new Error(`网络请求失败：${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI 请求失败 (${response.status})：${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('AI 返回内容为空');
  return content;
}

/** 按配置分发到联网或设备端模型，返回补全文本 */
export async function completeText(
  config: AiConfig,
  prompt: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (config.provider === 'online') {
    return chatCompletion(config.baseUrl, config.model, config.apiKey, prompt, opts);
  }
  // 端侧模型同样遵守调用方给的生成长度/温度（之前被忽略，出题等长输出会被截断）
  return generateWithDeviceModel(prompt, config.modelName, config.modelUrl, {
    maxTokens: opts?.maxTokens,
    temperature: opts?.temperature,
  });
}

export async function generatePassage(params: {
  config: AiConfig;
  targetWords: { term: string; meaning: string }[];
  readerLevel: string; // LevelKey
}): Promise<GeneratedPassage> {
  const { config, targetWords, readerLevel } = params;

  const wordList = targetWords
    .map((w) => `${w.term}（${w.meaning}）`)
    .join('、');
  const levelDesc = LEVEL_DESC[readerLevel] ?? '高中（高考）及以下';

  const prompt = `请生成一篇英语学习小短文，帮助中文母语者通过阅读记忆英语单词。

【需要记忆的目标单词】（这些是读者正在学习的生词，必须自然地融入文章）：
${wordList}

【读者的词汇水平】读者已掌握「${levelDesc}」的词汇，正在学习更高一级的词汇。

【文章要求】
1. 主题自定，内容连贯自然、贴近日常生活、有趣。
2. 除了目标单词外，文章其余词汇必须全部使用读者已掌握水平（${levelDesc}）的词汇，禁止使用其他更难的生词，确保读者能读懂。
3. 每个目标单词在文章中至少出现一次，并用 [[单词]] 包裹（例如 [[abandon]]）。
4. 文章长度以能自然、充分地容纳这些目标单词为准，不要为了塞词而堆砌。

【输出格式】只输出一个 JSON 对象，不要输出任何其他文字：
{"title":"文章标题","passage":"文章正文（目标单词用 [[ ]] 包裹）","glossary":[{"word":"目标单词","meaning":"中文释义"}]}`;

  // 短文 + glossary 的 JSON 比较长，留足生成长度，避免被截断导致解析失败
  const content = await completeText(config, prompt, { temperature: 0.8, maxTokens: 1024 });

  const parsed = extractJson(content) as Partial<GeneratedPassage>;
  if (!parsed.passage || typeof parsed.passage !== 'string') {
    throw new Error('AI 返回缺少 passage 字段');
  }
  const glossary = new Map<string, string>();
  if (Array.isArray(parsed.glossary)) {
    for (const g of parsed.glossary) {
      if (g && g.word && g.meaning) {
        glossary.set(String(g.word).toLowerCase(), String(g.meaning));
      }
    }
  }
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '今日短文',
    passage: parsed.passage,
    glossary: Array.from(glossary.entries()).map(([word, meaning]) => ({
      word,
      meaning,
    })),
  };
}

/** 测试 AI 连接是否可用，返回模型回复的一句话 */
export async function testAiConnection(config: AiConfig): Promise<string> {
  const content = await completeText(config, '请只回复两个字：正常', {
    temperature: 0,
    maxTokens: 16,
  });
  return content.trim();
}

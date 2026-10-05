export type GeneratedPassage = {
  title: string;
  passage: string; // 目标单词用 [[word]] 包裹
  glossary: { word: string; meaning: string }[];
};

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
function extractJson(content: string): unknown {
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

const LEVEL_DESC: Record<string, string> = {
  junior: '初中及以下',
  senior: '高中（高考）及以下',
  cet4: '四级及以下',
  cet6: '六级及以下',
  tem4: '专四及以下',
  tem8: '专八及以下',
  gre: 'GRE 及以下',
};

export async function generatePassage(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  targetWords: { term: string; meaning: string }[];
  readerLevel: string; // LevelKey
}): Promise<GeneratedPassage> {
  const { apiKey, baseUrl, model, targetWords, readerLevel } = params;
  if (!apiKey) throw new Error('请先在「设置」中填写 AI API Key');

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

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
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

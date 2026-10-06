import AsyncStorage from '@react-native-async-storage/async-storage';
import { LevelKey } from '../data/levelTestWords';
import { PickMode } from './types';

// 学习模式
export type StudyMode = 'memorize_quiz' | 'ai_reading' | 'ai_questions';

// AI 服务来源：联网模型（DeepSeek/OpenAI 兼容）或本地模型（Ollama 等 OpenAI 兼容服务）
export type AiProvider = 'online' | 'local';

export type StudySettings = {
  aiProvider: AiProvider; // 当前使用的 AI 来源
  aiApiKey: string; // 联网模型 API Key
  aiBaseUrl: string; // 联网模型接口地址
  aiModel: string; // 联网模型名
  localBaseUrl: string; // 本地模型接口地址（OpenAI 兼容，如 Ollama 的 /v1）
  localModel: string; // 本地模型名
  dailyPassages: number; // 一天读几篇短文
  dailyWords: number; // 一天背多少单词
  pickMode: PickMode; // 单词选取方式：按顺序 / 随机
  level: LevelKey | null; // 词汇水平（来自测验，null 表示未测）
  vocab: number | null; // 精确估测词汇量（含未通过级别的部分词汇，null 表示未测）
  studyMode: StudyMode | null; // 学习模式（null 表示未选择）
  onboardingDone: boolean; // 是否已完成注册引导
};

const KEY = 'wordmemo:studySettings:v1';

export const DEFAULT_SETTINGS: StudySettings = {
  aiProvider: 'online',
  aiApiKey: '',
  aiBaseUrl: 'https://api.deepseek.com',
  aiModel: 'deepseek-chat',
  localBaseUrl: 'http://localhost:11434/v1',
  localModel: 'qwen2.5:1.5b',
  dailyPassages: 2,
  dailyWords: 20,
  pickMode: 'sequential',
  level: null,
  vocab: null,
  studyMode: null,
  onboardingDone: false,
};

export async function loadStudySettings(): Promise<StudySettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.warn('加载学习设置失败', e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveStudySettings(settings: StudySettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

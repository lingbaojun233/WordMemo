import AsyncStorage from '@react-native-async-storage/async-storage';
import { LevelKey } from '../data/levelTestWords';
import { PickMode } from './types';

// 学习模式
export type StudyMode = 'memorize_quiz' | 'ai_reading' | 'ai_questions';

// AI 服务来源：联网模型（DeepSeek/OpenAI 兼容）或设备端模型（llama.cpp 端侧推理）
export type AiProvider = 'online' | 'device';

// 学习目标类型：每日目标 / 截止日期（天数内学完）
export type GoalType = 'daily' | 'deadline';

export type StudySettings = {
  aiProvider: AiProvider; // 当前使用的 AI 来源
  aiApiKey: string; // 联网模型 API Key
  aiBaseUrl: string; // 联网模型接口地址
  aiModel: string; // 联网模型名
  deviceModelUrl: string; // 设备端 GGUF 模型下载地址（HuggingFace）
  deviceModelName: string; // 设备端模型名（文件命名/展示）
  dailyPassages: number; // 一天读几篇短文
  dailyWords: number; // 一天背多少单词
  pickMode: PickMode; // 单词选取方式：按顺序 / 随机
  level: LevelKey | null; // 词汇水平（来自测验，null 表示未测）
  vocab: number | null; // 精确估测词汇量（含未通过级别的部分词汇，null 表示未测）
  studyMode: StudyMode | null; // 学习模式（null 表示未选择）
  onboardingDone: boolean; // 是否已完成注册引导
  currentBookId: string | null; // 当前学习的单词本
  goalType: GoalType; // 学习目标类型
  dailyGoal: number; // 每日目标（每天新学单词数）
  deadlineDays: number; // 截止目标（希望在 N 天内学完当前词本）
};

const KEY = 'wordmemo:studySettings:v1';

export const DEFAULT_SETTINGS: StudySettings = {
  aiProvider: 'online',
  aiApiKey: '',
  aiBaseUrl: 'https://api.deepseek.com',
  aiModel: 'deepseek-chat',
  deviceModelUrl:
    'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  deviceModelName: 'qwen2.5-1.5b-instruct-q4_k_m',
  dailyPassages: 2,
  dailyWords: 20,
  pickMode: 'sequential',
  level: null,
  vocab: null,
  studyMode: null,
  onboardingDone: false,
  currentBookId: null,
  goalType: 'daily',
  dailyGoal: 20,
  deadlineDays: 30,
};

export async function loadStudySettings(): Promise<StudySettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // 兼容旧版本：旧的 'local'（本地 Ollama）统一视为「联网」来源，避免落到无效值
    if (merged.aiProvider !== 'online' && merged.aiProvider !== 'device') {
      merged.aiProvider = 'online';
    }
    return merged;
  } catch (e) {
    console.warn('加载学习设置失败', e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveStudySettings(settings: StudySettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

import { BuiltinWord, CET4_WORDS } from './cet4';
import { CET6_WORDS } from './cet6';
import { JUNIOR_WORDS } from './junior';
import { SENIOR_WORDS } from './senior';
import { TEM4_WORDS } from './tem4';
import { TEM8_WORDS } from './tem8';
import { GRE_WORDS } from './gre';
import { LevelKey } from './levelTestWords';

export type BuiltinBookKey = LevelKey;

export type BuiltinBookDef = {
  key: BuiltinBookKey;
  name: string;
  description: string;
  words: BuiltinWord[];
};

export const BUILTIN_BOOKS: BuiltinBookDef[] = [
  {
    key: 'junior',
    name: '初中词汇',
    description: '初中英语词汇',
    words: JUNIOR_WORDS,
  },
  {
    key: 'senior',
    name: '高中词汇',
    description: '高中（高考）英语词汇',
    words: SENIOR_WORDS,
  },
  {
    key: 'cet4',
    name: '四级词汇',
    description: '大学英语四级大纲词汇',
    words: CET4_WORDS,
  },
  {
    key: 'cet6',
    name: '六级词汇',
    description: '大学英语六级大纲词汇',
    words: CET6_WORDS,
  },
  {
    key: 'tem4',
    name: '专四词汇',
    description: '英语专业四级词汇',
    words: TEM4_WORDS,
  },
  {
    key: 'tem8',
    name: '专八词汇',
    description: '英语专业八级词汇',
    words: TEM8_WORDS,
  },
  {
    key: 'gre',
    name: 'GRE 词汇',
    description: 'GRE 考试核心词汇',
    words: GRE_WORDS,
  },
];

export function getBuiltinBook(key: BuiltinBookKey): BuiltinBookDef | undefined {
  return BUILTIN_BOOKS.find((b) => b.key === key);
}

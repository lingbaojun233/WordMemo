import { BuiltinWord, CET4_WORDS } from './cet4';
import { CET6_WORDS } from './cet6';
import { ELEMENTARY_WORDS } from './elementary';
import { JUNIOR_WORDS } from './junior';
import { SENIOR_WORDS } from './senior';
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
    key: 'elementary',
    name: '小学词汇',
    description: '小学英语基础词汇',
    words: ELEMENTARY_WORDS,
  },
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
];

export function getBuiltinBook(key: BuiltinBookKey): BuiltinBookDef | undefined {
  return BUILTIN_BOOKS.find((b) => b.key === key);
}

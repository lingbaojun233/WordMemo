import { BuiltinWord, CET4_WORDS } from './cet4';
import { CET6_WORDS } from './cet6';

export type BuiltinBookKey = 'cet4' | 'cet6';

export type BuiltinBookDef = {
  key: BuiltinBookKey;
  name: string;
  description: string;
  words: BuiltinWord[];
};

export const BUILTIN_BOOKS: BuiltinBookDef[] = [
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

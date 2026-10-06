import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { BUILTIN_BOOKS } from '../../../data/builtinBooks';
import { LEVEL_SAMPLES, LevelKey } from '../../../data/levelTestWords';
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { boxLabel } from '../../../lib/srs';
import { Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { WordDraft, WordEditorModal } from '../../../components/WordEditorModal';

const LEVEL_ORDER: LevelKey[] = ['junior', 'senior', 'cet4', 'cet6', 'tem4', 'tem8', 'gre'];

function levelLabel(level: LevelKey): string {
  return LEVEL_SAMPLES.find((s) => s.level === level)?.label ?? '';
}

const LEVEL_COLORS: Record<LevelKey, string> = {
  junior: '#0EA5E9',
  senior: '#8B5CF6',
  cet4: '#F59E0B',
  cet6: '#EF4444',
  tem4: '#EC4899',
  tem8: '#14B8A6',
  gre: '#64748B',
};

type ExternalWord = { term: string; meaning: string; level: LevelKey };

export default function WordbookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, updateWord, deleteWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [query, setQuery] = useState('');
  const [inBook, setInBook] = useState<'in' | 'out'>('in');
  const [showEditor, setShowEditor] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);

  // 全局词汇中「不在本书」的单词（按最低级别去重）
  const externalWords = useMemo<ExternalWord[]>(() => {
    if (!book) return [];
    const bookTerms = new Set(book.words.map((w) => w.term.toLowerCase()));
    const map = new Map<string, ExternalWord>();
    for (const b of BUILTIN_BOOKS) {
      for (const w of b.words) {
        const key = w.t.toLowerCase();
        if (bookTerms.has(key)) continue;
        const existing = map.get(key);
        if (!existing || LEVEL_ORDER.indexOf(b.key) < LEVEL_ORDER.indexOf(existing.level)) {
          map.set(key, { term: w.t, meaning: w.m, level: b.key });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.term.localeCompare(b.term));
  }, [book]);

  const words = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    if (inBook === 'out') {
      if (!q) return externalWords;
      return externalWords.filter(
        (w) => w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q)
      );
    }
    const list = book.words;
    if (!q) return list;
    return list.filter(
      (w) =>
        w.term.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q)
    );
  }, [book, query, inBook, externalWords]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" description="它可能已被删除" />
      </View>
    );
  }

  const openEdit = (w: Word) => {
    setEditingWord(w);
    setShowEditor(true);
  };

  const handleSubmit = (draft: WordDraft) => {
    if (editingWord) {
      updateWord(book.id, editingWord.id, draft);
    }
    setShowEditor(false);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteWord(book.id, deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const renderWord = ({ item }: { item: Word }) => (
    <Pressable
      style={({ pressed }) => [styles.wordRow, pressed && { backgroundColor: colors.primaryLight }]}
      onPress={() => openEdit(item)}
      onLongPress={() => setDeleteTarget(item)}
    >
      <View style={[styles.boxBadge, { backgroundColor: `${boxColors[item.box] ?? colors.textLight}22` }]}>
        <View style={[styles.boxDot, { backgroundColor: boxColors[item.box] ?? colors.textLight }]} />
        <Text style={[styles.boxText, { color: boxColors[item.box] ?? colors.textLight }]}>
          {boxLabel(item.box)}
        </Text>
      </View>
      <View style={styles.wordBody}>
        <View style={styles.wordHead}>
          <Text style={styles.term}>{item.term}</Text>
          {item.phonetic ? <Text style={styles.phonetic}>{item.phonetic}</Text> : null}
        </View>
        <Text style={styles.meaning} numberOfLines={2}>
          {item.meaning}
        </Text>
        {item.derivatives && item.derivatives.length > 0 ? (
          <Text style={styles.derivatives} numberOfLines={2}>
            派生：{item.derivatives.map((d) => d.term).join(' · ')}
          </Text>
        ) : null}
        {item.example ? (
          <Text style={styles.example} numberOfLines={1}>
            {item.example}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
    </Pressable>
  );

  const renderExternal = ({ item }: { item: ExternalWord }) => {
    const lvColor = LEVEL_COLORS[item.level];
    return (
      <View style={styles.wordRow}>
        <View style={styles.wordBody}>
          <View style={styles.wordHead}>
            <Text style={styles.term}>{item.term}</Text>
            <View style={[styles.levelBadge, { backgroundColor: `${lvColor}1A` }]}>
              <Text style={[styles.levelBadgeText, { color: lvColor }]}>{levelLabel(item.level)}</Text>
            </View>
          </View>
          <Text style={styles.meaning} numberOfLines={2}>
            {item.meaning}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: book.name }} />

      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textLight} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索单词或释义"
          placeholderTextColor={colors.textLight}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textLight} style={{ marginRight: 12 }} />
          </Pressable>
        ) : null}
      </View>

      {/* 在单词本中 / 不在单词本中 */}
      <View style={styles.filterRow}>
        <Chip label="在单词本中" active={inBook === 'in'} onPress={() => setInBook('in')} />
        <Chip label="不在单词本中" active={inBook === 'out'} onPress={() => setInBook('out')} />
      </View>

      {/* 学习方式 */}
      <View style={styles.learnSection}>
        <Button
          label="AI 短文阅读"
          icon="sparkles"
          onPress={() => router.push(`/wordbook/${book.id}/reading`)}
        />
        <Button
          label="背诵（选对释义）"
          icon="albums"
          variant="outline"
          disabled={book.words.length === 0}
          onPress={() => router.push(`/wordbook/${book.id}/study`)}
        />
      </View>

      {/* 单词列表 */}
      {words.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={inBook === 'out' ? '没有匹配的单词' : '还没有单词'}
          description={
            inBook === 'out'
              ? '换个关键词或级别筛选试试'
              : '从内置词库添加词汇'
          }
        />
      ) : inBook === 'out' ? (
        <FlatList
          data={words as ExternalWord[]}
          keyExtractor={(w) => w.term.toLowerCase()}
          renderItem={renderExternal}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        />
      ) : (
        <FlatList
          data={words as Word[]}
          keyExtractor={(w) => w.id}
          renderItem={renderWord}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        />
      )}

      <WordEditorModal
        visible={showEditor}
        word={editingWord}
        onClose={() => setShowEditor(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="删除单词"
        message={`确定删除「${deleteTarget?.term ?? ''}」吗？`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    margin: spacing.md,
    marginBottom: 0,
    height: 44,
  },
  searchInput: { flex: 1, paddingHorizontal: 8, fontSize: 16, color: colors.text },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  learnSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
  },
  boxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: spacing.sm,
  },
  boxDot: { width: 8, height: 8, borderRadius: 4 },
  boxText: { fontSize: 11, fontWeight: '700' },
  wordBody: { flex: 1 },
  wordHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  term: { fontSize: 17, fontWeight: '700', color: colors.text },
  levelBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  levelBadgeText: { fontSize: 11, fontWeight: '600' },
  phonetic: { fontSize: 13, color: colors.textMuted },
  meaning: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  example: { fontSize: 12, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },
  derivatives: { fontSize: 12, color: colors.primary, marginTop: 4 },
});

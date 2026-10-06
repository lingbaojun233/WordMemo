import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
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
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { boxLabel, isGraduated, isMastered, isNew } from '../../../lib/srs';
import { Word } from '../../../lib/types';
import { EmptyState } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { WordHistoryModal } from '../../../components/WordHistoryModal';

type StageKey = 'all' | 'new' | 'learning' | 'mastered' | 'graduated';

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '新词' },
  { key: 'learning', label: '学习中' },
  { key: 'mastered', label: '已学会' },
  { key: 'graduated', label: '已毕业' },
];

function stageOf(w: Word): Exclude<StageKey, 'all'> {
  if (isNew(w)) return 'new';
  if (isGraduated(w)) return 'graduated';
  if (isMastered(w)) return 'mastered';
  return 'learning';
}

export default function WordbookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, deleteWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageKey>('all');
  const [historyWord, setHistoryWord] = useState<Word | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);

  const words = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    const list = book.words.filter((w) => (stage === 'all' ? true : stageOf(w) === stage));
    if (!q) return list;
    return list.filter(
      (w) =>
        w.term.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q)
    );
  }, [book, query, stage]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" description="它可能已被删除" />
      </View>
    );
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteWord(book.id, deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const renderWord = ({ item }: { item: Word }) => (
    <Pressable
      style={({ pressed }) => [styles.wordRow, pressed && { backgroundColor: colors.primaryLight }]}
      onPress={() => setHistoryWord(item)}
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
      <Ionicons name="time-outline" size={18} color={colors.textLight} />
    </Pressable>
  );

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

      {/* 学习程度筛选 */}
      <View style={styles.filterRow}>
        {STAGES.map((s) => (
          <Chip key={s.key} label={s.label} active={stage === s.key} onPress={() => setStage(s.key)} />
        ))}
      </View>

      {/* 单词列表 */}
      {words.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={query ? '没有匹配的单词' : '还没有单词'}
          description={query ? '换个关键词试试' : '从内置词库添加词汇'}
        />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(w) => w.id}
          renderItem={renderWord}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        />
      )}

      <WordHistoryModal
        visible={historyWord !== null}
        word={historyWord}
        onClose={() => setHistoryWord(null)}
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
  phonetic: { fontSize: 13, color: colors.textMuted },
  meaning: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  example: { fontSize: 12, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },
  derivatives: { fontSize: 12, color: colors.primary, marginTop: 4 },
});

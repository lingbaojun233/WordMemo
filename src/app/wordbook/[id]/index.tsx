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
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { boxLabel } from '../../../lib/srs';
import { Word } from '../../../lib/types';
import { Button, EmptyState } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { WordDraft, WordEditorModal } from '../../../components/WordEditorModal';
export default function WordbookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, addWord, updateWord, deleteWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [query, setQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);

  const words = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    const list = book.words;
    if (!q) return list;
    return list.filter(
      (w) =>
        w.term.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q)
    );
  }, [book, query]);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" description="它可能已被删除" />
      </View>
    );
  }

  const openAdd = () => {
    setEditingWord(null);
    setShowEditor(true);
  };

  const openEdit = (w: Word) => {
    setEditingWord(w);
    setShowEditor(true);
  };

  const handleSubmit = (draft: WordDraft) => {
    if (editingWord) {
      updateWord(book.id, editingWord.id, draft);
    } else {
      addWord(book.id, draft);
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

      {/* 单词管理 */}
      <View style={styles.manageSection}>
        <Text style={styles.sectionLabel}>单词管理</Text>
        <View style={styles.manageRow}>
          <Button
            label="导入"
            icon="download"
            variant="outline"
            onPress={() => router.push(`/wordbook/${book.id}/import`)}
            style={{ flex: 1 }}
          />
          <Button
            label="添加单词"
            icon="add"
            onPress={openAdd}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* 单词列表 */}
      {words.length === 0 ? (
        <EmptyState
          icon={book.words.length === 0 ? 'book-outline' : 'search-outline'}
          title={book.words.length === 0 ? '还没有单词' : '没有匹配结果'}
          description={
            book.words.length === 0
              ? '点击「添加」手动录入，或点击「导入」批量导入'
              : '换个关键词试试'
          }
          actionLabel={book.words.length === 0 ? '添加单词' : undefined}
          onAction={book.words.length === 0 ? openAdd : undefined}
        />
      ) : (
        <FlatList
          data={words}
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
  learnSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  manageSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textLight,
    marginBottom: spacing.sm,
  },
  manageRow: { flexDirection: 'row', gap: spacing.md },
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
  wordHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  term: { fontSize: 17, fontWeight: '700', color: colors.text },
  phonetic: { fontSize: 13, color: colors.textMuted },
  meaning: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  example: { fontSize: 12, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },
  derivatives: { fontSize: 12, color: colors.primary, marginTop: 4 },
});

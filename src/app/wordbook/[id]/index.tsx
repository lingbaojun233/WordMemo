import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { boxColors, colors, radius, spacing } from '../../../lib/theme';
import { Word } from '../../../lib/types';
import { EmptyState } from '../../../components/ui';
import { WordDraft, WordEditorModal } from '../../../components/WordEditorModal';
export default function WordbookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, addWord, updateWord, deleteWord } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [query, setQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);

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

  const confirmDelete = (w: Word) => {
    Alert.alert('删除单词', `确定删除「${w.term}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteWord(book.id, w.id) },
    ]);
  };

  const renderWord = ({ item }: { item: Word }) => (
    <Pressable
      style={({ pressed }) => [styles.wordRow, pressed && { backgroundColor: colors.primaryLight }]}
      onPress={() => openEdit(item)}
      onLongPress={() => confirmDelete(item)}
    >
      <View style={[styles.boxDot, { backgroundColor: boxColors[item.box] ?? colors.textLight }]} />
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

      {/* 操作按钮 */}
      <View style={styles.actions}>
        <ActionButton
          label="背诵"
          icon="albums"
          color={colors.primary}
          disabled={book.words.length === 0}
          onPress={() => router.push(`/wordbook/${book.id}/study`)}
        />
        <ActionButton
          label="测验"
          icon="create"
          color={colors.accent}
          disabled={book.words.length === 0}
          onPress={() => router.push(`/wordbook/${book.id}/quiz`)}
        />
        <ActionButton
          label="导入"
          icon="download"
          color={colors.success}
          onPress={() => router.push(`/wordbook/${book.id}/import`)}
        />
        <ActionButton label="添加" icon="add" color="#0EA5E9" onPress={openAdd} />
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
    </View>
  );
}

function ActionButton({
  label,
  icon,
  color,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: `${color}14` },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: 12,
    gap: 4,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
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
  boxDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  wordBody: { flex: 1 },
  wordHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  term: { fontSize: 17, fontWeight: '700', color: colors.text },
  phonetic: { fontSize: 13, color: colors.textMuted },
  meaning: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  example: { fontSize: 12, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },
  derivatives: { fontSize: 12, color: colors.primary, marginTop: 4 },
});

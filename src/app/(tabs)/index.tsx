import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../lib/AppContext';
import { dueWords, isMastered } from '../../lib/srs';
import { colors, radius, spacing } from '../../lib/theme';
import { Wordbook } from '../../lib/types';
import { Button, EmptyState } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export default function HomeScreen() {
  const { wordbooks, loaded, createBook, deleteBook } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Wordbook | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Wordbook | null>(null);

  const handleCreate = (name: string, description?: string) => {
    const id = createBook(name, description);
    setShowCreate(false);
    setEditing(null);
    router.push(`/wordbook/${id}`);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteBook(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const renderBook = ({ item }: { item: Wordbook }) => {
    const total = item.words.length;
    const due = dueWords(item.words).length;
    const mastered = item.words.filter(isMastered).length;
    const progress = total > 0 ? mastered / total : 0;

    return (
      <View style={styles.cardWrap}>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
          onPress={() => router.push(`/wordbook/${item.id}`)}
          onLongPress={() => setEditing(item)}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardIcon}>
              <Ionicons name="book" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cardMeta}>
                {total} 词 · 已掌握 {mastered}
                {total > 0 ? (due > 0 ? ` · 待复习 ${due}` : ' · 已完成') : ''}
              </Text>
            </View>
          </View>
          {total > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          ) : null}
        </Pressable>

        {/* 删除按钮（与卡片分离，避免与点击事件冲突） */}
        <Pressable
          style={({ pressed }) => [styles.trashBtn, pressed && { backgroundColor: '#FEE2E2' }]}
          onPress={() => setDeleteTarget(item)}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textLight} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loaded && wordbooks.length === 0 ? (
        <EmptyState
          icon="library-outline"
          title="还没有单词本"
          description="从内置词库添加四级/六级词汇，或创建自己的单词本"
        />
      ) : (
        <FlatList
          data={wordbooks}
          keyExtractor={(b) => b.id}
          renderItem={renderBook}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.hint}>点卡片进入 · 长按重命名 · 点垃圾桶删除</Text>
          }
        />
      )}

      {/* 底部操作区 */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Button
            label="内置词库"
            icon="library"
            variant="outline"
            onPress={() => router.push('/builtin')}
            style={{ flex: 1 }}
          />
          <Button
            label="新建"
            icon="add"
            onPress={() => setShowCreate(true)}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <CreateBookModal
        visible={showCreate || editing !== null}
        book={editing}
        onClose={() => {
          setShowCreate(false);
          setEditing(null);
        }}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="删除单词本"
        message={`确定删除「${deleteTarget?.name ?? ''}」吗？其中 ${deleteTarget?.words.length ?? 0} 个单词将一并删除，且无法恢复。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function CreateBookModal({
  visible,
  book,
  onClose,
  onCreate,
}: {
  visible: boolean;
  book: Wordbook | null;
  onClose: () => void;
  onCreate: (name: string, description?: string) => void;
}) {
  const { renameBook } = useApp();

  const submit = (name: string, desc: string) => {
    const n = name.trim();
    if (!n) return;
    if (book) {
      renameBook(book.id, n);
      onClose();
    } else {
      onCreate(n, desc.trim() || undefined);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <BookForm
            key={visible ? book?.id ?? 'new' : 'closed'}
            book={book}
            onSubmit={submit}
            onCancel={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

function BookForm({
  book,
  onSubmit,
  onCancel,
}: {
  book: Wordbook | null;
  onSubmit: (name: string, desc: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(book?.name ?? '');
  const [desc, setDesc] = useState(book?.description ?? '');

  return (
    <>
      <Text style={styles.modalTitle}>
        {book ? '重命名单词本' : '新建单词本'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="单词本名称（如：CET-4 核心词）"
        placeholderTextColor={colors.textLight}
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={40}
      />
      <TextInput
        style={[styles.input, styles.inputDesc]}
        placeholder="备注（可选）"
        placeholderTextColor={colors.textLight}
        value={desc}
        onChangeText={setDesc}
        maxLength={80}
      />
      <View style={styles.modalActions}>
        <Button label="取消" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label="确定"
          onPress={() => onSubmit(name, desc)}
          disabled={!name.trim()}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.md, paddingBottom: 120 },
  hint: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  cardWrap: { position: 'relative', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingRight: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  trashBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  footer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
    marginBottom: spacing.md,
  },
  inputDesc: { minHeight: 48, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md },
});

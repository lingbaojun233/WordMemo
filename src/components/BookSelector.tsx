import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { Wordbook } from '../lib/types';
import { Button } from './ui';

/**
 * 统一的「选择单词本」入口：点击展开弹窗列表。
 * 学习页与统计页共用同一交互，避免两处选择方式不一致。
 */
export function BookSelector({
  books,
  value,
  onChange,
  emptyHint = '还没有单词本，去内置词库添加',
  onEmptyPress,
}: {
  books: Wordbook[];
  value: Wordbook | null;
  onChange: (id: string) => void;
  emptyHint?: string;
  onEmptyPress?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (books.length === 0) {
    return (
      <Pressable style={styles.emptyBook} onPress={onEmptyPress}>
        <Ionicons name="library-outline" size={20} color={colors.primary} />
        <Text style={styles.emptyBookText}>{emptyHint}</Text>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable style={styles.selector} onPress={() => setOpen(true)}>
        <Ionicons name="book" size={18} color={colors.primary} />
        <Text style={styles.selectorText}>{value?.name ?? '选择单词本'}</Text>
        <Text style={styles.selectorCount}>{value ? `${value.words.length} 词` : ''}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textLight} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>选择单词本</Text>
            <ScrollView style={styles.modalList}>
              {books.map((b) => (
                <Pressable
                  key={b.id}
                  style={styles.bookRow}
                  onPress={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                >
                  <Ionicons name="book" size={18} color={colors.primary} />
                  <View style={styles.bookRowBody}>
                    <Text style={styles.bookRowName}>{b.name}</Text>
                    <Text style={styles.bookRowCount}>{b.words.length} 词</Text>
                  </View>
                  {b.id === value?.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={colors.textLight} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Button label="关闭" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  selectorText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  selectorCount: { fontSize: 12, color: colors.textMuted },
  emptyBook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emptyBookText: { flex: 1, fontSize: 14, color: colors.primaryDark },
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
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalList: { flexShrink: 1, marginBottom: spacing.md },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bookRowBody: { flex: 1 },
  bookRowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  bookRowCount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

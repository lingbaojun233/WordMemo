import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { Word } from '../lib/types';
import { Button } from './ui';

export type WordDraft = {
  term: string;
  meaning: string;
  phonetic?: string;
  example?: string;
};

export function WordEditorModal({
  visible,
  word,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  word: Word | null; // null 表示新增
  onClose: () => void;
  onSubmit: (draft: WordDraft) => void;
}) {
  // 用 key 让表单在每次打开时重新挂载，从而用最新初始值重置输入
  const formKey = visible ? word?.id ?? 'new' : 'closed';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <WordForm
            key={formKey}
            word={word}
            title={word ? '编辑单词' : '添加单词'}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </View>
      </View>
    </Modal>
  );
}

function WordForm({
  word,
  title,
  onCancel,
  onSubmit,
}: {
  word: Word | null;
  title: string;
  onCancel: () => void;
  onSubmit: (draft: WordDraft) => void;
}) {
  const [term, setTerm] = useState(word?.term ?? '');
  const [meaning, setMeaning] = useState(word?.meaning ?? '');
  const [phonetic, setPhonetic] = useState(word?.phonetic ?? '');
  const [example, setExample] = useState(word?.example ?? '');

  const submit = () => {
    const t = term.trim();
    const m = meaning.trim();
    if (!t || !m) return;
    onSubmit({
      term: t,
      meaning: m,
      phonetic: phonetic || undefined,
      example: example || undefined,
    });
  };

  return (
    <>
      <Text style={styles.title}>{title}</Text>

      <Text style={styles.label}>单词 *</Text>
      <TextInput
        style={styles.input}
        placeholder="apple"
        placeholderTextColor={colors.textLight}
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={!word}
      />

      <Text style={styles.label}>释义 *</Text>
      <TextInput
        style={styles.input}
        placeholder="n. 苹果"
        placeholderTextColor={colors.textLight}
        value={meaning}
        onChangeText={setMeaning}
      />

      <Text style={styles.label}>音标（可选）</Text>
      <TextInput
        style={styles.input}
        placeholder="/ˈæp.əl/"
        placeholderTextColor={colors.textLight}
        value={phonetic}
        onChangeText={setPhonetic}
        autoCapitalize="none"
      />

      <Text style={styles.label}>例句（可选）</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="An apple a day keeps the doctor away."
        placeholderTextColor={colors.textLight}
        value={example}
        onChangeText={setExample}
        multiline
      />

      <View style={styles.actions}>
        <Button label="取消" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label="保存"
          onPress={submit}
          disabled={!term.trim() || !meaning.trim()}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
    marginBottom: spacing.md,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
});

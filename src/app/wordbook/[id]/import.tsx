import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../../lib/AppContext';
import { parseImportText, ParsedEntry } from '../../../lib/parse';
import { colors, radius, spacing } from '../../../lib/theme';
import { Button, EmptyState } from '../../../components/ui';

const EXAMPLE = `apple 苹果
abandon 放弃；抛弃
ability, 能力
academic | 学术的
acquire 获得；习得`;

export default function ImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wordbooks, importWords } = useApp();
  const book = wordbooks.find((b) => b.id === id);

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null);
  const [imported, setImported] = useState<{ added: number; skipped: number } | null>(null);

  if (!book) {
    return (
      <View style={styles.container}>
        <EmptyState icon="alert-circle" title="单词本不存在" />
      </View>
    );
  }

  const handleParse = () => {
    setImported(null);
    setParsed(parseImportText(text));
  };

  const handleImport = () => {
    if (!parsed || parsed.length === 0) return;
    const res = importWords(book.id, parsed);
    setImported(res);
    setParsed(null);
    setText('');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.tip}>
        <Ionicons name="information-circle" size={18} color={colors.primary} />
        <Text style={styles.tipText}>
          每行一个单词，支持「单词+空格/逗号/竖线+释义」等格式，重复单词会自动跳过
        </Text>
      </View>

      <TextInput
        style={styles.textarea}
        placeholder="在此粘贴单词列表，例如：&#10;apple 苹果&#10;abandon 放弃"
        placeholderTextColor={colors.textLight}
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />

      <View style={styles.btnRow}>
        <Button
          label="填入示例"
          variant="ghost"
          icon="sparkles"
          onPress={() => {
            setImported(null);
            setParsed(null);
            setText(EXAMPLE);
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="识别"
          icon="scan"
          onPress={handleParse}
          disabled={!text.trim()}
          style={{ flex: 1 }}
        />
      </View>

      {/* 识别预览 */}
      {parsed !== null && (
        <View style={styles.previewCard}>
          <View style={styles.previewHead}>
            <Text style={styles.previewTitle}>
              识别到 {parsed.length} 个单词
            </Text>
            {parsed.length > 0 && (
              <Button
                label={`导入 ${parsed.length} 个`}
                onPress={handleImport}
                style={{ paddingVertical: 8 }}
                textStyle={{ fontSize: 14 }}
              />
            )}
          </View>
          {parsed.length === 0 ? (
            <Text style={styles.previewEmpty}>
              未能识别出单词，请检查格式
            </Text>
          ) : (
            <View style={styles.previewList}>
              {parsed.slice(0, 100).map((e, i) => (
                <View key={i} style={styles.previewRow}>
                  <Text style={styles.previewTerm}>{e.term}</Text>
                  <Text style={styles.previewMeaning} numberOfLines={1}>
                    {e.meaning || '（无释义）'}
                  </Text>
                </View>
              ))}
              {parsed.length > 100 && (
                <Text style={styles.previewMore}>
                  …共 {parsed.length} 条，仅预览前 100 条
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* 导入结果 */}
      {imported !== null && (
        <View style={[styles.previewCard, { borderColor: colors.success }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={[styles.previewTitle, { color: colors.success }]}>导入完成</Text>
          </View>
          <Text style={styles.resultText}>
            成功导入 {imported.added} 个单词
            {imported.skipped > 0 ? `，跳过 ${imported.skipped} 个重复单词` : ''}
          </Text>
          <Button
            label="返回单词本"
            icon="arrow-back"
            onPress={() => router.back()}
            style={{ marginTop: spacing.md }}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  tip: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  tipText: { flex: 1, fontSize: 13, color: colors.primaryDark, lineHeight: 19 },
  textarea: {
    minHeight: 180,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  previewEmpty: { fontSize: 14, color: colors.textMuted },
  previewList: { maxHeight: 320 },
  previewRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  previewTerm: { width: 120, fontSize: 15, fontWeight: '700', color: colors.text },
  previewMeaning: { flex: 1, fontSize: 14, color: colors.textMuted },
  previewMore: { fontSize: 13, color: colors.textLight, marginTop: 8, textAlign: 'center' },
  resultText: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
});

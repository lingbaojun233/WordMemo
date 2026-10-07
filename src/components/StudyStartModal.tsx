import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StudyMode, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { PickMode } from '../lib/types';
import { Button } from './ui';

const MODES: {
  key: StudyMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  enabled: boolean;
}[] = [
  { key: 'memorize_quiz', icon: 'albums', title: '先背诵后测验', enabled: true },
  { key: 'ai_reading', icon: 'newspaper', title: 'AI 写短文，阅读后测验', enabled: true },
  { key: 'ai_questions', icon: 'create', title: 'AI 出题，学习后答题', enabled: true },
];

const PICK_MODES: { key: PickMode; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'sequential', title: '按顺序选取单词', icon: 'list' },
  { key: 'random', title: '随机选取单词', icon: 'shuffle' },
];

/** 学习设置弹窗：学习方式 / 学习目标 / 选取方式（及阅读篇数） */
export function StudyStartModal({
  visible,
  settings,
  onClose,
  onChange,
}: {
  visible: boolean;
  settings: StudySettings;
  onClose: () => void;
  onChange: (patch: Partial<StudySettings>) => void;
}) {
  const mode = settings.studyMode ?? 'memorize_quiz';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>学习设置</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator>
            {/* 学习方式 */}
            <Text style={styles.sectionLabel}>学习方式</Text>
            <View style={styles.section}>
              {MODES.map((m, i) => (
                <View key={m.key}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    disabled={!m.enabled}
                    style={({ pressed }) => [styles.row, (pressed || !m.enabled) && { opacity: 0.6 }]}
                    onPress={() => onChange({ studyMode: m.key })}
                  >
                    <Ionicons name={m.icon} size={20} color={m.enabled ? colors.primary : colors.textLight} />
                    <Text style={[styles.rowText, !m.enabled && { color: colors.textLight }]}>{m.title}</Text>
                    {!m.enabled ? (
                      <Text style={styles.soonText}>敬请期待</Text>
                    ) : (
                      <Ionicons
                        name={mode === m.key ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={mode === m.key ? colors.primary : colors.textLight}
                      />
                    )}
                  </Pressable>
                </View>
              ))}
            </View>

            {/* 每篇短文新词数（仅 AI 阅读模式） */}
            {mode === 'ai_reading' ? (
              <>
                <Text style={styles.sectionLabel}>阅读设置</Text>
                <View style={styles.section}>
                  <Stepper
                    label="每篇短文新词数"
                    value={settings.wordsPerPassage}
                    min={3}
                    max={30}
                    onChange={(v) => onChange({ wordsPerPassage: v })}
                  />
                </View>
              </>
            ) : null}

            {/* 选取方式 */}
            <Text style={styles.sectionLabel}>选取方式</Text>
            <View style={styles.section}>
              {PICK_MODES.map((p, i) => (
                <View key={p.key}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <Pressable style={styles.row} onPress={() => onChange({ pickMode: p.key })}>
                    <Ionicons name={p.icon} size={20} color={colors.primary} />
                    <Text style={styles.rowText}>{p.title}</Text>
                    <Ionicons
                      name={settings.pickMode === p.key ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={settings.pickMode === p.key ? colors.primary : colors.textLight}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button label="完成" onPress={onClose} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text == null) return;
    setText(null);
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onChange(Math.max(min, value - step))}
          hitSlop={6}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <TextInput
          style={styles.stepInput}
          value={text ?? String(value)}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={4}
          scrollEnabled={false}
        />
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onChange(Math.min(max, value + step))}
          hitSlop={6}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
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
    maxHeight: '90%',
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  scroll: { flexShrink: 1 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  section: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  soonText: { fontSize: 12, color: colors.textLight },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    minWidth: 80,
    height: 36,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});

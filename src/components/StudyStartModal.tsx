import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  { key: 'ai_questions', icon: 'create', title: 'AI 出题，学习后答题', enabled: false },
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

            {/* 学习目标 */}
            <Text style={styles.sectionLabel}>学习目标</Text>
            <View style={styles.section}>
              <View style={styles.chipRow}>
                <Chip label="每日目标" active={settings.goalType === 'daily'} onPress={() => onChange({ goalType: 'daily' })} />
                <Chip label="截止日期" active={settings.goalType === 'deadline'} onPress={() => onChange({ goalType: 'deadline' })} />
              </View>
              {settings.goalType === 'daily' ? (
                <Stepper
                  label="每天新学单词数"
                  value={settings.dailyGoal}
                  min={5}
                  max={200}
                  step={5}
                  onChange={(v) => onChange({ dailyGoal: v })}
                />
              ) : (
                <Stepper
                  label="希望在几天内学完"
                  value={settings.deadlineDays}
                  min={7}
                  max={365}
                  step={7}
                  onChange={(v) => onChange({ deadlineDays: v })}
                />
              )}
            </View>

            {/* 阅读篇数（仅 AI 阅读模式） */}
            {mode === 'ai_reading' ? (
              <>
                <Text style={styles.sectionLabel}>阅读设置</Text>
                <View style={styles.section}>
                  <Stepper
                    label="阅读几篇短文"
                    value={settings.dailyPassages}
                    min={1}
                    max={10}
                    onChange={(v) => onChange({ dailyPassages: v })}
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
        <Text style={styles.stepValue}>{value}</Text>
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
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
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
  stepValue: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 32, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});

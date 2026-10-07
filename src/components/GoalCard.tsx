import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GoalPlan } from '../lib/goal';
import { GoalType, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { formatDate, startOfToday } from '../lib/utils';
import { Button } from './ui';

const DAY = 24 * 60 * 60 * 1000;

/**
 * 学习目标卡片：
 * - 首次：进入「制定学习目标」流程
 * - 之后：展示「截止日期 / 今日目标 / 连续学习 / 平均速度与预计完成日期」，并提供「修改」
 * 说明：截止日期是绝对日期，制定一次后每天自然倒计时；今日目标由「剩余词数 ÷ 剩余天数」自动上调。
 */
export function GoalCard({
  plan,
  settings,
  onChange,
  disabled,
}: {
  plan: GoalPlan;
  settings: StudySettings;
  onChange: (patch: Partial<StudySettings>) => void;
  disabled?: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftType, setDraftType] = useState<GoalType>(settings.goalType);
  const [draftDaily, setDraftDaily] = useState(settings.dailyGoal);
  const [draftDays, setDraftDays] = useState(settings.deadlineDays);

  const openEditor = () => {
    setDraftType(settings.goalType);
    setDraftDaily(settings.dailyGoal);
    setDraftDays(settings.deadlineDays);
    setEditorOpen(true);
  };

  const confirm = () => {
    const now = Date.now();
    const patch: Partial<StudySettings> = {
      goalType: draftType,
      dailyGoal: draftDaily,
      deadlineDays: draftDays,
      // 首次制定才记录起始时间；之后修改不改动，保证「过去平均」的统计窗口连续
      goalConfiguredAt: settings.goalConfiguredAt ?? now,
    };
    if (draftType === 'deadline') {
      patch.deadlineAt = startOfToday() + draftDays * DAY;
    }
    onChange(patch);
    setEditorOpen(false);
  };

  // ---------- 首次：制定目标 ----------
  if (!plan.configured) {
    return (
      <View style={styles.setupCard}>
        <View style={styles.setupHead}>
          <Ionicons name="flag" size={20} color={colors.primary} />
          <Text style={styles.setupTitle}>还没有学习目标</Text>
        </View>
        <Text style={styles.setupDesc}>
          制定一次目标后，App 会自动帮你算：每天该学多少、还剩几天、按目前速度什么时候能学完。
        </Text>
        <Button
          label="制定学习目标"
          icon="create"
          onPress={openEditor}
          disabled={disabled}
          style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
        />
        {renderEditor()}
      </View>
    );
  }

  // ---------- 已制定：展示 + 修改 ----------
  const finished = plan.remaining === 0;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="flag" size={18} color={colors.primary} />
        <Text style={styles.title}>学习目标</Text>
        <Pressable onPress={openEditor} hitSlop={8} style={styles.editBtn}>
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={styles.editText}>修改</Text>
        </Pressable>
      </View>

      {plan.mode === 'deadline' && plan.deadlineAt != null ? (
        <Text style={styles.line}>
          截止日期：
          <Text style={styles.strong}>{plan.deadlineText}</Text>
          {finished ? '（已完成）' : `（还剩 ${plan.remainingDays} 天）`}
        </Text>
      ) : (
        <Text style={styles.line}>
          每日目标：<Text style={styles.strong}>{plan.dailyGoal} 词/天</Text>
        </Text>
      )}

      <Text style={styles.line}>
        今日需学 <Text style={styles.strong}>{plan.dailyTarget}</Text> 词（今天已学 {plan.studiedToday}）
      </Text>

      {/* 连续学习 / 中断提示 */}
      {plan.streak > 0 ? (
        <Text style={styles.line}>
          已连续学习 <Text style={[styles.strong, { color: colors.success }]}>{plan.streak}</Text> 天
          {plan.missedDays > 0 ? `（最近一次学习在 ${plan.missedDays} 天前）` : '（今天已打卡）'}
        </Text>
      ) : plan.missedDays > 0 ? (
        <Text style={styles.line}>
          已 <Text style={[styles.strong, { color: colors.danger }]}>{plan.missedDays}</Text> 天没学习，
          上次学习 {formatDate(startOfToday() - plan.missedDays * DAY)}
        </Text>
      ) : (
        <Text style={styles.line}>还没有学习记录，今天开始打卡吧</Text>
      )}

      {/* 按过去平均速度推算 */}
      {finished ? (
        <Text style={[styles.line, { color: colors.success }]}>本词本已全部完成初学 🎉</Text>
      ) : plan.avgPerDay > 0 && plan.projectedDays != null && plan.projectedDate != null ? (
        <Text style={styles.line}>
          按过去平均每天 <Text style={styles.strong}>{plan.avgPerDay.toFixed(1)}</Text> 词，
          还需 <Text style={styles.strong}>{plan.projectedDays}</Text> 天，
          预计 <Text style={styles.strong}>{formatDate(plan.projectedDate)}</Text> 学完
        </Text>
      ) : (
        <Text style={styles.line}>
          还没有足够的学习记录，先学几天就能估算「按当前速度何时学完」
        </Text>
      )}

      {plan.mode === 'deadline' && plan.deadlineAt != null && !finished ? (
        <Text style={styles.hint}>
          提示：剩余天数每天自动递减，今日目标会相应上调（剩余 {plan.remaining} 词 ÷ {plan.remainingDays} 天）
        </Text>
      ) : null}

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${plan.progressPct}%` }]} />
      </View>
      <Text style={styles.progressText}>
        初学进度 {plan.totalWords - plan.remaining}/{plan.totalWords}（{plan.progressPct}%）
      </Text>

      {renderEditor()}
    </View>
  );

  function renderEditor() {
    return (
      <Modal
        visible={editorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {plan.configured ? '修改学习目标' : '制定学习目标'}
            </Text>

            <View style={styles.chipRow}>
              <GoalTypeChip
                label="每天学固定数量"
                active={draftType === 'daily'}
                onPress={() => setDraftType('daily')}
              />
              <GoalTypeChip
                label="在指定天数内学完"
                active={draftType === 'deadline'}
                onPress={() => setDraftType('deadline')}
              />
            </View>

            {draftType === 'daily' ? (
              <Stepper
                label="每天新学单词数"
                value={draftDaily}
                min={5}
                max={300}
                step={5}
                onChange={setDraftDaily}
              />
            ) : (
              <>
                <Stepper
                  label="希望在几天内完成初学"
                  value={draftDays}
                  min={1}
                  max={365}
                  step={1}
                  onChange={setDraftDays}
                />
                <Text style={styles.modalHint}>
                  截止日期：{formatDate(startOfToday() + draftDays * DAY)}
                  （每天自动倒计时，今日目标会随剩余天数上调）
                </Text>
              </>
            )}

            {plan.totalWords > 0 ? (
              <Text style={styles.modalHint}>
                当前词本还有 {plan.remaining} 词未完成初学；
                {draftType === 'deadline'
                  ? `照此目标每天约需学 ${Math.max(1, Math.ceil(plan.remaining / Math.max(1, draftDays)))} 词。`
                  : `照此速度约需 ${Math.max(1, Math.ceil(plan.remaining / Math.max(1, draftDaily)))} 天学完。`}
              </Text>
            ) : null}

            <Button
              label={plan.configured ? '保存修改' : '确认制定'}
              icon="checkmark"
              onPress={confirm}
              style={{ alignSelf: 'stretch', marginTop: spacing.md }}
            />
            <Button
              label="取消"
              variant="ghost"
              onPress={() => setEditorOpen(false)}
              style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
            />
          </View>
        </View>
      </Modal>
    );
  }
}

function GoalTypeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  line: { fontSize: 13, color: colors.textMuted, lineHeight: 21 },
  strong: { fontWeight: '800', color: colors.text },
  hint: { fontSize: 12, color: colors.textLight, marginTop: 2, lineHeight: 18 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  progressText: { fontSize: 12, color: colors.textLight, marginTop: 4 },
  setupCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  setupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setupTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  setupDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
  overlay: {
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
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  modalHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
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
    backgroundColor: colors.bg,
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
});

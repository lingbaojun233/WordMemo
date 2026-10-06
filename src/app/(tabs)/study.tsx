import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudyMode, StudySettings } from '../../lib/studySettings';
import { colors, radius, spacing } from '../../lib/theme';
import { PickMode } from '../../lib/types';
import { isDue, isNew } from '../../lib/srs';
import { Button } from '../../components/ui';

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

export default function StudyTab() {
  const { wordbooks } = useApp();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<StudySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveStudySettings(next);
  };

  const selectedBook = wordbooks.find((b) => b.id === selectedBookId) ?? null;

  // 到期且非新词的单词数量（已学过、到时间需要复习）
  const dueCount = useMemo(() => {
    if (!selectedBook) return 0;
    return selectedBook.words.filter((w) => !isNew(w) && isDue(w)).length;
  }, [selectedBook]);

  if (!settings) return <View style={styles.container} />;

  const mode = settings.studyMode ?? 'memorize_quiz';

  const start = () => {
    if (!selectedBook) return;
    if (mode === 'memorize_quiz') {
      router.push(`/wordbook/${selectedBook.id}/study`);
    } else if (mode === 'ai_reading') {
      router.push(`/wordbook/${selectedBook.id}/reading`);
    }
  };

  const startReview = () => {
    if (!selectedBook) return;
    router.push(`/wordbook/${selectedBook.id}/review`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 学习方式 */}
      <Text style={styles.sectionTitle}>学习方式</Text>
      <View style={styles.card}>
        {MODES.map((m, i) => (
          <View key={m.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              disabled={!m.enabled}
              style={({ pressed }) => [
                styles.modeRow,
                (pressed || !m.enabled) && { opacity: 0.6 },
              ]}
              onPress={() => update({ studyMode: m.key })}
            >
              <Ionicons
                name={m.icon}
                size={20}
                color={m.enabled ? colors.primary : colors.textLight}
              />
              <Text style={[styles.modeText, !m.enabled && { color: colors.textLight }]}>
                {m.title}
              </Text>
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

      {/* 今日学习量 */}
      <Text style={styles.sectionTitle}>今日学习量</Text>
      <View style={styles.card}>
        <Stepper
          label="今日学习单词数"
          value={settings.dailyWords}
          min={5}
          max={200}
          step={5}
          onChange={(v) => update({ dailyWords: v })}
        />
        {mode === 'ai_reading' ? (
          <>
            <View style={styles.divider} />
            <Stepper
              label="阅读几篇短文"
              value={settings.dailyPassages}
              min={1}
              max={10}
              onChange={(v) => update({ dailyPassages: v })}
            />
          </>
        ) : null}
      </View>

      {/* 选取方式 */}
      <Text style={styles.sectionTitle}>选取方式</Text>
      <View style={styles.card}>
        {PICK_MODES.map((p, i) => (
          <View key={p.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              style={styles.modeRow}
              onPress={() => update({ pickMode: p.key })}
            >
              <Ionicons name={p.icon} size={20} color={colors.primary} />
              <Text style={styles.modeText}>{p.title}</Text>
              <Ionicons
                name={settings.pickMode === p.key ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={settings.pickMode === p.key ? colors.primary : colors.textLight}
              />
            </Pressable>
          </View>
        ))}
      </View>

      {/* 选择单词本 */}
      <Text style={styles.sectionTitle}>选择单词本</Text>
      {wordbooks.length === 0 ? (
        <Pressable style={styles.emptyBook} onPress={() => router.push('/builtin')}>
          <Ionicons name="library-outline" size={20} color={colors.primary} />
          <Text style={styles.emptyBookText}>还没有单词本，去内置词库添加</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          {wordbooks.map((b, i) => (
            <View key={b.id}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                style={styles.modeRow}
                onPress={() => setSelectedBookId(b.id)}
              >
                <Ionicons name="book" size={18} color={colors.primary} />
                <View style={styles.bookBody}>
                  <Text style={styles.modeText}>{b.name}</Text>
                  <Text style={styles.bookCount}>{b.words.length} 词</Text>
                </View>
                <Ionicons
                  name={selectedBookId === b.id ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedBookId === b.id ? colors.primary : colors.textLight}
                />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* 开始学习 */}
      <Button
        label={mode === 'ai_reading' ? '开始阅读学习' : '开始背诵学习'}
        icon="play"
        onPress={start}
        disabled={!selectedBook || mode === 'ai_questions'}
        style={{ marginTop: spacing.lg }}
      />

      {/* 复习到期单词 */}
      <Button
        label={dueCount > 0 ? `复习到期单词（${dueCount} 个）` : '暂无到期单词'}
        icon="refresh"
        variant="outline"
        onPress={startReview}
        disabled={!selectedBook || dueCount === 0}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
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
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  modeText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  soonText: { fontSize: 12, color: colors.textLight },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
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
  stepValue: { fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 32, textAlign: 'center' },
  emptyBook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emptyBookText: { flex: 1, fontSize: 14, color: colors.primaryDark },
  bookBody: { flex: 1 },
  bookCount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

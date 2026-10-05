import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LEVEL_SAMPLES, LevelKey } from '../data/levelTestWords';
import { loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

type Item = { t: string; m: string; level: LevelKey; label: string };

const LEVEL_ORDER: LevelKey[] = ['junior', 'senior', 'cet4', 'cet6'];

export default function LevelTestScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<LevelKey | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const allItems = useMemo<Item[]>(() => {
    return LEVEL_SAMPLES.flatMap((s) =>
      s.words.slice(0, 8).map((w) => ({ ...w, level: s.level, label: s.label }))
    );
  }, []);

  const current = allItems[index];

  const answer = (known: boolean) => {
    const next = { ...answers, [current.t.toLowerCase()]: known };
    setAnswers(next);
    if (index + 1 < allItems.length) {
      setIndex(index + 1);
    } else {
      finish(next);
    }
  };

  const finish = async (finalAnswers: Record<string, boolean>) => {
    const level = estimateLevel(finalAnswers);
    setResult(level);
    if (settings) {
      await saveStudySettings({ ...settings, level });
    }
  };

  // ---------- 结果页 ----------
  if (result !== null) {
    const label = LEVEL_SAMPLES.find((s) => s.level === result)?.label ?? '';
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />
        <View style={styles.center}>
          <View style={styles.resultIcon}>
            <Ionicons name="trophy" size={40} color={colors.success} />
          </View>
          <Text style={styles.resultTitle}>测验完成</Text>
          <Text style={styles.resultDesc}>估测你的词汇水平为</Text>
          <Text style={styles.resultLevel}>{label}</Text>
          <Text style={styles.resultNote}>
            系统将根据该水平生成你能读懂的短文（文中除目标生词外，均使用该水平及以下的词汇）。
          </Text>
          <Button label="完成" icon="checkmark" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  if (!current) return null;

  const progress = (index + 1) / allItems.length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '词汇水平测验', headerBackTitle: '返回' }} />

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {index + 1} / {allItems.length}
        </Text>
      </View>

      <View style={styles.center}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{current.label}词汇</Text>
        </View>
        <Text style={styles.word}>{current.t}</Text>
        <Text style={styles.hint}>你认识这个单词吗？</Text>

        <View style={styles.btnRow}>
          <Button
            label="不认识"
            variant="outline"
            icon="close"
            onPress={() => answer(false)}
            style={{ flex: 1, borderColor: colors.danger }}
            textStyle={{ color: colors.danger }}
          />
          <Button label="认识" icon="checkmark" onPress={() => answer(true)} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

function estimateLevel(answers: Record<string, boolean>): LevelKey {
  // 统计每一级认识的词占比
  const rates: Record<LevelKey, number> = {
    junior: 0,
    senior: 0,
    cet4: 0,
    cet6: 0,
  };
  for (const s of LEVEL_SAMPLES) {
    const words = s.words.slice(0, 8);
    const known = words.filter((w) => answers[w.t.toLowerCase()]).length;
    rates[s.level] = known / words.length;
  }
  // 用户水平 = 认识率达到 60% 的最高层级
  let level: LevelKey = 'junior';
  for (const key of LEVEL_ORDER) {
    if (rates[key] >= 0.6) level = key;
  }
  return level;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  progressText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  levelBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  levelBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  word: { fontSize: 34, fontWeight: '800', color: colors.text },
  hint: { fontSize: 15, color: colors.textMuted },
  btnRow: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.md },
  resultIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  resultDesc: { fontSize: 15, color: colors.textMuted },
  resultLevel: { fontSize: 40, fontWeight: '800', color: colors.primary },
  resultNote: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});

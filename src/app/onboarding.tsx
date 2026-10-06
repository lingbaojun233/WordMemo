import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../lib/AppContext';
import { loadStudySettings, saveStudySettings, StudyMode } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

const MODES: {
  key: StudyMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  enabled: boolean;
}[] = [
  {
    key: 'memorize_quiz',
    icon: 'albums',
    title: '先背诵后测验',
    desc: '传统模式：先记忆单词释义，再选对释义提升等级',
    enabled: true,
  },
  {
    key: 'ai_reading',
    icon: 'newspaper',
    title: 'AI 写短文，阅读后测验',
    desc: 'AI 生成包含生词的主题短文，阅读后再做题',
    enabled: true,
  },
  {
    key: 'ai_questions',
    icon: 'create',
    title: 'AI 出题，学习后完成',
    desc: '敬请期待，后续版本推出',
    enabled: false,
  },
];

export default function OnboardingScreen() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState<'mode' | 'vocab'>('mode');

  const selectMode = async (mode: StudyMode) => {
    const settings = await loadStudySettings();
    await saveStudySettings({ ...settings, studyMode: mode });
    setStep('vocab');
  };

  const skipTest = async () => {
    // 完成引导后，onboardingDone 变为 true，守卫会自动重定向到首页
    await completeOnboarding();
  };

  const startTest = () => {
    router.push('/level-test?from=onboarding');
  };

  // ---------- 第一步：选择学习模式 ----------
  if (step === 'mode') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="book" size={36} color={colors.primary} />
          </View>
          <Text style={styles.title}>选择学习模式</Text>
          <Text style={styles.subtitle}>先选一个你喜欢的模式，后续可在「设置」中更改</Text>
        </View>

        <View style={styles.modeList}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              disabled={!m.enabled}
              style={({ pressed }) => [
                styles.modeCard,
                !m.enabled && styles.modeDisabled,
                pressed && m.enabled && { opacity: 0.85 },
              ]}
              onPress={() => selectMode(m.key)}
            >
              <View style={[styles.modeIcon, !m.enabled && { opacity: 0.4 }]}>
                <Ionicons name={m.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.modeBody}>
                <Text style={styles.modeTitle}>{m.title}</Text>
                <Text style={styles.modeDesc}>{m.desc}</Text>
              </View>
              {m.enabled ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              ) : (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonText}>敬请期待</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // ---------- 第二步：是否进行词汇量测试 ----------
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="school" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>是否进行词汇量测试？</Text>
        <Text style={styles.subtitle}>
          测试你的词汇水平，系统会为你推荐合适的单词本。不测试也可以，稍后可随时在「我的」中测试。
        </Text>
      </View>

      <View style={styles.vocabActions}>
        <Button label="开始词汇测试" icon="play" onPress={startTest} />
        <Button label="跳过，直接开始" variant="outline" onPress={skipTest} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  modeList: { gap: spacing.md },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modeDisabled: { opacity: 0.55 },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBody: { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modeDesc: { fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 19 },
  soonBadge: {
    backgroundColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  vocabActions: { gap: spacing.md },
});

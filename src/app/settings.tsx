import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LEVEL_SAMPLES } from '../data/levelTestWords';
import { loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<StudySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveStudySettings(next);
  };

  if (!settings) return <View style={styles.container} />;

  const levelLabel =
    LEVEL_SAMPLES.find((s) => s.level === settings.level)?.label ?? '未测验';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '学习设置', headerBackTitle: '返回' }} />

      <Text style={styles.sectionTitle}>学习模式</Text>
      <View style={styles.card}>
        <ModeRow
          title="先背诵后测验"
          desc="传统模式：先记忆单词释义，再选对释义提升等级"
          active={settings.studyMode === 'memorize_quiz'}
          onPress={() => update({ studyMode: 'memorize_quiz' })}
        />
        <View style={styles.divider} />
        <ModeRow
          title="AI 写短文，阅读后测验"
          desc="AI 生成包含生词的短文，阅读后再做题"
          active={settings.studyMode === 'ai_reading'}
          onPress={() => update({ studyMode: 'ai_reading' })}
        />
        <View style={styles.divider} />
        <ModeRow
          title="AI 出题，学习后完成"
          desc="敬请期待，后续版本推出"
          active={settings.studyMode === 'ai_questions'}
          disabled
          onPress={() => {}}
        />
      </View>

      <Text style={styles.sectionTitle}>AI 服务</Text>
      <View style={styles.card}>
        <Text style={styles.label}>API Key</Text>
        <TextInput
          style={styles.input}
          placeholder="sk-..."
          placeholderTextColor={colors.textLight}
          value={settings.aiApiKey}
          onChangeText={(v) => update({ aiApiKey: v.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.helper}>
          默认使用 DeepSeek，可改成其他 OpenAI 兼容服务的地址
        </Text>

        <Text style={styles.label}>接口地址</Text>
        <TextInput
          style={styles.input}
          placeholder="https://api.deepseek.com"
          placeholderTextColor={colors.textLight}
          value={settings.aiBaseUrl}
          onChangeText={(v) => update({ aiBaseUrl: v.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>模型</Text>
        <TextInput
          style={styles.input}
          placeholder="deepseek-chat"
          placeholderTextColor={colors.textLight}
          value={settings.aiModel}
          onChangeText={(v) => update({ aiModel: v.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Text style={styles.sectionTitle}>每日目标</Text>
      <View style={styles.card}>
        <StepperRow
          label="每天阅读几篇短文"
          value={settings.dailyPassages}
          min={1}
          max={10}
          onChange={(v) => update({ dailyPassages: v })}
        />
        <View style={styles.divider} />
        <StepperRow
          label="每天背诵多少单词"
          value={settings.dailyWords}
          min={5}
          max={200}
          step={5}
          onChange={(v) => update({ dailyWords: v })}
        />
        <Text style={styles.helper}>
          每篇短文包含约 {Math.max(1, Math.round(settings.dailyWords / settings.dailyPassages))} 个目标单词，
          单词越多文章越长
        </Text>
      </View>

      <Text style={styles.sectionTitle}>我的词汇水平</Text>
      <View style={styles.card}>
        <View style={styles.levelRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>当前估测水平</Text>
            <Text style={styles.levelValue}>{levelLabel}</Text>
          </View>
          <Pressable style={styles.testBtn} onPress={() => router.push('/level-test')}>
            <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
            <Text style={styles.testBtnText}>{settings.level ? '重新测验' : '开始测验'}</Text>
          </Pressable>
        </View>
        <Text style={styles.helper}>
          根据测验结果，生成短文时除目标生词外，只使用该水平及以下的词汇，保证你能读懂
        </Text>
      </View>
    </ScrollView>
  );
}

function ModeRow({
  title,
  desc,
  active,
  disabled,
  onPress,
}: {
  title: string;
  desc: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [styles.modeRow, (pressed || disabled) && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={styles.modeBody}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeDesc}>{desc}</Text>
      </View>
      <Ionicons
        name={active ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={active ? colors.primary : colors.textLight}
      />
    </Pressable>
  );
}

function StepperRow({
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
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
    marginBottom: spacing.xs,
  },
  helper: { fontSize: 12, color: colors.textLight, lineHeight: 18, marginTop: 6 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeBody: { flex: 1 },
  modeTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  modeDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center' },
  levelValue: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 2 },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  testBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});

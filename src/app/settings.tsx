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

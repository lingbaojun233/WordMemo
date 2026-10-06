import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LEVEL_SAMPLES } from '../data/levelTestWords';
import { getAiConfig, testAiConnection } from '../lib/ai';
import { AiProvider, loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';

const PROVIDERS: { key: AiProvider; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'online', label: '联网模型', icon: 'cloud-outline' },
  { key: 'local', label: '本地模型', icon: 'server-outline' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadStudySettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<StudySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveStudySettings(next);
    setTestResult(null);
  };

  const testConnection = async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testAiConnection(getAiConfig(settings));
      setTestResult(`连接成功：${reply}`);
    } catch (e) {
      setTestResult(`连接失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  if (!settings) return <View style={styles.container} />;

  const levelLabel =
    LEVEL_SAMPLES.find((s) => s.level === settings.level)?.label ?? '未测验';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '学习设置', headerBackTitle: '返回' }} />

      <Text style={styles.sectionTitle}>AI 服务</Text>
      <View style={styles.card}>
        {/* 来源切换 */}
        <View style={styles.providerRow}>
          {PROVIDERS.map((p) => (
            <Pressable
              key={p.key}
              style={[styles.providerBtn, settings.aiProvider === p.key && styles.providerBtnActive]}
              onPress={() => update({ aiProvider: p.key })}
            >
              <Ionicons
                name={p.icon}
                size={16}
                color={settings.aiProvider === p.key ? '#fff' : colors.textMuted}
              />
              <Text
                style={[styles.providerBtnText, settings.aiProvider === p.key && { color: '#fff' }]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {settings.aiProvider === 'online' ? (
          <>
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
          </>
        ) : (
          <>
            <Text style={styles.label}>本地接口地址</Text>
            <TextInput
              style={styles.input}
              placeholder="http://localhost:11434/v1"
              placeholderTextColor={colors.textLight}
              value={settings.localBaseUrl}
              onChangeText={(v) => update({ localBaseUrl: v.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>本地模型</Text>
            <TextInput
              style={styles.input}
              placeholder="qwen2.5:1.5b"
              placeholderTextColor={colors.textLight}
              value={settings.localModel}
              onChangeText={(v) => update({ localModel: v.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.helper}>
              需先在电脑上安装 Ollama（ollama.com）并运行服务，再执行
              `ollama pull qwen2.5:1.5b` 拉取模型。推荐：qwen2.5:1.5b（约 1GB，推荐）、
              qwen2.5:0.5b（约 400MB，最低配）、qwen2.5:3b（约 2GB，效果更好）。
              手机端请把地址改成电脑的局域网 IP（如 http://192.168.1.100:11434/v1）。
              网页版若提示跨域错误，请用 `OLLAMA_ORIGINS=* ollama serve` 启动服务。
            </Text>
          </>
        )}

        <Pressable
          style={styles.testConnBtn}
          onPress={testConnection}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="flash" size={16} color={colors.primary} />
          )}
          <Text style={styles.testConnText}>{testing ? '测试中…' : '测试连接'}</Text>
        </Pressable>
        {testResult ? (
          <Text
            style={[
              styles.helper,
              { color: testResult.startsWith('连接成功') ? colors.success : colors.danger },
            ]}
          >
            {testResult}
          </Text>
        ) : null}
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
  providerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  providerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  providerBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  providerBtnText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  testConnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  testConnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
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

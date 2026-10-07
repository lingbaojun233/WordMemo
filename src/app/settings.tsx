import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LEVEL_SAMPLES } from '../data/levelTestWords';
import { getAiConfig, testAiConnection } from '../lib/ai';
import {
  deleteDeviceModel,
  DeviceModelInfo,
  downloadDeviceModel,
  getDeviceModelInfo,
  isDeviceModelSupported,
  MODEL_PRESETS,
} from '../lib/localModel';
import { AiProvider, loadStudySettings, saveStudySettings, StudySettings } from '../lib/studySettings';
import { colors, radius, spacing } from '../lib/theme';

const PROVIDERS: { key: AiProvider; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'online', label: '联网模型', icon: 'cloud-outline' },
  { key: 'device', label: '设备端模型', icon: 'phone-portrait-outline' },
];

function formatMB(bytes?: number): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [modelInfo, setModelInfo] = useState<DeviceModelInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [modelMsg, setModelMsg] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // 每次获得焦点都重新读取，确保词汇测验后水平/词汇量刷新
  useFocusEffect(
    useCallback(() => {
      loadStudySettings().then(setSettings);
    }, [])
  );

  // 切到设备端模型时刷新模型下载状态
  const aiProvider = settings?.aiProvider;
  const deviceModelName = settings?.deviceModelName;
  useEffect(() => {
    if (aiProvider === 'device' && isDeviceModelSupported() && deviceModelName) {
      getDeviceModelInfo(deviceModelName).then(setModelInfo);
    }
  }, [aiProvider, deviceModelName]);

  const update = async (patch: Partial<StudySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveStudySettings(next);
    setTestResult(null);
    setModelMsg(null);
  };

  const testConnection = async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    try {
      if (settings.aiProvider === 'device') {
        const info = await getDeviceModelInfo(settings.deviceModelName);
        if (!info.downloaded) {
          setTestResult('模型尚未下载，请先点击「下载模型」');
          return;
        }
      }
      const reply = await testAiConnection(getAiConfig(settings));
      setTestResult(`连接成功：${reply}`);
    } catch (e) {
      setTestResult(`连接失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const downloadModel = async () => {
    if (!settings) return;
    setDownloading(true);
    setModelMsg(null);
    try {
      await downloadDeviceModel(settings.deviceModelUrl, settings.deviceModelName, (ratio) => {
        setDownloadProgress(Math.round(ratio * 100));
      });
      setModelInfo(await getDeviceModelInfo(settings.deviceModelName));
      setModelMsg('模型已就绪');
    } catch (e) {
      setModelMsg(`下载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const removeModel = async () => {
    if (!settings) return;
    await deleteDeviceModel(settings.deviceModelName);
    setModelInfo(await getDeviceModelInfo(settings.deviceModelName));
    setModelMsg(null);
  };

  if (!settings) return <View style={styles.container} />;

  const levelLabel =
    LEVEL_SAMPLES.find((s) => s.level === settings.level)?.label ?? '未测验';
  const selectedPreset = MODEL_PRESETS.find((p) => p.name === settings.deviceModelName);

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
        ) : !isDeviceModelSupported() ? (
          <Text style={styles.helper}>
            设备端模型仅支持手机 App（iOS / Android），网页版请切换到「联网模型」。
          </Text>
        ) : (
          <>
            <Text style={styles.label}>选择模型</Text>
            <Pressable style={styles.modelSelect} onPress={() => setShowModelPicker(true)}>
              <Text style={styles.modelSelectText}>
                {selectedPreset ? `${selectedPreset.label} · ${selectedPreset.size}` : '自定义模型'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textLight} />
            </Pressable>

            {selectedPreset ? (
              <Text style={styles.helper}>
                模型直接运行在手机本地，无需联网。点击下方「下载模型」即可安装，模型越大效果越好、占用越大。
              </Text>
            ) : (
              <>
                <Text style={styles.label}>模型名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="my-model"
                  placeholderTextColor={colors.textLight}
                  value={settings.deviceModelName}
                  onChangeText={(v) => update({ deviceModelName: v.trim() })}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.label}>模型下载地址（GGUF）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://huggingface.co/.../model.gguf"
                  placeholderTextColor={colors.textLight}
                  value={settings.deviceModelUrl}
                  onChangeText={(v) => update({ deviceModelUrl: v.trim() })}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            {/* 下载 / 状态 */}
            {downloading ? (
              <View style={styles.downloadBox}>
                <Text style={styles.helper}>下载中 {downloadProgress ?? 0}%</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${downloadProgress ?? 0}%` }]} />
                </View>
              </View>
            ) : modelInfo?.downloaded ? (
              <View style={styles.downloadBox}>
                <Text style={styles.helper}>
                  {`已就绪${modelInfo.size ? ` · ${formatMB(modelInfo.size)}` : ''}`}
                </Text>
                <Pressable style={styles.deleteBtn} onPress={removeModel}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={styles.deleteBtnText}>删除模型</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.downloadBtn} onPress={downloadModel}>
                <Ionicons name="download-outline" size={16} color={colors.primary} />
                <Text style={styles.downloadBtnText}>下载模型</Text>
              </Pressable>
            )}

            {modelMsg ? <Text style={styles.helper}>{modelMsg}</Text> : null}
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

      {/* 模型选择弹窗 */}
      <Modal
        visible={showModelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>选择要安装的模型</Text>
            {MODEL_PRESETS.map((p) => (
              <Pressable
                key={p.name}
                style={styles.modelRow}
                onPress={() => {
                  update({ deviceModelName: p.name, deviceModelUrl: p.url });
                  setShowModelPicker(false);
                }}
              >
                <View style={styles.modelRowBody}>
                  <Text style={styles.modelRowName}>{p.label}</Text>
                  <Text style={styles.modelRowSize}>{p.size}</Text>
                </View>
                {p.name === settings.deviceModelName ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
            <View style={styles.modalDivider} />
            <Pressable
              style={styles.modelRow}
              onPress={() => {
                update({ deviceModelName: '', deviceModelUrl: '' });
                setShowModelPicker(false);
              }}
            >
              <View style={styles.modelRowBody}>
                <Text style={styles.modelRowName}>自定义模型</Text>
                <Text style={styles.modelRowSize}>手动输入模型名与下载地址</Text>
              </View>
              {!selectedPreset ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              ) : null}
            </Pressable>
          </View>
        </View>
      </Modal>
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
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  downloadBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  downloadBox: { marginTop: spacing.sm },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 6,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: colors.danger },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: 8, backgroundColor: colors.primary },
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
  modelSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginBottom: spacing.xs,
  },
  modelSelectText: { fontSize: 15, color: colors.text },
  modalOverlay: {
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
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modelRowBody: { flex: 1 },
  modelRowName: { fontSize: 15, fontWeight: '600', color: colors.text },
  modelRowSize: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});

import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '../lib/theme';
import { useAiq } from '../lib/aiq/useAiq';
import { abMetrics, errorTypeStats, weakTerms } from '../lib/aiq/errorProfile';
import { adoptAdvice, layerCounts } from '../lib/aiq/promptLibrary';
import { decryptBackup, encryptBackup } from '../lib/aiq/store';
import { Advice, PROMPT_LAYER_LABEL, PromptLayer } from '../lib/aiq/types';

const LAYER_ORDER: PromptLayer[] = ['core', 'recent', 'temp'];

export default function AiTrainingScreen() {
  const { state, update, ready } = useAiq();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [payload, setPayload] = useState('');

  const stats = useMemo(() => (state ? errorTypeStats(state.attempts) : []), [state]);
  const weak = useMemo(() => (state ? weakTerms(state.attempts, 30).slice(0, 12) : []), [state]);
  const ab = useMemo(() => (state ? abMetrics(state) : null), [state]);
  const counts = useMemo(() => (state ? layerCounts(state.entries) : null), [state]);

  if (!ready || !state) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'AI 训练档案' }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const adopted = state.advice.filter((a) => a.adopted).length;
  const totalAttempts = state.attempts.length;
  const totalWrong = state.attempts.filter((a) => !a.isCorrect).length;
  const accuracy = totalAttempts ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0;

  const onAdopt = async (a: Advice) => {
    await update(adoptAdvice(state, a));
    setMsg(`已采纳「${a.title}」，下次出题将针对性训练`);
  };

  const onExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await encryptBackup(state, passphrase);
      setPayload(text);
      setMsg('已生成加密备份，可复制保存（核心数据始终留在本机）');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const next = await decryptBackup(payload, passphrase);
      await update(next);
      setMsg('导入成功，已覆盖本地数据');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'AI 训练档案' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>概览</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{totalAttempts}</Text>
              <Text style={styles.summaryLabel}>累计答题</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>{totalWrong}</Text>
              <Text style={styles.summaryLabel}>累计答错</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{accuracy}%</Text>
              <Text style={styles.summaryLabel}>正确率</Text>
            </View>
          </View>
          <Text style={styles.line}>
            A/B 分组：{state.group === 'A' ? 'A 组（采纳 AI 建议）' : 'B 组（常规复习）'}
          </Text>
          <Text style={styles.line}>
            提示词库：核心 {counts?.core ?? 0} · 近期 {counts?.recent ?? 0} · 临时 {counts?.temp ?? 0}
            （已采纳建议 {adopted}）
          </Text>
          <Text style={styles.line}>数据全部保存在本机，不上传</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>错误归因分布</Text>
          {stats.length === 0 ? (
            <Text style={styles.line}>暂无数据，先去做一轮 AI 出题吧</Text>
          ) : (
            stats.map((s) => (
              <View key={s.type} style={styles.barRow}>
                <Text style={styles.barLabel}>{s.label}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.min(100, (s.count / stats[0].count) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{s.count}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>高频错词</Text>
          {weak.length === 0 ? (
            <Text style={styles.line}>暂无错词记录</Text>
          ) : (
            <View style={styles.tags}>
              {weak.map((w) => (
                <View key={w.term} style={styles.tag}>
                  <Text style={styles.tagText}>{w.term}</Text>
                  <Text style={styles.tagCount}>×{w.wrong}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>分层提示词库</Text>
          <Text style={styles.line}>
            核心层每次必注入；近期层为最近 3 天错误；临时层仅当前会话生效。
          </Text>
          {LAYER_ORDER.map((layer) => {
            const items = state.entries.filter((e) => e.layer === layer);
            return (
              <View key={layer} style={styles.layerBlock}>
                <Text style={styles.layerTitle}>
                  {PROMPT_LAYER_LABEL[layer]}（{items.length}）
                </Text>
                {items.length === 0 ? (
                  <Text style={styles.line}>（空）</Text>
                ) : (
                  items.slice(0, 8).map((e) => (
                    <View key={e.id} style={styles.entry}>
                      <Text style={styles.entryText}>{e.text}</Text>
                      <Text style={styles.entryMeta}>
                        注入 {e.hitCount} 次 · 采纳后 对 {e.correctAfter} / 错 {e.wrongAfter}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>学习建议</Text>
          {state.advice.length === 0 ? (
            <Text style={styles.line}>完成一轮答题后会在这里生成建议</Text>
          ) : (
            state.advice.slice(0, 8).map((a) => (
              <View key={a.id} style={styles.adviceItem}>
                <View style={styles.adviceHead}>
                  <Text style={styles.adviceTitle}>{a.title}</Text>
                  {a.adopted ? (
                    <View style={styles.adoptedBadge}>
                      <Text style={styles.adoptedBadgeText}>已采纳</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.line}>{a.detail}</Text>
                <Text style={styles.promptText}>提示词：{a.promptText}</Text>
                {!a.adopted ? (
                  <Button
                    label="采纳"
                    icon="checkmark"
                    variant="outline"
                    onPress={() => void onAdopt(a)}
                    style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
                  />
                ) : null}
              </View>
            ))
          )}
        </View>

        {ab ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>A/B 验证（采纳建议 vs 常规）</Text>
            <Text style={styles.line}>
              实验组（已被建议覆盖）：{ab.treatment.attempts} 题，错误率{' '}
              {Math.round(ab.treatment.errorRate * 100)}%
            </Text>
            <Text style={styles.line}>
              对照组（未被覆盖）：{ab.control.attempts} 题，错误率{' '}
              {Math.round(ab.control.errorRate * 100)}%
            </Text>
            <View style={styles.divider} />
            <Text style={styles.line}>同一批知识点采纳前后对比：</Text>
            <Text style={styles.line}>
              采纳前：{ab.before.attempts} 题，错误率 {Math.round(ab.before.errorRate * 100)}%
            </Text>
            <Text style={styles.line}>
              采纳后：{ab.after.attempts} 题，错误率 {Math.round(ab.after.errorRate * 100)}%
            </Text>
            {ab.after.attempts > 0 && ab.before.attempts > 0 ? (
              <Text style={[styles.line, { color: colors.success, fontWeight: '700' }]}>
                {ab.after.errorRate < ab.before.errorRate
                  ? `错误率下降 ${Math.round((ab.before.errorRate - ab.after.errorRate) * 100)} 个百分点`
                  : '样本仍偏少，继续练习后趋势更准确'}
              </Text>
            ) : (
              <Text style={styles.line}>样本偏少，多练几轮后趋势更准确</Text>
            )}
          </View>
        ) : null}

        <Pressable style={styles.backupToggle} onPress={() => setShowBackup((v) => !v)}>
          <Ionicons name={showBackup ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          <Text style={styles.backupToggleText}>加密导出 / 导入备份</Text>
        </Pressable>

        {showBackup ? (
          <View style={styles.card}>
            <Text style={styles.line}>
              导出的备份会用你设置的密码加密（SHA-256 派生密钥流 + 完整性校验），
              不包含账号密码等敏感信息。
            </Text>
            <TextInput
              style={styles.input}
              placeholder="设置/输入备份密码"
              placeholderTextColor={colors.textLight}
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
            />
            <View style={styles.row}>
              <Button
                label={busy ? '处理中…' : '导出加密备份'}
                variant="outline"
                onPress={() => void onExport()}
                disabled={busy || passphrase.length === 0}
                style={{ flex: 1 }}
              />
              <Button
                label="导入备份"
                variant="outline"
                onPress={() => void onImport()}
                disabled={busy || passphrase.length === 0 || payload.length === 0}
                style={{ flex: 1 }}
              />
            </View>
            {payload ? (
              <TextInput
                style={[styles.input, styles.payload]}
                value={payload}
                onChangeText={setPayload}
                multiline
                selectTextOnFocus
              />
            ) : (
              <TextInput
                style={[styles.input, styles.payload]}
                placeholder="把备份内容粘贴到这里再点「导入备份」"
                placeholderTextColor={colors.textLight}
                value={payload}
                onChangeText={setPayload}
                multiline
              />
            )}
          </View>
        ) : null}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        {totalAttempts === 0 ? (
          <EmptyState
            icon="analytics-outline"
            title="还没有训练数据"
            description="去「学习」页选择 AI 出题模式开始一轮"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  line: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  summaryItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  barLabel: { width: 72, fontSize: 13, color: colors.text },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.danger },
  barValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: '#FEF2F2',
  },
  tagText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  tagCount: { fontSize: 11, color: colors.danger },
  layerBlock: { marginTop: spacing.sm },
  layerTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  entry: {
    marginTop: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  entryText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  entryMeta: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  adviceItem: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  adviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adviceTitle: { fontSize: 14, fontWeight: '800', color: colors.text, flex: 1 },
  adoptedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: '#D1FAE5',
  },
  adoptedBadgeText: { fontSize: 11, color: colors.success, fontWeight: '700' },
  promptText: { fontSize: 12, color: '#92400E', marginTop: 4, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  backupToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  backupToggleText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    marginTop: spacing.sm,
  },
  payload: { minHeight: 96, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  msg: { fontSize: 13, color: colors.primary, marginTop: spacing.sm, textAlign: 'center' },
});

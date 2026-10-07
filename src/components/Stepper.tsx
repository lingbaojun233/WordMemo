import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

/**
 * 数字步进输入框（各页面统一使用）。
 *
 * 布局要点：**标签独占一行**，`[ - ] [ 输入框 ] [ + ]` 另起一行。
 * 之前标签和 ± 挤在同一行，弹窗宽度不够时输入框被压窄、文字被裁切，
 * ± 按钮还会被挤出弹窗外。
 *
 * 交互要点：
 * - 固定高度时必须把垂直内边距清零，否则 Android 上文字会被裁掉半截；
 * - 点 ± 之前先把正在输入的草稿提交，避免「输入框显示草稿、实际值还是旧值」的不一致。
 */
export function Stepper({
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
  const [text, setText] = useState<string | null>(null);

  // 提交正在输入的草稿，返回提交后的数值（无草稿或非法时返回 null）
  const commit = (): number | null => {
    if (text == null) return null;
    const n = parseInt(text, 10);
    setText(null);
    if (Number.isNaN(n)) return null;
    const clamped = Math.max(min, Math.min(max, n));
    onChange(clamped);
    return clamped;
  };

  // 步进前先提交草稿，保证显示值与实际值始终一致
  const bump = (delta: number) => {
    const base = commit() ?? value;
    onChange(Math.max(min, Math.min(max, base + delta)));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          onPress={() => bump(-step)}
          hitSlop={6}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>

        <TextInput
          style={styles.input}
          value={text ?? String(value)}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={4}
          multiline={false}
          scrollEnabled={false}
          underlineColorAndroid="transparent"
        />

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          onPress={() => bump(step)}
          hitSlop={6}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, alignSelf: 'stretch' },
  label: { fontSize: 15, color: colors.text, fontWeight: '500' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    paddingVertical: 0, // Android：固定高度必须清零垂直内边距，否则文字被裁切
    includeFontPadding: false,
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

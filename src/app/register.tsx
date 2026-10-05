import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../lib/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from '../components/ui';

export default function RegisterScreen() {
  const { register } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await register(username, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
    }
    // 注册成功后由 Stack.Protected 自动跳转到主界面
  };

  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Ionicons name="person-add" size={40} color={colors.primary} />
            </View>
            <Text style={styles.title}>创建账号</Text>
            <Text style={styles.subtitle}>注册后进度将按账号独立保存</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>注册</Text>

            <Field
              icon="person-outline"
              placeholder="用户名（3-20 个字符）"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <Field
              icon="lock-closed-outline"
              placeholder="密码（至少 6 个字符）"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Field
              icon="shield-checkmark-outline"
              placeholder="确认密码"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label="注册"
              onPress={submit}
              loading={loading}
              style={{ marginTop: spacing.sm }}
            />

            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.switchText}>
                已有账号？<Text style={styles.switchLink}>返回登录</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({
  icon,
  ...props
}: {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={18} color={colors.textLight} />
      <TextInput
        style={styles.fieldInput}
        placeholderTextColor={colors.textLight}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 50,
    marginBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  fieldInput: { flex: 1, fontSize: 16, color: colors.text },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  switchText: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  switchLink: { color: colors.primary, fontWeight: '700' },
});

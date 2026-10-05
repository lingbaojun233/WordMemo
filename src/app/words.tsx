import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../lib/AppContext';
import { LEVEL_SAMPLES, LevelKey } from '../data/levelTestWords';
import { isMastered, isNew } from '../lib/srs';
import { colors, radius, spacing } from '../lib/theme';
import { Word } from '../lib/types';
import { EmptyState } from '../components/ui';

type StageFilter = 'all' | 'new' | 'learning' | 'mastered';
type LevelFilter = 'all' | 'none' | LevelKey;

const LEVEL_ORDER: LevelKey[] = ['elementary', 'junior', 'senior', 'cet4', 'cet6'];

function levelLabel(level?: LevelKey): string {
  return LEVEL_SAMPLES.find((s) => s.level === level)?.label ?? '未分级';
}

const LEVEL_COLORS: Record<LevelKey, string> = {
  elementary: '#22C55E',
  junior: '#0EA5E9',
  senior: '#8B5CF6',
  cet4: '#F59E0B',
  cet6: '#EF4444',
};

export default function AllWordsScreen() {
  const { wordbooks } = useApp();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('all');

  // 去重合并：同一单词只显示一条，取最佳进度 + 最低级别
  const allWords = useMemo<Word[]>(() => {
    const map = new Map<string, Word>();
    for (const b of wordbooks) {
      for (const w of b.words) {
        const key = w.term.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, w);
        } else {
          const existingIdx = existing.level ? LEVEL_ORDER.indexOf(existing.level) : 99;
          const wIdx = w.level ? LEVEL_ORDER.indexOf(w.level) : 99;
          map.set(key, {
            ...existing,
            box: Math.max(existing.box, w.box),
            dueAt: Math.min(existing.dueAt, w.dueAt),
            correctCount: Math.max(existing.correctCount, w.correctCount),
            level: wIdx < existingIdx ? w.level : existing.level,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.term.localeCompare(b.term));
  }, [wordbooks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allWords.filter((w) => {
      if (stage === 'new' && !isNew(w)) return false;
      if (stage === 'learning' && !(!isNew(w) && !isMastered(w))) return false;
      if (stage === 'mastered' && !isMastered(w)) return false;
      if (level === 'none' && w.level !== undefined) return false;
      if (level !== 'all' && level !== 'none' && w.level !== level) return false;
      if (q && !w.term.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allWords, stage, level, query]);

  const renderWord = ({ item }: { item: Word }) => {
    const stageText = isMastered(item) ? '已掌握' : isNew(item) ? '新词' : '学习中';
    const stageColor = isMastered(item) ? colors.success : isNew(item) ? colors.textLight : colors.warning;
    const lvColor = item.level ? LEVEL_COLORS[item.level] : colors.textLight;

    return (
      <View style={styles.wordRow}>
        <View style={styles.wordBody}>
          <Text style={styles.term}>{item.term}</Text>
          <Text style={styles.meaning} numberOfLines={1}>
            {item.meaning}
          </Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: `${lvColor}1A` }]}>
            <Text style={[styles.badgeText, { color: lvColor }]}>{levelLabel(item.level)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${stageColor}1A` }]}>
            <Text style={[styles.badgeText, { color: stageColor }]}>{stageText}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '全部单词', headerBackTitle: '返回' }} />

      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textLight} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索单词"
          placeholderTextColor={colors.textLight}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textLight} style={{ marginRight: 12 }} />
          </Pressable>
        ) : null}
      </View>

      {/* 阶段筛选 */}
      <View style={styles.filterRow}>
        <Chip label="全部" active={stage === 'all'} onPress={() => setStage('all')} />
        <Chip label="新词" active={stage === 'new'} onPress={() => setStage('new')} />
        <Chip label="学习中" active={stage === 'learning'} onPress={() => setStage('learning')} />
        <Chip label="已掌握" active={stage === 'mastered'} onPress={() => setStage('mastered')} />
      </View>

      {/* 级别筛选 */}
      <View style={styles.filterRow}>
        <Chip label="全部级别" active={level === 'all'} onPress={() => setLevel('all')} />
        {LEVEL_SAMPLES.map((s) => (
          <Chip
            key={s.level}
            label={s.label}
            active={level === s.level}
            onPress={() => setLevel(level === s.level ? 'all' : s.level)}
          />
        ))}
        <Chip label="未分级" active={level === 'none'} onPress={() => setLevel(level === 'none' ? 'all' : 'none')} />
      </View>

      <Text style={styles.count}>共 {filtered.length} 个单词</Text>

      {filtered.length === 0 ? (
        <EmptyState icon="search-outline" title="没有匹配的单词" description="换个筛选条件试试" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(w) => w.term.toLowerCase()}
          renderItem={renderWord}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    margin: spacing.md,
    marginBottom: spacing.sm,
    height: 44,
  },
  searchInput: { flex: 1, paddingHorizontal: 8, fontSize: 16, color: colors.text },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  count: { fontSize: 12, color: colors.textLight, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 40 },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  wordBody: { flex: 1 },
  term: { fontSize: 17, fontWeight: '700', color: colors.text },
  meaning: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  badges: { alignItems: 'flex-end', gap: 4 },
  badge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

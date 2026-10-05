import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../lib/AppContext';
import { BUILTIN_BOOKS } from '../data/builtinBooks';
import { LEVEL_SAMPLES, LevelKey } from '../data/levelTestWords';
import { boxColors, colors, radius, spacing } from '../lib/theme';
import { boxLabel, MAX_BOX } from '../lib/srs';
import { EmptyState } from '../components/ui';

type StageFilter = 'all' | 'new' | 'learning' | 'mastered';
type LevelFilter = 'all' | LevelKey;

const LEVEL_ORDER: LevelKey[] = ['elementary', 'junior', 'senior', 'cet4', 'cet6'];

function levelLabel(level: LevelKey): string {
  return LEVEL_SAMPLES.find((s) => s.level === level)?.label ?? '';
}

const LEVEL_COLORS: Record<LevelKey, string> = {
  elementary: '#22C55E',
  junior: '#0EA5E9',
  senior: '#8B5CF6',
  cet4: '#F59E0B',
  cet6: '#EF4444',
};

type Entry = {
  term: string;
  meaning: string;
  level: LevelKey;
  derivatives: { term: string; meaning: string }[];
};

export default function AllWordsScreen() {
  const { wordbooks, markKnown } = useApp();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 用户进度：词形 -> 最佳记忆盒层级
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of wordbooks) {
      for (const w of b.words) {
        const key = w.term.toLowerCase();
        const cur = map.get(key) ?? -1;
        if (w.box > cur) map.set(key, w.box);
      }
    }
    return map;
  }, [wordbooks]);

  // 六级以下全部内置词汇（去重，按最低级别；合并派生词）
  const entries = useMemo<Entry[]>(() => {
    const map = new Map<
      string,
      { term: string; meaning: string; level: LevelKey; derivatives: Map<string, string> }
    >();
    for (const book of BUILTIN_BOOKS) {
      for (const w of book.words) {
        const key = w.t.toLowerCase();
        let e = map.get(key);
        if (!e) {
          e = { term: w.t, meaning: w.m, level: book.key, derivatives: new Map() };
          map.set(key, e);
        } else if (LEVEL_ORDER.indexOf(book.key) < LEVEL_ORDER.indexOf(e.level)) {
          e.level = book.key;
        }
        if (w.d) {
          for (const d of w.d) {
            if (!e.derivatives.has(d.t.toLowerCase())) {
              e.derivatives.set(d.t.toLowerCase(), d.m);
            }
          }
        }
      }
    }
    return Array.from(map.values())
      .map((e) => ({
        term: e.term,
        meaning: e.meaning,
        level: e.level,
        derivatives: Array.from(e.derivatives.entries()).map(([t, m]) => ({ term: t, meaning: m })),
      }))
      .sort((a, b) => a.term.localeCompare(b.term));
  }, []);

  const boxOf = (term: string) => progressMap.get(term.toLowerCase()) ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const box = progressMap.get(e.term.toLowerCase()) ?? 0;
      if (stage === 'new' && box !== 0) return false;
      if (stage === 'learning' && !(box > 0 && box < MAX_BOX)) return false;
      if (stage === 'mastered' && box < MAX_BOX) return false;
      if (level !== 'all' && e.level !== level) return false;
      if (q && !e.term.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, stage, level, query, progressMap]);

  const toggleExpand = (term: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  const renderEntry = ({ item }: { item: Entry }) => {
    const hasDerivatives = item.derivatives.length > 0;
    const key = item.term.toLowerCase();
    const isOpen = expanded.has(key);
    return (
      <View>
        <WordRow
          term={item.term}
          meaning={item.meaning}
          level={item.level}
          box={boxOf(item.term)}
          hasDerivatives={hasDerivatives}
          expanded={isOpen}
          onToggle={hasDerivatives ? () => toggleExpand(key) : undefined}
          onKnow={() => markKnown(item.term, item.meaning, item.level)}
        />
        {hasDerivatives && isOpen ? (
          <View style={styles.derivList}>
            {item.derivatives.map((d) => (
              <WordRow
                key={d.term}
                term={d.term}
                meaning={d.meaning}
                level={item.level}
                box={boxOf(d.term)}
                isDerivative
                onKnow={() => markKnown(d.term, d.meaning, item.level)}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '全部单词', headerBackTitle: '返回' }} />

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

      <View style={styles.filterRow}>
        <Chip label="全部" active={stage === 'all'} onPress={() => setStage('all')} />
        <Chip label="新词" active={stage === 'new'} onPress={() => setStage('new')} />
        <Chip label="学习中" active={stage === 'learning'} onPress={() => setStage('learning')} />
        <Chip label="已学会" active={stage === 'mastered'} onPress={() => setStage('mastered')} />
      </View>

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
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendText}>点击「认识」提升记忆等级：</Text>
        {boxColors.map((c, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: c }]} />
            <Text style={styles.legendLabel}>{i === 0 ? '新词' : i === 7 ? '已学会' : String(i)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.count}>共 {filtered.length} 个词族</Text>

      {filtered.length === 0 ? (
        <EmptyState icon="search-outline" title="没有匹配的单词" description="换个筛选条件试试" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.term.toLowerCase()}
          renderItem={renderEntry}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function WordRow({
  term,
  meaning,
  level,
  box,
  hasDerivatives,
  expanded,
  isDerivative,
  onToggle,
  onKnow,
}: {
  term: string;
  meaning: string;
  level: LevelKey;
  box: number;
  hasDerivatives?: boolean;
  expanded?: boolean;
  isDerivative?: boolean;
  onToggle?: () => void;
  onKnow: () => void;
}) {
  const lvColor = LEVEL_COLORS[level];
  const boxColor = boxColors[Math.max(0, Math.min(boxColors.length - 1, box))];
  return (
    <View style={[styles.wordRow, isDerivative && styles.derivRow]}>
      {hasDerivatives ? (
        <Pressable onPress={onToggle} hitSlop={8} style={styles.chevron}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textMuted}
          />
        </Pressable>
      ) : isDerivative ? (
        <View style={styles.derivIndent} />
      ) : null}

      <View style={styles.wordBody}>
        <View style={styles.wordHead}>
          <Text style={[styles.term, isDerivative && styles.derivTerm]}>{term}</Text>
          <View style={[styles.levelBadge, { backgroundColor: `${lvColor}1A` }]}>
            <Text style={[styles.levelBadgeText, { color: lvColor }]}>{levelLabel(level)}</Text>
          </View>
        </View>
        <Text style={styles.meaning} numberOfLines={1}>{meaning}</Text>
      </View>

      <View style={[styles.boxBadge, { backgroundColor: `${boxColor}22` }]}>
        <View style={[styles.boxDot, { backgroundColor: boxColor }]} />
        <Text style={[styles.boxText, { color: boxColor }]}>{boxLabel(box)}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.knowBtn,
          box >= MAX_BOX && styles.knowBtnDone,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onKnow}
      >
        <Ionicons name={box >= MAX_BOX ? 'checkmark' : 'thumbs-up-outline'} size={14} color={box >= MAX_BOX ? colors.success : colors.primary} />
        <Text style={[styles.knowText, box >= MAX_BOX && { color: colors.success }]}>
          {box >= MAX_BOX ? '已学会' : '认识'}
        </Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
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
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  legendText: { fontSize: 12, color: colors.textMuted },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: colors.textMuted },
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
    gap: spacing.sm,
  },
  chevron: { paddingRight: 2 },
  derivIndent: { width: 18 },
  wordBody: { flex: 1 },
  wordHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  term: { fontSize: 16, fontWeight: '700', color: colors.text },
  derivTerm: { fontSize: 14, fontWeight: '600' },
  meaning: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  levelBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  levelBadgeText: { fontSize: 11, fontWeight: '600' },
  boxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  boxDot: { width: 8, height: 8, borderRadius: 4 },
  boxText: { fontSize: 11, fontWeight: '700' },
  knowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  knowBtnDone: { borderColor: colors.success },
  knowText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  derivList: {
    marginLeft: spacing.lg,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  derivRow: { marginBottom: spacing.xs },
});

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { loadAiqState, saveAiqState } from './store';
import { AiqState } from './types';

type Loaded = { userId: string; state: AiqState };

/**
 * AI 出题闭环数据（错题/提示词库/建议/AB/掌握度）的本地读写。
 * 全部落在本机 AsyncStorage，按用户隔离，不上传。
 */
export function useAiq() {
  const { currentUser } = useApp();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    loadAiqState(currentUser.id).then((s) => {
      if (alive) setLoaded({ userId: currentUser.id, state: s });
    });
    return () => {
      alive = false;
    };
  }, [currentUser]);

  // 派生：仅当已加载的数据属于当前用户时才算就绪（避免在 effect 里同步 setState）
  const state = currentUser && loaded?.userId === currentUser.id ? loaded.state : null;

  const update = useCallback(
    async (next: AiqState) => {
      if (!currentUser) return;
      setLoaded({ userId: currentUser.id, state: next });
      await saveAiqState(currentUser.id, next);
    },
    [currentUser]
  );

  return { state, update, ready: state !== null, userId: currentUser?.id ?? null };
}

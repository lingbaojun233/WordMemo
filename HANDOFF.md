# WordMemo 并行开发交接文档

> 用途：供「多个并行会话」分叉任务时读取的共享记忆。每个分叉会话开工前先读本文件，
> 严格按第 5 节的协作协议执行，避免会话之间互相覆盖。

---

## 0. 当前状态（快照）

- 仓库：`https://github.com/lingbaojun233/WordMemo`（main 分支），本地路径 `word-memo/`。
- 最新提交：`ae70069`（单词本筛选改学习程度、去掉预估词数、优化词族归并）。
- 工作区：干净（无未提交改动；`.tmp-vocab/` 已被 gitignore，是词库后处理脚本，不入库）。
- 验证基线：`npx tsc --noEmit` ✅、`npx expo lint` ✅、`npx expo export --platform web` ✅。

已实现（勿重复开发）：本地账户（SHA-256+盐）、7 级内置词库（初中/高中/四级/六级/专四/专八/GRE，
词族=基础词+派生词）、全部单词页、单词本详情、背诵学习（先背诵后测验）、AI 短文阅读学习、
水平测验（分级门控 80% 追加 + 词汇量估算）、引导流程、学习 Tab、设置/我的/统计页。

已知占位：学习模式第 3 种「AI 出题，学习后答题」目前是禁用占位（"敬请期待"）。

---

## 1. 技术栈

- Expo SDK 57、React Native 0.86、React 19、TypeScript strict（~6.0）、expo-router（文件路由）。
- 包管理器：**npm**（有 `package-lock.json`），用 `npx`，不要用 `bunx`。
- 持久化：`@react-native-async-storage/async-storage`；密码哈希：`expo-crypto`(SHA-256)。
- AI：DeepSeek/OpenAI 兼容，`https://api.deepseek.com/chat/completions`，模型 `deepseek-chat`，
  baseUrl/model/key 均可在设置页配置。
- 通用命令与 Expo 注意事项见同目录 `AGENTS.md`。

---

## 2. 代码地图与文件归属

路由都在 `src/app/`（每个文件是一个屏），非路由代码放 `src/lib`、`src/components`。

### 屏（`src/app/`）

| 文件 | 职责 | 建议归属分区 |
|---|---|---|
| `_layout.tsx` | 根 Stack + 认证/引导 guard | ★共享（改路由/守卫需协调） |
| `(tabs)/_layout.tsx` | Tab 布局（学习/单词本/统计/我的） | ★共享 |
| `(tabs)/study.tsx` | 学习入口：选模式+今日量+选词本+开始 | A |
| `(tabs)/index.tsx` | 单词本列表 Tab | C |
| `(tabs)/stats.tsx` | 统计 Tab | E |
| `(tabs)/profile.tsx` | 我的 Tab（词汇量卡片） | E |
| `wordbook/[id]/index.tsx` | 单词本详情（学习程度筛选+词表+编辑/删除） | C |
| `wordbook/[id]/study.tsx` | 背诵学习（先背诵后测验） | B |
| `wordbook/[id]/reading.tsx` | AI 短文阅读学习（生成→阅读→测验） | B |
| `words.tsx` | 全部单词（内置全量词，词族展开） | C |
| `builtin.tsx` | 内置词库添加页 | C |
| `level-test.tsx` | 水平测验（分级门控） | D |
| `onboarding.tsx` / `onboarding-recommend.tsx` | 引导流程 | A |
| `settings.tsx` | 设置（AI 服务 + 词汇水平） | E |
| `login.tsx` / `register.tsx` | 登录/注册 | E |

### 库与组件

| 文件 | 职责 | 改动风险 |
|---|---|---|
| `src/lib/AppContext.tsx` | 全局状态：认证、词本、进度（跨书按 term 共享）、reviewWord、addBuiltinBook | ★共享，改动影响所有屏 |
| `src/lib/types.ts` | `Word`/`ReviewResult` 等类型 | ★共享 |
| `src/lib/srs.ts` | Leitner 复习（BOX_INTERVALS、applyReview、isNew/isMastered/boxLabel） | ★共享 |
| `src/lib/studySettings.ts` | `StudySettings`（模式/AI/每日量/词汇水平/引导完成） | ★共享 |
| `src/lib/ai.ts` | DeepSeek 调用 `generatePassage`、`parsePassage` | ★共享（AI 相关任务需协调） |
| `src/lib/auth.ts` / `authStorage.ts` / `storage.ts` | 存储封装 | ★共享 |
| `src/lib/theme.ts` / `utils.ts` / `parse.ts` | 工具 | ★共享 |
| `src/components/ui.tsx` | `Button`/`EmptyState` 等通用组件 | ★共享 |
| `src/components/ConfirmDialog.tsx` | 确认弹窗（web 上 Alert 无效，统一用它） | ★共享 |
| `src/components/WordEditorModal.tsx` | 单词编辑弹窗 | ★共享 |
| `src/data/builtinBooks.ts` | 内置词本定义 `BuiltinBookKey` | 只读 |
| `src/data/levelTestWords.ts` | 水平测验词池 + `LevelKey`/`LEVEL_ORDER`/`VOCAB_SIZES` | 只读 |
| `src/data/{junior,senior,cet4,cet6,tem4,tem8,gre}.ts` | 词族数据（**自动生成，勿手改**） | 只读 |

---

## 3. 关键架构约定（分叉会话必读）

1. **进度跨书共享**：进度按 `term`（小写）跨词本共享，用 `AppContext` 的 `progressFor`/`reconcileProgress`；
   不要用词本内 word id 直接判定全局进度。
2. **词族**：词库数据里每个词是「基础词 + `d`(派生词数组)」；派生词不是独立 Word 条目，
   只在展示层展开。背词进度落在基础词上。
3. **Leitner**：box 0-7，`BOX_INTERVALS` 定义了复习间隔；`boxLabel` 输出「0-新词…7-已学会」；
   `isNew`(box0 且未复习) / `isMastered`(box≥7)。
4. **学习设置**：`studySettings` 里 `studyMode` 是用户偏好（`memorize_quiz`/`ai_reading`/`ai_questions`）；
   `ai_questions` 目前未实现。`study.tsx` 是统一入口，背诵/阅读页仍可被独立路由访问。
5. **路由守卫**：`_layout.tsx` 用 `Stack.Protected guard={onboardingDone}` 控制引导/登录；
   新增路由后必须重新生成 typed routes（见第 7 节）。
6. **web 兼容**：`Alert.alert` 在 react-native-web 是 no-op，交互确认一律用 `ConfirmDialog`。
7. **词库数据是生成产物**：不要手改 `src/data/*.ts` 的 `{junior..gre}.ts`；
   词族后处理脚本在 `.tmp-vocab/`（已被 gitignore，仅本机）。

---

## 4. 并行分区建议（按功能域，非重叠文件所有权）

| 分区 | 主题 | 独占文件（只改这些） | 需读取的共享文件 |
|---|---|---|---|
| A | 学习入口/引导 | `(tabs)/study.tsx`、`onboarding.tsx`、`onboarding-recommend.tsx` | studySettings、AppContext |
| B | 学习执行页 | `wordbook/[id]/study.tsx`、`wordbook/[id]/reading.tsx` | srs、ai、AppContext |
| C | 单词本/词汇浏览 | `wordbook/[id]/index.tsx`、`(tabs)/index.tsx`、`words.tsx`、`builtin.tsx` | builtinBooks、levelTestWords、AppContext |
| D | 水平测验 | `level-test.tsx` | levelTestWords |
| E | 账户/设置/我的/统计 | `login.tsx`、`register.tsx`、`settings.tsx`、`(tabs)/profile.tsx`、`(tabs)/stats.tsx` | auth、studySettings、AppContext |
| F | AI 出题新模式（较大，跨域） | 新建 `wordbook/[id]/questions.tsx` + 改 `ai.ts`、`study.tsx`、`onboarding.tsx`、`studySettings.ts` | — |

> 规则：**F 分区与 A/B 有文件交集，安排 F 时不能与 A、B 并行**；其余 A–E 两两文件不重叠，可并行。
> 若某任务必须改 ★共享文件，则该任务单独成串行批次，不要与其它并行。

---

## 5. 并行协作协议（防冲突，最重要）

1. **文件非重叠是第一道防线**：每个分叉会话只写自己分区列出的文件；需要改共享文件前，先停下协调。
2. **分叉会话不要执行 `git commit` / `git push`**：所有会话共享同一个工作目录和同一个 git 仓库，
   并发 commit 会在 index/HEAD 上互相打架。分叉会话只做「改文件 + 本地验证」。
3. **由单一「整合会话」统一收口**：合并所有分叉的改动 → 跑完整验证（tsc/lint/export）→ 一次 commit → push。
   推送到 `main` 前先 `git pull --rebase`（或仅在整合会话里做）。
4. 若确需各会话独立提交，改为「每个会话一个 feature 分支 + 各自独立 clone/checkout」，
   不要在同一份工作树里并发切分支。
5. 验证命令是只读/幂等的（`tsc --noEmit`、`expo lint`），可并发跑；`expo export` 写 `dist/`（gitignored），
   并发时可能互相覆盖产物，但无害——最终由整合会话再导一次即可。

---

## 6. 每个会话的标准验证 + 收口流程

```bash
cd word-memo
npx tsc --noEmit          # 类型检查，必须 0 退出
npx expo lint             # lint，必须 0 退出
npx expo export --platform web   # 打包验证
```

整合会话收口：
```bash
git add -A
git commit -m "<描述>"
git push origin main
```

---

## 7. 已知坑位（务必记住）

- **新路由 typed routes**：`.expo/types/router.d.ts` 只能靠 `npx expo start` 重新生成，
  `expo export` **不会**生成它；新增路由后 tsc 报路由类型错误时，先跑 `expo start` 一次。
- **PowerShell 的 `[id]` 是通配符**：对 `wordbook/[id]/...` 这类路径用 `-LiteralPath`（如 `Remove-Item -LiteralPath ...`）。
- **每段 pwsh 都要刷新 git PATH**，否则报「git 无法识别」：
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path`
- **react-hooks lint 规则严格**：禁止在 useEffect 里 setState 派生状态（改在 render 期派生）、
  禁止在 render 期写 `stateRef.current`（移到 useEffect）、`useMemo` 依赖要完整（内联 helper）。
- **`Alert.alert` web 无效**：统一用 `ConfirmDialog`。
- **词库数据勿手改**：改词族/词池走 `.tmp-vocab/` 脚本；词池若重采样会影响 `levelTestWords.ts`。

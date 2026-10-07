# WordMemo

一个专注于**英语单词背诵**的移动端 App（React Native + Expo + TypeScript）。既支持本地离线背诵，也支持 AI 辅助出题、生成短文与个性化训练。

## 功能

### 账号与词库

- 🔐 **本地账号系统**：注册 / 登录，密码经加盐哈希后保存在本地，不同账号的进度完全隔离
- 📚 **内置词库**：一键添加官方大纲词汇，内置 **初中 / 高中 / 四级 / 六级 / 专四 / 专八 / GRE** 七个词库，按**词族**组织（基础词 + 派生词一起背，如 `able → ability / disable`）
- 🔗 **跨词库进度打通**：同一单词在不同词库中共享学习进度
- 🗂️ **全部单词**：平铺浏览，可按级别 / 是否在单词本中筛选；颜色旁有数字等级提示（如 `7-已学会`）

### 学习模式

- 🎴 **背诵模式**：先背单词释义，再选释义 / 拼写测验，**5 词一组**
- 📰 **AI 写短文**：根据要背的单词生成主题短文，阅读中点击生词查看释义，读完后做选择题测试
- 🤖 **AI 出题（导学模式）**：AI 自动选词、自动出题——展示单词 → 5 词一组 → 简单题热身（选释义/拼写）→ 表现好再上难题（翻译/完形/阅读/语法）→ 评估薄弱点并为下次生成提示词与难度策略
- 🧪 **自由出题**：自定义题型 / 题量 / 出题顺序，可选**限时答题**（15/20/30 秒）；多空格语法填空自动拆成多个输入框，提交时逐空判对错
- 🔁 **复习**：按记忆算法安排到期单词复习

### AI 服务（设置一次，处处生效）

- 在「学习设置」中**一次性**选择 AI 来源：
  - **设备端模型**：llama.cpp 本地推理（llama.rn），**离线免费**，可选 0.5B / 1.5B / 3B，模型下载到手机本地
  - **联网模型**：OpenAI 兼容接口（默认 DeepSeek），需填 API Key
- 设置完成后，**AI 出题、AI 写短文、自由出题** 等所有 AI 功能统一使用该 AI，无需重复配置

### AI 训练档案

- 答题错误自动归因、分层提示词库（核心 / 近期 / 临时）、A/B 验证、AI 学习建议采纳
- 全部本地化存储，支持**加密导出 / 导入备份**

### 其它

- 🎯 **词汇水平测验**：分级门控测试，估测词汇量与级别，结果用于 AI 出题与短文生成的难度控制
- 📊 **统计**：每日学习历史（点开查看当天详情）、AI 训练档案、各阶段学习情况
- 🎯 **学习目标**：每日目标或截止日期目标，自动计算每天应学单词数
- 💾 **本地离线存储**：账号与进度保存在设备本地（AsyncStorage），不接入第三方平台

## 技术栈

- React Native 0.86 + Expo SDK 57
- Expo Router（文件式路由）
- TypeScript（strict）
- AsyncStorage 本地存储
- llama.rn（设备端 GGUF 模型推理，仅 iOS / Android）
- expo-crypto / expo-file-system / @expo/vector-icons

## 目录结构

```
src/
  app/                         # 路由（每个文件一个页面）
    _layout.tsx                # 根布局（Stack + 全局 Provider）
    (tabs)/                    # 底部 Tab
      index.tsx                # 首页（单词本列表）
      study.tsx                # 学习（模式入口 / 目标 / 复习）
      stats.tsx                # 统计（每日历史 + AI 训练档案入口）
      profile.tsx              # 我的（含学习设置入口）
    login.tsx / register.tsx   # 登录 / 注册
    onboarding.tsx             # 引导：选学习模式 + 词汇测验
    onboarding-recommend.tsx   # 引导：推荐词库 + 选 AI 服务
    settings.tsx               # 学习设置（AI 服务 + 词汇水平）
    builtin.tsx                # 内置词库
    words.tsx                  # 全部单词
    level-test.tsx             # 词汇水平测验
    ai-training.tsx            # AI 训练档案
    wordbook/[id]/
      index.tsx                # 单词本详情
      study.tsx                # 背诵（先背后测）
      review.tsx               # 复习
      reading.tsx              # AI 写短文，阅读后测验
      questions.tsx            # AI 出题（导学模式）
      questions-free.tsx       # 自由出题（自定义题型）
      progress.tsx             # 各阶段学习情况
  components/                  # 复用组件
  lib/
    AppContext.tsx             # 全局状态（Context + Reducer + 持久化）
    srs.ts                     # 间隔重复（Leitner）算法
    ai.ts                      # AI 配置解析与联网/设备端分发
    localModel.ts              # llama.rn 设备端模型封装（下载/校验/推理）
    studySettings.ts           # 学习设置
    goal.ts / quiz.ts / readingSession.ts / auth.ts / storage.ts / ...
    aiq/                       # AI 出题闭环
      types.ts / store.ts / useAiq.ts
      session.ts / aiClient.ts / localGen.ts
      errorProfile.ts / promptLibrary.ts
      flow.ts / blanks.ts
```

## 运行

```bash
# 安装依赖
npm install

# 启动开发服务器（手机装 Expo Go 扫码预览）
npx expo start

# 浏览器预览（Web）
npx expo start --web

# 类型检查 / 代码检查
npx tsc --noEmit
npx expo lint
```

> 真机预览：手机安装 [Expo Go](https://expo.dev/go)，与电脑连同一 Wi-Fi，扫码即可。
>
> 设备端 AI（llama.rn 为原生模块）在 Expo Go 中不可用，需开发构建：`npx expo run:android` / `npx expo run:ios`。

## 记忆算法

采用简化版 Leitner 记忆盒（0–7 层，8 层为「已毕业」）：

| 层级 | 间隔 |
|------|------|
| 0 | 新词（立即复习）|
| 1 | 10 分钟 |
| 2 | 1 天 |
| 3 | 2 天 |
| 4 | 4 天 |
| 5 | 7 天 |
| 6 | 15 天 |
| 7 | 30 天（已学会）|
| 8 | 已毕业（不再复习）|

- **答对（good）**：升一层；7 层再答对则毕业到 8 层
- **答错 / 不熟（again / hard）**：保持当前层（不降级），按当前层重新安排复习时间

## AI 出题的掌握度升级规则

一个单词在本轮 AI 出题中满足以下条件才升级记忆盒（+1）：

- 至少被考到一次，且**全部答对**（0 次答错）

只要有一次答错（含选「不会」或超时），该单词保持原等级不升级。

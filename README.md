# 背单词 · WordMemo

一个专注于**英语单词背诵**的移动端 App（React Native + Expo + TypeScript）。

## 功能

- 🔐 **本地账号系统**：注册 / 登录，密码经 SHA-256 加盐哈希后保存在本地；不同账号的背诵进度完全隔离
- 🔗 **跨词库进度打通**：同一个单词在不同词库中共享学习进度——在初中词库里学会的单词，在四级/六级词库中会自动标记为「已学」
- 📚 **内置词库**：一键添加官方大纲词汇，已内置 **小学 / 初中 / 高中 / 四级 / 六级** 五个词库，并按**词族**组织（基础词 + 派生词一起背，如 `able → ability / disable`）
- 🗂️ **全部单词**：查看所有单词（自动去重合并），可按**背诵阶段**（新词/学习中/已掌握）和**级别**（小学/初中/高中/四级/六级）筛选
- 🤖 **AI 短文阅读**：接入 AI 模型，根据要背的单词生成主题短文；阅读时可点击生词查看释义，读完后做测试；可设置每天读几篇、背多少词
- 🎯 **词汇水平测验**：从小学到六级每级随机 20 词、共约 100 题，四选一选择题（答对才算认识），据此估测水平并生成可读短文
- 📚 **单词本管理**：创建、重命名、删除单词本；长按单词本卡片可编辑
- ⬇️ **自定义批量导入**：粘贴文本即可导入，支持 `单词 释义`、`单词,释义`、`单词|释义`、`单词=释义` 等多种格式，自动去重
- 🎴 **背诵（闪卡）**：基于 Leitner 间隔重复算法安排复习，翻面查看释义，按「认识 / 模糊 / 不认识」评分
- ✍️ **拼写测验**：看释义拼写单词，自动判分
- 📊 **进度统计**：总词数、已掌握、待复习、正确率，以及各单词本进度
- 🔤 **手动添加/编辑单词**：支持单词、释义、音标、例句
- 💾 **本地离线存储**：账号与进度均保存在设备本地（AsyncStorage），无需联网、不接入任何第三方平台

## 技术栈

- React Native 0.86 + Expo SDK 57
- Expo Router（文件式路由）
- TypeScript（strict）
- AsyncStorage 本地存储
- @expo/vector-icons 图标

## 目录结构

```
src/
  app/                    # 路由（每个文件是一个页面）
    _layout.tsx           # 根布局（Stack + 全局 Provider）
    (tabs)/               # 底部 Tab
      index.tsx           # 单词本列表（首页）
      stats.tsx           # 统计
    wordbook/[id]/
      index.tsx           # 单词本详情（单词列表 + 搜索）
      study.tsx           # 背诵/闪卡
      quiz.tsx            # 拼写测验
      import.tsx          # 批量导入
  components/             # 复用组件
    ui.tsx                # Button / EmptyState
    WordEditorModal.tsx   # 单词添加/编辑弹窗
  lib/
    AppContext.tsx        # 全局状态（Context + Reducer + 持久化）
    storage.ts            # AsyncStorage 封装
    srs.ts                # 间隔重复（Leitner）算法
    parse.ts              # 导入文本解析
    sampleWords.ts        # 示例词库
    theme.ts              # 颜色/间距/圆角
    types.ts              # 类型定义
    utils.ts              # 工具函数
```

## 运行

```bash
# 安装依赖（首次）
npm install

# 启动开发服务器（手机装 Expo Go 扫码即可预览）
npx expo start

# 在浏览器中预览（Web）
npx expo start --web

# 类型检查 / 代码检查
npx tsc --noEmit
npx expo lint
```

> 真机预览：手机安装 [Expo Go](https://expo.dev/go)，与电脑连同一 Wi-Fi，用 Expo Go 扫描 `npx expo start` 输出的二维码。

## 记忆算法

采用简化版 Leitner 记忆盒（0–7 层），复习间隔逐层递增：

| 层级 | 间隔 |
|------|------|
| 1 | 10 分钟 |
| 2 | 1 天 |
| 3 | 2 天 |
| 4 | 4 天 |
| 5 | 7 天 |
| 6 | 15 天 |
| 7 | 30 天（掌握）|

- **认识**：升一层
- **模糊**：保持当前层
- **不认识**：降一层，10 分钟后再次复习

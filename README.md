[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-green.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)](https://github.com/Gust-feng/Rapid-Learning)
[![Version](https://img.shields.io/badge/version-5.2.0-brightgreen)](https://github.com/Gust-feng/Rapid-Learning/releases)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Gust-feng/Rapid-Learning/pulls)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/Gust-feng/Rapid-Learning/graphs/commit-activity)

# 使用说明
##  特性

-  **AI 智能答题**：支持多种主流大模型 API（Kimi、DeepSeek、OpenAI 等）
-  **自动识别**：自动识别页面中的题目和选项
-  **快速响应**：优化的答题流程，响应速度快
-  **实时监控**：后台监控 API 调用情况，支持日志导出
-  **友好界面**：悬浮控制面板，支持拖拽和快捷键操作
-  **隐私安全**：所有数据本地存储，不上传服务器
-  **完全免费**：开源项目，遵循 CC BY-NC 4.0 协议

##  安装说明

### 方法一：从源码安装（推荐）

1. **下载项目**
   ```bash
   git clone https://github.com/Gust-feng/Rapid-Learning.git
   ```
   或直接下载 [ZIP 压缩包](https://github.com/Gust-feng/Rapid-Learning/releases/download)

2. **打开扩展管理页面**
   - 在 Chrome/Edge 浏览器地址栏输入 `chrome://extensions/`（Chrome）或 `edge://extensions/`（Edge）
   - 或点击浏览器右上角 ⋮ → **扩展程序** → **管理扩展程序**

3. **启用开发者模式**
   - 在扩展管理页面右上角，打开 **开发者模式** 开关

4. **加载扩展**
   - 点击 **加载已解压的扩展程序**
   - 选择项目文件夹

5. **完成安装**
   - 扩展图标会出现在浏览器工具栏
   - 建议将扩展固定到工具栏以便快速访问

---

## ⚠️ 免责声明

```
本扩展旨在帮助用户学习与练习题目，仅供教学、复习或研究使用，请勿在正式考试中使用。
本扩展不会收集或上传任何个人敏感数据。
本扩展将使用本地存储保存答题历史，不会上传到服务器。
本扩展与任何考试平台、教育机构无关，开发者不对因使用本扩展造成的任何后果负责。
使用本扩展即表示您已阅读并同意上述声明。
```

---

## 快速开始

### 1. 获取 API 密钥

推荐使用 **kimi-k2-turbo-preview** 模型，性价比高且响应速度快。

获取 API Key 请访问：[月之暗面 - Kimi API](https://platform.moonshot.cn/console/account)

**为什么推荐这个模型？**

解答常见题目，国内各大模型都能轻松应对，但不同厂商提供的模型有不同的吐字速率限制。Kimi 的优势在于：
- **响应速度快**：**kimi-k2-turbo-preview**低延迟，吐字速度极快
- **免费额度**：新用户赠送15￥

### 2. 配置扩展

1. 点击浏览器工具栏中的扩展图标
2. 进入 **设置** 标签页
3. 填写以下配置：
   - **API 地址**：`https://api.moonshot.cn/v1/chat/completions`
   - **API 密钥**：填入您获取的 API Key
   - **模型**：`kimi-k2-turbo-preview`
   - **温度**：建议设置为 `0.3`（值越低答案越稳定）
   - **系统提示词**：保持默认即可（或根据需要自定义）
   - **扫描间隔秒**：建议设置为 `3`
   - **自动扫描**：根据个人习惯选择是否自动启动

4. 点击 **测试 API** 验证配置是否正确
5. 点击 **保存设置** 保存配置

---

## 功能介绍

### 控制面板

扩展会在页面右上角显示一个悬浮控制面板，包含以下功能：

- **极速学习** 标题（点击可拖动面板位置）
- **自动开始/停止** 按钮：控制进入网页后自动答题的启动和停止
- **详细信息** 开关：显示或隐藏题目详细信息
- **自动填写** 开关：是否自动将答案填入答题区域
- **日志区域**：显示答题信息和结果

**快捷键**：按 `Ctrl+Shift+L`（Mac: `Command+Shift+L`）可快速显示/隐藏控制面板。

### 答题流程

1. 打开题目页
2. 点击 **极速学习** 按钮启动自动答题
3. 扩展会自动：
   - 识别页面中的题目和选项
   - 调用 AI 模型获取答案
   - 根据设置自动填写或提示答案
4. 在日志区域查看答题结果

### 后台监控

在 **后台** 标签页中，您可以：

- **实时查看 API 调用日志**：包括请求、响应、耗时等详细信息
- **过滤日志**：按成功/失败状态筛选日志
- **导出日志**：将日志导出为 JSON 文件供分析
- **清空日志**：清除所有历史记录
- **自动刷新**：实时更新日志（每秒刷新一次）
- **统计信息**：查看总请求数、成功率、平均耗时等数据

**性能提示**：
- 日志最多显示最新 50 条，避免页面卡顿
- 超过 200 条日志时，会自动清理 3 天前的旧记录

---

## 高级配置

### 系统提示词自定义

系统提示词用于约束 AI 的回答风格和输出格式。默认提示词已针对答题场景优化，但您可以根据需要自定义：

```
你是一个专业的在线教育答题助手。请根据题目内容，直接给出正确答案。
对于选择题，只返回选项字母（如A、B、C、D）；
对于判断题，返回"正确"或"错误"；
对于填空题，如有多个空，请用英文逗号、中文逗号、顿号或空格分隔答案。
不要解释，只返回答案。
```

### 温度参数说明

温度（temperature）控制 AI 回答的随机性：
- **0.0 - 0.3**：答案更确定、稳定（推荐用于答题）
- **0.4 - 0.7**：平衡创造性和准确性
- **0.8 - 2.0**：答案更多样、创造性（不推荐用于答题）

### 支持的 AI 模型

扩展支持其他兼容 OpenAI API 格式的模型（包含但不仅限于以下模型）：

| 平台 | 推荐模型 | API 地址 | 特点 |
|:------|:----------|:----------|:------|
| **Kimi** | kimi-k2-turbo-preview | https://api.moonshot.cn/v1/chat/completions | 响应速度快 |
| **OpenAI** | gpt-41 | https://api.openai.com/v1/chat/completions | 逻辑严谨 |
| **DeepSeek** | deepseek-chat | https://api.deepseek.com/v1/chat/completions | 性价比高 |
| **SiliconFlow** | Qwen/Qwen2.5-72B-Instruct | https://api.siliconflow.cn/v1/chat/completions | 多模型选择，灵活配置 |

---

## 常见问题

### Q1: 测试 API 失败怎么办？

**可能原因：**
- API Key 未正确填写或已过期
- API 地址不正确
- 网络连接问题
- API 配额不足

**解决方法：**
1. 检查 API Key 是否正确复制（注意前后空格）
2. 确认 API 地址格式正确
3. 检查网络连接是否正常
4. 访问 API 平台查看余额和配额

### Q2: 扩展无法识别题目？

**可能原因：**
- 页面加载未完成
- 题目格式不符合识别规则
- 页面结构发生变化

**解决方法：**
1. 等待页面完全加载后再启动
2. 刷新页面重试
3. 检查"后台"标签中的日志，查看错误信息

### Q3: AI 返回的答案不正确？

**可能原因：**
- 题目描述不清晰或有歧义
- 模型理解偏差
- 系统提示词不适配

**解决方法：**
1. 调整温度参数（降低至 0.1-0.3）
2. 优化系统提示词，增加答题规则说明
3. 尝试更换其他 AI 模型
4. 手动核对答案后再提交

### Q4: 平均耗时显示为红色？

这表示 API 响应时间超过 1000ms（1秒），可能影响答题效率。

**优化建议：**
- 检查网络连接质量
- 更换响应更快的模型
- 减少并发请求（增大扫描间隔）
- 升级 API 套餐获得更高优先级

### Q5: 日志数据过多导致卡顿？

扩展已内置优化机制：
- 最多显示最新 50 条日志
- 超过 200 条自动清理 3 天前的记录

如仍感觉卡顿，可手动点击 **清空** 按钮清除所有日志。

---

##  使用技巧

1.  **首次使用**：建议先在练习题目上测试，熟悉扩展功能后再正式使用
2. **手动确认**：关闭"自动填写"可以先让 AI 给出答案，您核对后再手动提交
3.  **查看详情**：开启"详细信息"可以看到完整的题目内容和 AI 推理过程
4.  **监控使用**：定期查看"后台"标签可以了解 API 使用情况和优化配置
5.  **提升准确率**：遇到复杂题目可以降低温度参数（如 0.1-0.3）或更换更强大的模型
6.  **优化速度**：如果响应慢，可以增大扫描间隔或更换响应更快的模型

---

##  技术支持

### 数据安全

- 所有配置和日志均保存在本地浏览器存储中
- API Key 仅在本地使用，不会上传到任何服务器
- 扩展不收集任何用户个人信息

### 隐私政策

本扩展完全在本地运行，仅与您配置的 API 服务进行通信。请妥善保管您的 API 密钥，避免泄露。

---

## 更新日志

### v5.2.0
- 新增"使用说明"标签页
- 优化后台监控界面配色
- 支持思考模型
- 优化日志渲染性能（最多显示 50 条）
- 新增日志自动清理功能（超过 200 条清理 3 天前记录）
- 控制面板开关状态持久化保存

### v5.1.0
- 新增后台 API 监控终端
- 实时统计请求成功率和耗时
- 支持自动刷新日志（1秒间隔）
- 支持导出日志为 JSON 文件

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题

如果您发现 Bug 或有功能建议，请：

1. 查看 [Issues](https://github.com/Gust-feng/Rapid-Learning/issues) 是否已有类似问题
2. 如没有，请创建新的 Issue，提供详细信息：
   - 问题描述
   - 复现步骤
   - 预期行为
   - 实际行为
   - 浏览器版本和扩展版本

### 提交代码

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发说明

**项目结构：**
```
auto-answer-extension/
├── manifest.json         # 扩展配置文件
├── background.js         # 后台服务
├── content.js           # 内容脚本（核心逻辑）
├── options.html         # 设置页面
├── options.js           # 设置页面逻辑
├── debug.html           # 调试页面
├── debug.js             # 调试脚本
├── icons/               # 图标资源
└── README.md            # 项目说明
```

**本地开发：**
1. 修改代码后，在扩展管理页面点击刷新按钮
2. 刷新测试页面即可看到效果
3. 使用 F12 开发者工具查看控制台日志

---

## 📄 许可协议

本项目采用 **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)** 协议开源

**您可以：**
- 分享 — 在任何媒介以任何形式复制、发行本作品
- 演绎 — 修改、转换或以本作品为基础进行创作

**惟须遵守下列条件：**
- 署名 — 您必须给出适当的署名，提供指向本许可协议的链接
- 非商业性使用 — 您不得将本作品用于商业目的
- 相同方式共享 — 如果您再混合、转换或者基于本作品进行创作，您必须基于与原先许可协议相同的许可协议分发您贡献的作品

---

## 🙏 致谢


- [Visual Studio Code](https://code.visualstudio.com/) 
- [Claude 4.5 Sonnet](https://www.anthropic.com/claude) 
- [Kimi API](https://platform.moonshot.cn/)
- [Chrome Extensions](https://developer.chrome.com/docs/extensions/)

---

<div align="center">

**如果这个项目对您有帮助，请考虑给个 ⭐ Star！**

Made with ❤️ by [Gust-feng](https://github.com/Gust-feng)

</div>

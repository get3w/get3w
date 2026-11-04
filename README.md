# Get3W

> Get3W, get things done

Get3W 是 WorkBuddy、Claude Cowork 和 Codex 的免费开源替代品：一款适用于 macOS、Windows 和 Linux 的桌面应用，AI 智能体可以直接在你自己的文件上完成实际工作。系统支持任意模型（50+ 提供商、你自己的 API 密钥，或通过 Ollama 运行的本地模型），并支持团队共享技能和 MCP 服务器。

- 免费开源：采用 MIT 许可证，本地使用无需 Get3W 账户。
- 任意模型：使用你自己的 API 密钥、通过 ChatGPT 登录，或通过 Ollama 及兼容 Provider 运行本地模型。
- 文件保留在本地：历史会话和本地文件保存在本机，账户与云端设置是可选的。
- 扩展能力：在设置中管理 MCP 服务器、技能和插件；可进行浏览器自动化和电脑控制，权限按任务授予。
- 多语言：可在设置中切换英文。

## 开发

需要 Node.js 24.22.1（见 `.nvmrc`）、pnpm 11.4.0（见 `package.json` 的 `packageManager`，运行 `corepack enable` 自动使用）、Bun，以及对应平台的原生构建工具。不要使用 npm 或 yarn。

```sh
git clone https://github.com/get3w/get3w.git
cd get3w
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm dev   # 启动 Electron 桌面应用
```

构建命令生成 Renderer、Server 和 Electron 运行资源；安装包另执行 `pnpm --filter ./apps/desktop package:electron`。发布签名和安装包验收仍需完成，当前不提供可验证的公开下载。不会从上游项目安装更新。

| 路径 | 内容 |
| --- | --- |
| `apps/` | 桌面应用：React UI（`apps/app`）、Electron 外壳（`apps/desktop`）和本地服务（`apps/server`） |
| `packages/` | 共享核心包，包括浏览器标签、电脑控制、沙箱和界面组件 |
| `third-party/` | 第三方组件与许可证记录 |

## 路线图

大模型已经知道怎么做（How）。Get3W 要帮它弄清做什么（What）、在哪做（Where）、何时做（When）。

What：做什么。 自己确定工作内容，不用每一步都等人安排。比如根据营销部门的目标、日程和近期效果，知道它今天该做什么。

Where：在哪做。 解决连接问题，把智能体接到工作真正发生的地方：读取本地文件和团队工具，把成果直接发布到 TikTok、写入 CRM，而不是停在一份草稿里。

When：何时做。 自己判断什么时候该做什么事，到点就动手。你只需要看结果、做审批。

我们的目标是：你只需要告诉 Get3W 大方向，它就能自己确定这 3 个 W，然后一直干下去：

自启动： 到了该做的时候自己开始，不用你每次手动发起。
自运行： 自己拆解任务、调用工具、推进进度，一直做到完成。
自进化： 从每次执行和你的反馈中学习，把有效的做法沉淀成技能，越用越懂你。

## 使用范围

本地功能可使用个人 Provider。账户与设置使用 Get3W API；默认服务地址为 `https://api.get3w.com` 和 `https://get3w.com`。

- [使用指南](packages/docs/desktop.md)
- [贡献](CONTRIBUTING.md)

## 来源与许可

本项目基于 [OpenWork](https://github.com/different-ai/openwork) 以及 [OpenCode](https://github.com/anomalyco/opencode) 开发，源码采用 MIT 版权与许可。
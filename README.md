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

应用环境配置统一使用 `GET3W_*` 前缀，Vite 配置使用 `VITE_GET3W_*`。
原有 shell 或 CI 中的 `OPENWORK_*` 配置需要改为对应的 `GET3W_*` 名称；用户数据目录保持不变。
桌面登录默认连接线上服务；使用本地后端和网页时，在启动前设置：

```sh
GET3W_CLOUD_ORIGIN=http://127.0.0.1:6605 \
GET3W_AUTH_WEB_ORIGIN=http://localhost:7700 \
pnpm dev
```

`GET3W_CLOUD_ORIGIN` 指向 cloud 服务（生产为 `https://cloud.get3w.com`），Desktop 的登录、推理、个人接口和 MCP 都走这里；`GET3W_AUTH_WEB_ORIGIN` 指向网页登录审批页。上述端口仅为示例，应与实际运行的服务一致。

同级目录已有 `api/.venv`、API 开发 `.env` 和已安装依赖的 `web` 时，可运行
`pnpm dev:local`：启动本地 API（6600）、cloud 服务（6605，`services.cloud.app:app`）、图片/视频任务 worker（celery 队列）、网页（7700）和 Desktop，并为 Desktop 设置 `GET3W_CLOUD_ORIGIN` 和 `GET3W_AUTH_WEB_ORIGIN`。
个人服务默认可用，无需配置启用开关或密钥。付费提交由用户的账户余额决定，没有服务端单任务或单会话上限。启动前只读检查个人表及共享预算 schema，缺失时停止，不自动建表。首次初始化请在 `../api` 执行 `.venv/bin/python -m scripts.check_personal_schema --apply`；该命令仅创建缺少的个人表，不回填数据，既有 API schema 需单独准备。
它使用 `api/.env` 中的开发数据库及 Redis；退出时停止本次启动的 API、个人服务、网页和 Desktop。

构建命令生成 Renderer、Server 和 Electron 运行资源；安装包另执行 `pnpm --filter ./apps/desktop package:electron`。发布签名和安装包验收仍需完成，当前不提供可验证的公开下载。不会从上游项目安装更新。

| 路径 | 内容 |
| --- | --- |
| `apps/` | 桌面应用：React UI（`apps/app`）、Electron 外壳（`apps/desktop`）和本地服务（`apps/server`） |
| `packages/` | 共享核心包，包括浏览器标签、电脑控制、沙箱和界面组件 |
| `third-party/` | 第三方组件与许可证记录 |

## 路线图

大模型已经知道怎么做（How）。Get3W 要帮它弄清做什么（What）、在哪做（Where）、何时做（When）。

- What：做什么。 自己确定工作内容，不用每一步都等人安排。比如根据营销部门的目标、日程和近期效果，知道它今天该做什么。
- Where：在哪做。 解决连接问题，把智能体接到工作真正发生的地方：读取本地文件和团队工具，把成果直接发布到 TikTok、写入 CRM，而不是停在一份草稿里。
- When：何时做。 自己判断什么时候该做什么事，到点就动手。你只需要看结果、做审批。

我们的目标是：你只需要告诉 Get3W 大方向，它就能自己确定这 3 个 W，然后一直干下去：

- 自启动： 到了该做的时候自己开始，不用你每次手动发起。
- 自运行： 自己拆解任务、调用工具、推进进度，一直做到完成。
- 自进化： 从每次执行和你的反馈中学习，把有效的做法沉淀成技能，越用越懂你。

## 使用范围

本地功能可使用个人 Provider。账户、推理与设置使用 Get3W Cloud 服务；默认服务地址为 `https://cloud.get3w.com` 和 `https://get3w.com`。

- [使用指南](packages/docs/desktop.md)
- [贡献](CONTRIBUTING.md)

## 来源与许可

本项目基于 [OpenWork](https://github.com/different-ai/openwork) 以及 [OpenCode](https://github.com/anomalyco/opencode) 开发，源码采用 MIT 版权与许可。

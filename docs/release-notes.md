Get3W 0.1.7 桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64。不提供 Linux 安装包。

国内用户可在 https://get3w.com/download 下载。

## 本版本更新

- 调整工作区侧栏，集中显示当前工作区会话，并提供工作区切换、创建与设置入口。
- 聊天中的本地文件支持直接下载和在文件夹中显示，产物面板新增视频预览。
- 修复登录及网络恢复后模型列表未及时同步、模型代理重连和审批等待超时的问题。
- 将旧版本地存储迁移到 Get3W 命名路径，保留已有配置和冲突文件。
- 改善 macOS 辅助功能与录屏权限引导、中英文提示，以及开发启动时的页面加载恢复。

## 下载与安装

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

macOS 版本已使用 Apple Developer ID 签名并经 Apple 公证。**Windows 版本未进行代码签名**，可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

应用内自动更新已开启。应用会优先从大陆可访问的 Get3W 更新镜像（https://get3w.com/desktop/releases/latest/download）检查并下载安装，镜像不可用时回退到 GitHub。

Get3W 0.1.5 桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64。不提供 Linux 安装包。

国内用户可在 https://get3w.com/download 下载。

## 本版本更新

- 新会话支持同步任务日志，保留消息、工具调用、模型执行和附件证据；断网后恢复上传。
- 改善媒体生成任务的进度、输出预览和费用展示，支持音频与视频预览。
- 修复生成任务状态和对话记录展示、本地文件引用，以及登录状态相关交互。
- 改善应用内更新按钮状态；更新镜像验证完成后再发布新版本。

## 下载与安装

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

macOS 版本已使用 Apple Developer ID 签名并经 Apple 公证。**Windows 版本未进行代码签名**，可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

应用内自动更新已开启。应用会优先从大陆可访问的 Get3W 更新镜像（https://get3w.com/desktop/releases/latest/download）检查并下载安装，镜像不可用时回退到 GitHub。

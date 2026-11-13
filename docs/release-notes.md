Get3W 0.1.4 桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64。不提供 Linux 安装包。

国内用户可在 https://get3w.com/download 下载。

## 本版本更新

- 模型偏好设置支持按模型选择通道（如经济、官方、极速、高质量）和质量，可选项与 Get3W 网页版一致。
- 新增图片分层、图片放大、视频放大三类生成任务。
- 媒体生成任务显示准备和开始状态；任务完成后显示实际费用，结算前显示预留费用。生成失败时给出明确提示。
- 回复中引用的工作区本地图片可直接在对话内显示。
- 生成设置严格绑定到发起任务的那条消息，排队中的新消息不会改变已提交任务的设置。

## 下载与安装

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

macOS 版本已使用 Apple Developer ID 签名并经 Apple 公证。**Windows 版本未进行代码签名**，可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

应用内自动更新已开启。应用会优先从大陆可访问的 Get3W 更新镜像（https://get3w.com/desktop/releases/latest/download）检查并下载安装，镜像不可用时回退到 GitHub。

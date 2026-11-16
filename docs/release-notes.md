Get3W 0.1.9 桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64。不提供 Linux 安装包。

国内用户可在 https://get3w.com/download 下载。

## 本版本更新

- 新增单次运行费用审批设置，支持限额内自动批准付费调用；每条消息及其子任务累计费用，超额时仍需确认。
- 新增工作区资源上传，图片编辑可保留原始资源，并根据源图片匹配画幅和分辨率。
- 修复图片附件前后文字的输入与发送顺序，改善输入框光标定位。
- 改善任务失败、重试和权限审批提示，优化模型偏好入口与付费任务确认。
- 改善新版本提示和重启更新流程，修复异常退出后的本地配置恢复。

## 下载与安装

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

macOS 版本已使用 Apple Developer ID 签名并经 Apple 公证。**Windows 版本未进行代码签名**，可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

应用内自动更新已开启。应用会优先从大陆可访问的 Get3W 更新镜像（https://get3w.com/desktop/releases/latest/download）检查并下载安装，镜像不可用时回退到 GitHub。

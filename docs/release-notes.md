Get3W 首个公开桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64 和 Linux x64 / ARM64。

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- Linux：下载 `.AppImage` 或 `.tar.gz`。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

**本版本未进行 Apple Developer ID 签名/公证或 Windows 代码签名。** macOS 可能提示无法验证开发者，Windows 可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。macOS 的临时签名不等同于开发者签名。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

未签名首版暂不启用应用内自动安装更新或恢复；后续签名版本将单独验证更新路径。

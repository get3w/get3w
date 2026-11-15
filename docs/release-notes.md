Get3W 0.1.8 桌面版本，支持 macOS Apple Silicon / Intel、Windows x64 / ARM64。不提供 Linux 安装包。

国内用户可在 https://get3w.com/download 下载。

## 本版本更新

- 新增工作区文件管理，支持目录浏览、搜索、新建、重命名、移动、删除，以及文件预览和编辑。
- 模型生成的图片、视频和文档按任务保存到工作区，改善文件命名、路径追踪和预览；聊天输入支持搜索并引用工作区文件。
- 新增任务权限切换与确认，可查看和撤销当前聊天中已批准的同类操作；付费模型任务仍需单独批准。
- 简化工作区创建和切换，优化侧栏、账户入口与余额显示，并同步网页端账户资料更新。
- 修复账户模型配置迁移冲突，改善模型任务状态与本地媒体处理。

## 下载与安装

- macOS：下载对应架构的 `.dmg` 安装；`.zip` 为应用压缩包。
- Windows：下载对应架构的 `.exe` 安装程序。
- 使用 `SHA256SUMS` 核对下载文件；更新清单和 blockmap 同安装包一并发布。

macOS 版本已使用 Apple Developer ID 签名并经 Apple 公证。**Windows 版本未进行代码签名**，可能显示 SmartScreen 提示。仅从本仓库 Release 下载并核对校验值。

本版本保留本地个人工作区功能；企业版功能未包含。Google/Microsoft 连接器真实 OAuth、生产云端 API 端到端验收不在本次已通过范围。

应用内自动更新已开启。应用会优先从大陆可访问的 Get3W 更新镜像（https://get3w.com/desktop/releases/latest/download）检查并下载安装，镜像不可用时回退到 GitHub。

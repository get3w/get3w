let language = "zh";
const chinese = {
  "Cancel": "取消", "Continue": "继续", "Paste and Match Style": "粘贴并匹配样式", "Delete": "删除", "Start Speaking": "开始朗读", "Stop Speaking": "停止朗读", "Reload": "重新加载", "Force Reload": "强制重新加载", "Toggle Developer Tools": "切换开发者工具", "Toggle Full Screen": "切换全屏", "Save a copy": "保存副本", "Save to Microsoft 365": "保存到 Microsoft 365", "Save to Drive": "保存到云端硬盘", "Download from Microsoft 365": "从 Microsoft 365 下载", "Download from Drive": "从云端硬盘下载", "Discard local edits": "放弃本地修改",
  "Add to Dictionary": "添加到词典", "Close": "关闭", "File": "文件", "Edit": "编辑", "View": "视图", "Window": "窗口",
  "Settings": "设置", "Settings...": "设置…", "Check for Updates...": "检查更新…",
  "Toggle Sidebar": "切换侧栏", "Actual Size": "实际大小", "Zoom In": "放大", "Zoom Out": "缩小",
  "Speech": "语音", "Docs": "文档", "Help": "帮助", "Undo": "撤销", "Redo": "重做",
  "Cut": "剪切", "Copy": "复制", "Paste": "粘贴", "Select All": "全选", "Minimize": "最小化",
  "Zoom": "缩放", "Bring All to Front": "前置全部窗口", "Services": "服务", "Hide": "隐藏",
  "Hide Others": "隐藏其他应用", "Show All": "显示全部", "Quit": "退出", "About": "关于",
};
export function setNativeLanguage(value) {
  if (value !== "zh" && value !== "en") throw new Error("Unsupported language");
  language = value;
}
export function nativeText(value) { return language === "zh" ? chinese[value] ?? value : value; }
const roles = {pasteAndMatchStyle:"Paste and Match Style", delete:"Delete", startSpeaking:"Start Speaking", stopSpeaking:"Stop Speaking", reload:"Reload", forceReload:"Force Reload", toggleDevTools:"Toggle Developer Tools", togglefullscreen:"Toggle Full Screen", about:"About", services:"Services", hide:"Hide", hideOthers:"Hide Others", unhide:"Show All", quit:"Quit", undo:"Undo", redo:"Redo", cut:"Cut", copy:"Copy", paste:"Paste", selectAll:"Select All", minimize:"Minimize", zoom:"Zoom", front:"Bring All to Front", close:"Close", help:"Help", window:"Window"};
export function localizeMenu(items) {
  return items.map(item => ({ ...item,
    ...((item.label || roles[item.role]) ? {label:nativeText(item.label || roles[item.role])} : {}),
    ...(Array.isArray(item.submenu) ? {submenu:localizeMenu(item.submenu)} : {}),
  }));
}

export function nativeMessage(english, chinese) { return language === "zh" ? chinese : english; }

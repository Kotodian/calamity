# Calamity TODO

## TUN Mode
- [ ] 实现 TUN 入站（sing-box inbound type: tun）
- [ ] 设置页 TUN 开关（已有 UI，需要连接后端）
- [ ] TUN 配置写入 sing-box config（stack、mtu、auto_route、strict_route、dns_hijack）
- [ ] macOS 权限处理（需要 root 或 Network Extension）

## CLI
- [ ] 命令行工具 `calamity` 用于无 GUI 管理
- [ ] `calamity start/stop/restart` — 控制 sing-box
- [ ] `calamity status` — 显示连接状态、速度、活跃节点
- [ ] `calamity node list/set` — 节点管理
- [ ] `calamity rule add/remove` — 规则管理
- [ ] `calamity sub update` — 更新订阅

## MCP (Model Context Protocol)
- [ ] MCP Server 集成，让 AI 助手能查询和控制代理
- [ ] 工具：查询连接状态、速度、活跃节点
- [ ] 工具：切换节点、切换代理模式
- [ ] 工具：添加/删除规则
- [ ] 工具：更新订阅
- [ ] 工具：查询连接日志

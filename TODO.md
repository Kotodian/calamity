# Calamity TODO

## 基本功能
- [x] 托盘在规则模式下显示所有的规则
- [x] 实现 TUN 入站（sing-box inbound type: tun）
- [x] 设置页 TUN 开关（已有 UI，需要连接后端）
- [x] TUN 配置写入 sing-box config（stack、mtu、auto_route、strict_route、dns_hijack）
- [x] macOS 权限处理（需要 root 或 Network Extension）

## 优化
- [ ] 配置热重载
- [x] 仪表盘支持伸缩

## CI/CD
- [x] 打包
- [ ] 定义版本

## 文档
- [ ] README
- [ ] github pages，操作手册

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

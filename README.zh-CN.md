# Calamity

[English](./README.md)

GitHub Pages：`https://kotodian.github.io/calamity/`

Calamity 是一个基于 Tauri、React 和 sing-box 的 macOS 桌面代理客户端。它同时提供完整的主界面和紧凑的托盘窗口，用于日常的代理开关、节点切换、规则管理、DNS 配置和 Tailnet 操作。

## 功能概览

- 基于 React + Vite 的前端，主窗口和托盘窗口分离
- 基于 Tauri + Rust 的后端，负责本地进程控制和系统集成
- 集成 sing-box，支持代理路由、规则、DNS 和 TUN 模式
- 支持规则模式、Final 出口设置和按站点快速写规则
- 支持 DNS 管理，以及 TUN 模式下的 Fake-IP
- 内置 Tailnet 页面，用于 Tailscale 相关操作
- 支持英文和简体中文界面

## 目录结构

- `src/`：前端应用、托盘 UI、store、service、i18n 和测试
- `src/pages/`：仪表盘、节点、规则、DNS、日志、设置、订阅、连接、Tailnet 等页面
- `src/tray/`：托盘状态、模式切换、快捷操作和规则组件
- `src/stores/`：Zustand 状态管理
- `src/services/`：前端对 Tauri 命令的适配层，以及测试用 mock 实现
- `src-tauri/src/`：Rust 命令、sing-box 配置生成、存储和系统能力
- `.github/workflows/manual-release.yml`：手动触发的 Apple Silicon 打包工作流

## 环境要求

- macOS
- Node.js 20+
- Rust toolchain
- Tauri CLI
- 本地调试时可执行的 `sing-box`，并确保它在 `PATH` 中可用

## 开发命令

安装依赖：

```bash
npm install
```

仅启动前端：

```bash
npm run dev
```

启动桌面应用：

```bash
npm run tauri dev
```

构建前端产物：

```bash
npm run build
```

运行测试：

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## TUN 模式说明

- 当前 TUN 模式以 macOS 为主要目标平台
- 启动 TUN 需要管理员权限
- 开启 TUN 后，运行时会强制使用 Fake-IP
- 应用退出时会尝试完整停止带权限启动的 sing-box 进程，以释放 TUN 接口

## 发布流程

仓库内置了一个手动触发的 GitHub Actions 打包流程：

- Workflow：`Manual Tauri Release`
- 触发方式：`workflow_dispatch`
- 构建目标：`aarch64-apple-darwin`

## 贡献说明

贡献前请先阅读 [AGENTS.md](./AGENTS.md)，其中包含仓库约定、代码风格和测试要求。

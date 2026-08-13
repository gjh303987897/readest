# readest-tiny

readest-tiny 是一个本地优先、可选自托管同步的跨平台电子书阅读器和轻量书库。它支持在 Web 或 Tauri 原生应用中导入并阅读常见电子书格式；登录后可以同步书库元数据、阅读进度、书签以及书籍文件和封面。

当前仓库以 `apps/readest-app` 为主应用，GitHub Actions 负责构建桌面和移动端原生制品。项目仍在持续开发中，仓库内部分插件和上游发行资料不代表当前主应用的默认功能或发布渠道。

## 功能

- 支持 `EPUB`、`PDF`、`MOBI`、`AZW`、`AZW3`、`FB2`、`FBZ`、`CBZ`、`TXT` 和 `MD`。
- 本地书库：批量导入、封面网格、按标题/作者/格式搜索、阅读进度，以及删除书目或本地副本。
- 阅读器：目录、书内全文搜索、进度跳转、阅读历史前进/后退，以及滚动和分页模式。
- 固定版式文档：缩放、双页、适合页面和适合宽度等视图选项。
- 书签：添加可选标题、跳转、重命名和删除；登录后可同步。
- 阅读定制：界面语言、浅色/深色主题、自定义颜色、字体和字号、段落与页面布局、页眉页脚、翻页动画、触控/键盘行为和电子墨水模式。
- 可选账户与自托管同步：未登录时仍可完全使用本地阅读功能。

## 技术栈

- Next.js 16、React 19、TypeScript 和 Tailwind CSS
- Zustand 状态管理与 Web IndexedDB 本地存储
- Tauri v2、Rust 原生能力和平台文件系统
- `foliate-js` 文档引擎（通过 Git submodule 引入）
- pnpm workspace monorepo

## 项目结构

```text
apps/readest-app/       主应用（Next.js + Tauri）
apps/readest-app/src/   Web 界面、阅读器和业务服务
apps/readest-app/src-tauri/
                         Rust 原生层与平台打包配置
packages/foliate-js/    文档解析与排版引擎（submodule）
API/                    后端 API 说明
.github/workflows/      GitHub Actions 构建流程
```

## 快速开始

### 环境要求

- Node.js 24
- pnpm 11.1.1（仓库的 `packageManager` 版本）
- Rust/Cargo，最低版本 1.77.2
- 运行 Tauri 桌面开发还需要对应平台的 WebView 和原生编译工具

首次安装：

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

启动 Web 开发服务器：

```bash
pnpm dev-web
```

启动当前平台的 Tauri 原生应用：

```bash
pnpm tauri dev
```

### 构建与预览

根目录没有单独的 `build` 或 `build-web` 脚本，应用脚本请使用 workspace filter：

```bash
pnpm --filter @readest/readest-app build-web
pnpm --filter @readest/readest-app start-web
pnpm tauri build
```

`pnpm tauri build` 会为当前主机平台生成 Tauri 制品。跨平台发布由 [`.github/workflows/build-tauri.yml`](.github/workflows/build-tauri.yml) 处理，目前覆盖 Windows x64/ARM64、Linux x64/ARM64、macOS Intel/Apple Silicon、Android 调试 APK 和 iOS Simulator。

## 配置与同步

Web 和 Tauri 开发分别加载 `apps/readest-app/.env.web` 与 `apps/readest-app/.env.tauri`。需要覆盖后端、Supabase、对象存储或分析配置时，复制 [`apps/readest-app/.env.local.example`](apps/readest-app/.env.local.example) 为被 Git 忽略的 `.env.local`，不要把真实密钥写入已跟踪的环境文件。

自托管 API 的接口约定见 [`API/README.md`](API/README.md)。同步需要配置可用的认证、数据库和对象存储服务；未登录时，Web 端数据保存在 IndexedDB，Tauri 端数据保存在本机应用数据目录。

## 测试与检查

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
pnpm --filter @readest/readest-app test:browser
```

浏览器测试需要可用的 Chromium。Tauri 集成测试脚本还依赖 Bash、`curl`、`lsof` 和 `pkill`，在原生 Windows 环境中请使用 WSL 或 CI。更完整的测试说明见 [`apps/readest-app/docs/testing.md`](apps/readest-app/docs/testing.md)。

## 平台提示

- Windows 原生构建需要 Visual Studio 2022 的 C++ 桌面开发工作负载。
- Linux 原生构建需要 GTK/WebKit、`pkg-config`、`patchelf` 等依赖；具体清单见工作流文件。
- Android 构建使用 JDK 17 和 Android NDK `28.2.13676358`。
- iOS 构建需要 macOS、Xcode 以及有效的签名或模拟器配置。

## 贡献

提交代码前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)，并运行与改动范围相符的测试和格式检查。请保留现有的包名、bundle identifier、`readest` deep-link scheme 以及 `Readest` 数据目录名；这些标识用于升级、登录回调和既有用户数据兼容。

## 许可证

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。`packages/foliate-js` 及其他依赖的许可证和版权信息以各自目录为准。

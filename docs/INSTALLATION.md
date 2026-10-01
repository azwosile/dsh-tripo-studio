# 安装与配置

[返回首页](../README.md)

## 支持范围

安装/卸载脚本面向 Windows 上的 DSH Desktop（社区版，默认）与 DeepSeek Harness 官方桌面端（`--target=official`），需要宿主已完成初次初始化。Node.js 包声明 `>=20`，建议使用受维护的 22/24。开发时可在 Linux 运行大部分模拟测试，但这不代表 Linux/macOS 的桌面安装已受支持。

当前版没有声明兼容所有 DSH 版本；宿主 web profile、Cordis 或客户端槽位协议变更时需要重新验证。预检报结构、解析或完整性错误时应停止，不要为安装关闭宿主完整性检查。

## 安装

1. 下载完整源码快照并解压，保留 `plugin/` 结构；不要把 ZIP 原封不动放进插件目录。
2. 正常退出 DSH。打开 PowerShell，进入仓库的 `plugin` 子目录。
3. 执行只读预检：`node .\scripts\install-local.mjs --dry-run`。
4. 检查输出中的 source/destination/profile 和待修改内容，再执行：`node .\scripts\install-local.mjs --apply`。
5. 手动启动 DSH，检查侧栏、工作台、项目和连接设置。安装成功不等于真实供应商功能已验收。

默认宿主目录：

| 用途 | 路径 |
|---|---|
| 插件文件 | `%APPDATA%\dsh-desktop\harness\plugins\dsh-tripo-studio` |
| web profile | `%APPDATA%\dsh-desktop\harness\profiles\web` |
| 安装备份 | `%APPDATA%\dsh-desktop\harness\plugins\tripo-studio-backups` |
| 默认数据根目录 | 已存在时沿用 `%APPDATA%\dsh-desktop\tripo-studio`；新装为 `%USERPROFILE%\.dsh\tripo-studio`（或 `$DSH_HOME\tripo-studio`） |

安装器只更新本插件相关的依赖、bundle 与 junction，并备份旧插件/profile和存在的小型数据索引；不复制模型/贴图/密钥，不移动用户项目，不运行全局 pnpm resolver。首次打开新数据版本时，存储模块会先备份旧 `state.json`。索引备份不是整个资产库的完整备份，请另行备份自己的数据。

## 官方桌面端（DeepSeek Harness）

已在官方 0.2.0-rc.2 自带运行时上实测服务端路由与客户端注册。官方桌面端的插件归属 `%USERPROFILE%\.dsh\profiles\desktop`，官方支持的外部安装方式是自带 CLI：`dsh plugin --profile desktop add <package>`。本仓库安装器包装了这条路径：

1. 先启动一次官方桌面端以初始化 profile，然后从**系统托盘**完全退出（关窗只是隐藏）。
2. 在 `plugin` 目录执行预检：`node .\scripts\install-local.mjs --target=official --dsh="<安装目录>\resources\runtime\cli\bin\dsh.cmd" --dry-run`。安装目录是默认的 `%LOCALAPPDATA%\Programs\DeepSeek Harness` 时可省略 `--dsh`，也可设置 `DSH_OFFICIAL_CLI`。
3. 确认后把 `--dry-run` 换成 `--apply`。插件文件复制到 `%USERPROFILE%\.dsh\local-plugins\dsh-tripo-studio`，备份在同目录的 `tripo-studio-backups`。
4. 卸载：`node .\scripts\uninstall-local.mjs --target=official --apply`（保留插件文件与数据）。

数据目录与社区版共享（见上表与 `shared/host-paths.js`），因此迁移后项目、模型和已保存的 Key 仍然可用。**不要让两个桌面端同时运行本插件**，以免同时写入 `state.json`。标题栏玻璃效果只在社区版显示。

## 连接与收费

推荐使用界面的连接设置：填写 Key、选择是否记住、单独选择是否允许收费。保存/清除本身不请求供应商；余额查询会访问供应商的只读接口。每个生成/转换任务仍需审阅确认。

- 站点固定为 `https://openapi.tripo3d.com/v3`，需要国内站 Key。
- 记住 Key 使用 Windows DPAPI CurrentUser，存放在固定数据根目录的 `secrets/connection-cn.json`；状态响应不回传 Key。
- 会话模式不把本次新 Key 写入持久文件；若之前保存过 Key，会话设置不等于删除旧保存值。要删除持久凭据，请使用明确的清除操作。
- 无 DPAPI 能力时不回退到明文保存。DPAPI 不防御已控制同一 Windows 账户的恶意程序。
- 清除会记录禁用状态，避免下次启动意外回退到环境变量中的旧 Key。
- `unknown`/结果不明的收费提交不要重复点击生成；先去供应商控制台核对，必要时用原账户 task_id 显式查询关联。

可选环境变量（设置在**启动 DSH 的进程环境**中，修改后通常需要重启宿主）：

| 变量 | 作用 |
|---|---|
| `TRIPO_CN_API_KEY` | 国内站 Key；不要写入仓库、脚本或公开日志 |
| `TRIPO_CN_ENABLE_PAID` | `1` 为明确允许收费，缺省关闭；仍需逐次审批 |
| `TRIPO_STUDIO_DATA_DIR` | 固定数据根目录；不要指向源码或插件安装目录 |
| `TRIPO_ASSET_HOSTS` | 可选的额外可信 CDN 精确主机名，逗号分隔；不要随意放宽 |

旧 `TRIPO_API_KEY`、`TRIPO_STUDIO_ENABLE_PAID` 不再作为当前站点的运行凭据/收费入口。已有保存值或清除标记可能优先于环境变量，排查时以连接设置显示的凭据来源为准。

## 项目数据目录

可以在界面通过本机原生目录选择器设置项目根目录，操作前需完成/丢弃审批草稿并暂停活动任务跟踪。切换目录只切换项目存储位置，**不搬迁旧项目或模型**；固定根目录中的凭据不随项目目录移动。

项目数据、参考图、生成模型、密钥与备份都不属于源码仓库。不要把默认数据目录、`state.json`、`secrets/` 或自行选择的项目目录提交到 GitHub。

## 卸载与恢复

正常退出 DSH，在插件源码目录运行：

```powershell
node .\scripts\uninstall-local.mjs --dry-run
# 核对后再执行：
node .\scripts\uninstall-local.mjs --apply
```

卸载脚本停用本插件的 bundle、依赖与链接，保留插件文件、项目数据和备份。不要直接用旧 profile 覆盖当前全部配置；恢复旧版时应先备份现状，再只恢复本插件相关项，并核对数据版本兼容性。

## 常见问题

- **预检缺少 APPDATA/profile**：确认在 Windows 本机运行，且 DSH 已初始化；不要手工造空 profile。
- **页面提示离线**：检查宿主是否实际载入插件及本机路由。独立 HTML 不是完整后端。
- **图生 3D 前上传失败**：这可能发生在收费创建之前；阅读错误阶段。查询/下载失败与重新收费生成是不同操作。
- **模型打不开**：优先下载原文件用对应软件检查。USDZ/3MF 仅下载；glTF 必须自包含，外部贴图和复杂材质不保证预览还原。
- **反代返回 403**：这是本机安全策略，不要通过删除校验来公开部署。

# dsh-tripo-studio · 0.3.4

DSH Desktop（社区版）与 DeepSeek Harness 官方桌面端通用的本地 Tripo 工作台：参考图创作、拆件与裁剪、逐件图生 3D、多视图生 3D、任务管理和本机预览。当前仅接入 Tripo 国内站；不是 Blender 插件，不自动修模、装配或绑定。

## 本地安装（Windows）

需要已初始化的 DSH Desktop 和 Node.js（建议 22/24，包声明最低 20）。先正常退出 DSH，在本目录运行：

```powershell
node .\scripts\install-local.mjs --dry-run
# 确认预检无误后，由用户选择执行：
node .\scripts\install-local.mjs --apply
```

官方桌面端（DeepSeek Harness，已验证 0.2.0-rc.2）：先从托盘完全退出，再运行

```powershell
node .\scripts\install-local.mjs --target=official --dsh="<安装目录>\resources\runtime\cli\bin\dsh.cmd" --dry-run
node .\scripts\install-local.mjs --target=official --dsh="<安装目录>\resources\runtime\cli\bin\dsh.cmd" --apply
```

它通过官方自带的 `dsh plugin --profile desktop add` 登记插件（插件文件放在 `%USERPROFILE%\.dsh\local-plugins`）。卸载同理：`uninstall-local.mjs --target=official --apply`。

发布包带 `lib/client-v0.3.4.js`。安装器备份旧插件/profile，保留数据，不自动启动宿主，不调用 Tripo，也不安装全局依赖。

启动 DSH 后，从 Tripo Studio 的连接设置填写国内站 Key；生成前明确开启收费并逐次审阅确认。不要把 Key 写进源码。数据根目录：若 `%APPDATA%\dsh-desktop\tripo-studio` 已存在则继续使用（两个桌面端共用同一批项目和 Key），否则新装默认 `%USERPROFILE%\.dsh\tripo-studio`；不在插件安装目录中。不要让两个桌面端同时运行本插件。

当前环境变量是 `TRIPO_CN_API_KEY`、`TRIPO_CN_ENABLE_PAID`、`TRIPO_STUDIO_DATA_DIR`；旧国际站变量不再作为凭据入口。默认拒绝远程和反代访问。

## 开发

```powershell
npm ci --ignore-scripts
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:v033
```

构建会输出当前 JS 和上级目录中的单文件离线预览。离线预览不提供真实生成/项目持久保存。浏览器测试使用模拟供应商；不需要真实 Key。

## 文档位置

完整源码仓库的根目录提供 `README.md`、`CHANGELOG.md`、`docs/INSTALLATION.md`、`docs/DEVELOPMENT.md` 与 `SECURITY.md`。版本历史已从本文件移出。若此目录来自 DSH 安装副本，请查阅下载的完整源码仓库；安装器不会复制根目录文档。

本目录保留独立的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`，便于随插件分发。仓库及安装快照均不提供角色模型或个人项目数据。

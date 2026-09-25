# dsh-tripo-studio · 0.3.2

DSH Desktop 的本地 Tripo 工作台：参考图创作、拆件与裁剪、逐件图生 3D、任务管理和本机预览。当前仅接入 Tripo 国内站；不是 Blender 插件，不自动修模、装配或绑定。

## 本地安装（Windows）

需要已初始化的 DSH Desktop 和 Node.js（建议 22/24，包声明最低 20）。先正常退出 DSH，在本目录运行：

```powershell
node .\scripts\install-local.mjs --dry-run
# 确认预检无误后，由用户选择执行：
node .\scripts\install-local.mjs --apply
```

发布包带 `lib/client-v0.3.2.js`。安装器备份旧插件/profile，保留数据，不自动启动宿主，不调用 Tripo，也不安装全局依赖。

启动 DSH 后，从 Tripo Studio 的连接设置填写国内站 Key；生成前明确开启收费并逐次审阅确认。不要把 Key 写进源码。数据默认位于 `%APPDATA%\dsh-desktop\tripo-studio`，不在插件安装目录中。

当前环境变量是 `TRIPO_CN_API_KEY`、`TRIPO_CN_ENABLE_PAID`、`TRIPO_STUDIO_DATA_DIR`；旧国际站变量不再作为凭据入口。默认拒绝远程和反代访问。

## 开发

```powershell
npm ci --ignore-scripts
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:v032
```

构建会输出当前 JS 和上级目录中的单文件离线预览。离线预览不提供真实生成/项目持久保存。浏览器测试使用模拟供应商；不需要真实 Key。

## 文档位置

完整源码仓库的根目录提供 `README.md`、`CHANGELOG.md`、`docs/INSTALLATION.md`、`docs/DEVELOPMENT.md` 与 `SECURITY.md`。版本历史已从本文件移出。若此目录来自 DSH 安装副本，请查阅下载的完整源码仓库；安装器不会复制根目录文档。

本目录保留独立的 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`，便于随插件分发。仓库及安装快照均不提供角色模型或个人项目数据。

# DSH Web 与双站配置（0.4.0）

[返回首页](../README.md) · [安全边界](../SECURITY.md)

## 适用范围

插件支持 DSH 的 `web` profile 与同源 Node.js 后端，不是 GitHub Pages／独立 HTML 在线生成器。前端继续使用宿主的 React、`__ModuleLoader__`、`sidebar.panellist` 与 `main` 槽位，所有工作台请求均为同源相对 URL `/dsh-tripo-studio/...`。

默认配置仍为 `site: cn`、`accessMode: local`：只允许回环直连，拒绝反代与远程请求。远程访问必须显式开启 `web` 模式、配置精确来源和独立访问口令；不依赖宿主自带登录是否覆盖插件路由。

**这是单个可信操作者的工作台，不是多租户服务。** 所有已授权浏览器共享同一站点选择、后端凭据、收费开关和项目目录。不要把访问口令交给不可信用户；同源的其他恶意插件也不能被本插件隔离。建议专用域名、宿主自身登录、反代限流及网络访问控制，不要使用可由不可信租户执行脚本的共享域名。

## 安装到 Web profile

先正常停止相应 DSH Web 服务并备份其 profile。使用实际安装的 DSH CLI（不是社区桌面安装脚本）：

```bash
# 在仓库根目录，显式路径；CLI 管理 web profile 的依赖、bundle 和锁文件。
dsh plugin --profile web add "$(pwd)/plugin"
# 重启时使用：
dsh web
```

若 Git Bash 没有全局 `dsh`，请使用实际 CLI 的绝对路径；Windows 的 `.cmd` 可由 Git Bash 明确调用。`install-local.mjs --target=official` 仍面向官方 **desktop** profile，不会偷偷安装到 Web。CLI 会解析依赖；本轮开发未修改用户 profile、未部署或启动用户 DSH。

卸载使用 `dsh plugin --profile web remove dsh-tripo-studio`，不删除项目数据。

## 本机 Web 使用

直接访问 DSH 的 `http://localhost:<端口>` 或 `http://127.0.0.1:<端口>`，保持默认 `accessMode: local` 即可，不需要额外口令。若通过反代域名访问，即使反代连接后端为回环地址，也必须按下一节配置。

## 远程／反代 Web 使用

1. 为该后端设置**独立、随机、高熵**的 `TRIPO_STUDIO_WEB_TOKEN`（32–512 个非空白 ASCII 字符，建议随机 32 字节编码成 64 位 hex）。不要使用 Tripo API Key，不要在聊天、源码、profile 或日志中写入实际口令。仅在启动进程环境或私密服务管理器中注入。
2. 设置 `TRIPO_STUDIO_DATA_DIR` 为专用的服务端数据根目录；不得位于源码／插件目录，也不要与正在运行的桌面端共享同一 `state.json`。
3. 在宿主中编辑已有 `tripo-studio` 条目的配置，例如以下是**现有条目的 config 内容**，不要重复添加 loader entry：

```yaml
config:
  demoMode: false
  site: international
  accessMode: web
  allowedOrigins:
    - https://studio.example.com
```

4. 宿主监听地址、TLS／反代由 DSH 和部署环境管理。公网来源必须 HTTPS；仅 `localhost`／回环地址允许 HTTP。`allowedOrigins` 必须是精确 origin，不含路径、凭据或通配符。
5. 反代必须保留浏览器使用的 `Host`，正确转发 `Cookie`，不改写 `/dsh-tripo-studio` 前缀，不缓存此路径，也不要剥离 `x-tripo-studio`、`x-tripo-csrf`、`x-tripo-site` 请求头。插件不把 `Forwarded`／`X-Forwarded-*`／Cloudflare 头当成授权依据。若后端 Host 被换成内网地址，会按设计拒绝请求。
6. 启动 DSH Web，打开 Tripo Studio，输入 **DSH Web 访问口令**。该口令仅创建工作台会话，不会调用 Tripo。随后在连接设置选择站点并填写该站对应的 Tripo Key。

会话 Cookie 为 `HttpOnly`、`SameSite=Strict`、固定插件 Path；HTTPS 来源附 `Secure`。有效期固定 8 小时，服务重启失效；“退出 Web 会话”立即撤销当前会话。所有状态、项目及资产 URL 都要求授权，写操作仍要求 CSRF。Cookie 不发送给 Tripo；供应商 Key 只在后端使用。

Web 模式不支持浏览器弹出服务器原生目录选择器或切换服务器目录，使用配置好的服务端目录；模型和参考图的“本地导入”是从浏览器选文件后上传到该服务器，不是服务器本机文件扫描。非 Windows 后端没有 DPAPI 时，只提供后端运行期间的凭据，不降级明文保存。

## 国内站／国际站

| 项目 | 国内站 | 国际站 |
|---|---|---|
| site ID | `cn` | `international` |
| API 基址 | `https://openapi.tripo3d.com/v3` | `https://openapi.tripo3d.ai/v3` |
| 专用 Key 环境变量 | `TRIPO_CN_API_KEY` | `TRIPO_INTERNATIONAL_API_KEY` |
| 专用收费环境变量 | `TRIPO_CN_ENABLE_PAID` | `TRIPO_INTERNATIONAL_ENABLE_PAID` |
| 加密配置 | `secrets/connection-cn.json` | `secrets/connection-international.json` |

- 界面选择站点后，还须点击“确认切换站点并关闭收费”。选择选项本身不会切站；切换本身不会上传、查询余额或生成。
- 切换仅影响本次后端运行；重启使用宿主 `site` 配置，默认 `cn`。切换必定关闭收费，须另行保存并启用当前站点收费权限。
- 两站 Key 分别管理；不会将国内站 Key 自动发送到国际站，反之亦然。旧 `connection.json` 与无站点的环境变量保持封存，不自动迁移。
- 草稿、账户指纹、审批、引用、刷新、恢复及下载绑定站点。仅刷新当前站点的任务，切回仍须原账户。已下载本地资产可人工选择后新建当前站点任务，但仍须新审批。
- 0.2.6 之前无 `site` 的任务解释为国际站；其旧账户／审批指纹**不会自动重写或解除保护**。不保证旧任务仅切站即可恢复，应在原站控制台核对。
- 国际站不套用国内站数值估价；图像／3D Tips 中保留的国内站公开表只能作原站参考，以国际站账户实际结算为准。
- 收费 POST 不自动重试，更不自动切换 `.com`／`.ai`。查询／免费上传的有限重试也只访问选定站点。

## 验证与未覆盖范围

本版测试包括：双站固定端点与凭据隔离、单次收费提交、任务 ID 站点去重、Web 登录／过期／退出、未授权资产、Host／Origin／CSRF、站点切换旋转 CSRF、浏览器口令及 Key 不持久化、模拟浏览器工作流与现有真实 DSH WebServer 路由。

开发测试使用临时数据与模拟供应商；未提交真实收费任务，未安装至用户 DSH，未完成用户公网域名／TLS／反代、最新 DSH Web 整体应用或真实账户端到端验收。自动化通过不是供应商可用性、价格或公网安全保证。

官方参考（2026-10-15 核对公开文档）：

- [国际站文生图](https://developers.tripo3d.ai/en/docs/generation-text-to-image)
- [国际站图生 3D](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard)
- [DSH CLI / Web profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.zh.md)
- [DSH WebServer 路由合同](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/src/index.ts)

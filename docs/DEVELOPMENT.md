# 开发、构建与测试

[返回首页](../README.md)

## 架构

- `plugin/index.js`、`cordis.patch.yml`：Cordis 配置、宿主注册与释放。
- `client-src/`：React 界面与 Three.js 本机查看器；正式插件使用宿主 React。
- `server/routes.js`：本机 HTTP、同源、请求标记、CSRF 与输入检查。
- `server/service.js`、`tripo.js`：审批绑定、任务状态、供应商访问和受限资产下载。
- `server/credentials.js`：会话/Windows DPAPI 凭据；`store.js`、`project-location.js` 管理项目和存储。
- `shared/`：站点、模型参数合同、任务 ID/状态与提示词策略。

当前 API 为国内站固定地址，接口与价格表可能变化；源码中的模型/价格资料核对日期为 2026-09-22，不是永久有效的供应商承诺。

## 安装开发依赖和构建

在 `plugin/` 中执行，推荐受维护的 Node.js 22/24：

```sh
npm ci --ignore-scripts
npm run build
npm test
```

`--ignore-scripts` 避免依赖安装时执行生命周期脚本；当前锁定依赖在本次测试环境可直接构建。若平台的 esbuild 可选二进制未正确安装，应核对官方说明与环境，不要不加审阅地放开任意安装脚本。

构建产物：

- `plugin/lib/client-v0.3.2.js`：正式插件入口，仓库保留此当前构建。
- `Tripo-Studio-Workbench-v0.3.2.html`：根目录单文件离线预览，带 React/ReactDOM，仅供本机界面/导入预览。被 `.gitignore` 排除，默认不纳入源码发布包。

`package.json` 的 `private: true` 防止误发 npm，**不影响上传 GitHub**。不应为了 GitHub 发布而移除此保护。

## 模拟浏览器测试

```sh
npx playwright install chromium
# Linux 若缺少浏览器系统依赖，可在隔离开发/CI环境执行：
# npx playwright install --with-deps chromium
npm run test:ui
npm run test:credentials
npm run test:compat
npm run test:v032
```

历史回归入口：`test:v029`、`test:v0210`、`test:v0211`、`test:v0212`、`test:v030`、`test:v031`。这些名字标识回归场景，测试运行的是当前客户端，不需要历史 JS bundle。

测试创建临时数据及模拟供应商，不应填写真实 Key，不应访问收费 API。`test:v0210` 日志中的 FAKE provider calls 是内存替身计数，不是真实消费。测试内构造的极小几何数据用于解析验证，不是发布的模型资产；唯一图片夹具 `tests/fixtures/reference.png` 是白底绿色矩形。

- 非 Windows 环境跳过真实 DPAPI 测试与原生目录选择分支。
- 未提供本机 Sizer/Nav Color 测试副本时，`test:compat` 跳过真实外部插件共存项；模拟界面检查仍会执行。可显式用 `TRIPO_COMPAT_FIXTURES` 提供经审阅的只读副本。
- `test:host`、`test:host:routes` 需要实际 DSH 安装环境。不要把模拟路由测试当作原生 GUI 验收。
- 浏览器输出写入根目录 `validation/`，不纳入源码包。自动化通过不证明供应商当前可用或价格正确。

## 修改原则

1. 保持本机/同源/CSRF、站点隔离、项目隔离、输入校验和下载约束。
2. 收费 POST 不自动重试，不以刷新、恢复、隐藏或下载重试触发新收费。
3. 参数、账户、站点、输入内容变化后旧审批不能继续使用。
4. 保留已有用户数据；禁止把运行数据、凭据或个人素材放进源码树。
5. 变更先跑构建/测试，再更新 `CHANGELOG.md`。README 保持当前介绍，不追加安装流水账。
6. 打包使用[严格白名单工具](GITHUB_PUBLISH.md)，并人工检查新文件是否真的属于发布范围。

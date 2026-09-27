# 发布审计 · 0.3.3 · 2026-09-27

[返回首页](../README.md) · [首次发布审计](PUBLICATION_AUDIT_2026-09-26.md)

功能版本 **dsh-tripo-studio 0.3.3**。本次在首次发布快照（0.3.2）基础上同步源码工作区的0.3.3改动，审计规则与首次相同。

- **新增文件**（均为源码/测试，已人工审阅并加入白名单）：`plugin/client-src/model-roles.js`、`plugin/client-src/v033-styles.js`、`plugin/shared/credit-estimate.js`、`plugin/scripts/test-v033.mjs`、`plugin/tests/v033-unified.test.mjs`、本文件。
- **构建**：`plugin/lib/client-v0.3.3.js` 由源码工作区 `npm run build` 生成，替换 `client-v0.3.2.js`（仓库只保留当前构建，旧版可从Git历史取得）。
- **测试**：见 [validation-summary.json](evidence/validation-summary.json)；全部使用模拟供应商和临时数据，未调用真实 Tripo 接口，未产生收费请求。
- **依赖**：`npm audit` 0 个已知漏洞；未新增依赖。
- **排除**：模型、贴图、个人参考图、运行数据、凭据、日志、截图、历史 bundle/HTML 与安装备份仍不在包内。删除了首次发布时误生成的空文件 `ource release: DSH Tripo Studio 0.3.2"`（shell 引号错误产物，非源码）。
- **未执行**：DSH 安装/启动、原生 GUI、真实文件夹选择窗口、真实余额/用量/生成接口、Git 提交与推送。

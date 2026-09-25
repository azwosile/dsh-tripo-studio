# GitHub 上传与重新打包

[返回首页](../README.md)

本目录是独立的**源码发布快照**。没有附带 `.git`，没有替你创建远程仓库、提交、标签或推送。不要把旧工作区的 `.git`、模型目录或安装备份复制进来。

## 推荐：先用 GitHub Desktop 建立私有仓库

1. 在本机保留这份干净目录，先核对 `README.md`、`CHANGELOG.md` 和审计报告。
2. 用 GitHub Desktop 的 **Create a New Repository on your Hard Drive**：名称填写 `dsh-tripo-blender`，Local path 选择该目录的**父目录**。最终路径应恰好指向现有干净目录，不要再套一层同名目录。
3. 已有 README、LICENSE 和忽略规则，不要用模板覆盖它们。检查 Changes；只能出现源码、文档、工具、当前 JS 和一个几何测试 PNG，不能有模型、Key 或运行数据。
4. 由你确认后创建初始提交，再选择 **Publish repository**，建议先勾选 **Keep this code private**。
5. 在 GitHub 再检查一遍文件和许可证，确认后再决定是否公开。

不同 Desktop 版本的界面可能略有差别。如果提示路径不是空目录且不能创建，可用下面的命令先在该目录初始化，再选择 **Add an Existing Repository**。不要因此改选或初始化旧工作区。

## 或者：命令行上传

**以下步骤由你决定并执行，本次整理并未运行这些提交/推送命令。**

在这个干净目录打开 PowerShell，先确认当前目录正确：

```powershell
Get-Location
Get-ChildItem -Force
# 如果这里已有 .git，应先检查其历史/远程，不要直接照抄以下初始化步骤。
git init -b main
git status --short
git add -- .
git diff --cached --stat
git diff --cached --name-only
```

人工审阅暂存文件，确认没有任何模型、贴图、个人图片、凭据或运行数据，再执行：

```powershell
git commit -m "Initial source release: DSH Tripo Studio 0.3.2"
```

在 GitHub 网页建立一个**空的**仓库，建议先选 Private，不额外初始化 README、License 或 gitignore。将下面的占位地址替换为你自己的地址：

```powershell
git remote add origin https://github.com/<你的用户名>/dsh-tripo-blender.git
git remote -v
git push -u origin main
```

认证使用 GitHub Desktop、Git Credential Manager 或 GitHub 官方支持的方式；**不要把 Token 放到 remote URL、命令示例、README 或提交文件里**。

若使用网页上传，应上传解压后的源文件和目录，让 README 直接显示在仓库首页，而不是只上传一个 ZIP。文件较多时优先使用 Desktop/Git，以免漏掉点文件或目录。ZIP 更适合作为额外的 Release 附件。

## 包中包含与排除

包含：源码、锁文件、当前 `client-v0.3.2.js`、必要测试、MIT/第三方声明、当前文档、打包工具和文件哈希清单。

排除：所有个人模型/贴图/参考图，Blender/GLB/FBX/OBJ/STL/USD 等资产，`.git`、`node_modules`、运行项目、`state.json`、`secrets`、Key、日志、截图、历史 bundle、旧 ZIP/HTML 和安装备份。

唯一图片是 `plugin/tests/fixtures/reference.png`：256×256 白底绿色矩形，用于测试，不是模型、贴图或角色参考图。测试代码运行时临时生成的极小几何数据也不会以模型文件形式发布。

`.gitignore` 防止常见误添加，但它不是安全边界：已跟踪的敏感文件、历史内容和 `git add -f` 不会因此自动消失。

## 校验交付包

需要 Python 3.10+。外部 `*.zip.sha256` 是 ZIP 的 SHA-256；Windows 可先运行：

```powershell
Get-FileHash ..\dsh-tripo-blender-v0.3.2-github-20260926.zip -Algorithm SHA256
```

将结果与旁边的 `.sha256` 文件比较。再校验 ZIP 内逐文件哈希和严格排除规则：

```powershell
python -B .\tools\verify_release.py ..\dsh-tripo-blender-v0.3.2-github-20260926.zip
# 或校验刚解压、尚未初始化 Git/安装依赖/运行测试的干净目录：
python -B .\tools\verify_release.py .
```

`SHA256SUMS.txt` 覆盖发布包内其余所有文件；清单本身由整个 ZIP 的外部哈希覆盖。哈希用于传输完整性检查，**不是维护者数字签名，也不是安全或版权保证**。

目录校验故意严格：添加 `.git`、开发依赖、测试输出或修改源码后，原快照不再逐字节相同。此时应重新审计/打包，再校验新包，不要通过删除自己的 Git 历史来迁就校验器。

## 以后如何重新打包

1. 修改源码后先重新构建、测试、审阅差异与依赖报告。
2. 审核新增文件是否真的适合公开，再将其**显式加入** `tools/release-files.txt`（按路径排序，不能重复）。不得把模型、私人素材或本地配置加入白名单。
3. 必要时同步版本/构建入口及工具的版本限制，更新 CHANGELOG 和审计日期。
4. 在仓库根目录运行，输出路径必须位于仓库外，且不能覆盖已有包：

```powershell
python -B .\tools\package_release.py ..\dsh-tripo-blender-new-reviewed-snapshot.zip
python -B .\tools\verify_release.py ..\dsh-tripo-blender-new-reviewed-snapshot.zip
```

工具只读取白名单文件，拒绝路径越界、符号链接、禁止扩展名、历史 bundle、异常大文件和部分高置信凭据模式；重新生成内嵌哈希及外部 SHA-256。未列入白名单的模型即使放在源码树内也不会被复制。不要只依赖扩展名或扫描器判断文件是否可以公开。

上传后建议开启 GitHub 可用的安全告警/依赖更新功能；发现已泄露凭据时先撤销/轮换，再处理 Git 历史和其他副本。

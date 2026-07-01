# 合伙人收益系统

当前版本：V1.0 网页稳定版

合伙人收益系统是一个本地运行的 React + TypeScript + Vite 网页应用，用于记录合伙人资金批次、月度收益结算、年度分红汇总、分红支付和数据备份恢复。系统不接入云服务，不做登录系统，数据默认保存在当前浏览器本地。

## 功能摘要

- 合伙人管理
- 资金批次
- 月度结算
- 年度汇总
- 分红支付
- 收益计算器
- CSV / XLSX 导出
- 数据备份恢复

## 使用说明

- 页面可通过 GitHub Pages 打开。
- 数据保存在当前浏览器本地。
- 换设备、换浏览器或清理浏览器数据后，不会自动同步原有数据。
- 如需换设备或备份账务，请使用系统内的完整 JSON 备份导出 / 导入功能。
- 锁定月份前应先人工复核金额，并导出完整备份。

## 安全说明

- 不要上传真实备份文件。
- 不要把 `release-evidence/` 外发。
- 不要把 `data/trial/` 外发。
- 不要手动编辑 JSON 备份文件。
- 不要把 `.env`、密钥、Token、真实备份或真实报表提交到 GitHub。
- 对外发布包应使用空库版本。

## 运行命令

```bash
npm ci
npm run dev
```

PowerShell 如果拦截 `npm.ps1`，可使用：

```bash
npm.cmd ci
npm.cmd run dev
```

## 验证命令

```bash
npm run test
npm run lint
npm run build
```

PowerShell 可使用：

```bash
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

## 部署说明

项目已配置 GitHub Actions 自动部署到 GitHub Pages：

1. 推送到 `main` 分支。
2. GitHub Actions 执行 `npm ci`、`npm run test`、`npm run lint`、`npm run build`。
3. 构建产物 `dist/` 上传到 GitHub Pages。
4. 仓库 Settings -> Pages 中 Source 选择 GitHub Actions。

如果仓库名为普通项目仓库，Vite 会在 GitHub Actions 中按仓库名自动设置访问路径。  
如果仓库名为 `<用户名>.github.io`，访问路径会使用站点根路径 `/`。

## 业务口径

- 普通合伙人使用年化单利收益率。
- 折合月收益率 = 年化收益率 ÷ 12。
- 按自然月结算。
- 月中加入首月按实际计息天数折算。
- 第二个月开始按整月计息。
- 年度周期为公历自然年度：每年 1 月 1 日至 12 月 31 日。
- locked / adjusted 月份不可直接修改，历史修正通过调整记录处理。

## 发布文档

- `docs/V1.0-定版说明.md`
- `docs/V1.0-发布确认报告.md`
- `docs/V1.0-需求覆盖矩阵.md`
- `docs/V1.0-GitHub发布说明.md`

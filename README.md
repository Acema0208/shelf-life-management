# 产品保质期管理

当前目录已恢复为完整本地版项目，可直接本地运行，也支持同步和发布到云端。

## GitHub 代码备份

仓库只保存系统源码、前端资源和配置示例，不包含本地产品数据、备份、依赖目录或配置密钥。

- 产品数据库和备份保留在本机 `data/`，请单独备份。
- 飞书配置可从 `config/feishu.json.example` 复制为 `config/feishu.json` 后填写；实值配置不提交到 Git。
- 新环境先执行 `npm install`，再执行 `npm run start:local`。

## 启动

安装依赖：

```bash
npm install
```

本地直接运行：

```bash
npm run start:local
```

默认地址：`http://127.0.0.1:3751`

## 常用命令

```bash
npm run check
npm run start:local
npm run start:proxy
npm run start:public
npm run restore:backup -- /path/to/backup.json
npm run deploy:cloud
npm run check:parity
```

## 本地与云端

- 本地实例角色：`local`
- 云端实例角色：`cloud`
- 本地页面点击“同步到云端”会把当前数据推送到云端
- 云端页面不执行反向写回，本地拉取云端数据请在本地页面操作

## 发布云端

执行：

```bash
npm run deploy:cloud
```

脚本会做这些事：

- 打包项目代码（不包含 `data/` 和 `node_modules/`）
- 上传到 `root@47.245.92.187:/root/apps/ProductExpiryManager`
- 远端执行 `npm install`
- 用 PM2 重启 `expiry`
- 校验云端 `/api/runtime`

部署脚本位置：

- `scripts/deploy-cloud.sh`

## 一致性检查

执行：

```bash
npm run check:parity
```

会自动比对：

- 本地和云端的 `runtime`
- 本地和云端的 `stats`
- 产品总数和第一页数据
- 前端资源版本号

检查脚本位置：

- `scripts/check-parity.sh`

## 当前已恢复内容

- 本地 Express 服务
- SQLite 数据库
- 产品列表 / 录入 / 编辑 / 删除
- 出入库状态修改
- 批量导入 CSV
- 操作日志
- 备份导出 / 备份预览 / 备份恢复
- Excel / CSV 导出
- 手机访问地址 / 二维码
- 本地健康检查与运行信息
- 本地到云端数据同步
- 云端代码发布脚本

## 数据文件

- 数据库：`data/products.db`
- 备份目录：`data/backups/`

## 兼容保留

- `proxy-server.js` 保留了旧的本地代理实现
- 如需回到代理模式，可执行：

```bash
npm run start:proxy
```

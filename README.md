# 北京市青年铸牢文创设计大赛 H5 投票系统

项目包含 Vue 3 H5、后台管理页面、Express API 和 PostgreSQL 数据层。

## 技术栈

- Vue 3 + TypeScript + Vite
- Express + TypeScript
- PostgreSQL + Prisma ORM
- Nginx + PM2（生产环境）

## 本地运行

1. 安装依赖：

```bash
pnpm install
```

2. 复制环境变量并填写本地 PostgreSQL 连接：

```bash
cp .env.example .env
```

3. 生成 Prisma 客户端并应用 migration：

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

4. 启动前后端：

```bash
pnpm dev
```

访问地址：

- 投票页面：http://localhost:5173/vote
- 管理后台：http://localhost:5173/admin
- API：http://localhost:4173/api

## 管理员初始化

仓库不包含默认账号密码。请通过环境变量或命令参数初始化管理员：

```bash
pnpm admin:init -- --username=your-admin --password=your-strong-password
```

## 生产构建

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm build
pnpm start
```

部署前必须设置正式 `DATABASE_URL`、随机 `APP_SECRET` 和持久化上传目录。`.env`、数据库文件、上传数据及备份文件不会提交到 Git。

## 投票规则

- 首次使用手机号和短信验证码注册，不设置用户密码；后续输入已注册手机号即可登录。
- 每个手机号每天最多获取 3 次注册验证码，发送间隔 120 秒。
- 投票周期最多为 3 天，普通用户登录状态保留至投票结束后 7 天。
- 每人每天共 3 票，可将 3 票全部投给同一作品。
- 投票限制、票数增加和投票明细均由后端事务控制。
- 排名为全部作品统一排名，不再按主题分组。

## 作品导入与图片处理

- 后台支持 `.xlsx`、`.xls`、UTF-8/GB18030 `.csv` 和 Lark CLI JSON 数据。
- 新增作品必须包含作品名称、作者/团队、作品主题和作品类别。
- 后台上传和飞书附件共用同一套图片处理：封面裁剪为 1600×1200，详情图最长边不超过 1800，统一输出 WebP。
- 飞书附件优先通过 `file_token` 下载；执行 `pnpm lark:import-works` 前，服务器上的 `lark-cli` 必须具有可用的用户授权和文件下载权限。
- Excel 导出包含全部作品排名、各主题作品排名、每日投票统计、访问统计和举报记录。前台仍使用全部作品统一排名。

## 生产注意事项

- 必须接入正式短信服务商；本地开发环境仅返回调试验证码。
- 必须使用 HTTPS，并将 Cookie 配置为 `Secure`。
- HTTPS 接入后设置 `COOKIE_SECURE=true`；Nginx 反向代理保持 `X-Forwarded-Proto` 请求头，`TRUST_PROXY=1`。
- 正式上线前清除模拟票数和测试投票记录。
- PostgreSQL 与 `data/uploads` 需要独立备份。

详细部署步骤见 [部署说明](docs/部署说明.md)。

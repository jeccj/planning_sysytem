# backend-ts（NestJS 后端）

## 环境要求
- Node.js 18+
- npm 9+

## 本地启动
1. 安装依赖
```bash
npm install
```

2. 检查 `.env`
```env
PORT=8001
DATABASE_PATH=../campus.db
JWT_SECRET=SECRET_KEY_FOR_DEV_ONLY
JWT_EXPIRATION=30m
GEMINI_API_KEY=your_gemini_api_key_here
```

3. 启动开发服务
```bash
npm run start:dev
```

默认地址：`http://localhost:8001`

## 管理员账号与密码
- 默认管理员用户名：`admin`
- 默认管理员密码：`admin123`

如果忘记管理员密码，在 `backend-ts` 目录执行：
```bash
node reset_admin.js
```

该脚本会：
- 若 `admin` 已存在：重置密码为 `admin123`
- 若 `admin` 不存在：创建 `admin` 并设置密码为 `admin123`

## 常用命令
```bash
npm run build
npm run start:prod
npm run test
```

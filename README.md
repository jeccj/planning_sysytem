# 校园场馆预约系统

## 安装与运行说明

### 前置条件
- Node.js 18+（前后端都需要）
- npm 9+

### 后端（TypeScript / NestJS）
1. 进入 `backend-ts` 目录：
   ```sh
   cd backend-ts
   ```
2. 安装依赖：
   ```sh
   npm install
   ```
3. 检查环境变量（默认可直接本地跑）：
   - `PORT=8001`
   - `DATABASE_PATH=../campus.db`
   - `JWT_SECRET=SECRET_KEY_FOR_DEV_ONLY`
4. 启动开发服务：
   ```sh
   npm run start:dev
   ```
   默认地址：`http://localhost:8001`

### 管理员密码重置（TypeScript 后端）
如果忘记 `admin` 密码，在 `backend-ts` 目录执行：
```sh
node reset_admin.js
```
该脚本会将 `admin` 密码重置为 `admin123`（若用户不存在会自动创建）。

### 前端 (Frontend)
1. 进入 `frontend` 目录：
   ```sh
   cd frontend
   ```
2. 安装依赖：
   ```sh
   npm install
   ```
3. 启动开发服务器：
   ```sh
   npm run dev
   ```
4. 浏览器访问 `http://localhost:5173`
   - Vite 已配置将 `/api` 代理到 `http://127.0.0.1:8001`

### 默认测试账号
- **系统管理员**: `admin / admin123`（可通过 `node reset_admin.js` 重置）
- 其他账号请在系统内创建，或使用现有数据库中的用户

## 功能特性
- **智能搜索**: 支持自然语言搜索场馆 (Mock/AI 模拟)。
- **AI 审计**: 对预约申请内容进行风险评分。
- **角色权限**: 分为 学生、场馆管理员、系统管理员。

## 前端交互约定（当前实现）
- **二级弹窗层级**: 所有 `glass-dialog` 均在当前视图容器内渲染（非 `body` 全屏覆盖）。
- **弹窗位置**: 二级弹窗默认按“用户可用区域中心”定位，移动端/横屏按安全区自适应。
- **顶部用户岛**: 用户岛右对齐；用户菜单为紧凑 `pill`，从用户岛左侧弹出。
- **页面操作按钮**: `新增场馆 / 新增用户 / 发布公告` 保持在各自页面工具栏，不放在标题岛。

## 目录说明
- `backend-ts/`: 当前使用的 TypeScript 后端（NestJS）
- `frontend/`: Vue 3 + Element Plus 前端
- `backend/`: 旧版 Python 后端（legacy，当前默认不使用）

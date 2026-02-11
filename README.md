# 校园场馆预约系统

当前默认运行栈：`Vue 3 + Element Plus`（前端）+ `NestJS + TypeORM + SQLite`（后端）。

## 快速启动

### 前置环境
- Node.js `18+`
- npm `9+`

### 启动后端（TypeScript / NestJS）
1. 进入目录：
   ```sh
   cd backend-ts
   ```
2. 安装依赖：
   ```sh
   npm install
   ```
3. 启动开发服务：
   ```sh
   npm run start:dev
   ```
4. 默认地址：`http://localhost:8001`

### 启动前端（Vue / Vite）
1. 进入目录：
   ```sh
   cd frontend
   ```
2. 安装依赖：
   ```sh
   npm install
   ```
3. 启动：
   ```sh
   npm run dev
   ```
4. 访问：`http://localhost:5173`
   - 已配置代理：`/api -> http://127.0.0.1:8001`

## 环境变量

后端常用变量（`backend-ts/.env`）：
- `PORT=8001`
- `DATABASE_PATH=../campus.db`
- `JWT_SECRET=SECRET_KEY_FOR_DEV_ONLY`
- `JWT_EXPIRATION=30m`

## 默认账号
- 系统管理员：`admin / admin123`
- 如忘记管理员密码（或管理员不存在）：
  ```sh
  cd backend-ts
  node reset_admin.js
  ```

## 当前核心功能（已实现）

### 1. 预约能力
- 普通预约
- 批量预约（`/reservations/batch`）
- 循环预约（`/reservations/recurring`）
- 冲突检测、维护时段阻塞、时区统一解析

### 2. 场馆管理与浏览（楼栋 -> 教室）
- 管理员端：先看楼栋卡片，再进入二级教室列表操作
- 学生端：浏览页同样按楼栋聚合，再进入楼栋查看场馆

### 3. 权限模型
- `sys_admin`：全量权限
- `venue_admin`：
  - 可按 `managed_building / managed_floor` 进行范围管理
  - 若未配置范围，则回退为按 `admin_id` 管辖
- `floor_admin`：必须有楼栋/楼层范围
- `student_teacher`：预约、查看本人相关内容

### 4. 账号与密码找回
- 密码为哈希存储（`bcrypt`），不能反查“原密码”
- 新增 `identity_last6`（身份证后六位）作为应急密码依据
- 登录页支持“忘记密码（后六位验证）”
- 管理员可在用户管理中：
  - 检索用户名/ID/后六位
  - 查看应急密码是否配置
  - 一键重置用户密码为后六位

## 关键接口（新增/常用）

### 认证
- `POST /auth/login`
- `POST /auth/change-password`
- `POST /auth/forgot-password`
  - body: `username`, `identity_last6(6位数字)`, `new_password`

### 用户管理（系统管理员）
- `GET /users`
- `GET /users/credentials`（用户名 + 角色 + 后六位）
- `POST /users/:id/reset-password-identity`（重置为后六位）
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

### 场馆
- `GET /venues`
- `GET /venues/building-availability`
- `GET /venues/structure`

## 前端交互约定（当前实现）
- 二级弹窗统一在当前视图容器渲染（非全屏 body 覆盖）
- 弹窗按“当前可用区域中心”定位
- 多处列表改为紧凑卡片/圆角矩形样式，统一 glass UI 规范
- 概览页请求采用容错聚合：单接口失败不再整页失败

## 常见问题排查

### 1) “加载概览数据失败”
- 现在只有关键接口同时失败才会报错。
- 请检查：
  1. 后端是否在 `8001` 运行
  2. 前端 token 是否有效（401 会自动登出）
  3. `/api` 代理是否正常

### 2) “楼栋空闲数据失败”
- 前端已带本地兜底聚合，接口异常时会降级显示。
- 若希望真实占用状态准确，请确认后端 `building-availability` 可访问。

## 目录结构
- `backend-ts/`：当前使用的 TypeScript 后端（NestJS）
- `frontend/`：当前前端（Vue 3）
- `backend/`：旧版 Python 后端（legacy，不作为默认运行）

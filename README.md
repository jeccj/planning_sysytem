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

### 结构化导入（系统管理员）
- 前端入口：`系统设置 -> 结构化数据导入（用户 / 场馆）`
- 后端接口：`POST /system-config/import/structured`
- 上传方式：`multipart/form-data`
  - `users_file`：用户 CSV（可选）
  - `venues_file`：场馆 CSV（可选）
  - `dry_run`：`true/false`，默认 `true`
  - `replace_classrooms`：`true/false`，默认 `false`
- 严格校验：CSV 不按模板会直接 `400 Bad Request`，并返回明确原因（缺列、重复列、未知列、空文件、字段值非法、关联管理员不存在等）
- 详细模板和字段规则：`backend-ts/docs/STRUCTURED_IMPORT.md`

## 前端交互约定（当前实现）
- 二级弹窗统一在当前视图容器渲染（非全屏 body 覆盖）
- 弹窗按“当前可用区域中心”定位
- 多处列表改为紧凑卡片/圆角矩形样式，统一 glass UI 规范
- 概览页请求采用容错聚合：单接口失败不再整页失败
- 移动端页面根容器固定 `100dvh`，禁止页面缩放与整页偏移
- 移动端不启用 safe-area 额外补偿，底部 tab 保持居中基线
- 底部/横屏 tab 尺寸改为动态响应（`clamp + vw/vh`），不再使用固定像素宽高

## 近期完成工作（已落地）
- 后端切换并稳定在 `backend-ts`（NestJS + TypeORM + SQLite），Python 版保留为 legacy。
- 完成楼栋 -> 楼层 -> 教室的数据结构改造，管理员与楼层权限绑定（`managed_building / managed_floor`）。
- 管理员端权限隔离完成：概览、场馆管理、审核、公告等按角色和范围显示。
- 预约能力增强：普通预约、批量预约、循环预约接口已可用；学生端已接入单次/批量/循环三模式提交。
- 预约冲突策略增强：审批阻塞槽位、并发冲突拦截、统一时区输入校验（带 `Z` 或 `+08:00`）。
- 楼栋空闲看板已在管理员端和学生端接入，接口异常时支持本地聚合兜底。
- 账号体系增强：忘记密码（身份证后六位）、管理员检索账号凭据、按后六位重置密码。
- 公告弹窗优化：同一公告读过后不再每次登录重复弹出（按用户记录已读 ID）。
- 系统设置新增结构化导入（用户/场馆）入口，支持 dry-run、替换教室、严格格式校验与明确报错。
- UI 统一收敛：大量页面改为紧凑 pill/card + 统一玻璃风格，移动端/横竖屏适配持续优化。
- 移动端最终态：viewport 禁缩放、根层防滚动漂移、底部 tab 居中扭正，横屏小高度场景按视口动态缩放。

## 可能还需要改进（建议下一步）
- 二级菜单/弹层在部分设备与浏览器（尤其 Safari）仍可能出现首帧发糊或轻微闪烁，建议继续做弹层场景降级样式（无 blur 纯色卡片）和动画分级。
- 批量/循环预约当前主要通过 toast 展示结果，建议增加“失败明细面板”便于快速修正具体条目。
- 结构化导入建议补充“模板下载按钮 + 前端预校验 + 导入预览对比”，减少正式导入试错成本。
- 建议增加关键 E2E 回归用例：权限隔离、预约冲突、弹层可读性、移动端布局，避免后续迭代回归。
- 前端主包体积偏大（build 警告 >500KB），建议做路由级分包和手动 chunk 优化首屏性能。
- 目前仍有部分页面使用假数据/兜底数据，建议尽快切换到统一结构化导入后的真实数据源并建立增量同步机制。

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

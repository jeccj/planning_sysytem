# 校园场馆预约系统

> 技术栈：`Vue 3 + Element Plus + Vite`（前端）+ `NestJS 11 + TypeORM + SQLite`（后端）

---

## 目录结构

```
planning_sysytem/
├── campus.db                  # SQLite 主数据库（项目根目录）
├── backend-ts/                # NestJS 后端（TypeScript）
│   ├── src/
│   │   ├── auth/              # 认证（JWT + bcrypt）
│   │   ├── users/             # 用户管理
│   │   ├── venues/            # 场馆管理
│   │   ├── reservations/      # 预约管理
│   │   ├── announcements/     # 公告
│   │   ├── notifications/     # 通知
│   │   ├── system-config/     # 系统配置 & 结构化导入
│   │   ├── nlp/               # NLP 自然语言搜索
│   │   ├── llm/               # LLM 服务（Gemini）
│   │   ├── common/            # 枚举、守卫、装饰器、工具函数
│   │   └── config/            # 数据库配置
│   ├── scripts/               # 结构化导入脚本 & CSV 模板
│   ├── docs/                  # 导入字段规则文档
│   ├── uploads/               # 场馆照片存储
│   ├── reset_admin.js         # 管理员密码重置脚本
│   └── .env                   # 环境变量
├── frontend/                  # Vue 3 前端
│   └── src/
│       ├── views/             # 页面组件
│       │   ├── Login.vue
│       │   ├── Announcements.vue
│       │   ├── student/       # 学生端（Dashboard、Reservations）
│       │   └── admin/         # 管理端（Dashboard、Venues、Audit、Users、Settings、Announcements）
│       ├── components/        # 共享组件（VenueCard、SmartSearch 等）
│       ├── stores/            # Pinia 状态管理
│       ├── api/               # Axios 封装
│       ├── router/            # 路由 & 守卫
│       └── utils/             # 工具函数
└── backend/                   # 旧版 Python 后端（legacy，不作为默认运行）
```

---

## 快速启动

### 前置环境

- Node.js **18+**
- npm **9+**

### 1. 启动后端

```sh
cd backend-ts
npm install

# 开发使用
npm run dev

# 实际生产（需先构建前端）
npm run build
npm run start:prod

```

### 2. 启动前端

```sh
cd frontend
npm install

# 开发使用
npm run dev

# 实际生产
npm run build

```

访问：`http://localhost:5173`

### 3. 默认账号

| 角色 | 账号 / 密码 |
|------|------------|
| 系统管理员 | `admin` / `admin123` |

如忘记密码或管理员不存在：

```sh
cd backend-ts
node reset_admin.js
```

---

## 环境变量

文件位置：`backend-ts/.env`

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8001` | 后端监听端口 |
| `DATABASE_PATH` | `../campus.db` | SQLite 数据库相对路径（相对 `backend-ts/`） |
| `JWT_SECRET` | `SECRET_KEY_FOR_DEV_ONLY` | JWT 签名密钥（**生产环境务必修改**） |
| `JWT_EXPIRATION` | `30m` | Token 有效期 |
| `GEMINI_API_KEY` | — | Google Gemini API Key（用于 NLP 场地搜索与 AI 审核） |

---

## 核心功能

### 1. 预约系统

- **单次预约** — 选择场地、时间段、填写活动信息后提交
- **批量预约** — 一次提交多个不同场馆/时段的预约（`POST /reservations/batch`）
- **周期预约** — 按日/周频率自动生成重复预约（`POST /reservations/recurring`）
- **冲突检测** — 审批阻塞槽位机制，基于 `reservation_slots` 表实现精确到时段的并发冲突拦截
- **状态机** — 预约状态严格遵循合法流转：`PENDING → APPROVED / REJECTED / CANCELED`，`APPROVED → USED / CANCELED / REJECTED`，终态不可逆
- **AI 审核** — 创建预约时自动调用 LLM 对活动方案评分（`ai_risk_score` / `ai_audit_comment`）
- **时区强制** — 所有时间输入必须带时区后缀（`Z` 或 `+08:00`），统一解析
- **时间校验** — 预约开始时间必须在当前时间之后

### 2. 场馆管理

- **楼栋 → 楼层 → 教室** 三级数据结构，支持结构化浏览与统计
- **楼栋可用性看板** — 实时统计各楼栋/楼层的空闲、占用、维护教室数量
- **场地维护调度** — 管理员可对场地安排维护时段，自动取消冲突预约并通知用户
- **照片管理** — 支持多图上传（最多 10 张，≤5MB/张）
- **AI 搜索** — 学生可用自然语言描述需求，LLM 解析为搜索意图后匹配场地

### 3. 权限模型（RBAC）

| 角色 | 权限范围 |
|------|----------|
| `sys_admin` | 全量权限：用户管理、系统配置、所有场馆和预约 |
| `venue_admin` | 管辖范围内场馆/预约的管理（按 `managed_building` / `managed_floor`，未配置则按 `admin_id`） |
| `floor_admin` | 必须配置楼栋/楼层范围，仅管理范围内场馆/预约 |
| `student_teacher` | 预约场地、查看本人预约、查看公告/通知 |

### 4. 账号安全

- 密码 **bcrypt** 哈希存储，不可逆
- 支持 `identity_last6`（身份证后六位）作为密码找回凭据
- 登录页内置"忘记密码"功能（用户名 + 后六位验证）
- 管理员可在用户管理中：检索凭据、查看是否配置后六位、一键重置密码
- 首次登录强制改密（`is_first_login` 标记）
- 创建/更新用户时自动校验用户名唯一性

### 5. 公告与通知

- **公告** — 系统管理员发布，支持按角色定向推送（`target_role`），已读状态按用户记录
- **通知** — 系统自动生成（预约状态变更、维护取消等）或管理员手动发送，支持已读/全部已读/删除

### 6. 结构化导入

- 入口：`系统设置 → 结构化数据导入`
- 支持 CSV 批量导入用户和场馆
- 提供 `dry_run` 模式预检和 `replace_classrooms` 替换模式
- 严格校验字段格式，错误时返回明确原因
- 模板和字段规则详见 `backend-ts/docs/STRUCTURED_IMPORT.md`

---

## API 接口一览（37 个端点）

### 认证 (`/auth`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 无 | 登录，返回 JWT |
| PUT | `/auth/change-password` | 已登录 | 修改密码（需旧密码） |
| POST | `/auth/forgot-password` | 无 | 身份证后六位重置密码 |

### 用户 (`/users`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/users/me` | 已登录 | 当前用户信息 |
| GET | `/users` | `sys_admin` | 用户列表 |
| GET | `/users/credentials` | `sys_admin` | 用户凭据（含后六位配置状态） |
| POST | `/users` | `sys_admin` | 创建用户（含唯一性校验） |
| PUT | `/users/:id` | `sys_admin` | 更新用户 |
| POST | `/users/:id/reset-password-identity` | `sys_admin` | 重置密码为身份证后六位 |
| DELETE | `/users/:id` | `sys_admin` | 删除用户（不能删除自己） |

### 场馆 (`/venues`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/venues` | 已登录 | 场馆列表（按角色范围过滤） |
| GET | `/venues/structure` | 管理员 | 楼栋-楼层-教室结构树 |
| GET | `/venues/building-availability` | 已登录 | 楼栋可用性统计 |
| GET | `/venues/search` | 已登录 | AI 自然语言搜索 |
| GET | `/venues/:id` | 已登录 | 场馆详情 |
| POST | `/venues` | `sys_admin` | 创建场馆 |
| PUT | `/venues/:id` | 管理员 | 更新场馆（范围校验） |
| DELETE | `/venues/:id` | 管理员 | 删除场馆（范围校验） |
| POST | `/venues/:id/photos` | 管理员 | 上传照片 |
| DELETE | `/venues/:id/photos` | 管理员 | 删除照片 |
| POST | `/venues/:id/maintenance` | 管理员 | 安排维护（含时间校验） |

### 预约 (`/reservations`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/reservations` | 已登录 | 预约列表（管理员看管辖范围，学生看自己的） |
| POST | `/reservations` | 已登录 | 创建单个预约（支持附件上传 ≤10MB） |
| POST | `/reservations/batch` | 已登录 | 批量预约 |
| POST | `/reservations/recurring` | 已登录 | 周期预约 |
| PUT | `/reservations/:id` | 已登录 | 更新预约状态（含状态机校验） |
| DELETE | `/reservations/:id` | 管理员 | 删除预约 |

### 公告 (`/announcements`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/announcements` | 已登录 | 公告列表（按角色过滤可见范围） |
| GET | `/announcements/latest` | 已登录 | 最新公告 |
| POST | `/announcements` | `sys_admin` | 创建公告 |
| PUT | `/announcements/:id` | `sys_admin` | 更新公告 |
| DELETE | `/announcements/:id` | `sys_admin` | 删除公告 |

### 通知 (`/notifications`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/notifications` | 已登录 | 当前用户通知列表 |
| GET | `/notifications/unread-count` | 已登录 | 未读通知数 |
| POST | `/notifications` | `sys_admin` | 发送通知 |
| PUT | `/notifications/:id/read` | 已登录 | 单条标记已读 |
| PUT | `/notifications/read-all` | 已登录 | 全部标记已读 |
| DELETE | `/notifications/:id` | 已登录 | 删除通知 |

### 系统配置 (`/system-config`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/system-config` | `sys_admin` | 获取所有配置项 |
| PUT | `/system-config` | `sys_admin` | 批量更新配置 |
| POST | `/system-config/import/structured` | `sys_admin` | CSV 结构化导入（用户/场馆） |

### NLP (`/nlp`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/nlp/parse` | 已登录 | 自然语言 → 预约意图解析 |

---

## 前端页面（11 个路由）

| 路径 | 页面 | 允许角色 |
|------|------|----------|
| `/login` | 登录 / 忘记密码 | 所有人 |
| `/student/dashboard` | 学生首页（搜索、浏览场馆、楼栋看板） | `student_teacher` |
| `/student/reservations` | 我的预约 | `student_teacher` |
| `/announcements` | 公告列表 | 所有已登录角色 |
| `/admin/dashboard` | 管理概览（楼栋看板、统计数据） | 管理员 |
| `/admin/venues` | 场馆管理（楼栋 → 教室二级列表） | 管理员 |
| `/admin/audit` | 预约审核 | 管理员 |
| `/admin/users` | 用户管理 | `sys_admin` |
| `/admin/settings` | 系统设置 & 结构化导入 | `sys_admin` |
| `/admin/announcements` | 公告管理 | `sys_admin` |

---

## 前端交互规范

- 全局 **Glass UI**（毛玻璃风格）统一设计语言
- 二级弹窗在当前视图容器渲染，按可用区域中心定位
- 概览页采用容错聚合：单接口失败不阻塞整页
- 401 自动登出并跳转登录页（含防重入机制），登出时清除请求头
- 移动端适配：`100dvh` 固定视口、禁止缩放、底部 Tab 动态响应尺寸

---

## 枚举定义

### 用户角色 (`UserRole`)
`student_teacher` | `venue_admin` | `floor_admin` | `sys_admin`

### 场馆状态 (`VenueStatus`)
`available` | `maintenance`

### 预约状态 (`ReservationStatus`)
`pending` | `approved` | `rejected` | `canceled` | `used` | `maintenance`

**合法状态流转：**
```
PENDING  → APPROVED / REJECTED / CANCELED
APPROVED → USED / CANCELED / REJECTED
其余终态（REJECTED / CANCELED / USED / MAINTENANCE）不可再变更
```

---

## 常见问题

### "加载概览数据失败"

1. 确认后端在 `8001` 端口运行
2. 确认前端 token 有效（401 会自动登出跳转）
3. 确认 Vite 代理配置 `/api → http://127.0.0.1:8001` 正常

### "楼栋空闲数据失败"

前端已具备本地兜底聚合，接口异常时会降级显示。若需准确的占用状态，确认 `/venues/building-availability` 接口可访问。

### 管理员无法登录

运行 `cd backend-ts && node reset_admin.js` 重置密码为 `admin123`。

### 数据库路径问题

`.env` 中 `DATABASE_PATH=../campus.db` 是相对 `backend-ts/` 的路径，编译后从 `dist/` 运行时通过 `path.join(__dirname, '../..', dbPath)` 正确解析到项目根目录。确保不要额外多加或少加 `..` 层级。

---

## NPM 脚本

### 后端 (`backend-ts/`)

| 命令 | 说明 |
|------|------|
| `npm run start:dev` | 开发模式（热重载） |
| `npm run build` | 编译 TypeScript |
| `npm run start:prod` | 生产模式运行 |
| `npm run bootstrap:structure` | 生成结构化导入模板 CSV |
| `npm run import:structured` | 命令行执行结构化导入 |

### 前端 (`frontend/`)

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览生产构建 |

---

## 主要依赖版本

### 后端

| 依赖 | 版本 |
|------|------|
| NestJS | 11.x |
| TypeORM | 0.3.28 |
| SQLite (sqlite3) | 5.1.7 |
| Passport + JWT | passport-jwt 4.0, @nestjs/jwt 11.0 |
| bcrypt | 6.0 |
| class-validator | 0.14.3 |
| @google/generative-ai | 0.24.1 |
| dotenv | 17.2 |

### 前端

| 依赖 | 版本 |
|------|------|
| Vue | 3.3.x |
| Element Plus | 2.4.x |
| Vite | 4.5.x |
| Pinia | 2.1.x |
| Vue Router | 4.2.x |
| Axios | 1.6.x |
| @vueuse/core | 14.1.x |

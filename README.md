# 校园场馆预约系统

> 技术栈：`Vue 3 + Element Plus + Vite`（前端）+ `NestJS 11 + TypeORM + SQLite`（后端）

---

## 项目简介

这是一个面向高校“场馆/教室预约”的全流程系统，覆盖：

- 场馆检索与预约
- 审核与风险评估
- 公告与通知
- 用户与权限管理
- LLM 智能搜索与智能填表

系统采用前后端分离，支持移动端与桌面端自适应，并以 Glass UI 作为主要视觉语言。

---

## 用户视角（你能做什么）

### 1. 学生/教师端

- 顶层 4 个功能入口：`总览`、`场馆`、`搜索`、`预约`
- `搜索`支持自然语言输入，例如：
  - “明天下午在明德楼找能坐 60 人、有投影仪和白板的教室”
- 智能搜索会：
  - 自动解析人数、楼栋、时间、设备等条件
  - 给出“最佳结果”
  - 其余候选折叠在“更多匹配”中
- 支持智能填入预约表单（活动名称、人数、时间、联系人等）
- 首次进入智能搜索有分步式引导 Demo（使用预置数据，不影响真实业务）
- 预约支持：
  - 单次预约
  - 批量预约
  - 周期预约
- 可查看我的预约状态：`待审核` / `通过` / `驳回` / `取消` / `已使用`

### 2. 管理员端

- 管理概览：统计、楼栋空闲看板、近期动态
- 场馆管理：
  - 场馆信息维护
  - 场地维护时段设置
  - 维护期间自动影响冲突预约并发送通知
- 审核管理：
  - 预约审批
  - AI 风险评分辅助
- 用户管理：
  - 按角色分组卡片查看（系统管理员、场馆管理员、楼层管理员、师生）
  - 组内展开查看具体人员，便于大数据量场景检索
- 系统设置：
  - 模型提供商/API Key/模型参数
  - 提示词配置（含安全保护）

### 3. 登录、通知与安全体验

- 支持“忘记密码”（用户名 + 身份证后六位）
- 首次登录可强制改密
- 同一账号多端登录时，旧会话自动失效（单活会话）
- 登录后“公告/通知弹窗”支持全局仅自动展示一次（管理员不自动弹）

---

## 本次新增与改进（重点）

### A. 智能搜索与预约链路

- 新增/强化 `search-smart` 智能搜索链路，返回结构化意图 + 检索解释（insight）
- 增加楼栋关键词识别能力（含中文楼栋表达与 `building` 英文表达）
- 智能链路异常时自动降级到基础检索，避免“完全不可用”
- 搜索结果端加入“最佳结果 + 更多候选”展示策略
- 智能填表逻辑对接搜索意图，减少用户重复输入

### B. LLM 提示词治理与安全

- 仅 `sys_admin` 可修改 LLM 提示词
- 修改可编辑提示词时需二次密码确认
- 固定模板区块（如返回格式/示例）后端锁定，不可修改
- API Key 读取不回显，前端仅展示“是否已配置”
- 补齐默认提示词接口：`GET /system-config/llm-prompt-defaults`

### C. 账户与会话安全

- 登录成功生成会话标识（sid），JWT 校验 sid 一致性
- 新登录自动挤掉旧设备会话，避免多端并发登录风险
- 401 拦截逻辑优化：防重复弹窗、防抖、统一退出与跳转

### D. 通知与弹窗策略

- 登录自动公告/通知弹窗改为“全局一次”
- 管理员账号默认不触发自动公告弹窗
- 增强弹窗可控性与关闭行为，避免误关闭造成流程割裂

### E. UI / 动画 / 性能

- 全局消减 `transition: all`，改为明确属性过渡
- 增强文本溢出处理（ellipsis / multi-line clamp）
- 移动端与窄屏排版细节优化，减少错位与溢出
- 动画曲线统一为更柔和的 easing，降低突兀感
- 添加 `prefers-reduced-motion` 降级策略
- 增加滚动 RAF 节流、内容可见性优化（`content-visibility` 等）以提升流畅度

---

## 快速启动

### 环境要求

- Node.js `18+`
- npm `9+`

### 1) 启动后端

```bash
cd backend-ts
npm install
npm run dev
```

后端默认端口：`8001`

### 2) 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：`http://localhost:5173`

### 3) 默认管理员账号

- 用户名：`admin`
- 密码：`admin123`

如管理员异常可重置：

```bash
cd backend-ts
node reset_admin.js
```

---

## 开发者视角

### 1. 项目结构

```text
planning_sysytem/
├── campus.db
├── backend-ts/
│   ├── src/
│   │   ├── auth/                # 登录、JWT、单活会话
│   │   ├── users/               # 用户与角色
│   │   ├── venues/              # 场馆、维护、智能检索
│   │   ├── reservations/        # 预约与时段冲突控制
│   │   ├── announcements/       # 公告
│   │   ├── notifications/       # 通知
│   │   ├── system-config/       # 系统配置、提示词配置、结构化导入
│   │   ├── nlp/                 # NLP 解析接口
│   │   ├── llm/                 # LLM 适配与提示词模板
│   │   └── common/              # 守卫、装饰器、枚举、工具
│   └── scripts/                 # 导入脚本
└── frontend/
    └── src/
        ├── views/               # 管理端/学生端页面
        ├── components/          # SmartSearch、VenueCard、DarkBackground...
        ├── stores/              # Pinia（auth）
        ├── router/              # 路由守卫
        ├── api/                 # axios 拦截器
        └── utils/               # client-flags 等工具
```

### 2. 核心业务设计

- RBAC：
  - `sys_admin` 全量权限
  - `venue_admin` / `floor_admin` 按 `managed_building`、`managed_floor` 约束
  - `student_teacher` 仅个人预约和公共信息
- 预约冲突控制：
  - 通过 `reservation_slots` 精细化时段冲突拦截
  - 维护时段可阻断冲突预约
- 状态机：
  - `pending -> approved/rejected/canceled`
  - `approved -> used/canceled/rejected`
- 智能搜索链路：
  - `parseIntent -> resolveTimeWindow -> venueSearchScore -> insightExplain`
  - 异常自动降级，保证服务可用性

### 3. LLM 配置与提示词机制

- 可编辑提示词（管理员可改）：
  - `llm_system_prompt`
  - `llm_json_guard_prompt`
  - `llm_parse_intent_rules`
  - `llm_audit_rules`
- 固定提示词区块（后端锁定，不可改）：
  - 输出契约与示例（parse/audit）
- 修改可编辑提示词需要 `confirm_password`

### 4. 关键接口（高频）

- 认证：
  - `POST /auth/login`
  - `PUT /auth/change-password`
  - `POST /auth/forgot-password`
- 智能搜索：
  - `GET /venues/search-smart?q=...`
  - `POST /nlp/parse`
- 场馆维护：
  - `POST /venues/:id/maintenance`
- 系统配置：
  - `GET /system-config`
  - `PUT /system-config`
  - `GET /system-config/llm-prompt-defaults`

### 5. 前端工程约定（当前版本）

- 登录状态统一通过 `authStore` 管理，不在多处散写 `localStorage`
- 401 统一由 axios 拦截器处理（防重入、防抖提示）
- 首次引导、公告弹窗等“是否展示”状态统一走 `client-flags`
- 优先使用明确属性过渡，避免 `transition: all` 带来的性能抖动

---

## 环境变量（后端 `backend-ts/.env`）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8001` | 后端端口 |
| `DATABASE_PATH` | `../campus.db` | SQLite 路径 |
| `JWT_SECRET` | `SECRET_KEY_FOR_DEV_ONLY` | JWT 密钥（生产必须修改） |
| `JWT_EXPIRATION` | `30m` | Token 过期时间 |
| `GEMINI_API_KEY` | - | Gemini Key（可作为默认） |

---

## 常见问题

### 1) 智能搜索失败但页面还在

这是降级策略生效：系统会回退到基础检索并给出提示。请检查：

- LLM API Key 是否配置
- 模型服务是否可访问
- `system-config` 中 provider/base_url/model 是否正确

### 2) 登录后提示“账号已在其他设备登录”

这是单活会话策略：新登录会使旧 token 失效，属于预期安全行为。

### 3) 管理员无法登录

执行：

```bash
cd backend-ts
node reset_admin.js
```

---

## License

仅用于学习与内部项目演示，生产部署请补充正式 License、审计与合规策略。

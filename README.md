# 校园场馆预约系统

## 安装与运行说明

### 前置条件
- Python 3.10+
- Node.js 16+ (前端运行必需)

### 后端 (Backend)
1.  进入项目根目录。
2.  安装依赖（如果尚未安装）：
    ```sh
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```
3.  初始化数据库（创建 `campus.db` 并预置管理员/学生用户）：
    ```sh
    python3 -m backend.seed
    ```
4.  启动 API 服务器：
    ```sh
    uvicorn backend.main:app --reload
    ```
    启动后可访问 API 文档：`http://localhost:8000/docs`。

### 前端 (Frontend)
1.  进入 `frontend` 目录：
    ```sh
    cd frontend
    ```
2.  安装依赖：
    ```sh
    npm install
    ```
3.  启动开发服务器：
    ```sh
    npm run dev
    ```
4.  浏览器访问 `http://localhost:5173`。

### 默认测试账号
- **系统管理员 (Sys Admin)**: 用户名 `admin` / 密码 `123456`
- **场馆管理员 (Venue Admin)**: 用户名 `venue_manager` / 密码 `123456`
- **学生 (Student)**: 用户名 `student1` / 密码 `123456`

## 功能特性
- **智能搜索**: 支持自然语言搜索场馆 (Mock/AI 模拟)。
- **AI 审计**: 对预约申请内容进行风险评分。
- **角色权限**: 分为 学生、场馆管理员、系统管理员。

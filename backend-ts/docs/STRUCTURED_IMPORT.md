# 结构化数据导入说明（users / venues）

## 1. 导入目标
- 导入对象：`users`（用户）和 `venues`（场馆）
- 导入方式：CSV 文件 + 脚本 `backend-ts/scripts/import-structured.js`
- 导入策略：按业务键 upsert（存在则更新，不存在则新增）

## 2. 用户导入（users.csv）

### 2.1 文件编码与格式
- 编码：UTF-8
- 第一行必须是表头
- 逗号分隔，包含逗号的字段需双引号包裹

### 2.2 必须表头（顺序可变，但字段名必须一致）
- `username`
- `password`
- `role`
- `contact_info`
- `identity_last6`
- `managed_building`
- `managed_floor`

### 2.3 字段规则
- `username`：必填，系统唯一
- `password`：
  - 新增用户必填
  - 更新用户可空（留空表示不改密码）
- `role`：必填，枚举：`sys_admin` / `venue_admin` / `floor_admin` / `student_teacher`
- `identity_last6`：可空；填写时必须是 6 位数字
- `managed_building`、`managed_floor`：
  - `venue_admin` / `floor_admin` 至少要有一个非空
  - `sys_admin` / `student_teacher` 会被自动清空

## 3. 场馆导入（venues.csv）

### 3.1 必须表头（顺序可变，但字段名必须一致）
- `name`
- `type`
- `capacity`
- `facilities`
- `status`
- `open_hours`
- `description`
- `admin_username`

### 3.2 可选表头（可不提供）
- `building_name`
- `floor_label`
- `room_code`
- `location`
- `image_url`
- `photos`

### 3.3 字段规则
- `name`：必填
- `type`：必填
  - 兼容映射：`Classroom/Hall/Lab`、`教室/礼堂/实验室`
  - 其他非空类型字符串会按原值保存
- `capacity`：必填，正整数
- `facilities`：可空，支持两种格式
  - 分号/逗号分隔：`投影仪;白板`
  - JSON 数组：`["投影仪","白板"]`
- `status`：可空，默认 `available`；可选：`available` / `maintenance`（支持中文：可用/维护中）
- `image_url`：可空
- `photos`：可空，支持分隔字符串或 JSON 数组
- `admin_username`：必填，且必须在 users 中存在，并满足：
  - 角色为 `sys_admin` / `venue_admin` / `floor_admin`
  - 若管理员配置了 `managed_building` / `managed_floor`，则必须与场馆楼栋/楼层一致

### 3.4 结构化位置解析规则
导入脚本会优先使用 `building_name/floor_label/room_code`；若缺失则尝试从 `location`（再不行用 `name`）解析。

如果最终仍无法得到有效楼栋或楼层，会报错。

### 3.5 场馆 upsert 业务键（已更新）
- `building_name + floor_label + room_code`

> 不再把 `type` 作为 upsert 键，避免同一房间改类型时被误判为新增。

## 4. 命令
在 `backend-ts` 目录执行：

```bash
node scripts/import-structured.js --users scripts/templates/users.template.csv --venues scripts/templates/venues.template.csv --dry-run
```

真实写入：

```bash
node scripts/import-structured.js --users /path/users.csv --venues /path/venues.csv
```

先清空全部 `Classroom` 再导入（会同时删除教室关联预约与占用槽）：

```bash
node scripts/import-structured.js --users /path/users.csv --venues /path/venues.csv --replace-classrooms
```

## 5. 导入前后建议
- 导入前先备份 `campus.db`
- 先 `--dry-run`，确认无报错再正式执行
- 导入后抽查：
  - 账号可登录
  - 管理员权限隔离正确
  - 场馆的楼栋/楼层/房间显示正确

## 6. 后台内置导入接口（系统设置）

- 接口：`POST /system-config/import/structured`
- 权限：`sys_admin`
- Content-Type：`multipart/form-data`

### 6.1 表单字段
- `users_file`：可选，`users.csv`
- `venues_file`：可选，`venues.csv`
- `dry_run`：可选，`true/false`，默认 `true`
- `replace_classrooms`：可选，`true/false`，默认 `false`

> `users_file` 和 `venues_file` 至少上传一个，否则返回 400。

### 6.2 错误返回（格式不符合时）
接口会返回 `400 Bad Request`，并给出明确错误信息，例如：
- `users.csv: missing headers -> managed_floor`
- `users.csv line 8: venue_admin requires managed_building or managed_floor`
- `venues.csv line 12: invalid capacity: abc`
- `venues.csv line 6: admin_username not found -> venue_admin_xxx`
- `venues.csv line 9: admin user "venue_admin_a" managed_building mismatch -> 艺术楼`
- `venues.csv line 14: duplicate building/floor/room in file -> 健行楼 1层 101`

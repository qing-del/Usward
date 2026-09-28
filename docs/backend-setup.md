# 后端第一轮运行说明

本轮只提供正式后端的登录与私人记忆卡片接口。`static/UI` 仍是独立的浏览器演示，不会使用这些接口。

需要 Java 21 和 MySQL 8.4。先建立空数据库（字符集 `utf8mb4`），设置 `USWARD_DB_URL`、`USWARD_DB_USER`、`USWARD_DB_PASSWORD`；变量名称见仓库根目录的 `.env.example`。数据库密码只放在本机环境或部署秘密配置中。启动应用时 Flyway 从 V1 创建表；不要先运行 `static/database/initDatabase.sql` 再让 Flyway 接管同一个库。

```sh
./mvnw -DskipTests package
java -jar target/Usward-0.0.1-SNAPSHOT.jar \
  --spring.main.web-application-type=none \
  --usward.admin.command=create-user \
  --usward.admin.username=first \
  --usward.admin.nickname=First
```

在交互终端中输入并确认密码。第二个账号重复运行命令，换用另一个用户名和昵称。正式库最多创建两个账号，不开放注册，也不提供默认密码。需要维护重置时执行：

```sh
java -jar target/Usward-0.0.1-SNAPSHOT.jar \
  --spring.main.web-application-type=none \
  --usward.admin.command=reset-password \
  --usward.admin.username=first
```

重置密码会使该账号的现有 Session 失效。正常服务用 `java -jar target/Usward-0.0.1-SNAPSHOT.jar` 启动。生产 HTTPS 下设置 `USWARD_COOKIE_SECURE=true`。

API 前缀为 `/api/v1`。匿名访问先调用 `GET /auth/csrf`，把响应中的 `token` 作为 `headerName` 指定的请求头发送给 `POST /auth/login`，JSON 正文为 `{"username":"…","password":"…"}`，并保留 Session Cookie。登录成功后重新获取 CSRF，再执行其他写操作或 `POST /auth/logout`。`GET /me` 返回当前账号摘要。演示页面的任意非空密码规则不适用于正式接口。

私密记忆卡片使用 `POST /memories` 创建、`GET /memories/{id}` 读取、`PATCH /memories/{id}` 编辑、`POST /memories/{id}/archive` 归档、`POST /memories/{id}/restore` 恢复、`DELETE /memories/{id}` 软删除。写请求使用 JSON，创建至少提供非空白的 `body`；来源类型默认 `INTERPRETATION`。编辑及状态操作必须传字符串形式的 `expectedVersion`，例如 `{"expectedVersion":"0","body":"更新后的正文"}`；删除的版本也放在请求体。每次成功写入返回递增的版本，删除返回 204；旧版本返回 409，访问他人或已删除的卡片返回 404。

`GET /memories` 支持 `page`、`size`、`scope`、`archived`、`keyword`、`category`、`tag`、`sort`。当前仅实现个人卡片，因此 `scope=PARTNER` 返回空列表；查询归档卡片需显式使用 `scope=MINE&archived=true`。列表摘要不含正文，`total` 与 `availableTags` 基于完整的当前账号可见结果计算。分享、评论、提醒和通知接口不在本轮范围内。

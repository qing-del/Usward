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

# 后端运行说明

当前正式后端提供登录、个人资料维护、私人记忆卡片、个人事件读写、私人日历范围查询、私密承诺的完整个人读写，以及个人今日聚合。正式 Vue 前端位于 [`frontend/`](../frontend/README.md) 并已接入这些单人接口；`static/UI` 仍是独立的浏览器演示，不会使用后端接口。

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

`PATCH /me` 使用当前 `GET /me` 中的字符串 `version` 作为 `expectedVersion`，可修改昵称、`avatarStyle`、IANA `timezone`、`notificationEmail` 和 `shareAvailability`。邮箱使用单个地址，传 `null` 可清空；尚未提供 SMTP，因此 `mailReminderAvailable` 始终为 false。没有有效连接时不能开启忙闲共享。`POST /me/password` 接收 `{"oldPassword":"…","newPassword":"…"}`，成功返回 204 并使该账号全部 Session 失效；随后重新获取 CSRF 并登录。

个人事件使用 `POST /events` 创建、`GET /events/{id}` 读取、`PATCH /events/{id}` 编辑、`DELETE /events/{id}` 删除。写入仅接受自己的事件字段，带时间形式为 `{"title":"阅读","allDay":false,"startsAt":"2026-09-29T09:00:00Z","endsAt":"2026-09-29T10:00:00Z","eventTimezone":"Asia/Shanghai","availability":"BUSY"}`；全天形式改用 `startDate`、`endDateExclusive`。PATCH 修改时间或时区时须提交完整的一组时间字段；其它字段可单独修改。PATCH/DELETE 都要传字符串 `expectedVersion`，旧版本返回 409。`offlineConfirmed=true` 且不提供时间时由服务端记录当前时刻；再次提交 true 保留已有时间，false 清空。

`GET /calendar` 必须提供 UTC `Z` 格式的 `from`、`to` 和 IANA `timezone`。起止值应为查询时区中的当地日界，跨度为 1–93 个日历日，区间左闭右开；例如 `GET /calendar?from=2026-09-28T16:00:00Z&to=2026-09-29T16:00:00Z&timezone=Asia/Shanghai` 查询上海时区的 9 月 29 日。可选 `scope=ALL/MINE/SHARED` 和 `includeCancelled=false/true`；目前 ALL/MINE 仅返回本人事件，SHARED 返回空集合，个人事件无取消记录。结果按事件实际开始边界与 ID 升序排列。事件提醒、双人忙闲与共同事件尚未接入。

私密承诺可通过 `POST /commitments` 创建、`GET /commitments/{id}` 查看、`PATCH /commitments/{id}` 编辑、`POST /commitments/{id}/complete` 完成、`.../cancel` 取消、`.../reopen` 重开，或以 `DELETE /commitments/{id}` 删除。创建至少提交标题，可选说明、下一步和来源；截止使用 `dueKind=NONE/DATE/INSTANT`，日期截止须同时提交 `dueDate` 与 `dueTimezone`，精确截止须提交 UTC `Z` 格式的 `dueAt`。来源只接受当前可读取的本人卡片或个人事件，`sourceId` 为十进制字符串；删去来源后承诺保留，详情的 `sourceAvailable` 变为 false。PATCH 及状态、删除操作均提交字符串 `expectedVersion`；完成可带 `result`，重开会清空完成记录。

`GET /commitments` 支持 `page`、`size`、`scope=MINE/PARTNER/ALL`、`status=OPEN/DONE/CANCELLED/ALL`、`sort=DEADLINE_ASC/UPDATED_DESC`。当前只有本人承诺，`PARTNER` 返回空结果。默认只列出 OPEN，按绝对截止时间升序排列，无截止时间的项放最后；日期截止依据保存的 IANA 时区换算。响应包含当前筛选的 `total` 和忽略 status 筛选的全量 `statusCounts`，列表摘要不包含说明或完成结果。

`GET /dashboard` 按账号时区确定今天，并返回一次捕获的 `asOf`、`timezone`、`today`、`groups`、`featuredMemory` 和 `unreadCount`。当前 `events` 只含今日相交的本人个人事件，最多 10 条；`commitments` 只含到期或逾期的本人 OPEN 承诺，逾期优先，最多 5 条。各组的 `total` 是全量计数，`hasMore` 指示是否超过上限。`featuredMemory` 是最近更新的本人未归档卡片摘要。表达、邀约和提醒组目前为空，通知尚未生成，`unreadCount` 为 0；读取不会创建通知。

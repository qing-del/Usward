-- Usward v1 数据库初始化；要求 MySQL 8.4。
-- 执行示例：mysql --default-character-set=utf8mb4 -u <用户名> -p < static/database/initDatabase.sql

SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `Usward`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `Usward`;

-- app_user：用户账号及个人设置。
CREATE TABLE IF NOT EXISTS app_user (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '业务主键，JSON 按字符串传输',
    username VARCHAR(100) NOT NULL COMMENT '登录名，唯一；应用层校验非空白，最多100字',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Spring Security自适应密码哈希，含算法标识；应用层校验非空白，最多255字',
    nickname VARCHAR(100) NOT NULL COMMENT '昵称；应用层校验非空白，最多100字',
    avatar_style VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INITIAL' COMMENT '内置头像；应用层校验INITIAL=昵称字（默认，按当前昵称派生）、FLOWER=小花、SUN=小太阳、SPROUT=新芽，不存图片',
    timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'IANA时区；应用层校验非空白、时区有效性，最多64字',
    active_connection_id BIGINT NULL COMMENT '当前有效连接的逻辑引用；在用户行锁下维护；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    share_availability BOOLEAN NOT NULL DEFAULT FALSE COMMENT '向当前连接展示忙闲，默认关闭；应用层校验0=关闭、1=开启',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    UNIQUE KEY uk_app_user_username (username),
    KEY idx_app_user_connection (active_connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='私人部署账号';

-- pair_connection：双人连接及解除记录。
CREATE TABLE IF NOT EXISTS pair_connection (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '连接主键',
    user_a_id BIGINT NOT NULL COMMENT '连接成员A；应用层校验与user_b_id不同；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    user_b_id BIGINT NOT NULL COMMENT '连接成员B；应用层校验与user_a_id不同；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE' COMMENT '连接状态；应用层校验ACTIVE=有效、ENDED=已解除',
    ended_at DATETIME(6) NULL COMMENT 'UTC解除时间；应用层校验ACTIVE时为空、ENDED时必填',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    KEY idx_pair_connection_user_a_status (user_a_id, status),
    KEY idx_pair_connection_user_b_status (user_b_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='双人连接，解除后保留历史';

-- pair_invite：一次性连接邀请及接受状态。
CREATE TABLE IF NOT EXISTS pair_invite (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '连接邀请主键',
    inviter_id BIGINT NOT NULL COMMENT '邀请者；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '高熵口令的 SHA-256 十六进制哈希，不保存明文',
    expires_at DATETIME(6) NOT NULL COMMENT 'UTC到期时间；应用层校验晚于created_at，创建时设为24小时后',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING' COMMENT '邀请状态；应用层校验PENDING=待接受、ACCEPTED=已接受、REVOKED=已撤销、EXPIRED=已过期',
    accepted_by BIGINT NULL COMMENT '接受者；应用层校验ACCEPTED时必填且不能为inviter_id，其他状态为空；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    UNIQUE KEY uk_pair_invite_token (token_hash),
    KEY idx_pair_invite_inviter_status (inviter_id, status),
    KEY idx_pair_invite_status_expires (status, expires_at),
    KEY idx_pair_invite_accepted_by (accepted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='24 小时一次性连接邀请';

-- memory_card：个人记忆卡片及主动分享信息。
CREATE TABLE IF NOT EXISTS memory_card (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '记忆卡片主键',
    owner_id BIGINT NOT NULL COMMENT '作者；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    shared_connection_id BIGINT NULL COMMENT '主动分享所绑定的连接，NULL 为私密；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    title VARCHAR(100) NULL COMMENT '可选标题',
    body TEXT NOT NULL COMMENT '正文；应用层校验非空白且总长度最多5000字',
    category VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '可选类别；应用层校验INTEREST=喜好兴趣、RECENT_CONCERN=近期关注、RELATIONSHIP_PREFERENCE=相处偏好、BOUNDARY=明确边界、SHARED_EXPERIENCE=共同经历、SELF_REFLECTION=自我反思、OTHER=其他',
    source_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INTERPRETATION' COMMENT '来源类型；应用层校验EXPLICIT=明确表达、OBSERVED=亲历事实、INTERPRETATION=我的理解，默认INTERPRETATION',
    source_date DATE NULL COMMENT '来源日期',
    next_action TEXT NULL COMMENT '可选下一步；应用层校验最多5000字',
    archived BOOLEAN NOT NULL DEFAULT FALSE COMMENT '归档只影响作者列表；应用层校验0=未归档、1=已归档',
    deleted_at DATETIME(6) NULL COMMENT 'UTC 软删除时间',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    KEY idx_memory_card_owner_updated (owner_id, updated_at),
    KEY idx_memory_card_shared_updated (shared_connection_id, updated_at),
    KEY idx_memory_card_owner_filter (owner_id, deleted_at, archived, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='记忆卡片；私人提醒另存 reminder';

-- memory_tag：记忆卡片的标签关联。
CREATE TABLE IF NOT EXISTS memory_tag (
    card_id BIGINT NOT NULL COMMENT '记忆卡片；逻辑外键 memory_card.id，由应用层校验关联及维护引用；父记录删除时由应用层在同一事务清理本表关联记录',
    tag VARCHAR(100) NOT NULL COMMENT '标签；应用层校验非空白，最多100字',
    PRIMARY KEY (card_id, tag),
    KEY idx_memory_tag_tag_card (tag, card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='记忆标签，同卡片标签唯一';

-- memory_comment：分享卡片的补充与更正。
CREATE TABLE IF NOT EXISTS memory_comment (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '补充或更正主键',
    card_id BIGINT NOT NULL COMMENT '当前分享的卡片；逻辑外键 memory_card.id，由应用层校验关联及维护引用；父记录删除时由应用层在同一事务清理本表关联记录',
    connection_id BIGINT NOT NULL COMMENT '评论所属分享连接；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    author_id BIGINT NOT NULL COMMENT '评论作者，业务层校验为连接另一方；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    body TEXT NOT NULL COMMENT '补充或更正；应用层校验非空白且总长度最多1000字',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    PRIMARY KEY (id),
    KEY idx_memory_comment_card_created (card_id, created_at),
    KEY idx_memory_comment_connection (connection_id),
    KEY idx_memory_comment_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='只追加的补充或更正，撤销分享时删除';

-- expression：连接双方的轻量表达及回应状态。
CREATE TABLE IF NOT EXISTS expression (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '表达主键',
    connection_id BIGINT NOT NULL COMMENT '表达所属连接；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    sender_id BIGINT NOT NULL COMMENT '发送者；应用层校验与recipient_id不同且均为连接成员；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    recipient_id BIGINT NOT NULL COMMENT '接收者；应用层校验与sender_id不同且均为连接成员；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '表达类型；应用层校验SPEND_TIME=想待一会儿、SHARE_SOMETHING=想分享、DO_SOMETHING=想一起做事、HURT_FEELINGS=感到不舒服、NEED_SPACE=需要独处、FREE_TEXT=自由留言',
    body TEXT NULL COMMENT '可选补充；应用层校验最多5000字；FREE_TEXT且未撤回时必填、非空白，撤回后可为空',
    response_window VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '可选回应时间；应用层校验WHEN_AVAILABLE=有空再看、TODAY=今天聊聊、NOW=现在方便吗，不自动催促',
    response_mode VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '可选回应方式；应用层校验LISTEN=听我说、THINK_TOGETHER=一起想办法、KEEP_COMPANY=陪我一下、JUST_TELLING=只想告诉你',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'OPEN' COMMENT '表达状态；应用层校验OPEN=待回应、RESPONDED=已回应、WITHDRAWN=已撤回',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    KEY idx_expression_connection_status (connection_id, status),
    KEY idx_expression_recipient_status_created (recipient_id, status, created_at),
    KEY idx_expression_sender_created (sender_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='轻量表达，撤回后 API 只返回占位';

-- expression_reply：表达的简短回应与发送者补充。
CREATE TABLE IF NOT EXISTS expression_reply (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '回应或发送者补充主键',
    expression_id BIGINT NOT NULL COMMENT '所属表达；逻辑外键 expression.id，由应用层校验关联及维护引用',
    author_id BIGINT NOT NULL COMMENT '作者，业务层校验为表达成员；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    preset VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '接收者的可选预设回应；应用层校验LATER=晚点找你、AVAILABLE_NOW=现在方便、ANOTHER_TIME=换个时间；为空时body必填且非空白，发送者补充时必须为空',
    body TEXT NULL COMMENT '可选自由回应或补充；应用层校验最多1000字；preset为空时必填且非空白，发送者补充必须使用自由正文',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    PRIMARY KEY (id),
    KEY idx_expression_reply_expression_created (expression_id, created_at),
    KEY idx_expression_reply_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='只追加的表达回应；仅接收者回应改变表达状态';

-- 邀约与事件通过逻辑外键关联，由应用层在事务中校验并维护。
-- calendar_invitation：共同安排邀约及修改提案。
CREATE TABLE IF NOT EXISTS calendar_invitation (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '日历邀约或修改提案主键',
    connection_id BIGINT NOT NULL COMMENT '所属连接；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    sender_id BIGINT NOT NULL COMMENT '发起者；应用层校验与recipient_id不同且均为连接成员；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    recipient_id BIGINT NOT NULL COMMENT '确认者；应用层校验与sender_id不同且均为连接成员；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    purpose VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'CREATE' COMMENT '邀约用途；应用层校验CREATE=创建共同安排、CHANGE=修改共同安排',
    target_event_id BIGINT NULL COMMENT '目标共同事件逻辑引用；应用层校验CREATE时为空、CHANGE时必填，在事件行锁下校验目标有效性；逻辑外键 calendar_event.id，由应用层校验关联及维护引用',
    base_event_version BIGINT NULL COMMENT '目标事件版本；应用层校验CREATE时为空、CHANGE时必填且>=0，在事件行锁下校验版本一致',
    previous_invitation_id BIGINT NULL COMMENT '替代邀约所关联的上一邀约；逻辑外键 calendar_invitation.id，由应用层校验关联及维护引用',
    source_expression_id BIGINT NULL COMMENT '可选关联表达；应用层校验仅CREATE可填写，CHANGE时为空，设置时须属于当前连接且未撤回，读取时重新鉴权；逻辑外键 expression.id，由应用层校验关联及维护引用',
    title VARCHAR(100) NOT NULL COMMENT '提议主题；应用层校验非空白，最多100字',
    starts_at DATETIME(6) NULL COMMENT '带时间安排的UTC开始时间；应用层校验与ends_at同时非空，且start_date、end_date_exclusive均为空；全天安排时为空',
    ends_at DATETIME(6) NULL COMMENT '带时间安排的UTC结束时间；应用层校验与starts_at同时非空且大于starts_at；全天安排时为空',
    start_date DATE NULL COMMENT '全天安排的当地开始日期；应用层校验与end_date_exclusive同时非空，且starts_at、ends_at均为空；带时间安排时为空',
    end_date_exclusive DATE NULL COMMENT '全天安排的当地结束日期，不含此日；应用层校验与start_date同时非空且大于start_date；带时间安排时为空',
    event_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '创建提议时的IANA时区；应用层校验非空白、时区有效性，最多64字',
    location VARCHAR(255) NULL COMMENT '可选地点',
    note TEXT NULL COMMENT '可选共同说明；应用层校验最多5000字',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING' COMMENT '邀约状态；应用层校验PENDING=待确认、ACCEPTED=已接受、DECLINED=已拒绝、WITHDRAWN=已撤回、EXPIRED=已过期、SUPERSEDED=已被替代',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    KEY idx_calendar_invitation_connection_status (connection_id, status),
    KEY idx_calendar_invitation_recipient_status (recipient_id, status, created_at),
    KEY idx_calendar_invitation_sender_created (sender_id, created_at),
    KEY idx_calendar_invitation_target_status (target_event_id, status),
    KEY idx_calendar_invitation_previous (previous_invitation_id),
    KEY idx_calendar_invitation_expression (source_expression_id),
    KEY idx_calendar_invitation_status_starts (status, starts_at),
    KEY idx_calendar_invitation_status_date (status, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='共同安排邀约及改期提案';

-- CREATE 接受时仅创建一条事件；CHANGE 接受时更新目标事件，不创建第二条事件。
-- 改期提案在原开始与新开始的较早者到达时过期，全天边界按 event_timezone 计算。
-- calendar_event：个人日程及双方确认的共同事件。
CREATE TABLE IF NOT EXISTS calendar_event (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '日历事件主键',
    owner_id BIGINT NULL COMMENT '个人事件作者；应用层校验PERSONAL时必填、SHARED时为空；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    connection_id BIGINT NULL COMMENT '共同事件所属连接；应用层校验SHARED时必填、PERSONAL时为空；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PERSONAL' COMMENT '事件类型；应用层校验PERSONAL=个人、SHARED=共同，owner_id与connection_id按类型互斥',
    title VARCHAR(100) NOT NULL COMMENT '事件标题；应用层校验非空白，最多100字',
    starts_at DATETIME(6) NULL COMMENT '带时间安排的UTC开始时间；应用层校验与ends_at同时非空，且start_date、end_date_exclusive均为空；全天安排时为空',
    ends_at DATETIME(6) NULL COMMENT '带时间安排的UTC结束时间；应用层校验与starts_at同时非空且大于starts_at；全天安排时为空',
    start_date DATE NULL COMMENT '全天安排的当地开始日期；应用层校验与end_date_exclusive同时非空，且starts_at、ends_at均为空；带时间安排时为空',
    end_date_exclusive DATE NULL COMMENT '全天安排的当地结束日期，不含此日；应用层校验与start_date同时非空且大于start_date；带时间安排时为空',
    event_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '事件创建时的IANA时区；应用层校验非空白、时区有效性，最多64字',
    note TEXT NULL COMMENT '个人备注始终私密；共同事件为双方确认的说明；应用层校验最多5000字',
    location VARCHAR(255) NULL COMMENT '地点；个人事件不通过忙闲接口暴露',
    availability VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '个人时间状态；应用层校验PERSONAL时必填且BUSY=忙、NEGOTIABLE=可商量、FREE=有空，SHARED时为空',
    share_title BOOLEAN NOT NULL DEFAULT FALSE COMMENT '个人忙闲块是否额外分享标题；应用层校验0=不分享、1=分享，SHARED时必须为0',
    offline_confirmed_at DATETIME(6) NULL COMMENT 'UTC线下确认记录时间；应用层校验仅PERSONAL可填写，SHARED时为空',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'CONFIRMED' COMMENT '事件状态；应用层校验CONFIRMED=已确认、CANCELLED=已取消',
    origin_invitation_id BIGINT NULL COMMENT '原始创建邀约，唯一且改期不变；应用层校验PERSONAL时为空、SHARED时必填；逻辑外键 calendar_invitation.id，由应用层校验关联及维护引用',
    pending_change_invitation_id BIGINT NULL COMMENT '待处理修改提案逻辑引用；应用层校验仅SHARED且CONFIRMED时可非空，事件行锁下维护，处理完清空，仅维护此指针不递增事件version；逻辑外键 calendar_invitation.id，由应用层校验关联及维护引用',
    cancellation_reason TEXT NULL COMMENT '可选取消说明；应用层校验最多5000字',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '内容与状态版本；应用层校验>=0，内容或状态更新时在版本条件下递增，接受改期时递增；仅维护pending_change_invitation_id或私人提醒不递增',
    PRIMARY KEY (id),
    UNIQUE KEY uk_calendar_event_origin (origin_invitation_id),
    UNIQUE KEY uk_calendar_event_pending_change (pending_change_invitation_id),
    KEY idx_calendar_event_owner_time (owner_id, status, starts_at, ends_at),
    KEY idx_calendar_event_owner_date (owner_id, status, start_date, end_date_exclusive),
    KEY idx_calendar_event_connection_time (connection_id, status, starts_at, ends_at),
    KEY idx_calendar_event_connection_date (connection_id, status, start_date, end_date_exclusive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='个人安排及双方确认的共同事件';

-- commitment：个人承诺及履行记录。
CREATE TABLE IF NOT EXISTS commitment (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '承诺主键',
    owner_id BIGINT NOT NULL COMMENT '履行者，只能为自己创建；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    shared_connection_id BIGINT NULL COMMENT '主动分享所绑定的连接，NULL 为私密；逻辑外键 pair_connection.id，由应用层校验关联及维护引用',
    title VARCHAR(100) NOT NULL COMMENT '承诺标题；应用层校验非空白，最多100字',
    body TEXT NULL COMMENT '可选说明；应用层校验最多5000字',
    due_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'NONE' COMMENT '截止模式；应用层校验NONE=无截止（due_at、due_date、due_timezone均为空）、INSTANT=精确时间（仅due_at必填）、DATE=日期截止（仅due_date、due_timezone必填）；创建默认NONE，修改截止时提交完整一组',
    due_at DATETIME(6) NULL COMMENT 'UTC精确截止时间；应用层校验仅INSTANT时必填，其他模式为空；OPEN且当前时刻>=due_at时逾期，不自动改变状态',
    due_date DATE NULL COMMENT '当地截止日期；应用层校验仅DATE时必填，其他模式为空；指定日期全天有效，OPEN从该日期在due_timezone中的下一日起始边界起逾期，边界按IANA规则计算，不假设一天固定24小时',
    due_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '日期截止的IANA时区；应用层校验仅DATE时必填且非空白、时区有效，最多64字，其他模式为空；设置截止时固定，修改用户显示时区不重写',
    next_action TEXT NULL COMMENT '可选下一步；应用层校验最多5000字',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'OPEN' COMMENT '承诺状态；应用层校验OPEN=待履行、DONE=已完成、CANCELLED=已取消',
    result TEXT NULL COMMENT '可选完成结果；应用层校验最多5000字',
    source_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '可选来源类型；应用层校验EXPRESSION=表达、MEMORY_CARD=卡片、CALENDAR_EVENT=事件，与source_id同时为空或同时填写',
    source_id BIGINT NULL COMMENT '可选多态来源主键；应用层校验与source_type同时为空或同时填写，填写时>0，创建或更换来源及读取前鉴权；撤回表达视为来源不可用，承诺分享不授予来源访问权，不复制私密原文',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    KEY idx_commitment_owner_updated (owner_id, updated_at),
    KEY idx_commitment_shared_updated (shared_connection_id, updated_at),
    KEY idx_commitment_owner_status_due (owner_id, status, due_at),
    KEY idx_commitment_owner_status_due_date (owner_id, status, due_kind, due_date),
    KEY idx_commitment_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='由履行者管理的个人承诺';

-- 每用户每资源保留一条提醒记录，设置/重设及实际取消时更新此行并递增 revision，取消后保留行。
-- 扫描 PENDING 且 scheduled_at <= 当前 UTC 时间的全部记录，不限于当前分钟。
-- 锁定并再次验证提醒 revision、状态和资源权限；插入通知与改为 FIRED 必须同事务。
-- 提醒通知 dedupe_key 约定为 reminder:<id>:<revision>，防止重试重复发送。
-- reminder：用户为资源设置的私人提醒。
CREATE TABLE IF NOT EXISTS reminder (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '提醒主键',
    recipient_id BIGINT NOT NULL COMMENT '私人提醒接收者；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    resource_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '提醒资源类型；应用层校验MEMORY_CARD=卡片、CALENDAR_EVENT=事件、COMMITMENT=承诺',
    resource_id BIGINT NOT NULL COMMENT '资源主键；应用层校验>0及接收者当前访问权限，COMMITMENT须属于接收者且为OPEN，CALENDAR_EVENT不能已取消，MEMORY_CARD不能已删除；扫描触发前重新校验',
    scheduled_at DATETIME(6) NOT NULL COMMENT 'UTC 绝对提醒时间；事件改期不自动修改',
    revision BIGINT NOT NULL DEFAULT 1 COMMENT '提醒计划修订号；应用层校验>=1，首次为1，每次设置/重设（含相同时刻）及实际取消时递增，业务清理取消PENDING亦递增；合法重复取消不递增，触发与事件改期不递增',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING' COMMENT '提醒状态；应用层校验PENDING=待触发、FIRED=已触发、CANCELLED=已取消',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    UNIQUE KEY uk_reminder_recipient_resource (recipient_id, resource_type, resource_id),
    KEY idx_reminder_status_scheduled (status, scheduled_at),
    KEY idx_reminder_recipient_status_scheduled (recipient_id, status, scheduled_at),
    KEY idx_reminder_resource_status (resource_type, resource_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资源级私人提醒';

-- notification：站内通知及已读记录。
CREATE TABLE IF NOT EXISTS notification (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '站内通知主键',
    recipient_id BIGINT NOT NULL COMMENT '通知接收者；逻辑外键 app_user.id，由应用层校验关联及维护引用',
    kind VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '业务通知类型，由服务端定义；应用层校验非空白，最多64字',
    resource_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '资源类型；应用层校验MEMORY_CARD=卡片、CALENDAR_EVENT=事件、COMMITMENT=承诺、EXPRESSION=表达、CALENDAR_INVITATION=日历邀约、PAIR_CONNECTION=连接、PAIR_INVITE=连接邀请；读取时重新鉴权',
    resource_id BIGINT NOT NULL COMMENT '多态资源主键；应用层校验>0',
    message VARCHAR(255) NOT NULL COMMENT '通用文案，不存私密正文或标题；应用层校验非空白，最多255字',
    dedupe_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '业务操作或提醒修订的唯一去重键；应用层校验非空白，最多191字',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC 创建时间',
    read_at DATETIME(6) NULL COMMENT 'UTC首次已读时间，NULL为未读；应用层校验仅接收者可标记当前可见通知，重复调用保留首次时间',
    invalidated_at DATETIME(6) NULL COMMENT 'UTC永久失效时间，NULL表示尚未标记失效；应用层在撤回、删除、撤销分享或解除连接导致通知失去访问权时同事务写入，禁止因再次分享或重连清空；查询先排除非空记录，仍须实时鉴权',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'UTC 更新时间',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本；应用层校验>=0，在带版本条件的更新中递增',
    PRIMARY KEY (id),
    UNIQUE KEY uk_notification_dedupe (dedupe_key),
    KEY idx_notification_recipient_invalidated_read_created (recipient_id, invalidated_at, read_at, created_at),
    KEY idx_notification_recipient_invalidated_created (recipient_id, invalidated_at, created_at),
    KEY idx_notification_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='仅含资源引用和通用文案的站内通知';

-- Spring Session JDBC：保留官方字段及索引结构，将关联改为应用层维护的逻辑外键。
-- https://raw.githubusercontent.com/spring-projects/spring-session/main/spring-session-jdbc/src/main/resources/org/springframework/session/jdbc/schema-mysql.sql
-- 将官方独立 CREATE INDEX 合并到 CREATE TABLE 内，保证重复执行不重复创建索引。
-- 默认 Repository 的会话删除与过期清理依赖数据库级联删除；逻辑外键方案须定制这两类清理逻辑。
-- 会话 ID 使用区分大小写的排序规则；退出登录、过期清理及修改密码删除会话时，应用层须在同一事务先删属性，再删会话。
-- SPRING_SESSION：Spring Session JDBC 登录会话。
CREATE TABLE IF NOT EXISTS SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL COMMENT '内部会话 UUID',
    SESSION_ID CHAR(36) NOT NULL COMMENT '对外会话 ID',
    CREATION_TIME BIGINT NOT NULL COMMENT '创建时间，epoch 毫秒',
    LAST_ACCESS_TIME BIGINT NOT NULL COMMENT '最后访问时间，epoch 毫秒',
    MAX_INACTIVE_INTERVAL INT NOT NULL COMMENT '最大空闲秒数',
    EXPIRY_TIME BIGINT NOT NULL COMMENT '到期时间，epoch 毫秒',
    PRINCIPAL_NAME VARCHAR(100) NULL COMMENT '认证主体名称',
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID),
    UNIQUE KEY SPRING_SESSION_IX1 (SESSION_ID),
    KEY SPRING_SESSION_IX2 (EXPIRY_TIME),
    KEY SPRING_SESSION_IX3 (PRINCIPAL_NAME)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='Spring Session JDBC 会话';

-- SPRING_SESSION_ATTRIBUTES：Spring Session JDBC 会话属性。
CREATE TABLE IF NOT EXISTS SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36) NOT NULL COMMENT '内部会话 UUID；逻辑外键 SPRING_SESSION.PRIMARY_ID，由应用层校验关联及维护引用；父记录删除时由应用层在同一事务清理本表关联记录',
    ATTRIBUTE_NAME VARCHAR(200) NOT NULL COMMENT '会话属性名',
    ATTRIBUTE_BYTES BLOB NOT NULL COMMENT '序列化会话属性',
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='Spring Session JDBC 会话属性';

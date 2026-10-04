package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.ExpressionDtos;
import com.jacolp.dto.ExpressionRequests;
import com.jacolp.dto.NotificationSettingDtos;
import jakarta.servlet.http.HttpSession;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Expression;
import com.jacolp.entity.ExpressionReply;
import com.jacolp.entity.NotificationOperation;
import com.jacolp.entity.NotificationSetting;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.ExpressionMapper;
import com.jacolp.mapper.NotificationSettingMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpressionService {
    private final ExpressionMapper expressions;
    private final ExpressionAccessService access;
    private final ConnectionMapper connections;
    private final UserMapper users;
    private final NotificationSettingMapper settings;
    private final BusinessNotificationService business;
    private final ResourceLifecycleService lifecycle;

    public ExpressionService(ExpressionMapper expressions, ExpressionAccessService access,
                             ConnectionMapper connections, UserMapper users,
                             NotificationSettingMapper settings, BusinessNotificationService business,
                             ResourceLifecycleService lifecycle) {
        this.expressions = expressions;
        this.access = access;
        this.connections = connections;
        this.users = users;
        this.settings = settings;
        this.business = business;
        this.lifecycle = lifecycle;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Object send(String username, ExpressionRequests.Send input,
                       Map<String, Object> rawBody, String rawKey) {
        AppUser actor = actor(username);
        String key = business.key(rawKey);
        String hash = business.hash("POST", "/api/v1/expressions", rawBody);
        NotificationOperation previous = business.previous(actor.getId(), key, hash);
        if (previous != null) {
            return replaySend(actor.getId(), previous);
        }
        PairConnection pair = lockedPair(input.connectionId(), actor.getId());
        long recipientId = otherId(pair, actor.getId());
        previous = business.previousLocked(actor.getId(), key, hash);
        if (previous != null) {
            return replaySend(actor.getId(), previous);
        }
        List<String> unavailable = new ArrayList<>();
        if ("IN_APP_AND_MAIL".equals(input.outgoingMode())) {
            unavailable.add("OTHER");
        }
        if ("IN_APP_AND_MAIL".equals(input.followUpMode())) {
            unavailable.add("SELF");
        }
        if (!unavailable.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "MAIL_NOT_AVAILABLE", "邮件通知尚不可用",
                    Map.of("unavailableDirections", unavailable));
        }
        Expression row = new Expression();
        row.setConnectionId(pair.getId());
        row.setSenderId(actor.getId());
        row.setRecipientId(recipientId);
        row.setType(input.type());
        row.setBody(input.body());
        row.setResponseWindow(input.responseWindow());
        row.setResponseMode(input.responseMode());
        expressions.insert(row);
        insertSetting(row, actor.getId(), input.followUpMode());
        insertSetting(row, recipientId, "IN_APP");
        NotificationOperation operation = business.record(actor.getId(), key, hash,
                "EXPRESSION_SEND", "EXPRESSION", row.getId(),
                Map.of("expressionId", row.getId().toString()));
        business.notifyRecipient(operation, recipientId, "EXPRESSION_SENT",
                "对方发来一条表达，请登录 Usward 查看", input.outgoingMode());
        return detail(expressions.find(row.getId()), actor.getId(), 1, 20);
    }

    @Transactional(readOnly = true)
    public ExpressionDtos.Page list(String username, String direction, String status,
                                    String sort, int page, int size) {
        if (!List.of("ALL", "RECEIVED", "SENT").contains(direction)
                || !List.of("ALL", "OPEN", "RESPONDED", "WITHDRAWN").contains(status)
                || !"CREATED_DESC".equals(sort) || page < 1 || size < 1 || size > 100) {
            throw invalid();
        }
        Instant asOf = Instant.now();
        AppUser viewer = actor(username);
        PairConnection pair = currentPair(viewer);
        if (pair == null) {
            return new ExpressionDtos.Page(List.of(), 0, page, size, false, asOf);
        }
        List<Expression> matched = expressions.listConnection(pair.getId()).stream()
                .filter(row -> row.getSenderId().equals(viewer.getId())
                        || row.getRecipientId().equals(viewer.getId()))
                .filter(row -> "ALL".equals(direction)
                        || ("SENT".equals(direction) && row.getSenderId().equals(viewer.getId()))
                        || ("RECEIVED".equals(direction) && row.getRecipientId().equals(viewer.getId())))
                .filter(row -> "ALL".equals(status) || status.equals(row.getStatus()))
                .toList();
        long total = matched.size();
        long offset = ((long) page - 1) * size;
        List<Object> items = offset >= total ? List.of()
                : matched.subList((int) offset, (int) Math.min(total, offset + size))
                .stream().map(this::summary).toList();
        return new ExpressionDtos.Page(items, total, page, size, offset + size < total, asOf);
    }

    @Transactional(readOnly = true)
    public Object get(String username, long id, int replyPage, int replySize) {
        if (replyPage < 1 || replySize < 1 || replySize > 100) {
            throw invalid();
        }
        AppUser viewer = actor(username);
        Expression row = access.readable(viewer.getId(), id);
        if (row == null) {
            throw notFound();
        }
        return detail(row, viewer.getId(), replyPage, replySize);
    }

    @Transactional
    public ExpressionDtos.Withdrawn withdraw(String username, long id, long expectedVersion) {
        AppUser actor = actor(username);
        Expression candidate = access.readable(actor.getId(), id);
        if (candidate == null) {
            throw notFound();
        }
        PairConnection pair = lockedPair(candidate.getConnectionId(), actor.getId());
        Expression row = expressions.lock(id);
        if (row == null || !row.getConnectionId().equals(pair.getId())
                || !row.getSenderId().equals(actor.getId())) {
            throw notFound();
        }
        if (row.getVersion() != expectedVersion) {
            throw versionConflict();
        }
        if ("WITHDRAWN".equals(row.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "表达已经撤回");
        }
        if (expressions.withdraw(id, actor.getId(), pair.getId(), expectedVersion) != 1) {
            throw versionConflict();
        }
        settings.delete("EXPRESSION", id);
        lifecycle.close(actor.getId(), "EXPRESSION", id, true);
        lifecycle.close(row.getRecipientId(), "EXPRESSION", id, true);
        return placeholder(expressions.find(id));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ExpressionDtos.Replied reply(String username, long id, ExpressionRequests.Reply input,
                                         Map<String, Object> rawBody, String rawKey,
                                         HttpSession session) {
        AppUser actor = actor(username);
        String key = business.key(rawKey);
        String hash = business.hash("POST", "/api/v1/expressions/" + id + "/replies", rawBody);
        NotificationOperation previous = business.previous(actor.getId(), key, hash);
        if (previous != null) {
            return replayReply(actor.getId(), id, previous);
        }
        Expression candidate = access.readable(actor.getId(), id);
        if (candidate == null) {
            throw notFound();
        }
        PairConnection pair = lockedPair(candidate.getConnectionId(), actor.getId());
        Expression row = expressions.lock(id);
        if (row == null || !row.getConnectionId().equals(pair.getId())
                || "WITHDRAWN".equals(row.getStatus())) {
            throw notFound();
        }
        previous = business.previousLocked(actor.getId(), key, hash);
        if (previous != null) {
            return replayReply(actor.getId(), id, previous);
        }
        if (row.getVersion() != input.expectedVersion()) {
            if (input.notificationOverride() != null) {
                throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_CONTEXT_CHANGED",
                        "通知选择上下文已变化，请重新查看");
            }
            throw versionConflict();
        }
        boolean recipient = row.getRecipientId().equals(actor.getId());
        if (!recipient && input.preset() != null) {
            throw invalid();
        }
        long otherId = recipient ? row.getSenderId() : row.getRecipientId();
        String action = recipient ? "EXPRESSION_REPLY" : "EXPRESSION_SUPPLEMENT";
        NotificationSetting setting = settings.find(otherId, "EXPRESSION", id);
        if (setting != null && !row.getConnectionId().equals(setting.getConnectionId())) {
            setting = null;
        }
        String mode = business.followUpMode(session, actor.getId(), action, id,
                row.getConnectionId(), row.getVersion(),
                setting == null ? null : setting.getVersion(),
                setting == null ? "IN_APP" : setting.getFollowUpMode(),
                input.notificationOverride());
        ExpressionReply reply = new ExpressionReply();
        reply.setExpressionId(id);
        reply.setAuthorId(actor.getId());
        reply.setPreset(input.preset());
        reply.setBody(input.body());
        expressions.insertReply(reply);
        String status = recipient ? "RESPONDED" : row.getStatus();
        if (expressions.bump(id, pair.getId(), row.getVersion(), status) != 1) {
            throw versionConflict();
        }
        NotificationOperation operation = business.record(actor.getId(), key, hash,
                action, "EXPRESSION", id,
                Map.of("expressionId", Long.toString(id), "replyId", reply.getId().toString()));
        business.notifyRecipient(operation, otherId,
                recipient ? "EXPRESSION_REPLIED" : "EXPRESSION_SUPPLEMENTED",
                "对方回应或补充了一条表达，请登录 Usward 查看", mode);
        return new ExpressionDtos.Replied(replyDto(expressions.reply(reply.getId(), id)),
                Long.toString(row.getVersion() + 1), status);
    }

    @Transactional(readOnly = true)
    public List<ExpressionDtos.Summary> pendingForDashboard(long viewerId, Instant asOf) {
        AppUser viewer = users.findById(viewerId);
        PairConnection pair = viewer == null ? null : currentPair(viewer);
        if (pair == null) {
            return List.of();
        }
        return expressions.listConnection(pair.getId()).stream()
                .filter(row -> row.getRecipientId().equals(viewerId) && "OPEN".equals(row.getStatus())
                        && !row.getCreatedAt().isAfter(LocalDateTime.ofInstant(asOf, ZoneOffset.UTC)))
                .map(this::activeSummary).toList();
    }

    private Object replaySend(long actorId, NotificationOperation previous) {
        if (!"EXPRESSION".equals(previous.getResourceType())
                || !"EXPRESSION_SEND".equals(previous.getAction())) {
            throw notFound();
        }
        Expression row = access.readable(actorId, previous.getResourceId());
        if (row == null || !row.getSenderId().equals(actorId)) {
            throw notFound();
        }
        return detail(row, actorId, 1, 20);
    }

    private ExpressionDtos.Replied replayReply(long actorId, long id,
                                                NotificationOperation previous) {
        Expression row = access.readable(actorId, id);
        if (row == null || "WITHDRAWN".equals(row.getStatus())
                || !"EXPRESSION".equals(previous.getResourceType())
                || previous.getResourceId() != id
                || (!"EXPRESSION_REPLY".equals(previous.getAction())
                && !"EXPRESSION_SUPPLEMENT".equals(previous.getAction()))) {
            throw notFound();
        }
        long replyId = Long.parseLong(business.resultRef(previous, "replyId"));
        ExpressionReply reply = expressions.reply(replyId, id);
        if (reply == null || reply.getAuthorId() != actorId) {
            throw notFound();
        }
        return new ExpressionDtos.Replied(replyDto(reply), row.getVersion().toString(),
                row.getStatus());
    }

    private PairConnection lockedPair(long connectionId, long actorId) {
        PairConnection pair = connections.lockActiveConnection(connectionId);
        if (pair == null || (pair.getUserAId() != actorId && pair.getUserBId() != actorId)) {
            throw notFound();
        }
        AppUser first = users.lockById(pair.getUserAId());
        AppUser second = users.lockById(pair.getUserBId());
        if (first == null || second == null
                || !pair.getId().equals(first.getActiveConnectionId())
                || !pair.getId().equals(second.getActiveConnectionId())) {
            throw notFound();
        }
        return pair;
    }

    private PairConnection currentPair(AppUser viewer) {
        Long id = viewer.getActiveConnectionId();
        if (id == null) {
            return null;
        }
        PairConnection pair = connections.activeConnection(id);
        if (pair == null || (!pair.getUserAId().equals(viewer.getId())
                && !pair.getUserBId().equals(viewer.getId()))) {
            return null;
        }
        AppUser other = users.findById(otherId(pair, viewer.getId()));
        return other != null && id.equals(other.getActiveConnectionId()) ? pair : null;
    }

    private long otherId(PairConnection pair, long actorId) {
        return pair.getUserAId() == actorId ? pair.getUserBId() : pair.getUserAId();
    }

    private void insertSetting(Expression row, long userId, String mode) {
        NotificationSetting setting = new NotificationSetting();
        setting.setUserId(userId);
        setting.setResourceType("EXPRESSION");
        setting.setResourceId(row.getId());
        setting.setConnectionId(row.getConnectionId());
        setting.setFollowUpMode(mode);
        settings.insert(setting);
    }

    private Object detail(Expression row, long viewerId, int page, int size) {
        if ("WITHDRAWN".equals(row.getStatus())) {
            return placeholder(row);
        }
        long count = expressions.replyCount(row.getId());
        long offset = ((long) page - 1) * size;
        List<ExpressionDtos.Reply> replies = offset >= count ? List.of()
                : expressions.replies(row.getId(), size, offset).stream().map(this::replyDto).toList();
        NotificationSetting setting = settings.find(viewerId, "EXPRESSION", row.getId());
        NotificationSettingDtos.FollowUp mine = new NotificationSettingDtos.FollowUp(
                setting == null ? "IN_APP" : setting.getFollowUpMode(),
                setting == null ? null : setting.getVersion().toString());
        return new ExpressionDtos.Detail(row.getId().toString(), row.getVersion().toString(),
                row.getConnectionId().toString(), row.getSenderId().toString(),
                row.getRecipientId().toString(), row.getType(), row.getBody(),
                row.getResponseWindow(), row.getResponseMode(), row.getStatus(), count,
                lastReply(row), new ExpressionDtos.Replies(replies, count, page, size,
                offset + size < count), mine, utc(row.getCreatedAt()), utc(row.getUpdatedAt()));
    }

    private Object summary(Expression row) {
        return "WITHDRAWN".equals(row.getStatus()) ? placeholder(row) : activeSummary(row);
    }

    private ExpressionDtos.Summary activeSummary(Expression row) {
        return new ExpressionDtos.Summary(row.getId().toString(), row.getVersion().toString(),
                row.getConnectionId().toString(), row.getSenderId().toString(),
                row.getRecipientId().toString(), row.getType(), row.getResponseWindow(),
                row.getResponseMode(), row.getStatus(), expressions.replyCount(row.getId()),
                lastReply(row), utc(row.getCreatedAt()), utc(row.getUpdatedAt()));
    }

    private ExpressionDtos.Withdrawn placeholder(Expression row) {
        return new ExpressionDtos.Withdrawn(row.getId().toString(), row.getVersion().toString(),
                row.getConnectionId().toString(), row.getSenderId().toString(),
                row.getRecipientId().toString(), row.getStatus(), utc(row.getCreatedAt()),
                utc(row.getUpdatedAt()));
    }

    private ExpressionDtos.Reply lastReply(Expression row) {
        ExpressionReply last = expressions.lastReply(row.getId());
        return last == null ? null : replyDto(last);
    }

    ExpressionDtos.Reply replyDto(ExpressionReply row) {
        return new ExpressionDtos.Reply(row.getId().toString(), row.getExpressionId().toString(),
                row.getAuthorId().toString(), row.getPreset(), row.getBody(), utc(row.getCreatedAt()));
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private AppUser actor(String username) {
        AppUser row = users.findByUsername(username);
        if (row == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return row;
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "EXPRESSION_NOT_FOUND", "表达不存在或不可访问");
    }

    private ApiException versionConflict() {
        return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "表达版本已变化");
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "查询参数无效");
    }
}

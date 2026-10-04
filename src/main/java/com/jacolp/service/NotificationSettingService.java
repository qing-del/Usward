package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.NotificationSettingDtos;
import com.jacolp.dto.NotificationSettingWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Expression;
import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.NotificationSetting;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.ExpressionMapper;
import com.jacolp.mapper.NotificationSettingMapper;
import com.jacolp.mapper.UserMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationSettingService {
    private final NotificationSettingMapper settings;
    private final MemoryAccessService access;
    private final UserMapper users;
    private final ConnectionMapper connections;
    private final ExpressionAccessService expressionsAccess;
    private final ExpressionMapper expressions;

    public NotificationSettingService(NotificationSettingMapper settings,
                                      MemoryAccessService access, UserMapper users,
                                      ConnectionMapper connections,
                                      ExpressionAccessService expressionsAccess,
                                      ExpressionMapper expressions) {
        this.settings = settings;
        this.access = access;
        this.users = users;
        this.connections = connections;
        this.expressionsAccess = expressionsAccess;
        this.expressions = expressions;
    }

    @Transactional(readOnly = true)
    public NotificationSettingDtos.Detail get(String username, String resourceType, long cardId) {
        if ("EXPRESSION".equals(resourceType)) {
            AppUser viewer = viewer(username);
            Expression row = expressionVisible(viewer.getId(), cardId);
            return dto("EXPRESSION", cardId, expressionCurrent(viewer.getId(), row));
        }
        requireCardType(resourceType);
        AppUser viewer = viewer(username);
        MemoryCard card = sharedVisible(viewer.getId(), cardId);
        return dto(cardId, current(viewer.getId(), cardId, card.getSharedConnectionId()));
    }

    @Transactional
    public NotificationSettingDtos.Detail put(String username, String resourceType, long cardId,
                                              NotificationSettingWriteRequest input) {
        if ("EXPRESSION".equals(resourceType)) {
            return putExpression(username, cardId, input);
        }
        requireCardType(resourceType);
        AppUser viewer = viewer(username);
        sharedVisible(viewer.getId(), cardId);
        MemoryCard card = access.lockShared(viewer.getId(), cardId);
        if (card == null) {
            throw notFound();
        }
        NotificationSetting current = settings.lock(viewer.getId(), "MEMORY_CARD", cardId);
        if ((current == null && input.expectedVersion() != null)
                || (current != null && (input.expectedVersion() == null
                || current.getVersion().longValue() != input.expectedVersion()
                || !card.getSharedConnectionId().equals(current.getConnectionId())))) {
            throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_SETTING_CONFLICT",
                    "通知设置版本已变化");
        }
        if ("IN_APP_AND_MAIL".equals(input.followUpMode())) {
            AppUser lockedViewer = users.findById(viewer.getId());
            if (lockedViewer.getNotificationEmail() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "RECIPIENT_EMAIL_REQUIRED",
                        "请先设置通知收件邮箱");
            }
            throw new ApiException(HttpStatus.CONFLICT, "MAIL_NOT_AVAILABLE", "邮件通知尚不可用");
        }
        if (current == null) {
            NotificationSetting next = new NotificationSetting();
            next.setUserId(viewer.getId());
            next.setResourceType("MEMORY_CARD");
            next.setResourceId(cardId);
            next.setConnectionId(card.getSharedConnectionId());
            next.setFollowUpMode(input.followUpMode());
            settings.insert(next);
        } else if (settings.update(viewer.getId(), "MEMORY_CARD", cardId, card.getSharedConnectionId(),
                current.getVersion(), input.followUpMode()) != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_SETTING_CONFLICT",
                    "通知设置版本已变化");
        }
        return dto(cardId, settings.find(viewer.getId(), "MEMORY_CARD", cardId));
    }

    @Transactional(readOnly = true)
    public NotificationSettingDtos.Capabilities capabilities(String username, String connectionId,
                                                               String resourceType, String resourceId,
                                                               String action) {
        AppUser viewer = viewer(username);
        if (connectionId != null && resourceType == null && resourceId == null && action == null) {
            long id = id(connectionId);
            if (access.activeConnectionId(viewer.getId()) == null
                    || access.activeConnectionId(viewer.getId()) != id) {
                throw notFound();
            }
            return new NotificationSettingDtos.Capabilities(false, false, null);
        }
        if (connectionId != null || !"MEMORY_CARD".equals(resourceType)
                || resourceId == null || action == null) {
            if (connectionId == null && "EXPRESSION".equals(resourceType)
                    && resourceId != null && action != null) {
                return expressionCapabilities(viewer.getId(), id(resourceId), action);
            }
            throw invalid();
        }
        long cardId = id(resourceId);
        MemoryCard card = sharedVisible(viewer.getId(), cardId);
        if (("MEMORY_EDIT".equals(action) && !card.getOwnerId().equals(viewer.getId()))
                || ("MEMORY_COMMENT".equals(action) && card.getOwnerId().equals(viewer.getId()))) {
            throw notFound();
        }
        if (!"MEMORY_EDIT".equals(action) && !"MEMORY_COMMENT".equals(action)) {
            throw invalid();
        }
        long recipientId = card.getOwnerId().equals(viewer.getId())
                ? otherId(viewer.getId(), card.getSharedConnectionId()) : card.getOwnerId();
        return new NotificationSettingDtos.Capabilities(false, false,
                followUpMode(recipientId, cardId, card.getSharedConnectionId()));
    }

    public String followUpMode(long userId, long cardId, long connectionId) {
        NotificationSetting row = current(userId, cardId, connectionId);
        return row == null ? "IN_APP" : row.getFollowUpMode();
    }

    public NotificationSettingDtos.FollowUp forCard(long viewerId, MemoryCard card) {
        if (card.getSharedConnectionId() == null
                || !card.getSharedConnectionId().equals(access.activeConnectionId(viewerId))) {
            return null;
        }
        NotificationSetting row = current(viewerId, card.getId(), card.getSharedConnectionId());
        return new NotificationSettingDtos.FollowUp(
                row == null ? "IN_APP" : row.getFollowUpMode(),
                row == null ? null : row.getVersion().toString());
    }

    public NotificationSetting current(long userId, long cardId, long connectionId) {
        NotificationSetting row = settings.find(userId, "MEMORY_CARD", cardId);
        return row != null && row.getConnectionId() == connectionId ? row : null;
    }

    // Called with the active connection, both account rows and card locked.
    public void initializeCard(long cardId, long connectionId, long authorId, long recipientId,
                               String authorMode) {
        settings.delete("MEMORY_CARD", cardId);
        insert(cardId, connectionId, authorId, authorMode);
        insert(cardId, connectionId, recipientId, "IN_APP");
    }

    public void deleteCard(long cardId) {
        settings.delete("MEMORY_CARD", cardId);
    }

    private void insert(long cardId, long connectionId, long userId, String mode) {
        NotificationSetting row = new NotificationSetting();
        row.setResourceId(cardId);
        row.setResourceType("MEMORY_CARD");
        row.setConnectionId(connectionId);
        row.setUserId(userId);
        row.setFollowUpMode(mode);
        settings.insert(row);
    }

    private NotificationSettingDtos.Detail dto(long cardId, NotificationSetting row) {
        return dto("MEMORY_CARD", cardId, row);
    }

    private NotificationSettingDtos.Detail dto(String type, long id, NotificationSetting row) {
        return new NotificationSettingDtos.Detail(type, Long.toString(id),
                row == null ? "IN_APP" : row.getFollowUpMode(),
                row == null ? null : row.getVersion().toString());
    }

    private NotificationSettingDtos.Detail putExpression(String username, long id,
                                                          NotificationSettingWriteRequest input) {
        AppUser viewer = viewer(username);
        Expression candidate = expressionVisible(viewer.getId(), id);
        PairConnection pair = connections.lockActiveConnection(candidate.getConnectionId());
        if (pair == null) {
            throw notFound();
        }
        AppUser first = users.lockById(pair.getUserAId());
        AppUser second = users.lockById(pair.getUserBId());
        if (first == null || second == null
                || !pair.getId().equals(first.getActiveConnectionId())
                || !pair.getId().equals(second.getActiveConnectionId())) {
            throw notFound();
        }
        Expression row = expressions.lock(id);
        if (row == null || !row.getConnectionId().equals(pair.getId())
                || "WITHDRAWN".equals(row.getStatus())) {
            throw notFound();
        }
        NotificationSetting current = settings.lock(viewer.getId(), "EXPRESSION", id);
        if ((current == null && input.expectedVersion() != null)
                || (current != null && (input.expectedVersion() == null
                || !current.getVersion().equals(input.expectedVersion())
                || !pair.getId().equals(current.getConnectionId())))) {
            throw settingConflict();
        }
        if ("IN_APP_AND_MAIL".equals(input.followUpMode())) {
            AppUser lockedViewer = first.getId().equals(viewer.getId()) ? first : second;
            if (lockedViewer.getNotificationEmail() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "RECIPIENT_EMAIL_REQUIRED",
                        "请先设置通知收件邮箱");
            }
            throw new ApiException(HttpStatus.CONFLICT, "MAIL_NOT_AVAILABLE", "邮件通知尚不可用");
        }
        if (current == null) {
            NotificationSetting next = new NotificationSetting();
            next.setUserId(viewer.getId());
            next.setResourceType("EXPRESSION");
            next.setResourceId(id);
            next.setConnectionId(pair.getId());
            next.setFollowUpMode(input.followUpMode());
            settings.insert(next);
        } else if (settings.update(viewer.getId(), "EXPRESSION", id, pair.getId(),
                current.getVersion(), input.followUpMode()) != 1) {
            throw settingConflict();
        }
        return dto("EXPRESSION", id, settings.find(viewer.getId(), "EXPRESSION", id));
    }

    private NotificationSettingDtos.Capabilities expressionCapabilities(long viewerId, long id,
                                                                          String action) {
        Expression row = expressionVisible(viewerId, id);
        long recipientId;
        if ("EXPRESSION_REPLY".equals(action) && row.getRecipientId() == viewerId) {
            recipientId = row.getSenderId();
        } else if ("EXPRESSION_SUPPLEMENT".equals(action) && row.getSenderId() == viewerId) {
            recipientId = row.getRecipientId();
        } else if ("EXPRESSION_REPLY".equals(action)
                || "EXPRESSION_SUPPLEMENT".equals(action)) {
            throw notFound();
        } else {
            throw invalid();
        }
        NotificationSetting setting = settings.find(recipientId, "EXPRESSION", id);
        return new NotificationSettingDtos.Capabilities(false, false,
                setting == null || !row.getConnectionId().equals(setting.getConnectionId())
                        ? "IN_APP" : setting.getFollowUpMode());
    }

    private NotificationSetting expressionCurrent(long viewerId, Expression row) {
        NotificationSetting setting = settings.find(viewerId, "EXPRESSION", row.getId());
        return setting != null && row.getConnectionId().equals(setting.getConnectionId())
                ? setting : null;
    }

    private Expression expressionVisible(long viewerId, long id) {
        Expression row = expressionsAccess.readable(viewerId, id);
        if (row == null || "WITHDRAWN".equals(row.getStatus())) {
            throw notFound();
        }
        return row;
    }

    private ApiException settingConflict() {
        return new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_SETTING_CONFLICT",
                "通知设置版本已变化");
    }

    private MemoryCard sharedVisible(long viewerId, long cardId) {
        MemoryCard card = access.readable(viewerId, cardId);
        if (card == null) {
            throw notFound();
        }
        if (card.getSharedConnectionId() == null) {
            throw invalid();
        }
        if (!card.getSharedConnectionId().equals(access.activeConnectionId(viewerId))) {
            throw notFound();
        }
        return card;
    }

    private long otherId(long viewerId, long connectionId) {
        // The caller has already checked that the card is visible in this active connection.
        AppUser first = users.findById(viewerId);
        PairConnection pair = connections.activeConnection(connectionId);
        if (first == null || first.getActiveConnectionId() != connectionId || pair == null) {
            throw notFound();
        }
        if (pair.getUserAId() == viewerId) {
            return pair.getUserBId();
        }
        if (pair.getUserBId() == viewerId) {
            return pair.getUserAId();
        }
        throw notFound();
    }

    private AppUser viewer(String username) {
        AppUser row = users.findByUsername(username);
        if (row == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return row;
    }

    private void requireCardType(String resourceType) {
        if (!"MEMORY_CARD".equals(resourceType)) {
            throw invalid();
        }
    }

    public static long id(String raw) {
        if (raw == null || !raw.matches("[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "内容不存在或不可访问");
    }
}

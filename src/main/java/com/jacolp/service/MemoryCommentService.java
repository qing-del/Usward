package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MemoryCommentDtos;
import com.jacolp.dto.MemoryCommentRequest;
import com.jacolp.dto.MemoryDtos;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.MemoryComment;
import com.jacolp.entity.NotificationOperation;
import com.jacolp.entity.NotificationSetting;
import com.jacolp.mapper.MemoryCommentMapper;
import com.jacolp.mapper.MemoryMapper;
import com.jacolp.mapper.UserMapper;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemoryCommentService {
    private final MemoryCommentMapper comments;
    private final MemoryMapper memories;
    private final MemoryAccessService access;
    private final UserMapper users;
    private final NotificationSettingService settings;
    private final BusinessNotificationService business;

    public MemoryCommentService(MemoryCommentMapper comments, MemoryMapper memories,
                                MemoryAccessService access, UserMapper users,
                                NotificationSettingService settings,
                                BusinessNotificationService business) {
        this.comments = comments;
        this.memories = memories;
        this.access = access;
        this.users = users;
        this.settings = settings;
        this.business = business;
    }

    @Transactional(readOnly = true)
    public MemoryCommentDtos.Page list(String username, long cardId, String sort,
                                       int page, int size) {
        if (!"CREATED_ASC".equals(sort) || page < 1 || size < 1 || size > 100) {
            throw invalid();
        }
        Instant asOf = Instant.now();
        MemoryCard card = sharedVisible(viewer(username).getId(), cardId);
        long total = comments.count(cardId, card.getSharedConnectionId());
        List<MemoryCommentDtos.Detail> items = comments.page(cardId, card.getSharedConnectionId(),
                size, ((long) page - 1) * size).stream().map(this::dto).toList();
        return new MemoryCommentDtos.Page(items, total, page, size,
                (long) page * size < total, asOf);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public MemoryCommentDtos.Created add(String username, long cardId, MemoryCommentRequest input,
                                          Map<String, Object> rawBody, String rawKey,
                                          HttpSession session) {
        AppUser actor = viewer(username);
        String key = business.key(rawKey);
        String hash = business.hash("POST", "/api/v1/memories/" + cardId + "/comments", rawBody);
        NotificationOperation previous = business.previous(actor.getId(), key, hash);
        if (previous != null) {
            return replay(actor.getId(), cardId, previous);
        }
        MemoryCard card = access.lockShared(actor.getId(), cardId);
        if (card == null || card.getOwnerId().equals(actor.getId())) {
            throw notFound();
        }
        previous = business.previousLocked(actor.getId(), key, hash);
        if (previous != null) {
            return replay(actor.getId(), cardId, previous);
        }
        if (card.getVersion() != input.expectedVersion()) {
            if (input.notificationOverride() != null) {
                throw contextChanged();
            }
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "卡片版本已变化");
        }
        long connectionId = card.getSharedConnectionId();
        NotificationSetting recipient = settings.current(card.getOwnerId(), cardId, connectionId);
        String mode = business.followUpMode(session, actor.getId(), "MEMORY_COMMENT", cardId,
                connectionId, card.getVersion(),
                recipient == null ? null : recipient.getVersion(),
                recipient == null ? "IN_APP" : recipient.getFollowUpMode(),
                input.notificationOverride());
        MemoryComment row = new MemoryComment();
        row.setCardId(cardId);
        row.setConnectionId(connectionId);
        row.setAuthorId(actor.getId());
        row.setBody(input.body());
        comments.insert(row);
        if (memories.bumpSharedVersion(cardId, connectionId, card.getVersion()) != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "卡片版本已变化");
        }
        NotificationOperation operation = business.record(actor.getId(), key, hash,
                "MEMORY_COMMENT", "MEMORY_CARD", cardId,
                Map.of("cardId", Long.toString(cardId), "commentId", row.getId().toString()));
        business.notifyRecipient(operation, card.getOwnerId(), "MEMORY_COMMENTED",
                "对方补充了一张共享记忆卡片，请登录 Usward 查看", mode);
        return new MemoryCommentDtos.Created(dto(comments.find(row.getId(), cardId, connectionId)),
                Long.toString(card.getVersion() + 1));
    }

    private MemoryCommentDtos.Created replay(long actorId, long cardId,
                                              NotificationOperation operation) {
        MemoryCard card = access.lockShared(actorId, cardId);
        if (card == null || card.getOwnerId() == actorId) {
            throw notFound();
        }
        long commentId = Long.parseLong(business.resultRef(operation, "commentId"));
        MemoryComment row = comments.lock(commentId, cardId, card.getSharedConnectionId());
        if (row == null || row.getAuthorId() != actorId) {
            throw notFound();
        }
        return new MemoryCommentDtos.Created(dto(row), card.getVersion().toString());
    }

    private MemoryCard sharedVisible(long viewerId, long cardId) {
        MemoryCard card = access.readable(viewerId, cardId);
        if (card == null || card.getSharedConnectionId() == null
                || !card.getSharedConnectionId().equals(access.activeConnectionId(viewerId))) {
            throw notFound();
        }
        return card;
    }

    private MemoryCommentDtos.Detail dto(MemoryComment row) {
        AppUser author = users.findById(row.getAuthorId());
        return new MemoryCommentDtos.Detail(row.getId().toString(), row.getCardId().toString(),
                row.getAuthorId().toString(), new MemoryDtos.PublicOwner(
                author.getId().toString(), author.getNickname(), author.getAvatarStyle()),
                row.getBody(), row.getCreatedAt().toInstant(ZoneOffset.UTC));
    }

    private AppUser viewer(String username) {
        AppUser actor = users.findByUsername(username);
        if (actor == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return actor;
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "MEMORY_NOT_FOUND", "卡片不存在或不可访问");
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }

    private ApiException contextChanged() {
        return new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_CONTEXT_CHANGED",
                "通知选择上下文已变化，请重新查看");
    }
}

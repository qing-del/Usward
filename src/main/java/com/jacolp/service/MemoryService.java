package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MemoryDtos;
import com.jacolp.dto.MemoryShareRequest;
import com.jacolp.dto.MemoryWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.MemoryTag;
import com.jacolp.entity.NotificationOperation;
import com.jacolp.entity.NotificationSetting;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.MemoryMapper;
import com.jacolp.mapper.UserMapper;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemoryService {
    private final MemoryMapper memories;
    private final UserMapper users;
    private final ReminderService reminders;
    private final ResourceLifecycleService lifecycle;
    private final MemoryAccessService access;
    private final ConnectionMapper connections;
    private final NotificationSettingService settings;
    private final BusinessNotificationService business;

    public MemoryService(MemoryMapper memories, UserMapper users, ReminderService reminders,
                         ResourceLifecycleService lifecycle, MemoryAccessService access,
                         ConnectionMapper connections, NotificationSettingService settings,
                         BusinessNotificationService business) {
        this.memories = memories;
        this.users = users;
        this.reminders = reminders;
        this.lifecycle = lifecycle;
        this.access = access;
        this.connections = connections;
        this.settings = settings;
        this.business = business;
    }

    @Transactional
    public MemoryDtos.Detail create(String username, MemoryWriteRequest input) {
        AppUser owner = owner(username);
        MemoryCard card = new MemoryCard();
        card.setOwnerId(owner.getId());
        card.setTitle(input.title());
        card.setBody(input.body());
        card.setCategory(input.category());
        card.setSourceType(input.sourceType());
        card.setSourceDate(input.sourceDate());
        card.setNextAction(input.nextAction());
        memories.insert(card);
        replaceTags(card.getId(), input.tags());
        return detail(memories.findOwned(card.getId(), owner.getId()), owner.getId());
    }

    @Transactional(readOnly = true)
    public MemoryDtos.Detail get(String username, long id) {
        AppUser owner = owner(username);
        MemoryCard card = access.readable(owner.getId(), id);
        if (card == null) {
            throw notFound();
        }
        return detail(card, owner.getId());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public MemoryDtos.Detail patch(String username, long id, MemoryWriteRequest input,
                                   Map<String, Object> rawBody, String rawKey, HttpSession session) {
        AppUser owner = owner(username);
        MemoryCard candidate = memories.findOwned(id, owner.getId());
        if (candidate == null) {
            throw notFound();
        }
        String key = null;
        String hash = null;
        if (candidate.getSharedConnectionId() != null || rawKey != null) {
            key = business.key(rawKey);
            hash = business.hash("PATCH", "/api/v1/memories/" + id, rawBody);
            if (business.previous(owner.getId(), key, hash) != null) {
                return replayOwner(owner.getId(), id);
            }
        }
        if (candidate.getSharedConnectionId() == null
                && input.notificationOverride() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_CONTEXT_CHANGED",
                    "通知选择上下文已变化，请重新查看");
        }
        MemoryCard card = lockOwned(id, owner.getId());
        if (card.getSharedConnectionId() != null && key == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "已分享卡片编辑需要 Idempotency-Key");
        }
        if (key != null && business.previousLocked(owner.getId(), key, hash) != null) {
            return replayOwner(owner.getId(), id);
        }
        if (card.getVersion() != input.expectedVersion()) {
            if (input.notificationOverride() != null) {
                throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_CONTEXT_CHANGED",
                        "通知选择上下文已变化，请重新查看");
            }
            throw versionConflict();
        }
        long partnerId = 0;
        String mode = null;
        if (card.getSharedConnectionId() != null) {
            partnerId = partnerId(card.getSharedConnectionId(), owner.getId());
            NotificationSetting recipient = settings.current(partnerId, id,
                    card.getSharedConnectionId());
            mode = business.followUpMode(session, owner.getId(), "MEMORY_EDIT", id,
                    card.getSharedConnectionId(), card.getVersion(),
                    recipient == null ? null : recipient.getVersion(),
                    recipient == null ? "IN_APP" : recipient.getFollowUpMode(),
                    input.notificationOverride());
        }
        if (input.present().contains("title")) {
            card.setTitle(input.title());
        }
        if (input.present().contains("body")) {
            card.setBody(input.body());
        }
        if (input.present().contains("category")) {
            card.setCategory(input.category());
        }
        if (input.present().contains("sourceType")) {
            card.setSourceType(input.sourceType());
        }
        if (input.present().contains("sourceDate")) {
            card.setSourceDate(input.sourceDate());
        }
        if (input.present().contains("nextAction")) {
            card.setNextAction(input.nextAction());
        }
        changed(memories.updateContent(card));
        if (input.present().contains("tags")) {
            replaceTags(id, input.tags());
        }
        if (mode != null) {
            NotificationOperation operation = business.record(owner.getId(), key, hash,
                    "MEMORY_EDIT", id, Map.of("cardId", Long.toString(id)));
            business.notifyRecipient(operation, partnerId, "MEMORY_EDITED",
                    "对方更新了一张共享记忆卡片，请登录 Usward 查看", mode);
        }
        return detail(memories.findOwned(id, owner.getId()), owner.getId());
    }

    @Transactional
    public MemoryDtos.Detail setArchived(String username, long id, long expectedVersion,
                                         boolean archived) {
        AppUser owner = owner(username);
        MemoryCard card = lockedVersion(id, owner.getId(), expectedVersion);
        if (card.isArchived() == archived) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "卡片已处于该状态");
        }
        changed(memories.setArchived(id, owner.getId(), expectedVersion, archived));
        return detail(memories.findOwned(id, owner.getId()), owner.getId());
    }

    @Transactional
    public void delete(String username, long id, long expectedVersion) {
        AppUser owner = owner(username);
        MemoryCard card = lockedVersion(id, owner.getId(), expectedVersion);
        if (card.getSharedConnectionId() != null) {
            long partnerId = partnerId(card.getSharedConnectionId(), owner.getId());
            settings.deleteCard(id);
            lifecycle.revokeAccess(partnerId, "MEMORY_CARD", id);
            memories.deleteComments(id);
        }
        lifecycle.close(owner.getId(), "MEMORY_CARD", id, true);
        changed(memories.softDelete(id, owner.getId(), expectedVersion));
        memories.deleteTags(id);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public MemoryDtos.Detail share(String username, long id, MemoryShareRequest input,
                                   Map<String, Object> rawBody, String rawKey) {
        AppUser author = owner(username);
        String key = business.key(rawKey);
        String hash = business.hash("POST", "/api/v1/memories/" + id + "/share", rawBody);
        NotificationOperation previous = business.previous(author.getId(), key, hash);
        if (previous != null) {
            return replayOwner(author.getId(), id);
        }
        PairConnection pair = connections.lockActiveConnection(input.connectionId());
        if (pair == null || !member(pair, author.getId())) {
            throw notFound();
        }
        AppUser first = users.lockById(pair.getUserAId());
        AppUser second = users.lockById(pair.getUserBId());
        if (first == null || second == null
                || !pair.getId().equals(first.getActiveConnectionId())
                || !pair.getId().equals(second.getActiveConnectionId())) {
            throw notFound();
        }
        previous = business.previousLocked(author.getId(), key, hash);
        if (previous != null) {
            return replayOwner(author.getId(), id);
        }
        MemoryCard card = memories.lockOwned(id, author.getId());
        if (card == null) {
            throw notFound();
        }
        if (card.getVersion() != input.expectedVersion()) {
            throw versionConflict();
        }
        if (card.getSharedConnectionId() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "卡片已经分享");
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
        long partnerId = pair.getUserAId().equals(author.getId())
                ? pair.getUserBId() : pair.getUserAId();
        changed(memories.share(id, author.getId(), pair.getId(), input.expectedVersion()));
        settings.initializeCard(id, pair.getId(), author.getId(), partnerId,
                input.followUpMode());
        NotificationOperation operation = business.record(author.getId(), key, hash,
                "MEMORY_SHARE", id, Map.of("cardId", Long.toString(id)));
        business.notifyRecipient(operation, partnerId, "MEMORY_SHARED",
                "对方分享了一张记忆卡片，请登录 Usward 查看", input.outgoingMode());
        return detail(memories.findOwned(id, author.getId()), author.getId());
    }

    @Transactional
    public MemoryDtos.Detail unshare(String username, long id, long expectedVersion) {
        AppUser author = owner(username);
        MemoryCard card = lockedVersion(id, author.getId(), expectedVersion);
        if (card.getSharedConnectionId() == null) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "卡片尚未分享");
        }
        long partnerId = partnerId(card.getSharedConnectionId(), author.getId());
        settings.deleteCard(id);
        lifecycle.revokeAccess(partnerId, "MEMORY_CARD", id);
        lifecycle.revokeCardBusiness(id);
        memories.deleteComments(id);
        changed(memories.unshare(id, author.getId(), card.getSharedConnectionId(), expectedVersion));
        return detail(memories.findOwned(id, author.getId()), author.getId());
    }

    @Transactional(readOnly = true)
    public MemoryDtos.Page list(String username, String scope, boolean archived,
                                String keyword, String category, String tag, String sort,
                                int page, int size) {
        if (!List.of("ALL", "MINE", "PARTNER").contains(scope)
                || !"UPDATED_DESC".equals(sort) || page < 1 || size < 1 || size > 100
                || (archived && !"MINE".equals(scope))
                || (category != null && !List.of("INTEREST", "RECENT_CONCERN",
                "RELATIONSHIP_PREFERENCE", "BOUNDARY", "SHARED_EXPERIENCE",
                "SELF_REFLECTION", "OTHER").contains(category))
                || (tag != null && (tag.isBlank() || tag.codePointCount(0, tag.length()) > 100))) {
            throw invalid();
        }
        Instant asOf = Instant.now();
        AppUser owner = owner(username);
        String pattern = pattern(keyword);
        Long connectionId = access.activeConnectionId(owner.getId());
        long total = memories.count(owner.getId(), connectionId, scope, archived, pattern,
                category, tag);
        List<MemoryCard> cards = memories.page(owner.getId(), connectionId, scope, archived,
                pattern, category, tag, size, ((long) page - 1) * size);
        List<MemoryDtos.Summary> items = summaries(cards);
        List<MemoryDtos.TagCount> availableTags = memories.availableTags(
                owner.getId(), connectionId, scope, archived, pattern, category).stream()
                .map(row -> new MemoryDtos.TagCount(row.getTag(), row.getCount())).toList();
        return new MemoryDtos.Page(items, total, page, size, (long) page * size < total,
                asOf, availableTags);
    }

    @Transactional(readOnly = true)
    public MemoryDtos.Summary latestOwnSummary(AppUser owner) {
        List<MemoryCard> cards = memories.page(owner.getId(), null, "MINE", false,
                null, null, null, 1, 0);
        return cards.isEmpty() ? null : summaries(cards).getFirst();
    }

    private List<MemoryDtos.Summary> summaries(List<MemoryCard> cards) {
        Map<Long, List<String>> tagsByCard = new HashMap<>();
        Map<Long, MemoryDtos.PublicOwner> owners = new HashMap<>();
        if (!cards.isEmpty()) {
            for (MemoryTag row : memories.tagsForCards(cards.stream().map(MemoryCard::getId).toList())) {
                tagsByCard.computeIfAbsent(row.getCardId(), ignored -> new ArrayList<>()).add(row.getTag());
            }
            for (MemoryCard card : cards) {
                owners.computeIfAbsent(card.getOwnerId(), id -> {
                    AppUser author = users.findById(id);
                    return new MemoryDtos.PublicOwner(id.toString(), author.getNickname(),
                            author.getAvatarStyle());
                });
            }
        }
        return cards.stream().map(card -> new MemoryDtos.Summary(
                card.getId().toString(), card.getVersion().toString(), utc(card.getCreatedAt()),
                utc(card.getUpdatedAt()), card.getOwnerId().toString(), owners.get(card.getOwnerId()),
                card.getTitle(), card.getCategory(), tagsByCard.getOrDefault(card.getId(), List.of()),
                card.getSourceType(), card.getSharedConnectionId() == null ? null
                : card.getSharedConnectionId().toString())).toList();
    }

    private AppUser owner(String username) {
        AppUser owner = users.findByUsername(username);
        if (owner == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return owner;
    }

    private MemoryCard lockedVersion(long id, long ownerId, long expectedVersion) {
        MemoryCard card = lockOwned(id, ownerId);
        if (card.getVersion() != expectedVersion) {
            throw versionConflict();
        }
        return card;
    }

    private MemoryCard lockOwned(long id, long ownerId) {
        MemoryCard candidate = memories.findOwned(id, ownerId);
        if (candidate == null) {
            throw notFound();
        }
        MemoryCard card;
        if (candidate.getSharedConnectionId() != null) {
            card = access.lockShared(ownerId, id);
            if (card == null) {
                throw versionConflict();
            }
        } else {
            users.lockById(ownerId);
            card = memories.lockOwned(id, ownerId);
        }
        if (card == null) {
            throw notFound();
        }
        return card;
    }

    private MemoryDtos.Detail replayOwner(long ownerId, long cardId) {
        MemoryCard card = memories.findOwned(cardId, ownerId);
        if (card == null) {
            throw notFound();
        }
        return detail(card, ownerId);
    }

    private long partnerId(long connectionId, long ownerId) {
        PairConnection pair = connections.activeConnection(connectionId);
        if (pair == null || !member(pair, ownerId)) {
            throw versionConflict();
        }
        return pair.getUserAId() == ownerId ? pair.getUserBId() : pair.getUserAId();
    }

    private boolean member(PairConnection pair, long userId) {
        return pair.getUserAId() == userId || pair.getUserBId() == userId;
    }

    private ApiException versionConflict() {
        return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "卡片版本已变化");
    }

    private void changed(int rows) {
        if (rows != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "卡片版本已变化");
        }
    }

    private void replaceTags(long id, List<String> tags) {
        memories.deleteTags(id);
        for (String tag : tags) {
            memories.insertTag(id, tag);
        }
    }

    private MemoryDtos.Detail detail(MemoryCard card, long viewerId) {
        AppUser author = users.findById(card.getOwnerId());
        return new MemoryDtos.Detail(card.getId().toString(), card.getVersion().toString(),
                utc(card.getCreatedAt()), utc(card.getUpdatedAt()), card.getOwnerId().toString(),
                new MemoryDtos.PublicOwner(author.getId().toString(), author.getNickname(),
                        author.getAvatarStyle()),
                card.getSharedConnectionId() == null ? null : card.getSharedConnectionId().toString(),
                card.getTitle(), card.getBody(), card.getCategory(), memories.tagsForCard(card.getId()),
                card.getSourceType(), card.getSourceDate(), card.getNextAction(),
                card.getOwnerId() == viewerId ? card.isArchived() : null,
                reminders.forResource(viewerId, "MEMORY_CARD", card.getId()),
                settings.forCard(viewerId, card));
    }

    private Instant utc(LocalDateTime value) {
        return value.toInstant(ZoneOffset.UTC);
    }

    private String pattern(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        if (keyword.codePointCount(0, keyword.length()) > 5000) {
            throw invalid();
        }
        return "%" + keyword.replace("!", "!!").replace("%", "!%")
                .replace("_", "!_") + "%";
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "MEMORY_NOT_FOUND", "卡片不存在");
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

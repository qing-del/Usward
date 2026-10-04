package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MemoryDtos;
import com.jacolp.dto.MemoryWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.MemoryTag;
import com.jacolp.mapper.MemoryMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemoryService {
    private final MemoryMapper memories;
    private final UserMapper users;
    private final ReminderService reminders;
    private final ResourceLifecycleService lifecycle;
    private final MemoryAccessService access;

    public MemoryService(MemoryMapper memories, UserMapper users, ReminderService reminders,
                         ResourceLifecycleService lifecycle, MemoryAccessService access) {
        this.memories = memories;
        this.users = users;
        this.reminders = reminders;
        this.lifecycle = lifecycle;
        this.access = access;
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

    @Transactional
    public MemoryDtos.Detail patch(String username, long id, MemoryWriteRequest input) {
        AppUser owner = owner(username);
        MemoryCard card = lockedVersion(id, owner.getId(), input.expectedVersion());
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
        AppUser owner = owner(username, true);
        lockedVersion(id, owner.getId(), expectedVersion);
        lifecycle.close(owner.getId(), "MEMORY_CARD", id, true);
        changed(memories.softDelete(id, owner.getId(), expectedVersion));
        memories.deleteTags(id);
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
        return owner(username, false);
    }

    private AppUser owner(String username, boolean lock) {
        AppUser owner = lock ? users.lockByUsername(username) : users.findByUsername(username);
        if (owner == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return owner;
    }

    private MemoryCard lockedVersion(long id, long ownerId, long expectedVersion) {
        MemoryCard card = memories.lockOwned(id, ownerId);
        if (card == null) {
            throw notFound();
        }
        if (card.getVersion() != expectedVersion) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "卡片版本已变化");
        }
        return card;
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
        return new MemoryDtos.Detail(card.getId().toString(), card.getVersion().toString(),
                utc(card.getCreatedAt()), utc(card.getUpdatedAt()), card.getOwnerId().toString(),
                card.getSharedConnectionId() == null ? null : card.getSharedConnectionId().toString(),
                card.getTitle(), card.getBody(), card.getCategory(), memories.tagsForCard(card.getId()),
                card.getSourceType(), card.getSourceDate(), card.getNextAction(),
                card.getOwnerId() == viewerId ? card.isArchived() : null,
                reminders.forResource(viewerId, "MEMORY_CARD", card.getId()), null);
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

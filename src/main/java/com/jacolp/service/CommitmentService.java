package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.CommitmentDtos;
import com.jacolp.dto.CommitmentWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Commitment;
import com.jacolp.mapper.CalendarMapper;
import com.jacolp.mapper.CommitmentMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommitmentService {
    private final CommitmentMapper commitments;
    private final MemoryAccessService memories;
    private final CalendarMapper events;
    private final UserMapper users;
    private final ReminderService reminders;
    private final ResourceLifecycleService lifecycle;
    private final ExpressionAccessService expressions;

    public CommitmentService(CommitmentMapper commitments, MemoryAccessService memories,
                             CalendarMapper events, UserMapper users, ReminderService reminders,
                             ResourceLifecycleService lifecycle,
                             ExpressionAccessService expressions) {
        this.commitments = commitments;
        this.memories = memories;
        this.events = events;
        this.users = users;
        this.reminders = reminders;
        this.lifecycle = lifecycle;
        this.expressions = expressions;
    }

    @Transactional
    public CommitmentDtos.Detail create(String username, CommitmentWriteRequest input) {
        AppUser owner = owner(username);
        ensureSource(owner.getId(), input.sourceType(), input.sourceId());
        Commitment commitment = new Commitment();
        commitment.setOwnerId(owner.getId());
        commitment.setTitle(input.title());
        commitment.setBody(input.body());
        commitment.setNextAction(input.nextAction());
        commitment.setDueKind(input.dueKind());
        commitment.setDueAt(input.dueAt());
        commitment.setDueDate(input.dueDate());
        commitment.setDueTimezone(input.dueTimezone());
        commitment.setSourceType(input.sourceType());
        commitment.setSourceId(input.sourceId());
        commitments.insert(commitment);
        return detail(commitments.findOwned(commitment.getId(), owner.getId()), owner, Instant.now());
    }

    @Transactional(readOnly = true)
    public CommitmentDtos.Detail get(String username, long id) {
        AppUser owner = owner(username);
        Commitment commitment = commitments.findOwned(id, owner.getId());
        if (commitment == null) {
            throw notFound();
        }
        return detail(commitment, owner, Instant.now());
    }

    @Transactional(readOnly = true)
    public CommitmentDtos.Page list(String username, String scope, String status, String sort,
                                    int page, int size) {
        if (!List.of("MINE", "PARTNER", "ALL").contains(scope)
                || !List.of("OPEN", "DONE", "CANCELLED", "ALL").contains(status)
                || !List.of("DEADLINE_ASC", "UPDATED_DESC").contains(sort)
                || page < 1 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "查询参数无效");
        }
        Instant asOf = Instant.now();
        AppUser owner = owner(username);
        List<Commitment> all = "PARTNER".equals(scope) ? List.of()
                : commitments.listOwned(owner.getId());
        Map<String, Long> counts = Map.of(
                "OPEN", all.stream().filter(item -> "OPEN".equals(item.getStatus())).count(),
                "DONE", all.stream().filter(item -> "DONE".equals(item.getStatus())).count(),
                "CANCELLED", all.stream().filter(item -> "CANCELLED".equals(item.getStatus())).count());
        List<CommitmentDtos.Summary> matched = new ArrayList<>();
        for (Commitment item : all) {
            if ("ALL".equals(status) || status.equals(item.getStatus())) {
                matched.add(summary(item, owner, asOf));
            }
        }
        if ("DEADLINE_ASC".equals(sort)) {
            matched.sort(Comparator.comparing(CommitmentDtos.Summary::deadlineAt,
                    Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(item -> Long.parseLong(item.id())));
        } else {
            matched.sort(Comparator.comparing(CommitmentDtos.Summary::updatedAt).reversed()
                    .thenComparing((CommitmentDtos.Summary item) -> Long.parseLong(item.id()),
                            Comparator.reverseOrder()));
        }
        long total = matched.size();
        long offset = ((long) page - 1) * size;
        List<CommitmentDtos.Summary> items = offset >= total ? List.of()
                : List.copyOf(matched.subList((int) offset,
                        (int) Math.min(total, offset + size)));
        return new CommitmentDtos.Page(items, total, page, size, offset + size < total,
                asOf, counts);
    }

    @Transactional
    public CommitmentDtos.Detail patch(String username, long id, CommitmentWriteRequest input) {
        AppUser owner = owner(username, true);
        Commitment commitment = lockedVersion(id, owner.getId(), input.expectedVersion());
        if (input.present().contains("title")) {
            commitment.setTitle(input.title());
        }
        if (input.present().contains("body")) {
            commitment.setBody(input.body());
        }
        if (input.present().contains("nextAction")) {
            commitment.setNextAction(input.nextAction());
        }
        if (input.present().contains("dueKind")) {
            commitment.setDueKind(input.dueKind());
            commitment.setDueAt(input.dueAt());
            commitment.setDueDate(input.dueDate());
            commitment.setDueTimezone(input.dueTimezone());
        }
        if (input.present().contains("sourceType")) {
            ensureSource(owner.getId(), input.sourceType(), input.sourceId());
            commitment.setSourceType(input.sourceType());
            commitment.setSourceId(input.sourceId());
        }
        changed(commitments.updateOwned(commitment));
        return detail(commitments.findOwned(id, owner.getId()), owner, Instant.now());
    }

    @Transactional
    public CommitmentDtos.Detail complete(String username, long id, long expectedVersion,
                                          String result) {
        return changeStatus(username, id, expectedVersion, "DONE", result);
    }

    @Transactional
    public CommitmentDtos.Detail cancel(String username, long id, long expectedVersion) {
        return changeStatus(username, id, expectedVersion, "CANCELLED", null);
    }

    @Transactional
    public CommitmentDtos.Detail reopen(String username, long id, long expectedVersion) {
        return changeStatus(username, id, expectedVersion, "OPEN", null);
    }

    @Transactional
    public void delete(String username, long id, long expectedVersion) {
        AppUser owner = owner(username, true);
        lockedVersion(id, owner.getId(), expectedVersion);
        lifecycle.close(owner.getId(), "COMMITMENT", id, true);
        changed(commitments.deleteOwned(id, owner.getId(), expectedVersion));
    }

    private CommitmentDtos.Detail changeStatus(String username, long id, long expectedVersion,
                                               String next, String result) {
        AppUser owner = owner(username, true);
        Commitment current = lockedVersion(id, owner.getId(), expectedVersion);
        String old = current.getStatus();
        if (("OPEN".equals(next) && "OPEN".equals(old))
                || (!"OPEN".equals(next) && !"OPEN".equals(old))) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "承诺状态不允许此操作");
        }
        if (!"OPEN".equals(next)) {
            lifecycle.close(owner.getId(), "COMMITMENT", id, false);
        }
        changed(commitments.changeStatus(id, owner.getId(), old, next, result, expectedVersion));
        return detail(commitments.findOwned(id, owner.getId()), owner, Instant.now());
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

    private Commitment lockedVersion(long id, long ownerId, long expectedVersion) {
        Commitment commitment = commitments.lockOwned(id, ownerId);
        if (commitment == null) {
            throw notFound();
        }
        if (commitment.getVersion() != expectedVersion) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "承诺版本已变化");
        }
        return commitment;
    }

    private void changed(int rows) {
        if (rows != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "承诺版本已变化");
        }
    }

    private void ensureSource(long ownerId, String type, Long id) {
        if (type != null && !sourceAvailable(ownerId, type, id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "SOURCE_NOT_FOUND", "来源不存在");
        }
    }

    private boolean sourceAvailable(long ownerId, String type, Long id) {
        if (type == null || id == null) {
            return false;
        }
        return switch (type) {
            case "MEMORY_CARD" -> memories.readable(ownerId, id) != null;
            case "CALENDAR_EVENT" -> events.findOwned(id, ownerId) != null;
            case "EXPRESSION" -> expressions.activeContent(ownerId, id);
            default -> false;
        };
    }

    private CommitmentDtos.Detail detail(Commitment commitment, AppUser owner, Instant asOf) {
        CommitmentTime.State time = CommitmentTime.state(commitment, asOf, ZoneId.of(owner.getTimezone()));
        return new CommitmentDtos.Detail(commitment.getId().toString(),
                commitment.getVersion().toString(), utc(commitment.getCreatedAt()),
                utc(commitment.getUpdatedAt()), commitment.getOwnerId().toString(), null,
                commitment.getTitle(), commitment.getBody(), commitment.getNextAction(),
                commitment.getDueKind(), utc(commitment.getDueAt()), commitment.getDueDate(),
                commitment.getDueTimezone(), time.deadlineAt(), time.isOverdue(),
                time.isDueToday(), commitment.getStatus(), commitment.getResult(),
                commitment.getSourceType(), commitment.getSourceId() == null ? null
                : commitment.getSourceId().toString(), commitment.getSourceId() == null ? null
                : sourceAvailable(owner.getId(), commitment.getSourceType(), commitment.getSourceId()),
                reminders.forResource(owner.getId(), "COMMITMENT", commitment.getId()));
    }

    CommitmentDtos.Summary summary(Commitment commitment, AppUser owner, Instant asOf) {
        CommitmentTime.State time = CommitmentTime.state(commitment, asOf, ZoneId.of(owner.getTimezone()));
        CommitmentDtos.PublicOwner publicOwner = new CommitmentDtos.PublicOwner(
                owner.getId().toString(), owner.getNickname(), owner.getAvatarStyle());
        return new CommitmentDtos.Summary(commitment.getId().toString(),
                commitment.getVersion().toString(), utc(commitment.getCreatedAt()),
                utc(commitment.getUpdatedAt()), commitment.getOwnerId().toString(), publicOwner,
                commitment.getTitle(), commitment.getNextAction(), commitment.getStatus(),
                commitment.getDueKind(), utc(commitment.getDueAt()), commitment.getDueDate(),
                commitment.getDueTimezone(), time.deadlineAt(), time.isOverdue(),
                time.isDueToday(), null);
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "COMMITMENT_NOT_FOUND", "承诺不存在");
    }
}

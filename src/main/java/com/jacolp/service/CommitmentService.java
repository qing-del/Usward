package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.CommitmentDtos;
import com.jacolp.dto.CommitmentWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Commitment;
import com.jacolp.mapper.CalendarMapper;
import com.jacolp.mapper.CommitmentMapper;
import com.jacolp.mapper.MemoryMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommitmentService {
    private final CommitmentMapper commitments;
    private final MemoryMapper memories;
    private final CalendarMapper events;
    private final UserMapper users;

    public CommitmentService(CommitmentMapper commitments, MemoryMapper memories,
                             CalendarMapper events, UserMapper users) {
        this.commitments = commitments;
        this.memories = memories;
        this.events = events;
        this.users = users;
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

    private AppUser owner(String username) {
        AppUser owner = users.findByUsername(username);
        if (owner == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return owner;
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
            case "MEMORY_CARD" -> memories.findOwned(id, ownerId) != null;
            case "CALENDAR_EVENT" -> events.findOwned(id, ownerId) != null;
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
                null);
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "COMMITMENT_NOT_FOUND", "承诺不存在");
    }
}

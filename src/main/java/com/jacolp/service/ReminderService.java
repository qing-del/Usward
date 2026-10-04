package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.ReminderDtos;
import com.jacolp.dto.ReminderWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Commitment;
import com.jacolp.entity.Reminder;
import com.jacolp.mapper.CalendarMapper;
import com.jacolp.mapper.CommitmentMapper;
import com.jacolp.mapper.ReminderMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReminderService {
    private final ReminderMapper reminders;
    private final MemoryAccessService memories;
    private final CalendarMapper events;
    private final CommitmentMapper commitments;
    private final UserMapper users;

    public ReminderService(ReminderMapper reminders, MemoryAccessService memories,
                           CalendarMapper events, CommitmentMapper commitments, UserMapper users) {
        this.reminders = reminders;
        this.memories = memories;
        this.events = events;
        this.commitments = commitments;
        this.users = users;
    }

    @Transactional
    public ReminderDtos.Detail put(String username, ReminderWriteRequest input) {
        AppUser owner = owner(username, false);
        if (!lockAccessible(owner.getId(), input.resourceType(), input.resourceId(), true)) {
            throw notFound();
        }
        owner = users.findById(owner.getId());
        Reminder current = reminders.lockResource(owner.getId(), input.resourceType(),
                input.resourceId());
        if ((current == null && input.expectedRevision() != null)
                || (current != null && (input.expectedRevision() == null
                || current.getRevision().longValue() != input.expectedRevision()))) {
            throw revisionConflict();
        }
        if ("IN_APP_AND_MAIL".equals(input.deliveryMode())) {
            if (owner.getNotificationEmail() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "RECIPIENT_EMAIL_REQUIRED",
                        "请先设置通知收件邮箱");
            }
            throw new ApiException(HttpStatus.CONFLICT, "MAIL_NOT_AVAILABLE", "邮件通知尚不可用");
        }
        if (current == null) {
            Reminder next = new Reminder();
            next.setRecipientId(owner.getId());
            next.setResourceType(input.resourceType());
            next.setResourceId(input.resourceId());
            next.setScheduledAt(LocalDateTime.ofInstant(input.scheduledAt(), ZoneOffset.UTC));
            next.setDeliveryMode(input.deliveryMode());
            try {
                reminders.insert(next);
            } catch (DuplicateKeyException exception) {
                throw revisionConflict();
            }
        } else {
            if (reminders.reschedule(current.getId(), owner.getId(), current.getRevision(),
                    LocalDateTime.ofInstant(input.scheduledAt(), ZoneOffset.UTC),
                    input.deliveryMode()) != 1) {
                throw revisionConflict();
            }
            reminders.cancelDeliveries(current.getId());
        }
        return dto(reminders.findResource(owner.getId(), input.resourceType(), input.resourceId()));
    }

    @Transactional
    public ReminderDtos.Detail cancel(String username, long id, long expectedRevision) {
        AppUser owner = owner(username, false);
        Reminder candidate = reminders.findOwned(id, owner.getId());
        if (candidate == null || !lockAccessible(owner.getId(), candidate.getResourceType(),
                candidate.getResourceId(), false)) {
            throw notFound();
        }
        Reminder current = reminders.lockOwned(id, owner.getId());
        if (current == null) {
            throw notFound();
        }
        if ("CANCELLED".equals(current.getStatus())) {
            if (expectedRevision == current.getRevision()
                    || expectedRevision == current.getRevision() - 1) {
                return dto(current);
            }
            throw revisionConflict();
        }
        if (expectedRevision != current.getRevision()) {
            throw revisionConflict();
        }
        if (reminders.cancel(id, owner.getId(), expectedRevision) != 1) {
            throw revisionConflict();
        }
        reminders.cancelDeliveries(id);
        return dto(reminders.findOwned(id, owner.getId()));
    }

    @Transactional(readOnly = true)
    public ReminderDtos.Page list(String username, String resourceType, String status,
                                  String sort, int page, int size) {
        if ((resourceType != null && !List.of("MEMORY_CARD", "CALENDAR_EVENT", "COMMITMENT")
                .contains(resourceType)) || !List.of("ALL", "PENDING", "FIRED", "CANCELLED")
                .contains(status) || !"SCHEDULED_ASC".equals(sort)
                || page < 1 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "查询参数无效");
        }
        Instant asOf = Instant.now();
        AppUser owner = owner(username, false);
        List<ReminderDtos.Detail> matched = visible(owner.getId(), resourceType, status);
        long total = matched.size();
        long offset = ((long) page - 1) * size;
        List<ReminderDtos.Detail> items = offset >= total ? List.of()
                : List.copyOf(matched.subList((int) offset,
                        (int) Math.min(total, offset + size)));
        return new ReminderDtos.Page(items, total, page, size, offset + size < total, asOf);
    }

    @Transactional(readOnly = true)
    public ReminderDtos.Detail forResource(long recipientId, String resourceType, long resourceId) {
        Reminder row = reminders.findResource(recipientId, resourceType, resourceId);
        return row == null ? null : dto(row);
    }

    @Transactional(readOnly = true)
    public List<ReminderDtos.Detail> pendingForDashboard(long recipientId) {
        return visible(recipientId, null, "PENDING");
    }

    private List<ReminderDtos.Detail> visible(long recipientId, String resourceType, String status) {
        List<ReminderDtos.Detail> matched = new ArrayList<>();
        for (Reminder row : reminders.listRecipient(recipientId)) {
            if ((resourceType == null || resourceType.equals(row.getResourceType()))
                    && ("ALL".equals(status) || status.equals(row.getStatus()))
                    && accessible(recipientId, row.getResourceType(), row.getResourceId())) {
                matched.add(dto(row));
            }
        }
        return matched;
    }

    public boolean accessible(long recipientId, String type, long resourceId) {
        return switch (type) {
            case "MEMORY_CARD" -> memories.readable(recipientId, resourceId) != null;
            case "CALENDAR_EVENT" -> events.findOwned(resourceId, recipientId) != null;
            case "COMMITMENT" -> commitments.findOwned(resourceId, recipientId) != null;
            default -> false;
        };
    }

    public boolean lockAccessible(long recipientId, String type, long resourceId, boolean forSetting) {
        if ("MEMORY_CARD".equals(type)) {
            return memories.lockReadable(recipientId, resourceId) != null;
        }
        users.lockById(recipientId);
        return switch (type) {
            case "CALENDAR_EVENT" -> events.lockOwned(resourceId, recipientId) != null;
            case "COMMITMENT" -> {
                Commitment row = commitments.lockOwned(resourceId, recipientId);
                yield row != null && (!forSetting || "OPEN".equals(row.getStatus()));
            }
            default -> false;
        };
    }

    ReminderDtos.Detail dto(Reminder row) {
        return new ReminderDtos.Detail(row.getId().toString(), row.getResourceType(),
                row.getResourceId().toString(), utc(row.getScheduledAt()),
                row.getDeliveryMode(), row.getRevision().toString(), row.getStatus(),
                row.getVersion().toString(), utc(row.getCreatedAt()), utc(row.getUpdatedAt()));
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private AppUser owner(String username, boolean lock) {
        AppUser row = lock ? users.lockByUsername(username) : users.findByUsername(username);
        if (row == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return row;
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "REMINDER_NOT_FOUND", "提醒或关联内容不存在");
    }

    private ApiException revisionConflict() {
        return new ApiException(HttpStatus.CONFLICT, "REMINDER_REVISION_CONFLICT", "提醒修订已变化");
    }
}

package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.NotificationDtos;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.Notification;
import com.jacolp.entity.NotificationDelivery;
import com.jacolp.mapper.NotificationMapper;
import com.jacolp.mapper.UserMapper;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final NotificationMapper notifications;
    private final UserMapper users;
    private final NotificationAccessService access;
    private final NotificationSnapshotStore snapshots;

    public NotificationService(NotificationMapper notifications, UserMapper users,
                               NotificationAccessService access, NotificationSnapshotStore snapshots) {
        this.notifications = notifications;
        this.users = users;
        this.access = access;
        this.snapshots = snapshots;
    }

    @Transactional(readOnly = true)
    public NotificationDtos.Page list(String username, String read, String sort, int page, int size,
                                      HttpSession session) {
        if (!List.of("ALL", "UNREAD", "READ").contains(read)
                || !"CREATED_DESC".equals(sort) || page < 1 || size < 1 || size > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "查询参数无效");
        }
        Instant asOf = Instant.now();
        AppUser owner = owner(username, false);
        List<Notification> visible = visible(owner.getId());
        List<Long> unreadIds = visible.stream().filter(item -> item.getReadAt() == null)
                .map(Notification::getId).toList();
        List<Notification> matching = visible.stream()
                .filter(item -> "ALL".equals(read) || ("UNREAD".equals(read)) ==
                        (item.getReadAt() == null)).toList();
        long total = matching.size();
        long offset = ((long) page - 1) * size;
        List<NotificationDtos.Detail> items = new ArrayList<>();
        if (offset < total) {
            for (Notification row : matching.subList((int) offset,
                    (int) Math.min(total, offset + size))) {
                items.add(dto(row));
            }
        }
        String boundary = snapshots.issue(session, owner.getId(), unreadIds);
        return new NotificationDtos.Page(items, total, page, size, offset + size < total,
                asOf, unreadIds.size(), boundary);
    }

    @Transactional
    public NotificationDtos.Detail read(String username, long id) {
        AppUser owner = owner(username, true);
        Notification row = notifications.findOwned(id, owner.getId());
        if (row == null || !access.accessible(owner.getId(), row.getResourceType(),
                row.getResourceId())) {
            throw notFound();
        }
        if (row.getReadAt() == null) {
            notifications.markRead(id, owner.getId());
        }
        return dto(notifications.findOwned(id, owner.getId()));
    }

    @Transactional
    public NotificationDtos.ReadAllResult readAll(String username, String boundary,
                                                   HttpSession session) {
        AppUser owner = owner(username, true);
        List<Long> ids = snapshots.members(session, owner.getId(), boundary);
        long updated = 0;
        for (long id : ids) {
            Notification row = notifications.findOwned(id, owner.getId());
            if (row != null && access.accessible(owner.getId(), row.getResourceType(),
                    row.getResourceId())) {
                updated += notifications.markRead(id, owner.getId());
            }
        }
        return new NotificationDtos.ReadAllResult(updated, unreadCount(owner.getId()));
    }

    @Transactional(readOnly = true)
    public long unreadCount(long recipientId) {
        return visible(recipientId).stream().filter(item -> item.getReadAt() == null).count();
    }

    private List<Notification> visible(long recipientId) {
        return notifications.listRecipient(recipientId).stream()
                .filter(row -> access.accessible(recipientId, row.getResourceType(),
                        row.getResourceId())).toList();
    }

    private NotificationDtos.Detail dto(Notification row) {
        NotificationDelivery delivery = notifications.delivery(row.getId());
        NotificationDtos.MailDelivery mail = delivery == null ? null
                : new NotificationDtos.MailDelivery(delivery.getStatus(), utc(delivery.getSentAt()),
                "FAILED".equals(delivery.getStatus()) ? delivery.getLastErrorCode() : null);
        return new NotificationDtos.Detail(row.getId().toString(), row.getVersion().toString(),
                row.getKind(), row.getResourceType(), row.getResourceId().toString(),
                row.getMessage(), utc(row.getCreatedAt()), utc(row.getUpdatedAt()),
                utc(row.getReadAt()), mail);
    }

    private AppUser owner(String username, boolean lock) {
        AppUser row = lock ? users.lockByUsername(username) : users.findByUsername(username);
        if (row == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return row;
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND", "通知不存在");
    }
}

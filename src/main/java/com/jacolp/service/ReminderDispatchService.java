package com.jacolp.service;

import com.jacolp.entity.AppUser;
import com.jacolp.entity.Notification;
import com.jacolp.entity.Reminder;
import com.jacolp.mapper.NotificationMapper;
import com.jacolp.mapper.ReminderMapper;
import com.jacolp.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReminderDispatchService {
    private final ReminderMapper reminders;
    private final NotificationMapper notifications;
    private final UserMapper users;
    private final ReminderService access;

    public ReminderDispatchService(ReminderMapper reminders, NotificationMapper notifications,
                                   UserMapper users, ReminderService access) {
        this.reminders = reminders;
        this.notifications = notifications;
        this.users = users;
        this.access = access;
    }

    @Transactional
    public boolean dispatch(long id) {
        Reminder candidate = reminders.findById(id);
        if (candidate == null || !"PENDING".equals(candidate.getStatus())) {
            return false;
        }
        AppUser recipient = users.lockById(candidate.getRecipientId());
        boolean accessible = recipient != null && access.lockAccessible(recipient.getId(),
                candidate.getResourceType(), candidate.getResourceId(), true);
        Reminder current = reminders.lockOwned(id, candidate.getRecipientId());
        if (current == null || !"PENDING".equals(current.getStatus())) {
            return false;
        }
        if (!accessible) {
            reminders.cancel(id, current.getRecipientId(), current.getRevision());
            reminders.cancelDeliveries(id);
            return true;
        }
        if (reminders.markFired(id, current.getRecipientId(), current.getRevision()) != 1) {
            return false;
        }
        Notification notification = new Notification();
        notification.setRecipientId(current.getRecipientId());
        notification.setKind("REMINDER_DUE");
        notification.setResourceType(current.getResourceType());
        notification.setResourceId(current.getResourceId());
        notification.setMessage("你设置的提醒已到，请登录 Usward 查看");
        notification.setDedupeKey("reminder:" + id + ":" + current.getRevision());
        notifications.insert(notification);
        if ("IN_APP_AND_MAIL".equals(current.getDeliveryMode())) {
            notifications.insertDisabledMail(notification.getId(), id, current.getRevision(),
                    recipient.getId(), recipient.getNotificationEmail());
        }
        return true;
    }
}

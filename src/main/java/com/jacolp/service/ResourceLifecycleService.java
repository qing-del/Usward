package com.jacolp.service;

import com.jacolp.entity.Reminder;
import com.jacolp.mapper.ReminderMapper;
import org.springframework.stereotype.Service;

@Service
public class ResourceLifecycleService {
    private final ReminderMapper reminders;

    public ResourceLifecycleService(ReminderMapper reminders) {
        this.reminders = reminders;
    }

    // The caller holds the account and resource locks inside its business transaction.
    public void close(long recipientId, String resourceType, long resourceId, boolean deleted) {
        Reminder reminder = reminders.lockResource(recipientId, resourceType, resourceId);
        if (deleted) {
            reminders.lockNotifications(resourceType, resourceId);
        }
        if (reminder != null) {
            if ("PENDING".equals(reminder.getStatus())) {
                reminders.cancel(reminder.getId(), recipientId, reminder.getRevision());
            }
            reminders.cancelDeliveries(reminder.getId());
        }
        if (deleted) {
            reminders.cancelResourceDeliveries(resourceType, resourceId);
            reminders.invalidateNotifications(resourceType, resourceId);
        }
    }
}

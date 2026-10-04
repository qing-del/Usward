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

    // A share can disappear while the author keeps the underlying private resource.
    public void revokeAccess(long recipientId, String resourceType, long resourceId) {
        Reminder reminder = reminders.lockResource(recipientId, resourceType, resourceId);
        reminders.lockRecipientNotifications(recipientId, resourceType, resourceId);
        if (reminder != null) {
            if ("PENDING".equals(reminder.getStatus())) {
                reminders.cancel(reminder.getId(), recipientId, reminder.getRevision());
            }
            reminders.cancelDeliveries(reminder.getId());
        }
        reminders.cancelRecipientResourceDeliveries(recipientId, resourceType, resourceId);
        reminders.invalidateRecipientNotifications(recipientId, resourceType, resourceId);
    }

    // Revoke notifications about a share or deleted comments without hiding the author's own reminder.
    public void revokeCardBusiness(long cardId) {
        reminders.lockCardBusinessNotifications(cardId);
        reminders.cancelCardBusinessDeliveries(cardId);
        reminders.invalidateCardBusinessNotifications(cardId);
    }
}

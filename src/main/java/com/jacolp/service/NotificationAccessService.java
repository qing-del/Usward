package com.jacolp.service;

import org.springframework.stereotype.Service;

/** Visibility for notifications, independent of eligibility for a private reminder. */
@Service
public class NotificationAccessService {
    private final ReminderService reminders;

    public NotificationAccessService(ReminderService reminders) {
        this.reminders = reminders;
    }

    public boolean accessible(long recipientId, String resourceType, long resourceId) {
        return switch (resourceType) {
            case "MEMORY_CARD", "CALENDAR_EVENT", "COMMITMENT" ->
                    reminders.accessible(recipientId, resourceType, resourceId);
            default -> false;
        };
    }
}

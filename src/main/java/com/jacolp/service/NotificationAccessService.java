package com.jacolp.service;

import org.springframework.stereotype.Service;

/** Visibility for notifications, independent of eligibility for a private reminder. */
@Service
public class NotificationAccessService {
    private final ReminderService reminders;
    private final ExpressionAccessService expressions;

    public NotificationAccessService(ReminderService reminders, ExpressionAccessService expressions) {
        this.reminders = reminders;
        this.expressions = expressions;
    }

    public boolean accessible(long recipientId, String resourceType, long resourceId) {
        return switch (resourceType) {
            case "MEMORY_CARD", "CALENDAR_EVENT", "COMMITMENT" ->
                    reminders.accessible(recipientId, resourceType, resourceId);
            case "EXPRESSION" -> expressions.activeContent(recipientId, resourceId);
            default -> false;
        };
    }
}

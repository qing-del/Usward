package com.jacolp.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class EventDtos {
    private EventDtos() {
    }

    public record Detail(String id, String version, Instant createdAt, Instant updatedAt,
                         String kind, String ownerId, String connectionId, String title,
                         String location, String note, boolean allDay, Instant startsAt,
                         Instant endsAt, LocalDate startDate, LocalDate endDateExclusive,
                         String eventTimezone, String availability, boolean shareTitle,
                         Instant offlineConfirmedAt, String status, String originInvitationId,
                         String pendingChangeInvitationId, String cancellationReason,
                         ReminderDtos.Detail myReminder, Void myNotificationSetting) {
    }

    public record CalendarView(List<Detail> items, Instant from, Instant to,
                               String timezone, Instant asOf) {
    }
}

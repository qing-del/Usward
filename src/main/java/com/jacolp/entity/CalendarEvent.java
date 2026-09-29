package com.jacolp.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CalendarEvent {
    private Long id;
    private Long ownerId;
    private Long connectionId;
    private String kind;
    private String title;
    private LocalDateTime startsAt;
    private LocalDateTime endsAt;
    private LocalDate startDate;
    private LocalDate endDateExclusive;
    private String eventTimezone;
    private String note;
    private String location;
    private String availability;
    private boolean shareTitle;
    private LocalDateTime offlineConfirmedAt;
    private String status;
    private Long originInvitationId;
    private Long pendingChangeInvitationId;
    private String cancellationReason;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}

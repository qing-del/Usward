package com.jacolp.dto;

import java.time.Instant;
import java.time.LocalDate;

public final class CommitmentDtos {
    private CommitmentDtos() {
    }

    public record Detail(String id, String version, Instant createdAt, Instant updatedAt,
                         String ownerId, String sharedConnectionId, String title, String body,
                         String nextAction, String dueKind, Instant dueAt, LocalDate dueDate,
                         String dueTimezone, Instant deadlineAt, boolean isOverdue,
                         boolean isDueToday, String status, String result, String sourceType,
                         String sourceId, Boolean sourceAvailable, Void myReminder) {
    }
}

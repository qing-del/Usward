package com.jacolp.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class CommitmentDtos {
    private CommitmentDtos() {
    }

    public record Detail(String id, String version, Instant createdAt, Instant updatedAt,
                         String ownerId, String sharedConnectionId, String title, String body,
                         String nextAction, String dueKind, Instant dueAt, LocalDate dueDate,
                         String dueTimezone, Instant deadlineAt, boolean isOverdue,
                         boolean isDueToday, String status, String result, String sourceType,
                         String sourceId, Boolean sourceAvailable, ReminderDtos.Detail myReminder) {
    }

    public record PublicOwner(String id, String nickname, String avatarStyle) {
    }

    public record Summary(String id, String version, Instant createdAt, Instant updatedAt,
                          String ownerId, PublicOwner owner, String title, String nextAction,
                          String status, String dueKind, Instant dueAt, LocalDate dueDate,
                          String dueTimezone, Instant deadlineAt, boolean isOverdue,
                          boolean isDueToday, String sharedConnectionId) {
    }

    public record Page(List<Summary> items, long total, int page, int size, boolean hasMore,
                       Instant asOf, Map<String, Long> statusCounts) {
    }
}

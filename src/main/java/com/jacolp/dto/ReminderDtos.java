package com.jacolp.dto;

import java.time.Instant;
import java.util.List;

public final class ReminderDtos {
    private ReminderDtos() {
    }

    public record Detail(String id, String resourceType, String resourceId, Instant scheduledAt,
                         String deliveryMode, String revision, String status, String version,
                         Instant createdAt, Instant updatedAt) {
    }

    public record Page(List<Detail> items, long total, int page, int size, boolean hasMore,
                       Instant asOf) {
    }
}

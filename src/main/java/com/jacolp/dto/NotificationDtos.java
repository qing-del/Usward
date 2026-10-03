package com.jacolp.dto;

import java.time.Instant;
import java.util.List;

public final class NotificationDtos {
    private NotificationDtos() {
    }

    public record MailDelivery(String status, Instant sentAt, String failureCode) {
    }

    public record Detail(String id, String version, String kind, String resourceType,
                         String resourceId, String message, Instant createdAt, Instant updatedAt,
                         Instant readAt, MailDelivery mailDelivery) {
    }

    public record Page(List<Detail> items, long total, int page, int size, boolean hasMore,
                       Instant asOf, long unreadCount, String readBoundary) {
    }

    public record ReadAllResult(long updatedCount, long unreadCount) {
    }
}

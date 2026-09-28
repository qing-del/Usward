package com.jacolp.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class MemoryDtos {
    private MemoryDtos() {
    }

    public record PublicOwner(String id, String nickname, String avatarStyle) {
    }

    public record Detail(String id, String version, Instant createdAt, Instant updatedAt,
                         String ownerId, String sharedConnectionId, String title, String body,
                         String category, List<String> tags, String sourceType, LocalDate sourceDate,
                         String nextAction, boolean archived, Object myReminder,
                         Object myNotificationSetting) {
    }

    public record Summary(String id, String version, Instant createdAt, Instant updatedAt,
                          String ownerId, PublicOwner owner, String title, String category,
                          List<String> tags, String sourceType, String sharedConnectionId) {
    }

    public record TagCount(String tag, long count) {
    }

    public record Page(List<Summary> items, long total, int page, int size, boolean hasMore,
                       Instant asOf, List<TagCount> availableTags) {
    }
}

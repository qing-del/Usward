package com.jacolp.dto;

import java.time.Instant;
import java.util.List;

public final class ExpressionDtos {
    private ExpressionDtos() {
    }

    public record Reply(String id, String expressionId, String authorId,
                        String preset, String body, Instant createdAt) {
    }

    public record Replies(List<Reply> items, long total, int page, int size, boolean hasMore) {
    }

    public record Summary(String id, String version, String connectionId, String senderId,
                          String recipientId, String type, String responseWindow,
                          String responseMode, String status, long replyCount, Reply lastReply,
                          Instant createdAt, Instant updatedAt) {
    }

    public record Detail(String id, String version, String connectionId, String senderId,
                         String recipientId, String type, String body, String responseWindow,
                         String responseMode, String status, long replyCount, Reply lastReply,
                         Replies replies, NotificationSettingDtos.FollowUp myNotificationSetting,
                         Instant createdAt, Instant updatedAt) {
    }

    public record Withdrawn(String id, String version, String connectionId, String senderId,
                            String recipientId, String status, Instant createdAt,
                            Instant updatedAt) {
    }

    public record Page(List<Object> items, long total, int page, int size,
                       boolean hasMore, Instant asOf) {
    }

    public record Replied(Reply reply, String expressionVersion, String status) {
    }
}

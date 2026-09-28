package com.jacolp.dto;

public record MeResponse(
        String id,
        String username,
        String nickname,
        String avatarStyle,
        String timezone,
        String notificationEmail,
        boolean mailReminderAvailable,
        boolean shareAvailability,
        String version,
        MeStats stats
) {
    public record MeStats(long openCommitmentCount, long archivedMemoryCount) {
    }
}

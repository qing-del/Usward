package com.jacolp.dto;

public final class NotificationSettingDtos {
    private NotificationSettingDtos() {
    }

    public record Detail(String resourceType, String resourceId, String followUpMode,
                         String version) {
    }

    public record FollowUp(String followUpMode, String version) {
    }

    public record Capabilities(boolean selfMailAvailable, boolean otherMailAvailable,
                               String effectiveOutgoingMode) {
    }
}

package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record ReminderWriteRequest(String resourceType, long resourceId, Instant scheduledAt,
                                   String deliveryMode, Long expectedRevision) {
    private static final Set<String> RESOURCE_TYPES = Set.of("MEMORY_CARD", "CALENDAR_EVENT", "COMMITMENT");

    public static ReminderWriteRequest put(Map<String, Object> body) {
        if (body == null || !Set.of("resourceType", "resourceId", "scheduledAt",
                "deliveryMode", "expectedRevision").containsAll(body.keySet())
                || !body.keySet().containsAll(Set.of("resourceType", "resourceId",
                "scheduledAt", "expectedRevision"))) {
            throw invalid();
        }
        if (!(body.get("resourceType") instanceof String type) || !RESOURCE_TYPES.contains(type)
                || !(body.get("scheduledAt") instanceof String at) || !at.endsWith("Z")) {
            throw invalid();
        }
        String mode = "IN_APP";
        if (body.containsKey("deliveryMode")) {
            if (!(body.get("deliveryMode") instanceof String value)
                    || !Set.of("IN_APP", "IN_APP_AND_MAIL").contains(value)) {
                throw invalid();
            }
            mode = value;
        }
        try {
            return new ReminderWriteRequest(type, positiveId(body.get("resourceId")),
                    Instant.parse(at).truncatedTo(ChronoUnit.MICROS), mode,
                    revision(body.get("expectedRevision")));
        } catch (DateTimeParseException exception) {
            throw invalid();
        }
    }

    public static long cancelRevision(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(Set.of("expectedRevision"))) {
            throw invalid();
        }
        Long revision = revision(body.get("expectedRevision"));
        if (revision == null) {
            throw invalid();
        }
        return revision;
    }

    public static long positiveId(Object raw) {
        if (!(raw instanceof String value) || !value.matches("[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static Long revision(Object raw) {
        if (raw == null) {
            return null;
        }
        return positiveId(raw);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "提醒字段无效");
    }
}

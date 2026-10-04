package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public final class ExpressionRequests {
    private ExpressionRequests() {
    }

    public record Send(long connectionId, String type, String body, String responseWindow,
                       String responseMode, String outgoingMode, String followUpMode) {
    }

    public record Reply(long expectedVersion, String preset, String body,
                        NotificationOverrideRequest notificationOverride) {
    }

    public static Send send(Map<String, Object> input) {
        if (input == null || !Set.of("connectionId", "type", "body", "responseWindow",
                "responseMode", "notificationPlan").containsAll(input.keySet())
                || !(input.get("type") instanceof String type)
                || !Set.of("SPEND_TIME", "SHARE_SOMETHING", "DO_SOMETHING", "HURT_FEELINGS",
                "NEED_SPACE", "FREE_TEXT").contains(type)) {
            throw invalid();
        }
        long connectionId = decimal(input.get("connectionId"), false);
        String body = optional(input, "body", 5000);
        if ("FREE_TEXT".equals(type) && (body == null || body.isBlank())) {
            throw invalid();
        }
        String window = optionalEnum(input, "responseWindow",
                Set.of("WHEN_AVAILABLE", "TODAY", "NOW"));
        String mode = optionalEnum(input, "responseMode",
                Set.of("LISTEN", "THINK_TOGETHER", "KEEP_COMPANY", "JUST_TELLING"));
        String outgoing = "IN_APP";
        String followUp = "IN_APP";
        if (input.containsKey("notificationPlan")) {
            if (!(input.get("notificationPlan") instanceof Map<?, ?> plan)
                    || !plan.keySet().equals(Set.of("outgoingMode", "followUpMode"))
                    || !(plan.get("outgoingMode") instanceof String out)
                    || !(plan.get("followUpMode") instanceof String follow)
                    || !Set.of("NONE", "IN_APP", "IN_APP_AND_MAIL").contains(out)
                    || !Set.of("NONE", "IN_APP", "IN_APP_AND_MAIL").contains(follow)) {
                throw invalid();
            }
            outgoing = out;
            followUp = follow;
        }
        return new Send(connectionId, type, body, window, mode, outgoing, followUp);
    }

    public static Reply reply(Map<String, Object> input) {
        if (input == null || !Set.of("expectedVersion", "preset", "body", "notificationOverride")
                .containsAll(input.keySet()) || !input.containsKey("expectedVersion")) {
            throw invalid();
        }
        String preset = optionalEnum(input, "preset",
                Set.of("LATER", "AVAILABLE_NOW", "ANOTHER_TIME"));
        String body = optional(input, "body", 1000);
        if (preset == null && (body == null || body.isBlank())) {
            throw invalid();
        }
        return new Reply(decimal(input.get("expectedVersion"), true), preset, body,
                input.containsKey("notificationOverride")
                        ? NotificationOverrideRequest.parse(input.get("notificationOverride")) : null);
    }

    public static long versionOnly(Map<String, Object> input) {
        if (input == null || !input.keySet().equals(Set.of("expectedVersion"))) {
            throw invalid();
        }
        return decimal(input.get("expectedVersion"), true);
    }

    public static long decimal(Object raw, boolean zero) {
        if (!(raw instanceof String value)
                || !value.matches(zero ? "(0|[1-9][0-9]*)" : "[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static String optional(Map<String, Object> input, String field, int max) {
        Object raw = input.get(field);
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String value) || value.codePointCount(0, value.length()) > max) {
            throw invalid();
        }
        return value;
    }

    private static String optionalEnum(Map<String, Object> input, String field, Set<String> allowed) {
        Object raw = input.get(field);
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String value) || !allowed.contains(value)) {
            throw invalid();
        }
        return value;
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

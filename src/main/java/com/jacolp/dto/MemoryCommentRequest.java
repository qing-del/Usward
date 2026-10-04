package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record MemoryCommentRequest(long expectedVersion, String body,
                                   NotificationOverrideRequest notificationOverride) {
    public static MemoryCommentRequest parse(Map<String, Object> input) {
        if (input == null || !Set.of("expectedVersion", "body", "notificationOverride")
                .containsAll(input.keySet()) || !input.containsKey("expectedVersion")
                || !(input.get("body") instanceof String body) || body.isBlank()
                || body.codePointCount(0, body.length()) > 1000) {
            throw invalid();
        }
        return new MemoryCommentRequest(MemoryWriteRequest.version(input.get("expectedVersion")),
                body, input.containsKey("notificationOverride")
                ? NotificationOverrideRequest.parse(input.get("notificationOverride")) : null);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

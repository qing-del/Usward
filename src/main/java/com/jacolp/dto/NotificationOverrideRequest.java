package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record NotificationOverrideRequest(String mode, String token) {
    public static NotificationOverrideRequest parse(Object raw) {
        if (!(raw instanceof Map<?, ?> input)
                || !input.keySet().equals(Set.of("mode", "token"))
                || !(input.get("mode") instanceof String mode)
                || !(input.get("token") instanceof String token)
                || token.isBlank() || token.length() > 200
                || (!"NONE".equals(mode) && !"IN_APP".equals(mode))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "通知改选字段无效");
        }
        return new NotificationOverrideRequest(mode, token);
    }
}

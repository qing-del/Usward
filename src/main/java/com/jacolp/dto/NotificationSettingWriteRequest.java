package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Set;
import java.util.Map;
import org.springframework.http.HttpStatus;

public record NotificationSettingWriteRequest(String followUpMode, Long expectedVersion) {
    public static NotificationSettingWriteRequest parse(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(Set.of("followUpMode", "expectedVersion"))
                || !(body.get("followUpMode") instanceof String mode)
                || !Set.of("NONE", "IN_APP", "IN_APP_AND_MAIL").contains(mode)) {
            throw invalid();
        }
        Object raw = body.get("expectedVersion");
        if (raw == null) {
            return new NotificationSettingWriteRequest(mode, null);
        }
        if (!(raw instanceof String value) || !value.matches("[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return new NotificationSettingWriteRequest(mode, Long.parseLong(value));
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

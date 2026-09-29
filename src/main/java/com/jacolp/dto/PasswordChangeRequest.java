package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record PasswordChangeRequest(String oldPassword, String newPassword) {
    public static PasswordChangeRequest parse(Map<String, Object> input) {
        if (input == null || !input.keySet().equals(Set.of("oldPassword", "newPassword"))
                || !(input.get("oldPassword") instanceof String oldPassword)
                || oldPassword.isBlank()
                || !(input.get("newPassword") instanceof String newPassword)
                || newPassword.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
        }
        return new PasswordChangeRequest(oldPassword, newPassword);
    }
}

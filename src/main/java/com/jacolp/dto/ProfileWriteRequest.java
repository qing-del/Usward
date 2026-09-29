package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

public record ProfileWriteRequest(Set<String> present, long expectedVersion, String nickname,
                                  String avatarStyle, String timezone, String notificationEmail,
                                  Boolean shareAvailability) {
    private static final Set<String> FIELDS = Set.of("expectedVersion", "nickname", "avatarStyle",
            "timezone", "notificationEmail", "shareAvailability");
    private static final Set<String> AVATARS = Set.of("INITIAL", "FLOWER", "SUN", "SPROUT");
    private static final Pattern EMAIL = Pattern.compile(
            "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
                    + "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
                    + "(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+");

    public static ProfileWriteRequest parse(Map<String, Object> input) {
        if (input == null || !FIELDS.containsAll(input.keySet()) || input.size() < 2) {
            throw invalid();
        }
        Set<String> present = Set.copyOf(input.keySet());
        long expectedVersion = version(input.get("expectedVersion"));
        String nickname = null;
        if (present.contains("nickname")) {
            nickname = requiredText(input.get("nickname"), 100);
        }
        String avatarStyle = null;
        if (present.contains("avatarStyle")) {
            if (!(input.get("avatarStyle") instanceof String value) || !AVATARS.contains(value)) {
                throw invalid();
            }
            avatarStyle = value;
        }
        String timezone = null;
        if (present.contains("timezone")) {
            timezone = requiredText(input.get("timezone"), 64);
            try {
                ZoneId.of(timezone);
            } catch (DateTimeException exception) {
                throw invalid();
            }
        }
        String notificationEmail = null;
        if (present.contains("notificationEmail") && input.get("notificationEmail") != null) {
            if (!(input.get("notificationEmail") instanceof String value)
                    || value.length() > 320 || !EMAIL.matcher(value).matches()) {
                throw invalid();
            }
            notificationEmail = value;
        }
        Boolean shareAvailability = null;
        if (present.contains("shareAvailability")) {
            if (!(input.get("shareAvailability") instanceof Boolean value)) {
                throw invalid();
            }
            shareAvailability = value;
        }
        return new ProfileWriteRequest(present, expectedVersion, nickname, avatarStyle,
                timezone, notificationEmail, shareAvailability);
    }

    private static String requiredText(Object raw, int max) {
        if (!(raw instanceof String value) || value.isBlank()
                || value.codePointCount(0, value.length()) > max) {
            throw invalid();
        }
        return value;
    }

    private static long version(Object raw) {
        if (!(raw instanceof String value) || !value.matches("0|[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record MemoryWriteRequest(Set<String> present, String title, String body,
                                 String category, List<String> tags, String sourceType,
                                 LocalDate sourceDate, String nextAction, Long expectedVersion) {
    private static final Set<String> CONTENT_FIELDS = Set.of(
            "title", "body", "category", "tags", "sourceType", "sourceDate", "nextAction");
    private static final Set<String> CATEGORIES = Set.of("INTEREST", "RECENT_CONCERN",
            "RELATIONSHIP_PREFERENCE", "BOUNDARY", "SHARED_EXPERIENCE", "SELF_REFLECTION", "OTHER");
    private static final Set<String> SOURCE_TYPES = Set.of("EXPLICIT", "OBSERVED", "INTERPRETATION");

    public static MemoryWriteRequest create(Map<String, Object> input) {
        checkFields(input, CONTENT_FIELDS);
        return parse(input, false);
    }

    public static MemoryWriteRequest patch(Map<String, Object> input) {
        Set<String> allowed = new HashSet<>(CONTENT_FIELDS);
        allowed.add("expectedVersion");
        checkFields(input, allowed);
        if (input.size() < 2) {
            throw invalid();
        }
        return parse(input, true);
    }

    public static long expectedVersionOnly(Map<String, Object> input) {
        checkFields(input, Set.of("expectedVersion"));
        return version(input.get("expectedVersion"));
    }

    private static MemoryWriteRequest parse(Map<String, Object> input, boolean patch) {
        Set<String> present = Set.copyOf(input.keySet());
        String title = optionalText(input, "title", 100, true);
        String body = requiredText(input, "body", 5000, patch);
        String category = enumValue(input, "category", CATEGORIES, false);
        List<String> tags = tags(input);
        String sourceType = enumValue(input, "sourceType", SOURCE_TYPES, true);
        if (!patch && sourceType == null) {
            sourceType = "INTERPRETATION";
        }
        LocalDate sourceDate = date(input);
        String nextAction = optionalText(input, "nextAction", 5000, false);
        Long expectedVersion = patch ? version(input.get("expectedVersion")) : null;
        return new MemoryWriteRequest(present, title, body, category, tags,
                sourceType, sourceDate, nextAction, expectedVersion);
    }

    private static void checkFields(Map<String, Object> input, Set<String> allowed) {
        if (input == null || !allowed.containsAll(input.keySet())) {
            throw invalid();
        }
    }

    private static String requiredText(Map<String, Object> input, String field, int max, boolean patch) {
        if (!input.containsKey(field)) {
            if (patch) {
                return null;
            }
            throw invalid();
        }
        Object raw = input.get(field);
        if (!(raw instanceof String value) || value.isBlank() || value.codePointCount(0, value.length()) > max) {
            throw invalid();
        }
        return value;
    }

    private static String optionalText(Map<String, Object> input, String field, int max, boolean nonblank) {
        if (!input.containsKey(field) || input.get(field) == null) {
            return null;
        }
        Object raw = input.get(field);
        if (!(raw instanceof String value) || value.codePointCount(0, value.length()) > max
                || (nonblank && value.isBlank())) {
            throw invalid();
        }
        return value;
    }

    private static String enumValue(Map<String, Object> input, String field, Set<String> valid,
                                    boolean requiredWhenPresent) {
        if (!input.containsKey(field)) {
            return null;
        }
        Object raw = input.get(field);
        if (raw == null && !requiredWhenPresent) {
            return null;
        }
        if (!(raw instanceof String value) || !valid.contains(value)) {
            throw invalid();
        }
        return value;
    }

    private static LocalDate date(Map<String, Object> input) {
        Object raw = input.get("sourceDate");
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String value)) {
            throw invalid();
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw invalid();
        }
    }

    private static List<String> tags(Map<String, Object> input) {
        Object raw = input.get("tags");
        if (raw == null) {
            return List.of();
        }
        if (!(raw instanceof List<?> values)) {
            throw invalid();
        }
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        for (Object value : values) {
            if (!(value instanceof String tag) || tag.isBlank()
                    || tag.codePointCount(0, tag.length()) > 100) {
                throw invalid();
            }
            distinct.add(tag);
        }
        return new ArrayList<>(distinct);
    }

    public static long version(Object raw) {
        if (!(raw instanceof String text) || !text.matches("0|[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

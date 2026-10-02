package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record CommitmentWriteRequest(Set<String> present, String title, String body,
                                     String nextAction, String dueKind, LocalDateTime dueAt,
                                     LocalDate dueDate, String dueTimezone, String sourceType,
                                     Long sourceId, Long expectedVersion) {
    private static final Set<String> CONTENT = Set.of("title", "body", "nextAction", "dueKind",
            "dueAt", "dueDate", "dueTimezone", "sourceType", "sourceId");
    private static final Set<String> SOURCES = Set.of("MEMORY_CARD", "CALENDAR_EVENT", "EXPRESSION");

    public static CommitmentWriteRequest create(Map<String, Object> input) {
        if (input == null || !CONTENT.containsAll(input.keySet())) {
            throw invalid();
        }
        String kind = input.containsKey("dueKind") ? enumValue(input.get("dueKind"),
                Set.of("NONE", "DATE", "INSTANT")) : "NONE";
        LocalDateTime at = instant(input.get("dueAt"));
        LocalDate date = date(input.get("dueDate"));
        String timezone = timezone(input.get("dueTimezone"));
        validateDue(kind, at, date, timezone);
        String sourceType = input.get("sourceType") == null ? null
                : enumValue(input.get("sourceType"), SOURCES);
        Long sourceId = positiveId(input.get("sourceId"));
        if ((sourceType == null) != (sourceId == null)) {
            throw invalid();
        }
        return new CommitmentWriteRequest(Set.copyOf(input.keySet()),
                requiredText(input.get("title"), 100), optionalText(input.get("body"), 5000),
                optionalText(input.get("nextAction"), 5000), kind, at, date, timezone,
                sourceType, sourceId, null);
    }

    public static CommitmentWriteRequest patch(Map<String, Object> input) {
        Set<String> allowed = new HashSet<>(CONTENT);
        allowed.add("expectedVersion");
        if (input == null || !allowed.containsAll(input.keySet()) || input.size() < 2) {
            throw invalid();
        }
        Set<String> present = Set.copyOf(input.keySet());
        boolean changeDue = present.contains("dueKind") || present.contains("dueAt")
                || present.contains("dueDate") || present.contains("dueTimezone");
        if (changeDue && !present.contains("dueKind")) {
            throw invalid();
        }
        String kind = changeDue ? enumValue(input.get("dueKind"), Set.of("NONE", "DATE", "INSTANT"))
                : null;
        LocalDateTime at = instant(input.get("dueAt"));
        LocalDate date = date(input.get("dueDate"));
        String timezone = timezone(input.get("dueTimezone"));
        if (changeDue) {
            validateDue(kind, at, date, timezone);
        }
        boolean changeSource = present.contains("sourceType") || present.contains("sourceId");
        if (changeSource && (!present.contains("sourceType") || !present.contains("sourceId"))) {
            throw invalid();
        }
        String sourceType = input.get("sourceType") == null ? null
                : enumValue(input.get("sourceType"), SOURCES);
        Long sourceId = positiveId(input.get("sourceId"));
        if (changeSource && (sourceType == null) != (sourceId == null)) {
            throw invalid();
        }
        return new CommitmentWriteRequest(present,
                present.contains("title") ? requiredText(input.get("title"), 100) : null,
                optionalText(input.get("body"), 5000),
                optionalText(input.get("nextAction"), 5000), kind, at, date, timezone,
                sourceType, sourceId, version(input.get("expectedVersion")));
    }

    public static long expectedVersionOnly(Map<String, Object> input) {
        if (input == null || !input.keySet().equals(Set.of("expectedVersion"))) {
            throw invalid();
        }
        return version(input.get("expectedVersion"));
    }

    public record Completion(long expectedVersion, String result) {
    }

    public static Completion complete(Map<String, Object> input) {
        if (input == null || !Set.of("expectedVersion", "result").containsAll(input.keySet())) {
            throw invalid();
        }
        return new Completion(version(input.get("expectedVersion")),
                optionalText(input.get("result"), 5000));
    }

    static void validateDue(String kind, LocalDateTime at, LocalDate date, String timezone) {
        if ("NONE".equals(kind) && at == null && date == null && timezone == null) {
            return;
        }
        if ("INSTANT".equals(kind) && at != null && date == null && timezone == null) {
            return;
        }
        if ("DATE".equals(kind) && at == null && date != null && timezone != null) {
            try {
                ZoneId zone = ZoneId.of(timezone);
                if (!date.atStartOfDay(zone).toLocalDate().equals(date)
                        || !date.plusDays(1).atStartOfDay(zone).toLocalDate()
                        .equals(date.plusDays(1))) {
                    throw invalid();
                }
                return;
            } catch (DateTimeException exception) {
                throw invalid();
            }
        }
        throw invalid();
    }

    static String requiredText(Object raw, int max) {
        if (!(raw instanceof String text) || text.isBlank()
                || text.codePointCount(0, text.length()) > max) {
            throw invalid();
        }
        return text;
    }

    static String optionalText(Object raw, int max) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String text) || text.codePointCount(0, text.length()) > max) {
            throw invalid();
        }
        return text;
    }

    static String enumValue(Object raw, Set<String> allowed) {
        if (!(raw instanceof String text) || !allowed.contains(text)) {
            throw invalid();
        }
        return text;
    }

    static LocalDateTime instant(Object raw) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String text) || !text.endsWith("Z")) {
            throw invalid();
        }
        try {
            LocalDateTime value = LocalDateTime.ofInstant(Instant.parse(text), ZoneOffset.UTC);
            if (value.getYear() < 1000 || value.getYear() > 9999) {
                throw invalid();
            }
            return value;
        } catch (DateTimeException exception) {
            throw invalid();
        }
    }

    static LocalDate date(Object raw) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String text)) {
            throw invalid();
        }
        try {
            LocalDate value = LocalDate.parse(text);
            if (value.getYear() < 1000 || value.getYear() > 9999) {
                throw invalid();
            }
            return value;
        } catch (DateTimeParseException exception) {
            throw invalid();
        }
    }

    static String timezone(Object raw) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String text) || text.length() > 64
                || !ZoneId.getAvailableZoneIds().contains(text)) {
            throw invalid();
        }
        return text;
    }

    static Long positiveId(Object raw) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String text) || !text.matches("[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    static long version(Object raw) {
        if (!(raw instanceof String text) || !text.matches("0|[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

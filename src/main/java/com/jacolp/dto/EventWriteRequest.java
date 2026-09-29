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

public record EventWriteRequest(Set<String> present, Long expectedVersion, String title,
                                String location, String note, Boolean allDay,
                                LocalDateTime startsAt, LocalDateTime endsAt,
                                LocalDate startDate, LocalDate endDateExclusive,
                                String eventTimezone, String availability, Boolean shareTitle,
                                Boolean offlineConfirmed, LocalDateTime offlineConfirmedAt) {
    private static final Set<String> CONTENT_FIELDS = Set.of("title", "location", "note", "allDay",
            "startsAt", "endsAt", "startDate", "endDateExclusive", "eventTimezone",
            "availability", "shareTitle", "offlineConfirmed", "offlineConfirmedAt");
    private static final Set<String> AVAILABILITIES = Set.of("BUSY", "NEGOTIABLE", "FREE");
    private static final Set<String> TIME_FIELDS = Set.of("allDay", "startsAt", "endsAt",
            "startDate", "endDateExclusive", "eventTimezone");

    public static EventWriteRequest create(Map<String, Object> input) {
        checkFields(input, CONTENT_FIELDS);
        return parse(input, false);
    }

    public static EventWriteRequest patch(Map<String, Object> input) {
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

    private static EventWriteRequest parse(Map<String, Object> input, boolean patch) {
        Set<String> present = Set.copyOf(input.keySet());
        boolean changingTime = !patch || present.stream().anyMatch(TIME_FIELDS::contains);
        if (changingTime && (!present.contains("allDay") || !present.contains("eventTimezone"))) {
            throw invalid();
        }
        Boolean allDay = booleanValue(input, "allDay");
        if (changingTime) {
            if (allDay == null) {
                throw invalid();
            }
            if (allDay) {
                if (!present.contains("startDate") || !present.contains("endDateExclusive")
                        || input.get("startsAt") != null || input.get("endsAt") != null) {
                    throw invalid();
                }
            } else if (!present.contains("startsAt") || !present.contains("endsAt")
                    || input.get("startDate") != null || input.get("endDateExclusive") != null) {
                throw invalid();
            }
        }
        String eventTimezone = requiredText(input, "eventTimezone", 64, changingTime);
        if (eventTimezone != null) {
            try {
                ZoneId.of(eventTimezone);
            } catch (DateTimeException exception) {
                throw invalid();
            }
        }
        String availability = requiredText(input, "availability", 16, !patch);
        if (availability != null && !AVAILABILITIES.contains(availability)) {
            throw invalid();
        }
        Boolean offlineConfirmed = booleanValue(input, "offlineConfirmed");
        if (present.contains("offlineConfirmedAt") && offlineConfirmed == null) {
            throw invalid();
        }
        if (Boolean.FALSE.equals(offlineConfirmed) && input.get("offlineConfirmedAt") != null) {
            throw invalid();
        }
        return new EventWriteRequest(present,
                patch ? version(input.get("expectedVersion")) : null,
                requiredText(input, "title", 100, !patch),
                optionalText(input, "location", 255), optionalText(input, "note", 5000),
                allDay, instant(input, "startsAt"), instant(input, "endsAt"),
                date(input, "startDate"), date(input, "endDateExclusive"), eventTimezone,
                availability, booleanValue(input, "shareTitle"), offlineConfirmed,
                instant(input, "offlineConfirmedAt"));
    }

    private static void checkFields(Map<String, Object> input, Set<String> allowed) {
        if (input == null || !allowed.containsAll(input.keySet())) {
            throw invalid();
        }
    }

    private static String requiredText(Map<String, Object> input, String field, int max,
                                       boolean required) {
        if (!input.containsKey(field)) {
            if (required) {
                throw invalid();
            }
            return null;
        }
        Object raw = input.get(field);
        if (!(raw instanceof String value) || value.isBlank()
                || value.codePointCount(0, value.length()) > max) {
            throw invalid();
        }
        return value;
    }

    private static String optionalText(Map<String, Object> input, String field, int max) {
        if (!input.containsKey(field) || input.get(field) == null) {
            return null;
        }
        Object raw = input.get(field);
        if (!(raw instanceof String value) || value.codePointCount(0, value.length()) > max) {
            throw invalid();
        }
        return value;
    }

    private static Boolean booleanValue(Map<String, Object> input, String field) {
        if (!input.containsKey(field)) {
            return null;
        }
        if (!(input.get(field) instanceof Boolean value)) {
            throw invalid();
        }
        return value;
    }

    private static LocalDateTime instant(Map<String, Object> input, String field) {
        Object raw = input.get(field);
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String value) || !value.endsWith("Z")) {
            throw invalid();
        }
        try {
            LocalDateTime utc = LocalDateTime.ofInstant(Instant.parse(value), ZoneOffset.UTC);
            if (utc.getYear() < 1000 || utc.getYear() > 9999) {
                throw invalid();
            }
            return utc;
        } catch (DateTimeException exception) {
            throw invalid();
        }
    }

    private static LocalDate date(Map<String, Object> input, String field) {
        Object raw = input.get(field);
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof String value)) {
            throw invalid();
        }
        try {
            LocalDate date = LocalDate.parse(value);
            if (date.getYear() < 1000 || date.getYear() > 9999) {
                throw invalid();
            }
            return date;
        } catch (DateTimeParseException exception) {
            throw invalid();
        }
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

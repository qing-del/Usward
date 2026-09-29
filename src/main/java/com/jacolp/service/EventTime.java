package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.entity.CalendarEvent;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import org.springframework.http.HttpStatus;

final class EventTime {
    private EventTime() {
    }

    record Bounds(Instant start, Instant end) {
        boolean overlaps(Instant from, Instant to) {
            return start.isBefore(to) && end.isAfter(from);
        }
    }

    static Bounds bounds(CalendarEvent event) {
        if (event.getStartDate() == null) {
            if (event.getStartsAt() == null || event.getEndsAt() == null) {
                throw invalid();
            }
            Instant start = event.getStartsAt().toInstant(ZoneOffset.UTC);
            Instant end = event.getEndsAt().toInstant(ZoneOffset.UTC);
            if (!end.isAfter(start) || event.getEndDateExclusive() != null) {
                throw invalid();
            }
            return new Bounds(start, end);
        }
        if (event.getEndsAt() != null || event.getStartsAt() != null
                || event.getEndDateExclusive() == null
                || !event.getEndDateExclusive().isAfter(event.getStartDate())) {
            throw invalid();
        }
        ZoneId zone;
        try {
            zone = ZoneId.of(event.getEventTimezone());
        } catch (DateTimeException | NullPointerException exception) {
            throw invalid();
        }
        Instant start = dayStart(event.getStartDate(), zone);
        Instant end = dayStart(event.getEndDateExclusive(), zone);
        if (!end.isAfter(start)) {
            throw invalid();
        }
        return new Bounds(start, end);
    }

    static Instant dayStart(LocalDate date, ZoneId zone) {
        ZonedDateTime start = date.atStartOfDay(zone);
        if (!start.toLocalDate().equals(date)) {
            throw invalid();
        }
        return start.toInstant();
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "时间范围无效");
    }
}

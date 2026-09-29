package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record CalendarQuery(Instant from, Instant to, String timezone, String scope,
                            boolean includeCancelled, LocalDate fromUtcDate,
                            LocalDate toUtcDate, LocalDateTime fromUtc, LocalDateTime toUtc) {
    private static final Set<String> SCOPES = Set.of("ALL", "MINE", "SHARED");

    public static CalendarQuery parse(String fromText, String toText, String timezone,
                                      String scope, boolean includeCancelled) {
        if (timezone == null || timezone.isBlank() || timezone.length() > 64
                || !ZoneId.getAvailableZoneIds().contains(timezone) || !SCOPES.contains(scope)) {
            throw invalid();
        }
        ZoneId zone = ZoneId.of(timezone);
        Instant from = instant(fromText);
        Instant to = instant(toText);
        if (!to.isAfter(from)) {
            throw invalid();
        }
        try {
            LocalDate fromDate = LocalDate.ofInstant(from, zone);
            LocalDate toDate = LocalDate.ofInstant(to, zone);
            if (!fromDate.atStartOfDay(zone).toInstant().equals(from)
                    || !toDate.atStartOfDay(zone).toInstant().equals(to)) {
                throw invalid();
            }
            long days = ChronoUnit.DAYS.between(fromDate, toDate);
            if (days < 1 || days > 93) {
                throw invalid();
            }
            LocalDateTime fromUtc = LocalDateTime.ofInstant(from, ZoneOffset.UTC);
            LocalDateTime toUtc = LocalDateTime.ofInstant(to, ZoneOffset.UTC);
            if (fromUtc.getYear() < 1000 || toUtc.getYear() > 9999) {
                throw invalid();
            }
            return new CalendarQuery(from, to, timezone, scope, includeCancelled,
                    fromUtc.toLocalDate(), toUtc.toLocalDate(), fromUtc, toUtc);
        } catch (DateTimeException exception) {
            throw invalid();
        }
    }

    private static Instant instant(String value) {
        if (value == null || !value.endsWith("Z")) {
            throw invalid();
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "日历查询范围无效");
    }
}

package com.jacolp.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jacolp.entity.Commitment;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class CommitmentTimeTests {
    @Test
    void springAndAutumnDateDeadlinesFollowLocalDayLength() {
        Commitment spring = dateDue(LocalDate.of(2026, 3, 8));
        Commitment autumn = dateDue(LocalDate.of(2026, 11, 1));
        ZoneId viewer = ZoneId.of("Asia/Shanghai");
        assertEquals(Instant.parse("2026-03-09T04:00:00Z"),
                CommitmentTime.state(spring, Instant.parse("2026-03-08T12:00:00Z"), viewer)
                        .deadlineAt());
        assertEquals(Instant.parse("2026-11-02T05:00:00Z"),
                CommitmentTime.state(autumn, Instant.parse("2026-11-01T12:00:00Z"), viewer)
                        .deadlineAt());
        assertTrue(CommitmentTime.state(spring, Instant.parse("2026-03-09T04:00:00Z"), viewer)
                .isOverdue());
        assertFalse(CommitmentTime.state(spring, Instant.parse("2026-03-09T03:59:59Z"), viewer)
                .isOverdue());
    }

    @Test
    void exactDeadlineAndDueTodayUseReaderTimezoneWithoutChangingStoredInstant() {
        Commitment commitment = new Commitment();
        commitment.setDueKind("INSTANT");
        commitment.setDueAt(LocalDateTime.of(2026, 10, 2, 7, 0));
        commitment.setStatus("OPEN");
        Instant before = Instant.parse("2026-10-02T06:59:59Z");
        assertTrue(CommitmentTime.state(commitment, before, ZoneId.of("Asia/Shanghai"))
                .isDueToday());
        assertFalse(CommitmentTime.state(commitment, before, ZoneId.of("America/Los_Angeles"))
                .isDueToday());
        assertTrue(CommitmentTime.state(commitment, Instant.parse("2026-10-02T07:00:00Z"),
                ZoneId.of("Asia/Shanghai")).isOverdue());
        commitment.setStatus("DONE");
        assertFalse(CommitmentTime.state(commitment, before, ZoneId.of("Asia/Shanghai"))
                .isDueToday());
    }

    private Commitment dateDue(LocalDate date) {
        Commitment commitment = new Commitment();
        commitment.setDueKind("DATE");
        commitment.setDueDate(date);
        commitment.setDueTimezone("America/New_York");
        commitment.setStatus("OPEN");
        return commitment;
    }
}

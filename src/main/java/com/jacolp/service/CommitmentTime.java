package com.jacolp.service;

import com.jacolp.entity.Commitment;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

final class CommitmentTime {
    private CommitmentTime() {
    }

    record State(Instant deadlineAt, boolean isOverdue, boolean isDueToday) {
    }

    static State state(Commitment commitment, Instant asOf, ZoneId viewerZone) {
        Instant deadline = switch (commitment.getDueKind()) {
            case "INSTANT" -> commitment.getDueAt().toInstant(ZoneOffset.UTC);
            case "DATE" -> EventTime.dayStart(commitment.getDueDate().plusDays(1),
                    ZoneId.of(commitment.getDueTimezone()));
            default -> null;
        };
        boolean open = "OPEN".equals(commitment.getStatus());
        boolean overdue = open && deadline != null && !asOf.isBefore(deadline);
        boolean dueToday = false;
        if (open && !overdue && deadline != null) {
            if ("DATE".equals(commitment.getDueKind())) {
                dueToday = LocalDate.ofInstant(asOf, ZoneId.of(commitment.getDueTimezone()))
                        .equals(commitment.getDueDate());
            } else {
                dueToday = LocalDate.ofInstant(asOf, viewerZone)
                        .equals(LocalDate.ofInstant(deadline, viewerZone));
            }
        }
        return new State(deadline, overdue, dueToday);
    }
}

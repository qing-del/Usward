package com.jacolp.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class DashboardDtos {
    private DashboardDtos() {
    }

    public record Group<T>(List<T> items, long total, boolean hasMore) {
    }

    public record Groups(Group<EventDtos.Detail> events, Group<ExpressionDtos.Summary> expressions,
                         Group<Object> invitations, Group<ReminderDtos.Detail> reminders,
                         Group<CommitmentDtos.Summary> commitments) {
    }

    public record Dashboard(Instant asOf, String timezone, LocalDate today, Groups groups,
                            MemoryDtos.Summary featuredMemory, long unreadCount) {
    }
}

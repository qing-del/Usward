package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.CommitmentDtos;
import com.jacolp.dto.DashboardDtos;
import com.jacolp.dto.EventDtos;
import com.jacolp.dto.ReminderDtos;
import com.jacolp.entity.AppUser;
import com.jacolp.mapper.CommitmentMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardService {
    private final UserMapper users;
    private final CalendarService calendar;
    private final MemoryService memories;
    private final CommitmentMapper commitmentRows;
    private final CommitmentService commitments;
    private final ReminderService reminders;
    private final NotificationService notifications;

    public DashboardService(UserMapper users, CalendarService calendar, MemoryService memories,
                            CommitmentMapper commitmentRows, CommitmentService commitments,
                            ReminderService reminders, NotificationService notifications) {
        this.users = users;
        this.calendar = calendar;
        this.memories = memories;
        this.commitmentRows = commitmentRows;
        this.commitments = commitments;
        this.reminders = reminders;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public DashboardDtos.Dashboard get(String username) {
        Instant asOf = Instant.now();
        AppUser owner = users.findByUsername(username);
        if (owner == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        ZoneId zone = ZoneId.of(owner.getTimezone());
        LocalDate today = LocalDate.ofInstant(asOf, zone);
        List<EventDtos.Detail> dayEvents = calendar.personalDay(owner.getId(), today, zone);
        List<CommitmentDtos.Summary> due = commitmentRows.listOwned(owner.getId()).stream()
                .filter(row -> "OPEN".equals(row.getStatus()))
                .map(row -> commitments.summary(row, owner, asOf))
                .filter(item -> item.isOverdue() || item.isDueToday())
                .sorted(Comparator.comparing((CommitmentDtos.Summary item) -> !item.isOverdue())
                        .thenComparing(CommitmentDtos.Summary::deadlineAt)
                        .thenComparing(item -> Long.parseLong(item.id())))
                .toList();
        List<ReminderDtos.Detail> pending = reminders.pendingForDashboard(owner.getId());
        DashboardDtos.Group<Object> empty = new DashboardDtos.Group<>(List.of(), 0, false);
        DashboardDtos.Groups groups = new DashboardDtos.Groups(group(dayEvents, 10), empty,
                empty, group(pending, 5), group(due, 5));
        return new DashboardDtos.Dashboard(asOf, owner.getTimezone(), today, groups,
                memories.latestOwnSummary(owner), notifications.unreadCount(owner.getId()));
    }

    private <T> DashboardDtos.Group<T> group(List<T> all, int limit) {
        return new DashboardDtos.Group<>(List.copyOf(all.subList(0, Math.min(limit, all.size()))),
                all.size(), all.size() > limit);
    }
}

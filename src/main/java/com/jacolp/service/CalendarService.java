package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.EventDtos;
import com.jacolp.dto.CalendarQuery;
import com.jacolp.dto.EventWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.CalendarEvent;
import com.jacolp.mapper.CalendarMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CalendarService {
    private final CalendarMapper events;
    private final UserMapper users;

    public CalendarService(CalendarMapper events, UserMapper users) {
        this.events = events;
        this.users = users;
    }

    @Transactional
    public EventDtos.Detail create(String username, EventWriteRequest input) {
        AppUser owner = owner(username, true);
        CalendarEvent event = new CalendarEvent();
        event.setOwnerId(owner.getId());
        event.setKind("PERSONAL");
        event.setStatus("CONFIRMED");
        apply(event, input);
        EventTime.bounds(event);
        events.insert(event);
        return detail(events.findOwned(event.getId(), owner.getId()));
    }

    @Transactional(readOnly = true)
    public EventDtos.Detail get(String username, long id) {
        AppUser owner = owner(username, false);
        CalendarEvent event = events.findOwned(id, owner.getId());
        if (event == null) {
            throw notFound();
        }
        return detail(event);
    }

    @Transactional
    public EventDtos.Detail patch(String username, long id, EventWriteRequest input) {
        AppUser owner = owner(username, true);
        CalendarEvent event = lockedVersion(id, owner.getId(), input.expectedVersion());
        apply(event, input);
        EventTime.bounds(event);
        changed(events.updateOwned(event));
        return detail(events.findOwned(id, owner.getId()));
    }

    @Transactional
    public void delete(String username, long id, long expectedVersion) {
        AppUser owner = owner(username, true);
        lockedVersion(id, owner.getId(), expectedVersion);
        changed(events.deleteOwned(id, owner.getId(), expectedVersion));
    }

    @Transactional(readOnly = true)
    public EventDtos.CalendarView list(String username, CalendarQuery query) {
        AppUser owner = owner(username, false);
        Instant asOf = Instant.now();
        if ("SHARED".equals(query.scope())) {
            return new EventDtos.CalendarView(List.of(), query.from(), query.to(),
                    query.timezone(), asOf);
        }
        return new EventDtos.CalendarView(inRange(owner.getId(), query.from(), query.to()),
                query.from(), query.to(), query.timezone(), asOf);
    }

    @Transactional(readOnly = true)
    public List<EventDtos.Detail> personalDay(long ownerId, LocalDate date, ZoneId zone) {
        Instant from = EventTime.dayStart(date, zone);
        Instant to = EventTime.dayStart(date.plusDays(1), zone);
        return inRange(ownerId, from, to);
    }

    private List<EventDtos.Detail> inRange(long ownerId, Instant from, Instant to) {
        LocalDateTime fromUtc = LocalDateTime.ofInstant(from, ZoneOffset.UTC);
        LocalDateTime toUtc = LocalDateTime.ofInstant(to, ZoneOffset.UTC);
        List<CalendarEvent> matched = new ArrayList<>(events.timedInRange(ownerId, fromUtc, toUtc));
        for (CalendarEvent candidate : events.allDayCandidates(ownerId,
                fromUtc.toLocalDate(), toUtc.toLocalDate())) {
            if (EventTime.bounds(candidate).overlaps(from, to)) {
                matched.add(candidate);
            }
        }
        matched.sort(Comparator.comparing((CalendarEvent event) -> EventTime.bounds(event).start())
                .thenComparing(CalendarEvent::getId));
        return matched.stream().map(this::detail).toList();
    }

    private AppUser owner(String username, boolean lock) {
        AppUser user = lock ? users.lockByUsername(username) : users.findByUsername(username);
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return user;
    }

    private CalendarEvent lockedVersion(long id, long ownerId, long expectedVersion) {
        CalendarEvent event = events.lockOwned(id, ownerId);
        if (event == null) {
            throw notFound();
        }
        if (event.getVersion() != expectedVersion) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "安排版本已变化");
        }
        return event;
    }

    private void changed(int rows) {
        if (rows != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "安排版本已变化");
        }
    }

    private void apply(CalendarEvent event, EventWriteRequest input) {
        if (input.present().contains("title")) {
            event.setTitle(input.title());
        }
        if (input.present().contains("location")) {
            event.setLocation(input.location());
        }
        if (input.present().contains("note")) {
            event.setNote(input.note());
        }
        if (input.allDay() != null) {
            event.setEventTimezone(input.eventTimezone());
            if (input.allDay()) {
                event.setStartsAt(null);
                event.setEndsAt(null);
                event.setStartDate(input.startDate());
                event.setEndDateExclusive(input.endDateExclusive());
            } else {
                event.setStartDate(null);
                event.setEndDateExclusive(null);
                event.setStartsAt(input.startsAt());
                event.setEndsAt(input.endsAt());
            }
        }
        if (input.present().contains("availability")) {
            event.setAvailability(input.availability());
        }
        if (input.present().contains("shareTitle")) {
            event.setShareTitle(input.shareTitle());
        }
        if (input.present().contains("offlineConfirmed")) {
            if (input.offlineConfirmed()) {
                if (input.offlineConfirmedAt() != null) {
                    event.setOfflineConfirmedAt(input.offlineConfirmedAt());
                } else if (event.getOfflineConfirmedAt() == null) {
                    event.setOfflineConfirmedAt(LocalDateTime.now(ZoneOffset.UTC));
                }
            } else {
                event.setOfflineConfirmedAt(null);
            }
        }
    }

    private EventDtos.Detail detail(CalendarEvent event) {
        return new EventDtos.Detail(event.getId().toString(), event.getVersion().toString(),
                utc(event.getCreatedAt()), utc(event.getUpdatedAt()), event.getKind(),
                event.getOwnerId().toString(), null, event.getTitle(), event.getLocation(),
                event.getNote(), event.getStartDate() != null, utc(event.getStartsAt()),
                utc(event.getEndsAt()), event.getStartDate(), event.getEndDateExclusive(),
                event.getEventTimezone(), event.getAvailability(), event.isShareTitle(),
                utc(event.getOfflineConfirmedAt()), event.getStatus(), null, null, null,
                null, null);
    }

    private Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "安排不存在");
    }
}

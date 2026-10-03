package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.AvailabilityDtos;
import com.jacolp.dto.CalendarQuery;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.CalendarEvent;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.CalendarMapper;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.UserMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AvailabilityService {
    private final UserMapper users;
    private final ConnectionMapper connections;
    private final CalendarMapper events;

    public AvailabilityService(UserMapper users, ConnectionMapper connections, CalendarMapper events) {
        this.users = users;
        this.connections = connections;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public AvailabilityDtos.View get(String username, CalendarQuery query) {
        Instant asOf = Instant.now();
        AppUser caller = users.findByUsername(username);
        if (caller == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        AppUser partner = visiblePartner(caller);
        if (partner == null) {
            return new AvailabilityDtos.View(false, List.of(), query.from(), query.to(),
                    query.timezone(), asOf);
        }
        List<Slice> slices = new ArrayList<>();
        for (CalendarEvent event : events.timedInRange(partner.getId(), query.fromUtc(),
                query.toUtc())) {
            addSlice(slices, event, query.from(), query.to());
        }
        for (CalendarEvent event : events.allDayCandidates(partner.getId(),
                query.fromUtcDate(), query.toUtcDate())) {
            addSlice(slices, event, query.from(), query.to());
        }
        return new AvailabilityDtos.View(true, blocks(slices), query.from(), query.to(),
                query.timezone(), asOf);
    }

    private AppUser visiblePartner(AppUser caller) {
        if (caller.getActiveConnectionId() == null) {
            return null;
        }
        PairConnection connection = connections.activeConnection(caller.getActiveConnectionId());
        if (connection == null) {
            return null;
        }
        long partnerId;
        if (connection.getUserAId().equals(caller.getId())) {
            partnerId = connection.getUserBId();
        } else if (connection.getUserBId().equals(caller.getId())) {
            partnerId = connection.getUserAId();
        } else {
            return null;
        }
        AppUser partner = users.findById(partnerId);
        return partner != null && connection.getId().equals(partner.getActiveConnectionId())
                && partner.isShareAvailability() ? partner : null;
    }

    private void addSlice(List<Slice> slices, CalendarEvent event, Instant from, Instant to) {
        EventTime.Bounds bounds = EventTime.bounds(event);
        Instant start = bounds.start().isBefore(from) ? from : bounds.start();
        Instant end = bounds.end().isAfter(to) ? to : bounds.end();
        if (start.isBefore(end)) {
            slices.add(new Slice(start, end, event.getAvailability(), event.getTitle(),
                    event.isShareTitle()));
        }
    }

    private List<AvailabilityDtos.Block> blocks(List<Slice> slices) {
        if (slices.isEmpty()) {
            return List.of();
        }
        TreeSet<Instant> boundaries = new TreeSet<>();
        for (Slice slice : slices) {
            boundaries.add(slice.start());
            boundaries.add(slice.end());
        }
        List<Segment> merged = new ArrayList<>();
        Instant previous = null;
        for (Instant boundary : boundaries) {
            if (previous == null) {
                previous = boundary;
                continue;
            }
            List<Slice> active = new ArrayList<>();
            for (Slice slice : slices) {
                if (slice.start().isBefore(boundary) && slice.end().isAfter(previous)) {
                    active.add(slice);
                }
            }
            if (!active.isEmpty()) {
                String status = active.stream().map(Slice::status)
                        .min((left, right) -> Integer.compare(rank(left), rank(right))).orElseThrow();
                String title = active.getFirst().title();
                for (Slice slice : active) {
                    if (!slice.shareTitle() || !Objects.equals(title, slice.title())) {
                        title = null;
                        break;
                    }
                }
                if (!merged.isEmpty()) {
                    Segment last = merged.getLast();
                    if (last.end().equals(previous) && last.status().equals(status)
                            && Objects.equals(last.title(), title)) {
                        merged.set(merged.size() - 1, new Segment(last.start(), boundary,
                                status, title));
                    } else {
                        merged.add(new Segment(previous, boundary, status, title));
                    }
                } else {
                    merged.add(new Segment(previous, boundary, status, title));
                }
            }
            previous = boundary;
        }
        return merged.stream().map(segment -> new AvailabilityDtos.Block(UUID.randomUUID().toString(),
                segment.start(), segment.end(), segment.status(), segment.title())).toList();
    }

    private int rank(String status) {
        return switch (status) {
            case "BUSY" -> 0;
            case "NEGOTIABLE" -> 1;
            case "FREE" -> 2;
            default -> throw new IllegalStateException("Unexpected availability status");
        };
    }

    private record Slice(Instant start, Instant end, String status, String title,
                         boolean shareTitle) {
    }

    private record Segment(Instant start, Instant end, String status, String title) {
    }
}

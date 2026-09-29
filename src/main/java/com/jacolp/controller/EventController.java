package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.EventDtos;
import com.jacolp.dto.EventWriteRequest;
import com.jacolp.service.CalendarService;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {
    private final CalendarService calendar;

    public EventController(CalendarService calendar) {
        this.calendar = calendar;
    }

    @PostMapping
    public ResponseEntity<EventDtos.Detail> create(@RequestBody Map<String, Object> body,
                                                   Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(calendar.create(principal.getName(), EventWriteRequest.create(body)));
    }

    @GetMapping("/{id}")
    public EventDtos.Detail get(@PathVariable String id, Principal principal) {
        return calendar.get(principal.getName(), id(id));
    }

    @PatchMapping("/{id}")
    public EventDtos.Detail patch(@PathVariable String id, @RequestBody Map<String, Object> body,
                                  Principal principal) {
        return calendar.patch(principal.getName(), id(id), EventWriteRequest.patch(body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @RequestBody Map<String, Object> body,
                                       Principal principal) {
        calendar.delete(principal.getName(), id(id), EventWriteRequest.expectedVersionOnly(body));
        return ResponseEntity.noContent().build();
    }

    private long id(String raw) {
        try {
            long id = Long.parseLong(raw);
            if (id > 0 && raw.equals(Long.toString(id))) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Path IDs are decimal strings, not database expressions.
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "安排 ID 无效");
    }
}

package com.jacolp.controller;

import com.jacolp.dto.CalendarQuery;
import com.jacolp.dto.EventDtos;
import com.jacolp.service.CalendarService;
import java.security.Principal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/calendar")
public class CalendarController {
    private final CalendarService calendar;

    public CalendarController(CalendarService calendar) {
        this.calendar = calendar;
    }

    @GetMapping
    public EventDtos.CalendarView list(Principal principal,
                                       @RequestParam String from,
                                       @RequestParam String to,
                                       @RequestParam String timezone,
                                       @RequestParam(defaultValue = "ALL") String scope,
                                       @RequestParam(defaultValue = "false") boolean includeCancelled) {
        return calendar.list(principal.getName(),
                CalendarQuery.parse(from, to, timezone, scope, includeCancelled));
    }
}

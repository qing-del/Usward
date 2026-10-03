package com.jacolp.controller;

import com.jacolp.dto.AvailabilityDtos;
import com.jacolp.dto.CalendarQuery;
import com.jacolp.service.AvailabilityService;
import java.security.Principal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/availability")
public class AvailabilityController {
    private final AvailabilityService availability;

    public AvailabilityController(AvailabilityService availability) {
        this.availability = availability;
    }

    @GetMapping
    public AvailabilityDtos.View get(Principal principal, @RequestParam String from,
                                     @RequestParam String to, @RequestParam String timezone) {
        return availability.get(principal.getName(),
                CalendarQuery.parse(from, to, timezone, "ALL", false));
    }
}

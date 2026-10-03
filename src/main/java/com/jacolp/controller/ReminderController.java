package com.jacolp.controller;

import com.jacolp.dto.ReminderDtos;
import com.jacolp.dto.ReminderWriteRequest;
import com.jacolp.service.ReminderService;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reminders")
public class ReminderController {
    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    @PutMapping
    public ReminderDtos.Detail put(@RequestBody Map<String, Object> body, Principal principal) {
        return reminders.put(principal.getName(), ReminderWriteRequest.put(body));
    }

    @DeleteMapping("/{id}")
    public ReminderDtos.Detail cancel(@PathVariable String id, @RequestBody Map<String, Object> body,
                                      Principal principal) {
        return reminders.cancel(principal.getName(), ReminderWriteRequest.positiveId(id),
                ReminderWriteRequest.cancelRevision(body));
    }

    @GetMapping
    public ReminderDtos.Page list(Principal principal,
                                  @RequestParam(required = false) String resourceType,
                                  @RequestParam(defaultValue = "PENDING") String status,
                                  @RequestParam(defaultValue = "SCHEDULED_ASC") String sort,
                                  @RequestParam(defaultValue = "1") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return reminders.list(principal.getName(), resourceType, status, sort, page, size);
    }
}

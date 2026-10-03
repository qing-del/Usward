package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.NotificationDtos;
import com.jacolp.service.NotificationService;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NotificationDtos.Page list(Principal principal, HttpSession session,
                                      @RequestParam(defaultValue = "ALL") String read,
                                      @RequestParam(defaultValue = "CREATED_DESC") String sort,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int size) {
        return notifications.list(principal.getName(), read, sort, page, size, session);
    }

    @PostMapping("/{id}/read")
    public NotificationDtos.Detail read(@PathVariable String id, Principal principal) {
        return notifications.read(principal.getName(), positiveId(id));
    }

    @PostMapping("/read-all")
    public NotificationDtos.ReadAllResult readAll(@RequestBody Map<String, Object> body,
                                                   Principal principal, HttpSession session) {
        if (body == null || !body.keySet().equals(Set.of("readBoundary"))
                || !(body.get("readBoundary") instanceof String boundary)) {
            throw invalid();
        }
        try {
            if (!UUID.fromString(boundary).toString().equals(boundary)) {
                throw invalid();
            }
        } catch (IllegalArgumentException exception) {
            throw invalid();
        }
        return notifications.readAll(principal.getName(), boundary, session);
    }

    private long positiveId(String raw) {
        if (!raw.matches("[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "通知字段无效");
    }
}

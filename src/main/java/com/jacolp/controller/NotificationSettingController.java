package com.jacolp.controller;

import com.jacolp.dto.NotificationSettingDtos;
import com.jacolp.dto.NotificationSettingWriteRequest;
import com.jacolp.service.NotificationSettingService;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class NotificationSettingController {
    private final NotificationSettingService settings;

    public NotificationSettingController(NotificationSettingService settings) {
        this.settings = settings;
    }

    @GetMapping("/notification-settings/{resourceType}/{resourceId}")
    public NotificationSettingDtos.Detail get(@PathVariable String resourceType,
                                               @PathVariable String resourceId,
                                               Principal principal) {
        return settings.get(principal.getName(), resourceType, NotificationSettingService.id(resourceId));
    }

    @PutMapping("/notification-settings/{resourceType}/{resourceId}")
    public NotificationSettingDtos.Detail put(@PathVariable String resourceType,
                                               @PathVariable String resourceId,
                                               @RequestBody Map<String, Object> body,
                                               Principal principal) {
        return settings.put(principal.getName(), resourceType, NotificationSettingService.id(resourceId),
                NotificationSettingWriteRequest.parse(body));
    }

    @GetMapping("/notification-capabilities")
    public NotificationSettingDtos.Capabilities capabilities(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String resourceId,
            @RequestParam(required = false) String action,
            Principal principal) {
        return settings.capabilities(principal.getName(), connectionId, resourceType, resourceId, action);
    }
}

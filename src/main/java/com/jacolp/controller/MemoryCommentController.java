package com.jacolp.controller;

import com.jacolp.dto.MemoryCommentDtos;
import com.jacolp.dto.MemoryCommentRequest;
import com.jacolp.service.MemoryCommentService;
import com.jacolp.service.NotificationSettingService;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/memories/{id}/comments")
public class MemoryCommentController {
    private final MemoryCommentService comments;

    public MemoryCommentController(MemoryCommentService comments) {
        this.comments = comments;
    }

    @GetMapping
    public MemoryCommentDtos.Page list(@PathVariable String id, Principal principal,
                                        @RequestParam(defaultValue = "CREATED_ASC") String sort,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        return comments.list(principal.getName(), NotificationSettingService.id(id),
                sort, page, size);
    }

    @PostMapping
    public MemoryCommentDtos.Created add(@PathVariable String id,
                                          @RequestBody Map<String, Object> body,
                                          @RequestHeader(value = "Idempotency-Key", required = false)
                                          String key, Principal principal, HttpSession session) {
        return comments.add(principal.getName(), NotificationSettingService.id(id),
                MemoryCommentRequest.parse(body), body, key, session);
    }
}

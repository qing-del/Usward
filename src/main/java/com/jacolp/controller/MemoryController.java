package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MemoryDtos;
import com.jacolp.dto.MemoryShareRequest;
import com.jacolp.dto.MemoryWriteRequest;
import com.jacolp.service.MemoryService;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/memories")
public class MemoryController {
    private final MemoryService memories;

    public MemoryController(MemoryService memories) {
        this.memories = memories;
    }

    @PostMapping
    public ResponseEntity<MemoryDtos.Detail> create(@RequestBody Map<String, Object> body,
                                                    Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(memories.create(principal.getName(), MemoryWriteRequest.create(body)));
    }

    @GetMapping("/{id}")
    public MemoryDtos.Detail get(@PathVariable String id, Principal principal) {
        return memories.get(principal.getName(), id(id));
    }

    @GetMapping
    public MemoryDtos.Page list(Principal principal,
                                @RequestParam(defaultValue = "ALL") String scope,
                                @RequestParam(defaultValue = "false") boolean archived,
                                @RequestParam(required = false) String keyword,
                                @RequestParam(required = false) String category,
                                @RequestParam(required = false) String tag,
                                @RequestParam(defaultValue = "UPDATED_DESC") String sort,
                                @RequestParam(defaultValue = "1") int page,
                                @RequestParam(defaultValue = "20") int size) {
        return memories.list(principal.getName(), scope, archived, keyword, category, tag,
                sort, page, size);
    }

    @PatchMapping("/{id}")
    public MemoryDtos.Detail patch(@PathVariable String id, @RequestBody Map<String, Object> body,
                                   Principal principal) {
        return memories.patch(principal.getName(), id(id), MemoryWriteRequest.patch(body));
    }

    @PostMapping("/{id}/archive")
    public MemoryDtos.Detail archive(@PathVariable String id, @RequestBody Map<String, Object> body,
                                     Principal principal) {
        return memories.setArchived(principal.getName(), id(id),
                MemoryWriteRequest.expectedVersionOnly(body), true);
    }

    @PostMapping("/{id}/restore")
    public MemoryDtos.Detail restore(@PathVariable String id, @RequestBody Map<String, Object> body,
                                     Principal principal) {
        return memories.setArchived(principal.getName(), id(id),
                MemoryWriteRequest.expectedVersionOnly(body), false);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @RequestBody Map<String, Object> body,
                                       Principal principal) {
        memories.delete(principal.getName(), id(id), MemoryWriteRequest.expectedVersionOnly(body));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/share")
    public MemoryDtos.Detail share(@PathVariable String id, @RequestBody Map<String, Object> body,
                                   @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                   Principal principal) {
        return memories.share(principal.getName(), id(id), MemoryShareRequest.parse(body), body, key);
    }

    @DeleteMapping("/{id}/share")
    public MemoryDtos.Detail unshare(@PathVariable String id, @RequestBody Map<String, Object> body,
                                     Principal principal) {
        return memories.unshare(principal.getName(), id(id),
                MemoryWriteRequest.expectedVersionOnly(body));
    }

    private long id(String raw) {
        try {
            long id = Long.parseLong(raw);
            if (id > 0 && raw.equals(Long.toString(id))) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Bad path IDs are request errors, never database keys.
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "卡片 ID 无效");
    }
}

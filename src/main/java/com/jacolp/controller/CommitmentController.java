package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.CommitmentDtos;
import com.jacolp.dto.CommitmentWriteRequest;
import com.jacolp.service.CommitmentService;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/commitments")
public class CommitmentController {
    private final CommitmentService commitments;

    public CommitmentController(CommitmentService commitments) {
        this.commitments = commitments;
    }

    @PostMapping
    public ResponseEntity<CommitmentDtos.Detail> create(@RequestBody Map<String, Object> body,
                                                        Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(commitments.create(principal.getName(), CommitmentWriteRequest.create(body)));
    }

    @GetMapping("/{id}")
    public CommitmentDtos.Detail get(@PathVariable String id, Principal principal) {
        return commitments.get(principal.getName(), id(id));
    }

    private long id(String raw) {
        try {
            long id = Long.parseLong(raw);
            if (id > 0 && raw.equals(Long.toString(id))) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Path IDs are decimal strings.
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "承诺 ID 无效");
    }
}

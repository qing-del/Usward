package com.jacolp.controller;

import com.jacolp.dto.ExpressionDtos;
import com.jacolp.dto.ExpressionRequests;
import com.jacolp.service.ExpressionService;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/expressions")
public class ExpressionController {
    private final ExpressionService expressions;

    public ExpressionController(ExpressionService expressions) {
        this.expressions = expressions;
    }

    @PostMapping
    public ResponseEntity<Object> send(@RequestBody Map<String, Object> body,
                                       @RequestHeader(value = "Idempotency-Key", required = false)
                                       String key, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(expressions.send(principal.getName(),
                ExpressionRequests.send(body), body, key));
    }

    @GetMapping
    public ExpressionDtos.Page list(Principal principal,
                                    @RequestParam(defaultValue = "ALL") String direction,
                                    @RequestParam(defaultValue = "ALL") String status,
                                    @RequestParam(defaultValue = "CREATED_DESC") String sort,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return expressions.list(principal.getName(), direction, status, sort, page, size);
    }

    @GetMapping("/{id}")
    public Object get(@PathVariable String id, Principal principal,
                      @RequestParam(defaultValue = "1") int replyPage,
                      @RequestParam(defaultValue = "20") int replySize) {
        return expressions.get(principal.getName(), ExpressionRequests.decimal(id, false),
                replyPage, replySize);
    }

    @PostMapping("/{id}/withdraw")
    public ExpressionDtos.Withdrawn withdraw(@PathVariable String id,
                                              @RequestBody Map<String, Object> body,
                                              Principal principal) {
        return expressions.withdraw(principal.getName(), ExpressionRequests.decimal(id, false),
                ExpressionRequests.versionOnly(body));
    }

    @PostMapping("/{id}/replies")
    public ExpressionDtos.Replied reply(@PathVariable String id,
                                         @RequestBody Map<String, Object> body,
                                         @RequestHeader(value = "Idempotency-Key", required = false)
                                         String key, Principal principal, HttpSession session) {
        long expressionId = ExpressionRequests.decimal(id, false);
        return expressions.reply(principal.getName(), expressionId, ExpressionRequests.reply(body),
                body, key, session);
    }
}

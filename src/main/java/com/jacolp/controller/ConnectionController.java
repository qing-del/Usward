package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.ConnectionDtos;
import com.jacolp.service.ConnectionService;
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
@RequestMapping("/api/v1")
public class ConnectionController {
    private final ConnectionService connections;

    public ConnectionController(ConnectionService connections) {
        this.connections = connections;
    }

    @GetMapping("/connection")
    public ConnectionDtos.Current current(Principal principal) {
        return connections.current(principal.getName());
    }

    @PostMapping("/connection-invites")
    public ResponseEntity<ConnectionDtos.IssuedInvite> issue(Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(connections.issue(principal.getName()));
    }

    @PostMapping("/connection-invites/preview")
    public ConnectionDtos.Preview preview(@RequestBody Map<String, Object> body, Principal principal) {
        return connections.preview(principal.getName(), ConnectionDtos.token(body));
    }

    @PostMapping("/connection-invites/accept")
    public ConnectionDtos.Connection accept(@RequestBody Map<String, Object> body, Principal principal) {
        ConnectionDtos.Accept input = ConnectionDtos.accept(body);
        return connections.accept(principal.getName(), input.token(), input.expectedVersion());
    }

    @PostMapping("/connection-invites/{id}/revoke")
    public ConnectionDtos.Invite revoke(@PathVariable String id,
                                        @RequestBody Map<String, Object> body,
                                        Principal principal) {
        long inviteId;
        try {
            inviteId = Long.parseLong(id);
            if (inviteId <= 0 || !Long.toString(inviteId).equals(id)) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "邀请 ID 无效");
        }
        return connections.revoke(principal.getName(), inviteId,
                ConnectionDtos.expectedVersion(body));
    }
}

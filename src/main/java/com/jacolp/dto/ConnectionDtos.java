package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public final class ConnectionDtos {
    private ConnectionDtos() {
    }

    public record PublicUser(String id, String nickname, String avatarStyle) {
    }

    public record Connection(String id, String status, String version, List<PublicUser> members) {
    }

    public record Invite(String id, String status, Instant expiresAt, String version) {
    }

    public record Current(Connection connection, Invite currentInvite) {
    }

    public record IssuedInvite(String id, String token, Instant expiresAt, String status,
                               String version) {
    }

    public record Preview(String id, PublicUser inviter, Instant expiresAt, String version) {
    }

    public static String token(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(Set.of("token"))) {
            throw invalid();
        }
        return tokenValue(body.get("token"));
    }

    public static Accept accept(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(Set.of("token", "expectedVersion"))) {
            throw invalid();
        }
        return new Accept(tokenValue(body.get("token")), version(body.get("expectedVersion")));
    }

    public record Accept(String token, long expectedVersion) {
    }

    public static long expectedVersion(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(Set.of("expectedVersion"))) {
            throw invalid();
        }
        return version(body.get("expectedVersion"));
    }

    public static long version(Object raw) {
        if (!(raw instanceof String value) || !value.matches("0|[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static String tokenValue(Object raw) {
        if (!(raw instanceof String value) || !value.matches("[A-Za-z0-9_-]{43}")) {
            throw invalid();
        }
        return value;
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "连接请求字段无效");
    }
}

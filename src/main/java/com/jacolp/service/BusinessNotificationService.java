package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.entity.Notification;
import com.jacolp.entity.NotificationOperation;
import com.jacolp.mapper.NotificationMapper;
import com.jacolp.mapper.NotificationOperationMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BusinessNotificationService {
    private static final JsonMapper JSON = new JsonMapper();
    private final NotificationOperationMapper operations;
    private final NotificationMapper notifications;

    public BusinessNotificationService(NotificationOperationMapper operations,
                                       NotificationMapper notifications) {
        this.operations = operations;
        this.notifications = notifications;
    }

    public String key(String raw) {
        if (raw == null || raw.length() != 36) {
            throw invalid();
        }
        try {
            UUID parsed = UUID.fromString(raw);
            if (parsed.toString().equalsIgnoreCase(raw)) {
                return parsed.toString();
            }
        } catch (IllegalArgumentException ignored) {
            // The header must be a canonical UUID.
        }
        throw invalid();
    }

    public String hash(String method, String path, Map<String, Object> body) {
        String normalized = JSON.writeValueAsString(canonical(body));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    (method + " " + path + "\n" + normalized).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public NotificationOperation previous(long actorId, String key, String requestHash) {
        NotificationOperation row = operations.find(actorId, key);
        if (row != null && !row.getRequestHash().equals(requestHash)) {
            throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_REUSED",
                    "该幂等键已用于另一项请求");
        }
        return row;
    }

    public NotificationOperation record(long actorId, String key, String requestHash,
                                        String action, long cardId, Map<String, String> resultRefs) {
        NotificationOperation row = new NotificationOperation();
        row.setActorId(actorId);
        row.setIdempotencyKey(key);
        row.setRequestHash(requestHash);
        row.setAction(action);
        row.setResourceType("MEMORY_CARD");
        row.setResourceId(cardId);
        row.setResultRefs(JSON.writeValueAsString(canonical(resultRefs)));
        operations.insert(row);
        return row;
    }

    public void notifyRecipient(NotificationOperation operation, long recipientId, String kind,
                                String message, String mode) {
        if ("NONE".equals(mode)) {
            return;
        }
        if (!"IN_APP".equals(mode)) {
            throw new ApiException(HttpStatus.CONFLICT, "MAIL_NOT_AVAILABLE", "邮件通知尚不可用");
        }
        Notification row = new Notification();
        row.setRecipientId(recipientId);
        row.setKind(kind);
        row.setResourceType("MEMORY_CARD");
        row.setResourceId(operation.getResourceId());
        row.setMessage(message);
        row.setDedupeKey("business:" + operation.getId() + ":" + kind + ":" + recipientId);
        notifications.insert(row);
    }

    public String resultRef(NotificationOperation row, String key) {
        JsonNode tree = JSON.readTree(row.getResultRefs());
        String result = tree.path(key).asText();
        if (result == null || result.isBlank()) {
            throw new IllegalStateException("Missing operation result reference");
        }
        return result;
    }

    private Object canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((key, item) -> sorted.put((String) key, canonical(item)));
            return sorted;
        }
        if (value instanceof List<?> list) {
            List<Object> normalized = new ArrayList<>();
            list.forEach(item -> normalized.add(canonical(item)));
            return normalized;
        }
        return value;
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Idempotency-Key 必须是 UUID");
    }
}

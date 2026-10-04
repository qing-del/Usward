package com.jacolp.service;

import com.jacolp.common.ApiException;
import jakarta.servlet.http.HttpSession;
import java.io.Serializable;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class NotificationOverrideStore {
    private static final String ATTRIBUTE = NotificationOverrideStore.class.getName() + ".tokens";
    private static final long TTL_SECONDS = 600;
    private static final int MAX_TOKENS = 20;

    public String issue(HttpSession session, long actorId, String action, long cardId,
                        long connectionId, long cardVersion, Long settingVersion) {
        LinkedHashMap<String, Snapshot> tokens = tokens(session);
        prune(tokens);
        while (tokens.size() >= MAX_TOKENS) {
            tokens.remove(tokens.keySet().iterator().next());
        }
        String token = UUID.randomUUID().toString();
        tokens.put(token, new Snapshot(actorId, action, cardId, connectionId,
                cardVersion, settingVersion, Instant.now().getEpochSecond()));
        session.setAttribute(ATTRIBUTE, tokens);
        return token;
    }

    public String validate(HttpSession session, String token, String mode, long actorId,
                           String action, long cardId, long connectionId, long cardVersion,
                           Long settingVersion) {
        if (!"NONE".equals(mode) && !"IN_APP".equals(mode)) {
            throw invalid();
        }
        LinkedHashMap<String, Snapshot> tokens = tokens(session);
        prune(tokens);
        Snapshot row = token == null ? null : tokens.get(token);
        if (row == null || row.actorId() != actorId || !row.action().equals(action)
                || row.cardId() != cardId || row.connectionId() != connectionId
                || row.cardVersion() != cardVersion
                || !java.util.Objects.equals(row.settingVersion(), settingVersion)) {
            throw new ApiException(HttpStatus.CONFLICT, "NOTIFICATION_CONTEXT_CHANGED",
                    "通知选择上下文已变化，请重新查看");
        }
        return mode;
    }

    @SuppressWarnings("unchecked")
    private LinkedHashMap<String, Snapshot> tokens(HttpSession session) {
        Object stored = session.getAttribute(ATTRIBUTE);
        return stored instanceof LinkedHashMap<?, ?> map
                ? (LinkedHashMap<String, Snapshot>) map : new LinkedHashMap<>();
    }

    private void prune(Map<String, Snapshot> tokens) {
        long oldest = Instant.now().getEpochSecond() - TTL_SECONDS;
        tokens.entrySet().removeIf(entry -> entry.getValue().issuedAt() < oldest);
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "通知改选方式无效");
    }

    private record Snapshot(long actorId, String action, long cardId, long connectionId,
                            long cardVersion, Long settingVersion, long issuedAt)
            implements Serializable {
    }
}

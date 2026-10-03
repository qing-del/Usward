package com.jacolp.service;

import com.jacolp.common.ApiException;
import jakarta.servlet.http.HttpSession;
import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class NotificationSnapshotStore {
    private static final String ATTRIBUTE = "usward.notification.read-boundaries";
    private static final int MAX_SNAPSHOTS = 20;

    public String issue(HttpSession session, long userId, List<Long> unreadIds) {
        Instant now = Instant.now();
        LinkedHashMap<String, Snapshot> snapshots = current(session);
        snapshots.values().removeIf(snapshot -> !snapshot.expiresAt().isAfter(now));
        while (snapshots.size() >= MAX_SNAPSHOTS) {
            Iterator<String> keys = snapshots.keySet().iterator();
            keys.next();
            keys.remove();
        }
        String token = UUID.randomUUID().toString();
        snapshots.put(token, new Snapshot(userId, now.plusSeconds(600),
                new ArrayList<>(unreadIds)));
        session.setAttribute(ATTRIBUTE, snapshots);
        return token;
    }

    public List<Long> members(HttpSession session, long userId, String token) {
        Snapshot snapshot = current(session).get(token);
        if (snapshot == null || snapshot.userId() != userId
                || !snapshot.expiresAt().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.CONFLICT, "READ_BOUNDARY_EXPIRED",
                    "通知快照已失效，请刷新列表");
        }
        return List.copyOf(snapshot.unreadIds());
    }

    @SuppressWarnings("unchecked")
    private LinkedHashMap<String, Snapshot> current(HttpSession session) {
        Object stored = session.getAttribute(ATTRIBUTE);
        if (stored instanceof Map<?, ?> map) {
            return new LinkedHashMap<>((Map<String, Snapshot>) map);
        }
        return new LinkedHashMap<>();
    }

    private record Snapshot(long userId, Instant expiresAt, List<Long> unreadIds)
            implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
    }
}

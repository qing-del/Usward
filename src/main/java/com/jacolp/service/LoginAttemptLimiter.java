package com.jacolp.service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class LoginAttemptLimiter {
    private static final int MAX_FAILURES = 5;
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private final ConcurrentHashMap<String, Attempt> attempts = new ConcurrentHashMap<>();

    public boolean isBlocked(String key) {
        Attempt current = attempts.get(key);
        if (current == null) {
            return false;
        }
        if (Instant.now().isAfter(current.windowEnd)) {
            attempts.remove(key, current);
            return false;
        }
        return current.failures >= MAX_FAILURES;
    }

    public void failed(String key) {
        attempts.compute(key, (ignored, current) -> {
            if (current == null || Instant.now().isAfter(current.windowEnd)) {
                return new Attempt(1, Instant.now().plus(WINDOW));
            }
            return new Attempt(current.failures + 1, current.windowEnd);
        });
    }

    public void succeeded(String key) {
        attempts.remove(key);
    }

    private record Attempt(int failures, Instant windowEnd) {
    }
}

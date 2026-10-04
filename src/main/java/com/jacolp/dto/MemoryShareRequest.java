package com.jacolp.dto;

import com.jacolp.common.ApiException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record MemoryShareRequest(long connectionId, long expectedVersion,
                                 String outgoingMode, String followUpMode) {
    private static final Set<String> MODES = Set.of("NONE", "IN_APP", "IN_APP_AND_MAIL");

    public static MemoryShareRequest parse(Map<String, Object> body) {
        if (body == null || !Set.of("connectionId", "expectedVersion", "notificationPlan")
                .containsAll(body.keySet()) || !body.containsKey("connectionId")
                || !body.containsKey("expectedVersion")) {
            throw invalid();
        }
        long connectionId = decimal(body.get("connectionId"), false);
        long version = decimal(body.get("expectedVersion"), true);
        if (!body.containsKey("notificationPlan")) {
            return new MemoryShareRequest(connectionId, version, "IN_APP", "IN_APP");
        }
        if (!(body.get("notificationPlan") instanceof Map<?, ?> plan)
                || !plan.keySet().equals(Set.of("outgoingMode", "followUpMode"))
                || !(plan.get("outgoingMode") instanceof String outgoing)
                || !(plan.get("followUpMode") instanceof String followUp)
                || !MODES.contains(outgoing) || !MODES.contains(followUp)) {
            throw invalid();
        }
        return new MemoryShareRequest(connectionId, version, outgoing, followUp);
    }

    private static long decimal(Object raw, boolean allowZero) {
        if (!(raw instanceof String value)
                || !value.matches(allowZero ? "(0|[1-9][0-9]*)" : "[1-9][0-9]*")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求字段无效");
    }
}

package com.jacolp.dto;

import java.util.Map;

public record ApiError(String code, String message, Map<String, String> fieldErrors,
                       Map<String, Object> details, String traceId) {
}

package com.jacolp.entity;

import lombok.Data;

@Data
public class NotificationOperation {
    private Long id;
    private Long actorId;
    private String idempotencyKey;
    private String requestHash;
    private String action;
    private String resourceType;
    private Long resourceId;
    private String resultRefs;
}

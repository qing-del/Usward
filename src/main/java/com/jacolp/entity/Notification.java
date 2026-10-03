package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class Notification {
    private Long id;
    private Long recipientId;
    private String kind;
    private String resourceType;
    private Long resourceId;
    private String message;
    private String dedupeKey;
    private LocalDateTime createdAt;
    private LocalDateTime readAt;
    private LocalDateTime invalidatedAt;
    private Long version;
}

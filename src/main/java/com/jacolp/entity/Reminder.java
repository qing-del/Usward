package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class Reminder {
    private Long id;
    private Long recipientId;
    private String resourceType;
    private Long resourceId;
    private LocalDateTime scheduledAt;
    private String deliveryMode;
    private Long revision;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}

package com.jacolp.entity;

import lombok.Data;

@Data
public class NotificationSetting {
    private Long id;
    private Long userId;
    private String resourceType;
    private Long resourceId;
    private Long connectionId;
    private String followUpMode;
    private Long version;
}

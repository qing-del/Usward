package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class NotificationDelivery {
    private String status;
    private LocalDateTime sentAt;
    private String lastErrorCode;
}

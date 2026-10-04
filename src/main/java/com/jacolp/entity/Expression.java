package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class Expression {
    private Long id;
    private Long connectionId;
    private Long senderId;
    private Long recipientId;
    private String type;
    private String body;
    private String responseWindow;
    private String responseMode;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}

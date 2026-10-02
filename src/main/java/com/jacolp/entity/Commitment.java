package com.jacolp.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class Commitment {
    private Long id;
    private Long ownerId;
    private Long sharedConnectionId;
    private String title;
    private String body;
    private String dueKind;
    private LocalDateTime dueAt;
    private LocalDate dueDate;
    private String dueTimezone;
    private String nextAction;
    private String status;
    private String result;
    private String sourceType;
    private Long sourceId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}

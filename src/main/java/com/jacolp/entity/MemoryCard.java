package com.jacolp.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class MemoryCard {
    private Long id;
    private Long ownerId;
    private Long sharedConnectionId;
    private String title;
    private String body;
    private String category;
    private String sourceType;
    private LocalDate sourceDate;
    private String nextAction;
    private boolean archived;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}

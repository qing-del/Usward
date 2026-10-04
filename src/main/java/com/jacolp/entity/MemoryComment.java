package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class MemoryComment {
    private Long id;
    private Long cardId;
    private Long connectionId;
    private Long authorId;
    private String body;
    private LocalDateTime createdAt;
}

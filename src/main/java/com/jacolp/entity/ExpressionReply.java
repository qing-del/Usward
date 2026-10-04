package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ExpressionReply {
    private Long id;
    private Long expressionId;
    private Long authorId;
    private String preset;
    private String body;
    private LocalDateTime createdAt;
}

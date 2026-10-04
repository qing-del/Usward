package com.jacolp.dto;

import java.time.Instant;
import java.util.List;

public final class MemoryCommentDtos {
    private MemoryCommentDtos() {
    }

    public record Detail(String id, String cardId, String authorId,
                         MemoryDtos.PublicOwner author, String body, Instant createdAt) {
    }

    public record Created(Detail comment, String memoryVersion) {
    }

    public record Page(List<Detail> items, long total, int page, int size,
                       boolean hasMore, Instant asOf) {
    }
}

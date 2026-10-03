package com.jacolp.dto;

import java.time.Instant;
import java.util.List;

public final class AvailabilityDtos {
    private AvailabilityDtos() {
    }

    public record Block(String opaqueId, Instant startsAt, Instant endsAt,
                        String status, String title) {
    }

    public record View(boolean sharingEnabled, List<Block> blocks, Instant from, Instant to,
                       String timezone, Instant asOf) {
    }
}

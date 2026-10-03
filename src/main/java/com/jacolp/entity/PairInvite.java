package com.jacolp.entity;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class PairInvite {
    private Long id;
    private Long inviterId;
    private String tokenHash;
    private LocalDateTime expiresAt;
    private String status;
    private Long acceptedBy;
    private Long version;
}

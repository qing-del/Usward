package com.jacolp.entity;

import lombok.Data;

@Data
public class PairConnection {
    private Long id;
    private Long userAId;
    private Long userBId;
    private String status;
    private Long version;
}

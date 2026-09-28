package com.jacolp.entity;

import lombok.Data;

@Data
public class AppUser {
    private Long id;
    private String username;
    private String passwordHash;
    private String nickname;
    private String avatarStyle;
    private String timezone;
    private String notificationEmail;
    private Long activeConnectionId;
    private boolean shareAvailability;
    private Long version;
}

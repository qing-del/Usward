package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MeResponse;
import com.jacolp.dto.ProfileWriteRequest;
import com.jacolp.entity.AppUser;
import com.jacolp.mapper.UserMapper;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService implements UserDetailsService {
    private final UserMapper users;
    private final PasswordEncoder passwordEncoder;
    public AccountService(UserMapper users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AppUser user = users.findByUsername(username);
        if (user == null) {
            throw new UsernameNotFoundException("Unknown account");
        }
        return User.withUsername(user.getUsername())
                .password(user.getPasswordHash())
                .roles("USER")
                .build();
    }

    @Transactional(readOnly = true)
    public MeResponse me(String username) {
        AppUser user = users.findByUsername(username);
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return response(user);
    }

    private MeResponse response(AppUser user) {
        return new MeResponse(
                user.getId().toString(), user.getUsername(), user.getNickname(),
                user.getAvatarStyle(), user.getTimezone(), user.getNotificationEmail(),
                false, user.isShareAvailability(), user.getVersion().toString(),
                new MeResponse.MeStats(users.countOpenCommitments(user.getId()),
                        users.countArchivedMemories(user.getId())));
    }

    @Transactional
    public MeResponse updateMe(String username, ProfileWriteRequest input) {
        AppUser user = users.lockByUsername(username);
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        if (user.getVersion() != input.expectedVersion()) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "资料版本已变化");
        }
        String oldEmail = user.getNotificationEmail();
        if (input.present().contains("nickname")) {
            user.setNickname(input.nickname());
        }
        if (input.present().contains("avatarStyle")) {
            user.setAvatarStyle(input.avatarStyle());
        }
        if (input.present().contains("timezone")) {
            user.setTimezone(input.timezone());
        }
        if (input.present().contains("notificationEmail")) {
            user.setNotificationEmail(input.notificationEmail());
        }
        if (input.present().contains("shareAvailability")) {
            if (Boolean.TRUE.equals(input.shareAvailability())
                    && (user.getActiveConnectionId() == null
                    || users.countActiveConnection(user.getActiveConnectionId(), user.getId()) != 1)) {
                throw new ApiException(HttpStatus.CONFLICT, "CONNECTION_REQUIRED", "请先建立连接");
            }
            user.setShareAvailability(input.shareAvailability());
        }
        if (users.updateProfile(user) != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "资料版本已变化");
        }
        if (oldEmail != null && !Objects.equals(oldEmail, user.getNotificationEmail())) {
            users.cancelOldAddressDeliveries(user.getId(), oldEmail);
        }
        return response(users.findByUsername(username));
    }

    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        AppUser user = users.lockByUsername(username);
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CURRENT_PASSWORD_INVALID", "当前密码错误");
        }
        validatePassword(newPassword);
        users.updatePassword(user.getId(), passwordEncoder.encode(newPassword));
        users.deleteSessionsByPrincipal(username);
    }

    @Transactional
    public void createUser(String username, String nickname, String timezone, String password) {
        validateUsername(username);
        if (nickname == null || nickname.isBlank() || nickname.length() > 100) {
            throw new IllegalArgumentException("Nickname must be 1–100 characters");
        }
        try {
            ZoneId.of(timezone);
        } catch (DateTimeException | NullPointerException exception) {
            throw new IllegalArgumentException("Invalid IANA timezone", exception);
        }
        validatePassword(password);
        if (users.countUsers() >= 2) {
            throw new IllegalStateException("The private deployment already has two accounts");
        }
        if (users.findByUsername(username) != null) {
            throw new IllegalArgumentException("Account already exists");
        }
        AppUser user = new AppUser();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setTimezone(timezone);
        user.setPasswordHash(passwordEncoder.encode(password));
        users.insert(user);
    }

    @Transactional
    public void resetPassword(String username, String password) {
        validateUsername(username);
        validatePassword(password);
        AppUser user = users.findByUsername(username);
        if (user == null) {
            throw new IllegalArgumentException("Account does not exist");
        }
        users.updatePassword(user.getId(), passwordEncoder.encode(password));
        users.deleteSessionsByPrincipal(username);
    }

    private void validateUsername(String username) {
        if (username == null || username.isBlank() || username.length() > 100) {
            throw new IllegalArgumentException("Username must be 1–100 characters");
        }
    }

    private void validatePassword(String password) {
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("Password must not be blank");
        }
    }
}

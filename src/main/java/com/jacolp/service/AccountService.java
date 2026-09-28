package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.MeResponse;
import com.jacolp.entity.AppUser;
import com.jacolp.mapper.UserMapper;
import java.time.DateTimeException;
import java.time.ZoneId;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private final JdbcTemplate jdbc;

    public AccountService(UserMapper users, PasswordEncoder passwordEncoder,
                          JdbcTemplate jdbc) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
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
        return new MeResponse(
                user.getId().toString(), user.getUsername(), user.getNickname(),
                user.getAvatarStyle(), user.getTimezone(), user.getNotificationEmail(),
                false, user.isShareAvailability(), user.getVersion().toString(),
                new MeResponse.MeStats(users.countOpenCommitments(user.getId()),
                        users.countArchivedMemories(user.getId())));
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
        jdbc.update("""
                DELETE s, a FROM SPRING_SESSION AS s
                LEFT JOIN SPRING_SESSION_ATTRIBUTES AS a ON a.SESSION_PRIMARY_ID = s.PRIMARY_ID
                WHERE s.PRINCIPAL_NAME = ?
                """, username);
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

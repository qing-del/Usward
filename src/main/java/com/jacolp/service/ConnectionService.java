package com.jacolp.service;

import com.jacolp.common.ApiException;
import com.jacolp.dto.ConnectionDtos;
import com.jacolp.entity.AppUser;
import com.jacolp.entity.PairConnection;
import com.jacolp.entity.PairInvite;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.UserMapper;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConnectionService {
    private final ConnectionMapper connections;
    private final UserMapper users;
    private final ConnectionLifecycleService lifecycle;
    private final SecureRandom random = new SecureRandom();

    public ConnectionService(ConnectionMapper connections, UserMapper users,
                             ConnectionLifecycleService lifecycle) {
        this.connections = connections;
        this.users = users;
        this.lifecycle = lifecycle;
    }

    @Transactional(readOnly = true)
    public ConnectionDtos.Current current(String username) {
        AppUser caller = required(username, false);
        PairConnection connection = caller.getActiveConnectionId() == null ? null
                : connections.activeConnection(caller.getActiveConnectionId());
        if (connection != null && !member(connection, caller.getId())) {
            connection = null;
        }
        PairInvite invite = connection == null ? connections.currentInvite(caller.getId()) : null;
        return new ConnectionDtos.Current(connection == null ? null : dto(connection),
                invite == null ? null : inviteDto(invite));
    }

    @Transactional
    public ConnectionDtos.IssuedInvite issue(String username) {
        AppUser caller = required(username, true);
        if (caller.getActiveConnectionId() != null) {
            throw connected();
        }
        connections.revokePending(caller.getId(), -1);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        PairInvite invite = new PairInvite();
        invite.setInviterId(caller.getId());
        invite.setTokenHash(hash(token));
        invite.setExpiresAt(LocalDateTime.ofInstant(Instant.now().plusSeconds(24 * 60 * 60),
                ZoneOffset.UTC));
        connections.insertInvite(invite);
        return new ConnectionDtos.IssuedInvite(invite.getId().toString(), token,
                utc(invite.getExpiresAt()), "PENDING", "0");
    }

    @Transactional(readOnly = true)
    public ConnectionDtos.Preview preview(String username, String token) {
        AppUser caller = required(username, false);
        PairInvite invite = invite(token);
        checkUsable(invite);
        if (invite.getInviterId().equals(caller.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SELF_INVITE", "不能接受自己的邀请");
        }
        AppUser inviter = users.findById(invite.getInviterId());
        if (inviter == null) {
            throw inviteMissing();
        }
        if (caller.getActiveConnectionId() != null || inviter.getActiveConnectionId() != null) {
            throw connected();
        }
        return new ConnectionDtos.Preview(invite.getId().toString(), publicUser(inviter),
                utc(invite.getExpiresAt()), invite.getVersion().toString());
    }

    @Transactional
    public ConnectionDtos.Connection accept(String username, String token, long expectedVersion) {
        AppUser caller = required(username, false);
        PairInvite candidate = invite(token);
        if (candidate.getInviterId().equals(caller.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SELF_INVITE", "不能接受自己的邀请");
        }
        long low = Math.min(caller.getId(), candidate.getInviterId());
        long high = Math.max(caller.getId(), candidate.getInviterId());
        AppUser first = users.lockById(low);
        AppUser second = users.lockById(high);
        if (first == null || second == null) {
            throw inviteMissing();
        }
        AppUser lockedCaller = caller.getId() == low ? first : second;
        AppUser inviter = candidate.getInviterId() == low ? first : second;
        PairInvite invite = connections.lockInvite(candidate.getId());
        checkUsable(invite);
        if (!candidate.getTokenHash().equals(invite.getTokenHash())) {
            throw inviteMissing();
        }
        if (invite.getVersion() != expectedVersion) {
            throw versionConflict();
        }
        if (lockedCaller.getActiveConnectionId() != null || inviter.getActiveConnectionId() != null) {
            throw connected();
        }
        // An event title approved for an earlier connection must not become visible to this one.
        connections.clearPersonalEventTitles(low, high);
        PairConnection connection = new PairConnection();
        connection.setUserAId(low);
        connection.setUserBId(high);
        connections.insertConnection(connection);
        if (users.bindConnection(low, connection.getId()) != 1
                || users.bindConnection(high, connection.getId()) != 1
                || connections.accept(invite.getId(), invite.getVersion(), lockedCaller.getId()) != 1) {
            throw versionConflict();
        }
        connections.revokePending(low, invite.getId());
        connections.revokePending(high, invite.getId());
        return dto(connections.activeConnection(connection.getId()));
    }

    @Transactional
    public ConnectionDtos.Invite revoke(String username, long id, long expectedVersion) {
        AppUser caller = required(username, true);
        PairInvite candidate = connections.ownedInvite(id, caller.getId());
        if (candidate == null) {
            throw inviteMissing();
        }
        PairInvite invite = connections.lockInvite(id);
        checkUsable(invite);
        if (invite.getVersion() != expectedVersion) {
            throw versionConflict();
        }
        if (connections.revoke(id, caller.getId(), expectedVersion) != 1) {
            throw versionConflict();
        }
        return inviteDto(connections.ownedInvite(id, caller.getId()));
    }

    @Transactional
    public ConnectionDtos.Current end(String username, long expectedVersion) {
        AppUser caller = required(username, false);
        if (caller.getActiveConnectionId() == null) {
            throw connectionMissing();
        }
        PairConnection connection = connections.lockActiveConnection(caller.getActiveConnectionId());
        if (connection == null || !member(connection, caller.getId())) {
            throw connectionMissing();
        }
        AppUser first = users.lockById(connection.getUserAId());
        AppUser second = users.lockById(connection.getUserBId());
        if (first == null || second == null
                || !connection.getId().equals(first.getActiveConnectionId())
                || !connection.getId().equals(second.getActiveConnectionId())) {
            throw connectionMissing();
        }
        if (connection.getVersion() != expectedVersion) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "连接版本已变化");
        }
        lifecycle.end(connection.getId(), first.getId(), second.getId());
        if (connections.end(connection.getId(), expectedVersion) != 1
                || users.endConnection(first.getId(), connection.getId()) != 1
                || users.endConnection(second.getId(), connection.getId()) != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "连接版本已变化");
        }
        connections.revokePending(first.getId(), -1);
        connections.revokePending(second.getId(), -1);
        return new ConnectionDtos.Current(null, null);
    }

    private PairInvite invite(String token) {
        PairInvite row = connections.inviteByHash(hash(token));
        if (row == null) {
            throw inviteMissing();
        }
        return row;
    }

    private void checkUsable(PairInvite invite) {
        if (invite == null) {
            throw inviteMissing();
        }
        if ("REVOKED".equals(invite.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "INVITE_REVOKED", "邀请已撤销");
        }
        if ("ACCEPTED".equals(invite.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "INVITE_USED", "邀请已使用");
        }
        if ("EXPIRED".equals(invite.getStatus())
                || !invite.getExpiresAt().isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            throw new ApiException(HttpStatus.CONFLICT, "INVITE_EXPIRED", "邀请已过期");
        }
    }

    private AppUser required(String username, boolean lock) {
        AppUser row = lock ? users.lockByUsername(username) : users.findByUsername(username);
        if (row == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请重新登录");
        }
        return row;
    }

    private ConnectionDtos.Connection dto(PairConnection row) {
        return new ConnectionDtos.Connection(row.getId().toString(), row.getStatus(),
                row.getVersion().toString(), List.of(publicUser(users.findById(row.getUserAId())),
                publicUser(users.findById(row.getUserBId()))));
    }

    private ConnectionDtos.PublicUser publicUser(AppUser row) {
        return new ConnectionDtos.PublicUser(row.getId().toString(), row.getNickname(),
                row.getAvatarStyle());
    }

    private ConnectionDtos.Invite inviteDto(PairInvite row) {
        return new ConnectionDtos.Invite(row.getId().toString(), row.getStatus(),
                utc(row.getExpiresAt()), row.getVersion().toString());
    }

    private Instant utc(LocalDateTime value) {
        return value.toInstant(ZoneOffset.UTC);
    }

    private String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private boolean member(PairConnection row, long userId) {
        return row.getUserAId() == userId || row.getUserBId() == userId;
    }

    private ApiException connected() {
        return new ApiException(HttpStatus.CONFLICT, "ALREADY_CONNECTED", "已有连接");
    }

    private ApiException versionConflict() {
        return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "邀请版本已变化");
    }

    private ApiException inviteMissing() {
        return new ApiException(HttpStatus.NOT_FOUND, "INVITE_NOT_FOUND", "邀请不存在");
    }

    private ApiException connectionMissing() {
        return new ApiException(HttpStatus.NOT_FOUND, "CONNECTION_NOT_FOUND", "连接不存在");
    }
}

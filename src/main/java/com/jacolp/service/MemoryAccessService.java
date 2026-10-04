package com.jacolp.service;

import com.jacolp.entity.AppUser;
import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.MemoryMapper;
import com.jacolp.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class MemoryAccessService {
    private final MemoryMapper memories;
    private final ConnectionMapper connections;
    private final UserMapper users;

    public MemoryAccessService(MemoryMapper memories, ConnectionMapper connections, UserMapper users) {
        this.memories = memories;
        this.connections = connections;
        this.users = users;
    }

    public MemoryCard readable(long viewerId, long cardId) {
        MemoryCard card = memories.findById(cardId);
        return visible(viewerId, card) ? card : null;
    }

    public boolean visible(long viewerId, MemoryCard card) {
        if (card == null) {
            return false;
        }
        if (card.getOwnerId() == viewerId) {
            return true;
        }
        Long connectionId = card.getSharedConnectionId();
        if (connectionId == null) {
            return false;
        }
        AppUser viewer = users.findById(viewerId);
        AppUser author = users.findById(card.getOwnerId());
        PairConnection pair = connections.activeConnection(connectionId);
        return matches(pair, viewer, author, connectionId);
    }

    // Shared-card writes use the same connection -> ordered accounts -> card lock order as ending a pair.
    public MemoryCard lockReadable(long viewerId, long cardId) {
        MemoryCard candidate = memories.findById(cardId);
        if (candidate == null) {
            return null;
        }
        if (candidate.getOwnerId() == viewerId) {
            users.lockById(viewerId);
            MemoryCard locked = memories.lockById(cardId);
            return locked != null && locked.getOwnerId() == viewerId ? locked : null;
        }
        Long connectionId = candidate.getSharedConnectionId();
        if (connectionId == null) {
            return null;
        }
        return lockShared(viewerId, cardId);
    }

    public MemoryCard lockShared(long viewerId, long cardId) {
        MemoryCard candidate = memories.findById(cardId);
        if (candidate == null || candidate.getSharedConnectionId() == null) {
            return null;
        }
        Long connectionId = candidate.getSharedConnectionId();
        PairConnection pair = connections.lockActiveConnection(connectionId);
        if (pair == null || !member(pair, viewerId) || !member(pair, candidate.getOwnerId())) {
            return null;
        }
        AppUser first = users.lockById(pair.getUserAId());
        AppUser second = users.lockById(pair.getUserBId());
        MemoryCard locked = memories.lockById(cardId);
        AppUser viewer = first != null && first.getId() == viewerId ? first : second;
        AppUser author = first != null && first.getId() == candidate.getOwnerId() ? first : second;
        return locked != null && locked.getOwnerId().equals(candidate.getOwnerId())
                && connectionId.equals(locked.getSharedConnectionId())
                && matches(pair, viewer, author, connectionId) ? locked : null;
    }

    public Long activeConnectionId(long viewerId) {
        AppUser viewer = users.findById(viewerId);
        if (viewer == null || viewer.getActiveConnectionId() == null) {
            return null;
        }
        PairConnection pair = connections.activeConnection(viewer.getActiveConnectionId());
        if (pair == null || !members(pair, viewerId, pair.getUserAId() == viewerId
                ? pair.getUserBId() : pair.getUserAId())) {
            return null;
        }
        AppUser author = users.findById(pair.getUserAId() == viewerId
                ? pair.getUserBId() : pair.getUserAId());
        return matches(pair, viewer, author, pair.getId()) ? pair.getId() : null;
    }

    private boolean matches(PairConnection pair, AppUser viewer, AppUser author, long connectionId) {
        return pair != null && viewer != null && author != null
                && member(pair, viewer.getId()) && member(pair, author.getId())
                && connectionId == viewer.getActiveConnectionId()
                && connectionId == author.getActiveConnectionId();
    }

    private boolean members(PairConnection pair, long one, long other) {
        return (pair.getUserAId() == one && pair.getUserBId() == other)
                || (pair.getUserBId() == one && pair.getUserAId() == other);
    }

    private boolean member(PairConnection pair, long userId) {
        return pair.getUserAId() == userId || pair.getUserBId() == userId;
    }
}

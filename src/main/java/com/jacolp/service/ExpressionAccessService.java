package com.jacolp.service;

import com.jacolp.entity.AppUser;
import com.jacolp.entity.Expression;
import com.jacolp.entity.PairConnection;
import com.jacolp.mapper.ConnectionMapper;
import com.jacolp.mapper.ExpressionMapper;
import com.jacolp.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class ExpressionAccessService {
    private final ExpressionMapper expressions;
    private final UserMapper users;
    private final ConnectionMapper connections;

    public ExpressionAccessService(ExpressionMapper expressions, UserMapper users,
                                   ConnectionMapper connections) {
        this.expressions = expressions;
        this.users = users;
        this.connections = connections;
    }

    public Expression readable(long viewerId, long expressionId) {
        Expression row = expressions.find(expressionId);
        if (row == null || (row.getSenderId() != viewerId && row.getRecipientId() != viewerId)) {
            return null;
        }
        AppUser viewer = users.findById(viewerId);
        if (viewer == null || !row.getConnectionId().equals(viewer.getActiveConnectionId())) {
            return null;
        }
        PairConnection pair = connections.activeConnection(row.getConnectionId());
        if (pair == null || !members(pair, row)) {
            return null;
        }
        AppUser other = users.findById(row.getSenderId() == viewerId
                ? row.getRecipientId() : row.getSenderId());
        return other != null && row.getConnectionId().equals(other.getActiveConnectionId())
                ? row : null;
    }

    public boolean activeContent(long viewerId, long expressionId) {
        Expression row = readable(viewerId, expressionId);
        return row != null && !"WITHDRAWN".equals(row.getStatus());
    }

    private boolean members(PairConnection pair, Expression row) {
        return (pair.getUserAId().equals(row.getSenderId())
                && pair.getUserBId().equals(row.getRecipientId()))
                || (pair.getUserBId().equals(row.getSenderId())
                && pair.getUserAId().equals(row.getRecipientId()));
    }
}

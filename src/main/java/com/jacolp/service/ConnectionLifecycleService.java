package com.jacolp.service;

import com.jacolp.mapper.ConnectionMapper;
import org.springframework.stereotype.Service;

@Service
public class ConnectionLifecycleService {
    private final ConnectionMapper connections;
    private final ResourceLifecycleService resources;

    public ConnectionLifecycleService(ConnectionMapper connections, ResourceLifecycleService resources) {
        this.connections = connections;
        this.resources = resources;
    }

    // The caller already holds the connection lock and both account locks.
    public void end(long connectionId, long userAId, long userBId) {
        resources.revokeAccess(userAId, "PAIR_CONNECTION", connectionId);
        resources.revokeAccess(userBId, "PAIR_CONNECTION", connectionId);
        for (long id : connections.sharedCards(connectionId, userAId)) {
            resources.revokeAccess(userBId, "MEMORY_CARD", id);
        }
        for (long id : connections.sharedCards(connectionId, userBId)) {
            resources.revokeAccess(userAId, "MEMORY_CARD", id);
        }
        for (long id : connections.sharedCommitments(connectionId, userAId)) {
            resources.revokeAccess(userBId, "COMMITMENT", id);
        }
        for (long id : connections.sharedCommitments(connectionId, userBId)) {
            resources.revokeAccess(userAId, "COMMITMENT", id);
        }
        for (long id : connections.sharedEvents(connectionId)) {
            resources.revokeAccess(userAId, "CALENDAR_EVENT", id);
            resources.revokeAccess(userBId, "CALENDAR_EVENT", id);
        }
        for (long id : connections.expressions(connectionId)) {
            resources.revokeAccess(userAId, "EXPRESSION", id);
            resources.revokeAccess(userBId, "EXPRESSION", id);
        }
        for (long id : connections.calendarInvitations(connectionId)) {
            resources.revokeAccess(userAId, "CALENDAR_INVITATION", id);
            resources.revokeAccess(userBId, "CALENDAR_INVITATION", id);
        }
        connections.deleteComments(connectionId);
        connections.deleteNotificationSettings(connectionId);
        connections.unshareCards(connectionId);
        connections.unshareCommitments(connectionId);
        connections.clearPersonalEventTitles(userAId, userBId);
    }
}

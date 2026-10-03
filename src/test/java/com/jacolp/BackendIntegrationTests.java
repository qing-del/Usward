package com.jacolp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jacolp.service.AccountService;
import com.jacolp.service.CalendarService;
import com.jacolp.service.MemoryService;
import com.jacolp.service.ReminderScanService;
import com.jacolp.mapper.UserMapper;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "USWARD_TEST_DB_URL", matches = ".+")
class BackendIntegrationTests {
    private static final JsonMapper JSON = new JsonMapper();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        String url = System.getenv("USWARD_TEST_DB_URL");
        if (url == null || !url.matches("(?i).*[/][a-z0-9_]*_test([?].*)?$")) {
            throw new IllegalStateException("Integration tests require a dedicated *_test database");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("USWARD_TEST_DB_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("USWARD_TEST_DB_PASSWORD"));
        properties.add("usward.reminder.scan-enabled", () -> "false");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired AccountService accounts;
    @Autowired CalendarService calendar;
    @Autowired MemoryService memories;
    @Autowired ReminderScanService reminderScan;
    @Autowired UserMapper users;
    @Autowired JdbcIndexedSessionRepository sessions;
    @Value("${local.server.port}") int port;

    @BeforeEach
    void freshAccounts() {
        jdbc.update("DELETE FROM notification_delivery");
        jdbc.update("DELETE FROM notification");
        jdbc.update("DELETE FROM reminder");
        jdbc.update("DELETE FROM commitment");
        jdbc.update("DELETE FROM calendar_event");
        jdbc.update("DELETE FROM calendar_invitation");
        jdbc.update("DELETE FROM expression_reply");
        jdbc.update("DELETE FROM expression");
        jdbc.update("DELETE FROM memory_comment");
        jdbc.update("DELETE FROM notification_setting");
        jdbc.update("DELETE FROM notification_operation");
        jdbc.update("DELETE FROM pair_invite");
        jdbc.update("DELETE FROM pair_connection");
        jdbc.update("DELETE FROM memory_tag");
        jdbc.update("DELETE FROM memory_card");
        jdbc.update("DELETE FROM SPRING_SESSION_ATTRIBUTES");
        jdbc.update("DELETE FROM SPRING_SESSION");
        jdbc.update("DELETE FROM app_user");
        accounts.createUser("alice", "Alice", "Asia/Shanghai", "A-user-test-password-21");
        accounts.createUser("bob", "Bob", "Asia/Shanghai", "B-user-test-password-21");
    }

    @Test
    void connectionInvitesAreOneTimeVersionedAndKeepPrivateDataPrivate() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        assertTrue(JSON.readTree(alice.call("GET", "/connection", null, null).body())
                .path("connection").isNull());
        assertEquals(403, alice.call("POST", "/connection-invites", null, null).statusCode());
        JsonNode first = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        String firstToken = first.path("token").asText();
        assertEquals(43, firstToken.length());
        assertEquals("0", first.path("version").asText());
        assertFalse(jdbc.queryForObject("SELECT token_hash FROM pair_invite WHERE id = ?",
                String.class, Long.parseLong(first.path("id").asText())).contains(firstToken));
        JsonNode refreshed = JSON.readTree(alice.call("GET", "/connection", null, null).body());
        assertEquals(first.path("id").asText(), refreshed.path("currentInvite").path("id").asText());
        assertFalse(refreshed.path("currentInvite").has("token"));
        assertEquals(404, bob.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + "A".repeat(43) + "\"}").statusCode());
        assertEquals(400, alice.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + firstToken + "\"}").statusCode());
        JsonNode preview = JSON.readTree(bob.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + firstToken + "\"}").body());
        assertEquals("Alice", preview.path("inviter").path("nickname").asText());
        assertFalse(preview.path("inviter").has("username"));
        assertFalse(preview.path("inviter").has("notificationEmail"));
        assertEquals(409, alice.write("POST", "/connection-invites/" + first.path("id").asText()
                + "/revoke", "{\"expectedVersion\":\"1\"}").statusCode());
        assertEquals("REVOKED", JSON.readTree(alice.write("POST", "/connection-invites/"
                + first.path("id").asText() + "/revoke", "{\"expectedVersion\":\"0\"}").body())
                .path("status").asText());
        assertEquals(409, bob.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + firstToken + "\"}").statusCode());

        JsonNode expired = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        jdbc.update("UPDATE pair_invite SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 SECOND WHERE id = ?",
                Long.parseLong(expired.path("id").asText()));
        assertEquals(409, bob.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + expired.path("token").asText() + "\"}").statusCode());
        assertTrue(JSON.readTree(alice.call("GET", "/connection", null, null).body())
                .path("currentInvite").isNull());

        JsonNode current = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        String accept = "{\"token\":\"" + current.path("token").asText()
                + "\",\"expectedVersion\":\"0\"}";
        assertEquals(409, bob.write("POST", "/connection-invites/accept",
                accept.replace("\"expectedVersion\":\"0\"", "\"expectedVersion\":\"1\"")).statusCode());
        JsonNode connected = JSON.readTree(bob.write("POST", "/connection-invites/accept", accept).body());
        assertEquals("ACTIVE", connected.path("status").asText());
        assertEquals(2, connected.path("members").size());
        assertTrue(connected.path("id").isTextual());
        assertEquals(409, bob.write("POST", "/connection-invites/accept", accept).statusCode());
        assertEquals(409, alice.write("POST", "/connection-invites", null).statusCode());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM pair_connection", Integer.class));
        assertEquals(0, JSON.readTree(bob.call("GET", "/memories?scope=PARTNER", null, null).body())
                .path("total").asInt());
        assertFalse(JSON.readTree(alice.call("GET", "/me", null, null).body())
                .path("shareAvailability").asBoolean());
    }

    @Test
    void simultaneousInviteAcceptanceCreatesOneConnection() throws Exception {
        Browser alice = new Browser();
        Browser bob1 = new Browser();
        Browser bob2 = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob1.login("bob", "B-user-test-password-21");
        bob2.login("bob", "B-user-test-password-21");
        JsonNode invite = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        String body = "{\"token\":\"" + invite.path("token").asText()
                + "\",\"expectedVersion\":\"0\"}";
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> first = pool.submit(() -> {
                start.await();
                return bob1.write("POST", "/connection-invites/accept", body).statusCode();
            });
            Future<Integer> second = pool.submit(() -> {
                start.await();
                return bob2.write("POST", "/connection-invites/accept", body).statusCode();
            });
            start.countDown();
            assertEquals(200, Math.min(first.get(), second.get()));
            assertEquals(409, Math.max(first.get(), second.get()));
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM pair_connection", Integer.class));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM app_user WHERE active_connection_id IS NOT NULL",
                Integer.class));
    }

    @Test
    void reissueRevokesOldTokenAndAcceptRacesWithRevokeAtomically() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        JsonNode first = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        JsonNode second = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        assertEquals(409, bob.write("POST", "/connection-invites/preview",
                "{\"token\":\"" + first.path("token").asText() + "\"}").statusCode());
        assertEquals(second.path("id").asText(), JSON.readTree(alice.call("GET", "/connection",
                null, null).body()).path("currentInvite").path("id").asText());
        String accept = "{\"token\":\"" + second.path("token").asText()
                + "\",\"expectedVersion\":\"0\"}";
        String revoke = "{\"expectedVersion\":\"0\"}";
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> accepted = pool.submit(() -> {
                start.await();
                return bob.write("POST", "/connection-invites/accept", accept).statusCode();
            });
            Future<Integer> revoked = pool.submit(() -> {
                start.await();
                return alice.write("POST", "/connection-invites/" + second.path("id").asText()
                        + "/revoke", revoke).statusCode();
            });
            start.countDown();
            assertEquals(200, Math.min(accepted.get(), revoked.get()));
            assertEquals(409, Math.max(accepted.get(), revoked.get()));
        } finally {
            pool.shutdownNow();
        }
        int connections = jdbc.queryForObject("SELECT COUNT(*) FROM pair_connection", Integer.class);
        assertTrue(connections == 0 || connections == 1);
        assertEquals(connections * 2, jdbc.queryForObject(
                "SELECT COUNT(*) FROM app_user WHERE active_connection_id IS NOT NULL", Integer.class));
    }

    @Test
    void endingConnectionClearsSharedStateWithoutTouchingAuthorsPrivateReminder() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        JsonNode invitation = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        JsonNode pair = JSON.readTree(bob.write("POST", "/connection-invites/accept",
                "{\"token\":\"" + invitation.path("token").asText()
                        + "\",\"expectedVersion\":\"0\"}").body());
        long pairId = Long.parseLong(pair.path("id").asText());
        long aliceId = jdbc.queryForObject("SELECT id FROM app_user WHERE username = 'alice'", Long.class);
        long bobId = jdbc.queryForObject("SELECT id FROM app_user WHERE username = 'bob'", Long.class);
        JsonNode me = JSON.readTree(alice.call("GET", "/me", null, null).body());
        assertEquals(200, alice.write("PATCH", "/me", "{\"expectedVersion\":\""
                + me.path("version").asText() + "\",\"shareAvailability\":true}").statusCode());
        JsonNode card = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"kept private after ending\"}").body());
        long cardId = Long.parseLong(card.path("id").asText());
        JsonNode commitment = JSON.readTree(alice.write("POST", "/commitments",
                "{\"title\":\"kept private\"}").body());
        long commitmentId = Long.parseLong(commitment.path("id").asText());
        jdbc.update("UPDATE memory_card SET shared_connection_id = ? WHERE id = ?", pairId, cardId);
        jdbc.update("UPDATE commitment SET shared_connection_id = ? WHERE id = ?", pairId, commitmentId);
        jdbc.update("INSERT INTO memory_comment (card_id, connection_id, author_id, body) VALUES (?, ?, ?, 'old comment')",
                cardId, pairId, bobId);
        jdbc.update("INSERT INTO notification_setting (user_id, resource_type, resource_id, connection_id) "
                + "VALUES (?, 'MEMORY_CARD', ?, ?)", bobId, cardId, pairId);
        JsonNode ownReminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2027-01-01T00:00:00Z","expectedRevision":null}
                """.formatted(cardId)).body());
        jdbc.update("INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at) "
                + "VALUES (?, 'MEMORY_CARD', ?, UTC_TIMESTAMP(6) + INTERVAL 1 DAY)", bobId, cardId);
        jdbc.update("INSERT INTO notification (recipient_id, kind, resource_type, resource_id, message, dedupe_key) "
                + "VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, 'generic', 'old-partner')", bobId, cardId);
        jdbc.update("INSERT INTO notification (recipient_id, kind, resource_type, resource_id, message, dedupe_key) "
                + "VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, 'generic', 'old-owner')", aliceId, cardId);
        long partnerNotification = jdbc.queryForObject(
                "SELECT id FROM notification WHERE dedupe_key = 'old-partner'", Long.class);
        jdbc.update("INSERT INTO notification_delivery "
                + "(notification_id, source_type, recipient_id, to_address) "
                + "VALUES (?, 'BUSINESS', ?, 'bob@example.test')", partnerNotification, bobId);
        assertEquals(409, alice.write("POST", "/connection/end",
                "{\"expectedVersion\":\"1\"}").statusCode());
        assertEquals(403, bob.call("POST", "/connection/end",
                "{\"expectedVersion\":\"0\"}", null).statusCode());
        JsonNode ended = JSON.readTree(bob.write("POST", "/connection/end",
                "{\"expectedVersion\":\"0\"}").body());
        assertTrue(ended.path("connection").isNull());
        assertTrue(ended.path("currentInvite").isNull());
        assertEquals(404, alice.write("POST", "/connection/end",
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM app_user "
                + "WHERE active_connection_id IS NULL AND share_availability = FALSE", Integer.class));
        assertEquals("ENDED", jdbc.queryForObject("SELECT status FROM pair_connection WHERE id = ?",
                String.class, pairId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM memory_card "
                + "WHERE shared_connection_id = ?", Integer.class, pairId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM commitment "
                + "WHERE shared_connection_id = ?", Integer.class, pairId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM memory_comment "
                + "WHERE connection_id = ?", Integer.class, pairId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_setting "
                + "WHERE connection_id = ?", Integer.class, pairId));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM reminder WHERE id = ?",
                String.class, Long.parseLong(ownReminder.path("id").asText())));
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM reminder "
                + "WHERE recipient_id = ? AND resource_type = 'MEMORY_CARD' AND resource_id = ?",
                String.class, bobId, cardId));
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM notification_delivery "
                + "WHERE notification_id = ?", String.class, partnerNotification));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM notification "
                + "WHERE dedupe_key = 'old-partner' AND invalidated_at IS NOT NULL", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM notification "
                + "WHERE dedupe_key = 'old-owner' AND invalidated_at IS NULL", Integer.class));
        assertEquals(200, alice.call("GET", "/memories/" + cardId, null, null).statusCode());
        assertEquals(404, bob.call("GET", "/memories/" + cardId, null, null).statusCode());
        JsonNode nextInvite = JSON.readTree(alice.write("POST", "/connection-invites", null).body());
        assertEquals(200, bob.write("POST", "/connection-invites/accept", "{\"token\":\""
                + nextInvite.path("token").asText() + "\",\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM memory_card "
                + "WHERE shared_connection_id IS NOT NULL", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM notification "
                + "WHERE dedupe_key = 'old-partner' AND invalidated_at IS NOT NULL", Integer.class));
    }

    @Test
    void availabilityExposesOnlyMergedBlocksWithStrictTitleRedaction() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        String query = "/availability?from=2026-09-27T16:00:00Z&to=2026-09-28T16:00:00Z"
                + "&timezone=Asia/Shanghai";
        JsonNode disconnected = JSON.readTree(alice.call("GET", query, null, null).body());
        assertFalse(disconnected.path("sharingEnabled").asBoolean());
        assertEquals(0, disconnected.path("blocks").size());
        connect(alice, bob);
        assertFalse(JSON.readTree(alice.call("GET", query, null, null).body())
                .path("sharingEnabled").asBoolean());
        JsonNode me = JSON.readTree(bob.call("GET", "/me", null, null).body());
        assertEquals(200, bob.write("PATCH", "/me", "{\"expectedVersion\":\""
                + me.path("version").asText() + "\",\"shareAvailability\":true}").statusCode());
        JsonNode empty = JSON.readTree(alice.call("GET", query, null, null).body());
        assertTrue(empty.path("sharingEnabled").asBoolean());
        assertEquals(0, empty.path("blocks").size());

        JsonNode work = JSON.readTree(bob.write("POST", "/events", eventBody("Work", "BUSY",
                "2026-09-28T09:00:00Z", "2026-09-28T11:00:00Z", true)).body());
        bob.write("POST", "/events", eventBody("Chat", "NEGOTIABLE",
                "2026-09-28T10:00:00Z", "2026-09-28T12:00:00Z", true));
        bob.write("POST", "/events", eventBody("Secret", "FREE",
                "2026-09-28T10:30:00Z", "2026-09-28T10:45:00Z", false));
        bob.write("POST", "/events", eventBody("Private", "FREE",
                "2026-09-28T12:00:00Z", "2026-09-28T13:00:00Z", false));
        alice.write("POST", "/events", eventBody("Alice-only", "BUSY",
                "2026-09-28T09:00:00Z", "2026-09-28T13:00:00Z", true));
        bob.write("POST", "/events", eventBody("Before", "BUSY",
                "2026-09-27T15:00:00Z", "2026-09-27T16:00:00Z", true));
        bob.write("POST", "/events", eventBody("After", "BUSY",
                "2026-09-28T16:00:00Z", "2026-09-28T17:00:00Z", true));
        JsonNode blocks = JSON.readTree(alice.call("GET", query, null, null).body()).path("blocks");
        assertEquals(4, blocks.size());
        assertBlock(blocks.get(0), "2026-09-28T09:00:00Z", "2026-09-28T10:00:00Z",
                "BUSY", "Work");
        assertBlock(blocks.get(1), "2026-09-28T10:00:00Z", "2026-09-28T11:00:00Z",
                "BUSY", null);
        assertBlock(blocks.get(2), "2026-09-28T11:00:00Z", "2026-09-28T12:00:00Z",
                "NEGOTIABLE", "Chat");
        assertBlock(blocks.get(3), "2026-09-28T12:00:00Z", "2026-09-28T13:00:00Z",
                "FREE", null);
        assertFalse(blocks.get(0).has("id"));
        assertFalse(blocks.get(0).has("location"));
        assertFalse(blocks.get(0).has("note"));
        assertFalse(blocks.get(0).has("ownerId"));
        assertFalse(blocks.get(0).path("opaqueId").asText().equals(work.path("id").asText()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification", Integer.class));
        assertEquals(400, alice.call("GET", query.replace("Asia/Shanghai", "Bad/Zone"),
                null, null).statusCode());
        JsonNode latest = JSON.readTree(bob.call("GET", "/me", null, null).body());
        bob.write("PATCH", "/me", "{\"expectedVersion\":\""
                + latest.path("version").asText() + "\",\"shareAvailability\":false}");
        assertFalse(JSON.readTree(alice.call("GET", query, null, null).body())
                .path("sharingEnabled").asBoolean());
    }

    @Test
    void availabilityUsesEventTimezoneForDstAndAcceptsSevenFortyTwoNinetyThreeDays() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        connect(alice, bob);
        JsonNode me = JSON.readTree(bob.call("GET", "/me", null, null).body());
        bob.write("PATCH", "/me", "{\"expectedVersion\":\""
                + me.path("version").asText() + "\",\"shareAvailability\":true}");
        bob.write("POST", "/events", """
                {"title":"Spring","allDay":true,"startDate":"2026-03-08",
                 "endDateExclusive":"2026-03-09","eventTimezone":"America/New_York",
                 "availability":"BUSY","shareTitle":true,"note":"Never share note"}
                """);
        bob.write("POST", "/events", """
                {"title":"Fall","allDay":true,"startDate":"2026-11-01",
                 "endDateExclusive":"2026-11-02","eventTimezone":"America/New_York",
                 "availability":"BUSY","shareTitle":true}
                """);
        JsonNode spring = JSON.readTree(alice.call("GET", availabilityQuery(
                LocalDate.of(2026, 3, 7), 7, "America/New_York"), null, null).body());
        assertEquals(1, spring.path("blocks").size());
        JsonNode springBlock = spring.path("blocks").get(0);
        assertBlock(springBlock, "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z",
                "BUSY", "Spring");
        assertEquals(23, Duration.between(Instant.parse(springBlock.path("startsAt").asText()),
                Instant.parse(springBlock.path("endsAt").asText())).toHours());
        for (int days : new int[]{7, 42, 93}) {
            JsonNode fall = JSON.readTree(alice.call("GET", availabilityQuery(
                    LocalDate.of(2026, 10, 31), days, "America/New_York"), null, null).body());
            assertEquals(1, fall.path("blocks").size());
            assertBlock(fall.path("blocks").get(0), "2026-11-01T04:00:00Z",
                    "2026-11-02T05:00:00Z", "BUSY", "Fall");
        }
        assertEquals(0, JSON.readTree(alice.call("GET", availabilityQuery(
                LocalDate.of(2026, 11, 2), 1, "America/New_York"), null, null).body())
                .path("blocks").size());
        assertEquals(400, alice.call("GET", availabilityQuery(
                LocalDate.of(2026, 10, 31), 94, "America/New_York"), null, null).statusCode());
        JsonNode connection = JSON.readTree(alice.call("GET", "/connection", null, null).body());
        alice.write("POST", "/connection/end", "{\"expectedVersion\":\""
                + connection.path("connection").path("version").asText() + "\"}");
        JsonNode afterEnd = JSON.readTree(alice.call("GET", availabilityQuery(
                LocalDate.of(2026, 10, 31), 7, "America/New_York"), null, null).body());
        assertFalse(afterEnd.path("sharingEnabled").asBoolean());
        assertEquals(0, afterEnd.path("blocks").size());
    }

    private void connect(Browser inviter, Browser recipient) throws Exception {
        JsonNode invite = JSON.readTree(inviter.write("POST", "/connection-invites", null).body());
        assertEquals(200, recipient.write("POST", "/connection-invites/accept", "{\"token\":\""
                + invite.path("token").asText() + "\",\"expectedVersion\":\"0\"}").statusCode());
    }

    private String eventBody(String title, String status, String from, String to,
                             boolean shareTitle) {
        return "{\"title\":\"" + title + "\",\"allDay\":false,\"startsAt\":\"" + from
                + "\",\"endsAt\":\"" + to + "\",\"eventTimezone\":\"Asia/Shanghai\","
                + "\"availability\":\"" + status + "\",\"shareTitle\":" + shareTitle
                + ",\"location\":\"secret location\",\"note\":\"secret note\"}";
    }

    private String availabilityQuery(LocalDate from, int days, String zoneName) {
        ZoneId zone = ZoneId.of(zoneName);
        return "/availability?from=" + from.atStartOfDay(zone).toInstant()
                + "&to=" + from.plusDays(days).atStartOfDay(zone).toInstant()
                + "&timezone=" + zoneName;
    }

    private void assertBlock(JsonNode block, String from, String to, String status, String title) {
        assertEquals(from, block.path("startsAt").asText());
        assertEquals(to, block.path("endsAt").asText());
        assertEquals(status, block.path("status").asText());
        if (title == null) {
            assertTrue(block.path("title").isNull());
        } else {
            assertEquals(title, block.path("title").asText());
        }
        assertTrue(block.path("opaqueId").isTextual());
    }

    @Test
    void privateRemindersValidateOwnershipRevisionModesAndCancellation() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"private\"}").body());
        String cardId = card.path("id").asText();
        String put = """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2026-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(cardId);
        assertEquals(403, alice.call("PUT", "/reminders", put, null).statusCode());
        assertEquals(404, bob.write("PUT", "/reminders", put).statusCode());
        assertEquals(400, alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":1")).statusCode());
        assertEquals(400, alice.write("PUT", "/reminders",
                put.replace("2026-10-03T12:00:00Z", "2026-10-03T20:00:00+08:00")).statusCode());
        assertEquals(400, alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":null,\"ownerId\":\"1\""))
                .statusCode());
        assertEquals(400, alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":null,\"deliveryMode\":\"IN_APP_AND_MAIL\""))
                .statusCode());
        jdbc.update("UPDATE app_user SET notification_email = 'alice@example.com' WHERE username = 'alice'");
        assertEquals(409, alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":null,\"deliveryMode\":\"IN_APP_AND_MAIL\""))
                .statusCode());
        JsonNode first = JSON.readTree(alice.write("PUT", "/reminders", put).body());
        String reminderId = first.path("id").asText();
        assertEquals("1", first.path("revision").asText());
        assertEquals("0", first.path("version").asText());
        assertEquals(reminderId, JSON.readTree(alice.call("GET", "/memories/" + cardId,
                null, null).body()).path("myReminder").path("id").asText());
        assertEquals(404, bob.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"1\"}").statusCode());
        assertEquals(409, alice.write("PUT", "/reminders", put).statusCode());
        JsonNode second = JSON.readTree(alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":\"1\"")).body());
        assertEquals("2", second.path("revision").asText());
        JsonNode cancelled = JSON.readTree(alice.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"2\"}").body());
        assertEquals("CANCELLED", cancelled.path("status").asText());
        assertEquals("3", cancelled.path("revision").asText());
        assertEquals("3", JSON.readTree(alice.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"2\"}").body()).path("revision").asText());
        assertEquals(409, alice.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"1\"}").statusCode());
        JsonNode reset = JSON.readTree(alice.write("PUT", "/reminders",
                put.replace("\"expectedRevision\":null", "\"expectedRevision\":\"3\"")).body());
        assertEquals("4", reset.path("revision").asText());
        assertEquals(409, alice.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"3\"}").statusCode());
        assertEquals(1, JSON.readTree(alice.call("GET", "/reminders", null, null).body())
                .path("total").asInt());
        assertEquals(0, JSON.readTree(bob.call("GET", "/reminders", null, null).body())
                .path("total").asInt());
    }

    @Test
    void reminderListCountsFullSetAndResourceClosureCancelsPlans() throws Exception {
        Browser alice = new Browser();
        alice.login("alice", "A-user-test-password-21");
        long aliceId = users.findByUsername("alice").getId();
        for (int index = 0; index < 22; index++) {
            jdbc.update("INSERT INTO memory_card (owner_id, body, source_type) VALUES (?, ?, 'INTERPRETATION')",
                    aliceId, "remember " + index);
            long cardId = jdbc.queryForObject("SELECT MAX(id) FROM memory_card", Long.class);
            jdbc.update("""
                    INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at)
                    VALUES (?, 'MEMORY_CARD', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? DAY))
                    """, aliceId, cardId, index + 1);
        }
        JsonNode firstPage = JSON.readTree(alice.call("GET", "/reminders?size=9", null, null).body());
        assertEquals(22, firstPage.path("total").asInt());
        assertEquals(9, firstPage.path("items").size());
        assertTrue(firstPage.path("hasMore").asBoolean());
        assertEquals(22, JSON.readTree(alice.call("GET", "/reminders?status=ALL&size=1",
                null, null).body()).path("total").asInt());
        assertEquals(400, alice.call("GET", "/reminders?status=UNKNOWN", null, null).statusCode());

        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"closing\"}").body());
        String cardId = card.path("id").asText();
        JsonNode reminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2026-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(cardId)).body());
        long reminderId = Long.parseLong(reminder.path("id").asText());
        jdbc.update("""
                INSERT INTO notification (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', ?)
                """, aliceId, Long.parseLong(cardId), "test-card-closure-" + cardId);
        assertEquals(204, alice.write("DELETE", "/memories/" + cardId,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM reminder WHERE id = ?",
                String.class, reminderId));
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM notification WHERE resource_type = 'MEMORY_CARD'
                  AND resource_id = ? AND invalidated_at IS NOT NULL
                """, Long.class, Long.parseLong(cardId)));
        assertEquals(22, JSON.readTree(alice.call("GET", "/reminders", null, null).body())
                .path("total").asInt());
    }

    @Test
    void dueReminderScanIsDurableDeduplicatedAndSkipsClosedResources() throws Exception {
        Browser alice = new Browser();
        alice.login("alice", "A-user-test-password-21");
        long aliceId = users.findByUsername("alice").getId();
        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"never in notice\"}").body());
        String cardId = card.path("id").asText();
        JsonNode reminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2020-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(cardId)).body());
        long reminderId = Long.parseLong(reminder.path("id").asText());
        assertEquals(1, reminderScan.scanDue());
        assertEquals(0, reminderScan.scanDue());
        assertEquals("FIRED", jdbc.queryForObject("SELECT status FROM reminder WHERE id = ?",
                String.class, reminderId));
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE dedupe_key = ?",
                Long.class, "reminder:" + reminderId + ":1"));
        String message = jdbc.queryForObject("SELECT message FROM notification WHERE dedupe_key = ?",
                String.class, "reminder:" + reminderId + ":1");
        assertFalse(message.contains("never in notice"));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM notification_delivery", Long.class));

        JsonNode closedCard = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"closed\"}").body());
        String closedId = closedCard.path("id").asText();
        alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2020-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(closedId));
        alice.write("DELETE", "/memories/" + closedId, "{\"expectedVersion\":\"0\"}");
        assertEquals(0, reminderScan.scanDue());
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM reminder WHERE resource_type = 'MEMORY_CARD'
                  AND resource_id = ? AND status = 'CANCELLED'
                """, Long.class, Long.parseLong(closedId)));

        JsonNode legacyCard = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"legacy\"}").body());
        jdbc.update("""
                INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at,
                                      delivery_mode)
                VALUES (?, 'MEMORY_CARD', ?, DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND),
                        'IN_APP_AND_MAIL')
                """, aliceId, Long.parseLong(legacyCard.path("id").asText()));
        assertEquals(1, reminderScan.scanDue());
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM notification_delivery",
                String.class));
        assertEquals("MAIL_DISABLED", jdbc.queryForObject(
                "SELECT last_error_code FROM notification_delivery", String.class));
    }

    @Test
    void concurrentScansAndCancellationNeverDuplicateDueNotice() throws Exception {
        Browser alice = new Browser();
        alice.login("alice", "A-user-test-password-21");
        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"race\"}").body());
        JsonNode reminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2020-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(card.path("id").asText())).body());
        String reminderId = reminder.path("id").asText();
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var start = new java.util.concurrent.CountDownLatch(1);
            var first = pool.submit(() -> {
                start.await();
                return reminderScan.scanDue();
            });
            var second = pool.submit(() -> {
                start.await();
                return reminderScan.scanDue();
            });
            start.countDown();
            first.get();
            second.get();
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE dedupe_key = ?",
                Long.class, "reminder:" + reminderId + ":1"));
        assertEquals(0, reminderScan.scanDue());
        JsonNode cancelled = JSON.readTree(alice.write("DELETE", "/reminders/" + reminderId,
                "{\"expectedRevision\":\"1\"}").body());
        assertEquals("CANCELLED", cancelled.path("status").asText());
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE dedupe_key = ?",
                Long.class, "reminder:" + reminderId + ":1"));
    }

    @Test
    void notificationInboxCountsFullVisibleSetAndReadAllUsesCommittedSnapshot() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        long aliceId = users.findByUsername("alice").getId();
        long bobId = users.findByUsername("bob").getId();
        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"private inbox\"}").body());
        long cardId = Long.parseLong(card.path("id").asText());
        for (int index = 0; index < 25; index++) {
            jdbc.update("""
                    INSERT INTO notification
                      (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                    VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', ?)
                    """, aliceId, cardId, "notice-" + index);
        }
        long firstId = jdbc.queryForObject("SELECT MIN(id) FROM notification", Long.class);
        jdbc.update("""
                INSERT INTO notification
                  (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', 'other-user')
                """, bobId, cardId);
        jdbc.update("""
                INSERT INTO notification
                  (recipient_id, kind, resource_type, resource_id, message, dedupe_key,
                   invalidated_at)
                VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', 'invalidated',
                        UTC_TIMESTAMP(6))
                """, aliceId, cardId);
        JsonNode page = JSON.readTree(alice.call("GET", "/notifications?read=UNREAD&size=9",
                null, null).body());
        assertEquals(25, page.path("total").asInt());
        assertEquals(25, page.path("unreadCount").asInt());
        assertEquals(9, page.path("items").size());
        assertTrue(page.path("hasMore").asBoolean());
        String boundary = page.path("readBoundary").asText();
        assertEquals(0, JSON.readTree(bob.call("GET", "/notifications", null, null).body())
                .path("total").asInt());
        assertEquals(409, bob.write("POST", "/notifications/read-all",
                "{\"readBoundary\":\"" + boundary + "\"}").statusCode());
        assertEquals(404, bob.write("POST", "/notifications/" + firstId + "/read", "{}").statusCode());
        assertEquals(403, alice.call("POST", "/notifications/" + firstId + "/read", "{}",
                null).statusCode());
        JsonNode read = JSON.readTree(alice.write("POST", "/notifications/" + firstId + "/read",
                "{}").body());
        assertFalse(read.path("readAt").isNull());
        assertEquals(read.path("readAt").asText(),
                JSON.readTree(alice.write("POST", "/notifications/" + firstId + "/read",
                        "{}").body()).path("readAt").asText());

        jdbc.update("""
                INSERT INTO notification
                  (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', 'late-commit')
                """, aliceId, cardId);
        assertEquals(400, alice.write("POST", "/notifications/read-all",
                "{\"readBoundary\":123}").statusCode());
        assertEquals(409, alice.write("POST", "/notifications/read-all",
                "{\"readBoundary\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\"}").statusCode());
        JsonNode result = JSON.readTree(alice.write("POST", "/notifications/read-all",
                "{\"readBoundary\":\"" + boundary + "\"}").body());
        assertEquals(24, result.path("updatedCount").asInt());
        assertEquals(1, result.path("unreadCount").asInt());
        assertEquals(0, JSON.readTree(alice.write("POST", "/notifications/read-all",
                "{\"readBoundary\":\"" + boundary + "\"}").body())
                .path("updatedCount").asInt());
        assertEquals(1, JSON.readTree(alice.call("GET", "/notifications?read=UNREAD",
                null, null).body()).path("total").asInt());
        assertEquals(25, JSON.readTree(alice.call("GET", "/notifications?read=READ",
                null, null).body()).path("total").asInt());
        assertEquals(400, alice.call("GET", "/notifications?sort=INVALID", null, null).statusCode());
        assertEquals(204, alice.write("DELETE", "/memories/" + cardId,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(0, JSON.readTree(alice.call("GET", "/notifications", null, null).body())
                .path("unreadCount").asInt());
        assertEquals(404, alice.write("POST", "/notifications/" + firstId + "/read", "{}").statusCode());
    }

    @Test
    void dashboardShowsFullPendingReminderCountAndCurrentUnreadCountWithoutWriting() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        alice.login("alice", "A-user-test-password-21");
        bob.login("bob", "B-user-test-password-21");
        long aliceId = users.findByUsername("alice").getId();
        long bobId = users.findByUsername("bob").getId();
        long firstCardId = 0;
        for (int index = 0; index < 7; index++) {
            jdbc.update("INSERT INTO memory_card (owner_id, body, source_type) VALUES (?, ?, 'INTERPRETATION')",
                    aliceId, "dashboard reminder " + index);
            long cardId = jdbc.queryForObject("SELECT MAX(id) FROM memory_card", Long.class);
            if (index == 0) {
                firstCardId = cardId;
            }
            jdbc.update("""
                    INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at)
                    VALUES (?, 'MEMORY_CARD', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? HOUR))
                    """, aliceId, cardId, index + 1);
        }
        for (int index = 0; index < 2; index++) {
            jdbc.update("""
                    INSERT INTO notification
                      (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                    VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', ?)
                    """, aliceId, firstCardId, "dashboard-notice-" + index);
        }
        long firstNoticeId = jdbc.queryForObject("SELECT MIN(id) FROM notification", Long.class);
        jdbc.update("""
                INSERT INTO notification
                  (recipient_id, kind, resource_type, resource_id, message, dedupe_key)
                VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', 'bob-cannot-open')
                """, bobId, firstCardId);
        JsonNode dashboard = JSON.readTree(alice.call("GET", "/dashboard", null, null).body());
        JsonNode pending = dashboard.path("groups").path("reminders");
        assertEquals(7, pending.path("total").asInt());
        assertEquals(5, pending.path("items").size());
        assertTrue(pending.path("hasMore").asBoolean());
        assertEquals("MEMORY_CARD", pending.path("items").get(0).path("resourceType").asText());
        assertEquals(2, dashboard.path("unreadCount").asInt());
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE read_at IS NOT NULL",
                Long.class));
        assertEquals(3L, jdbc.queryForObject("SELECT COUNT(*) FROM notification", Long.class));
        assertEquals(0, JSON.readTree(bob.call("GET", "/dashboard", null, null).body())
                .path("groups").path("reminders").path("total").asInt());
        assertEquals(0, JSON.readTree(bob.call("GET", "/dashboard", null, null).body())
                .path("unreadCount").asInt());
        alice.write("POST", "/notifications/" + firstNoticeId + "/read", "{}");
        assertEquals(1, JSON.readTree(alice.call("GET", "/dashboard", null, null).body())
                .path("unreadCount").asInt());
    }

    @Test
    void eventDeletionAndCommitmentClosureCancelTheirOwnReminder() throws Exception {
        Browser alice = new Browser();
        alice.login("alice", "A-user-test-password-21");
        JsonNode event = JSON.readTree(alice.write("POST", "/events", """
                {"title":"Private event","allDay":false,"startsAt":"2026-10-04T10:00:00Z",
                 "endsAt":"2026-10-04T11:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"BUSY"}
                """).body());
        String eventId = event.path("id").asText();
        JsonNode eventReminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"CALENDAR_EVENT","resourceId":"%s",
                 "scheduledAt":"2020-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(eventId)).body());
        assertEquals(eventReminder.path("id").asText(), JSON.readTree(alice.call("GET",
                "/events/" + eventId, null, null).body()).path("myReminder").path("id").asText());
        assertEquals(204, alice.write("DELETE", "/events/" + eventId,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM reminder WHERE id = ?",
                String.class, Long.parseLong(eventReminder.path("id").asText())));
        assertEquals(0, reminderScan.scanDue());

        JsonNode commitment = JSON.readTree(alice.write("POST", "/commitments",
                "{\"title\":\"Private next step\"}").body());
        String commitmentId = commitment.path("id").asText();
        JsonNode commitmentReminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"COMMITMENT","resourceId":"%s",
                 "scheduledAt":"2026-10-04T09:00:00Z","expectedRevision":null}
                """.formatted(commitmentId)).body());
        assertEquals(commitmentReminder.path("id").asText(), JSON.readTree(alice.call("GET",
                "/commitments/" + commitmentId, null, null).body())
                .path("myReminder").path("id").asText());
        JsonNode done = JSON.readTree(alice.write("POST", "/commitments/" + commitmentId + "/complete",
                "{\"expectedVersion\":\"0\"}").body());
        assertEquals("CANCELLED", done.path("myReminder").path("status").asText());
        JsonNode reopened = JSON.readTree(alice.write("POST", "/commitments/" + commitmentId + "/reopen",
                "{\"expectedVersion\":\"1\"}").body());
        assertEquals("CANCELLED", reopened.path("myReminder").path("status").asText());
    }

    @Test
    void cancellationAndDueScanRaceLeavesAtMostOneNotice() throws Exception {
        Browser alice = new Browser();
        alice.login("alice", "A-user-test-password-21");
        JsonNode card = JSON.readTree(alice.write("POST", "/memories", "{\"body\":\"race cancel\"}").body());
        JsonNode reminder = JSON.readTree(alice.write("PUT", "/reminders", """
                {"resourceType":"MEMORY_CARD","resourceId":"%s",
                 "scheduledAt":"2020-10-03T12:00:00Z","expectedRevision":null}
                """.formatted(card.path("id").asText())).body());
        String reminderId = reminder.path("id").asText();
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var start = new java.util.concurrent.CountDownLatch(1);
            var scan = pool.submit(() -> {
                start.await();
                return reminderScan.scanDue();
            });
            var cancel = pool.submit(() -> {
                start.await();
                return alice.write("DELETE", "/reminders/" + reminderId,
                        "{\"expectedRevision\":\"1\"}");
            });
            start.countDown();
            scan.get();
            assertEquals(200, cancel.get().statusCode());
        } finally {
            pool.shutdownNow();
        }
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM reminder WHERE id = ?",
                String.class, Long.parseLong(reminderId)));
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE dedupe_key = ?",
                Long.class, "reminder:" + reminderId + ":1") <= 1);
        assertEquals(0, reminderScan.scanDue());
    }

    @Test
    void privateCommitmentCreationValidatesDeadlinesSourcesAndOwnership() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        assertEquals(403, alice.call("POST", "/commitments", "{\"title\":\"私密\"}",
                null).statusCode());
        JsonNode card = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"private source\"}").body());
        String cardId = card.path("id").asText();
        JsonNode created = JSON.readTree(alice.write("POST", "/commitments", """
                {"title":"为自己做一件事","body":"仅自己可读","nextAction":"先记录",
                 "dueKind":"DATE","dueDate":"2026-03-08","dueTimezone":"America/New_York",
                 "sourceType":"MEMORY_CARD","sourceId":"%s"}
                """.formatted(cardId)).body());
        String id = created.path("id").asText();
        assertTrue(created.path("id").isTextual());
        assertEquals("0", created.path("version").asText());
        assertEquals("OPEN", created.path("status").asText());
        assertTrue(created.path("sharedConnectionId").isNull());
        assertEquals("2026-03-09T04:00:00Z", created.path("deadlineAt").asText());
        assertTrue(created.path("sourceAvailable").asBoolean());
        assertTrue(created.path("myReminder").isNull());
        assertEquals(200, alice.call("GET", "/commitments/" + id, null, null).statusCode());
        assertEquals(404, bob.call("GET", "/commitments/" + id, null, null).statusCode());

        assertEquals(400, alice.write("POST", "/commitments",
                "{\"title\":\"x\",\"dueKind\":\"DATE\",\"dueDate\":\"2026-03-08\"}"
        ).statusCode());
        assertEquals(400, alice.write("POST", "/commitments",
                "{\"title\":\"x\",\"dueKind\":\"INSTANT\",\"dueAt\":\"2026-03-08T10:00:00+08:00\"}"
        ).statusCode());
        assertEquals(400, alice.write("POST", "/commitments",
                "{\"title\":\"x\",\"ownerId\":\"999\"}").statusCode());
        assertEquals(400, alice.write("POST", "/commitments",
                "{\"title\":\"x\",\"sourceType\":\"MEMORY_CARD\"}").statusCode());
        assertEquals(404, alice.write("POST", "/commitments",
                "{\"title\":\"x\",\"sourceType\":\"EXPRESSION\",\"sourceId\":\"1\"}"
        ).statusCode());
        assertEquals(404, bob.write("POST", "/commitments",
                "{\"title\":\"x\",\"sourceType\":\"MEMORY_CARD\",\"sourceId\":\""
                        + cardId + "\"}").statusCode());
        assertEquals(400, alice.call("GET", "/commitments/01", null, null).statusCode());

        assertEquals(204, alice.write("DELETE", "/memories/" + cardId,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertFalse(JSON.readTree(alice.call("GET", "/commitments/" + id, null, null).body())
                .path("sourceAvailable").asBoolean());

        JsonNode event = JSON.readTree(alice.write("POST", "/events", """
                {"title":"私密安排","allDay":false,"startsAt":"2026-10-03T09:00:00Z",
                 "endsAt":"2026-10-03T10:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"BUSY"}
                """).body());
        JsonNode fromEvent = JSON.readTree(alice.write("POST", "/commitments", """
                {"title":"来自安排","sourceType":"CALENDAR_EVENT","sourceId":"%s"}
                """.formatted(event.path("id").asText())).body());
        assertTrue(fromEvent.path("sourceAvailable").asBoolean());
        assertEquals("NONE", fromEvent.path("dueKind").asText());
        assertTrue(fromEvent.path("deadlineAt").isNull());
    }

    @Test
    void privateCommitmentMutationsEnforceVersionsAndCleanRelatedRows() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        JsonNode created = JSON.readTree(alice.write("POST", "/commitments",
                "{\"title\":\"original\",\"dueKind\":\"DATE\",\"dueDate\":\"2026-11-01\","
                        + "\"dueTimezone\":\"America/New_York\"}").body());
        String id = created.path("id").asText();
        long ownerId = Long.parseLong(created.path("ownerId").asText());
        assertEquals(404, bob.write("PATCH", "/commitments/" + id,
                "{\"expectedVersion\":\"0\",\"title\":\"stolen\"}").statusCode());
        assertEquals(404, bob.write("POST", "/commitments/" + id + "/complete",
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/commitments/" + id,
                "{\"expectedVersion\":\"0\",\"status\":\"DONE\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/commitments/" + id,
                "{\"expectedVersion\":0,\"title\":\"invalid\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/commitments/" + id,
                "{\"expectedVersion\":\"0\",\"dueAt\":\"2026-10-02T00:00:00Z\"}"
        ).statusCode());

        JsonNode patched = JSON.readTree(alice.write("PATCH", "/commitments/" + id, """
                {"expectedVersion":"0","title":"revised","dueKind":"INSTANT",
                 "dueAt":"2026-10-02T00:00:00Z","body":null}
                """).body());
        assertEquals("1", patched.path("version").asText());
        assertEquals("revised", patched.path("title").asText());
        assertTrue(patched.path("dueDate").isNull());
        assertEquals("2026-10-02T00:00:00Z", patched.path("deadlineAt").asText());
        assertEquals(409, alice.write("PATCH", "/commitments/" + id,
                "{\"expectedVersion\":\"0\",\"title\":\"stale\"}").statusCode());

        jdbc.update("""
                INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at)
                VALUES (?, 'COMMITMENT', ?, UTC_TIMESTAMP(6))
                """, ownerId, Long.parseLong(id));
        long reminderId = jdbc.queryForObject("SELECT MAX(id) FROM reminder", Long.class);
        jdbc.update("""
                INSERT INTO notification (recipient_id, kind, resource_type, resource_id,
                                          message, dedupe_key)
                VALUES (?, 'REMINDER_DUE', 'COMMITMENT', ?, '请查看提醒', ?)
                """, ownerId, Long.parseLong(id), "commitment-reminder-" + id);
        long reminderNotification = jdbc.queryForObject("SELECT MAX(id) FROM notification", Long.class);
        jdbc.update("""
                INSERT INTO notification_delivery
                  (notification_id, source_type, reminder_id, reminder_revision, recipient_id,
                   channel, to_address, status, lock_token, lease_until)
                VALUES (?, 'REMINDER_DUE', ?, 1, ?, 'MAIL', 'alice@example.com',
                        'PROCESSING', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                        DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 2 MINUTE))
                """, reminderNotification, reminderId, ownerId);
        jdbc.update("""
                INSERT INTO notification (recipient_id, kind, resource_type, resource_id,
                                          message, dedupe_key)
                VALUES (?, 'COMMITMENT_SHARED', 'COMMITMENT', ?, '请查看记录', ?)
                """, ownerId, Long.parseLong(id), "commitment-business-" + id);
        long businessNotification = jdbc.queryForObject("SELECT MAX(id) FROM notification", Long.class);
        jdbc.update("""
                INSERT INTO notification_delivery
                  (notification_id, source_type, recipient_id, channel, to_address, status)
                VALUES (?, 'BUSINESS', ?, 'MAIL', 'alice@example.com', 'QUEUED')
                """, businessNotification, ownerId);

        JsonNode done = JSON.readTree(alice.write("POST", "/commitments/" + id + "/complete",
                "{\"expectedVersion\":\"1\",\"result\":\"完成记录\"}").body());
        assertEquals("DONE", done.path("status").asText());
        assertEquals("完成记录", done.path("result").asText());
        assertFalse(done.path("isOverdue").asBoolean());
        assertEquals("CANCELLED", jdbc.queryForObject(
                "SELECT status FROM reminder WHERE id = ?", String.class, reminderId));
        assertEquals(2L, jdbc.queryForObject(
                "SELECT revision FROM reminder WHERE id = ?", Long.class, reminderId));
        assertEquals("CANCELLED", jdbc.queryForObject("""
                SELECT status FROM notification_delivery WHERE notification_id = ?
                """, String.class, reminderNotification));
        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM notification_delivery WHERE notification_id = ?
                  AND (lock_token IS NOT NULL OR lease_until IS NOT NULL)
                """, Long.class, reminderNotification));
        assertEquals("QUEUED", jdbc.queryForObject("""
                SELECT status FROM notification_delivery WHERE notification_id = ?
                """, String.class, businessNotification));

        JsonNode reopened = JSON.readTree(alice.write("POST", "/commitments/" + id + "/reopen",
                "{\"expectedVersion\":\"2\"}").body());
        assertEquals("OPEN", reopened.path("status").asText());
        assertTrue(reopened.path("result").isNull());
        assertEquals("CANCELLED", jdbc.queryForObject(
                "SELECT status FROM reminder WHERE id = ?", String.class, reminderId));
        JsonNode cancelled = JSON.readTree(alice.write("POST", "/commitments/" + id + "/cancel",
                "{\"expectedVersion\":\"3\"}").body());
        assertEquals("CANCELLED", cancelled.path("status").asText());
        assertEquals(409, alice.write("POST", "/commitments/" + id + "/complete",
                "{\"expectedVersion\":\"4\"}").statusCode());
        assertEquals(409, alice.write("DELETE", "/commitments/" + id,
                "{\"expectedVersion\":\"3\"}").statusCode());
        assertEquals(404, bob.write("DELETE", "/commitments/" + id,
                "{\"expectedVersion\":\"4\"}").statusCode());
        assertEquals(204, alice.write("DELETE", "/commitments/" + id,
                "{\"expectedVersion\":\"4\"}").statusCode());
        assertEquals(404, alice.call("GET", "/commitments/" + id, null, null).statusCode());
        assertEquals("CANCELLED", jdbc.queryForObject("""
                SELECT status FROM notification_delivery WHERE notification_id = ?
                """, String.class, businessNotification));
        assertEquals(2L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM notification WHERE resource_type = 'COMMITMENT'
                  AND resource_id = ? AND invalidated_at IS NOT NULL
                """, Long.class, Long.parseLong(id)));
    }

    @Test
    void commitmentListPaginatesCountsStatusesAndAbsoluteDeadlines() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        String dateId = JSON.readTree(alice.write("POST", "/commitments", """
                {"title":"date","dueKind":"DATE","dueDate":"2026-11-01",
                 "dueTimezone":"America/New_York"}
                """).body()).path("id").asText();
        String instantId = JSON.readTree(alice.write("POST", "/commitments", """
                {"title":"instant","dueKind":"INSTANT","dueAt":"2026-11-02T05:00:00Z"}
                """).body()).path("id").asText();
        String noDueId = JSON.readTree(alice.write("POST", "/commitments",
                "{\"title\":\"no due\",\"body\":\"private body\"}").body())
                .path("id").asText();
        for (int i = 0; i < 21; i++) {
            assertEquals(201, alice.write("POST", "/commitments",
                    "{\"title\":\"plain " + i + "\"}").statusCode());
        }
        assertEquals(201, bob.write("POST", "/commitments",
                "{\"title\":\"Bob private\"}").statusCode());

        JsonNode first = JSON.readTree(alice.call("GET", "/commitments", null, null).body());
        assertEquals(24, first.path("total").asInt());
        assertEquals(20, first.path("items").size());
        assertTrue(first.path("hasMore").asBoolean());
        assertEquals(dateId, first.path("items").get(0).path("id").asText());
        assertEquals(instantId, first.path("items").get(1).path("id").asText());
        assertEquals("2026-11-02T05:00:00Z", first.path("items").get(0)
                .path("deadlineAt").asText());
        assertTrue(first.path("items").get(0).path("version").isTextual());
        assertFalse(first.path("items").get(0).has("body"));
        assertFalse(first.path("items").get(0).has("result"));
        assertEquals(24, first.path("statusCounts").path("OPEN").asInt());
        JsonNode second = JSON.readTree(alice.call("GET", "/commitments?page=2", null, null).body());
        assertEquals(4, second.path("items").size());
        assertFalse(second.path("hasMore").asBoolean());
        assertEquals(24, second.path("total").asInt());
        JsonNode last = JSON.readTree(alice.call("GET", "/commitments?page=1&size=100",
                null, null).body());
        assertEquals(noDueId, last.path("items").get(2).path("id").asText());
        assertTrue(last.path("items").get(2).path("deadlineAt").isNull());

        assertEquals(404, bob.call("GET", "/commitments/" + dateId, null, null).statusCode());
        assertEquals(1, JSON.readTree(bob.call("GET", "/commitments?scope=ALL", null, null)
                .body()).path("total").asInt());
        assertEquals(0, JSON.readTree(alice.call("GET", "/commitments?scope=PARTNER", null,
                null).body()).path("total").asInt());
        assertEquals(400, alice.call("GET", "/commitments?status=INVALID", null, null).statusCode());
        assertEquals(400, alice.call("GET", "/commitments?size=101", null, null).statusCode());

        assertEquals("DONE", JSON.readTree(alice.write("POST", "/commitments/" + dateId
                + "/complete", "{\"expectedVersion\":\"0\"}").body()).path("status").asText());
        assertEquals("CANCELLED", JSON.readTree(alice.write("POST", "/commitments/"
                + instantId + "/cancel", "{\"expectedVersion\":\"0\"}").body())
                .path("status").asText());
        JsonNode open = JSON.readTree(alice.call("GET", "/commitments?status=OPEN", null,
                null).body());
        assertEquals(22, open.path("total").asInt());
        assertEquals(24, open.path("statusCounts").path("OPEN").asInt()
                + open.path("statusCounts").path("DONE").asInt()
                + open.path("statusCounts").path("CANCELLED").asInt());
        assertEquals(1, open.path("statusCounts").path("DONE").asInt());
        assertEquals(1, open.path("statusCounts").path("CANCELLED").asInt());
        assertEquals(22, JSON.readTree(alice.call("GET", "/me", null, null).body())
                .path("stats").path("openCommitmentCount").asInt());
        assertEquals(1, JSON.readTree(alice.call("GET", "/commitments?status=DONE", null,
                null).body()).path("total").asInt());
    }

    @Test
    void dashboardReadHelpersUsePersonalCalendarBoundsAndLatestVisibleMemory() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        long aliceId = users.findByUsername("alice").getId();
        long bobId = users.findByUsername("bob").getId();
        String firstCard = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"first private\",\"title\":\"first\",\"tags\":[\"own\"]}"
        ).body()).path("id").asText();
        String laterCard = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"later private\",\"title\":\"later\"}"
        ).body()).path("id").asText();
        assertEquals(laterCard, memories.latestOwnSummary(users.findByUsername("alice")).id());
        assertTrue(memories.latestOwnSummary(users.findByUsername("alice")).tags().isEmpty());
        assertEquals(201, bob.write("POST", "/memories",
                "{\"body\":\"Bob secret\"}").statusCode());
        assertTrue(memories.latestOwnSummary(users.findByUsername("bob")) != null);
        assertEquals(200, alice.write("POST", "/memories/" + laterCard + "/archive",
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(firstCard, memories.latestOwnSummary(users.findByUsername("alice")).id());
        assertEquals("own", memories.latestOwnSummary(users.findByUsername("alice"))
                .tags().getFirst());

        String springId = JSON.readTree(alice.write("POST", "/events", """
                {"title":"spring day","allDay":true,"startDate":"2026-03-08",
                 "endDateExclusive":"2026-03-09","eventTimezone":"America/New_York",
                 "availability":"BUSY"}
                """).body()).path("id").asText();
        String fallId = JSON.readTree(alice.write("POST", "/events", """
                {"title":"fall day","allDay":true,"startDate":"2026-11-01",
                 "endDateExclusive":"2026-11-02","eventTimezone":"America/New_York",
                 "availability":"BUSY"}
                """).body()).path("id").asText();
        String boundaryId = JSON.readTree(alice.write("POST", "/events", """
                {"title":"next day","allDay":false,"startsAt":"2026-03-09T04:00:00Z",
                 "endsAt":"2026-03-09T05:00:00Z","eventTimezone":"America/New_York",
                 "availability":"BUSY"}
                """).body()).path("id").asText();
        assertEquals(springId, calendar.personalDay(aliceId, LocalDate.parse("2026-03-08"),
                ZoneId.of("America/New_York")).getFirst().id());
        assertEquals(1, calendar.personalDay(aliceId, LocalDate.parse("2026-03-08"),
                ZoneId.of("America/New_York")).size());
        assertEquals(boundaryId, calendar.personalDay(aliceId, LocalDate.parse("2026-03-09"),
                ZoneId.of("America/New_York")).getFirst().id());
        assertEquals(fallId, calendar.personalDay(aliceId, LocalDate.parse("2026-11-01"),
                ZoneId.of("America/New_York")).getFirst().id());
        assertTrue(calendar.personalDay(bobId, LocalDate.parse("2026-03-08"),
                ZoneId.of("America/New_York")).isEmpty());
    }

    @Test
    void dashboardAggregatesOnlyOwnTodayItemsWithFullCountsAndNoSideEffects() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(401, alice.call("GET", "/dashboard", null, null).statusCode());
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        LocalDate today = LocalDate.now(zone);
        Instant start = today.atStartOfDay(zone).toInstant();
        Instant end = today.plusDays(1).atStartOfDay(zone).toInstant();
        String memoryId = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"private memory\",\"title\":\"featured\"}").body())
                .path("id").asText();
        assertEquals(201, bob.write("POST", "/memories",
                "{\"body\":\"Bob memory\"}").statusCode());
        String crossingId = JSON.readTree(alice.write("POST", "/events",
                timedEvent("crossing", start.minusSeconds(3600), start.plusSeconds(3600)))
                .body()).path("id").asText();
        assertEquals(201, alice.write("POST", "/events",
                timedEvent("ended at start", start.minusSeconds(3600), start)).statusCode());
        assertEquals(201, alice.write("POST", "/events",
                timedEvent("starts at end", end, end.plusSeconds(3600))).statusCode());
        for (int i = 0; i < 10; i++) {
            assertEquals(201, alice.write("POST", "/events",
                    timedEvent("event " + i, start.plusSeconds(7200 + i * 600),
                            start.plusSeconds(7500 + i * 600))).statusCode());
        }
        assertEquals(201, bob.write("POST", "/events",
                timedEvent("Bob secret", start.plusSeconds(1800), start.plusSeconds(3600)))
                .statusCode());
        String overdueId = JSON.readTree(alice.write("POST", "/commitments",
                "{\"title\":\"overdue\",\"dueKind\":\"INSTANT\",\"dueAt\":\""
                        + Instant.now().minusSeconds(3600) + "\"}").body()).path("id").asText();
        for (int i = 0; i < 6; i++) {
            assertEquals(201, alice.write("POST", "/commitments",
                    "{\"title\":\"today " + i + "\",\"dueKind\":\"DATE\",\"dueDate\":\""
                            + today + "\",\"dueTimezone\":\"Asia/Shanghai\"}").statusCode());
        }
        assertEquals(201, alice.write("POST", "/commitments",
                "{\"title\":\"future\",\"dueKind\":\"DATE\",\"dueDate\":\""
                        + today.plusDays(2) + "\",\"dueTimezone\":\"Asia/Shanghai\"}"
        ).statusCode());
        assertEquals(201, bob.write("POST", "/commitments",
                "{\"title\":\"Bob secret\",\"dueKind\":\"DATE\",\"dueDate\":\""
                        + today + "\",\"dueTimezone\":\"Asia/Shanghai\"}").statusCode());

        JsonNode dashboard = JSON.readTree(alice.call("GET", "/dashboard", null, null).body());
        assertEquals(today.toString(), dashboard.path("today").asText());
        assertEquals("Asia/Shanghai", dashboard.path("timezone").asText());
        assertTrue(dashboard.path("asOf").asText().endsWith("Z"));
        assertEquals(memoryId, dashboard.path("featuredMemory").path("id").asText());
        assertFalse(dashboard.path("featuredMemory").has("body"));
        JsonNode events = dashboard.path("groups").path("events");
        assertEquals(11, events.path("total").asInt());
        assertEquals(10, events.path("items").size());
        assertTrue(events.path("hasMore").asBoolean());
        assertEquals(crossingId, events.path("items").get(0).path("id").asText());
        JsonNode due = dashboard.path("groups").path("commitments");
        assertEquals(7, due.path("total").asInt());
        assertEquals(5, due.path("items").size());
        assertTrue(due.path("hasMore").asBoolean());
        assertEquals(overdueId, due.path("items").get(0).path("id").asText());
        assertTrue(due.path("items").get(0).path("isOverdue").asBoolean());
        assertFalse(due.path("items").get(0).has("body"));
        assertFalse(due.path("items").get(0).has("result"));
        for (String group : new String[]{"expressions", "invitations", "reminders"}) {
            assertEquals(0, dashboard.path("groups").path(group).path("total").asInt());
            assertEquals(0, dashboard.path("groups").path(group).path("items").size());
            assertFalse(dashboard.path("groups").path(group).path("hasMore").asBoolean());
        }
        assertEquals(0, dashboard.path("unreadCount").asInt());
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM notification", Long.class));
        JsonNode bobDashboard = JSON.readTree(bob.call("GET", "/dashboard", null, null).body());
        assertEquals(1, bobDashboard.path("groups").path("events").path("total").asInt());
        assertEquals(1, bobDashboard.path("groups").path("commitments").path("total").asInt());
        assertFalse(bobDashboard.path("featuredMemory").path("id").asText().equals(memoryId));
        assertEquals(200, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"timezone\":\"Pacific/Kiritimati\"}"
        ).statusCode());
        JsonNode shifted = JSON.readTree(alice.call("GET", "/dashboard", null, null).body());
        assertEquals("Pacific/Kiritimati", shifted.path("timezone").asText());
        assertEquals(LocalDate.ofInstant(Instant.parse(shifted.path("asOf").asText()),
                ZoneId.of("Pacific/Kiritimati")).toString(), shifted.path("today").asText());
    }

    private String timedEvent(String title, Instant startsAt, Instant endsAt) {
        return "{\"title\":\"" + title + "\",\"allDay\":false,\"startsAt\":\""
                + startsAt + "\",\"endsAt\":\"" + endsAt
                + "\",\"eventTimezone\":\"Asia/Shanghai\",\"availability\":\"BUSY\"}";
    }

    @Test
    void loginRequiresCsrfAndLogoutRemovesSessionAttributes() throws Exception {
        Browser alice = new Browser();
        assertEquals(401, alice.call("GET", "/me", null, null).statusCode());
        assertEquals(403, alice.call("POST", "/auth/login", credentials("alice", "A-user-test-password-21"),
                null).statusCode());
        JsonNode csrf = alice.csrf();
        HttpResponse<String> login = alice.call("POST", "/auth/login",
                credentials("alice", "A-user-test-password-21"), csrf);
        assertEquals(200, login.statusCode());
        assertEquals("alice", JSON.readTree(login.body()).path("username").asText());
        assertEquals(200, alice.call("GET", "/me", null, null).statusCode());
        assertEquals(403, alice.call("POST", "/auth/logout", "{}", csrf).statusCode());
        assertEquals(204, alice.call("POST", "/auth/logout", "{}", alice.csrf()).statusCode());
        assertEquals(401, alice.call("GET", "/me", null, null).statusCode());
        assertEquals(0L, orphanSessionAttributes());
    }

    @Test
    void expiryAndPasswordResetRemoveSessions() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION", Long.class) > 0);
        jdbc.update("UPDATE SPRING_SESSION SET EXPIRY_TIME = 0");
        sessions.cleanUpExpiredSessions();
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION", Long.class));
        assertEquals(0L, orphanSessionAttributes());

        Browser again = new Browser();
        assertEquals(200, again.login("alice", "A-user-test-password-21").statusCode());
        accounts.resetPassword("alice", "A-new-test-password-21");
        assertEquals(401, again.call("GET", "/me", null, null).statusCode());
        assertEquals(0L, orphanSessionAttributes());
        assertEquals(401, new Browser().login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, new Browser().login("alice", "A-new-test-password-21").statusCode());
    }

    @Test
    void profileUpdatesValidateFieldsVersionsAndConnectionState() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(403, alice.call("PATCH", "/me", "{\"expectedVersion\":\"0\",\"nickname\":\"A\"}",
                null).statusCode());
        assertEquals(400, alice.write("PATCH", "/me",
                "{\"expectedVersion\":0,\"nickname\":\"A\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"avatarStyle\":\"UNKNOWN\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"timezone\":\"No/Such_Zone\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"notificationEmail\":\"a@example.com,b@example.com\"}"
        ).statusCode());
        assertEquals(400, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"ownerId\":\"999\"}").statusCode());
        assertEquals(409, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"shareAvailability\":true}").statusCode());

        JsonNode changed = JSON.readTree(alice.write("PATCH", "/me", """
                {"expectedVersion":"0","nickname":"Alice New","avatarStyle":"FLOWER",
                 "timezone":"America/New_York","notificationEmail":"alice@example.com",
                 "shareAvailability":false}
                """).body());
        assertEquals("1", changed.path("version").asText());
        assertEquals("Alice New", changed.path("nickname").asText());
        assertEquals("FLOWER", changed.path("avatarStyle").asText());
        assertEquals("America/New_York", changed.path("timezone").asText());
        assertEquals("alice@example.com", changed.path("notificationEmail").asText());
        assertFalse(changed.path("mailReminderAvailable").asBoolean());
        assertEquals(409, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"nickname\":\"stale\"}").statusCode());
        assertEquals("Alice New", JSON.readTree(alice.call("GET", "/me", null, null).body())
                .path("nickname").asText());

        long aliceId = Long.parseLong(changed.path("id").asText());
        long bobId = jdbc.queryForObject("SELECT id FROM app_user WHERE username = 'bob'", Long.class);
        jdbc.update("INSERT INTO pair_connection (user_a_id, user_b_id) VALUES (?, ?)", aliceId, bobId);
        long connectionId = jdbc.queryForObject("SELECT MAX(id) FROM pair_connection", Long.class);
        jdbc.update("UPDATE app_user SET active_connection_id = ? WHERE id = ?", connectionId, aliceId);
        assertEquals(200, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"1\",\"shareAvailability\":true}").statusCode());
        assertTrue(JSON.readTree(alice.call("GET", "/me", null, null).body())
                .path("shareAvailability").asBoolean());
    }

    @Test
    void changingEmailCancelsOldAddressDeliveries() throws Exception {
        Browser alice = new Browser();
        JsonNode me = JSON.readTree(alice.login("alice", "A-user-test-password-21").body());
        long id = Long.parseLong(me.path("id").asText());
        assertEquals(200, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"notificationEmail\":\"old@example.com\"}"
        ).statusCode());
        jdbc.update("INSERT INTO memory_card (owner_id, body) VALUES (?, 'seed')", id);
        long cardId = jdbc.queryForObject("SELECT MAX(id) FROM memory_card", Long.class);
        for (int index = 0; index < 2; index++) {
            jdbc.update("""
                    INSERT INTO notification (recipient_id, kind, resource_type, resource_id,
                                              message, dedupe_key)
                    VALUES (?, 'REMINDER_DUE', 'MEMORY_CARD', ?, '请查看提醒', ?)
                    """, id, cardId, "email-change-" + index);
            long notificationId = jdbc.queryForObject("SELECT MAX(id) FROM notification", Long.class);
            jdbc.update("""
                    INSERT INTO notification_delivery
                      (notification_id, source_type, recipient_id, channel, to_address,
                       status, lock_token, lease_until)
                    VALUES (?, 'BUSINESS', ?, 'MAIL', 'old@example.com', ?, ?, ?)
                    """, notificationId, id, index == 0 ? "QUEUED" : "PROCESSING",
                    index == 0 ? null : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    index == 0 ? null : java.time.LocalDateTime.now().plusMinutes(2));
        }
        JsonNode updated = JSON.readTree(alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"1\",\"notificationEmail\":\"new@example.com\"}"
        ).body());
        assertEquals("new@example.com", updated.path("notificationEmail").asText());
        assertEquals(2L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM notification_delivery
                WHERE recipient_id = ? AND status = 'CANCELLED'
                  AND lock_token IS NULL AND lease_until IS NULL
                """, Long.class, id));
        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM notification_delivery
                WHERE recipient_id = ? AND status IN ('QUEUED', 'PROCESSING')
                """, Long.class, id));
    }

    @Test
    void passwordChangeRevokesCurrentAndOtherSessions() throws Exception {
        Browser alice = new Browser();
        Browser second = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, second.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        assertEquals(400, alice.write("POST", "/me/password", """
                {"oldPassword":"wrong","newPassword":"A-new-test-password-21"}
                """).statusCode());
        assertEquals(200, second.call("GET", "/me", null, null).statusCode());
        assertEquals(204, alice.write("POST", "/me/password", """
                {"oldPassword":"A-user-test-password-21","newPassword":"A-new-test-password-21"}
                """).statusCode());
        assertEquals(401, alice.call("GET", "/me", null, null).statusCode());
        assertEquals(401, second.call("GET", "/me", null, null).statusCode());
        assertEquals(200, bob.call("GET", "/me", null, null).statusCode());
        assertEquals(0L, orphanSessionAttributes());
        assertEquals(401, new Browser().login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, new Browser().login("alice", "A-new-test-password-21").statusCode());
    }

    @Test
    void personalEventsAreOwnedVersionedAndUseExclusiveTimeStructures() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        JsonNode me = JSON.readTree(alice.login("alice", "A-user-test-password-21").body());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"x","allDay":false,"startsAt":"2026-09-29T09:00:00Z",
                 "endsAt":"2026-09-29T10:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"BUSY","ownerId":"999"}
                """).statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"x","allDay":false,"startsAt":"2026-09-29T09:00:00Z",
                 "endsAt":"2026-09-29T10:00:00Z","startDate":"2026-09-29",
                 "eventTimezone":"Asia/Shanghai","availability":"BUSY"}
                """).statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"x","allDay":false,"startsAt":"2026-09-29T10:00:00Z",
                 "endsAt":"2026-09-29T09:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"BUSY"}
                """).statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"x","allDay":false,"startsAt":"2026-09-29T09:00:00+00:00",
                 "endsAt":"2026-09-29T10:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"BUSY"}
                """).statusCode());

        JsonNode created = JSON.readTree(alice.write("POST", "/events", """
                {"title":"Private event","allDay":false,"startsAt":"2026-09-29T09:00:00Z",
                 "endsAt":"2026-09-29T10:00:00Z","eventTimezone":"Asia/Shanghai",
                 "availability":"NEGOTIABLE","location":"Home","note":"Only Alice knows",
                 "shareTitle":true}
                """).body());
        String id = created.path("id").asText();
        assertTrue(created.path("id").isTextual());
        assertEquals("0", created.path("version").asText());
        assertEquals("PERSONAL", created.path("kind").asText());
        assertEquals(me.path("id").asText(), created.path("ownerId").asText());
        assertTrue(created.path("connectionId").isNull());
        assertTrue(created.path("myReminder").isNull());
        assertTrue(created.path("myNotificationSetting").isNull());
        assertEquals(404, bob.call("GET", "/events/" + id, null, null).statusCode());
        assertEquals(404, bob.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"title\":\"Stolen\"}").statusCode());
        assertEquals(404, bob.write("DELETE", "/events/" + id,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":0,\"title\":\"Invalid\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"status\":\"CANCELLED\"}").statusCode());
        JsonNode edited = JSON.readTree(alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"title\":\"Changed\",\"location\":null}"
        ).body());
        assertEquals("1", edited.path("version").asText());
        assertEquals("Changed", edited.path("title").asText());
        assertTrue(edited.path("location").isNull());
        assertEquals(409, alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"title\":\"Old\"}").statusCode());
        assertEquals(409, alice.write("DELETE", "/events/" + id,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(204, alice.write("DELETE", "/events/" + id,
                "{\"expectedVersion\":\"1\"}").statusCode());
        assertEquals(404, alice.call("GET", "/events/" + id, null, null).statusCode());
    }

    @Test
    void allDayEventKeepsItsTimezoneAndOfflineConfirmationHistory() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"Skipped day","allDay":true,"startDate":"2011-12-30",
                 "endDateExclusive":"2011-12-31","eventTimezone":"Pacific/Apia",
                 "availability":"BUSY"}
                """).statusCode());
        assertEquals(400, alice.write("POST", "/events", """
                {"title":"Wrong flag","allDay":true,"startDate":"2026-03-08",
                 "endDateExclusive":"2026-03-09","eventTimezone":"America/New_York",
                 "availability":"BUSY","offline":true}
                """).statusCode());
        JsonNode created = JSON.readTree(alice.write("POST", "/events", """
                {"title":"DST day","allDay":true,"startDate":"2026-03-08",
                 "endDateExclusive":"2026-03-09","eventTimezone":"America/New_York",
                 "availability":"BUSY","offlineConfirmed":true}
                """).body());
        String id = created.path("id").asText();
        assertTrue(created.path("allDay").asBoolean());
        assertTrue(created.path("startsAt").isNull());
        assertEquals("2026-03-08", created.path("startDate").asText());
        String confirmedAt = created.path("offlineConfirmedAt").asText();
        assertTrue(confirmedAt.endsWith("Z"));
        assertEquals(400, alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"offlineConfirmedAt\":\"2026-03-01T00:00:00Z\"}"
        ).statusCode());
        JsonNode kept = JSON.readTree(alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"0\",\"offlineConfirmed\":true}"
        ).body());
        assertEquals(confirmedAt, kept.path("offlineConfirmedAt").asText());
        JsonNode cleared = JSON.readTree(alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"1\",\"offlineConfirmed\":false}"
        ).body());
        assertTrue(cleared.path("offlineConfirmedAt").isNull());
        JsonNode explicit = JSON.readTree(alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"2\",\"offlineConfirmed\":true,"
                        + "\"offlineConfirmedAt\":\"2026-03-01T00:00:00Z\"}"
        ).body());
        assertEquals("2026-03-01T00:00:00Z", explicit.path("offlineConfirmedAt").asText());
        assertEquals(200, alice.write("PATCH", "/me",
                "{\"expectedVersion\":\"0\",\"timezone\":\"Europe/London\"}"
        ).statusCode());
        JsonNode persisted = JSON.readTree(alice.call("GET", "/events/" + id, null, null).body());
        assertEquals("America/New_York", persisted.path("eventTimezone").asText());
        assertEquals("2026-03-08", persisted.path("startDate").asText());
        assertEquals(400, alice.write("PATCH", "/events/" + id,
                "{\"expectedVersion\":\"3\",\"eventTimezone\":\"Europe/London\"}"
        ).statusCode());
        JsonNode switched = JSON.readTree(alice.write("PATCH", "/events/" + id, """
                {"expectedVersion":"3","allDay":false,"startsAt":"2026-03-08T10:00:00Z",
                 "endsAt":"2026-03-08T11:00:00Z","eventTimezone":"Europe/London"}
                """).body());
        assertFalse(switched.path("allDay").asBoolean());
        assertTrue(switched.path("startDate").isNull());
        assertEquals("Europe/London", switched.path("eventTimezone").asText());
    }

    @Test
    void calendarRangeUsesHalfOpenBoundariesAndNeverListsAnotherUsersEvents() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());
        createTimed(alice, "ends at start", "2026-09-28T15:00:00Z", "2026-09-28T16:00:00Z");
        String first = createTimed(alice, "starts at start", "2026-09-28T16:00:00Z",
                "2026-09-28T17:00:00Z");
        String last = createTimed(alice, "overlaps end", "2026-09-29T15:00:00Z",
                "2026-09-29T17:00:00Z");
        createTimed(alice, "starts at end", "2026-09-29T16:00:00Z",
                "2026-09-29T17:00:00Z");
        String shanghai = createAllDay(alice, "Shanghai day", "2026-09-29",
                "2026-09-30", "Asia/Shanghai");
        String kiritimati = createAllDay(alice, "Other zone day", "2026-09-30",
                "2026-10-01", "Pacific/Kiritimati");
        createAllDay(alice, "Outside exact range", "2026-09-30",
                "2026-10-01", "Asia/Shanghai");

        String path = "/calendar?from=2026-09-28T16:00:00Z&to=2026-09-29T16:00:00Z"
                + "&timezone=Asia/Shanghai";
        JsonNode view = JSON.readTree(alice.call("GET", path, null, null).body());
        assertEquals("2026-09-28T16:00:00Z", view.path("from").asText());
        assertEquals("2026-09-29T16:00:00Z", view.path("to").asText());
        assertEquals("Asia/Shanghai", view.path("timezone").asText());
        assertTrue(view.path("asOf").asText().endsWith("Z"));
        assertEquals(4, view.path("items").size());
        assertEquals(first, view.path("items").get(0).path("id").asText());
        assertEquals(shanghai, view.path("items").get(1).path("id").asText());
        assertEquals(kiritimati, view.path("items").get(2).path("id").asText());
        assertEquals(last, view.path("items").get(3).path("id").asText());
        assertEquals(4, JSON.readTree(alice.call("GET", path + "&scope=MINE", null, null).body())
                .path("items").size());
        assertEquals(4, JSON.readTree(alice.call("GET", path + "&includeCancelled=true", null, null)
                .body()).path("items").size());
        assertEquals(0, JSON.readTree(alice.call("GET", path + "&scope=SHARED", null, null).body())
                .path("items").size());
        assertEquals(0, JSON.readTree(bob.call("GET", path, null, null).body())
                .path("items").size());
        assertEquals(400, alice.call("GET", path + "&scope=PARTNER", null, null).statusCode());
        assertEquals(400, alice.call("GET", "/calendar?from=2026-09-28T16:00:01Z"
                + "&to=2026-09-29T16:00:00Z&timezone=Asia/Shanghai", null, null).statusCode());
        assertEquals(400, alice.call("GET", path.replace("Asia/Shanghai", "Invalid/Zone"),
                null, null).statusCode());
        assertEquals(400, alice.call("GET", "/calendar?from=%2B1000000000-12-30T00:00:00Z"
                + "&to=%2B1000000000-12-31T00:00:00Z&timezone=UTC", null, null).statusCode());
    }

    @Test
    void calendarRangeCountsLocalDaysAcrossDaylightSavingChanges() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        createAllDay(alice, "Spring transition", "2026-03-08", "2026-03-09",
                "America/New_York");
        createAllDay(alice, "Autumn transition", "2026-11-01", "2026-11-02",
                "America/New_York");
        JsonNode spring = JSON.readTree(alice.call("GET", """
                /calendar?from=2026-03-08T05:00:00Z&to=2026-03-09T04:00:00Z&timezone=America/New_York
                """.trim(), null, null).body());
        assertEquals(1, spring.path("items").size());
        assertEquals("Spring transition", spring.path("items").get(0).path("title").asText());
        JsonNode autumn = JSON.readTree(alice.call("GET", """
                /calendar?from=2026-11-01T04:00:00Z&to=2026-11-02T05:00:00Z&timezone=America/New_York
                """.trim(), null, null).body());
        assertEquals(1, autumn.path("items").size());
        assertEquals("Autumn transition", autumn.path("items").get(0).path("title").asText());
        ZoneId zone = ZoneId.of("America/New_York");
        for (int days : new int[]{7, 42, 93}) {
            assertEquals(200, alice.call("GET", calendarPath(LocalDate.of(2026, 3, 7), days, zone),
                    null, null).statusCode());
        }
        assertEquals(400, alice.call("GET", calendarPath(LocalDate.of(2026, 3, 7), 94, zone),
                null, null).statusCode());
        assertEquals(400, alice.call("GET", calendarPath(LocalDate.of(2026, 3, 7), 0, zone),
                null, null).statusCode());
        createAllDay(alice, "Final supported year", "9999-12-30", "9999-12-31",
                "Asia/Shanghai");
        JsonNode upperBound = JSON.readTree(alice.call("GET", calendarPath(
                LocalDate.of(9999, 12, 30), 1, ZoneId.of("Asia/Shanghai")), null, null).body());
        assertEquals(1, upperBound.path("items").size());
        assertEquals("Final supported year", upperBound.path("items").get(0).path("title").asText());
    }

    private String createTimed(Browser browser, String title, String start, String end) throws Exception {
        String body = "{\"title\":\"" + title + "\",\"allDay\":false,\"startsAt\":\"" + start
                + "\",\"endsAt\":\"" + end + "\",\"eventTimezone\":\"Asia/Shanghai\","
                + "\"availability\":\"BUSY\",\"note\":\"private\"}";
        HttpResponse<String> response = browser.write("POST", "/events", body);
        assertEquals(201, response.statusCode());
        return JSON.readTree(response.body()).path("id").asText();
    }

    private String createAllDay(Browser browser, String title, String startDate,
                                String endDateExclusive, String timezone) throws Exception {
        String body = "{\"title\":\"" + title + "\",\"allDay\":true,\"startDate\":\""
                + startDate + "\",\"endDateExclusive\":\"" + endDateExclusive
                + "\",\"eventTimezone\":\"" + timezone + "\",\"availability\":\"BUSY\"}";
        HttpResponse<String> response = browser.write("POST", "/events", body);
        assertEquals(201, response.statusCode());
        return JSON.readTree(response.body()).path("id").asText();
    }

    private String calendarPath(LocalDate first, int days, ZoneId zone) {
        return "/calendar?from=" + first.atStartOfDay(zone).toInstant()
                + "&to=" + first.plusDays(days).atStartOfDay(zone).toInstant()
                + "&timezone=" + zone.getId();
    }

    @Test
    void privateCardsNeverLeakAcrossAccounts() throws Exception {
        Browser alice = new Browser();
        Browser bob = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        assertEquals(200, bob.login("bob", "B-user-test-password-21").statusCode());

        JsonNode created = JSON.readTree(alice.write("POST", "/memories", """
                {"body":"Alice's private memory","title":"Private","category":"INTEREST",
                 "tags":["hidden","personal"],"sourceType":"OBSERVED","sourceDate":"2026-09-27"}
                """).body());
        String id = created.path("id").asText();
        assertTrue(created.path("id").isTextual());
        assertTrue(created.path("version").isTextual());
        assertTrue(created.path("ownerId").isTextual());
        assertEquals("OBSERVED", created.path("sourceType").asText());
        assertEquals(200, alice.call("GET", "/memories/" + id, null, null).statusCode());

        assertEquals(404, bob.call("GET", "/memories/" + id, null, null).statusCode());
        JsonNode bobList = JSON.readTree(bob.call("GET", "/memories?keyword=Alice", null, null).body());
        assertEquals(0, bobList.path("total").asInt());
        assertEquals(0, bobList.path("availableTags").size());
        assertEquals(404, bob.write("PATCH", "/memories/" + id,
                "{\"expectedVersion\":\"0\",\"body\":\"stolen\"}").statusCode());
        assertEquals(404, bob.write("POST", "/memories/" + id + "/archive",
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals(404, bob.write("DELETE", "/memories/" + id,
                "{\"expectedVersion\":\"0\"}").statusCode());
        assertEquals("Alice's private memory",
                JSON.readTree(alice.call("GET", "/memories/" + id, null, null).body())
                        .path("body").asText());

        assertEquals(400, alice.write("POST", "/memories",
                "{\"body\":\"x\",\"ownerId\":\"2\"}").statusCode());
        assertEquals(400, alice.write("POST", "/memories",
                "{\"body\":\"  \",\"sourceType\":\"EXPLICIT\"}").statusCode());
        assertEquals(400, alice.write("POST", "/memories",
                "{\"body\":\"x\",\"sourceType\":\"made-up\"}").statusCode());
    }

    @Test
    void paginationSearchAndTagCountsUseTheFullAuthorizedSet() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        for (int i = 0; i < 23; i++) {
            String body = "{\"body\":\"entry " + i + "\",\"title\":\"Page " + i
                    + "\",\"category\":\"" + (i % 2 == 0 ? "INTEREST" : "BOUNDARY")
                    + "\",\"tags\":[\"all\",\"" + (i % 2 == 0 ? "even" : "odd") + "\"]}";
            assertEquals(201, alice.write("POST", "/memories", body).statusCode());
        }
        JsonNode first = JSON.readTree(alice.call("GET", "/memories", null, null).body());
        assertEquals(23, first.path("total").asInt());
        assertEquals(20, first.path("items").size());
        assertTrue(first.path("hasMore").asBoolean());
        assertEquals(23, countTag(first, "all"));
        assertEquals(12, countTag(first, "even"));
        assertEquals(11, countTag(first, "odd"));
        assertFalse(first.path("items").get(0).has("body"));
        assertTrue(first.path("items").get(0).path("id").isTextual());

        JsonNode second = JSON.readTree(alice.call("GET", "/memories?page=2", null, null).body());
        assertEquals(3, second.path("items").size());
        assertEquals(23, second.path("total").asInt());
        assertFalse(second.path("hasMore").asBoolean());

        JsonNode even = JSON.readTree(alice.call("GET", "/memories?tag=even&size=9", null, null).body());
        assertEquals(12, even.path("total").asInt());
        assertEquals(9, even.path("items").size());
        assertTrue(even.path("hasMore").asBoolean());
        assertEquals(23, countTag(even, "all"));
        assertEquals(11, countTag(even, "odd"));

        JsonNode search = JSON.readTree(alice.call("GET", "/memories?keyword=entry%2021", null, null).body());
        assertEquals(1, search.path("total").asInt());
        assertEquals("Page 21", search.path("items").get(0).path("title").asText());
        assertEquals(1, countTag(search, "odd"));
        JsonNode category = JSON.readTree(alice.call("GET", "/memories?category=INTEREST", null, null).body());
        assertEquals(12, category.path("total").asInt());
        assertEquals(12, countTag(category, "all"));
        assertEquals(0, countTag(category, "odd"));
        assertEquals(0, JSON.readTree(alice.call("GET", "/memories?keyword=%25", null, null)
                .body()).path("total").asInt());
        assertEquals(400, alice.call("GET", "/memories?size=101", null, null).statusCode());
        assertEquals(400, alice.call("GET", "/memories?archived=true", null, null).statusCode());
        assertEquals(0, JSON.readTree(alice.call("GET", "/memories?scope=PARTNER", null, null)
                .body()).path("total").asInt());
    }

    @Test
    void archiveRestoreDeleteAndVersionsFollowContract() throws Exception {
        Browser alice = new Browser();
        assertEquals(200, alice.login("alice", "A-user-test-password-21").statusCode());
        JsonNode created = JSON.readTree(alice.write("POST", "/memories",
                "{\"body\":\"original\",\"tags\":[\"old\"]}").body());
        String id = created.path("id").asText();
        assertEquals("INTERPRETATION", created.path("sourceType").asText());
        assertEquals("0", created.path("version").asText());
        JsonNode edited = JSON.readTree(alice.write("PATCH", "/memories/" + id,
                "{\"expectedVersion\":\"0\",\"body\":\"edited\",\"tags\":[\"new\"]}").body());
        assertEquals("1", edited.path("version").asText());
        assertEquals("edited", edited.path("body").asText());
        assertEquals("new", edited.path("tags").get(0).asText());
        assertEquals(409, alice.write("PATCH", "/memories/" + id,
                "{\"expectedVersion\":\"0\",\"body\":\"stale\"}").statusCode());
        assertEquals(400, alice.write("PATCH", "/memories/" + id,
                "{\"expectedVersion\":\"1\",\"archived\":true}").statusCode());
        assertEquals(400, alice.write("PATCH", "/memories/" + id,
                "{\"expectedVersion\":1,\"body\":\"invalid version type\"}").statusCode());

        JsonNode archived = JSON.readTree(alice.write("POST", "/memories/" + id + "/archive",
                "{\"expectedVersion\":\"1\"}").body());
        assertEquals("2", archived.path("version").asText());
        assertTrue(archived.path("archived").asBoolean());
        assertEquals(0, JSON.readTree(alice.call("GET", "/memories", null, null).body())
                .path("total").asInt());
        assertEquals(1, JSON.readTree(alice.call("GET", "/memories?scope=MINE&archived=true", null, null)
                .body()).path("total").asInt());
        assertEquals(1, JSON.readTree(alice.call("GET", "/me", null, null).body())
                .path("stats").path("archivedMemoryCount").asInt());
        assertEquals(409, alice.write("POST", "/memories/" + id + "/restore",
                "{\"expectedVersion\":\"1\"}").statusCode());

        JsonNode restored = JSON.readTree(alice.write("POST", "/memories/" + id + "/restore",
                "{\"expectedVersion\":\"2\"}").body());
        assertEquals("3", restored.path("version").asText());
        assertFalse(restored.path("archived").asBoolean());
        assertEquals(409, alice.write("DELETE", "/memories/" + id,
                "{\"expectedVersion\":\"2\"}").statusCode());
        assertEquals(204, alice.write("DELETE", "/memories/" + id,
                "{\"expectedVersion\":\"3\"}").statusCode());
        assertEquals(404, alice.call("GET", "/memories/" + id, null, null).statusCode());
        assertEquals(0, JSON.readTree(alice.call("GET", "/memories", null, null).body())
                .path("total").asInt());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM memory_tag WHERE card_id = ?",
                Long.class, Long.parseLong(id)));
    }

    private long countTag(JsonNode list, String tag) {
        for (JsonNode row : list.path("availableTags")) {
            if (tag.equals(row.path("tag").asText())) {
                return row.path("count").asLong();
            }
        }
        return 0;
    }

    private long orphanSessionAttributes() {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM SPRING_SESSION_ATTRIBUTES AS a
                LEFT JOIN SPRING_SESSION AS s ON s.PRIMARY_ID = a.SESSION_PRIMARY_ID
                WHERE s.PRIMARY_ID IS NULL
                """, Long.class);
    }

    private String credentials(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    private class Browser {
        private final HttpClient http = HttpClient.newBuilder()
                .cookieHandler(new CookieManager())
                .build();

        JsonNode csrf() throws Exception {
            HttpResponse<String> response = call("GET", "/auth/csrf", null, null);
            assertEquals(200, response.statusCode());
            return JSON.readTree(response.body());
        }

        HttpResponse<String> login(String username, String password) throws Exception {
            return call("POST", "/auth/login", credentials(username, password), csrf());
        }

        HttpResponse<String> write(String method, String path, String body) throws Exception {
            return call(method, path, body, csrf());
        }

        HttpResponse<String> call(String method, String path, String body, JsonNode csrf) throws Exception {
            HttpRequest.Builder request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/api/v1" + path));
            if (csrf != null) {
                request.header(csrf.path("headerName").asText(), csrf.path("token").asText());
            }
            if (body == null) {
                request.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                request.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            }
            return http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        }
    }
}

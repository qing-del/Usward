package com.jacolp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jacolp.service.AccountService;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired AccountService accounts;
    @Autowired JdbcIndexedSessionRepository sessions;
    @Value("${local.server.port}") int port;

    @BeforeEach
    void freshAccounts() {
        jdbc.update("DELETE FROM notification_delivery");
        jdbc.update("DELETE FROM notification");
        jdbc.update("DELETE FROM calendar_event");
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

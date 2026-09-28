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

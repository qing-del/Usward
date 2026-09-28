package com.jacolp.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.config.SessionRepositoryCustomizer;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

@Configuration
public class SessionSqlConfig {
    @Bean
    SessionRepositoryCustomizer<JdbcIndexedSessionRepository> sessionDeleteQueries() {
        return repository -> {
            // The schema intentionally has no cascading FK. A single InnoDB statement
            // removes the session and its attributes atomically for logout and expiry.
            repository.setDeleteSessionQuery("""
                    DELETE s, a FROM %TABLE_NAME% AS s
                    LEFT JOIN %TABLE_NAME%_ATTRIBUTES AS a ON a.SESSION_PRIMARY_ID = s.PRIMARY_ID
                    WHERE s.SESSION_ID = ? AND s.MAX_INACTIVE_INTERVAL >= 0
                    """);
            repository.setDeleteSessionsByExpiryTimeQuery("""
                    DELETE s, a FROM %TABLE_NAME% AS s
                    LEFT JOIN %TABLE_NAME%_ATTRIBUTES AS a ON a.SESSION_PRIMARY_ID = s.PRIMARY_ID
                    WHERE s.EXPIRY_TIME < ?
                    """);
        };
    }
}

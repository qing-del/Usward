package com.jacolp.config;

import com.jacolp.service.AccountService;
import java.io.Console;
import java.util.Arrays;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class AccountAdminCommand implements ApplicationRunner {
    private final AccountService accounts;

    public AccountAdminCommand(AccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        String command = option(arguments, "usward.admin.command");
        if (command == null) {
            return;
        }
        Console console = System.console();
        if (console == null) {
            throw new IllegalStateException("Account maintenance requires an interactive terminal");
        }
        String username = option(arguments, "usward.admin.username");
        char[] password = console.readPassword("New password: ");
        char[] confirmation = console.readPassword("Repeat password: ");
        if (password == null || confirmation == null) {
            throw new IllegalStateException("Password input cancelled");
        }
        try {
            if (!Arrays.equals(password, confirmation)) {
                throw new IllegalArgumentException("Passwords do not match");
            }
            switch (command) {
                case "create-user" -> accounts.createUser(username,
                        option(arguments, "usward.admin.nickname"),
                        optionOrDefault(arguments, "usward.admin.timezone", "Asia/Shanghai"),
                        new String(password));
                case "reset-password" -> accounts.resetPassword(username, new String(password));
                default -> throw new IllegalArgumentException("Unknown account maintenance command");
            }
            console.printf("Account command completed.\n");
        } finally {
            Arrays.fill(password, '\0');
            Arrays.fill(confirmation, '\0');
        }
    }

    private String option(ApplicationArguments arguments, String name) {
        var values = arguments.getOptionValues(name);
        return values == null || values.isEmpty() ? null : values.getFirst();
    }

    private String optionOrDefault(ApplicationArguments arguments, String name, String fallback) {
        String value = option(arguments, name);
        return value == null ? fallback : value;
    }
}

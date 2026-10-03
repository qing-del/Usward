package com.jacolp.config;

import com.jacolp.service.ReminderScanService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "usward.reminder.scan-enabled", havingValue = "true",
        matchIfMissing = true)
public class ReminderSchedule {
    private final ReminderScanService scan;

    public ReminderSchedule(ReminderScanService scan) {
        this.scan = scan;
    }

    @Scheduled(initialDelay = 0, fixedDelay = 60_000)
    public void scan() {
        this.scan.scanDue();
    }
}

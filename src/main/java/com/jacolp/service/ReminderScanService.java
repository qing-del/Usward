package com.jacolp.service;

import com.jacolp.mapper.ReminderMapper;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReminderScanService {
    private static final Logger LOG = LoggerFactory.getLogger(ReminderScanService.class);
    private final ReminderMapper reminders;
    private final ReminderDispatchService dispatcher;

    public ReminderScanService(ReminderMapper reminders, ReminderDispatchService dispatcher) {
        this.reminders = reminders;
        this.dispatcher = dispatcher;
    }

    public int scanDue() {
        int processed = 0;
        while (true) {
            List<Long> due = reminders.dueIds();
            if (due.isEmpty()) {
                return processed;
            }
            int changed = 0;
            for (long id : due) {
                try {
                    if (dispatcher.dispatch(id)) {
                        changed++;
                    }
                } catch (RuntimeException exception) {
                    LOG.warn("Reminder dispatch failed for id {}: {}", id,
                            exception.getClass().getSimpleName());
                }
            }
            processed += changed;
            if (changed == 0) {
                return processed;
            }
        }
    }
}

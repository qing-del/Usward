package com.jacolp.controller;

import com.jacolp.dto.DashboardDtos;
import com.jacolp.service.DashboardService;
import java.security.Principal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping
    public DashboardDtos.Dashboard get(Principal principal) {
        return dashboard.get(principal.getName());
    }
}

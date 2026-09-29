package com.jacolp.controller;

import com.jacolp.common.ApiException;
import com.jacolp.dto.CsrfResponse;
import com.jacolp.dto.LoginRequest;
import com.jacolp.dto.MeResponse;
import com.jacolp.dto.PasswordChangeRequest;
import com.jacolp.dto.ProfileWriteRequest;
import com.jacolp.service.AccountService;
import com.jacolp.service.LoginAttemptLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/v1")
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contexts;
    private final CsrfTokenRepository csrfTokens;
    private final AccountService accounts;
    private final LoginAttemptLimiter attempts;

    public AuthController(AuthenticationManager authenticationManager,
                          SecurityContextRepository contexts, CsrfTokenRepository csrfTokens,
                          AccountService accounts, LoginAttemptLimiter attempts) {
        this.authenticationManager = authenticationManager;
        this.contexts = contexts;
        this.csrfTokens = csrfTokens;
        this.accounts = accounts;
        this.attempts = attempts;
    }

    @GetMapping("/auth/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/auth/login")
    public MeResponse login(@Valid @RequestBody LoginRequest input, HttpServletRequest request,
                            HttpServletResponse response) {
        String attemptKey = request.getRemoteAddr() + ':' + input.username();
        if (attempts.isBlocked(attemptKey)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED", "请稍后再试");
        }
        Authentication authenticated;
        try {
            authenticated = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(input.username(), input.password()));
        } catch (AuthenticationException exception) {
            attempts.failed(attemptKey);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "账号或密码错误");
        }
        attempts.succeeded(attemptKey);
        request.getSession(true);
        request.changeSessionId();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authenticated);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        csrfTokens.saveToken(null, request, response);
        return accounts.me(authenticated.getName());
    }

    @GetMapping("/me")
    public MeResponse me(Principal principal) {
        return accounts.me(principal.getName());
    }

    @PatchMapping("/me")
    public MeResponse updateMe(@RequestBody Map<String, Object> body, Principal principal) {
        return accounts.updateMe(principal.getName(), ProfileWriteRequest.parse(body));
    }

    @PostMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@RequestBody Map<String, Object> body, Principal principal,
                               HttpServletRequest request) {
        PasswordChangeRequest input = PasswordChangeRequest.parse(body);
        String attemptKey = "password:" + request.getRemoteAddr() + ':' + principal.getName();
        if (attempts.isBlocked(attemptKey)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "PASSWORD_RATE_LIMITED", "请稍后再试");
        }
        try {
            accounts.changePassword(principal.getName(), input.oldPassword(), input.newPassword());
        } catch (ApiException exception) {
            if ("CURRENT_PASSWORD_INVALID".equals(exception.code())) {
                attempts.failed(attemptKey);
            }
            throw exception;
        }
        attempts.succeeded(attemptKey);
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }
    }
}

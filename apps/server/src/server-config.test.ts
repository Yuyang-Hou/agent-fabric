import { describe, expect, it } from "vitest";

import { loadServerConfig } from "./server-config.js";

describe("Server configuration", () => {
  it("accepts a loopback MySQL profile", () => {
    const config = loadServerConfig({
      AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787",
      AGENT_FABRIC_HOST: "0.0.0.0",
      AGENT_FABRIC_DATABASE_DRIVER: "mysql",
      DATABASE_URL: "mysql://agent:secret@mysql/agent_fabric",
    });
    expect(config.host).toBe("0.0.0.0");
    expect(config.databaseDriver).toBe("mysql");
    expect(config.component.features).not.toContain("legacy-personal-agent-compatibility");
  });

  it("accepts an explicitly selected managed MySQL profile", () => {
    const config = loadServerConfig({
      AGENT_FABRIC_PUBLIC_BASE_URL: "https://agents.example.com",
      AGENT_FABRIC_DATABASE_DRIVER: "mysql",
      DATABASE_URL: "mysql://agent:secret@mysql_writer/agent_fabric",
    });
    expect(config.databaseDriver).toBe("mysql");
    expect(config.component.features).toContain("mysql");
  });

  it("normalizes a provider-issued JDBC MySQL connection without retaining Java pool parameters", () => {
    const config = loadServerConfig({
      AGENT_FABRIC_PUBLIC_BASE_URL: "https://agents.example.com",
      AGENT_FABRIC_DATABASE_DRIVER: "mysql",
      DATABASE_URL: "jdbc:mysql://mysql-writer/agent_fabric?user=agent-app&password=p%40ss&connectTimeout=500&socketTimeout=30000&useSSL=false&queryTimeoutKillsConnection=true",
    });
    expect(config.databaseUrl).toBe("mysql://agent-app:p%40ss@mysql-writer/agent_fabric?connectTimeout=500");
    expect(config.databaseUrl).not.toContain("socketTimeout");
    expect(config.databaseUrl).not.toContain("queryTimeoutKillsConnection");
  });

  it("rejects unsupported or conflicting database configuration", () => {
    const base = {
      AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787",
    };
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_DATABASE_DRIVER: "sqlite", DATABASE_URL: "sqlite://local" })).toThrow("database-driver-unsupported");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "postgres://example" })).toThrow("database-driver-url-mismatch");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "jdbc:mysql://example/database" })).toThrow("database-jdbc-credentials-missing");
  });

  it("rejects an insecure public bind", () => {
    expect(() => loadServerConfig({
      AGENT_FABRIC_HOST: "0.0.0.0",
      AGENT_FABRIC_PUBLIC_BASE_URL: "http://example.com",
      AGENT_FABRIC_DATABASE_DRIVER: "mysql",
      DATABASE_URL: "mysql://example",
    })).toThrow("public-tls-required");
  });

  it("enables Better Auth Google login only with a complete configuration", () => {
    const base = { AGENT_FABRIC_PUBLIC_BASE_URL: "https://agents.example.com", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://example" };
    const configured = loadServerConfig({
      ...base, AGENT_FABRIC_AUTH_SECRET: "a".repeat(32), AGENT_FABRIC_GOOGLE_CLIENT_ID: "client", AGENT_FABRIC_GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(configured.authentication?.google?.clientId).toBe("client");
    expect(configured.authentication?.google?.selfServiceLoginLimit).toBe(20);
    expect(configured.component.features).toContain("google-account-login");
    expect(configured.component.features).toContain("friend-invitations");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_AUTH_SECRET: "a".repeat(32), AGENT_FABRIC_GOOGLE_CLIENT_ID: "client" })).toThrow("google-auth-configuration-incomplete");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_GOOGLE_CLIENT_ID: "client", AGENT_FABRIC_GOOGLE_CLIENT_SECRET: "secret" })).toThrow("authentication-secret-invalid");
  });

  it("configures bounded Google self-service admission", () => {
    const configured = loadServerConfig({
      AGENT_FABRIC_PUBLIC_BASE_URL: "https://agents.example.com", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://example",
      AGENT_FABRIC_AUTH_SECRET: "a".repeat(32), AGENT_FABRIC_GOOGLE_CLIENT_ID: "client", AGENT_FABRIC_GOOGLE_CLIENT_SECRET: "secret",
      AGENT_FABRIC_GOOGLE_SELF_SERVICE_ALLOWED_DOMAINS: "example.com, example.org ", AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT: "5",
    });
    expect(configured.authentication?.google?.selfServiceAllowedDomains).toEqual(["example.com", "example.org"]);
    expect(configured.authentication?.google?.selfServiceLoginLimit).toBe(5);
  });

  it("enables email OTP only with complete TLS SMTP configuration", () => {
    const base = { AGENT_FABRIC_PUBLIC_BASE_URL: "https://agents.example.com", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://example", AGENT_FABRIC_AUTH_SECRET: "a".repeat(32) };
    const configured = loadServerConfig({
      ...base,
      AGENT_FABRIC_SMTP_HOST: "smtp.example.com",
      AGENT_FABRIC_SMTP_PORT: "465",
      AGENT_FABRIC_SMTP_SECURE: "true",
      AGENT_FABRIC_SMTP_USERNAME: "mailer",
      AGENT_FABRIC_SMTP_PASSWORD: "secret",
      AGENT_FABRIC_SMTP_FROM: "Agent Fabric <login@example.com>",
    });
    expect(configured.authentication?.emailOtp?.smtp).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, username: "mailer" });
    expect(configured.component.features).toContain("email-otp-login");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_SMTP_HOST: "smtp.example.com" })).toThrow("email-otp-configuration-incomplete");
    expect(() => loadServerConfig({ ...base, AGENT_FABRIC_SMTP_HOST: "smtp.example.com", AGENT_FABRIC_SMTP_PORT: "465", AGENT_FABRIC_SMTP_FROM: "login@example.com", AGENT_FABRIC_SMTP_USERNAME: "mailer" })).toThrow("smtp-auth-configuration-incomplete");
  });
});

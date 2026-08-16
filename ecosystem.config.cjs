module.exports = {
  apps: [
    {
      name: "agent-fabric",
      script: "apps/server/runtime/dist/bin.js",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        AGENT_FABRIC_HOST: "0.0.0.0",
        AGENT_FABRIC_PORT: "8080"
      }
    }
  ]
};

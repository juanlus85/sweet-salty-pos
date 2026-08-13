module.exports = {
  apps: [
    {
      name: "sweet-salty-pos",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};

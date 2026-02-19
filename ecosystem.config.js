export default {
  apps: [{
    name: 'molotov',
    script: './bot.js',
    instances: 1, // Single instance for Telegram bots
    exec_mode: 'fork', // Fork mode, not cluster
    
    // Performance optimizations
    node_args: [
      '--max-old-space-size=2048', // 2GB heap
      '--optimize-for-size',        // Optimize for memory
      '--gc-interval=100',          // Frequent garbage collection
      '--expose-gc'                 // Expose GC for manual control
    ],
    
    // Environment
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 16,      // Increase thread pool
      NODE_OPTIONS: '--enable-source-maps'
    },
    
    // Memory and restart settings
    max_memory_restart: '1500M',   // Restart at 1.5GB (before hitting 2GB limit)
    min_uptime: '10s',             // Minimum uptime before restart
    max_restarts: 10,              // Max restarts per minute
    
    // Logging
    log_file: 'logs/combined.log',
    out_file: 'logs/pm2-out.log',
    error_file: 'logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Performance monitoring
    pmx: true,
    automation: false,
    
    // Advanced settings for performance
    kill_timeout: 5000,            // Time to wait before force kill
    listen_timeout: 8000,          // Time to wait for app to start
    restart_delay: 4000,           // Delay between restarts
    
    // Process behavior
    autorestart: true,
    watch: false,                  // Don't watch files in production
    ignore_watch: ['node_modules', 'logs', '.git'],
    
    // Additional optimizations
    time: true,                    // Prefix logs with time
    source_map_support: true,      // Enable source maps
    
    // Custom restart conditions
    cron_restart: '0 2 * * *',     // Restart daily at 2 AM
    
    // Error handling
    exp_backoff_restart_delay: 100 // Exponential backoff for restarts
  }]
};

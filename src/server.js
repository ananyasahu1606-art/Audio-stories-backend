const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

// Start HTTP server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[Server] Audio Stories Backend running in ${config.nodeEnv} mode on port ${PORT}`);
  console.log(`[Server] Health Check: http://localhost:${PORT}/api/health`);
});

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables strictly from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  corsOrigin: process.env.CORS_ORIGIN,
};

module.exports = config;

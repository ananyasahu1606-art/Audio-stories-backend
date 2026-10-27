const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/env');
const routes = require('./routes');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// Enable CORS
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount API routes
app.use('/api', routes);

// 404 & Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;

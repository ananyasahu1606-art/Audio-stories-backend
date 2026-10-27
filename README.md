# Audio Stories Admin Panel - Backend API

Modular Express.js + MongoDB + Mongoose backend built specifically to serve the Audio Stories Admin Panel frontend.

## Architecture
```
backend/
├── src/
│   ├── config/          # Environment & Database connections
│   ├── constants/       # Enums and fixed taxonomies
│   ├── controllers/     # Route request handlers
│   ├── middlewares/     # Auth, error, and notFound handlers
│   ├── models/          # Mongoose data models
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic operations
│   ├── utils/           # Helper response formatters
│   ├── validators/      # Schema/Input validation rules
│   ├── app.js           # Express app setup & middleware stack
│   └── server.js        # Server listener and DB bootstrapper
├── uploads/             # Static file storage directory
├── .env                 # Environment variables
├── .env.example         # Example environment template
├── package.json
└── README.md
```

## Getting Started
1. Run `npm install` inside the `backend` directory.
2. Ensure MongoDB is running on `mongodb://localhost:27017/audio_stories_db`.
3. Start the dev server: `npm run dev`.

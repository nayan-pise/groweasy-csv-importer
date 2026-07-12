require('dotenv').config();
const express = require('express');
const cors = require('cors');
const importRoutes = require('./routes/importRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Increase JSON body limit to handle large CSV payloads
app.use(express.json({ limit: '10mb' }));

// Health check route
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'GrowEasy CSV Import API is running.',
    endpoints: {
      import: 'POST /api/import',
    },
  });
});

// API Routes
app.use('/api', importRoutes);

// Global Error Handling Middleware (must be after all routes)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

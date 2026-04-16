/**
 * Turnstile Solver - Local Development Server
 * 
 * This file is for running the server locally.
 * On Vercel, the api/index.js is used directly.
 */

const app = require('./api/index.js');

// The server is already started in api/index.js when running locally
// This file exists for compatibility with `npm start`
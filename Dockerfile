# Dockerfile for Turnstile Solver
# Optimized for Replit, Railway, Render, Fly.io, and other Docker platforms

FROM node:18-slim

# Install ALL dependencies required for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    # Core dependencies
    wget \
    gnupg \
    ca-certificates \
    # Fonts
    fonts-liberation \
    fonts-noto-color-emoji \
    # Audio
    libasound2 \
    # GTK and UI dependencies
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libgtk-3-0 \
    # Core libraries
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxshmfence1 \
    # GLib and other missing dependencies
    libglib2.0-0 \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libdbus-glib-1-2 \
    libglu1-mesa \
    # Other
    xdg-utils \
    libvulkan1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install all dependencies
RUN npm install

# Install Playwright browsers with ALL dependencies
RUN npx playwright install chromium --with-deps

# Copy application files
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV HEADLESS=true
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
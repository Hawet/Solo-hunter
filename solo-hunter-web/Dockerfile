# --- Stage 1: Build ---
    FROM node:18 AS build

    WORKDIR /app
    
    # Clean copy of package files
    COPY package.json package-lock.json ./
    
    # Clean install for Docker platform
    RUN rm -rf node_modules && npm install
    
    # Copy the rest of the source code
    COPY . .
    
    # Build the app
    RUN npm run build
    
    # --- Stage 2: Serve ---
    FROM node:18-alpine
    
    WORKDIR /app
    
    # Copy built app and production deps
    COPY --from=build /app ./
    
    ENV HOST=0.0.0.0
    EXPOSE 4173
    
    CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
    
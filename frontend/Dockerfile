FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Clear npm cache and install dependencies
# Using --legacy-peer-deps to handle any peer dependency conflicts
RUN npm cache clean --force && \
    npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

EXPOSE 5173

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


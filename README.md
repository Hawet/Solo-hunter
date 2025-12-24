# Solo Hunter - EVE Online PvP Monitor

A web application to monitor recent zkillboard kills and help solo players find solar systems with PvP activity in EVE Online.

## Features

- Real-time kill monitoring via zkillboard websocket
- Displays the 15 most recent kills
- Clean, modern UI built with Svelte
- FastAPI backend for efficient data handling
- Easy local development with Docker Compose

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: Svelte with Vite
- **Data Source**: zkillboard.com RedisQ API + EVE ESI API
- **Containerization**: Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose installed
- For local development without Docker: Python 3.11+ and Node.js 18+

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd Solo-hunter
```

2. Start the services:
```bash
docker-compose up --build
```

3. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Local Development (Without Docker)

#### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

## Project Structure

```
Solo-hunter/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application
│   │   └── zkillboard.py     # WebSocket client for zkillboard
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── KillList.svelte
│   │   ├── App.svelte
│   │   └── main.js
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

## API Endpoints

- `GET /` - Root endpoint
- `GET /api/kills` - Get the 15 most recent kills
- `GET /api/health` - Health check endpoint

## How It Works

1. The backend connects to zkillboard.com's RedisQ service on startup
2. It polls the RedisQ endpoint to receive real-time kill data
3. When a killmail is received, it fetches the full killmail data from EVE ESI API
4. Kills are processed and stored in memory (most recent 15)
5. The frontend polls the backend API every 2 seconds to get updated kill data
6. Kills are displayed in a clean, scrollable list with relevant information

## Development

The application uses hot-reload for both frontend and backend during development when using Docker Compose with volume mounts.

### Stopping the Services

```bash
docker-compose down
```

### Viewing Logs

```bash
docker-compose logs -f
```

## License

MIT


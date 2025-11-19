# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RSS-AI is an RSS assistant that periodically fetches multiple RSS sources, uses user-configured AI (OpenAI-compatible) to summarize the latest articles, deduplicates and stores them, pushes to Telegram groups, and provides a standard API with a frontend web management interface.

## Architecture

The project is structured as a backend and frontend:

- Backend: Python + FastAPI (includes OpenAPI/Swagger, detailed logging, hot-reloadable configuration, background scheduled tasks)
- Frontend: Black and white color scheme, minimalist and high-end web page (view summaries and modify configuration online)

### Backend Components

1. Main application (`backend/app/main.py`):
   - FastAPI application with RESTful API endpoints
   - RSS feed fetching and processing
   - AI summarization with OpenAI-compatible API
   - Telegram integration for push notifications
   - SQLite storage with deduplication
   - Scheduled tasks for periodic fetching

2. Core modules:
   - `ai_client.py`: OpenAI-compatible AI client for summarization
   - `config.py`: Configuration loading and saving
   - `extractor.py`: Web page content extraction
   - `models.py`: Pydantic models for API and configuration
   - `rss_service.py`: RSS feed parsing and processing
   - `scheduler.py`: Task scheduling for periodic operations
   - `storage.py`: SQLite database operations
   - `telegram_client.py`: Telegram bot integration
   - `report_service.py`: Report generation service

3. Configuration:
   - `config.yaml`: Runtime configuration file

### Frontend Components

1. Static files:
   - `index.html`: Main web interface
   - `app.js`: Client-side JavaScript for UI interactions
   - `styles.css`: Styling

2. Server:
   - `server.py`: Python FastAPI server that serves static files and proxies API requests to the backend

## Common Development Tasks

### Running the Application

1. Local development:
   ```bash
   # Start backend
   cd backend
   pip install -r requirements.txt
   ./run.sh

   # Start frontend
   cd frontend
   PORT=3602 BACKEND_BASE_URL=http://127.0.0.1:3601 ./run.sh
   ```

2. Docker deployment:
   ```bash
   docker compose build
   docker compose up -d
   ```

### Building the Project

- Backend: Python dependencies managed via `requirements.txt`
- Frontend: Static HTML/CSS/JS with a lightweight Python proxy server

### Testing

Tests are not explicitly configured in this project. The application is tested through manual usage of the web interface and API endpoints.

## API Endpoints

Key API endpoints include:
- `GET /api/health`: Health check
- `GET /api/settings`: Get configuration (sensitive info masked)
- `PUT /api/settings`: Update configuration
- `POST /api/fetch`: Trigger immediate fetch
- `GET /api/articles`: List articles
- `GET /api/articles/{id}`: Get article details
- `GET /api/reports`: List reports
- `POST /api/reports/generate`: Generate report
- `DELETE /api/reports/{id}`: Delete report

Full API documentation available at `/docs` (Swagger UI).

## Deployment

The application can be deployed using Docker Compose with two services:
1. Backend service on port 3601
2. Frontend service on port 3602 (proxies API requests to backend)

Persistent data is stored in:
- `backend/data/`: SQLite database
- `backend/logs/`: Application logs
- `backend/config.yaml`: Configuration file

## Configuration

The main configuration file is `backend/config.yaml` which includes settings for:
- Server (host, port)
- RSS fetching (interval, feeds, filters)
- AI service (OpenAI-compatible API)
- Telegram integration
- Reports generation
- Security (admin password)
- Logging
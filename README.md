# Seatify

Seatify is a movie-ticket booking app with a React/Vite frontend and an Express/MySQL API.

## Repository branches

- `main` — complete application; use this branch for development and deployment.
- `frontend` — frontend only, with the Vite project at the repository root.
- `backend` — backend only, with the Express API at the repository root.

## Run `main` locally

1. Copy `backend/.env.example` to `backend/.env` and set your MySQL details. Do not commit this file.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Run `npm install` at the repository root.
4. Run `npm run dev` to start both services.

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:5000`.

## Deploy

Deploy the frontend from `frontend/` with `npm run build`. At build time, set `VITE_API_URL` to the public API URL.

Deploy the backend from `backend/` with `npm start`. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `CORS_ORIGIN` in the host's private environment settings. Set `CORS_ORIGIN` to the deployed frontend URL.

Never commit real passwords, database dumps, or `.env` files.

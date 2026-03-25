# FMATE Frontend

## Overview
A React + TypeScript + Vite frontend for "FMATE" — an app for building project memory and chatting with documents. It connects to a FastAPI backend at `/api`. Features authentication (sign in / sign up), AI conversations, and project/document management.

## Tech Stack
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **State Management**: Zustand
- **Routing**: React Router v7
- **Data Fetching**: SWR + Axios
- **i18n**: i18next + react-i18next
- **Animations**: Framer Motion
- **Package Manager**: pnpm

## Project Structure
- `src/` - Source code
  - `assets/` - Static assets
  - `components/` - Reusable UI components
  - `config/` - App configuration
  - `core/` - Core app logic
  - `global.css` - Global styles
  - `lib/` - Utility libraries
  - `main.tsx` - App entry point
  - `pages/` - Page components
  - `ui/` - UI primitives
- `public/` - Static public files
- `dist/` - Build output (generated)

## Development
- Run: `pnpm run dev` (starts on port 5000)
- Build: `pnpm run build`

## Deployment
- Type: Static site
- Build command: `pnpm run build`
- Public directory: `dist`

## Configuration Notes
- Vite is configured to run on `0.0.0.0:5000` for Replit compatibility
- `allowedHosts: true` is set to allow Replit's proxy

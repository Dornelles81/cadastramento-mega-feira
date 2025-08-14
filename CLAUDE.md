# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Mobile-First Facial Data Collection System** - a complete Next.js web application designed to collect biometric facial data for up to 2,000 event participants. The system is optimized for smartphones and uses NEON PostgreSQL database with Vercel serverless deployment.

**STATUS: ✅ FULLY IMPLEMENTED AND READY FOR DEPLOYMENT**

## Current Repository Contents

### ✅ Implemented Application
- **Next.js 14** app with mobile-first design
- **React components** for facial capture workflow
- **Vercel serverless APIs** for registration and data management
- **Prisma + NEON** database integration
- **Complete UX flow**: Consent → Personal Data → Facial Capture → Success

### 📋 Planning Documents (Reference)
- **facial-registration-project-plan.md** - Complete project plan with timeline
- **facial-registration-tech-stack.md** - Technology architecture decisions
- **facial-registration-technical-docs.md** - Technical specifications
- **DEPLOY.md** - Step-by-step deployment guide
- **README.md** - Complete usage and setup documentation

## Implemented Technology Stack

**Current implementation:**
- **Frontend**: Next.js 14 + React 18 + TypeScript + MediaPipe Face Detection + Tailwind CSS
- **Backend**: Vercel Serverless Functions (Node.js + TypeScript)
- **Database**: NEON PostgreSQL (serverless) + Prisma ORM
- **Styling**: Tailwind CSS + Framer Motion animations
- **Deployment**: Vercel (global CDN + serverless)
- **Security**: AES-256 encryption, HTTPS, LGPD compliance
- **Mobile**: PWA ready, optimized for iOS/Android browsers

## Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Run setup script
./start.sh        # Linux/Mac
start.bat         # Windows

# This will:
# - Install dependencies
# - Configure environment
# - Generate Prisma client
# - Optionally start dev server
```

### Option 2: Manual Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with NEON database credentials

# Generate Prisma client
npx prisma generate

# Apply database schema
npx prisma db push

# Start development
npm run dev
```

## Available Commands

```bash
# Development
npm run dev              # Start Next.js development server
npm run build            # Build for production
npm run start            # Start production server

# Database (Prisma)
npx prisma studio        # Open visual database editor
npx prisma db push       # Apply schema changes to database
npx prisma generate      # Generate Prisma client
npx prisma db pull       # Pull schema from database

# Deployment
vercel                   # Deploy to Vercel
vercel --prod           # Deploy to production
```

## Project Documentation Structure

### Planning Documents
- **facial-registration-project-plan.md** - 75-day implementation timeline with phases, milestones, and resource allocation
- **facial-registration-tech-stack.md** - Complete technology evaluation with alternatives and cost estimates
- **facial-registration-technical-docs.md** - Detailed technical specifications and API designs
- **facial-registration-review-executive.md** - Executive summary and business requirements
- **neon-commands-guide.md** - Database setup and PostgreSQL commands

### Setup Script Features
The `facial-repo-quick-setup.sh` script will create:
- Complete React + TypeScript frontend with MediaPipe integration
- Node.js + Express + Prisma backend with full API endpoints
- PostgreSQL + Redis + MinIO Docker configuration
- CI/CD workflows for GitHub Actions
- Comprehensive security and LGPD compliance structure
- HikCenter integration templates

## Planned Architecture (Post-Implementation)

### Core Components
1. **Face Capture Frontend** - MediaPipe-based facial capture for mobile browsers
2. **Registration API** - Express.js REST API with validation and encryption
3. **Face Processing Service** - Biometric template extraction and quality validation
4. **HikCenter Integration** - Batch sync with retry logic and rate limiting
5. **LGPD Compliance Service** - Consent management and automated data retention
6. **Storage Service** - Encrypted image storage with MinIO S3-compatible backend

### Key Requirements (From Planning Docs)
- **Mobile Compatibility**: iOS Safari and Android Chrome with WebRTC support
- **Security**: AES-256 encryption, HTTPS, audit logging, CPF validation
- **LGPD Compliance**: Consent tracking, 90-day retention, automated deletion
- **HikCenter Integration**: Batch uploads (100 max), HMAC-SHA256 auth, rate limiting
- **Performance**: <3s face capture, <3s API response, 100 concurrent users
- **Scale**: Support for 2,000+ participant registrations

## Environment Configuration (Post-Implementation)

The generated `.env` will include:
- `DATABASE_URL` - PostgreSQL connection (NEON cloud support)
- `HIKCENTER_URL` - HikCenter API endpoint
- `MASTER_KEY` - 32-character AES-256 encryption key
- `S3_ENDPOINT` - MinIO/S3 storage configuration
- `DATA_RETENTION_DAYS=90` - LGPD compliance setting

## Next Steps for Implementation

### Phase 1: Project Generation
1. **Execute Setup Script**: Run `./facial-repo-quick-setup.sh` to create the complete project structure
2. **Review Generated Code**: Examine the created frontend, backend, and configuration files
3. **Install Dependencies**: Run installation commands for both frontend and backend
4. **Configure Environment**: Set up `.env` file with your specific credentials

### Phase 2: Development Environment
1. **Database Setup**: Configure PostgreSQL (NEON recommended) and Redis
2. **Storage Setup**: Configure MinIO for image storage
3. **HikCenter Integration**: Set up test environment and credentials
4. **SSL Certificates**: Generate certificates for HTTPS (required for camera access)

### Phase 3: Testing & Validation
1. **Unit Tests**: Verify all components work individually
2. **Integration Tests**: Test API endpoints and database operations
3. **Mobile Testing**: Test facial capture on iOS Safari and Android Chrome
4. **Load Testing**: Validate performance with expected concurrent users
5. **Security Testing**: Verify encryption, LGPD compliance, and data protection

### Phase 4: Deployment Preparation
1. **Production Environment**: Set up hosting infrastructure
2. **CI/CD Pipeline**: Configure GitHub Actions workflows
3. **Monitoring**: Set up application and infrastructure monitoring
4. **Backup Strategy**: Implement automated backup procedures

## Expected Project Structure (Post-Setup)

After running the setup script, you'll have:

```
Facial-Data-Collection/
├── frontend/                 # React + TypeScript app with MediaPipe
│   ├── src/components/      # UI components including FaceCapture
│   ├── src/services/        # API client and utilities
│   └── package.json         # Frontend dependencies
├── backend/                 # Node.js + Express API
│   ├── src/controllers/     # Route handlers
│   ├── src/services/        # Business logic
│   ├── prisma/schema.prisma # Database schema
│   └── package.json         # Backend dependencies
├── docker-compose.yml       # Development services
├── .env.example             # Environment variables template
├── scripts/                 # Utility and setup scripts
└── docs/                    # Generated documentation
```

## Development Workflow (Post-Implementation)

1. **Start Development**: `docker-compose up -d && npm run dev`
2. **Database Management**: Use Prisma Studio for visual database management
3. **Testing**: Run automated tests with `npm test`
4. **Code Quality**: Use `npm run lint` for code quality checks
5. **Mobile Testing**: Test camera functionality on actual devices over HTTPS
6. **HikCenter Testing**: Validate integration with test data
7. **LGPD Compliance**: Verify consent management and data retention
8. **Performance Monitoring**: Monitor response times and error rates

## Resources and Documentation

- **Technical Specifications**: See `facial-registration-technical-docs.md` for detailed API specs
- **Project Timeline**: See `facial-registration-project-plan.md` for implementation phases
- **Technology Choices**: See `facial-registration-tech-stack.md` for architecture decisions
- **Database Commands**: See `neon-commands-guide.md` for PostgreSQL operations

This planning repository provides everything needed to implement a production-ready facial data collection system with enterprise-grade security, LGPD compliance, and HikCenter integration.
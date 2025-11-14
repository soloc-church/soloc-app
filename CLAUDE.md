# CLAUDE.md - AI Assistant Guide for soloc-app

> **Last Updated:** 2025-11-14
> **Repository:** soloc-church/soloc-app
> **Status:** New Project - Initial Setup Phase

## Table of Contents
- [Project Overview](#project-overview)
- [Repository Structure](#repository-structure)
- [Development Workflow](#development-workflow)
- [Code Standards & Conventions](#code-standards--conventions)
- [Common Tasks](#common-tasks)
- [AI Assistant Guidelines](#ai-assistant-guidelines)
- [Technology Stack](#technology-stack)
- [Deployment](#deployment)

---

## Project Overview

### About
This is the **soloc-app** repository for the SOLOC Church organization. The project is currently in its initial setup phase.

### Purpose
**TO BE DEFINED**: Update this section once the application's core purpose is established.

Potential use cases:
- Church management system
- Member portal
- Event management
- Communication platform
- Content management

### Key Stakeholders
- **Organization:** soloc-church
- **Contact:** solpentecostaloc@gmail.com

---

## Repository Structure

### Current State
This is a new repository with minimal structure. The following is the **recommended structure** to be implemented:

```
soloc-app/
├── .github/              # GitHub workflows, issue templates, PR templates
│   └── workflows/        # CI/CD pipelines
├── docs/                 # Documentation
│   ├── api/             # API documentation
│   ├── architecture/    # Architecture decisions and diagrams
│   └── user-guides/     # User documentation
├── src/                  # Source code
│   ├── components/      # Reusable UI components
│   ├── pages/           # Page components/routes
│   ├── services/        # Business logic and API services
│   ├── utils/           # Utility functions
│   ├── hooks/           # Custom React hooks (if React)
│   ├── contexts/        # Context providers (if React)
│   ├── types/           # TypeScript type definitions
│   └── config/          # Configuration files
├── public/               # Static assets
├── tests/                # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/             # End-to-end tests
├── scripts/              # Build and deployment scripts
├── .env.example         # Environment variable template
├── .gitignore           # Git ignore rules
├── package.json         # Node dependencies (if Node.js)
├── tsconfig.json        # TypeScript configuration (if TypeScript)
└── README.md            # Project README

```

### File Naming Conventions
**TO BE ESTABLISHED** based on chosen tech stack. Common patterns:

- **React/Next.js:** PascalCase for components (`UserProfile.tsx`)
- **Utilities:** camelCase for functions (`formatDate.ts`)
- **Constants:** UPPER_SNAKE_CASE (`API_ENDPOINTS.ts`)
- **Types/Interfaces:** PascalCase (`User.ts`, `ApiResponse.ts`)

---

## Development Workflow

### Branch Strategy
This project uses a feature branch workflow:

- **Main Branch:** `main` (production-ready code)
- **Feature Branches:** `claude/<session-id>` for AI-assisted development
- **Other Branches:** TBD based on team workflow (e.g., `develop`, `staging`)

### Branch Naming Conventions
```
feature/<feature-name>        # New features
bugfix/<bug-description>      # Bug fixes
hotfix/<critical-fix>         # Production hotfixes
refactor/<refactor-scope>     # Code refactoring
docs/<documentation-update>   # Documentation changes
claude/<session-id>           # AI assistant sessions
```

### Commit Message Format
Follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples:**
```
feat(auth): add user login functionality
fix(api): resolve null pointer in user service
docs(readme): update installation instructions
refactor(components): simplify UserCard component
```

### Pull Request Process
1. Create a feature branch from `main`
2. Make changes and commit with descriptive messages
3. Push to remote repository
4. Create pull request with clear description
5. Request review (if team is established)
6. Merge after approval and passing CI/CD

---

## Code Standards & Conventions

### General Principles
- **DRY (Don't Repeat Yourself):** Avoid code duplication
- **KISS (Keep It Simple, Stupid):** Prefer simple solutions
- **YAGNI (You Aren't Gonna Need It):** Don't add unnecessary features
- **Separation of Concerns:** Keep different functionalities separate
- **Single Responsibility:** Each function/component should do one thing well

### Code Quality
- Write self-documenting code with clear variable/function names
- Add comments for complex logic, not obvious code
- Keep functions small and focused (< 50 lines ideally)
- Prefer pure functions and immutability where possible
- Handle errors gracefully with proper error messages

### Security Best Practices
**CRITICAL:** Always follow these security guidelines:

- **Never commit secrets:** Use environment variables for sensitive data
- **Input Validation:** Validate and sanitize all user inputs
- **SQL Injection Prevention:** Use parameterized queries
- **XSS Prevention:** Escape user-generated content
- **CSRF Protection:** Implement CSRF tokens for forms
- **Authentication:** Use industry-standard auth methods (OAuth, JWT)
- **Authorization:** Implement proper role-based access control
- **HTTPS Only:** Enforce secure connections
- **Dependency Security:** Regularly update dependencies and scan for vulnerabilities

### Testing Standards
**TO BE ESTABLISHED** based on tech stack. Recommended:

- Unit test coverage: > 70%
- Integration tests for critical paths
- E2E tests for user workflows
- Test naming: `describe('Component/Function', () => { it('should do something', () => {}))`

---

## Common Tasks

### Getting Started (TO BE UPDATED)
```bash
# Clone repository
git clone https://github.com/soloc-church/soloc-app.git
cd soloc-app

# Install dependencies (example for Node.js)
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Development Commands (TO BE UPDATED)
```bash
# Start development server
npm run dev

# Run linter
npm run lint

# Format code
npm run format

# Run type checking (TypeScript)
npm run type-check

# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run E2E tests
npm run test:e2e

# Build production bundle
npm run build

# Start production server
npm start
```

### Database Operations (IF APPLICABLE)
```bash
# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Reset database
npm run db:reset

# Create migration
npm run db:migration:create <name>
```

---

## AI Assistant Guidelines

### Context Understanding
When working on this codebase, AI assistants should:

1. **Read First:** Always read existing files before making changes
2. **Understand Structure:** Familiarize yourself with the project structure
3. **Follow Conventions:** Adhere to established patterns and naming conventions
4. **Check Dependencies:** Review package.json and existing dependencies
5. **Security First:** Never introduce security vulnerabilities

### Recommended Workflow
1. **Explore:** Use Task tool with `subagent_type=Explore` for codebase exploration
2. **Plan:** Use TodoWrite to track multi-step tasks
3. **Read:** Read relevant files before editing
4. **Edit:** Make surgical changes using Edit tool (prefer over Write)
5. **Test:** Run tests after changes
6. **Commit:** Create clear, conventional commits
7. **Verify:** Check git status and diffs before pushing

### Code Changes
- **Prefer Edit over Write:** Always edit existing files rather than overwriting
- **Preserve Formatting:** Match existing indentation and style
- **Add Tests:** Include tests for new functionality
- **Update Documentation:** Update relevant docs when changing behavior
- **No Secrets:** Never commit API keys, passwords, or tokens

### Communication Style
- **Concise:** Keep responses short and to the point
- **No Emojis:** Unless explicitly requested by user
- **Technical:** Focus on facts and technical accuracy
- **Markdown:** Use GitHub-flavored markdown for formatting

### File References
When referencing code, use the format: `file_path:line_number`

Example: "The authentication logic is in `src/services/auth.ts:45`"

### Security Awareness
**CRITICAL SECURITY CHECKS:**
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (escape user content)
- ✅ CSRF protection
- ✅ Authentication and authorization checks
- ✅ Secure password handling (hashing, salting)
- ✅ Environment variables for secrets
- ✅ HTTPS enforcement
- ✅ Rate limiting for APIs
- ✅ Proper error handling (don't expose sensitive info)

### Common Pitfalls to Avoid
- ❌ Don't commit `.env` files
- ❌ Don't use `any` type in TypeScript
- ❌ Don't skip error handling
- ❌ Don't hardcode configuration values
- ❌ Don't create files when editing would suffice
- ❌ Don't use `console.log` in production code
- ❌ Don't ignore TypeScript/linter warnings
- ❌ Don't bypass security checks

---

## Technology Stack

### Current Stack
**TO BE DEFINED** - Update this section once technologies are chosen

### Potential Technologies
Consider these common stacks for church/organization applications:

**Frontend:**
- React / Next.js / Vue.js
- TypeScript
- Tailwind CSS / Material-UI / Chakra UI
- React Query / SWR for data fetching

**Backend:**
- Node.js (Express / NestJS / Fastify)
- Python (Django / FastAPI / Flask)
- Ruby on Rails
- Go / Rust

**Database:**
- PostgreSQL
- MySQL
- MongoDB
- Firebase / Supabase

**Authentication:**
- Auth0
- Firebase Auth
- NextAuth.js
- Passport.js

**Hosting:**
- Vercel / Netlify (Frontend)
- AWS / Google Cloud / Azure
- Heroku / Railway / Render
- Digital Ocean

---

## Deployment

### Environments
**TO BE CONFIGURED**

Typical setup:
- **Development:** Local development environment
- **Staging:** Pre-production testing environment
- **Production:** Live application

### CI/CD Pipeline
**TO BE CONFIGURED**

Recommended workflow:
1. Run linter and type checking
2. Run unit and integration tests
3. Build application
4. Run E2E tests
5. Deploy to staging (on merge to develop)
6. Deploy to production (on merge to main)

### Environment Variables
**CRITICAL:** Never commit these to git

Create `.env.example` with placeholder values:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# API Keys
API_KEY=your_api_key_here
SECRET_KEY=your_secret_key_here

# Environment
NODE_ENV=development
PORT=3000

# Authentication
JWT_SECRET=your_jwt_secret_here
```

---

## Contributing

### For AI Assistants
When making contributions:

1. **Always create commits:** Create clear, descriptive commits after completing work
2. **Always push changes:** Push to the designated branch (`claude/<session-id>`)
3. **Follow conventions:** Adhere to all guidelines in this document
4. **Update documentation:** Keep CLAUDE.md and other docs current
5. **Security first:** Review all changes for security vulnerabilities

### For Human Developers
**TO BE DEFINED** - Add contribution guidelines once team is established

---

## Maintenance

### Updating This Document
This CLAUDE.md file should be updated:
- When project structure changes
- When new conventions are established
- When tech stack is defined/updated
- When new workflows are introduced
- After significant architectural decisions
- Periodically (at least quarterly) to ensure accuracy

### Version History
- **2025-11-14:** Initial creation for new repository

---

## Additional Resources

### Documentation
- **README.md:** Project overview and quick start (TO BE CREATED)
- **CONTRIBUTING.md:** Contribution guidelines (TO BE CREATED)
- **CODE_OF_CONDUCT.md:** Code of conduct (TO BE CREATED)
- **LICENSE:** Project license (TO BE CREATED)

### External Links
- **Repository:** https://github.com/soloc-church/soloc-app
- **Organization:** soloc-church
- **Documentation:** (TO BE ADDED)
- **Issue Tracker:** GitHub Issues

---

## Quick Reference

### Essential Commands Summary
```bash
# Setup
git clone <repo-url> && cd soloc-app
# npm install  (once package.json exists)

# Development
# npm run dev  (once configured)

# Testing
# npm test     (once configured)

# Deployment
git add .
git commit -m "type(scope): description"
git push -u origin <branch-name>
```

### Git Workflow Summary
```bash
# Check status
git status

# Stage changes
git add <file>

# Commit with conventional message
git commit -m "feat: add new feature"

# Push to feature branch
git push -u origin claude/<session-id>
```

### Security Checklist
Before committing, verify:
- [ ] No secrets in code
- [ ] Input validation present
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Proper error handling
- [ ] Dependencies updated
- [ ] Environment variables used for config

---

## Notes for AI Assistants

### First-Time Setup Tasks
When first working on this repository, consider:

1. ✅ Create basic project structure
2. ⬜ Initialize package.json with project dependencies
3. ⬜ Set up .gitignore file
4. ⬜ Create .env.example template
5. ⬜ Set up linting and formatting (ESLint, Prettier)
6. ⬜ Configure TypeScript (if using)
7. ⬜ Set up testing framework
8. ⬜ Create README.md
9. ⬜ Set up CI/CD pipeline
10. ⬜ Create initial application structure

### Project Evolution
As this project grows, update this document with:
- Actual file structure
- Specific coding patterns used
- API documentation references
- Component library guidelines
- State management approach
- Routing structure
- Database schema documentation
- API endpoint documentation

---

**This is a living document. Keep it updated as the project evolves!**

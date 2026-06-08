# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Run Tests**: `npm test`
- **Run a Single Test**: `npm test <test-file>`

## Code Architecture

The codebase follows a modular architecture with the following major components:
- **Frontend**: React-based UI with components for user interaction.
- **Backend**: Express.js server handling API endpoints and business logic.
- **Database**: MongoDB for storing application data.
- **Services**: Separate modules for different functionalities like authentication, user management, and data processing.

## Development Tips

- Ensure that you have the necessary Node.js and npm versions installed.
- Use environment variables to manage sensitive information like database credentials.
- Run `npm install` to install all required dependencies before starting development.

## Important Files

- `package.json`: Contains metadata and scripts for building and running the application.
- `src/`: Contains the source code for the frontend and backend.
- `test/`: Contains test files for the application.

## Known Documentation

- [README.md](README.md): Provides an overview of the project and instructions for installation and usage.

## Known Rules

- [Cursor rules](.cursor/rules/): Define custom rules for code completion.
- [Copilot rules](.github/copilot-instructions.md): Instructions for using GitHub Copilot with the project.

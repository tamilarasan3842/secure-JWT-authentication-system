# FastAPI Security & JWT Authentication Guide

## Overview
This document outlines the authentication and authorization mechanism used in the Secure Document Q&A Service.

## Key Features
1. **Password Hashing**: User passwords are never stored in plain text. They are hashed using `bcrypt` with random salt rounds.
2. **JWT Secret Key**: Secrets are loaded exclusively from the environment variable `JWT_SECRET` (defined in `.env`). Never commit hardcoded keys to version control.
3. **Token Expiration**: Access tokens default to an expiration time of 60 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`).
4. **Signature Verification**: Every protected route (`/chat`, `/me`) verifies token signatures via FastAPI `HTTPBearer` dependencies.

## Authentication Flow
1. Client sends `POST /auth/register` with `email` and `password`.
2. Server validates input, hashes password using `bcrypt`, and persists user record in SQLite database.
3. Client sends `POST /auth/login` with credentials.
4. Server verifies password hash and returns `access_token` (JWT) and `token_type: "bearer"`.
5. For protected requests, client includes `Authorization: Bearer <token>` header.

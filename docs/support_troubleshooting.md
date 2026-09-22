# Internal Support FAQ & Troubleshooting Procedures

## 1. Password Reset Procedure
- **Question**: How do I reset a user password?
- **Procedure**: Send an administrative request to support IT or re-register user credentials via `POST /auth/register` with updated details. Passwords are password-hashed via bcrypt.

## 2. Token Expiration & Unauthenticated Errors (401)
- **Question**: Why am I getting "401 Unauthorized" or "Token expired"?
- **Resolution**: JWT access tokens expire after 60 minutes. Re-authenticate via `POST /auth/login` to obtain a fresh token and update your `Authorization: Bearer <token>` header.

## 3. Empty Search Results & Out-of-Scope Questions
- **Question**: Why does the service respond "I could not find information on this topic in the available documentation"?
- **Resolution**: The system strictly enforces hallucination prevention. If retrieved chunks score low on semantic relevance, the LangGraph grade node flags them as irrelevant and refuses to generate unsupported answers.

## 4. Re-indexing Documentation
- **Question**: How do I update documentation chunks when a document changes?
- **Procedure**: Run `python src/ingest.py` or trigger `POST /ingest` endpoint to reload markdown files from `docs/`, re-chunk at 500/100 bounds, and update Chroma DB collections.

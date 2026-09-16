# Security

## Keep credentials local

Copy `.env.example` to `.env.local` and add credentials only to that local file. All
`.env*` files except the empty example are ignored by Git. Do not put API keys,
import tokens, browser cookies, or captured feed data in source files.

If a credential is ever committed, revoke or rotate it immediately. Removing the
file in a later commit does not remove the credential from Git history.

## Network exposure

X Agent is designed to run locally. If you expose it through a tunnel, forwarded
port, or public deployment, set a strong `X_AGENT_IMPORT_TOKEN` and configure the
same value in the browser extension. Treat the generated SQLite database and voice
revisions as private user data.

## Reporting a vulnerability

Please open a private GitHub security advisory for vulnerabilities. Do not include
real credentials, private posts, or captured feed data in a public issue.

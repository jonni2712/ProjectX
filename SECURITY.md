# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email: [create a security advisory on GitHub]
3. Include steps to reproduce the vulnerability

We will respond within 48 hours and work on a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Measures

- JWT authentication with bcrypt password hashing
- Path traversal protection on all file operations  
- Rate limiting on authentication endpoints
- WebSocket authentication via single-use tickets
- All traffic encrypted via Cloudflare Tunnel (HTTPS/WSS)

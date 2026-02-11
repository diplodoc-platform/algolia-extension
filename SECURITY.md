# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, please report it privately.

### How to Report

1. **Email**: Send details to [opensource@yandex-team.ru](mailto:opensource@yandex-team.ru)
2. **Subject**: Include `[SECURITY]` in the subject line
3. **Details**: Please include:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Suggested fix (if you have one)

### What to Expect

- We will acknowledge receipt of your report within 48 hours
- We will provide an initial assessment within 7 days
- We will keep you informed of our progress
- We will notify you when the vulnerability is fixed
- We will credit you in the security advisory (unless you prefer to remain anonymous)

### Disclosure Policy

- We will work with you to fix the vulnerability
- We will coordinate public disclosure after a fix is available
- We will credit you for the discovery (unless you prefer otherwise)

## Security Best Practices

When using this library:

- Keep dependencies up to date (`npm audit`)
- Do not expose Algolia API keys in client-side code; use search-only key for frontend
- Use HTTPS in production environments

Thank you for helping keep this project secure! 🔒

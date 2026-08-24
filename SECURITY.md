# Security Notes

- Secrets belong in environment variables only.
- Production requires a JWT secret of at least 32 characters.
- Login has a dedicated rate limit.
- Socket connections authenticate with the same JWT as the API.
- Branch access is enforced server-side; UI hiding is not treated as authorization.
- Inventory and checkout operations use database transactions and server-side validation.
- Never restore the removed demo credentials in a public deployment.

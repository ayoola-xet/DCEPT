# Security policy

## Supported versions

DCEPT is in pre-release development. The project supports the latest commit on
the `master` branch. Earlier commits do not receive security updates.

## Report a vulnerability

Do not open a public issue for a possible vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/ayoola-xet/DCEPT/security/advisories/new).

Include these items:

- The affected component and commit.
- The conditions that cause the problem.
- The effect of the problem.
- Reproduction steps or a small proof of concept.
- A proposed correction, if available.

Do not include private keys, live credentials, or user data. Use test data.

The maintainers will try to acknowledge the report within 14 days. They will
coordinate validation, correction, disclosure, and reporter credit. The actual
schedule depends on the severity and the required change.

## Security limits

DCEPT sends requests to user-selected targets. A scenario can contain a write
request. Review each scenario before you run it. Use isolated test targets for
write requests.

The public server route is a limited convenience service. It is not a security
boundary for a private network. Apply network egress controls and rate limits
when you deploy it.

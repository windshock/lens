# Privacy-first network observation design

This is a design note for a future `network_hook.js`. It intentionally does not implement request interception yet.

## Goal

Observe where a suspicious rendered page attempts to send data, not the secret value it sends.

## Allowed metadata

If implemented, the hook may record only endpoint metadata:

- endpoint URL
- HTTP method
- off-origin boolean
- API type: `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket`
- timestamp

## Prohibited data

The hook must never record:

- POST body
- `FormData` values
- password, email, token, or private key values
- `Authorization` headers
- cookies
- full request headers

## Detection use

Endpoint metadata may support hard-evidence or high-risk decisions only when combined with other page evidence, such as:

- credential-like form fields
- phishing-kit markers
- brand impersonation evidence
- hidden or prefilled account hints

Webhook or messaging-platform endpoints by themselves are not enough to classify a page as phishing.

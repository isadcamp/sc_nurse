# Feature template

## Objective
Describe the user's task and expected result.

## Acceptance criteria
- Valid input and expected response
- Invalid input and error message
- Loading, empty and failure states

## Implementation
- API contract: docs/openapi.yaml
- Domain/service: backend/internal/<feature>
- HTTP handler: backend/internal/httpapi
- UI and types: frontend/src
- API tests: backend/internal/httpapi
- E2E journey: tests/e2e/specs

## Verification
Record executed commands, results and known limitations.

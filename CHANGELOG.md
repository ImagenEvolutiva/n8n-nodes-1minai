# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial node implementation (`OneMinAi`, display name "1min.AI") with five resources:
  Chat (Send Prompt), Conversation (Create), AI Feature (Execute), Asset (Upload, experimental), Result (Get).
- `OneMinAiApi` credentials: API key, optional base URL override, optional auth header style
  (`API-KEY` default, `Authorization: Bearer` alternative), side-effect-free credential test.
- Shared transport in `GenericFunctions.ts`: auth headers, error enrichment, JSON parameter
  parsing, tolerant text/UUID extraction, manual multipart framing (no `form-data` dependency).
- Credential test uses the documented, side-effect-free `GET /api/results/{id}` endpoint.
- `usableAsTool` support for the n8n AI Agent.

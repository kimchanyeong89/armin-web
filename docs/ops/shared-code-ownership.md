# Shared Code Ownership Policy

## Purpose

This document defines how shared logic is owned and reviewed so web/mobile changes stay in sync.

## Scope

- `packages/shared/**`
- Web/mobile bridge files that re-export shared types/utils
- Firebase port contract changes used by both web and mobile

## Ownership Rule

- Shared-first: if logic can be reused by web and mobile, implement in shared first.
- No duplicate business rules in `src/**` and `apps/mobile/**`.
- Platform-specific code is allowed only in adapter layers.

## PR Review Checklist

1. Does this logic belong in `packages/shared`?
2. If not moved to shared, is there a clear platform-only reason?
3. Are web and mobile imports consuming shared module instead of local duplicate code?
4. If shared contract changed, were both adapters checked?
5. Were regression checks run?
   - `npm run build`
   - `npm --prefix apps/mobile exec tsc --noEmit`

## Required Files for Shared Contract Changes

- Update shared type/utility source in `packages/shared/src/**`
- Keep bridge exports aligned in:
  - `src/types/**`
  - `src/utils/**` (where re-export is used)
  - `src/adapters/**` and `apps/mobile/adapters/**` (if port changes)

## Exceptions

- UI-only behavior, layout, and platform native APIs may stay local.
- Performance-sensitive platform code can stay local if documented in PR.

## Change Logging

- Record major shared contract updates in roadmap execution logs.
- Include migration notes when IDs or payload shapes change.
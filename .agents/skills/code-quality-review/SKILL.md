---
name: code-quality-review
description: Post-execution principal engineering code quality audit. Automatically triggers after writing or modifying code to verify SOLID, DRY, KISS, minimal footprint, regex optimization, and zero unnecessary boilerplate.
---

# Senior Principal Code Quality & Refactoring Review Skill

Use this skill immediately after writing or modifying any code in this codebase to audit and optimize all changes before declaring a task complete.

## Core Architectural Pillars

### 1. SOLID Engineering Standards
- **Single Responsibility (SRP)**: Each function/module must do exactly one thing. Separate parsing, validation, data transformation, and rendering/persistence into clear, dedicated boundaries.
- **Open/Closed (OCP)**: Write code that is extensible via constants, configurations, or parameters without needing to modify core tested control flow.
- **Liskov Substitution (LSP)**: Ensure sub-types, fallbacks, and optional field handlers respect callers' expectations without throwing unexpected null pointers or contract violations.
- **Interface Segregation (ISP)**: Keep TypeScript interfaces and function signatures lean and targeted. Don't require large objects when narrow, specific types suffice.
- **Dependency Inversion (DIP)**: Depend on abstractions (e.g. Prisma models, NestJS injected services, shared interface types) rather than raw tightly-coupled implementations.

### 2. DRY (Don't Repeat Yourself) & Utility Reuse
- **Zero Duplication**: Never copy-paste status checkers, string splitters, date parsers, or API formatters across files or services.
- **Shared Modules**: Place frontend utilities under `lib/` and backend utilities in `backend/src/common/` or dedicated shared service modules.
- **Centralized Constants**: Move recurring regex patterns, status codes, and configuration keys to top-level module constants.

### 3. KISS (Keep It Simple, Stupid) & Early Returns
- **Flattened Control Flow**: Replace nested `if/else` structures with guard clauses and early returns.
- **No Over-Engineering**: Avoid creating complex design patterns (factories, abstract classes, custom event buses) for simple, straightforward problems.
- **Readable Declarative Expressions**: Prefer self-explanatory regex matchers (`/^AVL|^CURR_AV/i`) or single-pass array pipelines over multi-pass loops or repetitive string slicing.

### 4. Line-Count & Footprint Optimization
- **Minimal Surface Area**: Fewer lines of code directly correlate with fewer bugs and lower long-term maintenance costs.
- **No Boilerplate Overhead**: Eliminate redundant intermediate variables, unused imports, empty try/catch re-throws, and dead code branches.
- **Declarative Operations**: Compress multi-branch checks into concise array/set lookups or regex pattern evaluations.

### 5. Long-Term Maintainability & Type Safety
- **Strict TypeScript Types**: No `any` type leaks or loose `record<string, unknown>` when domain types or Prisma types exist.
- **Self-Documenting Naming**: Name variables and functions by intent (e.g., `isIrctcDirectBookable`, `CONFIRMED_LEG_STATUS_RE`) so code explains itself without requiring verbose comments.
- **Defensive Error Handling**: Catch specific exceptions (e.g. Prisma `P2002`, HTTP 403 proxy anti-bot blocks) and return clean HTTP/domain errors rather than letting unhandled crashes reach Sentry.

## Post-Edit Verification Checklist

- [ ] **SOLID & KISS Audit**: Are responsibilities clearly separated, control flow flattened, and over-engineering avoided?
- [ ] **DRY & Utility Audit**: Is any logic repeated? Are project utilities in `lib/` or `backend/src/` reused?
- [ ] **Footprint & Line Count Audit**: Is the implementation expressed in the minimal possible lines of code without sacrificing readability?
- [ ] **Type Safety & Schema Audit**: Do types strictly align with TypeScript definitions and Prisma schema contracts?
- [ ] **Automated Testing & Linting**: Run `cd backend && npm test` and `npm run lint` to verify 100% test pass rate and clean lint output.

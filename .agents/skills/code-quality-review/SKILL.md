---
name: code-quality-review
description: Post-execution principal engineering code quality audit. Automatically triggers after writing or modifying code to verify DRY, KISS, minimal footprint, regex optimization, and zero unnecessary boilerplate.
---

# Code Quality & Refactoring Review Skill

Use this skill immediately after writing or modifying code in this codebase to audit and optimize all newly written or modified code before declaring a task complete.

## Quality Audit Principles

1. **Minimal Code Footprint**:
   - Verify if any multi-line `if/else` branching or repetitive string/array operations can be expressed as a concise, declarative regex or pipeline operation.
   - Eliminate redundant `.split()`, `.map()`, `.filter()`, or duplicate string normalization calls.

2. **DRY & Shared Utilities**:
   - Ensure logic isn't duplicated across files.
   - Verify existing helpers in `lib/` (frontend) or `backend/src/` (backend) are reused before introducing new logic.

3. **No Dead Code & Unnecessary Layers**:
   - Strip unused imports, unused variables, and intermediate assignments that add no value.

4. **Safety & Correctness**:
   - Ensure all parameters, return types, and Prisma models match exact definitions.

## Execution Checklist

- [ ] Audit modified files against the principles above.
- [ ] Refactor any identified verbosity into concise, principal-engineer level code.
- [ ] Run backend unit tests (`cd backend && npm test`) and frontend/backend linter (`npm run lint`) to confirm 100% pass rate.

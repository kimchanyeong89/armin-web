# Design System Builder Skill Design

## Goal

Create one global design implementation skill that Claude Code and Codex can both use. The skill must inspect an existing project, recommend a coherent UI library strategy, wait for approval, implement the approved interface, and verify the result.

## Source principle

The referenced Threads post recommends giving an AI an established styling or component library instead of asking it to invent every component. This improves visual consistency and usually reduces custom code and defects. The proposed skill turns that advice into a repeatable workflow rather than always forcing the same library.

## Installation architecture

Keep one authoritative skill folder:

```text
~/.local/share/agent-skills/design-system-builder/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── library-selection.md
    └── quality-bar.md
```

Expose the same folder to both agents through symbolic links:

```text
~/.agents/skills/design-system-builder
~/.claude/skills/design-system-builder
```

This avoids two copies of the same design rules. `SKILL.md` uses only the portable `name` and `description` frontmatter fields. `agents/openai.yaml` supplies optional Codex UI metadata and does not affect Claude Code.

## Workflow

1. Inspect the framework, package manager, existing CSS and component libraries, design tokens, reusable components, and repository instructions.
2. Preserve an existing design system when one is present.
3. If the project has no established system, choose one primary approach:
   - Tailwind CSS for precise implementation of an existing design or Figma source.
   - shadcn/ui as the default component system for compatible React and Tailwind projects.
   - Flowbite when it is already present, explicitly requested, or rapid generic UI delivery is the main constraint.
   - Magic UI only as a restrained enhancement for a few high-value motion or presentation moments.
4. Present a short design brief containing the visual direction, library choice and rationale, tokens, components, affected files, dependencies, and verification plan.
5. Wait for explicit approval before installing dependencies or modifying UI code.
6. Implement only the approved scope while matching the project's established conventions.
7. Run the project's existing checks and inspect responsive behavior, accessibility basics, interaction states, and console errors.
8. Report failed checks and unresolved risks instead of claiming completion.

## Guardrails

- Do not replace a working design system merely because another library is preferred.
- Do not use shadcn/ui and Flowbite as competing primary component systems in the same feature.
- Do not add motion without a functional or hierarchical purpose.
- Do not introduce a dependency when a suitable project component already exists.
- Do not copy a reference design literally when adaptation to the product's content and brand is required.
- Respect reduced-motion preferences, keyboard interaction, readable contrast, and responsive layouts.
- Keep changes surgical and remove only artifacts created by the implementation.

## Files

- `SKILL.md`: the mandatory, concise execution workflow.
- `references/library-selection.md`: the authoritative library decision rules and conflict policy.
- `references/quality-bar.md`: the implementation and verification checklist.
- `agents/openai.yaml`: Codex-facing display metadata generated from the final skill.

No scripts or assets are included. The target projects can use different frameworks, package managers, and test commands, so a generic automation script would add risk without a stable reusable operation.

## Verification

- Validate the folder with the official skill creator validator.
- Confirm the frontmatter contains only `name` and `description`.
- Confirm both discovery paths resolve to the same authoritative folder.
- Confirm every referenced file exists and no reference is duplicated in `SKILL.md`.
- Exercise the decision rules against representative scenarios: an existing design system, a new React/Tailwind project, a Figma-led implementation, and a project already using Flowbite.

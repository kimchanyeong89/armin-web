# Design System Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install one global design implementation skill that Claude Code and Codex discover from a shared source.

**Architecture:** Store the authoritative skill in `~/.local/share/agent-skills/design-system-builder` and expose it through symbolic links in each agent's user skill directory. Keep the cross-agent workflow in `SKILL.md`, place selection and quality details in two references, and include optional Codex UI metadata without using Claude-only frontmatter.

**Tech Stack:** Agent Skills `SKILL.md`, Markdown references, YAML UI metadata, POSIX symbolic links, skill-creator validation scripts.

---

### Task 1: Initialize the authoritative skill

**Files:**
- Create: `~/.local/share/agent-skills/design-system-builder/SKILL.md`
- Create: `~/.local/share/agent-skills/design-system-builder/agents/openai.yaml`
- Create: `~/.local/share/agent-skills/design-system-builder/references/`

**Step 1: Read the Codex interface metadata reference**

Read `~/.codex/skills/.system/skill-creator/references/openai_yaml.md` completely before generating metadata.

**Step 2: Confirm the destination is unused**

Run:

```bash
test ! -e "$HOME/.local/share/agent-skills/design-system-builder"
```

Expected: exit status 0.

**Step 3: Run the official initializer**

Run:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  design-system-builder \
  --path ~/.local/share/agent-skills \
  --resources references \
  --interface 'display_name=Design System Builder' \
  --interface 'short_description=Design and implement coherent production-ready interfaces' \
  --interface 'default_prompt=Use $design-system-builder to design and implement this interface with an appropriate component system.'
```

Expected: the skill, reference directory, and `agents/openai.yaml` are created successfully.

### Task 2: Write the portable skill workflow

**Files:**
- Modify: `~/.local/share/agent-skills/design-system-builder/SKILL.md`

**Step 1: Replace the generated template**

Write a `SKILL.md` containing only `name` and `description` in YAML frontmatter. Include these executable sections:

1. A core contract to inspect first, preserve existing systems, propose before changing, wait for approval, and verify before completion.
2. A project inspection workflow covering repository instructions, framework, package manager, styling stack, tokens, reusable components, dirty worktree state, and user-provided visual sources.
3. A selection step that requires `references/library-selection.md` whenever a UI stack might be added or changed.
4. A design brief containing direction, selected system, tokens, component plan, dependencies, affected files, and verification.
5. An approval gate before dependency installation or UI edits.
6. A surgical implementation workflow covering reusable components, complete states, responsive behavior, accessible semantics, and purposeful motion.
7. A verification workflow that requires `references/quality-bar.md` and reports exact evidence and unresolved failures.

**Step 2: Check portability**

Run:

```bash
sed -n '1,12p' ~/.local/share/agent-skills/design-system-builder/SKILL.md
rg -n 'allowed-tools|context:|agent:|disable-model-invocation|user-invocable' \
  ~/.local/share/agent-skills/design-system-builder/SKILL.md
```

Expected: frontmatter shows only `name` and `description`; `rg` returns no matches.

### Task 3: Write the reusable references

**Files:**
- Create: `~/.local/share/agent-skills/design-system-builder/references/library-selection.md`
- Create: `~/.local/share/agent-skills/design-system-builder/references/quality-bar.md`

**Step 1: Write the library decision guide**

Define one authoritative decision order: preserve the existing system, respect supplied designs, confirm framework compatibility, then minimize new dependencies. Cover Tailwind CSS as a utility foundation, shadcn/ui as the default compatible React component choice, Flowbite for existing or explicitly requested rapid generic UI, and Magic UI as a restrained enhancement rather than a primary system. Explicitly prohibit competing primary systems and include representative scenarios.

**Step 2: Write the quality checklist**

Define completion checks for visual hierarchy, tokens, typography, spacing, component states, responsive behavior, semantic HTML, keyboard and focus behavior, contrast, reduced motion, performance, tests, builds, and honest failure reporting.

**Step 3: Confirm references are reachable**

Run:

```bash
rg -n 'references/(library-selection|quality-bar)\.md' \
  ~/.local/share/agent-skills/design-system-builder/SKILL.md
test -f ~/.local/share/agent-skills/design-system-builder/references/library-selection.md
test -f ~/.local/share/agent-skills/design-system-builder/references/quality-bar.md
```

Expected: both references are named in `SKILL.md` and both files exist.

### Task 4: Expose the skill to Claude Code and Codex

**Files:**
- Create symlink: `~/.agents/skills/design-system-builder`
- Create symlink: `~/.claude/skills/design-system-builder`

**Step 1: Create the discovery directories**

Run:

```bash
mkdir -p ~/.agents/skills ~/.claude/skills
```

**Step 2: Confirm neither skill name already exists**

Run:

```bash
test ! -e ~/.agents/skills/design-system-builder
test ! -e ~/.claude/skills/design-system-builder
```

Expected: both commands exit successfully.

**Step 3: Create the symbolic links**

Run:

```bash
ln -s ~/.local/share/agent-skills/design-system-builder ~/.agents/skills/design-system-builder
ln -s ~/.local/share/agent-skills/design-system-builder ~/.claude/skills/design-system-builder
```

**Step 4: Verify both resolve to the authoritative source**

Run:

```bash
test ~/.agents/skills/design-system-builder/SKILL.md -ef \
  ~/.local/share/agent-skills/design-system-builder/SKILL.md
test ~/.claude/skills/design-system-builder/SKILL.md -ef \
  ~/.local/share/agent-skills/design-system-builder/SKILL.md
```

Expected: both commands exit successfully.

### Task 5: Validate and smoke-test the completed skill

**Files:**
- Verify: `~/.local/share/agent-skills/design-system-builder/`

**Step 1: Run the official validator**

Run:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  ~/.local/share/agent-skills/design-system-builder
```

Expected: the skill is valid.

**Step 2: Check the generated UI metadata**

Run:

```bash
python3 -c 'import pathlib, yaml; yaml.safe_load(pathlib.Path.home().joinpath(".local/share/agent-skills/design-system-builder/agents/openai.yaml").read_text())'
```

Expected: exit status 0.

**Step 3: Check representative decision coverage**

Run `rg` assertions confirming the references cover: preserving an existing system, React with shadcn/ui, Figma-led Tailwind use, an existing Flowbite project, restrained Magic UI, approval before implementation, reduced motion, responsive checks, and failed-check disclosure.

Expected: every scenario and quality guardrail has one authoritative match.

**Step 4: Inspect the final tree**

Run:

```bash
find ~/.local/share/agent-skills/design-system-builder -maxdepth 3 -type f -print | sort
ls -ld ~/.agents/skills/design-system-builder ~/.claude/skills/design-system-builder
```

Expected: only `SKILL.md`, `agents/openai.yaml`, and the two reference files exist; both discovery entries are symbolic links.

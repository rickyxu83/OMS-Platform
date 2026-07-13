# 安装 Matt Pocock 技能集

## Goal

通过官方安装器将 mattpocock/skills 安装到 Claude Code、Codex 与 OpenCode，并验证发现机制。

## Requirements

- Use the repository's official `skills` installer rather than manually
  copying skill directories.
- Target Claude Code, Codex, and OpenCode only.
- Preserve unrelated global settings, skills, plugins, chat histories, and
  credentials.
- Run the collection's documented setup flow after installation where the
  target client supports it.

## Acceptance Criteria

- [ ] The official installer has registered the selected Matt Pocock skills for
      Claude Code, Codex, and OpenCode.
- [ ] The setup skill has either completed or any client-specific limitation is
      documented.
- [ ] Each client has been checked for skill discovery after installation.
- [ ] No unrelated global configuration is removed or overwritten.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

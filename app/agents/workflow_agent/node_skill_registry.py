from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


NODE_SKILL_NAMES: dict[str, str] = {
    "start": "workflow-node-start",
    "llm": "workflow-node-llm",
    "selector": "workflow-node-selector",
    "code": "workflow-node-code",
    "loop": "workflow-node-loop",
    "end": "workflow-node-end",
}

_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_READABLE_SUFFIXES = frozenset({".md", ".json", ".yaml", ".yml", ".txt"})


@dataclass(frozen=True)
class BuiltinNodeSkill:
    node_type: str
    name: str
    description: str
    instructions: str
    skill_dir: Path


class NodeSkillRegistry:
    def __init__(self, root: Path | None = None) -> None:
        self._root = (root or _default_skills_root()).resolve()
        self._cache: dict[str, BuiltinNodeSkill] = {}

    def load(self, node_type: str) -> BuiltinNodeSkill:
        normalized = node_type.strip().lower()
        expected_name = NODE_SKILL_NAMES.get(normalized)
        if expected_name is None:
            raise ValueError(f"Unsupported workflow node skill type: {node_type}")
        cached = self._cache.get(normalized)
        if cached is not None:
            return cached

        skill_dir = (self._root / expected_name).resolve()
        _require_within(skill_dir, self._root, "Node Skill")
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.is_file():
            raise FileNotFoundError(f"Node Skill file not found: {skill_file}")

        metadata, instructions = _read_skill(skill_file)
        if metadata.get("name") != expected_name:
            raise ValueError(
                f"Node Skill name must be {expected_name}: {skill_file}"
            )
        description = str(metadata.get("description") or "").strip()
        if not description:
            raise ValueError(f"Node Skill description is required: {skill_file}")

        skill = BuiltinNodeSkill(
            node_type=normalized,
            name=expected_name,
            description=description,
            instructions=instructions,
            skill_dir=skill_dir,
        )
        self._cache[normalized] = skill
        return skill

    def load_many(self, node_types: set[str]) -> list[BuiltinNodeSkill]:
        return [
            self.load(node_type)
            for node_type in NODE_SKILL_NAMES
            if node_type in node_types
        ]

    def resolve_script(
        self,
        node_type: str,
        relative_path: str,
    ) -> Path:
        skill = self.load(node_type)
        scripts_root = (skill.skill_dir / "scripts").resolve()
        script_path = (skill.skill_dir / relative_path).resolve()
        _require_within(script_path, scripts_root, "Node Skill script")
        if script_path.suffix != ".py" or not script_path.is_file():
            raise FileNotFoundError(f"Node Skill script not found: {script_path}")
        return script_path

    def resolve_file(
        self,
        node_type: str,
        path: str,
    ) -> Path:
        skill = self.load(node_type)
        requested = Path(path)
        if requested.is_absolute():
            file_path = requested.resolve()
        else:
            file_path = (skill.skill_dir / requested).resolve()
        _require_within(file_path, skill.skill_dir, "Node Skill file")
        if file_path.suffix.lower() not in _READABLE_SUFFIXES:
            raise ValueError(
                "Node Skill read_file only supports text reference files: "
                + ", ".join(sorted(_READABLE_SUFFIXES))
            )
        if not file_path.is_file():
            raise FileNotFoundError(f"Node Skill file not found: {file_path}")
        return file_path


def render_node_skills_prompt(skills: list[BuiltinNodeSkill]) -> str:
    if not skills:
        return ""
    sections = [
        "# Available Workflow Node Skills",
        "Call read_file with the provided path before processing a node type.",
    ]
    for skill in skills:
        sections.append(
            f'<skill name="{skill.name}" node_type="{skill.node_type}" '
            f'path="{skill.name}/SKILL.md">\n{skill.description}\n</skill>'
        )
    return "\n\n".join(sections).strip()


def _default_skills_root() -> Path:
    return Path(__file__).resolve().parent / "node_skills"


def _read_skill(path: Path) -> tuple[dict[str, Any], str]:
    content = path.read_text(encoding="utf-8")
    match = _FRONTMATTER.match(content)
    if match is None:
        raise ValueError(f"Invalid Node Skill frontmatter: {path}")
    metadata = yaml.safe_load(match.group(1))
    if not isinstance(metadata, dict):
        raise ValueError(f"Invalid Node Skill metadata: {path}")
    return metadata, content[match.end() :].strip()


def _require_within(path: Path, root: Path, label: str) -> None:
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"{label} path escapes its allowed root") from exc

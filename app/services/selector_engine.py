from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.schemas.workflow import WorkflowNode, WorkflowSelectorCondition, WorkflowSelectorOperand


@dataclass(frozen=True)
class SelectorResult:
    branch: str
    matched: str | None


@dataclass(frozen=True)
class SelectorContext:
    node_input: dict[str, Any]
    variables: dict[str, Any]
    run_input: dict[str, Any]


class SelectorEngine:
    def evaluate(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
        variables: dict[str, Any] | None = None,
        run_input: dict[str, Any] | None = None,
    ) -> SelectorResult:
        context = SelectorContext(node_input=node_input, variables=variables or {}, run_input=run_input or {})
        if node.config.selectorBranches:
            return self._evaluate_structured_rules(node, context)
        return self._evaluate_legacy_prompt_rules(node, node_input)

    def _evaluate_structured_rules(self, node: WorkflowNode, context: "SelectorContext") -> SelectorResult:
        for branch in node.config.selectorBranches:
            if not branch.conditions:
                continue
            if all(self._match_condition(condition, context) for condition in branch.conditions):
                return SelectorResult(branch=branch.label or "if", matched=self._format_matched(branch.conditions))
        return SelectorResult(branch=node.config.selectorElseBranch or "else", matched=None)

    def _evaluate_legacy_prompt_rules(self, node: WorkflowNode, node_input: dict[str, Any]) -> SelectorResult:
        payload = json.dumps(node_input, ensure_ascii=False)
        for line in node.config.prompt.splitlines():
            if "=>" not in line:
                continue
            condition, branch = [part.strip() for part in line.split("=>", 1)]
            if condition and condition in payload:
                return SelectorResult(branch=branch, matched=condition)
        return SelectorResult(branch=node.config.selectorElseBranch or "else", matched=None)

    def _match_condition(self, condition: WorkflowSelectorCondition, context: "SelectorContext") -> bool:
        left = self._resolve_operand(condition.left, context)
        right = self._resolve_operand(condition.right, context)
        operator = condition.operator

        if operator == "equals":
            return left == right
        if operator == "not_equals":
            return left != right
        if operator == "length_gt":
            return self._safe_len(left) > self._safe_number(right)
        if operator == "length_gte":
            return self._safe_len(left) >= self._safe_number(right)
        if operator == "length_lt":
            return self._safe_len(left) < self._safe_number(right)
        if operator == "length_lte":
            return self._safe_len(left) <= self._safe_number(right)
        if operator == "not_contains":
            return self._stringify(right) not in self._stringify(left)
        return self._stringify(right) in self._stringify(left)

    def _resolve_operand(self, operand: WorkflowSelectorOperand, context: "SelectorContext") -> Any:
        if operand.sourceType == "literal":
            return operand.source
        return self._resolve_reference(context, operand.source)

    def _resolve_reference(self, context: "SelectorContext", source: str) -> Any:
        if not source:
            return context.node_input
        if "." in source:
            node_id, path = source.split(".", 1)
            node_value = context.variables.get(node_id)
            if isinstance(node_value, dict):
                return self._get_by_path(node_value, path)
        if source in context.variables:
            return context.variables.get(source)
        if source.startswith("input."):
            return self._get_by_path(context.run_input, source.removeprefix("input."))
        return self._get_by_path(context.node_input, source)

    def _get_by_path(self, value: Any, path: str) -> Any:
        current = value
        if not path:
            return current
        for part in path.split("."):
            if isinstance(current, dict):
                current = current.get(part)
                continue
            return None
        return current

    def _safe_len(self, value: Any) -> int:
        if value is None:
            return 0
        if isinstance(value, (str, list, tuple, dict, set)):
            return len(value)
        return len(str(value))

    def _safe_number(self, value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0

    def _stringify(self, value: Any) -> str:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        if value is None:
            return ""
        return str(value)

    def _format_matched(self, conditions: list[WorkflowSelectorCondition]) -> str:
        return " && ".join(
            f"{condition.left.source} {condition.operator} {condition.right.source}".strip()
            for condition in conditions
        )


selector_engine = SelectorEngine()

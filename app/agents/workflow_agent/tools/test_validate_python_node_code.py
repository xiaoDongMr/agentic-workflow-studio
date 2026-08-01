from __future__ import annotations

import json
import unittest

from app.agents.workflow_agent.tools.validate_python_node_code import (
    validate_python_node_code_tool,
)


class ValidatePythonNodeCodeToolTest(unittest.TestCase):
    def test_accepts_required_async_signature(self) -> None:
        result = json.loads(
            validate_python_node_code_tool.invoke(
                {
                    "code": (
                        "async def main(args: Args) -> Output:\n"
                        "    return {'value': args.params}\n"
                    )
                }
            )
        )
        self.assertTrue(result["valid"])

    def test_rejects_sync_entry(self) -> None:
        result = json.loads(
            validate_python_node_code_tool.invoke(
                {
                    "code": (
                        "def main(args: Args) -> Output:\n"
                        "    return {'value': args.params}\n"
                    )
                }
            )
        )
        self.assertFalse(result["valid"])
        self.assertEqual(result["issues"][0]["code"], "main_not_async")


if __name__ == "__main__":
    unittest.main()

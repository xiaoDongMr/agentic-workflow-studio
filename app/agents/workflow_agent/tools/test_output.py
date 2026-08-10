from __future__ import annotations

import json
import unittest

from app.agents.workflow_agent.tools.output import bounded_tool_json


class WorkflowToolOutputTest(unittest.TestCase):
    def test_small_payload_remains_structured(self) -> None:
        result = json.loads(
            bounded_tool_json(
                {"valid": True, "items": [1, 2, 3]},
                max_chars=1000,
            )
        )

        self.assertEqual(
            result,
            {"valid": True, "items": [1, 2, 3]},
        )

    def test_base64_payload_is_redacted(self) -> None:
        encoded = "A" * 1024
        result = json.loads(
            bounded_tool_json(
                {
                    "image": f"data:image/png;base64,{encoded}",
                    "nested": {"content": encoded},
                },
                max_chars=2000,
            )
        )

        self.assertEqual(result["image"]["redacted"], "base64")
        self.assertEqual(result["nested"]["content"]["redacted"], "base64")
        self.assertNotIn(encoded, json.dumps(result))

    def test_large_payload_returns_bounded_preview_and_digest(self) -> None:
        result_text = bounded_tool_json(
            {"items": [{"id": index, "value": "x" * 80} for index in range(100)]},
            max_chars=1000,
        )
        result = json.loads(result_text)

        self.assertLessEqual(len(result_text), 1000)
        self.assertTrue(result["truncated"])
        self.assertGreater(result["originalChars"], 1000)
        self.assertEqual(len(result["sha256"]), 64)
        self.assertTrue(result["preview"])


if __name__ == "__main__":
    unittest.main()

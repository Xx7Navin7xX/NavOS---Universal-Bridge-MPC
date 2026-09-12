#!/usr/bin/env python3
"""
Phase 4 Lifecycle Automated Test Suite for test-project.
Verifies artifacts, documentation, and validation execution from Phases 1 through 3.
Uses only the Python standard library (unittest, subprocess, sys, os, tempfile).
"""

import os
import sys
import tempfile
import unittest
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


class TestPhase4Lifecycle(unittest.TestCase):

    def test_01_baseline_inventory_report_exists(self):
        """Verify that Phase 1 BASELINE_INVENTORY.md exists and is non-empty."""
        report_path = os.path.join(SCRIPT_DIR, "BASELINE_INVENTORY.md")
        self.assertTrue(os.path.isfile(report_path), "BASELINE_INVENTORY.md does not exist.")
        self.assertGreater(os.path.getsize(report_path), 0, "BASELINE_INVENTORY.md is empty.")

    def test_02_baseline_inventory_content_integrity(self):
        """Verify that BASELINE_INVENTORY.md references all 5 pre-existing files and distinguishes them."""
        report_path = os.path.join(SCRIPT_DIR, "BASELINE_INVENTORY.md")
        with open(report_path, "r", encoding="utf-8") as f:
            content = f.read()

        for filename in ["config.ini", "README.md", "test_validate_config.py", "test.txt", "validate_config.py"]:
            self.assertIn(filename, content, f"BASELINE_INVENTORY.md missing reference to {filename}")

        self.assertIn("Pre-existing files", content)
        self.assertIn("BASELINE_INVENTORY.md", content)

    def test_03_readme_exists_and_references_lifecycle(self):
        """Verify that README.md exists and references BASELINE_INVENTORY.md, project purpose, and upcoming phases."""
        readme_path = os.path.join(SCRIPT_DIR, "README.md")
        self.assertTrue(os.path.isfile(readme_path), "README.md does not exist.")
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("BASELINE_INVENTORY.md", content, "README.md must reference BASELINE_INVENTORY.md")
        self.assertIn("Phase 1", content, "README.md must document Phase 1")
        self.assertIn("Phase 2", content, "README.md must document Phase 2")
        self.assertIn("Phase 3", content, "README.md must document Phase 3")
        self.assertIn("Phase 4", content, "README.md must document Phase 4")
        self.assertIn("Phase 5", content, "README.md must document Phase 5")

    def test_04_phase3_config_ini_exists_and_valid(self):
        """Verify that phase3_config.ini exists and has required keys."""
        config_path = os.path.join(SCRIPT_DIR, "phase3_config.ini")
        self.assertTrue(os.path.isfile(config_path), "phase3_config.ini does not exist.")
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("[phase3]", content)
        self.assertIn("environment", content)
        self.assertIn("enabled", content)
        self.assertIn("max_retries", content)
        self.assertIn("timeout_seconds", content)
        self.assertIn("log_level", content)

    def test_05_phase3_validator_script_exists(self):
        """Verify that validate_phase3_config.py exists and is non-empty."""
        validator_path = os.path.join(SCRIPT_DIR, "validate_phase3_config.py")
        self.assertTrue(os.path.isfile(validator_path), "validate_phase3_config.py does not exist.")
        self.assertGreater(os.path.getsize(validator_path), 0, "validate_phase3_config.py is empty.")

    def test_06_phase3_validator_executes_successfully(self):
        """Run validate_phase3_config.py on phase3_config.ini and verify exit code 0 and success output."""
        validator_path = os.path.join(SCRIPT_DIR, "validate_phase3_config.py")
        config_path = os.path.join(SCRIPT_DIR, "phase3_config.ini")

        cmd = [sys.executable, validator_path, config_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SCRIPT_DIR)

        self.assertEqual(result.returncode, 0, f"Validator failed with code {result.returncode}: {result.stderr}")
        self.assertIn("Validation successful", result.stdout)
        self.assertIn("complies with [phase3] contract", result.stdout)

    def test_07_phase3_validator_default_invocation(self):
        """Run validate_phase3_config.py with no args and verify it defaults to phase3_config.ini and succeeds."""
        validator_path = os.path.join(SCRIPT_DIR, "validate_phase3_config.py")
        cmd = [sys.executable, validator_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SCRIPT_DIR)

        self.assertEqual(result.returncode, 0, f"Default validator run failed: {result.stderr}")
        self.assertIn("Validation successful", result.stdout)

    def test_08_phase3_validator_rejects_invalid_config(self):
        """Verify that validate_phase3_config.py rejects invalid configs with exit code 1."""
        validator_path = os.path.join(SCRIPT_DIR, "validate_phase3_config.py")
        with tempfile.TemporaryDirectory() as tmpdir:
            bad_ini = os.path.join(tmpdir, "bad.ini")
            with open(bad_ini, "w", encoding="utf-8") as f:
                f.write("[phase3]\nenvironment = invalid_env\nenabled = not_a_bool\n")

            cmd = [sys.executable, validator_path, bad_ini]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SCRIPT_DIR)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Validation error", result.stderr)

    def test_09_preexisting_files_preserved_and_functional(self):
        """Verify pre-existing files are present and pre-existing validate_config.py works."""
        for filename in ["config.ini", "test.txt", "validate_config.py", "test_validate_config.py"]:
            file_path = os.path.join(SCRIPT_DIR, filename)
            self.assertTrue(os.path.isfile(file_path), f"Pre-existing file {filename} missing!")

        validator_path = os.path.join(SCRIPT_DIR, "validate_config.py")
        config_path = os.path.join(SCRIPT_DIR, "config.ini")
        cmd = [sys.executable, validator_path, config_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SCRIPT_DIR)
        self.assertEqual(result.returncode, 0)
        self.assertIn("Validation successful", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)

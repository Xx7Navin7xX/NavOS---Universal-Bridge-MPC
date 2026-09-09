#!/usr/bin/env python3
"""
Automated Unit Tests for validate_config.py
Uses only the Python standard library (unittest, tempfile, subprocess, sys, os).
Tests isolated temporary configurations and baseline config.ini.
"""

import os
import sys
import tempfile
import unittest
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VALIDATOR_PATH = os.path.join(SCRIPT_DIR, "validate_config.py")
BASELINE_CONFIG = os.path.join(SCRIPT_DIR, "config.ini")


class TestValidateConfig(unittest.TestCase):

    def run_validator(self, *args):
        """Helper to invoke validate_config.py CLI in a subprocess."""
        cmd = [sys.executable, VALIDATOR_PATH] + list(args)
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=SCRIPT_DIR
        )
        return result

    def create_temp_ini(self, content: str, directory: str, filename: str = "temp_config.ini") -> str:
        path = os.path.join(directory, filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_01_baseline_config_ini_succeeds(self):
        """Verify that existing baseline config.ini succeeds without errors."""
        res = self.run_validator(BASELINE_CONFIG)
        self.assertEqual(res.returncode, 0, f"Expected returncode 0, got {res.returncode}. stderr: {res.stderr}")
        self.assertIn("Validation successful", res.stdout)
        self.assertIn("vsync=True", res.stdout)
        self.assertIn("fullscreen=True", res.stdout)
        self.assertEqual(res.stderr.strip(), "")

    def test_02_default_invocation_succeeds(self):
        """Verify that invoking validator with no arguments defaults to config.ini and succeeds."""
        res = self.run_validator()
        self.assertEqual(res.returncode, 0)
        self.assertIn("Validation successful", res.stdout)

    def test_03_all_truthy_boolean_forms(self):
        """Verify that all documented truthy values (1, true, yes, on) succeed (case-insensitive)."""
        truthy_values = ["1", "true", "yes", "on", "TRUE", "On", "Yes", "tRuE"]
        with tempfile.TemporaryDirectory() as tmpdir:
            for val in truthy_values:
                ini_content = f"[video]\nvsync = {val}\nfullscreen = {val}\n"
                ini_path = self.create_temp_ini(ini_content, tmpdir, f"test_truthy_{val}.ini")
                res = self.run_validator(ini_path)
                self.assertEqual(
                    res.returncode, 0,
                    f"Truthy value '{val}' failed with code {res.returncode}: {res.stderr}"
                )
                self.assertIn("Validation successful", res.stdout)
                self.assertIn("vsync=True", res.stdout)
                self.assertIn("fullscreen=True", res.stdout)

    def test_04_all_falsy_boolean_forms(self):
        """Verify that all documented falsy values (0, false, no, off) succeed (case-insensitive)."""
        falsy_values = ["0", "false", "no", "off", "FALSE", "Off", "No", "fAlSe"]
        with tempfile.TemporaryDirectory() as tmpdir:
            for val in falsy_values:
                ini_content = f"[video]\nvsync = {val}\nfullscreen = {val}\n"
                ini_path = self.create_temp_ini(ini_content, tmpdir, f"test_falsy_{val}.ini")
                res = self.run_validator(ini_path)
                self.assertEqual(
                    res.returncode, 0,
                    f"Falsy value '{val}' failed with code {res.returncode}: {res.stderr}"
                )
                self.assertIn("Validation successful", res.stdout)
                self.assertIn("vsync=False", res.stdout)
                self.assertIn("fullscreen=False", res.stdout)

    def test_05_mixed_boolean_values(self):
        """Verify mixed truthy and falsy combinations."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ini_content = "[video]\nvsync = on\nfullscreen = 0\n"
            ini_path = self.create_temp_ini(ini_content, tmpdir, "mixed.ini")
            res = self.run_validator(ini_path)
            self.assertEqual(res.returncode, 0)
            self.assertIn("vsync=True", res.stdout)
            self.assertIn("fullscreen=False", res.stdout)

    def test_06_missing_video_section_fails(self):
        """Verify failure when [video] section is absent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ini_content = "[audio]\nvolume = 100\n"
            ini_path = self.create_temp_ini(ini_content, tmpdir, "no_video.ini")
            res = self.run_validator(ini_path)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("missing required section '[video]'", res.stderr)

    def test_07_missing_vsync_key_fails(self):
        """Verify failure when vsync key is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ini_content = "[video]\nfullscreen = true\n"
            ini_path = self.create_temp_ini(ini_content, tmpdir, "missing_vsync.ini")
            res = self.run_validator(ini_path)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("missing required key '[video].vsync'", res.stderr)

    def test_08_missing_fullscreen_key_fails(self):
        """Verify failure when fullscreen key is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ini_content = "[video]\nvsync = 1\n"
            ini_path = self.create_temp_ini(ini_content, tmpdir, "missing_fullscreen.ini")
            res = self.run_validator(ini_path)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("missing required key '[video].fullscreen'", res.stderr)

    def test_09_invalid_boolean_values_fail(self):
        """Verify failure when an unsupported boolean string is provided."""
        invalid_values = ["enabled", "disabled", "2", "none", "high", "active"]
        with tempfile.TemporaryDirectory() as tmpdir:
            for val in invalid_values:
                ini_content = f"[video]\nvsync = {val}\nfullscreen = true\n"
                ini_path = self.create_temp_ini(ini_content, tmpdir, f"invalid_{val}.ini")
                res = self.run_validator(ini_path)
                self.assertNotEqual(res.returncode, 0)
                self.assertIn("invalid boolean value", res.stderr)

    def test_10_nonexistent_file_fails(self):
        """Verify failure and descriptive error when file does not exist."""
        nonexistent = os.path.join(SCRIPT_DIR, "nonexistent_file_xyz123.ini")
        res = self.run_validator(nonexistent)
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("configuration file not found", res.stderr)

    def test_11_malformed_syntax_fails(self):
        """Verify failure when INI file syntax is corrupted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ini_content = "NOT_A_VALID_INI_FILE\n[video\nvsync = 1"
            ini_path = self.create_temp_ini(ini_content, tmpdir, "corrupt.ini")
            res = self.run_validator(ini_path)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("syntax/parsing failure", res.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)

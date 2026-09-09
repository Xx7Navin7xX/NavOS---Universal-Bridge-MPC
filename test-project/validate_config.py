#!/usr/bin/env python3
"""
Configuration Validator for test-project
Validates that an INI file conforms to the [video] configuration contract.
Uses only the Python standard library.
"""

import sys
import os
import argparse
import configparser

TRUTHY_VALUES = {"1", "true", "yes", "on"}
FALSY_VALUES = {"0", "false", "no", "off"}
ALLOWED_VALUES_STR = "1, 0, true, false, yes, no, on, off (case-insensitive)"


def parse_boolean(val: str, key_name: str) -> bool:
    normalized = val.strip().lower()
    if normalized in TRUTHY_VALUES:
        return True
    if normalized in FALSY_VALUES:
        return False
    raise ValueError(
        f"Validation error: invalid boolean value '{val.strip()}' for '[video].{key_name}'. "
        f"Allowed values are: {ALLOWED_VALUES_STR}"
    )


def validate_config(file_path: str) -> bool:
    if not os.path.exists(file_path):
        sys.stderr.write(f"Validation error: configuration file not found at '{file_path}'\n")
        return False

    parser = configparser.ConfigParser()
    try:
        read_files = parser.read(file_path, encoding="utf-8")
        if not read_files:
            sys.stderr.write(f"Validation error: unable to read configuration file at '{file_path}'\n")
            return False
    except configparser.Error as e:
        sys.stderr.write(f"Validation error: syntax/parsing failure in '{file_path}': {e}\n")
        return False

    if not parser.has_section("video"):
        sys.stderr.write(f"Validation error: missing required section '[video]' in '{file_path}'\n")
        return False

    video_sec = parser["video"]
    errors = []
    parsed_values = {}

    for key in ("vsync", "fullscreen"):
        if key not in video_sec:
            errors.append(f"Validation error: missing required key '[video].{key}'")
            continue

        raw_val = video_sec[key]
        try:
            parsed_values[key] = parse_boolean(raw_val, key)
        except ValueError as e:
            errors.append(str(e))

    if errors:
        for err in errors:
            sys.stderr.write(err + "\n")
        return False

    print(
        f"Validation successful: '{file_path}' complies with [video] contract "
        f"(vsync={parsed_values['vsync']}, fullscreen={parsed_values['fullscreen']})"
    )
    return True


def main():
    arg_parser = argparse.ArgumentParser(
        description="Validate INI configuration against [video] contract using standard library."
    )
    arg_parser.add_argument(
        "config_file",
        nargs="?",
        default="config.ini",
        help="Path to INI file to validate (default: config.ini)"
    )
    args = arg_parser.parse_args()

    success = validate_config(args.config_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

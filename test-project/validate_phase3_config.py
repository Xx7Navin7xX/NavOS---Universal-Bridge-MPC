#!/usr/bin/env python3
"""
Phase 3 Configuration Validator for test-project.
Validates that an INI file conforms to the [phase3] configuration contract.
Uses only the Python standard library.
"""

import sys
import os
import argparse
import configparser

ALLOWED_ENVIRONMENTS = {"test", "staging", "production"}
ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
TRUTHY_VALUES = {"1", "true", "yes", "on"}
FALSY_VALUES = {"0", "false", "no", "off"}


def parse_boolean(val: str, key_name: str) -> bool:
    normalized = val.strip().lower()
    if normalized in TRUTHY_VALUES:
        return True
    if normalized in FALSY_VALUES:
        return False
    raise ValueError(
        f"Validation error: invalid boolean value '{val.strip()}' for '[phase3].{key_name}'"
    )


def validate_phase3_config(file_path: str) -> bool:
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

    if not parser.has_section("phase3"):
        sys.stderr.write(f"Validation error: missing required section '[phase3]' in '{file_path}'\n")
        return False

    sec = parser["phase3"]
    errors = []
    parsed_config = {}

    # 1. environment
    if "environment" not in sec:
        errors.append("Validation error: missing required key '[phase3].environment'")
    else:
        env = sec["environment"].strip().lower()
        if env not in ALLOWED_ENVIRONMENTS:
            errors.append(
                f"Validation error: invalid environment '{sec['environment']}'. Allowed: {sorted(ALLOWED_ENVIRONMENTS)}"
            )
        else:
            parsed_config["environment"] = env

    # 2. enabled
    if "enabled" not in sec:
        errors.append("Validation error: missing required key '[phase3].enabled'")
    else:
        try:
            parsed_config["enabled"] = parse_boolean(sec["enabled"], "enabled")
        except ValueError as e:
            errors.append(str(e))

    # 3. max_retries
    if "max_retries" not in sec:
        errors.append("Validation error: missing required key '[phase3].max_retries'")
    else:
        try:
            retries = int(sec["max_retries"].strip())
            if retries < 0:
                errors.append("Validation error: '[phase3].max_retries' must be a non-negative integer")
            else:
                parsed_config["max_retries"] = retries
        except ValueError:
            errors.append(f"Validation error: '[phase3].max_retries' is not a valid integer: '{sec['max_retries']}'")

    # 4. timeout_seconds
    if "timeout_seconds" not in sec:
        errors.append("Validation error: missing required key '[phase3].timeout_seconds'")
    else:
        try:
            timeout = int(sec["timeout_seconds"].strip())
            if timeout <= 0:
                errors.append("Validation error: '[phase3].timeout_seconds' must be a positive integer")
            else:
                parsed_config["timeout_seconds"] = timeout
        except ValueError:
            errors.append(f"Validation error: '[phase3].timeout_seconds' is not a valid integer: '{sec['timeout_seconds']}'")

    # 5. log_level
    if "log_level" not in sec:
        errors.append("Validation error: missing required key '[phase3].log_level'")
    else:
        level = sec["log_level"].strip().upper()
        if level not in ALLOWED_LOG_LEVELS:
            errors.append(
                f"Validation error: invalid log_level '{sec['log_level']}'. Allowed: {sorted(ALLOWED_LOG_LEVELS)}"
            )
        else:
            parsed_config["log_level"] = level

    if errors:
        for err in errors:
            sys.stderr.write(err + "\n")
        return False

    print(
        f"Validation successful: '{file_path}' complies with [phase3] contract "
        f"(environment={parsed_config['environment']}, enabled={parsed_config['enabled']}, "
        f"max_retries={parsed_config['max_retries']}, timeout_seconds={parsed_config['timeout_seconds']}, "
        f"log_level={parsed_config['log_level']})"
    )
    return True


def main():
    arg_parser = argparse.ArgumentParser(
        description="Validate Phase 3 INI configuration against [phase3] contract using standard library."
    )
    arg_parser.add_argument(
        "config_file",
        nargs="?",
        default="phase3_config.ini",
        help="Path to INI file to validate (default: phase3_config.ini)"
    )
    args = arg_parser.parse_args()

    success = validate_phase3_config(args.config_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

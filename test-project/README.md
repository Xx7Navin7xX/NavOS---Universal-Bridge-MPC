# Video Configuration Contract

## Overview
This document defines the explicit validation contract for configuration files (e.g., `config.ini`) in `test-project`.
The specification defines supported sections, valid key-value pairs, accepted boolean representations, and validation behavior using only standard-library tooling with zero external packages.

---

## 1. Specification

### Section: `[video]`
The configuration file must contain the `[video]` section.

#### Supported Keys:
| Key | Type | Description | Default | Allowed Values |
|---|---|---|---|---|
| `vsync` | Boolean | Controls vertical synchronization | `true` | `1`, `0`, `true`, `false`, `yes`, `no`, `on`, `off` |
| `fullscreen` | Boolean | Controls full-screen display mode | `false` | `1`, `0`, `true`, `false`, `yes`, `no`, `on`, `off` |

---

## 2. Boolean Value Parsing Rules

All boolean values are case-insensitive. Whitespace around keys, values, and `=` delimiters is stripped.

- **Truthy Values (evaluate to `true`)**:
  - `"1"`
  - `"true"`
  - `"yes"`
  - `"on"`

- **Falsy Values (evaluate to `false`)**:
  - `"0"`
  - `"false"`
  - `"no"`
  - `"off"`

Any other value for `vsync` or `fullscreen` is considered invalid and will cause a validation failure.

---

## 3. Validation Behavior & Error Handling

1. **Missing Section**: If `[video]` is absent, validation fails with `MissingSectionError`.
2. **Missing Keys**: If either `vsync` or `fullscreen` is omitted, validation warns or falls back to defaults, or reports a missing required key error.
3. **Invalid Value**: If a key has an unsupported string (e.g. `vsync = enabled` or `fullscreen = 2`), validation fails with `InvalidValueError`.
4. **Unexpected Keys**: Unknown keys within `[video]` or unknown sections are reported as unexpected or ignored depending on strict mode.
5. **Exit Code**:
   - `0`: All configurations valid.
   - `1`: Validation errors detected.

---

## 4. Standard-Library Validator & Test Suite

The validator and automated test suite are implemented using only the Python standard library (`configparser`, `argparse`, `unittest`, `tempfile`) without any third-party dependencies.

### How to Run Validator:
```bash
# Validate default config.ini:
python validate_config.py

# Validate a specific INI file:
python validate_config.py path/to/config.ini
```

### How to Run Automated Tests:
```bash
# Run the complete test suite (11 unit tests):
python test_validate_config.py
```

---

## 5. Baseline File Protection
- `config.ini`: Baseline configuration is preserved unmodified (`vsync = 1`, `fullscreen = true`).
- `test.txt`: Baseline marker file is preserved unmodified.

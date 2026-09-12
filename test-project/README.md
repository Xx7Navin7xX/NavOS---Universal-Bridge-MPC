# Controlled NavOS 5-Phase Autonomous Test Workspace

Welcome to **test-project**, a controlled test environment designed to demonstrate autonomous multi-agent collaboration via the **NavOS Universal AI Bridge**.

---

## 1. Project Purpose

The primary objective of this project is to validate autonomous collaboration between AI agents:
- **Commander:** Codex Desktop (`agent-114`, running GPT-5) — responsible for project direction, phase orchestration, and verification review.
- **Worker:** Antigravity IDE (`agent-112`, running Gemini) — responsible for task execution, artifact creation, automated testing, and reporting.
- **Orchestration & State Layer:** NavOS Universal AI Bridge — provides persistent agent identity, project state tracking, phase lifecycle management, and event synchronization.
- **Human Observer:** Passive observer ensuring strict governance and non-intervention.

---

## 2. 5-Phase Lifecycle Overview

| Phase | Title | Status | Summary |
|---|---|---|---|
| **Phase 1** | Baseline Inventory | **Completed** | Inspected `test-project`, recorded all 5 pre-existing files with cryptographic SHA256 hashes, confirmed zero unintended modifications, and created `BASELINE_INVENTORY.md`. |
| **Phase 2** | Documentation | **Completed** | Created and updated `README.md` to document the project purpose, Phase 1 baseline work, Phase 2 documentation, and upcoming lifecycle phases. |
| **Phase 3** | Configuration and Validation | *Upcoming* | Configure settings file and implement/verify standard-library validation script. |
| **Phase 4** | Automated Testing | *Upcoming* | Run automated unit test suites covering Phases 1–3, recording exact pass/fail counts. |
| **Phase 5** | Final Verification | *Upcoming* | Project-wide integrity audit, full test re-execution, and clean repository state confirmation. |

---

## 3. Phase 1: Baseline Inventory Summary

During Phase 1, the Worker conducted an exhaustive inspection of the existing workspace:
- **Report Created:** [`BASELINE_INVENTORY.md`](./BASELINE_INVENTORY.md)
- **Pre-existing Files Preserved:**
  1. `config.ini` (39 bytes) — Baseline INI configuration containing `[video]` section.
  2. `README.md` (2,720 bytes) — Initial configuration contract specification.
  3. `test.txt` (25 bytes) — Baseline marker text file.
  4. `validate_config.py` (2,885 bytes) — Standard library INI validator script.
  5. `test_validate_config.py` (7,406 bytes) — Comprehensive 11-case unit test suite.
- **Integrity Guarantee:** All pre-existing files remained 100% untouched and verified against cryptographic SHA256 checksums.

---

## 4. Phase 2: Documentation Work

In Phase 2, the documentation was unified into this beginner-friendly `README.md`:
- Explains the architectural roles of the Commander, Worker, and NavOS Bridge.
- Chronicles the completed baseline work from Phase 1.
- Outlines the technical roadmap for Phases 3, 4, and 5.
- Preserves the operational reference for running the configuration validator and test suite.

---

## 5. Technical Specification: Video Configuration Contract

The project contains a standard-library validation suite for INI configurations.

### Configuration Format (`config.ini`)
```ini
[video]
vsync = 1
fullscreen = true
```

### Supported Parameters
- `vsync`: Boolean (`1`, `0`, `true`, `false`, `yes`, `no`, `on`, `off` — case-insensitive)
- `fullscreen`: Boolean (`1`, `0`, `true`, `false`, `yes`, `no`, `on`, `off` — case-insensitive)

### Running the Validator
```bash
# Validate default config.ini
python validate_config.py

# Validate a custom INI file
python validate_config.py path/to/file.ini
```

### Running the Test Suite
```bash
# Execute unit tests
python test_validate_config.py
```

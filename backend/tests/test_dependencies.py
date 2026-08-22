from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"
BACKEND_LOCKFILE = PROJECT_ROOT / "backend" / "requirements-lock.txt"
ALGORITHM_REQUIREMENTS = PROJECT_ROOT / "ec_python_converted" / "requirements.txt"
ALGORITHM_LOCKFILE = PROJECT_ROOT / "ec_python_converted" / "requirements-lock.txt"

EXPECTED_SCIENTIFIC_VERSIONS = {
    "numpy": "1.26.4",
    "scipy": "1.13.1",
    "scikit-learn": "1.4.2",
    "threadpoolctl": "3.6.0",
}


def read_requirements(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        name, version = line.split("==", 1)
        normalized_name = name.split("[", 1)[0].strip().lower().replace("_", "-")
        entries[normalized_name] = version.strip()
    return entries


def test_direct_dependency_manifests_use_exact_versions():
    for manifest in (BACKEND_REQUIREMENTS, ALGORITHM_REQUIREMENTS):
        entries = read_requirements(manifest)
        assert entries
        requirement_lines = (
            line.strip()
            for line in manifest.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        )
        assert all("==" in line for line in requirement_lines)
        for package, version in EXPECTED_SCIENTIFIC_VERSIONS.items():
            assert entries[package] == version


def test_backend_lockfile_contains_all_direct_dependencies():
    direct_entries = read_requirements(BACKEND_REQUIREMENTS)
    lock_entries = read_requirements(BACKEND_LOCKFILE)

    assert BACKEND_LOCKFILE.is_file()
    assert lock_entries
    for package, version in direct_entries.items():
        assert lock_entries[package] == version


def test_algorithm_lockfile_contains_all_direct_dependencies():
    direct_entries = read_requirements(ALGORITHM_REQUIREMENTS)
    lock_entries = read_requirements(ALGORITHM_LOCKFILE)

    assert ALGORITHM_LOCKFILE.is_file()
    assert lock_entries
    for package, version in direct_entries.items():
        assert lock_entries[package] == version

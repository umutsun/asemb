"""Deterministic configuration checks that run against the live settings table
and corpus (read-only). Each check module is runnable standalone via
`python -m eval.checks.<name>` and follows the eval exit-code convention
(0 pass / 1 soft fail / 2 hard fail)."""

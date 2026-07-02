"""
Data Health Service
===================
Manages data quality for the unified_embeddings table:

1. Orphan detection: embedding rows whose source-DB record no longer exists
2. Metadata fix: fill missing metadata from the source DB
3. Duplicate detection: repeated rows with identical content hashes
4. Stale detection: old rows that were never updated
5. Schema-driven checks (system DB only): required-metadata coverage,
   pairing gaps (e.g. EN<->AR law versions), knowledge-graph health

Configuration is settings-driven (settings table, category `dataHealth`).
The module-level DEFAULT_* constants below are the single in-code fallback:
- dataHealth.metadataFields    JSON map source_table -> required metadata keys
- dataHealth.selfSourcedTables JSON array of tables whose rows have no external
                               source DB (orphan/pending checks are skipped)
- dataHealth.pairing           JSON {enabled, groupField, dimensionField,
                               expected[], sourceTable} for pairing-gap checks

Usage:
    from services.data_health import DataHealthService

    service = DataHealthService(system_pool, source_pool)  # source_pool optional
    report = await service.generate_health_report()
    fixed = await service.fix_missing_metadata("ozelge", dry_run=False)
"""

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import asyncpg

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Settings-driven configuration defaults (Hard Rules #1/#2): each key below is
# read from the `settings` table (category `dataHealth`); these constants are
# the single in-code fallback used when the row is absent.
# ---------------------------------------------------------------------------

# settings key: dataHealth.metadataFields
# Map of source_table (substring pattern) -> metadata keys required on its
# embedding rows. 'default' applies to tables without an explicit entry.
DEFAULT_METADATA_FIELDS: Dict[str, List[str]] = {
    'ozelge': ['daire', 'tarih', 'sayisirano', 'konusu'],
    'danistaykararlari': ['daire', 'tarih', 'esasno', 'kararno', 'konusu'],
    'sorucevap': ['donemi', 'soru', 'cevap'],
    'makale': ['yazar', 'baslik', 'tarih', 'dergi'],
    # Crawler tables with jsonb metadata
    'gib_sirkuler': ['title', 'category', 'category_tr', 'crawled_at'],
    'vergilex_gib_sirkuler': ['title', 'category', 'category_tr', 'crawled_at'],
    'vergilex_mevzuat': ['title', 'category', 'category_tr', 'crawled_at'],
    'vergilex_mevzuat_kanunlar': ['title', 'category', 'category_tr', 'crawled_at'],
    # Special tables with limited fields
    'maliansiklopedi': ['kavram'],  # only 'kavram' (no tarih/baslik columns)
    'hukdkk': ['tarih', 'genelsirano', 'yayinsirano', 'gecerlilik', 'ozeti'],
    'default': ['tarih', 'baslik', 'yazar', 'dergi', 'daire']
}

# settings key: dataHealth.selfSourcedTables
# Tables ingested directly into unified_embeddings (no external source DB row
# to compare against) — orphan/pending checks are SKIPPED for them, not failed.
DEFAULT_SELF_SOURCED_TABLES: List[str] = []

# settings key: dataHealth.pairing
# Generic pairing-gap check: groupField values (e.g. law_key) missing one of
# the expected dimensionField values (e.g. lang en/ar) within sourceTable.
DEFAULT_PAIRING: Dict[str, Any] = {
    "enabled": False,
    "groupField": "law_key",
    "dimensionField": "lang",
    "expected": ["en", "ar"],
    "sourceTable": "uae_legislation",
}

# Primary-key fallback per source table. Only a first guess: the actual column
# is detected dynamically whenever the source pool is available.
DEFAULT_PRIMARY_KEYS: Dict[str, str] = {
    'ozelge': 'row_id',
    'danistaykararlari': 'row_id',
    'sorucevap': 'row_id',
    'makale': 'row_id',
    'hukdkk': 'row_id',
    # Crawler tables use 'id' as PK
    'gib_sirkuler': 'id',
    'vergilex_gib_sirkuler': 'id',
    'vergilex_mevzuat': 'id',
    'vergilex_mevzuat_kanunlar': 'id',
    'maliansiklopedi': 'id',
    'default': 'row_id'
}

# How long a loaded dataHealth.* settings snapshot stays cached.
_CONFIG_TTL_SECONDS = 60.0


@dataclass
class HealthMetrics:
    """Data-health metrics for one table (or the whole corpus)."""
    total_embeddings: int = 0
    orphan_count: int = 0
    missing_metadata_count: int = 0
    duplicate_count: int = 0
    stale_count: int = 0
    healthy_count: int = 0
    health_score: float = 0.0  # 0-100


@dataclass
class OrphanRecord:
    """Details of one orphan embedding row."""
    id: int
    source_table: str
    source_id: int
    source_name: str
    created_at: datetime
    reason: str  # 'source_deleted', 'table_not_found', 'id_mismatch'


@dataclass
class MetadataFixResult:
    """Result of a metadata-fix pass."""
    table: str
    total_records: int
    fixed_count: int
    skipped_count: int
    error_count: int
    sample_fixes: List[Dict[str, Any]]


class DataHealthService:
    """
    Data-health service for unified embeddings.

    system_pool is required; source_pool is optional — when it is None (source
    DB unreachable or not configured) the system-DB-only checks still run and
    the source-dependent ones (orphans, pending) are reported as skipped.
    """

    def __init__(self, system_pool: asyncpg.Pool, source_pool: Optional[asyncpg.Pool] = None):
        """
        Args:
            system_pool: system DB pool (unified_embeddings, settings)
            source_pool: source DB pool (ozelge, mevzuat, ...) or None
        """
        self.system_pool = system_pool
        self.source_pool = source_pool
        self._pk_cache = {}  # Cache for detected PKs
        self._config_cache: Optional[Dict[str, Any]] = None
        self._config_loaded_at: float = 0.0

    # ==========================================
    # SETTINGS-DRIVEN CONFIGURATION
    # ==========================================

    async def _load_config(self) -> Dict[str, Any]:
        """Load dataHealth.* settings rows overlaid on the module defaults.

        Malformed rows are logged and surfaced in the report's `config.errors`
        but never break the health report — the in-code default for that key is
        used instead. The snapshot is cached briefly (_CONFIG_TTL_SECONDS).
        """
        now = time.monotonic()
        if self._config_cache is not None and (now - self._config_loaded_at) < _CONFIG_TTL_SECONDS:
            return self._config_cache

        config: Dict[str, Any] = {
            "metadata_fields": DEFAULT_METADATA_FIELDS,
            "self_sourced_tables": DEFAULT_SELF_SOURCED_TABLES,
            "pairing": DEFAULT_PAIRING,
            "overridden_keys": [],
            "errors": [],
        }
        key_map = {
            "dataHealth.metadataFields": "metadata_fields",
            "dataHealth.selfSourcedTables": "self_sourced_tables",
            "dataHealth.pairing": "pairing",
        }
        try:
            rows = await self.system_pool.fetch(
                "SELECT key, value FROM settings WHERE key = ANY($1::text[])",
                list(key_map.keys()),
            )
        except Exception as e:
            logger.warning(f"dataHealth settings lookup failed (using in-code defaults): {e}")
            rows = []
        for row in rows:
            target = key_map[row["key"]]
            try:
                config[target] = json.loads(row["value"])
                config["overridden_keys"].append(row["key"])
            except (json.JSONDecodeError, TypeError) as e:
                msg = f"settings row '{row['key']}' is not valid JSON ({e}); using in-code default"
                logger.error(msg)
                config["errors"].append(msg)

        self._config_cache = config
        self._config_loaded_at = now
        return config

    async def _metadata_fields_for(self, table_name: str) -> List[str]:
        """Required metadata keys for a source table (settings-driven; exact
        name first, then substring pattern match, then the 'default' entry)."""
        fields_map = (await self._load_config())["metadata_fields"]
        lowered = table_name.lower()
        if lowered in fields_map:
            return [str(f) for f in fields_map[lowered]]
        for pattern, fields in fields_map.items():
            if pattern != 'default' and pattern in lowered:
                return [str(f) for f in fields]
        return [str(f) for f in fields_map.get('default', DEFAULT_METADATA_FIELDS['default'])]

    async def _is_self_sourced(self, table_name: str) -> bool:
        """True when the table is configured as self-sourced (rows have no
        external source DB) — orphan/pending checks must be skipped for it."""
        tables = (await self._load_config())["self_sourced_tables"]
        return table_name.lower() in {str(t).lower() for t in tables}

    async def _source_check_skip_reason(self, table_name: str) -> Optional[str]:
        """Why a source-DB-dependent check cannot run for this table (None when
        it can)."""
        if await self._is_self_sourced(table_name):
            return "self-sourced table (dataHealth.selfSourcedTables) - no external source DB"
        if self.source_pool is None:
            return "source DB unreachable or not configured"
        return None

    async def _detect_pk_column(self, source_table: str) -> str:
        """Detect the source table's primary-key column (row_id or id).

        Falls back to the static DEFAULT_PRIMARY_KEYS mapping when the source
        pool is unavailable.
        """
        # Check cache first
        if source_table in self._pk_cache:
            return self._pk_cache[source_table]

        if self.source_pool is None:
            return DEFAULT_PRIMARY_KEYS.get(source_table, DEFAULT_PRIMARY_KEYS['default'])

        try:
            # Test if row_id exists
            await self.source_pool.fetchval(f'SELECT row_id FROM "{source_table}" LIMIT 1')
            self._pk_cache[source_table] = 'row_id'
            return 'row_id'
        except Exception:
            # Fallback to id
            self._pk_cache[source_table] = 'id'
            return 'id'

    async def generate_health_report(self) -> Dict[str, Any]:
        """
        Build the data-health report for all embedded tables.

        System-DB-only checks always run. Source-DB-dependent checks (orphans)
        are skipped — and listed under `skipped_checks` — for self-sourced
        tables and whenever the source DB is unreachable, instead of failing
        the whole report. Additive blocks: metadata_coverage, pairing_gaps,
        graph_health, skipped_checks, config (existing blocks are unchanged).
        """
        logger.info("Generating data health report...")
        config = await self._load_config()

        # Per-table metrics
        table_metrics = {}
        total_metrics = HealthMetrics()
        skipped_checks: List[str] = []

        # Discover tables present in unified_embeddings
        tables = await self._get_embedded_tables()

        for table_name in tables:
            skip = await self._source_check_skip_reason(table_name)
            if skip:
                skipped_checks.append(f"orphan check skipped for '{table_name}': {skip}")

            metrics = await self._analyze_table_health(table_name)
            table_metrics[table_name] = asdict(metrics)

            # Accumulate corpus totals
            total_metrics.total_embeddings += metrics.total_embeddings
            total_metrics.orphan_count += metrics.orphan_count
            total_metrics.missing_metadata_count += metrics.missing_metadata_count
            total_metrics.duplicate_count += metrics.duplicate_count
            total_metrics.stale_count += metrics.stale_count
            total_metrics.healthy_count += metrics.healthy_count

        # Overall health score
        if total_metrics.total_embeddings > 0:
            total_metrics.health_score = (
                total_metrics.healthy_count / total_metrics.total_embeddings
            ) * 100

        # Get table and index sizes
        size_info = await self._get_table_sizes()

        # Additive, system-DB-only checks (settings-driven)
        metadata_coverage = await self.metadata_field_coverage()
        pairing_gaps = await self.pairing_gaps()
        graph_health = await self.graph_health()

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": asdict(total_metrics),
            "tables": table_metrics,
            "size_info": size_info,
            "metadata_coverage": metadata_coverage,
            "pairing_gaps": pairing_gaps,
            "graph_health": graph_health,
            "skipped_checks": skipped_checks,
            "config": {
                "source_pool_available": self.source_pool is not None,
                "overridden_keys": config["overridden_keys"],
                "errors": config["errors"],
                "self_sourced_tables": config["self_sourced_tables"],
            },
            "recommendations": self._generate_recommendations(
                total_metrics, table_metrics,
                pairing_gaps=pairing_gaps, graph_health=graph_health,
            )
        }

    # ==========================================
    # SCHEMA-DRIVEN CHECKS (system DB only)
    # ==========================================

    async def metadata_field_coverage(self) -> Dict[str, Any]:
        """Per-table coverage of the configured required metadata keys
        (dataHealth.metadataFields): for each table+field, the share of
        embedding rows that carry the key. System DB only."""
        config = await self._load_config()
        out: Dict[str, Any] = {"tables": {}}
        for table_name, fields in config["metadata_fields"].items():
            if table_name == 'default':
                continue
            try:
                total = await self.system_pool.fetchval(
                    "SELECT COUNT(*) FROM unified_embeddings "
                    "WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)",
                    table_name,
                )
            except Exception as e:
                logger.error(f"Metadata coverage count failed for {table_name}: {e}")
                continue
            if not total:
                continue
            field_stats: Dict[str, Any] = {}
            for field in fields:
                cnt = await self.system_pool.fetchval(
                    "SELECT COUNT(*) FROM unified_embeddings "
                    "WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)) "
                    "AND metadata ? $2",
                    table_name, str(field),
                )
                field_stats[str(field)] = {
                    "count": cnt or 0,
                    "pct": round((cnt or 0) / total * 100, 2),
                }
            out["tables"][table_name] = {"total_rows": total, "fields": field_stats}
        return out

    async def pairing_gaps(self, max_examples: int = 10) -> Dict[str, Any]:
        """Generic pairing-gap check (dataHealth.pairing): groupField values
        (e.g. law_key) that are missing at least one of the expected
        dimensionField values (e.g. lang en/ar) in sourceTable. Returns the gap
        count plus the first `max_examples` gaps. System DB only."""
        pairing = (await self._load_config())["pairing"] or {}
        if not pairing.get("enabled"):
            return {"enabled": False}
        group_field = str(pairing.get("groupField", DEFAULT_PAIRING["groupField"]))
        dim_field = str(pairing.get("dimensionField", DEFAULT_PAIRING["dimensionField"]))
        expected = [str(v) for v in (pairing.get("expected") or DEFAULT_PAIRING["expected"])]
        source_table = str(pairing.get("sourceTable", DEFAULT_PAIRING["sourceTable"]))
        try:
            rows = await self.system_pool.fetch(
                """
                SELECT grp, dims FROM (
                    SELECT metadata->>$2 AS grp,
                           array_agg(DISTINCT metadata->>$3) AS dims
                    FROM unified_embeddings
                    WHERE LOWER(source_table) = LOWER($1)
                      AND metadata->>$2 IS NOT NULL
                      AND metadata->>$3 IS NOT NULL
                    GROUP BY 1
                ) g
                WHERE NOT (dims @> $4::text[])
                ORDER BY grp
                """,
                source_table, group_field, dim_field, expected,
            )
            total_groups = await self.system_pool.fetchval(
                "SELECT COUNT(DISTINCT metadata->>$2) FROM unified_embeddings "
                "WHERE LOWER(source_table) = LOWER($1) AND metadata->>$2 IS NOT NULL",
                source_table, group_field,
            )
        except Exception as e:
            logger.error(f"Pairing-gap check failed: {e}")
            return {"enabled": True, "error": str(e)}
        examples = [
            {
                "group": r["grp"],
                "present": sorted(d for d in (r["dims"] or []) if d is not None),
                "missing": sorted(set(expected) - set(r["dims"] or [])),
            }
            for r in rows[:max_examples]
        ]
        return {
            "enabled": True,
            "source_table": source_table,
            "group_field": group_field,
            "dimension_field": dim_field,
            "expected": expected,
            "total_groups": total_groups or 0,
            "gap_count": len(rows),
            "examples": examples,
        }

    async def graph_health(self) -> Dict[str, Any]:
        """Knowledge-graph health (system DB only): chunk_relationships
        resolution rate (resolved = target_chunk_id set) and entity-extraction
        coverage (share of chunks of the configured source tables that have
        chunk_entities rows)."""
        out: Dict[str, Any] = {"available": False}
        try:
            has_rel = await self.system_pool.fetchval(
                "SELECT to_regclass('chunk_relationships') IS NOT NULL")
            has_ent = await self.system_pool.fetchval(
                "SELECT to_regclass('chunk_entities') IS NOT NULL")
        except Exception as e:
            logger.error(f"Graph-health table check failed: {e}")
            return out
        if not (has_rel or has_ent):
            return out
        out["available"] = True
        try:
            if has_rel:
                total = await self.system_pool.fetchval(
                    "SELECT COUNT(*) FROM chunk_relationships") or 0
                resolved = await self.system_pool.fetchval(
                    "SELECT COUNT(*) FROM chunk_relationships WHERE target_chunk_id IS NOT NULL") or 0
                out["relationships"] = {
                    "total": total,
                    "resolved": resolved,
                    "resolution_rate": round(resolved / total, 4) if total else None,
                }
            if has_ent:
                config = await self._load_config()
                tables = [t.lower() for t in config["metadata_fields"].keys() if t != 'default']
                if tables:
                    total_chunks = await self.system_pool.fetchval(
                        "SELECT COUNT(*) FROM unified_embeddings "
                        "WHERE LOWER(source_table) = ANY($1::text[])", tables) or 0
                    covered = await self.system_pool.fetchval(
                        "SELECT COUNT(DISTINCT ue.id) FROM unified_embeddings ue "
                        "JOIN chunk_entities ce ON ce.chunk_id = ue.id "
                        "WHERE LOWER(ue.source_table) = ANY($1::text[])", tables) or 0
                    out["extraction"] = {
                        "source_tables": tables,
                        "total_chunks": total_chunks,
                        "chunks_with_entities": covered,
                        "coverage_pct": round(covered / total_chunks * 100, 2) if total_chunks else None,
                    }
        except Exception as e:
            logger.error(f"Graph-health metrics failed: {e}")
            out["error"] = str(e)
        return out

    async def _get_embedded_tables(self) -> List[str]:
        """Unified embeddings'de kayıtlı tabloları listele"""
        query = """
            SELECT DISTINCT
                LOWER(COALESCE(source_table, metadata->>'table')) as table_name,
                COUNT(*) as cnt
            FROM unified_embeddings
            WHERE source_table IS NOT NULL
              AND source_table != ''
              AND source_table != 'documents'
            GROUP BY LOWER(COALESCE(source_table, metadata->>'table'))
            ORDER BY cnt DESC
        """
        rows = await self.system_pool.fetch(query)
        return [r['table_name'] for r in rows if r['table_name']]

    async def _analyze_table_health(self, table_name: str) -> HealthMetrics:
        """Health analysis for a single table."""
        metrics = HealthMetrics()

        # Total embedding count (case-insensitive)
        count_query = """
            SELECT COUNT(*) as cnt FROM unified_embeddings
            WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)
        """
        result = await self.system_pool.fetchrow(count_query, table_name)
        metrics.total_embeddings = result['cnt']

        if metrics.total_embeddings == 0:
            return metrics

        # Orphan count (no matching row in the source DB; 0 when skipped)
        metrics.orphan_count = await self._count_orphans(table_name)

        # Missing metadata count
        metrics.missing_metadata_count = await self._count_missing_metadata(table_name)

        # Duplicate count (by content_hash)
        metrics.duplicate_count = await self._count_duplicates(table_name)

        # Stale count (older than 30 days, never updated)
        metrics.stale_count = await self._count_stale(table_name)

        # Healthy = total - (orphans + missing_meta + duplicates)
        unhealthy = metrics.orphan_count + metrics.missing_metadata_count + metrics.duplicate_count
        metrics.healthy_count = max(0, metrics.total_embeddings - unhealthy)

        # Health score
        metrics.health_score = (metrics.healthy_count / metrics.total_embeddings) * 100

        return metrics

    def _get_source_table_name(self, table_name: str) -> str:
        """Source DB'de gerçek tablo adını bul (csv_ prefix'li olabilir)"""
        # csv_ prefix'i varsa aynen döndür
        if table_name.startswith('csv_'):
            return table_name
        # Yoksa csv_ prefix'li versiyonu dene
        return f"csv_{table_name}"

    async def _count_orphans(self, table_name: str) -> int:
        """Count embedding rows without a matching source-DB row (cross-database).

        Returns 0 (check skipped) for self-sourced tables and when the source
        pool is unavailable — the skip is reported via generate_health_report's
        `skipped_checks` block, not as a failure here.
        """
        skip = await self._source_check_skip_reason(table_name)
        if skip:
            logger.info(f"Orphan check skipped for {table_name}: {skip}")
            return 0

        try:
            # Resolve the source table name (may carry a csv_ prefix)
            source_table = self._get_source_table_name(table_name)

            # Check that the source table exists
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # Retry without the csv_ prefix
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                # Table missing in the source DB: rows are NOT counted as
                # orphans (the data may come from a different origin)
                logger.warning(f"Source table not found: {table_name} or {source_table}")
                return 0

            # Cross-database: fetch source IDs first
            # CRITICAL: Migration ALWAYS uses row_id (or id as INTEGER) for source_id
            try:
                source_ids_query = f'SELECT row_id FROM "{source_table}"'
                source_rows = await self.source_pool.fetch(source_ids_query)
                source_ids = set(int(r['row_id']) for r in source_rows)
            except Exception:
                # Fallback to id column (as INTEGER)
                source_ids_query = f'SELECT id FROM "{source_table}"'
                source_rows = await self.source_pool.fetch(source_ids_query)
                source_ids = set(int(r['id']) for r in source_rows)

            if not source_ids:
                # Empty source table: every embedding is an orphan
                orphan_count_query = """
                    SELECT COUNT(*) FROM unified_embeddings
                    WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)
                """
                return await self.system_pool.fetchval(orphan_count_query, table_name)

            # Fetch the embedded source_ids from the system DB (case-insensitive)
            embedded_ids_query = """
                SELECT DISTINCT source_id FROM unified_embeddings
                WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)
            """
            embedded_rows = await self.system_pool.fetch(embedded_ids_query, table_name)

            # Orphan = embedded but not present in the source
            orphan_count = 0
            for row in embedded_rows:
                if row['source_id'] not in source_ids:
                    orphan_count += 1

            return orphan_count

        except Exception as e:
            logger.error(f"Error counting orphans for {table_name}: {e}")
            return 0

    async def _count_missing_metadata(self, table_name: str) -> int:
        """Count rows missing at least one of the configured required metadata
        keys for this table (dataHealth.metadataFields)."""
        meta_fields = await self._metadata_fields_for(table_name)
        if not meta_fields:
            return 0
        # metadata ?& array = "has ALL keys"; NOT(...) = missing at least one
        query = """
            SELECT COUNT(*) FROM unified_embeddings
            WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1))
            AND (
                metadata IS NULL
                OR metadata = '{}'::jsonb
                OR NOT (metadata ?& $2::text[])
            )
        """
        return await self.system_pool.fetchval(query, table_name, meta_fields)

    async def _count_duplicates(self, table_name: str) -> int:
        """Content hash bazlı duplicate sayısı (silinmesi gereken kayıt sayısı)"""
        query = """
            WITH dup_groups AS (
                SELECT content_hash, COUNT(*) - 1 as extra_copies
                FROM unified_embeddings
                WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1))
                AND content_hash IS NOT NULL
                GROUP BY content_hash
                HAVING COUNT(*) > 1
            )
            SELECT COALESCE(SUM(extra_copies), 0) as dup_count
            FROM dup_groups
        """
        result = await self.system_pool.fetchval(query, table_name)
        return max(0, result or 0)

    async def _count_stale(self, table_name: str, days: int = 30) -> int:
        """Eski/güncellenmemiş kayıtları say"""
        query = """
            SELECT COUNT(*) FROM unified_embeddings
            WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1))
            AND updated_at < NOW() - INTERVAL '%s days'
            AND updated_at = created_at
        """ % days
        return await self.system_pool.fetchval(query, table_name)

    # ==========================================
    # FIX OPERATIONS
    # ==========================================

    async def fix_missing_metadata(
        self,
        table_name: str,
        dry_run: bool = True,
        batch_size: int = 100,
        limit: int = 1000
    ) -> MetadataFixResult:
        """
        Fill missing metadata from the source DB.

        Skipped (zero-result, warning logged) for self-sourced tables and when
        the source DB is unreachable — there is nothing to backfill from.

        Args:
            table_name: table name
            dry_run: when True, report only — no changes
            batch_size: batch size
            limit: maximum number of rows to process
        """
        logger.info(f"Fixing missing metadata for {table_name} (dry_run={dry_run})")

        result = MetadataFixResult(
            table=table_name,
            total_records=0,
            fixed_count=0,
            skipped_count=0,
            error_count=0,
            sample_fixes=[]
        )

        skip = await self._source_check_skip_reason(table_name)
        if skip:
            logger.warning(f"Metadata fix skipped for {table_name}: {skip}")
            return result

        try:
            # Resolve the source table name
            source_table = self._get_source_table_name(table_name)

            # Check that the source table exists
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # Retry without the csv_ prefix
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                logger.warning(f"Source table {table_name} or {source_table} does not exist")
                return result

            # Dynamically detect PK column
            pk = await self._detect_pk_column(source_table)

            # Required metadata fields for this table (settings-driven)
            meta_fields = await self._metadata_fields_for(table_name)

            logger.info(f"Using metadata fields for {table_name}: {meta_fields}")

            # Select rows missing ANY of the required fields (parameterized:
            # metadata ?& array = "has ALL keys")
            missing_query = """
                SELECT id, source_id, metadata
                FROM unified_embeddings
                WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1))
                AND (
                    metadata IS NULL
                    OR metadata = '{}'::jsonb
                    OR NOT (metadata ?& $3::text[])
                )
                ORDER BY id ASC
                LIMIT $2
            """
            records = await self.system_pool.fetch(missing_query, table_name, limit, meta_fields)
            result.total_records = len(records)

            if not records:
                logger.info(f"No missing metadata found for {table_name}")
                return result

            # Process in batches
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                # Convert source_ids to integers for proper type matching
                source_ids = [int(r['source_id']) for r in batch if r['source_id'] is not None]

                if not source_ids:
                    continue

                # Fetch metadata columns from the source table (quoted identifiers)
                fields_sql = ", ".join(f'"{f}"' for f in meta_fields)
                source_query = f"""
                    SELECT {pk} as source_id, {fields_sql}
                    FROM "{source_table}"
                    WHERE {pk} = ANY($1::integer[])
                """
                source_data = await self.source_pool.fetch(source_query, source_ids)
                source_map = {int(r['source_id']): dict(r) for r in source_data}

                # Update metadata for each row
                for record in batch:
                    source_row = source_map.get(int(record['source_id']) if record['source_id'] else None)

                    if not source_row:
                        result.skipped_count += 1
                        continue

                    try:
                        # Build the new metadata - handle various types
                        raw_meta = record['metadata']
                        if raw_meta is None:
                            current_meta = {}
                        elif isinstance(raw_meta, str):
                            try:
                                current_meta = json.loads(raw_meta) if raw_meta else {}
                            except:
                                current_meta = {}
                        elif isinstance(raw_meta, dict):
                            current_meta = raw_meta
                        else:
                            # asyncpg Record or other type - convert to dict
                            current_meta = dict(raw_meta) if raw_meta else {}

                        new_meta = dict(current_meta)  # Safe copy

                        for field in meta_fields:
                            if field in source_row and source_row[field] is not None:
                                # Convert datetime to string for JSON serialization
                                value = source_row[field]
                                if hasattr(value, 'isoformat'):
                                    value = value.isoformat()
                                new_meta[field] = value

                        if not dry_run:
                            # Apply the update
                            update_query = """
                                UPDATE unified_embeddings
                                SET metadata = $1::jsonb, updated_at = NOW()
                                WHERE id = $2
                            """
                            await self.system_pool.execute(
                                update_query,
                                json.dumps(new_meta),
                                record['id']
                            )

                        result.fixed_count += 1

                        # Keep samples (first 5)
                        if len(result.sample_fixes) < 5:
                            result.sample_fixes.append({
                                "id": record['id'],
                                "source_id": record['source_id'],
                                "old_metadata": current_meta,
                                "new_metadata": new_meta
                            })

                    except Exception as e:
                        logger.error(f"Error fixing record {record['id']}: {e}")
                        result.error_count += 1

            logger.info(f"Metadata fix complete: {result.fixed_count} fixed, {result.skipped_count} skipped")
            return result

        except Exception as e:
            logger.error(f"Error in fix_missing_metadata: {e}")
            raise

    async def delete_orphans(
        self,
        table_name: str,
        dry_run: bool = True,
        limit: int = 1000
    ) -> Dict[str, Any]:
        """
        Delete orphan rows.

        Skipped (zero-result) for self-sourced tables and when the source DB is
        unreachable — rows must never be deleted without a source to compare to.

        Args:
            table_name: table name
            dry_run: when True, list only — no deletion
            limit: maximum number of rows to delete
        """
        logger.info(f"Deleting orphans for {table_name} (dry_run={dry_run})")

        result = {
            "table": table_name,
            "orphans_found": 0,
            "deleted_count": 0,
            "dry_run": dry_run,
            "sample_orphans": []
        }

        skip = await self._source_check_skip_reason(table_name)
        if skip:
            logger.warning(f"Orphan deletion skipped for {table_name}: {skip}")
            result["skipped_reason"] = skip
            return result

        try:
            # Resolve the source table name
            source_table = self._get_source_table_name(table_name)

            # Check that the source table exists
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # Retry without the csv_ prefix
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                logger.warning(f"Source table not found for orphan check: {table_name}")
                return result

            # Dynamically detect PK column
            pk = await self._detect_pk_column(source_table)
            logger.info(f"Detected PK column for {source_table}: {pk}")

            # Cross-database: fetch the source IDs first
            # CRITICAL: Migration ALWAYS uses row_id (or id as INTEGER) for source_id
            # Check if table has row_id column, if not use id (as INTEGER)
            try:
                # Try row_id first (most common)
                source_ids_query = f'SELECT row_id FROM "{source_table}"'
                source_rows = await self.source_pool.fetch(source_ids_query)
                source_ids = set(int(r['row_id']) for r in source_rows)
                logger.info(f"[ORPHAN] Using row_id for {source_table}")
            except Exception:
                # Fallback to id column (as INTEGER, not TEXT!)
                source_ids_query = f'SELECT id FROM "{source_table}"'
                source_rows = await self.source_pool.fetch(source_ids_query)
                # id might be TEXT or INTEGER, normalize to INTEGER
                source_ids = set(int(r['id']) for r in source_rows)
                logger.info(f"[ORPHAN] Using id (as INTEGER) for {source_table}")

            # Fetch the embedded rows from the system DB (case-insensitive)
            embedded_query = """
                SELECT id, source_id, source_name, created_at
                FROM unified_embeddings
                WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)
            """
            embedded_rows = await self.system_pool.fetch(embedded_query, table_name)
            logger.info(f"[ORPHAN] {table_name}: {len(source_ids)} source IDs, {len(embedded_rows)} embedded rows")

            # Orphan = embedded but not present in the source
            orphans = []
            for row in embedded_rows:
                if row['source_id'] not in source_ids:
                    orphans.append(row)
                    if len(orphans) >= limit:
                        break

            result["orphans_found"] = len(orphans)
            logger.info(f"[ORPHAN] Found {len(orphans)} orphans for {table_name}")

            # Keep samples
            for orphan in orphans[:10]:
                result["sample_orphans"].append({
                    "id": orphan['id'],
                    "source_id": orphan['source_id'],
                    "source_name": orphan['source_name'],
                    "created_at": orphan['created_at'].isoformat() if orphan['created_at'] else None
                })

            if not dry_run and orphans:
                orphan_ids = [o['id'] for o in orphans]
                delete_query = """
                    DELETE FROM unified_embeddings
                    WHERE id = ANY($1)
                """
                await self.system_pool.execute(delete_query, orphan_ids)
                result["deleted_count"] = len(orphan_ids)

            return result

        except Exception as e:
            logger.error(f"Error deleting orphans: {e}")
            raise

    async def delete_duplicates(
        self,
        table_name: str,
        dry_run: bool = True,
        keep: str = 'newest'  # 'newest' or 'oldest'
    ) -> Dict[str, Any]:
        """
        Duplicate kayıtları sil (content_hash bazlı)

        Args:
            table_name: Tablo adı
            dry_run: True ise silmez
            keep: 'newest' = en yeni kaydı tut, 'oldest' = en eski kaydı tut
        """
        logger.info(f"Deleting duplicates for {table_name} (dry_run={dry_run}, keep={keep})")

        result = {
            "table": table_name,
            "duplicates_found": 0,
            "deleted_count": 0,
            "dry_run": dry_run,
            "sample_duplicates": []
        }

        try:
            order = "DESC" if keep == 'newest' else "ASC"

            # Duplicate gruplarını bul
            dup_query = f"""
                WITH duplicates AS (
                    SELECT
                        content_hash,
                        array_agg(id ORDER BY created_at {order}) as ids,
                        COUNT(*) as cnt
                    FROM unified_embeddings
                    WHERE (LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1))
                    AND content_hash IS NOT NULL
                    GROUP BY content_hash
                    HAVING COUNT(*) > 1
                )
                SELECT
                    content_hash,
                    ids[1] as keep_id,
                    ids[2:] as delete_ids,
                    cnt
                FROM duplicates
            """
            duplicates = await self.system_pool.fetch(dup_query, table_name)
            logger.info(f"[DUPLICATE] Found {len(duplicates)} duplicate groups for {table_name}")

            all_delete_ids = []
            for dup in duplicates:
                result["duplicates_found"] += len(dup['delete_ids'])
                all_delete_ids.extend(dup['delete_ids'])

                if len(result["sample_duplicates"]) < 5:
                    result["sample_duplicates"].append({
                        "content_hash": dup['content_hash'][:16] + "...",
                        "keep_id": dup['keep_id'],
                        "delete_ids": dup['delete_ids'][:3],
                        "total_copies": dup['cnt']
                    })

            logger.info(f"[DUPLICATE] Total IDs to delete for {table_name}: {len(all_delete_ids)}")

            if not dry_run and all_delete_ids:
                delete_query = """
                    DELETE FROM unified_embeddings
                    WHERE id = ANY($1)
                """
                await self.system_pool.execute(delete_query, all_delete_ids)
                result["deleted_count"] = len(all_delete_ids)

            return result

        except Exception as e:
            logger.error(f"Error deleting duplicates: {e}")
            raise

    def _generate_recommendations(
        self,
        total: HealthMetrics,
        tables: Dict[str, Dict],
        pairing_gaps: Optional[Dict[str, Any]] = None,
        graph_health: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        """Derive recommendations from the health report."""
        recommendations = []

        if total.health_score < 80:
            recommendations.append(
                f"Overall health score is low ({total.health_score:.1f}%). "
                "Data cleanup is recommended."
            )

        if total.orphan_count > 0:
            recommendations.append(
                f"{total.orphan_count} orphan rows found. "
                "Clean up with delete_orphans()."
            )

        if total.missing_metadata_count > 0:
            recommendations.append(
                f"{total.missing_metadata_count} rows are missing required metadata. "
                "Fix with fix_missing_metadata() or a metadata backfill script."
            )

        if total.duplicate_count > 0:
            recommendations.append(
                f"{total.duplicate_count} duplicate rows found. "
                "Clean up with delete_duplicates()."
            )

        # Per-table recommendations
        for table_name, metrics in tables.items():
            if metrics['health_score'] < 50:
                recommendations.append(
                    f"Table '{table_name}' is in critical condition "
                    f"(score: {metrics['health_score']:.1f}%). "
                    "Cleanup should be prioritized."
                )

        # Pairing gaps (e.g. laws missing their EN or AR version)
        if pairing_gaps and pairing_gaps.get("enabled") and pairing_gaps.get("gap_count"):
            recommendations.append(
                f"{pairing_gaps['gap_count']} {pairing_gaps.get('group_field', 'group')} groups "
                f"are missing one of the expected {pairing_gaps.get('dimension_field', 'dimension')} "
                f"values {pairing_gaps.get('expected')}. Ingest the missing versions."
            )

        # Knowledge-graph health
        if graph_health and graph_health.get("available"):
            rel = graph_health.get("relationships") or {}
            rate = rel.get("resolution_rate")
            if rel.get("total") and rate is not None and rate < 0.5:
                recommendations.append(
                    f"Only {rate:.0%} of chunk_relationships are resolved "
                    "(target_chunk_id set). Run the reference resolver after ingesting "
                    "the referenced laws."
                )
            ext = graph_health.get("extraction") or {}
            cov = ext.get("coverage_pct")
            if ext.get("total_chunks") and cov is not None and cov < 50:
                recommendations.append(
                    f"Entity extraction covers only {cov:.1f}% of chunks in the configured "
                    "source tables. Run/resume the extraction batch job."
                )

        if not recommendations:
            recommendations.append("Data health looks good.")

        return recommendations

    # ==========================================
    # PENDING/STUCK EMBEDDING OPERATIONS
    # ==========================================

    async def get_pending_embeddings(self) -> Dict[str, Any]:
        """
        Find pending (not-yet-embedded) rows by comparing source-DB counts with
        unified_embeddings. Self-sourced tables and tables without a reachable
        source DB are skipped and listed under `skipped_tables`.
        """
        result = {
            "tables": {},
            "total_pending": 0,
            "total_embedded": 0,
            "total_source": 0,
            "skipped_tables": []
        }

        try:
            # Fetch the embedded tables
            tables = await self._get_embedded_tables()

            for table_name in tables:
                skip = await self._source_check_skip_reason(table_name)
                if skip:
                    result["skipped_tables"].append({"table": table_name, "reason": skip})
                    continue

                source_table = self._get_source_table_name(table_name)

                # Check that the source table exists
                check_query = """
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = $1
                    )
                """
                exists = await self.source_pool.fetchval(check_query, source_table)

                if not exists:
                    exists = await self.source_pool.fetchval(check_query, table_name)
                    if exists:
                        source_table = table_name

                if not exists:
                    continue

                # Total rows in the source table
                source_count_query = f'SELECT COUNT(*) FROM "{source_table}"'
                source_count = await self.source_pool.fetchval(source_count_query)

                # Embedded row count (case-insensitive)
                embedded_count_query = """
                    SELECT COUNT(*) FROM unified_embeddings
                    WHERE LOWER(source_table) = LOWER($1) OR LOWER(metadata->>'table') = LOWER($1)
                """
                embedded_count = await self.system_pool.fetchval(embedded_count_query, table_name)

                pending = max(0, source_count - embedded_count)

                if pending > 0 or source_count > 0:
                    result["tables"][table_name] = {
                        "source_count": source_count,
                        "embedded_count": embedded_count,
                        "pending_count": pending,
                        "completion_pct": round((embedded_count / source_count * 100) if source_count > 0 else 100, 1)
                    }

                result["total_source"] += source_count
                result["total_embedded"] += embedded_count
                result["total_pending"] += pending

            return result

        except Exception as e:
            logger.error(f"Error getting pending embeddings: {e}")
            raise

    async def find_missing_source_ids(
        self,
        table_name: str,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        Find not-yet-embedded source_ids for one table. These IDs can be queued
        for embedding. Skipped for self-sourced tables / unreachable source DB.
        """
        result = {
            "table": table_name,
            "missing_ids": [],
            "total_missing": 0
        }

        skip = await self._source_check_skip_reason(table_name)
        if skip:
            logger.warning(f"Missing-source-id check skipped for {table_name}: {skip}")
            result["skipped_reason"] = skip
            return result

        try:
            source_table = self._get_source_table_name(table_name)

            # Check that the source table exists
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                logger.warning(f"Source table not found: {table_name}")
                return result

            pk = await self._detect_pk_column(source_table)

            # IDs present in the source but missing from unified_embeddings
            missing_query = f"""
                SELECT src.{pk} as source_id
                FROM "{source_table}" src
                WHERE NOT EXISTS (
                    SELECT 1 FROM unified_embeddings ue
                    WHERE ue.source_id = src.{pk}
                    AND (ue.source_table = $1 OR ue.metadata->>'table' = $1)
                )
                ORDER BY src.{pk}
                LIMIT $2
            """
            rows = await self.source_pool.fetch(missing_query, table_name, limit)
            result["missing_ids"] = [r['source_id'] for r in rows]

            # Total missing count
            count_query = f"""
                SELECT COUNT(*) FROM "{source_table}" src
                WHERE NOT EXISTS (
                    SELECT 1 FROM unified_embeddings ue
                    WHERE ue.source_id = src.{pk}
                    AND (ue.source_table = $1 OR ue.metadata->>'table' = $1)
                )
            """
            result["total_missing"] = await self.source_pool.fetchval(count_query, table_name)

            return result

        except Exception as e:
            logger.error(f"Error finding missing source IDs for {table_name}: {e}")
            raise

    async def get_embedding_queue_status(self) -> Dict[str, Any]:
        """
        import_jobs tablosundan bekleyen/stuck işleri kontrol et.
        """
        result = {
            "pending_jobs": [],
            "stuck_jobs": [],
            "total_pending": 0,
            "total_stuck": 0
        }

        try:
            # Önce tablo ve kolon varlığını kontrol et
            check_query = """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'import_jobs' AND table_schema = 'public'
            """
            columns = await self.system_pool.fetch(check_query)
            if not columns:
                logger.info("import_jobs table not found, skipping queue status")
                return result

            column_names = [c['column_name'] for c in columns]

            # Pending jobs (son 24 saat) - sadece mevcut kolonları kullan
            base_cols = ['id', 'status', 'created_at', 'updated_at']
            optional_cols = ['source_type', 'source_id', 'error_message']
            select_cols = base_cols + [c for c in optional_cols if c in column_names]

            pending_query = f"""
                SELECT {', '.join(select_cols)}
                FROM import_jobs
                WHERE status IN ('pending', 'processing')
                AND created_at > NOW() - INTERVAL '24 hours'
                ORDER BY created_at DESC
                LIMIT 50
            """
            pending = await self.system_pool.fetch(pending_query)
            result["pending_jobs"] = [dict(r) for r in pending]
            result["total_pending"] = len(pending)

            # Stuck jobs (processing > 10 dakika)
            stuck_query = f"""
                SELECT {', '.join(select_cols)},
                       EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_stuck
                FROM import_jobs
                WHERE status = 'processing'
                AND updated_at < NOW() - INTERVAL '10 minutes'
                ORDER BY updated_at ASC
                LIMIT 20
            """
            stuck = await self.system_pool.fetch(stuck_query)
            result["stuck_jobs"] = [dict(r) for r in stuck]
            result["total_stuck"] = len(stuck)

            return result

        except Exception as e:
            logger.error(f"Error getting queue status: {e}")
            # import_jobs tablosu olmayabilir
            return result

    async def reset_stuck_jobs(self, dry_run: bool = True) -> Dict[str, Any]:
        """
        Takılmış işleri 'pending' durumuna geri al.
        """
        result = {
            "stuck_found": 0,
            "reset_count": 0,
            "dry_run": dry_run,
            "reset_jobs": []
        }

        try:
            # Önce tablo varlığını kontrol et
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'import_jobs'
                )
            """
            exists = await self.system_pool.fetchval(check_query)
            if not exists:
                logger.info("import_jobs table not found, skipping stuck job reset")
                return result

            # Stuck jobs bul
            stuck_query = """
                SELECT id, source_id
                FROM import_jobs
                WHERE status = 'processing'
                AND updated_at < NOW() - INTERVAL '10 minutes'
            """
            stuck = await self.system_pool.fetch(stuck_query)
            result["stuck_found"] = len(stuck)
            result["reset_jobs"] = [{"id": r['id'], "source_id": r['source_id']} for r in stuck[:10]]

            if not dry_run and stuck:
                # Reset to pending
                reset_query = """
                    UPDATE import_jobs
                    SET status = 'pending', updated_at = NOW(), error_message = 'Auto-reset by health check'
                    WHERE status = 'processing'
                    AND updated_at < NOW() - INTERVAL '10 minutes'
                """
                await self.system_pool.execute(reset_query)
                result["reset_count"] = len(stuck)

            return result

        except Exception as e:
            logger.error(f"Error resetting stuck jobs: {e}")
            return result

    async def _get_table_sizes(self) -> Dict[str, Any]:
        """
        Get table and index sizes for unified_embeddings and document_embeddings
        """
        try:
            # Get table sizes
            table_size_query = """
                SELECT
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
                    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
                    pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes,
                    pg_relation_size(schemaname||'.'||tablename) AS table_bytes,
                    pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename) AS index_bytes
                FROM pg_tables
                WHERE schemaname = 'public'
                AND tablename IN ('unified_embeddings', 'document_embeddings')
                ORDER BY total_bytes DESC
            """
            table_sizes = await self.system_pool.fetch(table_size_query)

            # Get index details
            index_query = """
                SELECT
                    i.schemaname,
                    i.tablename,
                    i.indexname,
                    pg_size_pretty(pg_relation_size(c.oid)) AS index_size,
                    pg_relation_size(c.oid) AS index_bytes
                FROM pg_indexes i
                JOIN pg_class c ON c.relname = i.indexname
                JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
                WHERE i.schemaname = 'public'
                AND i.tablename IN ('unified_embeddings', 'document_embeddings')
                ORDER BY pg_relation_size(c.oid) DESC
            """
            indexes = await self.system_pool.fetch(index_query)

            return {
                "tables": [dict(row) for row in table_sizes],
                "indexes": [dict(row) for row in indexes],
                "total_size": table_sizes[0]['total_size'] if table_sizes else "0 bytes",
                "total_bytes": sum(row['total_bytes'] for row in table_sizes)
            }

        except Exception as e:
            logger.error(f"Error getting table sizes: {e}")
            return {
                "tables": [],
                "indexes": [],
                "total_size": "Unknown",
                "total_bytes": 0,
                "error": str(e)
            }

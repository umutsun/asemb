/**
 * WS4-B (ADR-0003) — schema-first knowledge graph.
 *
 * Two changes to the Postgres-native graph tables (chunk_relationships,
 * chunk_entities), both required before re-extracting under a per-domain schema:
 *
 *  1. Add `schema_id UUID NULL` (FK -> user_schemas.id, ON DELETE SET NULL) for
 *     provenance: which schema's vocabulary produced this entity/relationship.
 *     NULLable so rows extracted under the built-in DEFAULT_LLM_CONFIG (no stored
 *     user_schemas row) stay valid — backward compatible with the existing data.
 *
 *  2. Drop the enum-like CHECK constraints chk_relationship_type / chk_entity_type.
 *     They hardcode the Turkish-tax vocabulary (law_code, references, …) and would
 *     reject schema-first types (organization, tender_no, issued_by, …). The type
 *     columns stay VARCHAR; validation moves to the Python extraction service,
 *     driven by the active schema's llmConfig.entities/relationships (Hard Rule #1).
 *
 * Left intact on purpose: chk_extracted_by (llm/regex/manual is still correct).
 *
 * Verified against bookie (bookie_lsemb) on 2026-05-30 before writing:
 *   - user_schemas.id is UUID (matches FK type below)
 *   - chunk_relationships = 0 rows, chunk_entities = 7 rows (old tax-law pilot)
 *   - constraint names confirmed: chk_relationship_type, chk_entity_type
 *
 * Idempotent: guarded with IF [NOT] EXISTS so a partial/re-run is safe.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. schema_id provenance column on both tables (nullable, FK -> user_schemas).
  await knex.raw(`
    ALTER TABLE chunk_relationships
      ADD COLUMN IF NOT EXISTS schema_id UUID NULL;
  `);
  await knex.raw(`
    ALTER TABLE chunk_entities
      ADD COLUMN IF NOT EXISTS schema_id UUID NULL;
  `);

  // FK constraints added separately so we can name them and stay idempotent.
  // ON DELETE SET NULL: deleting a schema must not cascade-delete graph rows;
  // they simply lose provenance and fall back to the default vocabulary.
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cr_schema_id'
      ) THEN
        ALTER TABLE chunk_relationships
          ADD CONSTRAINT fk_cr_schema_id
          FOREIGN KEY (schema_id) REFERENCES user_schemas(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_ce_schema_id'
      ) THEN
        ALTER TABLE chunk_entities
          ADD CONSTRAINT fk_ce_schema_id
          FOREIGN KEY (schema_id) REFERENCES user_schemas(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Indexes for schema-scoped queries (e.g. /stats filtered by schema).
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_cr_schema ON chunk_relationships(schema_id) WHERE schema_id IS NOT NULL;`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ce_schema ON chunk_entities(schema_id) WHERE schema_id IS NOT NULL;`);

  // 2. Drop the hardcoded-vocabulary CHECK constraints (schema-first replaces them).
  await knex.raw(`ALTER TABLE chunk_relationships DROP CONSTRAINT IF EXISTS chk_relationship_type;`);
  await knex.raw(`ALTER TABLE chunk_entities DROP CONSTRAINT IF EXISTS chk_entity_type;`);
};

/**
 * Reverse: restore the original tax-law CHECK constraints and drop schema_id.
 *
 * NOTE: re-adding the CHECK can FAIL if, between up() and down(), rows were
 * inserted with schema-first types (e.g. 'organization') that the old enum
 * rejects. That is intentional — a rollback after schema-first extraction is a
 * real conflict the operator must resolve (e.g. delete/convert those rows first),
 * not something this migration should silently paper over.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Restore the original CHECK constraints (verbatim from 20260217_chunk_relationships.sql).
  await knex.raw(`
    ALTER TABLE chunk_relationships
      ADD CONSTRAINT chk_relationship_type
      CHECK (relationship_type IN ('references','amends','parent_of','related_to','supersedes','interprets'));
  `);
  await knex.raw(`
    ALTER TABLE chunk_entities
      ADD CONSTRAINT chk_entity_type
      CHECK (entity_type IN ('law_code','article_number','institution','date','rate','penalty','concept'));
  `);

  // Drop indexes, FKs, then the columns.
  await knex.raw(`DROP INDEX IF EXISTS idx_cr_schema;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_ce_schema;`);
  await knex.raw(`ALTER TABLE chunk_relationships DROP CONSTRAINT IF EXISTS fk_cr_schema_id;`);
  await knex.raw(`ALTER TABLE chunk_entities DROP CONSTRAINT IF EXISTS fk_ce_schema_id;`);
  await knex.raw(`ALTER TABLE chunk_relationships DROP COLUMN IF EXISTS schema_id;`);
  await knex.raw(`ALTER TABLE chunk_entities DROP COLUMN IF EXISTS schema_id;`);
};

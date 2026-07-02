"""Unit tests for services.law_metadata_parser.

Fixture strings are REAL law names / content heads sampled from the live
bookie_lsemb corpus (2026-07-02) — do not "clean them up".
"""
import pytest

from services.law_metadata_parser import (
    DEFAULT_PATTERNS,
    extract_article_number,
    merge_patterns,
    normalize_digits,
    parse_issue_date,
    parse_law_from_content,
    parse_law_name,
    strip_lang_suffix,
)


# ---------------------------------------------------------------- law names
# (name, expected law_type, expected number, expected year)
CANONICAL_NAMES = [
    ("Anti-Money Laundering Law — Federal Decree-Law No. 20 of 2018 — EN",
     "federal_decree_law", "20", "2018"),
    ("Commercial Transactions Law — Federal Decree-Law No. 50 of 2022 — AR",
     "federal_decree_law", "50", "2022"),
    ("Civil Transactions Law (Civil Code) — Federal Law No. 5 of 1985 — EN",
     "federal_law", "5", "1985"),
    ("Arbitration Law — Federal Law No. 6 of 2018 — AR",
     "federal_law", "6", "2018"),
    ("Dubai Law Concerning Public Health No. 5 of 2025 — EN",
     "dubai_law", "5", "2025"),
    ("DIFC Employment Law (DIFC Law No. 2 of 2019)",
     "difc_law", "2", "2019"),
    ("UAE Commercial Companies Law (Federal Decree-Law No. 32 of 2021)",
     "federal_decree_law", "32", "2021"),
]

SLUG_NAMES = [
    ("Cabinet-Decision-No-127-of-2024-on-Reverse-Charge-Mechanism-for-Precious-Metals-AR",
     "cabinet_decision", "127", "2024"),
    ("Cabinet-Decision-No-142-of-2024-on-Top-up-Tax-on-MNEs",
     "cabinet_decision", "142", "2024"),
    ("Ministerial-Decision-No-302-of-2024-Ar",
     "ministerial_decision", "302", "2024"),
    ("FTA-Decision-No-6-of-2025-on-Standards-Controls-ar",
     "fta_decision", "6", "2025"),
    ("fta-decision-no-5-of-2024-on-refund-of-fees-of-private-clarification-requests-AR",
     "fta_decision", "5", "2024"),
    ("MD-No-265-of-2023-Regarding-Qualifying-Activities-and-Excluded-Activities-ar",
     "ministerial_decision", "265", "2023"),
]

MESSY_NAMES = [
    # no "No.": bare "<number> of <year>"
    ("Cabinet Decision 1 of 2020  - Version to publish",
     "cabinet_decision", "1", "2020"),
    # no space after "No"
    ("Cabinet Decision No105 of 2021", "cabinet_decision", "105", "2021"),
    # no "of" at all: "Cabinet-Decision 52  2019"
    ("Cabinet-Decision 52  2019", "cabinet_decision", "52", "2019"),
    # "Cabinet of Ministers Resolution"
    ("Cabinet of Ministers Resolution No 57 of 2020 Concerning Economic Substance Requirements",
     "cabinet_decision", "57", "2020"),
    # FTA spelled out
    ("Federal Tax Authority Decision No. 3 of 2021 and its amendments - for publishing 04-07-2022",
     "fta_decision", "3", "2021"),
    # filename typo "Decisio"
    ("FTA-Decisio-No-5-03-2026", "fta_decision", "5", None),
    # leading zero in number
    ("Executive-Regulation-of-Federal-Decree-Law-No-08-of-2017-Publish-18-09-2025",
     "executive_regulation", "8", "2017"),
]


@pytest.mark.parametrize("name,law_type,num,year", CANONICAL_NAMES + SLUG_NAMES)
def test_parse_clean_names(name, law_type, num, year):
    out = parse_law_name(name)
    assert out.get("law_type") == law_type
    assert out.get("law_number") == num
    assert out.get("law_year") == year
    assert out.get("law_key") == f"{law_type}:{num}:{year}"
    assert out.get("confidence") == "name"


@pytest.mark.parametrize("name,law_type,num,year", MESSY_NAMES)
def test_parse_messy_names(name, law_type, num, year):
    out = parse_law_name(name)
    assert out.get("law_type") == law_type
    assert out.get("law_number") == num
    if year:
        assert out.get("law_year") == year
        assert out.get("law_key") == f"{law_type}:{num}:{year}"
    else:
        # Year not in the name -> no key fabricated; content fallback later.
        assert "law_year" not in out
        assert "law_key" not in out


def test_number_only_names_get_no_key():
    for name in ["MD-No-229", "Cabinet Decision No. 65-ar", "Cabinet Resolution No 33 AR"]:
        out = parse_law_name(name)
        assert out.get("law_number") is not None, name
        assert "law_key" not in out, name


def test_unparseable_names_get_nothing():
    for name in ["QPBEs", "ARCPD", "Arabic49Cabinet", "236  2019 -", ""]:
        out = parse_law_name(name)
        assert "law_key" not in out, name


def test_date_tail_not_mistaken_for_year():
    # "-24-10-2025" is a publish date, not "No. 47 of 2025".
    out = parse_law_name("Federal-Decree-Law-No.47-24-10-2025")
    assert out.get("law_type") == "federal_decree_law"
    assert out.get("law_number") == "47"
    assert "law_key" not in out  # year ambiguous -> content fallback


def test_en_ar_pair_produces_same_key():
    en = parse_law_name("Corporate Tax Law (Taxation of Corporations and Businesses) — Federal Decree-Law No. 47 of 2022 — EN")
    ar = parse_law_name("Corporate Tax Law (Taxation of Corporations and Businesses) — Federal Decree-Law No. 47 of 2022 — AR")
    assert en["law_key"] == ar["law_key"] == "federal_decree_law:47:2022"


def test_amendment_publish_dates_keep_original_year():
    out = parse_law_name("Federal Decree-Law No. 8 of 2017 and amendments - publishing 28 11 2025")
    assert out["law_key"] == "federal_decree_law:8:2017"


def test_executive_regulation_parent_key():
    out = parse_law_name("Executive-Regulation-of-Federal-Decree-Law-No-08-of-2017-Publish-18-09-2025")
    assert out["law_type"] == "executive_regulation"
    assert out["parent_law_key"] == "federal_decree_law:8:2017"
    assert out["law_key"] == "executive_regulation:8:2017"


def test_titles():
    out = parse_law_name("Anti-Money Laundering Law — Federal Decree-Law No. 20 of 2018 — EN")
    assert out["law_title"] == "Anti-Money Laundering Law"
    out = parse_law_name("Ministerial Decision No. 125 of 2023 - for publishing AR")
    assert "publishing" not in out["law_title"].lower()
    assert "125" in out["law_title"]


def test_strip_lang_suffix():
    assert strip_lang_suffix("Foo — EN") == "Foo"
    assert strip_lang_suffix("Foo-ar") == "Foo"
    assert strip_lang_suffix("Foo - AR (translated)") == "Foo"
    assert strip_lang_suffix("Foo arabic") == "Foo"
    # must not eat words that merely end in the letters
    assert strip_lang_suffix("Public Health") == "Public Health"


# ------------------------------------------------------------ content heads
def test_content_fallback_arabic_bidi_scrambled():
    # Real PyMuPDF output: digits displaced around the parens by bidi.
    head = "( قرار مجلس الوزراء رقم52\n ) لسنة2017 \nفي شأن اللائحة التنفيذية"
    out = parse_law_from_content(head, "ar")
    assert out.get("law_number") == "52"
    assert out.get("law_year") == "2017"
    assert out.get("law_type") == "cabinet_decision"
    assert out.get("confidence") == "content"


def test_content_fallback_arabic_indic_digits():
    head = "قرار وزاري رقم (٢٦٥) لسنة ٢٠٢٣"
    out = parse_law_from_content(head, "ar")
    assert out.get("law_number") == "265"
    assert out.get("law_year") == "2023"


def test_content_fallback_english():
    head = "Federal Decree-Law No. (47) of 2022\nOn the Taxation of Corporations and Businesses"
    out = parse_law_from_content(head, "en")
    assert out.get("law_key") == "federal_decree_law:47:2022"


def test_content_fallback_empty():
    assert parse_law_from_content("", "en") == {}


# --------------------------------------------------------- article numbers
def test_article_number_english_variants():
    assert extract_article_number("Article (188) \nPublication and Application", "en") == "188"
    assert extract_article_number("Article 11 – Definitions of terms used", "en") == "11"
    assert extract_article_number("Article (41): Something", "en") == "41"


def test_article_number_arabic_variants():
    assert extract_article_number("المادة (188) - النشر والتطبيق", "ar") == "188"
    assert extract_article_number("المادة (١٤٦) أحكام عامة", "ar") == "146"
    assert extract_article_number("الماده 12 - تعاريف", "ar") == "12"


def test_article_number_mid_chunk_reference_ignored():
    text = ("The provisions of this law shall apply without prejudice, "
            "subject to the provisions of Article (146) of the Civil Code.")
    assert extract_article_number(text, "en") is None
    ar = "مع مراعاة أحكام المادة (146) من قانون المعاملات المدنية يلتزم الطرفان"
    assert extract_article_number(ar, "ar") is None


def test_article_number_front_matter_none():
    assert extract_article_number("Corporate Tax Law\nTable of Contents\nChapter One", "en") is None


# ------------------------------------------------------------- issue dates
def test_issue_date_english():
    assert parse_issue_date("Issued on 26/09/2022 corresponding to...", "en") == "2022-09-26"
    assert parse_issue_date("Issuance Date: 3 October 2021", "en") == "2021-10-03"


def test_issue_date_arabic():
    assert parse_issue_date("تاريخ الإصدار: 26/09/2022", "ar") == "2022-09-26"


def test_issue_date_never_guessed():
    assert parse_issue_date("This law enters into force in 2023.", "en") is None
    assert parse_issue_date("", "ar") is None


# ---------------------------------------------------------------- patterns
def test_merge_patterns_override_and_default():
    merged = merge_patterns({"articleMarkers": {"tr": r"madde\s*(\d+)"}})
    assert "tr" in merged["articleMarkers"]
    assert merged["lawTypes"] == DEFAULT_PATTERNS["lawTypes"]
    assert merge_patterns(None) is DEFAULT_PATTERNS


def test_normalize_digits():
    assert normalize_digits("المادة ٢٥ لسنة ٢٠٢٣") == "المادة 25 لسنة 2023"

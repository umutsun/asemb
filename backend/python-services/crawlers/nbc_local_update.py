#!/usr/bin/env python3
"""Download NBC PDFs locally and update remote DB via SSH tunnel (port 15432)."""
import aiohttp, asyncio, tempfile, os, hashlib, asyncpg, warnings
from PyPDF2 import PdfReader
warnings.filterwarnings("ignore")

NBC_BASE = "https://www.nbc.gov.kh/download_files/legislation/"
TABLE = "csv_cambodia_laws"

NBC_ALL = [
    {"title": "Banking Code 2011", "path": "banking_code_2011.pdf"},
    {"title": "Law on the Organization and Conduct of the NBC (1996)", "path": "laws_eng/96061-Law-on-the-Organization-and-Conduct-of-the-National-Bank-of-Cambodia-1996.pdf"},
    {"title": "Law on the Amendment Article 14 and Article 57 of NBC Law", "path": "laws_eng/60462-Law-on-the-Amendent-Article-14-and-Article-57.pdf"},
    {"title": "Law on Foreign Exchange (1997)", "path": "laws_eng/71713-Law-on-Foreign-Exchange-1997.pdf"},
    {"title": "Law on Banking and Financial Institutions (1999)", "path": "laws_eng/86004-Law-on-Banking-and-Financial-Institutions-1999.pdf"},
    {"title": "Law on Negotiable Instruments and Payment Transactions (2005)", "path": "laws_eng/54875-Law-on-Negotiable-Instruments-and-Payment-Transactions-2005.pdf"},
    {"title": "Law on Commercial Enterprises (2005)", "path": "laws_eng/88376-Law-on-Commercial-Enterprises-2005.pdf"},
    {"title": "Law on Anti-Money Laundering and Combating the Financing of Terrorism (2007)", "path": "laws_eng/91537-Law-on-Anti-Money-Laundering-and-Combating-the-Financing-of-Terrorism-2007.pdf"},
    {"title": "Law on Financial Leasing (2009)", "path": "laws_eng/59709-Law-on-Financial-Leasing-2009.pdf"},
    {"title": "Law and Regulations Applicable To Banks and Financial Institutions (2016)", "path": "laws_eng/7662BankingCodeupdated2016-EN.pdf"},
    {"title": "Prakas on Emergency Liquidity Assistance for DTIs (2026)", "path": "prakas_eng/PRAKASonEmergencyLiquidityAssistanceforDTIsEN.pdf"},
    {"title": "Prakas on Conditions for Asset Management Institution (2026)", "path": "prakas_eng/2026_B37_026_113_Prokor_EN_Prakas_on_condition_for_Asset_Management.pdf"},
    {"title": "Prakas on Minimum Reserve Requirement for DTIs (2026)", "path": "prakas_eng/B37_026_045_ProKor_Prakas_on_minimum_reserve_requirement_for_DTIsENG.pdf"},
    {"title": "Circular on Capital Buffer Implementation (2025)", "path": "prakas_eng/B37-025-001-C-L_EN.pdf"},
    {"title": "Prakas on Capital Buffer in DTIs (2025)", "path": "prakas_eng/2025_B37_025_536_Proko_Prakas_on_Capital_Buffer_in_Deposit_Taking.pdf"},
    {"title": "Prakas on Early Supervisory Intervention for DTIs (2025)", "path": "prakas_eng/B37_025_377_Prokor_Prakas_on_Early_Supervisory_Intervention_for-ENG.pdf"},
    {"title": "Prakas on Capital Adequacy Ratios in DTIs (2024)", "path": "prakas_eng/B7_024_745_PROKOR_Prakas_on_capital_adequacy_ratios_in_Deposit_taking_Eng.pdf"},
    {"title": "Prakas on Transaction Related to Cryptoassets (2024)", "path": "prakas_eng/20241226_PrakasonCryptoassetactivities-Eng.pdf"},
    {"title": "Prakas on Operational Risk for CAR in DTIs (2024)", "path": "prakas_eng/Eng_B7_024_471_PROKOR_PRAKAS_ON_OPERATIONALRISKFORCAPITALADEQUACYRATIOSINDEPOSIT-TAKINGBANKSANDFINANCIALINSTITUTIONS.pdf"},
    {"title": "Prakas on Liquidity Ratio for NDTIs (2024)", "path": "prakas_eng/B7-024-439PrakasonLiquidityRatioforNDTIs-EN.pdf"},
    {"title": "Prakas on Market Risk for CAR in DTIs (2024)", "path": "prakas_eng/2024_04_12_PrakasonMarketRisk_Eng.pdf"},
    {"title": "Prakas on Regulatory Capital in DTIs (2023)", "path": "prakas_eng/2B7-023-337_ENG_PrakasonRegulatoryCapitalforCARinDTIs.pdf"},
    {"title": "Prakas on Credit Risk for CAR in DTIs (2023)", "path": "prakas_eng/4B7_023_338_EN_Prakas_on_Credit_Risk_for_CAR_in_Deposit_taking_Banks.pdf"},
    {"title": "Prakas on Bancassurance Business of BFIs (2021)", "path": "prakas_eng/PrakasonConditionsforBancassuranceBusinessofBFIs_ENG.pdf"},
    {"title": "Prakas on Credit Reporting (2020)", "path": "prakas_eng/Prakas_on_Credit_Reporting_26-06-2020_ENG.pdf"},
    {"title": "Prakas on Interest Rate Ceiling on Loan (2017)", "path": "prakas_eng/Prakas-on-Interest-Rate-Cap-Eng.pdf"},
    {"title": "Prakas on Minimum Registered Capital of BFIs (2016)", "path": "prakas_eng/7848B7-016-117-Pro.Kor_ENG.pdf"},
    {"title": "Prakas on Liquidity Coverage Ratio (2015)", "path": "prakas_eng/5759prakas-liquidity-coverage-ratio-english.pdf"},
    {"title": "Prakas on Fees for BFIs (2013)", "path": "prakas_eng/Prakas_on_Fees_for_banking_and_financial_institutions_English.pdf"},
    {"title": "Prakas on Transparency in Granting Credit (2011)", "path": "prakas_eng/6683B7-011-243.pdf"},
    {"title": "Prakas on Internal Control of BFIs (2010)", "path": "prakas_eng/5553B7-010-172.pdf"},
    {"title": "Prakas on Governance in BFIs (2008)", "path": "prakas_eng/2160B7-08-211.pdf"},
    {"title": "Prakas on Fit and Proper Requirements (2008)", "path": "prakas_eng/738B7-08-212.pdf"},
    {"title": "Prakas on AML/CFT (2008)", "path": "prakas_eng/3356B7-08-089.pdf"},
    {"title": "Prakas on Resolution of Consumer Complaints (2018)", "path": "prakas_eng/Prakas_on_Resolution_of_Consumer_Complaints_ENG.pdf"},
    {"title": "Prakas on Credit Risk Grading and Impairment Provisioning (2017)", "path": "prakas_eng/1.Prakas_on_Credit_Risk_Grading_and_Impairment_Provisioning_ENG.pdf"},
    {"title": "Prakas on External Audit of BFIs (2019)", "path": "prakas_eng/Prakas_on_External_Audit.pdf"},
    {"title": "Prakas on Licensing of Commercial Banks (2000)", "path": "prakas_eng/9910B7-00-04.pdf"},
    {"title": "Prakas on Licensing of Microfinance Institutions (2000)", "path": "prakas_eng/7175B7-00-06.pdf"},
    {"title": "Prakas on Financial Leasing Business (2011)", "path": "prakas_eng/8977B7-011-241.pdf"},
    {"title": "Prakas on Licensing of Financial Lease Companies (2011)", "path": "prakas_eng/1477B7-011-242.pdf"},
    {"title": "Cambodian Shared Switch Rules and Procedures (2017)", "path": "prakas_eng/Rule_and_Procedure_CSS_Unofficialtranslation_ENG.pdf"},
    {"title": "Prakas on Provision of Credit in National Currency (2016)", "path": "prakas_eng/Prakas-on-providing-KHR-credit-eng.pdf"},
    {"title": "Prakas on Management of Foreign Exchange Dealers (2002)", "path": "prakas_eng/3.pdf"},
    {"title": "Prakas on Business Management of Precious Metals and Stones (2004)", "path": "prakas_eng/7.pdf"},
    {"title": "Prakas on Conditions for BFIs to be Listed on CSX (2017)", "path": "prakas_eng/2017-Prakas-on-Conditions-for-BFIs-for-application-to-be-listed-on-CSX.pdf"},
    {"title": "Prakas on Loan Policies, Procedures and Lending Authority (2005)", "path": "prakas_eng/5677B7-05-054.pdf"},
    {"title": "Prakas on Risk-based and Forward Looking Supervision (2011)", "path": "prakas_eng/6990B7-011-082.pdf"},
]


async def download_pdf_text(session, url):
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            if resp.status != 200:
                return ""
            data = await resp.read()
            if len(data) < 200:
                return ""
            tmp = tempfile.mktemp(suffix=".pdf")
            with open(tmp, "wb") as f:
                f.write(data)
            try:
                reader = PdfReader(tmp)
                parts = []
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        parts.append(t.strip())
                return "\n\n".join(parts)[:80000]
            finally:
                os.unlink(tmp)
    except Exception as e:
        return ""


async def main():
    dsn = "postgresql://postgres:Luwi2025SecurePGx7749@localhost:15432/aseanlex_lsemb"
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=5)

    async with aiohttp.ClientSession() as session:
        sem = asyncio.Semaphore(5)
        updated = 0
        for i, doc in enumerate(NBC_ALL):
            url = NBC_BASE + doc["path"]
            odc_id = f"nbc-{hashlib.md5(url.encode()).hexdigest()[:16]}"

            async with sem:
                text = await download_pdf_text(session, url)

            if text and len(text) > 100:
                result = await pool.execute(
                    f"UPDATE {TABLE} SET pdf_content = $1, content_hash = $2 WHERE odc_id = $3",
                    text, hashlib.md5(text.encode()).hexdigest(), odc_id
                )
                if "UPDATE 1" in result:
                    updated += 1
                    print(f"  [{i+1}/48] UPDATED {doc['title'][:50]}: {len(text)} chars")
                else:
                    print(f"  [{i+1}/48] NOT FOUND {odc_id}")
            else:
                print(f"  [{i+1}/48] SKIP (scan/err) {doc['title'][:50]}")

    await pool.close()
    print(f"\nUpdated {updated} NBC records with PDF text")


if __name__ == "__main__":
    asyncio.run(main())

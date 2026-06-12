# COPPA / P2 Data / Operator-Blind Encryption — Practitioner Spike

**Date:** 2026-06-11  
**Prepared for:** Andrew Mortensen (architecture decision: zero-knowledge vs server-readable storage)  
**Context:** tutoring-notes (Mynk) — live whiteboard + audio sessions with minors; parent consent; persisted strokes/JSON, snapshot PNGs, audio, transcripts, AI notes  
**Prior related brief:** [`coppa-compliance-research-2026-05-31.md`](coppa-compliance-research-2026-05-31.md)

---

> ⚠️ **THIS IS NOT LEGAL ADVICE**
>
> This is a practitioner research spike compiled from publicly available statutes, regulations, and FTC guidance to inform an engineering architecture decision. It does **not** establish an attorney-client relationship and must not be relied on as a substitute for advice from a licensed attorney familiar with the product, data flows, and applicable state law. Flagged below are spots where counsel sign-off is genuinely required before shipping.

---

## Executive answer (for Andrew)

**Does U.S. children's-privacy law require operator-blind / zero-knowledge storage?**

**No — not under COPPA or the adjacent federal baselines reviewed here.** The operative bar is **verifiable parental consent before collection**, **reasonable confidentiality/security/integrity measures** (risk-based, not a technology checklist), **data retention limits + deletion on parent direction**, and **transparent notice**. An operator that can read stored session content to **run the service** (transcription, note generation, tutor access, support, incident response) is **normal and legally permissible**, provided access is **controlled, logged, minimized, and disclosed**.

Operator-blind encryption is a **product/trust positioning choice**, not a COPPA mandate. It can also **cut against** practical safety obligations (CSAM reporting when you have actual knowledge; abuse investigation; support/debugging) — though U.S. law does **not** currently require proactive scanning that would *force* operator readability.

---

## 1. In-repo “P2 data” — what prior agents meant

### Finding: “P2” is **not** a formal data-sensitivity tier in this repo

Grep across the codebase shows **“P2” almost always means Identity Phase 2** (the AccountHolder / LearnerProfile / consent schema wave), not “Priority-2 classified data.” Examples:

| Usage | Meaning |
|-------|---------|
| `identity-p2-schema`, `identity-p2a-session-infra`, `identity-p2b-ui` | Identity Phase 2 build tracks |
| `identity-p2a.test.ts` (`BLOCKER-P2-S1` … `P2-A1`) | Session-fixation, claim-race, and admin-gate security blockers for P2a |
| `identity-p2-ownership-guard` | `assertOwnsLearnerProfile` + `lpr=` logging |
| Whiteboard docs `P1`–`P8` | Sync **invariants**, not privacy tiers |
| `docs/SMOKE-LONG-FORM-TRANSCRIBE.md` P1/P2 | Prerequisites for a smoke run |

**No canonical “P1 data / P2 data / P3 data” classification table exists.** If orchestrator chats said “P2 data,” they almost certainly meant **Phase-2 identity + children's personal data** handled by that schema — i.e., `LearnerProfile` PII, consent records, session content tied to minors — not a separate encryption tier.

### What *is* locked: PII vs business-record separation

The durable schema decision (partially implemented) separates **deletable identity PII** from **retained operational/audit records**:

- **PII bucket (tombstoneable):** `AccountHolder` + `LearnerProfile` — on honored deletion, `displayName` redacted, `tombstonedAt` set; sessions revoked. See `prisma/schema.prisma` (`LearnerProfile` comments ~L815–818; `AccountHolder.tombstonedAt` ~L775–777).
- **Business/audit tables deliberately untouched on deletion:** `WhiteboardSession`, `SessionRecording`, `CostEvent`, `SessionNote`, `SessionConsentSnapshot` — continue referencing opaque `Student` id; UI resolves tombstoned learners as “student deleted.” Locked in [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) (PII/business-record SEPARATION principle) and [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §6.
- **Retention default (product policy, not yet fully enforced):** child PII for active relationship + **24 months post-closure**; deletion-on-request honored sooner ([`v1-redesign-STATUS.md`](v1-redesign-STATUS.md)).
- **Consent gating:** capture of minor content requires effective consent record (`CONSENT-GATES-CAPTURE`); essentials vs opt-in toggles per [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md) §4.
- **Current storage reality (relevant to encryption debate):** whiteboard events JSON, snapshot PNGs, audio blobs, transcripts are **server-readable** (Neon + Vercel Blob); live sync uses TLS; relay can be E2E for in-flight payloads ([`docs/LIVE-AV.md`](../LIVE-AV.md), [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md)). [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) notes persisted WB content is already plaintext/server-readable — encrypting only the live session key would not change at-rest posture.

---

## 2. COPPA — storage & access requirements

**Primary sources:** [15 U.S.C. §§ 6501–6506](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-chapter91-subchapter2&edition=prelim); [16 CFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312) (2025 amendments effective; compliance deadline **April 22, 2026** per [90 FR 16918](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)); prior in-repo brief [`coppa-compliance-research-2026-05-31.md`](coppa-compliance-research-2026-05-31.md).

Mynk has **actual knowledge** it collects from children under 13 (`LearnerProfile` for minors). COPPA applies.

### 2.1 What counts as children's personal information here

[16 CFR § 312.2](https://www.law.cornell.edu/cfr/text/16/312.2) — **personal information** explicitly includes:

- **(8)** “A photograph, video, or **audio file where such file contains a child's image or voice**”
- **(10)** **Biometric identifiers** including **voiceprints** (2025 amendment)
- Names, online contact info, persistent identifiers, etc.

**Implication:** session audio, whiteboard snapshots with identifiable content, transcripts, and stroke data linked to a child are in scope. The § 312.5(c)(9) one-time voice-response **exception does not apply** — Mynk retains audio and collects other PI ([prior brief Q7](coppa-compliance-research-2026-05-31.md)).

### 2.2 Verifiable parental consent (VPC) — before collection

[16 CFR § 312.5(a)](https://www.law.cornell.edu/cfr/text/16/312.5):

> “An operator is required to obtain **verifiable parental consent before any collection, use, or disclosure** of personal information from children…”

**Storage/access angle:** consent must cover **what** is collected and **how it is used** (including retention). Separate VPC may be required for certain third-party disclosures ([§ 312.5(a)(2)](https://www.law.cornell.edu/cfr/text/16/312.5)). Mynk's tiered essentials + opt-in toggles align with this model; VPC method choice (email-plus vs stronger) depends on whether OpenAI/Whisper is treated as service provider vs disclosing third party — **counsel item**.

**Does VPC require operator-blind storage?** **No.** The rule governs *permission to collect/use/disclose*, not *forbidden operator visibility*.

### 2.3 Security & confidentiality — § 312.8 (the core encryption question)

[16 CFR § 312.8(a)](https://www.law.cornell.edu/cfr/text/16/312.8):

> “The operator must establish and maintain **reasonable procedures** to protect the **confidentiality, security, and integrity** of personal information collected from children.”

[§ 312.8(b)](https://www.law.cornell.edu/cfr/text/16/312.8) requires a **written information security program** with safeguards **appropriate to sensitivity, operator size, complexity, and scope** — including risk assessment, implemented safeguards, testing, annual review. **No mention of encryption. No mention of operator inability to read data.**

[FTC Six-Step Compliance Plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) (same substance):

> “You need to have a written information security program and implement safeguards that are **appropriate** to the sensitivity… Take reasonable steps to release personal information only to service providers… capable of maintaining confidentiality…”

**FTC enforcement lens — VTech ([2018 blog](https://www.ftc.gov/business-guidance/blog/2018/01/vtech-settlement-cautions-companies-keep-coppa-covered-data-secure)):** failures included **false encryption claims**, storing data in **clear text** without reasonable protections, weak access controls. The FTC punished **unreasonable security and deception**, not “operator could read the data.” Encryption of stored photos/audio was expected as part of reasonable practice **after a breach exposed cleartext** — still not “operator-blind.”

| Question | Answer |
|----------|--------|
| Does § 312.8 mandate encryption at rest? | **No** — risk-based safeguards |
| Does it mandate E2E / zero-knowledge? | **No** — not in rule text or FTC guidance |
| Does “confidentiality” mean only the child/parent can ever read content? | **No** — means protection against **unauthorized** disclosure/compromise |
| Is operator access for service delivery OK? | **Yes**, if access-controlled, disclosed, and secured — tutors/parents are authorized recipients within the service |

### 2.4 Data retention & deletion — § 312.10

[16 CFR § 312.10](https://www.law.cornell.edu/cfr/text/16/312.10):

> Retain PI “only as long as is **reasonably necessary** to fulfill the specific purpose(s) for which the information was collected”… “**may not be retained indefinitely**”… must maintain a **written data retention policy** (purposes, business need, **timeframe for deletion**) **in the online privacy notice**.

**Storage implication:** indefinite retention of session audio/board data is non-compliant. A defined schedule (Mynk's 24-month post-closure draft) must be **published**. Deletion must use “reasonable measures” against unauthorized access during deletion.

**Operator-blind angle:** deletion requires the operator (or its systems) to **locate and purge** data — zero-knowledge can complicate honoring § 312.6 deletion requests unless keys are recoverable/escrowed.

### 2.5 Parent access, review, revocation, deletion — § 312.6

[16 CFR § 312.6(a)](https://www.law.cornell.edu/cfr/text/16/312.6):

> Parent must receive: (2) “The opportunity at any time to **refuse**… further use or future… collection” and to “**direct the operator to delete** the child's personal information”; (3) “a **means of reviewing** any personal information collected from the child.”

**Access implication:** parents (and, via the product, tutors acting within consent) **reviewing** stored session content is a **feature COPPA anticipates**, not a violation. The operator must facilitate parent review — which presupposes the operator **can retrieve** readable records.

### 2.6 Data minimization

COPPA does not use GDPR's “data minimization” label, but combines:

- Collect only with VPC for stated purposes ([§ 312.5](https://www.law.cornell.edu/cfr/text/16/312.5))
- Retain only as long as necessary ([§ 312.10](https://www.law.cornell.edu/cfr/text/16/312.10))
- FTC guidance: “**Minimize what you collect** in the first place” ([Six-Step Plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business))

Mynk's essentials-vs-opt-in split ([`v1-redesign-STATUS.md`](v1-redesign-STATUS.md)) is the right shape; minimization is about **scope of collection**, not **operator blindness**.

### 2.7 Plain answer on operator-blind encryption under COPPA

**COPPA does not require that no human at the operator can view a child's stored data.** It requires **reasonable security against unauthorized access**, **parental control**, and **bounded retention**. Operator/staff access for operations, moderation, support, and legal compliance is permissible when **limited, authenticated, audited, and disclosed** in the privacy notice.

---

## 3. Adjacent regimes (brief)

### 3.1 FERPA — only if positioned as a school service

[34 CFR Part 99](https://studentprivacy.ed.gov/ferpa); [FERPA school-official exception guidance](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/School%20Officials%20and%20Offsite%20Conractors%20FAQs%202023%2002%2014%20v2.pdf).

**Applicability to Mynk today:** **Low** for the private tutoring pilot. FERPA binds **schools** and their treatment of **education records**. It becomes relevant if Mynk is deployed **through schools** under the “school official” exception (contract + direct control + legitimate educational interest).

**Operator-blind storage?** **No.** FERPA expects schools to maintain **direct control** over vendor retention/deletion; [34 CFR § 99.31(a)(1)](https://www.law.cornell.edu/cfr/text/34/99.31) and ED guidance emphasize **reasonable methods** (technological or administrative) to limit access — not vendor inability to see records. Schools routinely use cloud LMS tools where the vendor processes readable records under contract.

**If pitching universities/K-12 institutions:** FERPA contract terms + DPA become mandatory; still not a zero-knowledge mandate — **counsel + institutional procurement**.

### 3.2 State student-privacy laws (e.g., California SOPIPA)

[Cal. BPC § 22584](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584) (SOPIPA):

- Applies to operators with **actual knowledge** the service is used **primarily for K–12 school purposes** and **designed and marketed for K–12 purposes** (§ 22584(a)(7)).
- Requires **reasonable security procedures** (§ 22584(d)(1)) — same risk-based pattern as COPPA; **no operator-blind requirement**.
- Prohibits targeted advertising, profiling, selling pupil data; limits disclosures.
- **§ 22584(j):** does **not** apply to **general audience** sites/services even if school login credentials work — private tutoring marketplace likely **outside SOPIPA** unless repositioned as school-purpose primary.
- **2024 AB 801 amendment:** parent/pupil deletion rights for CCPA-excluded covered information after leaving LEA — still deletion **on request**, not encryption mandate.

**Other states:** Many “COPPA-like” student privacy laws (NY Ed Law 2-d, CO Student Transparency Act, etc.) follow **prohibit commercial reuse + require security + contract terms** — not operator-blind storage. State-by-state review needed if marketing into schools.

### 3.3 FTC Act § 5 — “reasonable security” baseline

[15 U.S.C. § 45](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section45&edition=prelim); FTC enforcement practice ([2020 orders blog](https://www.ftc.gov/business-guidance/blog/2020/01/new-improved-ftc-data-security-orders-better-guidance-companies-better-protection-consumers)).

- **Process-based** reasonableness scaled to size, data sensitivity, and threats — **not a fixed checklist** ([CLM Magazine summary of FTC posture](https://www.theclm.org/Magazine/articles/what-is-reasonable-data-security-according-to-the-ftc/930)).
- Orders often include **encryption, access controls, monitoring, training** — but as **risk-appropriate safeguards**, not “operator must never decrypt.”
- **Deceptive** to claim “end-to-end encryption” or “we can't read your data” if the operator can ([Zoom enforcement reference](https://www.ftc.gov/business-guidance/blog/2020/01/new-improved-ftc-data-security-orders-better-guidance-companies-better-protection-consumers); [FTC Ferguson model letter](https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-unfair-security-letter-ferguson.pdf)).

**For Mynk:** § 5 reinforces **honest security claims** + **reasonable protection**; it does **not** elevate zero-knowledge to a legal floor.

---

## 4. Safety counter-pressure — does law require operator *access*?

### 4.1 CSAM mandatory reporting — 18 U.S.C. § 2258A

[18 U.S.C. § 2258A](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section2258A&edition=prelim):

> Provider **shall** report to NCMEC CyberTipline when it obtains **actual knowledge** of apparent CSAM / covered exploitation… “**as soon as reasonably possible**.”

**Key limits:**

- Trigger is **actual knowledge**, not “you chose not to look.”
- [NCMEC 2024 ESP report](https://www.missingkids.org/content/dam/missingkids/pdfs/cybertiplinedata2024/2024-reports-by-esp.pdf): “**no legal requirements for proactive efforts to detect** this content.”
- **E2E messaging providers** (Signal, WhatsApp) operate at scale; WhatsApp submitted **1.85M** CyberTipline reports in 2024 — via **metadata/client-side systems/hash matching**, not by breaking E2E for all messages.

**Introduced federal legislation:** [H.R. 7949 STOP CSAM Act (118th)](https://www.govtrack.us/congress/bills/118/hr7949/text) — proposed that **using full E2E encryption shall not, by itself, create liability** under § 2258A (see bill text “None of the following actions… shall serve as an independent basis for liability”). **Not enacted as of this spike** — but signals legislative tolerance for E2E absent actual knowledge.

**Tension for Mynk:** A **server-readable** tutoring archive means if staff/**automated hash matching** on stored blobs discovers CSAM, **reporting is mandatory**. Zero-knowledge would **prevent** that detection path — but is **not currently illegal** if the operator never obtains actual knowledge. This is a **policy/ethics/reputational** tradeoff, not a COPPA requirement to stay readable.

### 4.2 Content moderation & trust-and-safety norms

Platforms serving minors commonly:

- Investigate abuse reports (requires **decrypt/read** capability or client-side reporting)
- Restrict tutor–minor messaging
- Respond to parent complaints about session content

[Grimmelmann & Duan, “Content Moderation and Encryption”](https://georgetownlawtechreview.org/wp-content/uploads/2024/01/GrimmelmannDuan_Final-Proof.pdf): E2E and moderation are **in tension**; industry debates **client-side scanning** (Apple 2021 proposal; EU “Chat Control”) — **highly controversial**, not U.S. law today.

**For a tutoring product:** parents and tutors **expect** the tutor (and parent) to review session artifacts — operator readability is **feature-aligned**. Blind encryption would **break** transcription, AI notes, admin support, and parent review unless re-architected with per-user keys and complex recovery.

### 4.3 Live sync E2E vs at-rest readability (orchestrator context)

[`docs/LIVE-AV.md`](../LIVE-AV.md) and [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md): **in-flight** whiteboard sync may be E2E-encrypted through the relay; **persisted** content is already server-readable in Blob. **Legal analysis:** COPPA regulates **collection, retention, and security of PI** — not whether the relay is blind. Making the relay blind while leaving Blob plaintext is a **partial** privacy control with **no COPPA-driven requirement** to do either.

---

## 5. VERDICT — decision-useful summary

### Must we make stored children's content unreadable to all humans at the operator?

**No — not under COPPA or the federal/adjacent frameworks surveyed.** Strong expectation **confirmed** against primary sources.

### What we clearly need (legal floor)

| Obligation | Source | Practical for Mynk |
|------------|--------|-------------------|
| VPC before collecting minor session content | [§ 312.5](https://www.law.cornell.edu/cfr/text/16/312.5) | Claim/consent flow; no capture without effective `ConsentRecord` / snapshot |
| Written INFOSEC program; risk-based safeguards | [§ 312.8](https://www.law.cornell.edu/cfr/text/16/312.8) | Access controls, TLS, secrets hygiene, vendor DPAs, annual risk review, staff access policy |
| Written retention policy **in privacy notice**; no indefinite retention | [§ 312.10](https://www.law.cornell.edu/cfr/text/16/312.10) | Publish timeframe (e.g., active + 24mo); align with tombstone/deletion pipeline |
| Parent review / revoke / **direct deletion** pathway | [§ 312.6](https://www.law.cornell.edu/cfr/text/16/312.6) | Disclosed contact or self-serve; honor requests; tombstone PII bucket |
| Accurate privacy notice (what is collected, processors, retention) | [§ 312.4](https://www.law.cornell.edu/cfr/text/16/312.4) | Audio, transcripts, whiteboard, OpenAI — see [prior brief Q4](coppa-compliance-research-2026-05-31.md) |
| Minimize collection to consented purposes | FTC Six-Step + § 312.10 | Essentials vs opt-in toggles |
| CSAM report if **actual knowledge** | [§ 2258A](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section2258A&edition=prelim) | Runbook + NCMEC contact; optional hash scan on stored media |
| Honest security marketing | FTC Act § 5 | Don't claim “we can't read your sessions” if staff can |

### Optional-but-valuable (product / trust, not legal mandate)

- **Encryption at rest** for Blob/DB (operator-held keys) — good practice, likely expected for “reasonable” security at maturity
- **Field-level encryption** for especially sensitive columns
- **App-server-brokered session keys** with blind relay — improves in-transit story; **does not change** at-rest COPPA posture ([`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md))
- **Operator-blind / client-side E2E at rest** — maximum parent trust; **high engineering cost**; complicates transcription, search, support, deletion proofs, and CSAM detection; **not required by COPPA**

### Architecture recommendation (practitioner, not legal advice)

**Do not prioritize a full zero-knowledge at-rest project for COPPA compliance alone.** Prioritize:

1. Ship/enforce consent + retention + deletion (schema already supports tombstone separation)
2. Publish compliant retention policy in `/privacy`
3. Harden **authorized** access (role assertions, audit logs, impersonation discipline, least-privilege admin)
4. Consider **standard at-rest encryption** (platform/Blob defaults + CMK) without blocking operator functions
5. Revisit operator-blind only if **market positioning** demands it and product accepts feature tradeoffs

---

## 6. Where you need a lawyer

| Topic | Why counsel |
|-------|-------------|
| **VPC method + consent copy** | Whether email-plus suffices given OpenAI Whisper processing ([§ 312.5(b)(2)(viii)](https://www.law.cornell.edu/cfr/text/16/312.5)); wording of essentials vs opt-in toggles |
| **OpenAI: processor vs disclosing third party** | Affects VPC tier and notice ([prior brief Q3c](coppa-compliance-research-2026-05-31.md)) |
| **Published retention timeframe** | Must be defensible under § 312.10 + Kurbo enforcement posture |
| **FERPA / school contracts** | Only if pitching institutions — school-official agreements, DPAs, state addenda |
| **SOPIPA / state laws** | If repositioning as K–12 school-purpose primary or enrolling CA pupils through districts |
| **CSAM reporting runbook** | Confirm ESP classification, report content, preservation holds |
| **Marketing claims** (“private,” “encrypted,” “we never see”) | FTC § 5 deception risk |

---

## 7. Sources (primary & authoritative)

### Statutes & regulations

- [15 U.S.C. §§ 6501–6506 (COPPA)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-chapter91-subchapter2&edition=prelim)
- [16 CFR Part 312 (COPPA Rule)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312)
- [16 CFR § 312.2 — Definitions (PI incl. audio, voiceprints)](https://www.law.cornell.edu/cfr/text/16/312.2)
- [16 CFR § 312.5 — Parental consent](https://www.law.cornell.edu/cfr/text/16/312.5)
- [16 CFR § 312.6 — Parent review / deletion](https://www.law.cornell.edu/cfr/text/16/312.6)
- [16 CFR § 312.8 — Security & confidentiality](https://www.law.cornell.edu/cfr/text/16/312.8)
- [16 CFR § 312.10 — Retention & deletion](https://www.law.cornell.edu/cfr/text/16/312.10)
- [90 FR 16918 — 2025 COPPA Final Rule](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)
- [18 U.S.C. § 2258A — CSAM reporting](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section2258A&edition=prelim)
- [15 U.S.C. § 45 — FTC Act](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section45&edition=prelim)
- [Cal. BPC § 22584 — SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584)
- [34 CFR Part 99 — FERPA](https://www.ecfr.gov/current/title-34/subtitle-A/part-99)

### FTC & federal guidance

- [FTC COPPA Six-Step Compliance Plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [FTC VTech settlement blog (reasonable security)](https://www.ftc.gov/business-guidance/blog/2018/01/vtech-settlement-cautions-companies-keep-coppa-covered-data-secure)
- [FTC data security orders blog (2020)](https://www.ftc.gov/business-guidance/blog/2020/01/new-improved-ftc-data-security-orders-better-guidance-companies-better-protection-consumers)
- [FTC Ferguson model letter on § 5 security](https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-unfair-security-letter-ferguson.pdf)
- [Student Privacy Office — FERPA](https://studentprivacy.ed.gov/ferpa)

### Safety / encryption policy context

- [NCMEC CyberTipline 2024 ESP data (no proactive scan mandate)](https://www.missingkids.org/content/dam/missingkids/pdfs/cybertiplinedata2024/2024-reports-by-esp.pdf)
- [H.R. 7949 STOP CSAM Act — E2E liability carve-out (introduced)](https://www.govtrack.us/congress/bills/118/hr7949/text)
- [Grimmelmann & Duan — Content Moderation and Encryption (Georgetown Law Tech Review)](https://georgetownlawtechreview.org/wp-content/uploads/2024/01/GrimmelmannDuan_Final-Proof.pdf)

### In-repo

- [`coppa-compliance-research-2026-05-31.md`](coppa-compliance-research-2026-05-31.md)
- [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — PII/business-record separation, retention default
- [`session-lifecycle-consent-design-2026-05-31.md`](session-lifecycle-consent-design-2026-05-31.md)
- [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — encryption trust-model open question
- `prisma/schema.prisma` — tombstone columns on `AccountHolder` / `LearnerProfile`

---

> ⚠️ **DISCLAIMER (repeated):** This spike is research for product architecture planning only. Confirm VPC flows, retention disclosures, processor classifications, and any school-market positioning with qualified counsel before relying on it for compliance sign-off.

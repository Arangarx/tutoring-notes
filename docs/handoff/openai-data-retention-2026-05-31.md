# OpenAI API audio — data retention & usage research memo

**Date:** 2026-05-31  
**Context:** Mynk (tutoring app) sends child session audio to OpenAI transcription APIs (`whisper-1` today via `/v1/audio/transcriptions`; may also use `gpt-4o-transcribe` / related models).  
**Purpose:** Inform whether OpenAI is plausibly a **service provider / processor** (COPPA “no separate third-party disclosure” framing) vs a **third party** requiring different consent/disclosure mechanics.

> **Disclaimer — not legal advice.** This memo summarizes **OpenAI’s published policies and documentation** as of research on 2026-05-31. It does **not** analyze FTC COPPA enforcement, state privacy laws, contract execution status, or Mynk’s actual account configuration. **Counsel must opine** on COPPA “disclosure,” school-official exceptions, parental consent, and privacy-policy wording.

---

## Executive summary (for counsel handoff)

| Question | Short answer (API transcription path) |
|----------|--------------------------------------|
| Training on API audio? | **No by default** (since 2023-03-01; reaffirmed 2026). |
| Default retention of audio/transcript on `/v1/audio/transcriptions`? | OpenAI’s endpoint table lists **no abuse-monitoring retention** and **no application-state retention** for transcriptions/translations (distinct from most text endpoints’ **30 days**). |
| ZDR for audio? | **Eligible**; requires **prior OpenAI approval** + org/project configuration (not self-serve). |
| Processor / DPA? | **Yes** — current DPA (effective 2026-01-01) positions OpenAI as **Data Processor**; Services Agreement limits use of Customer Content. |
| COPPA “no disclosure” reading? | **Contractual posture supports service-provider/processor treatment**, and the **documented default for the transcription endpoint is stronger than 30-day logging**. Residual risks: **sub-processors**, **legal/safety exceptions**, **usage/system metadata**, **wrong endpoint** (e.g. Realtime, Files, Batches), and **whether a signed DPA/Services Agreement actually binds Mynk’s account**. |

---

## 1. Training — does OpenAI use API inputs (including audio) to train models?

**Finding: No by default for the API Platform (including audio).**

OpenAI states that data sent to the **API** is **not** used to train or improve models unless the customer **explicitly opts in** (e.g. Playground feedback). The March 1, 2023 policy change remains the baseline; 2026 enterprise pages repeat it.

**Official citations:**

- [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data) — “As of March 1, 2023, data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in to share data with us).” Endpoint table column **“Data used for training” = No** for `/v1/audio/transcriptions`, `/v1/audio/translations`, and other API endpoints listed.
- [How your data is used to improve model performance](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/) (updated 2026-03-13) — “By default, we do not train on any inputs or outputs from our products for business users, including ChatGPT Team, ChatGPT Enterprise, and **the API**.”
- [Business data privacy, security, and compliance](https://openai.com/business-data/) — “By default, we do not use data from … **our API platform**—including inputs or outputs—for training or improving our models.”
- [Enterprise privacy at OpenAI](https://openai.com/enterprise-privacy/) (updated 2026-01-08) — “We do not train our models on your data by default.”
- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) (effective 2026-01-01) §4.2 — OpenAI will not use Customer Content to develop or improve the Services **unless Customer explicitly agrees**.

**Mynk note:** Consumer ChatGPT tiers are **out of scope**; Mynk uses the **API**, not consumer ChatGPT, for transcription.

---

## 2. Retention — how long does OpenAI retain API request data / audio by default?

**Finding: Depends on endpoint. For `/v1/audio/transcriptions` and `/v1/audio/translations`, OpenAI’s 2026 endpoint table shows no documented abuse-monitoring or application-state retention. Many other API endpoints default to up to 30 days for abuse monitoring.**

### 2a. General API abuse-monitoring rule

[Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data) states that **by default**, abuse monitoring logs “are generated for all API feature usage” and **“retained for up to 30 days”**, unless law or safety requires longer.

### 2b. Endpoint-specific table (authoritative for Mynk’s Whisper path)

Same document, **“Storage requirements and retention controls per endpoint”**:

| Endpoint | Data used for training | Abuse monitoring retention | Application state retention | ZDR eligible |
|----------|------------------------|----------------------------|-----------------------------|--------------|
| `/v1/audio/transcriptions` | No | **None** | **None** | Yes |
| `/v1/audio/translations` | No | **None** | **None** | Yes |
| `/v1/audio/speech` (TTS) | No | 30 days | None | Yes |
| `/v1/chat/completions` | No | 30 days | None (exceptions) | Yes |
| `/v1/realtime` | No | 30 days | None | Yes |

**Interpretation for memo (not legal conclusion):** For Mynk’s current `client.audio.transcriptions.create` → `/v1/audio/transcriptions` path, OpenAI’s **published default** is **not** the familiar “30-day abuse log” that applies to chat/completions. Counsel should reconcile the **general 30-day paragraph** with the **endpoint table** (table is more specific to transcriptions).

### 2c. Contractual deletion on termination

[OpenAI Services Agreement](https://openai.com/policies/services-agreement/) §11.3 — on termination, OpenAI will **delete all Customer Content within thirty days**, except legal retention or written agreement otherwise.

Older [Feb 2024 DPA](https://openai.com/policies/feb-2024-data-processing-addendum/) explicitly said API Customer Data retained **max 30 days** then deleted; the **Jan 2026 DPA** defers retention detail to product configuration docs (see §3.3 Customer configurations) rather than repeating 30 days in the main body.

### 2d. System / usage metadata (still retained)

[Data controls — Data residency](https://developers.openai.com/api/docs/guides/your-data#data-residency-controls) — **“System data”** (account, metadata, usage statistics, billing, etc.) **does not contain Customer Content** but may be processed/stored outside selected regions. This is **not** the audio file itself but may still matter for privacy assessments.

---

## 3. Zero / reduced retention (ZDR, MAM)

**Finding: ZDR and Modified Abuse Monitoring (MAM) exist for eligible customers; `/v1/audio/transcriptions` is ZDR-eligible. Approval is required; not a dashboard self-serve toggle for typical accounts.**

**Controls:**

- **Modified Abuse Monitoring (MAM)** — excludes customer content from abuse monitoring logs (with exceptions, e.g. rare image/file cases per doc).
- **Zero Data Retention (ZDR)** — same exclusion as MAM; additionally forces `store=false` behavior on `/v1/chat/completions` and `/v1/responses` even if requested `true`.

**Eligibility & enablement:**

- “Subject to **prior approval** by OpenAI and acceptance of additional requirements.”
- “Get in touch with our **sales team**” for eligibility.
- After approval: **Settings → Organization → Data controls → Data Retention** (org- and project-level).
- Admin API supports `retention_type` values including `zero_data_retention`, `modified_abuse_monitoring`, `enhanced_zero_data_retention`, etc. ([Update project data retention](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/data_retention/methods/update)).

**Citations:**

- [Data controls in the OpenAI platform — ZDR / MAM](https://developers.openai.com/api/docs/guides/your-data#zero-data-retention)
- [Business data privacy](https://openai.com/business-data/) — “Qualifying organizations” may configure retention including “zero data retention policy in the API platform.”

**Safety retention carve-out:** OpenAI may make certain models (e.g. `gpt-5.5`, `gpt-5.5-pro`, future models) ineligible for ZDR/MAM for specific customers and **may retain customer content** when classifiers detect potential policy violations ([Safety Retention](https://developers.openai.com/api/docs/guides/your-data#safety-retention)).

**Non-US data residency:** Using regions other than US requires abuse-monitoring controls approval and a **ZDR amendment** ([Data residency — Additional requirements](https://developers.openai.com/api/docs/guides/your-data#additional-requirements-for-non-us-regions)).

---

## 4. Sub-processor / DPA — processor role

**Finding: OpenAI offers a Data Processing Addendum positioning itself as a processor (GDPR term) / service provider (CCPA-aligned commitments) acting on customer instructions.**

**Primary links:**

- [OpenAI Data Processing Addendum](https://openai.com/policies/data-processing-addendum/) — **Effective January 1, 2026** (page updated Dec 1, 2025). PDF: [cdn.openai.com/pdf/openai-data-processing-addendum.pdf](https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf)
- §1.1 — “OpenAI acts as a **Data Processor** on the Customer’s behalf.”
- §2.1 — Processes Customer Data only per **Customer Instructions** (DPA, Agreement, configuration tools).
- §5.1 — **CCPA service provider** commitments (no sell/share; process only for specified business purposes; no use outside direct business relationship).
- [OpenAI Sub-processor List](https://openai.com/policies/sub-processor-list/) (updated 2026-02-11) — AWS, Cloudflare, Snowflake, etc.; moderation sub-processing when content is **flagged**; footnote that some sub-processors are “Except where Zero Data Retention (ZDR) is used.”

**Services Agreement (business/API):**

- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) (effective 2026-01-01) — applies to **API** and business ChatGPT tiers.
- §4.2 — Customer Content used only to **provide Services**, comply with law, enforce policies, prevent abuse; **not** for development/improvement unless Customer agrees.

**Execution:** DPA page includes **“Execute Data Processing Agreement”** — counsel should confirm Mynk has executed/accepted the current DPA + Services Agreement for the production org.

---

## 5. Audio-specific caveats (distinct from text)

| Topic | What OpenAI documents | Mynk relevance |
|-------|----------------------|----------------|
| **Transcription vs TTS** | `/v1/audio/transcriptions` & `/v1/audio/translations`: abuse monitoring **None**; `/v1/audio/speech` (TTS): **30 days** abuse monitoring | Mynk uses **transcriptions** only today (`whisper-1`). |
| **Models** | Data residency table lists `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, etc. under `/v1/audio/transcriptions` | Same retention table row regardless of model **if** the same endpoint is used. |
| **Speech-to-text guide** | [Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text) — API reference for file uploads; no additional retention beyond platform data controls. | Confirm no switch to **Realtime** transcription (`/v1/realtime` = **30 days** abuse monitoring in table). |
| **ChatGPT Record mode** | [Enterprise compliance — ChatGPT record mode](https://help.openai.com/en/articles/11664471) — “Audio files are deleted **immediately after transcription**” (ChatGPT product, not API). | **Do not conflate** with API; included only to avoid confusion. |
| **Files API** | Uploading audio via `/v1/files` → **30 days** abuse monitoring, state until deleted | Mynk sends audio **directly** in transcription requests — **avoid Files** for session audio if minimizing retention. |
| **Batches** | `/v1/batches` — 30 days / until deleted | Avoid batch transcription path for COPPA-sensitive audio unless retention reviewed. |
| **Image/file CSAM scan** | Image/file inputs may be retained on CSAM classifier hits even with ZDR/MAM | Applies to **image/file** inputs on chat/responses, not the audio transcription row. |
| **Moderation sub-processors** | Flagged content may be shared with moderation vendors for review | Theoretically applies if audio/transcript triggered policy classifiers; confirm with OpenAI whether transcription outputs undergo same pipeline. |

---

## 6. Bottom line for Mynk

### Determining facts (from OpenAI docs only)

1. **No default training** on API audio/transcripts (explicit across API data controls, enterprise privacy, Services Agreement §4.2).
2. **Processor/DPA framework exists** and describes instruction-bound processing, deletion on termination, CCPA Art. 28-style service-provider limits (DPA §5.1).
3. **For `/v1/audio/transcriptions`**, OpenAI’s endpoint table documents **no abuse-monitoring retention** and **no application-state retention** — **favorable** vs text endpoints’ 30-day default.
4. **ZDR is available** for audio transcription endpoints but requires **enterprise approval**; MAM is a middle ground.
5. **Residual retention/processing** is still possible: **legal holds**, **safety/policy investigations**, **system/usage metadata**, **sub-processors** (infrastructure always; moderation if flagged), and **wrong API surface** (Realtime, Files, stored Responses).

### Does OpenAI “look like” a service provider/processor vs a third-party discloser?

**Research-only assessment:** OpenAI’s **contractual and product documentation** align with **processor / service-provider** treatment: process on Customer instructions, no training by default, no independent commercial use of Customer Content in the Services Agreement, and **transcription-specific defaults that do not describe 30-day content logging**.

That **supports** the thesis that routing child session audio through **`/v1/audio/transcriptions` under a executed business/API agreement + DPA** is **not analogous** to sending data to a consumer ChatGPT account or a third party that retains audio for its own product purposes.

**It does not automatically eliminate:**

- COPPA **notice** obligations (privacy policy must still describe subprocessors/service providers).
- **Parental consent** requirements for collecting children’s voice/audio (separate from whether OpenAI is a “disclosure”).
- Risk if Mynk has **not** executed the 2026 DPA or uses an account tier governed by **consumer** terms.
- **FTC “disclosure”** analysis when subprocessors or safety teams access content.

### What to bring to counsel (especially if any audio **is** retained)

1. **Account artifacts:** Executed DPA, Services Agreement acceptance date, org ID, whether org is on **API Platform** business terms vs consumer; screenshot of **Settings → Organization → Data controls → Data Retention** (org + project).
2. **Exact production path:** Confirm only `/v1/audio/transcriptions` (not Realtime, Files, Batches, Assistants); model IDs (`whisper-1` vs `gpt-4o-transcribe`); logs showing request URLs.
3. **Reconcile 30-day general language vs transcription “None”:** Written OpenAI confirmation for child-audio use case if available (sales/legal).
4. **ZDR/MAM decision:** Whether to pursue approved ZDR for defense-in-depth; EU/UK data residency + ZDR amendment if applicable.
5. **Sub-processor / moderation:** Whether transcripts/audio can be flagged and sent to moderation vendors per [Sub-processor List](https://openai.com/policies/sub-processor-list/).
6. **COPPA mapping:** Written vendor agreement limiting use to transcription on Mynk’s instructions; whether voice recordings are **PI** requiring verifiable parental consent before collection; school vs commercial tutoring context; update Mynk privacy policy subprocessors list vs “third parties children interact with.”
7. **State law:** CA minors’ privacy, BIPA/voice biometrics (if applicable), retention commitments to parents/tutors.
8. **Incident / legal retention:** Process if OpenAI retains under “law or protect services/third party from harm” or Safety Retention.

---

## Source index (official, accessed 2026-05-31)

| Document | URL |
|----------|-----|
| API data controls (retention table, ZDR) | https://developers.openai.com/api/docs/guides/your-data |
| Speech-to-text API guide | https://developers.openai.com/api/docs/guides/speech-to-text |
| Model training / business vs consumer | https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/ |
| Enterprise privacy | https://openai.com/enterprise-privacy/ |
| Business data privacy | https://openai.com/business-data/ |
| Services Agreement (2026) | https://openai.com/policies/services-agreement/ |
| Data Processing Addendum (2026) | https://openai.com/policies/data-processing-addendum/ |
| Sub-processor List | https://openai.com/policies/sub-processor-list/ |
| Project data retention API | https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/data_retention/methods/update |

---

> **Disclaimer — not legal advice.** This document is research support only. Engage qualified counsel before relying on it for COPPA compliance, consent flows, or privacy-policy changes.

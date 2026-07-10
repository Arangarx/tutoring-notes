# COPPA Compliance Research Brief — Mynk Tutoring Notes
**Date:** 2026-05-31  
**Prepared for:** Founder (Andrew Mortensen) and future legal counsel  
**Branch:** v1-redesign  

---

> ⚠️ **DISCLAIMER — NOT LEGAL ADVICE**
>
> This document is a factual research brief compiled from publicly available primary and secondary sources for the purpose of informing the founder and his future legal counsel. It summarizes federal regulatory text and published FTC guidance. **Nothing in this brief constitutes legal advice, establishes an attorney-client relationship, or should be relied upon as a substitute for advice from a licensed attorney.** COPPA compliance determinations are fact-specific and require qualified legal counsel familiar with the specific product, its data flows, and applicable state law. Consult an attorney before making compliance decisions, drafting legal disclosures, or shipping any consent flow affecting children.
>
> The same disclaimer applies at the end of this document.

---

## Primary Sources Used

| Source | Citation |
|--------|----------|
| COPPA statute | 15 U.S.C. §§ 6501–6506 |
| COPPA Rule (current, as amended) | 16 CFR Part 312 |
| 2025 Final Rule Amendments | 90 FR 16918 (April 22, 2025); compliance deadline April 22, 2026 |
| FTC Six-Step Compliance Plan | FTC Business Guidance (ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) |
| eCFR live text | ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312 |
| FTC school/COPPA blog (2015) | ftc.gov/business-guidance/blog/2015/01/testing-testing-review-session-coppa-schools |
| Fenwick & West analysis (2025) | fenwick.com (data retention analysis) |
| Gibson Dunn analysis (2025) | gibsondunn.com (notice + consent amendments) |
| Davis Wright Tremaine (2025) | dwt.com (amended rule overview) |
| Pelorus EdTech analysis (2026) | gopelorus.com/articles/coppa-rule-amendments-2025 |
| Promise Legal EdTech (2026) | blog.promise.legal/coppa-april-2026-amendments-edtech |

---

## Part 0: What COPPA Covers and Whether Mynk Is an "Operator"

**COPPA applies to:** operators of websites and online services directed to children under 13, or operators of general-audience services who have "actual knowledge" they are collecting personal information from users under 13. (15 U.S.C. § 6502; 16 CFR § 312.3)

**Mynk's situation:** Mynk is a tutoring platform that knowingly enrolls K-12 children (ages 5–18 approximately). Parents explicitly create LearnerProfiles for their children. Mynk has actual knowledge it is collecting personal information from users under 13. **COPPA applies.** (The "under 13" age threshold is what triggers COPPA; the fact that the platform serves a broader K-12 audience does not exempt it from COPPA obligations with respect to the under-13 cohort.)

**Key compliance deadline:** The 2025 Rule amendments were published April 22, 2025, effective June 23, 2025. **Mandatory compliance date: April 22, 2026.** As of the date of this brief (May 31, 2026), Mynk is operating in the post-compliance-deadline window.

---

## Part 1: Executive Summary — The Answers That Most Affect Product Decisions

### 1A. Deletion Rights: Proactive Offer vs. On-Request (Q1 — the highest-stakes product question)

**Bottom line: COPPA does NOT require operators to proactively initiate deletion or to prompt parents to delete. It requires operators to make deletion available on parent request.** However, the operator must provide a visible, accessible mechanism (in the privacy notice and app) through which parents can direct deletion — and must comply when asked.

The precise rule text (§ 312.6(a)(2)) is:

> "The opportunity at any time to **refuse to permit the operator's further use or future online collection** of personal information from that child, and to **direct the operator to delete** the child's personal information."

"Direct" is the operative verb. The parent directs; the operator complies. The operator is not required to spontaneously initiate deletion.

**The gap in Mynk's interim posture:** Mynk plans "no deletion offered up front." That is consistent with the rule as long as (a) the privacy notice and/or in-app mechanism clearly tells parents *how* to request deletion, and (b) an actual workflow exists to honor those requests within a reasonable time. A pure admin-only deletion capability with no parent-visible request pathway (no email address, no contact form, no self-serve) may not satisfy § 312.6's requirement to provide "the opportunity at any time" and a "means" for parents to direct deletion. This is the primary structural risk in the current posture. **See Q5 for full analysis.**

### 1B. Revocation and Past Data: The Critical Distinction

**Stopping future collection is automatic on consent revocation. Deletion of past data is parent-triggered (on request), not automatic.**

When a parent revokes consent under § 312.6, the operator must immediately stop further collection and use. But past data (the existing recordings) need only be deleted if the parent expressly *directs* deletion. Mynk's "revocation stops future capture, existing recordings retained by default" posture is consistent with the rule structure — subject to the caveat that the parent must be given a clear path to request deletion of existing data.

### 1C. Written Retention Policy Is Now Mandatory and Must Be in the Online Notice

Under § 312.10 (amended, effective April 22, 2026), Mynk must have a **written data retention policy** that specifies: (1) the purposes for which children's PI is collected, (2) the business need for retaining it, and (3) a timeframe for deletion. **This policy must appear in the online privacy notice** — it cannot live only in internal documentation. "Retain indefinitely" is explicitly prohibited. This is the most operationally concrete requirement to land before counsel reviews the privacy/terms.

---

## Part 2: Per-Question Findings

---

### Q1: Deletion Rights — Proactive Offer vs. On-Request

**Applicable rule text — 16 CFR § 312.6(a)(2):**

> "The opportunity at any time to refuse to permit the operator's further use or future online collection of personal information from that child, and to **direct the operator to delete** the child's personal information."

**Analysis:**

The rule establishes a parent *right* — not an operator *duty to initiate*. The structure is request-response: the parent directs, the operator must comply. The FTC's Six-Step Compliance Plan describes this as: "Give parents a way to review the information collected from their child and a way to delete it and opt out of further collection."

There is no COPPA provision that requires the operator to proactively solicit deletion, send a "should we delete?" prompt, or automatically delete data on revocation of consent. The obligation is:

1. **Affirmatively disclose** in the privacy notice that parents have the right to direct deletion and how to exercise it. (§ 312.4(d)(5))
2. **Provide the mechanism** — accessible, not unduly burdensome.
3. **Comply** when asked.

**On what timeline?** The rule says the parent has the opportunity "at any time" to direct deletion, but does not specify a response deadline for the operator. No explicit number of days appears in § 312.6. FTC enforcement practice generally treats 30 days as a reasonable timeframe (analogized from deletion-within-a-reasonable-time language elsewhere in the rule and from consent orders). Counsel should advise on defensible timelines.

**Practical implication for Mynk:** The phrase "not proactively offer" is fine. But the privacy notice and some in-app pathway (even a "Contact us to request deletion" email address) must make the right accessible. No mechanism = exposure. A clearly disclosed email contact plus documented internal process to honor requests within 30 days is likely compliant.

---

### Q2: Consent Revocation Mechanics (16 CFR § 312.6)

**Full text of operative provisions:**

> § 312.6(a): "Upon request of a parent... the operator... is required to provide to that parent the following: (1) A description of the specific types or categories of personal information collected...; (2) The opportunity at any time to **refuse to permit the operator's further use or future online collection** of personal information from that child, and **to direct the operator to delete** the child's personal information; and (3)... a means of reviewing any personal information collected from the child."

> § 312.6(c): "Subject to the limitations set forth in § 312.7, an operator may terminate any service provided to a child whose parent has refused... to permit the operator's further use or collection of personal information from his or her child or has directed the operator to delete the child's personal information."

**The two-track distinction:**

| Track | What triggers it | What the operator must do |
|-------|-----------------|--------------------------|
| Stop future collection | Parent revokes consent (says "no more") | Immediately cease collection/use going forward |
| Delete past data | Parent **directs** deletion specifically | Comply with deletion request; may terminate service (§ 312.6(c)) |

These are separate acts. A parent can revoke future consent without directing deletion of historical data. A parent can also direct deletion of historical data independently. The operator is not required to delete existing data when consent is merely revoked (unless the parent also directs deletion).

**Mynk's "revocation stops future capture; existing recordings retained by default":** This is the correct reading of the rule. The existing recordings are retained unless the parent directs deletion. **However**, Mynk must have a documented, parent-accessible process for parents to direct deletion when they want to, and must comply with those requests.

**No explicit timeline for deletion compliance** appears in § 312.6. Guidance from enforcement actions suggests 30 days as a reasonable baseline; counsel should confirm.

---

### Q3: Verifiable Parental Consent Methods (16 CFR § 312.5)

**General rule (§ 312.5(a)):** Operators must obtain verifiable parental consent (VPC) before collecting, using, or disclosing personal information from children.

**Enumerated acceptable methods (§ 312.5(b)(2)):**

| Method | Practical for Mynk? | Notes |
|--------|-------------------|-------|
| (i) Signed consent form via postal mail, fax, or electronic scan | Low friction if scan | Slow but compliant |
| (ii) Credit/debit card transaction with notification to account holder | Requires payment integration | Practical but not ideal for free tier |
| (iii) Toll-free phone with trained personnel | No | Requires staffing |
| (iv) Video conference with trained personnel | No | Requires staffing |
| (v) Government ID checked against a database | Maybe | Third-party identity verification services exist |
| (vi) Knowledge-based authentication | Maybe | Third-party KBA services exist |
| (vii) Photo ID + facial recognition matched by personnel | No | Requires staffing |
| **(viii) Email + confirmatory email (or letter/phone confirmation)** | **YES — for non-disclosing operators** | Simplest path for Mynk if audio stays internal |
| **(ix) Text message + confirmatory text (or letter/phone confirmation)** [NEW 2025] | **YES — for non-disclosing operators** | Added by 2025 amendments |

**The key condition on (viii) and (ix):** These simpler methods are available ONLY to operators that do not "disclose" (as defined by § 312.2) children's personal information to third parties. If Mynk shares audio/transcripts with any third party, the email-plus method is unavailable.

**Mynk's practical path:** If the platform:
- Does not share children's audio/transcripts/notes with third parties (other than Whisper API as a processor), AND
- Maintains audio processing as an internal operation

...then **email-plus-confirmation** is the most practical VPC method. Flow: parent receives email → clicks consent → Mynk sends confirmatory email → parent is notified they can revoke at any time. This is the standard pattern used by most small edtech operators.

**The OpenAI/Whisper question:** If Mynk sends child audio to OpenAI for transcription, whether that constitutes a "disclosure" to a third party (which would knock out the email-plus method) is a fact-specific question. COPPA's definition of "disclose" includes making PI available to third parties. Whether OpenAI is a "third party" vs. a "service provider" operating under appropriate contractual restrictions is an important legal question for counsel. Many operators treat their transcription API providers as service providers (not third parties) under data processing agreements. **Flag for counsel.**

**New 2025 requirement:** Under amended § 312.5(a)(2), a separate VPC is now required for disclosures to third parties for targeted advertising, AI training/development, or other non-internal purposes. Mynk's current scope (recordings for session notes, tutor review) is likely internal — but any future use that involves sharing with third parties for commercial purposes would need a distinct consent pathway.

---

### Q4: Privacy Notice Requirements (16 CFR § 312.4)

**Two notice types required:**
1. **Direct notice** — sent to parent before collection begins (§ 312.4(b)–(c))
2. **Online notice** — posted prominently on the site/app at all times (§ 312.4(d))

**What the online notice must state (§ 312.4(d), including 2025 amendments):**

- [ ] Name and contact information of the operator (and all operators collecting PI through the service if multiple)
- [ ] Description of what PI is collected from children; how it is used; disclosure practices (including **identities and specific categories of third parties** to whom PI is disclosed and the purposes)
- [ ] How the operator intends to use any PI collected for internal operations specifically (new 2025 requirement)
- [ ] **Data retention policy** as required under § 312.10 — purposes for collection, business need, and deletion timeframe — **must appear in the online notice** (not just internally)
- [ ] If applicable: description of how the operator uses audio files collected under the § 312.5(c)(9) exception AND a statement that such files are deleted immediately after use. *(Note: this specific disclosure applies ONLY if using the audio-exception. Mynk is NOT using the exception — it retains audio. Mynk instead must disclose audio in the standard "what we collect and how we use it" section.)*
- [ ] That parents can review or have deleted the child's PI, and how to do so (§ 312.4(d)(5))

**Specific checklist for the Mynk/Mortensen Apps umbrella + product privacy/terms:**

**Content required:**
- [ ] Explicit identification of audio recordings as personal information collected
- [ ] Description of how audio is used: transcription (via which processor?), note generation, storage duration
- [ ] Explicit identification of session transcripts/notes as personal information
- [ ] Description of how transcripts/notes are used: tutor review, session history, student progress
- [ ] If applicable: disclosure that OpenAI/Whisper processes audio (identify as processor or third party as appropriate)
- [ ] Data retention policy: what categories of data, why retained, for how long (must be specific — "as long as necessary" alone is insufficient; the FTC's enforcement record suggests a defined number of months/years keyed to account status)
- [ ] Statement that parents may review PI collected and how (contact method)
- [ ] Statement that parents may direct deletion and how (contact method/self-serve)
- [ ] Statement that parents may refuse further collection (revocation mechanism)
- [ ] Description of educational-use consent toggle: what it covers, what "educational purposes" means specifically, that it is revocable going-forward, the effect of revocation
- [ ] If sharing with tutor is a "disclosure": identify tutor as category of third-party recipient and purpose
- [ ] Any third parties that receive children's PI (if beyond processor relationship)

**Form requirements:**
- [ ] Prominently labeled link on home/landing page ("Privacy Policy" with visible children's section)
- [ ] Link at each point of data collection
- [ ] Notice must be "clearly and understandably written, complete, and... contain no unrelated, confusing, or contradictory materials" (§ 312.4(a))

---

### Q5: The Interim Posture — "Retain by Default, No Deletion Offered Up Front, No Never-Delete Claims, Admin-Only Deletion Capability"

**Posture element by element:**

| Element | COPPA Exposure Assessment |
|---------|--------------------------|
| **Retain existing recordings by default** | Acceptable under § 312.6 (deletion requires parent direction, not automatic) |
| **No deletion proactively offered/prompted** | Acceptable — COPPA requires opportunity to request, not spontaneous offer |
| **No "we never delete" claims** | Critical. Such claims would contradict the parent's right to direct deletion (§ 312.6) AND contradict the prohibition on indefinite retention (§ 312.10). Correct posture. |
| **Admin-only deletion capability (no parent-facing mechanism yet)** | **RISK.** § 312.6(a) requires a "means" for parents to direct deletion that is "not unduly burdensome." An admin-only backend with no parent-visible request pathway (no email, no form, no disclosed contact) is structurally deficient. The *capability* is necessary but not sufficient. |
| **Written retention policy not yet in online notice** | **RISK.** § 312.10 now requires the written retention policy to be disclosed in the online notice (§ 312.4(d)). Compliance deadline was April 22, 2026 — already past. |

**Specific risks:**

1. **No parent-visible deletion request pathway.** Even a simple "email us at privacy@usemynk.com to request deletion of your child's records" in the privacy policy would substantially close this gap. The admin deletion capability is the right technical foundation; the missing piece is the disclosed parent-facing path to trigger it.

2. **No written retention policy in online notice.** The amended § 312.10 (effective April 2026) requires a defined purpose, business need, and timeframe in the privacy notice. "Retained while the account is active, deleted [X] months after account closure" is the expected pattern. The FTC's enforcement in *Kurbo* shows that retaining data indefinitely (or for 3 years without a purpose-specific justification) violates the retention requirement. Mynk needs: a defined timeframe, a disclosed business purpose (e.g., "to enable tutors to review session history and track student progress over time"), and a deletion schedule.

3. **The Kurbo precedent (FTC enforcement):** In *FTC v. Kurbo*, the FTC alleged that retaining children's PI for 3 years regardless of account activity — unless a parent requests deletion — violated the COPPA Reasonable Retention Requirement. The lesson: retention must be *tied to active purpose*, not merely to passive storage. Mynk should be prepared to articulate a purpose for the retention period it selects (e.g., retention while tutor-student relationship is active + 12 months post-termination for dispute resolution).

**Bottom-line on the interim posture:** It is broadly defensible as a transitional approach, but two gaps require action before the posture is clean: (a) add a parent-visible deletion request pathway (even just a disclosed email address), and (b) draft and publish a concrete retention timeline in the privacy notice. Both can be done without the full self-serve deletion feature.

---

### Q6: The Educational-Use Consent Toggle — COPPA Issues

**Proposed design:** Parent can toggle consent for child's session content to be used for "educational purposes by the tutor." Revocable going-forward. Prior-consent releases are not clawed back.

**COPPA analysis:**

**A. Is the tutor-seeing-recordings a "disclosure" requiring separate consent under § 312.5(a)(2)?**

Under the 2025 amendments, operators must obtain **separate** VPC for disclosures to third parties for certain purposes. The key question is whether the tutor (Sarah) is a "third party" under § 312.2's definition or whether she is operating within the service (i.e., she is *the service user* reviewing her own students' session data through the platform).

Under COPPA, "third party" means any person not the operator or the operator's service providers. A tutor using Mynk to access her own students' session data — data the tutor participated in collecting — is arguably receiving information in her role as a *user of the service*, not a disclosure to an external third party. If structured this way (tutor access is a platform feature, not an export to an external party), the educational-use consent may be part of the initial consent scope rather than requiring a separate § 312.5(a)(2) disclosure consent.

**However:** Counsel must evaluate whether Mynk's relationship with tutors exposes it to the "disclosure" definition. If tutor access is characterized as sharing PI with a third party for a specific purpose, a separate consent mechanism may be required for that sharing.

**B. The "can't claw back prior releases" framing:**

COPPA does not address the retroactive effect of revocation on uses *already performed* while consent was in effect. An operator can generally rely on consent given for specific uses that were completed before revocation. The revoke-forward posture (future capture stops; prior sessions remain available to the tutor until and unless parent directs deletion) is consistent with how COPPA's consent and deletion structure operates.

**What must be clearly disclosed:**
- [ ] What "educational purposes by the tutor" means specifically (e.g., reviewing session transcripts for lesson planning; identifying recurring student gaps)
- [ ] That this consent is separate from and in addition to the base session recording consent
- [ ] That it is revocable going-forward (and what revocation means: tutor is notified, no future access to new sessions)
- [ ] That prior sessions shared with the tutor while consent was in effect remain accessible (if that is the design) — i.e., revocation is prospective only
- [ ] Whether the tutor shares or exports this information further (if so, additional disclosure may be needed)

**C. AI training use:**

Under the 2025 amendments (per the FTC preamble), disclosures for "AI training or development" purposes are **not integral to the underlying service** and require **separate** VPC under § 312.5(a)(2). If Mynk's OpenAI/Whisper use goes beyond transcription-as-processor into feeding training datasets, this is a separate consent pathway. Confirm with counsel whether Mynk's data processing agreement with OpenAI includes "no training on your data" protections — if it does, this issue may not arise.

---

### Q7: Audio of Minors as "Personal Information"

**Express rule text — 16 CFR § 312.2 (definition of "personal information"), item (8):**

> "(8) A photograph, video, or **audio file where such file contains a child's image or voice**;"

This has been in the Rule since the 2013 amendments. Mynk's tutoring session audio recordings **are personal information** under COPPA as a matter of unambiguous regulatory text. This triggers all of COPPA's consent, notice, retention, and deletion obligations.

**Additionally under the 2025 amendments — § 312.2, definition of "personal information," new item (10):**

> "(10) A **biometric identifier** that can be used for the automated or semi-automated recognition of an individual, such as fingerprints; handprints; retina patterns; iris patterns; genetic data, including a DNA sequence; **voiceprints**; gait patterns; facial templates; or faceprints;"

**Voiceprints** are now also personal information. If Mynk ever uses the audio to derive a *speaker model/voiceprint* (for speaker identification, voice authentication, or any automated recognition use), that separately qualifies as personal information under the biometric category — with the same consent/notice/retention obligations.

**The audio-exception (§ 312.5(c)(9)) does NOT apply to Mynk:**

The rule provides an exception to the VPC requirement for:
> "Where an operator collects an audio file containing a child's voice, and no other personal information, **for use in responding to a child's specific request** and where the operator does not use such information for any other purpose, **does not disclose it, and deletes it immediately** after responding to the child's request."

This exception is designed for voice-assist/search use cases (Alexa-style commands). It does NOT apply to Mynk because: (a) Mynk retains audio (does not delete immediately), (b) Mynk uses audio for transcripts and session notes beyond the immediate request-response, and (c) Mynk collects other personal information (LearnerProfile, etc.) alongside. **Mynk must obtain VPC before collecting child audio — no exception applies.**

**Special handling:** No special handling beyond standard COPPA obligations applies specifically to audio recordings (as opposed to the audio-exception disclosure, which is inapplicable here). The obligations are: VPC obtained, privacy notice discloses audio collection and use, written retention policy covers audio, deletion mechanism available to parents.

---

### Q8: The School/Educational Exception — Applies to Private Tutors?

**Short answer: No. The school-as-consent-intermediary exception does not apply to Mynk.**

**Background:** FTC guidance since 1999 (codified in the 2013 Rule's Statement of Basis and Purpose and the FTC's 2015 blog post) has recognized that schools may act as an intermediary in the COPPA consent process, or as the parent's agent, giving consent on behalf of parents for ed-tech services used *in the school context for educational purposes and for no commercial purpose.*

**The 2025 final rule did not codify a formal school-authorization exception.** The FTC explicitly declined to finalize the proposed school-authorization amendments to avoid conflict with pending DOE FERPA regulatory changes:

> "To avoid making amendments to the COPPA Rule that may conflict with potential amendments to DOE's FERPA regulations, the Commission is not finalizing the proposed amendments to the Rule related to ed tech and the role of schools at this time. The Commission will continue to enforce COPPA in the ed tech context consistent with its existing guidance." *(90 FR 16918, Apr. 22, 2025)*

**Why this exception doesn't apply to Mynk:**

1. **Mynk is not deployed by or through a school.** The school authorization pathway requires an operator to be authorized *by a school* after providing notice to the school. Mynk is a platform parents and tutors use independently of any school.

2. **The tutor is not a school.** Private tutors operating independently (like Sarah) are not "schools" within the meaning of the FTC's guidance or any reasonable interpretation of it. The FTC's 2015 blog makes clear the pathway applies to "schools" — educational institutions — not individual tutors.

3. **Even if it did apply, commercial purpose breaks it.** The school authorization exception is explicitly limited to collection "just for an educational purpose, and for no other commercial purpose." Mynk is a commercial service.

**Bottom line:** Mynk **cannot** rely on a school or tutor to provide consent on parents' behalf. **Direct verifiable parental consent from each child's parent is required.** Mynk's existing model (parent AccountHolder gives consent at "claim" time) is the correct approach — it just needs to verify that the consent flow satisfies the VPC methods in § 312.5(b)(2).

---

### Q9: LLC/Liability Shielding

Out of scope for this brief — entity formation and liability structure are business and legal decisions for counsel. No research conducted.

---

## Part 3: 2025 COPPA Rule Amendments — What Changed and When

| What changed | Rule section | Compliance deadline |
|-------------|-------------|-------------------|
| Explicit prohibition on indefinite retention; written retention policy required in online notice | § 312.10 | April 22, 2026 ✓ (past) |
| Separate VPC required for third-party disclosures (targeted advertising, AI training, non-internal uses) | § 312.5(a)(2) | April 22, 2026 ✓ (past) |
| Biometric identifiers added to "personal information" definition (voiceprints, fingerprints, iris, DNA, etc.) | § 312.2 | April 22, 2026 ✓ (past) |
| Audio file exception (§ 312.5(c)(9)) codified in rule text; disclosure in online notice required for users of the exception | § 312.5(c)(9); § 312.4(d)(4) | April 22, 2026 ✓ (past) |
| Online notice must now name third-party identities (not just categories) and disclose specific internal operations for persistent identifier use | § 312.4(d) | April 22, 2026 ✓ (past) |
| Text-plus method (ix) added as VPC method for non-disclosing operators | § 312.5(b)(2)(ix) | April 22, 2026 ✓ (past) |
| New definition of "mixed audience website or online service" | § 312.2 | April 22, 2026 ✓ (past) |
| Safe Harbor transparency requirements (membership disclosure, FTC reporting) | § 312.11 | October 22, 2025 (for existing programs) |
| Ed-tech / school authorization codification | NOT ADOPTED — deferred | N/A |

**Key: All substantive amendments had a compliance deadline of April 22, 2026.** Mynk is in the post-deadline period as of this brief. Any gap against the amended rule is already an exposure.

---

## Part 4: Concrete Checklist — Umbrella Privacy/Terms Update (Phase-2 BLOCKER)

The mortensenapps.com umbrella privacy/terms is the canonical legal source (registered with Google OAuth). The Mynk product /privacy and /terms are subordinate facades. **Both must satisfy these requirements.**

### A. Mandatory Disclosures to Add (§ 312.4(d))

- [ ] **"What we collect"** section explicitly names: *audio recordings of tutoring sessions, session transcripts, session notes, LearnerProfile identity information (name, grade level, subjects), and any persistent identifiers*
- [ ] **"How we use it"** section explicitly states purposes: *session transcription, tutor review and lesson planning, student progress tracking, and service delivery*
- [ ] **"Third parties"** section: identify any actual third parties (not service providers) who receive children's PI; if none, say so. If OpenAI is treated as a service provider (DPA in place, no training on Mynk data), state this clearly and note audio is processed for transcription only
- [ ] **"Verifiable Parental Consent"** section: describe the VPC method used (e.g., email-plus-confirmation at account claim time) and note parents must consent before child sessions begin
- [ ] **"Data Retention Policy"** (§ 312.10 BLOCKER): state (a) purposes for which audio/transcripts/notes are retained, (b) business need (e.g., "to allow tutors and parents to review session history and track student progress"), (c) defined retention timeframe (e.g., "retained while the tutor-student relationship is active and for [X] months following account closure or session deletion request")
- [ ] **"Parent Rights"** section: state that parents may (a) review PI collected from their child, (b) direct deletion of their child's PI, and (c) revoke consent for future collection — AND state *how* (email address or in-app mechanism)
- [ ] **"Educational Use Consent"** section (when toggle ships): describe what "educational purposes by the tutor" means, that it is a separate optional consent layer, that it is revocable going-forward, and that prior sessions shared while consent was in effect remain accessible after revocation

### B. Structural/Process Requirements

- [ ] Privacy policy must be reachable from home/landing page and at each point of data collection (§ 312.4(d))
- [ ] "Children's Privacy" section (or the entire policy if the service is child-directed) must be prominently labeled
- [ ] The VPC flow (email-plus-confirmation) must actually send a confirmatory email after parent consent, and must notify the parent they can revoke at any time (§ 312.5(b)(2)(viii))
- [ ] A parent-accessible deletion request mechanism must exist and be disclosed (email address at minimum) (§ 312.6)
- [ ] Internal process must exist to honor deletion requests within a reasonable time (≈30 days)
- [ ] The direct notice to parents (sent before or at account claim time) must contain: what PI is collected, how it's used, that the parent can review/delete/revoke, and how to contact the operator (§ 312.4(b)–(c))
- [ ] Any material change in data practices requires re-consent (new notice to parent + opportunity to consent before the new practice begins) (§ 312.4(b))

### C. When the Educational-Use Toggle Ships

- [ ] Add toggle description and scope to privacy notice (before shipping the feature)
- [ ] Add disclosure of revoke-forward semantics (prior sessions not auto-deleted on revocation)
- [ ] Add disclosure of tutor notification on revocation
- [ ] Obtain separate consent (if structured as a disclosure to a third party — flag for counsel)

---

## Part 5: Questions to Take to Counsel

The following are fact-specific questions requiring legal judgment. This brief identifies them but does not answer them.

1. **Is OpenAI/Whisper a "service provider" or a "third party" under COPPA for Mynk's transcription use?** If service provider (under a data processing agreement that prohibits training on Mynk data), the email-plus VPC method may be available. If third party, a stronger VPC method is required. **Also: Does Mynk currently have a DPA with OpenAI that covers children's data?**

2. **What retention timeline is defensible?** Counsel should advise on a specific retention period (number of months post-account-closure) that is proportionate to the stated purpose (session history review, tutoring progress). The Kurbo enforcement case is the key precedent. 12 months post-account-closure? 24? The answer depends on whether a defensible purpose can be articulated.

3. **Is tutor access to session recordings a "disclosure" requiring separate § 312.5(a)(2) consent?** If the tutor is a platform user accessing her own students' data (internal service use), it is likely not a disclosure. If structured differently, it may be. The educational-use toggle design should be reviewed through this lens.

4. **State law requirements.** COPPA is a federal floor. Several states (including California's CCPA/CPRA, and state-level COPPA analogs) impose additional obligations for children's data. Counsel should advise on which states are relevant given Mynk's user base.

5. **What VPC method is most defensible for Mynk's parent-claim flow?** The email-plus method is practical, but counsel should confirm whether the specific flow (parent creates account → claims learner → receives email → confirms → receives revocation-reminder) satisfies § 312.5(b)(2)(viii)'s requirements, including the notice that the parent can revoke.

6. **What is the safe deletion timeline for parent-directed deletion requests?** 30 days is a reasonable assumption from enforcement practice, but counsel should confirm and advise on documenting the timeline in internal policy.

7. **LLC formation and liability structure.** Out of scope for this brief. Counsel's domain.

8. **FERPA applicability.** If any Mynk students are in schools that use Mynk as a school-authorized tool (not Mynk's current model, but possible future), FERPA may also apply. Counsel should flag this.

9. **COPPA Safe Harbor programs.** Several FTC-approved safe harbor programs (e.g., CARU/BBB National Programs' COPPA Safe Harbor) exist. Participation provides a presumption of compliance and additional FTC enforcement deference. Counsel should advise whether Safe Harbor enrollment is worth pursuing for a small tutoring platform.

---

## Part 6: Key Sources for Counsel Review

| Purpose | Source |
|---------|--------|
| Full amended rule text | [eCFR § 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312) |
| FTC compliance guide | [Six-Step Compliance Plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) |
| 2025 Federal Register final rule (full text + Statement of Basis) | [90 FR 16918 (Apr. 22, 2025)](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) |
| FTC press release on 2025 amendments | [FTC Press Release (Jan. 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data) |
| FTC guidance on schools and COPPA | [FTC Blog (Jan. 2015)](https://www.ftc.gov/business-guidance/blog/2015/01/testing-testing-review-session-coppa-schools) |
| COPPA statute | 15 U.S.C. §§ 6501–6506 |
| FTC children's privacy business guidance hub | [ftc.gov/business-guidance/privacy-security/childrens-privacy](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy) |

---

## Appendix: Mynk COPPA Obligation Map (Quick Reference)

| Mynk data type | Covered by COPPA? | VPC required? | Retention limit? | Deletion right? |
|---------------|------------------|--------------|-----------------|----------------|
| Session audio recording | Yes (§ 312.2(8): audio file with child's voice) | Yes | Yes (§ 312.10) | Yes (§ 312.6) |
| Session transcript | Yes (derivative of audio; contains PI) | Yes | Yes | Yes |
| Session notes | Yes (if contains PI about child) | Yes | Yes | Yes |
| LearnerProfile (name, grade) | Yes | Yes | Yes | Yes |
| Parent email/contact | Yes (online contact information) | Collected to provide notice/consent only | Delete if consent not obtained within reasonable time | Yes |
| Voiceprint (if derived for ID) | Yes (§ 312.2(10): biometric voiceprint) | Yes | Yes | Yes |

---

> ⚠️ **DISCLAIMER (REPEATED) — NOT LEGAL ADVICE**
>
> This document is a factual research brief for informational purposes only. It summarizes publicly available regulatory text and published FTC guidance. **Nothing in this brief constitutes legal advice.** COPPA compliance is fact-specific and requires qualified legal counsel. Do not rely on this brief as the basis for product, policy, or legal decisions without consulting a licensed attorney.

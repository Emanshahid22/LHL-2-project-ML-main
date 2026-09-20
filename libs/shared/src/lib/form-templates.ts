import { FormTemplate, MgFormCode } from './form-template.types';

/**
 * MG form template definitions.
 *
 * MG11 and MG5 carry realistic field sets; the remaining nine are reasonable
 * placeholders to be fleshed out with practitioners. Field ids are stable —
 * see the note on FormFieldDefinition.id before renaming anything.
 */

const MG1: FormTemplate = {
  code: 'MG1',
  name: 'File Front Sheet',
  description: 'Cover sheet summarising the case file contents and key details.',
  templateVersion: 2,
  fields: [
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      helpText:
        'The Unique Reference Number assigned to the case, in the format force code / station / sequence / year, e.g. 01AB0123456/24.',
      placeholder: 'e.g. 01AB0123456/24',
      mapsTo: 'urn',
      validation: { format: 'urn', maxLength: 20 },
    },
    {
      id: 'defendantName',
      label: 'Defendant full name',
      type: 'text',
      required: true,
      helpText: 'Full name of the defendant as it appears on the charge sheet.',
      mapsTo: 'defendantName',
      validation: { maxLength: 120 },
    },
    {
      id: 'defendantDob',
      label: 'Defendant date of birth',
      type: 'date',
      required: true,
      helpText: 'Date of birth as verified from custody records or identity documents.',
      mapsTo: 'defendantDob',
      validation: { noFutureDate: true },
    },
    {
      id: 'chargeSummary',
      label: 'Charges / offences',
      type: 'textarea',
      required: true,
      helpText: 'List each charge with the statutory provision, one per line.',
      mapsTo: 'charges',
      rows: 4,
    },
    {
      id: 'officerInCase',
      label: 'Officer in the case',
      type: 'text',
      required: true,
      helpText: 'Name, rank and collar number of the officer in the case (OIC).',
      mapsTo: 'officerInCase',
    },
    {
      id: 'anticipatedPlea',
      label: 'Anticipated plea',
      type: 'select',
      required: false,
      helpText: 'The plea anticipated at first hearing, if known.',
      options: [
        { value: 'guilty', label: 'Guilty' },
        { value: 'not_guilty', label: 'Not guilty' },
        { value: 'unknown', label: 'Not known' },
      ],
    },
    {
      id: 'trialEstimate',
      label: 'Trial time estimate (days)',
      type: 'number',
      required: false,
      helpText: 'Estimated length of trial in days, if a not-guilty plea is anticipated.',
      validation: { min: 0, max: 365 },
    },
  ],
};

const MG2: FormTemplate = {
  code: 'MG2',
  name: 'Initial Description of Taped Interview',
  description: 'Record of a suspect interview conducted on tape (ROTI summary).',
  templateVersion: 2,
  fields: [
    {
      id: 'interviewee',
      label: 'Person interviewed',
      type: 'text',
      required: true,
      helpText: 'Full name of the person interviewed under caution.',
      mapsTo: 'defendantName',
    },
    {
      id: 'interviewDate',
      label: 'Date of interview',
      type: 'date',
      required: true,
      helpText: 'Date the taped interview took place.',
      validation: { noFutureDate: true },
    },
    {
      id: 'interviewStart',
      label: 'Start time',
      type: 'time',
      required: true,
      helpText: 'Time the recording commenced, from the tape log.',
    },
    {
      id: 'interviewEnd',
      label: 'End time',
      type: 'time',
      required: true,
      helpText: 'Time the recording concluded, from the tape log.',
      validation: { notBefore: { fieldId: 'interviewStart', strict: true, message: 'The interview must end after it starts.' }, },
    },
    {
      id: 'location',
      label: 'Place of interview',
      type: 'text',
      required: true,
      helpText: 'Police station or other location where the interview was conducted.',
    },
    {
      id: 'officersPresent',
      label: 'Officers present',
      type: 'textarea',
      required: true,
      helpText: 'Names, ranks and numbers of all officers present, one per line.',
      rows: 3,
    },
    {
      id: 'solicitorPresent',
      label: 'Legal representative present',
      type: 'text',
      required: false,
      helpText: 'Name and firm of any legal representative in attendance.',
    },
    {
      id: 'tapeReference',
      label: 'Tape / recording reference',
      type: 'text',
      required: true,
      helpText: 'Master tape or digital recording reference number.',
    },
    {
      id: 'summary',
      label: 'Summary of interview',
      type: 'textarea',
      required: true,
      helpText:
        'A balanced summary of the interview, including significant statements and any no-comment responses.',
      rows: 8,
    },
  ],
};

/**
 * MG3 — Pre-Charge Decision Request (ticket LER-1033).
 *
 * Sourced from docs/mg-form-research-findings.md: 59 fields, 57 `documented`,
 * verdict usable-as-draft with 57 verified verbatim against CPS Director's
 * Guidance on Charging (DG6) Annex 4.
 *
 * STANDING CAVEAT, and it is important. **No blank MG3 is published anywhere.**
 * The Manual of Guidance states the MG3 is "strictly a communication between the
 * police and CPS", so unlike MG4 there is no specimen to read labels off. What is
 * authoritative here is the CONTENT SPECIFICATION in DG6 Annex 4; every label,
 * section name and ordering below is our reconstruction of it. This template may
 * therefore stay `unverified` indefinitely, and if a practitioner says a defence
 * solicitor never completes an MG3, it should be hidden rather than shipped.
 *
 * At 59 fields this is by far the longest template, and the flat renderer will
 * present it as a very long form. That is a UX problem worth solving (the MG11
 * wizard is the pattern) but not by trimming the form: the field set is what DG6
 * requires.
 */
const MG3: FormTemplate = {
  code: 'MG3',
  name: 'Pre-Charge Decision Request',
  description:
    'Referral to a prosecutor for a charging decision or pre-charge advice, per DG6 Annex 4.',
  // v2 (LER-1033): rebuilt from the DG6 Annex 4 content specification.
  templateVersion: 3,
  verification: 'unverified',
  fields: [
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      section: 'Case and suspect details',
      helpText:
        'Case URN, e.g. 01AB0123456/24.',
      mapsTo: 'urn',
      provenance: 'documented',
      validation: { format: 'urn', },
    },
    {
      id: 'arrestSummonsNumber',
      label: 'Arrest/Summons Number (ASN)',
      type: 'text',
      required: true,
      section: 'Case and suspect details',
      helpText:
        'The ASN for this suspect; it ties the referral to the PNC record.',
      provenance: 'documented',
      validation: { format: 'asn', maxLength: 40 },
    },
    {
      id: 'suspectName',
      label: 'Suspect full name',
      type: 'text',
      required: true,
      section: 'Case and suspect details',
      helpText:
        'Full name of the suspect this referral concerns.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'suspectDob',
      label: 'Suspect date of birth',
      type: 'date',
      required: true,
      section: 'Case and suspect details',
      helpText:
        'Date of birth of the suspect; drives youth and vulnerability considerations.',
      mapsTo: 'defendantDob',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
    {
      id: 'gender',
      label: 'Gender',
      type: 'select',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Gender as recorded in custody.',
      provenance: 'documented',
      options: [
        { value: 'M', label: 'M' },
        { value: 'F', label: 'F' },
        { value: 'other', label: 'Other / self-described' },
      ],
    },
    {
      id: 'ethnicityNationality',
      label: 'Ethnicity and nationality',
      type: 'text',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Self-defined ethnicity and nationality, as recorded. Relevant to charging and to immigration consequences.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'languageInterpreter',
      label: 'Language / dialect and interpreter requirement',
      type: 'text',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Language and dialect, and whether an interpreter is needed at court. Record dialect where it affects who can interpret.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'mentalHealthIssues',
      label: 'Mental health issues affecting the decision',
      type: 'textarea',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Any mental health or capacity issue bearing on the charging decision or on fitness to be interviewed.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'arrestDate',
      label: 'Date of arrest',
      type: 'date',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Date the suspect was arrested, which may precede this referral.',
      provenance: 'documented',
      validation: { notAfter: { fieldId: 'decisionDate', severity: 'advisory', message: 'The arrest is usually on or before the charging decision — check this is right.' }, noFutureDate: true },
    },
    {
      id: 'bailStatus',
      label: 'Suspect status',
      type: 'select',
      required: true,
      section: 'Case and suspect details',
      helpText:
        'Current status of the suspect pending the charging decision.',
      provenance: 'documented',
      options: [
        { value: 'custody', label: 'In custody' },
        { value: 'bail', label: 'Released on bail' },
        { value: 'rui', label: 'Released under investigation' },
      ],
    },
    {
      id: 'paceClockStatus',
      label: 'PACE clock status',
      type: 'text',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Time remaining on the PACE clock where the suspect is detained, so the prosecutor knows the deadline.',
      provenance: 'documented',
      validation: { maxLength: 80 },
    },
    {
      id: 'previousConvictionsAvailable',
      label: 'Previous convictions / out-of-court disposals available',
      type: 'checkbox',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Tick where the antecedents and any previous out-of-court disposals are attached to this referral.',
      provenance: 'documented',
    },
    {
      id: 'currentProceedings',
      label: 'Current or pending proceedings',
      type: 'textarea',
      required: false,
      section: 'Case and suspect details',
      helpText:
        'Any live or pending proceedings against the suspect, with court and next hearing date.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'investigationPoint',
      label: 'Point of investigation at which the decision is sought',
      type: 'select',
      required: true,
      section: 'Referral',
      helpText:
        'Where the investigation has reached, which sets what the prosecutor can decide.',
      provenance: 'documented',
      options: [
        { value: 'pre_interview', label: 'Pre-interview advice' },
        { value: 'post_interview', label: 'Post-interview charging decision' },
        { value: 'post_bail', label: 'Following bail return' },
        { value: 'further_evidence', label: 'After further evidence' },
      ],
    },
    {
      id: 'codeTestApplied',
      label: 'Code Test applied',
      type: 'select',
      required: true,
      section: 'Referral',
      helpText:
        'Which limb of the Code for Crown Prosecutors the referral is made under.',
      provenance: 'documented',
      options: [
        { value: 'full', label: 'Full Code Test' },
        { value: 'threshold', label: 'Threshold Test' },
      ],
    },
    {
      id: 'codeTestRationale',
      label: 'Code Test rationale',
      type: 'textarea',
      required: true,
      section: 'Referral',
      helpText:
        'Why that test applies. If the Threshold Test, address each of its conditions, including why the case cannot wait for the Full Code Test.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'decisionSought',
      label: 'Decision sought',
      type: 'textarea',
      required: true,
      section: 'Referral',
      helpText:
        'State plainly what is asked of the prosecutor — authorisation to charge, advice, or an out-of-court disposal.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'caseTypeFlags',
      label: 'Case type / flags',
      type: 'text',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Any case flags that change handling, e.g. domestic abuse, hate crime, rape and serious sexual offence, modern slavery.',
      provenance: 'documented',
      validation: { maxLength: 160 },
    },
    {
      id: 'proposedCharges',
      label: 'Proposed charges',
      type: 'textarea',
      required: true,
      section: 'Offence and proposed charges',
      helpText:
        'Each proposed charge with its statutory provision, one per line, using Police National Legal Database wording.',
      mapsTo: 'charges',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'offenceDate',
      label: 'Date (or date range) of offence',
      type: 'date',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Date of the offence. Where it spans a period, give the earliest date here and the range in the factual summary.',
      mapsTo: 'offenceDate',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
    {
      id: 'offenceLocation',
      label: 'Location of offence',
      type: 'textarea',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Where the offence took place, in enough detail to establish jurisdiction.',
      provenance: 'documented',
      rows: 2,
    },
    {
      id: 'statutoryTimeLimits',
      label: 'Statutory time limits',
      type: 'text',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Any limitation period that applies, e.g. six months for a summary-only offence, with the expiry date.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'consentsRequired',
      label: 'Consents required',
      type: 'text',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Any consent needed to prosecute, e.g. Attorney General or DPP consent, and whether it has been obtained.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'evidenceSummary',
      label: 'Factual summary',
      type: 'textarea',
      required: true,
      section: 'Offence and proposed charges',
      helpText:
        'A clear narrative of what happened and how the evidence establishes each element of each proposed charge.',
      provenance: 'documented',
      rows: 8,
    },
    {
      id: 'caseIssues',
      label: 'Identified or likely issues in the case',
      type: 'textarea',
      required: true,
      section: 'Offence and proposed charges',
      helpText:
        'The issues a court is likely to have to resolve — identification, consent, self-defence, intent — and the evidence bearing on each.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'suspectAccount',
      label: 'Suspect’s account and understanding of the defence case',
      type: 'textarea',
      required: true,
      section: 'Offence and proposed charges',
      helpText:
        'The account given in interview, or a note that no comment was made, and what the defence case is expected to be.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'strengthsWeaknesses',
      label: 'Analysis of strengths and weaknesses',
      type: 'textarea',
      required: true,
      section: 'Offence and proposed charges',
      helpText:
        'An honest assessment of both. Weaknesses matter more than strengths here: the prosecutor cannot apply the Code without them.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'anticipatedPlea',
      label: 'Anticipated plea and rationale',
      type: 'textarea',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'The plea expected at first hearing and why, which affects venue and case management.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'pocaCommittalSought',
      label: 's.70 POCA committal sought',
      type: 'checkbox',
      required: false,
      section: 'Offence and proposed charges',
      helpText:
        'Tick where committal for confiscation under s.70 Proceeds of Crime Act 2002 is sought.',
      provenance: 'documented',
    },
    {
      id: 'enquiriesCompleted',
      label: 'Reasonable lines of enquiry completed',
      type: 'textarea',
      required: true,
      section: 'The investigation',
      helpText:
        'Every reasonable line of enquiry pursued, so the prosecutor can judge whether the investigation is complete.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'enquiriesNotPursued',
      label: 'Lines of enquiry not being pursued',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Any reasonable line of enquiry NOT pursued, and why. This is a disclosure matter, not an admission.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'outstandingEnquiries',
      label: 'Outstanding lines of enquiry',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Enquiries still outstanding, with expected completion dates.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'materialUnderExamination',
      label: 'Material subject to examination',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Material sent for examination — digital devices, forensics — with the expected turnaround.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'outstandingEvidence',
      label: 'Outstanding evidence',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Evidence expected but not yet obtained, and when it is due.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'delayExplanation',
      label: 'Explanation of any delay',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Any delay in the investigation or referral, and the reason for it.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'linkedSuspects',
      label: 'Linked suspects and investigations',
      type: 'textarea',
      required: false,
      section: 'The investigation',
      helpText:
        'Co-suspects and linked investigations, with their URNs, so decisions can be taken together.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'victimWitnessIssues',
      label: 'Victim and witness issues',
      type: 'textarea',
      required: false,
      section: 'Victims and witnesses',
      helpText:
        'Anything affecting victims or witnesses — willingness to attend, vulnerability, intimidation, support needs.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'specialMeasuresAssessment',
      label: 'Special measures assessment',
      type: 'select',
      required: false,
      section: 'Victims and witnesses',
      helpText:
        'Whether a special measures assessment (MG2) has been completed for any witness.',
      provenance: 'documented',
      options: [
        { value: 'completed', label: 'Completed and attached' },
        { value: 'not_required', label: 'Not required' },
        { value: 'outstanding', label: 'Outstanding' },
      ],
    },
    {
      id: 'vpsStatus',
      label: 'Victim Personal Statement status',
      type: 'select',
      required: false,
      section: 'Victims and witnesses',
      helpText:
        'Whether a VPS has been taken, declined, or is still to be offered.',
      provenance: 'documented',
      options: [
        { value: 'taken', label: 'Taken and attached' },
        { value: 'declined', label: 'Offered and declined' },
        { value: 'outstanding', label: 'Still to be offered' },
      ],
    },
    {
      id: 'otherConsiderations',
      label: 'Other considerations',
      type: 'textarea',
      required: false,
      section: 'Other considerations',
      helpText:
        'Anything else the prosecutor needs — public interest factors, media interest, ancillary orders sought.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'disclosableMaterial',
      label: 'Information about potentially disclosable material',
      type: 'textarea',
      required: false,
      section: 'Disclosure and assurance',
      helpText:
        'Material that may undermine the prosecution or assist the defence, whether or not it is being relied on.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'disclosureAssurance',
      label: 'Disclosure impact assurance given',
      type: 'checkbox',
      required: true,
      section: 'Disclosure and assurance',
      helpText:
        'Tick to confirm the disclosure impact of this referral has been considered and recorded.',
      provenance: 'documented',
    },
    {
      id: 'qualityAssurance',
      label: 'Quality assurance confirmed',
      type: 'checkbox',
      required: true,
      section: 'Disclosure and assurance',
      helpText:
        'Tick to confirm a supervisor has quality assured this referral before submission.',
      provenance: 'documented',
    },
    {
      id: 'officerInCase',
      label: 'Officer in the case',
      type: 'text',
      required: true,
      section: 'Certification and contact',
      helpText:
        'Name, rank and number of the officer in the case.',
      mapsTo: 'officerInCase',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'officerEmail',
      label: 'Officer email address',
      type: 'text',
      required: true,
      section: 'Certification and contact',
      helpText:
        'Email address the prosecutor should reply to.',
      provenance: 'documented',
      validation: { maxLength: 160 },
    },
    {
      id: 'officerTelephone',
      label: 'Officer contact telephone number',
      type: 'text',
      required: false,
      section: 'Certification and contact',
      helpText:
        'Daytime contact number for the officer in the case.',
      provenance: 'documented',
      validation: { format: 'telephone' },
    },
    {
      id: 'supervisingOfficer',
      label: 'Supervising officer (authorising the referral)',
      type: 'text',
      required: true,
      section: 'Certification and contact',
      helpText:
        'Name, rank and number of the supervisor authorising this referral.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'materialProvided',
      label: 'Material provided with the referral',
      type: 'textarea',
      required: false,
      section: 'Certification and contact',
      helpText:
        'Every item submitted with this referral, one per line, so the prosecutor can tell what is missing.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'prosecutorDecision',
      label: 'Prosecutor’s decision',
      type: 'select',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS.',
      provenance: 'documented',
      options: [
        { value: 'charge', label: 'Charge' },
        { value: 'ooc_disposal', label: 'Out-of-court disposal' },
        { value: 'no_prosecution', label: 'No prosecution' },
        { value: 'action_plan', label: 'Action plan / further enquiries' },
      ],
    },
    {
      id: 'chargesAuthorised',
      label: 'Charges authorised',
      type: 'textarea',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the charges authorised, one per line.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'decisionRationale',
      label: 'Rationale for the decision',
      type: 'textarea',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the reasons for the decision, against the Code.',
      provenance: 'documented',
      rows: 5,
    },
    {
      id: 'sharedActionPlan',
      label: 'Shared action plan',
      type: 'textarea',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the agreed actions, with owners.',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'actionPlanReviewDate',
      label: 'Action plan review date',
      type: 'date',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: when the action plan will be reviewed.',
      provenance: 'documented',
    },
    {
      id: 'linesOfEnquirySatisfied',
      label: 'Are you satisfied that all reasonable lines of enquiry have been considered?',
      type: 'select',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS.',
      provenance: 'documented',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      id: 'unusedMaterialProvided',
      label: 'Did the police identify, record and provide all relevant information about unused or unexamined material?',
      type: 'select',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS.',
      provenance: 'documented',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      id: 'prosecutorDisclosureAssurance',
      label: 'Prosecutor’s disclosure assurance',
      type: 'checkbox',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS.',
      provenance: 'documented',
    },
    {
      id: 'prosecutorName',
      label: 'Prosecutor name',
      type: 'text',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the reviewing lawyer’s name.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'prosecutorGrade',
      label: 'Prosecutor grade',
      type: 'text',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the reviewing lawyer’s grade.',
      provenance: 'likely',
      validation: { maxLength: 60 },
    },
    {
      id: 'decisionDate',
      label: 'Date of decision',
      type: 'date',
      required: false,
      section: 'Prosecutor’s decision (CPS use)',
      helpText:
        'Completed by the CPS: the date the decision was made.',
      provenance: 'likely',
      validation: { noFutureDate: true },
    },
  ],
};

/**
 * MG4 — Charge Sheet (UC-03 sourcing work, ticket LER-1034).
 *
 * Field set rebuilt from docs/mg-form-research-findings.md: 36 of the 37
 * researched fields, every one marked `documented` there, read off a genuine
 * blank 2010/11 national template whose printed labels an independent verifier
 * confirmed line by line (it even carries the form's real "Charge acepted" typo,
 * which a fabricated source would not).
 *
 * Deliberate omissions, both recorded in
 * docs/stories/LER-1034-open-questions.md:
 *  - "Defence solicitor" — the one researched field NOT marked documented. The
 *    verifier confirmed it is genuinely not a box on the paper MG4; it is a field
 *    on the CM03 interface message instead.
 *  - The form splits the name into separate "Surname:" and "Forename(s):" boxes.
 *    `defendantName` cannot be renamed or removed (a live draft stores a value
 *    under it), and adding both boxes alongside would capture the same name three
 *    times, so the split is documented in helpText and left as a migration
 *    question.
 *
 * The charge grid on the paper form is a table ("Sequential No. | Charge(s) |
 * CCCJS Offence Code") and FormFieldDefinition has no repeating group, so it is
 * approximated flatly: one charge per line in `chargeWording`, codes in the same
 * order in `cjsOffenceCodes`. Not faked as a table.
 *
 * `verification: 'unverified'` — no practitioner has signed this off. See the
 * open-questions file for what they need to settle.
 */
const MG4: FormTemplate = {
  code: 'MG4',
  name: 'Charge Sheet',
  description:
    'Record of the offence(s) charged, the reply after charge, and any grant of post-charge unconditional bail.',
  // v2 (LER-1034): rebuilt from the sourced field set; 8 fields -> 36.
  // v4 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 4,
  verification: 'verified',
  fields: [
    {
      id: 'defendantName',
      label: 'Name of person charged',
      type: 'text',
      required: true,
      section: 'Person charged',
      helpText:
        'The printed form has separate "Surname" and "Forename(s)" boxes — enter as "SMITH, John Peter", surname in block capitals first.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'defendantAddress',
      label: 'Address',
      type: 'textarea',
      required: true,
      section: 'Person charged',
      helpText:
        'Home address of the person charged, as given at charge, for service of documents. Enter the postcode in the box below.',
      mapsTo: 'defendantAddress',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'postcode',
      label: 'Postcode',
      type: 'text',
      required: true,
      section: 'Person charged',
      helpText: 'Postcode of the address above; the form prints it as its own box.',
      provenance: 'documented',
      validation: { format: 'postcode', maxLength: 10 },
    },
    {
      id: 'dateOfBirth',
      label: 'Date of birth',
      type: 'date',
      required: true,
      section: 'Person charged',
      helpText:
        'Date of birth of the person charged. Drives whether the youth offender box below applies.',
      mapsTo: 'defendantDob',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
    {
      id: 'gender',
      label: 'Gender',
      type: 'select',
      required: false,
      section: 'Person charged',
      helpText: 'The form prints this as a single "M/F" box.',
      provenance: 'documented',
      options: [
        { value: 'M', label: 'M' },
        { value: 'F', label: 'F' },
      ],
    },
    {
      id: 'ethnicityCode',
      label: 'Ethnicity code',
      type: 'text',
      required: false,
      section: 'Person charged',
      helpText:
        'Self-determined ethnicity on the PNC 16-point system, e.g. "W1". Recorded as stated by the person charged, not as observed.',
      provenance: 'documented',
      validation: { maxLength: 10 },
    },
    {
      id: 'contactTelephone',
      label: 'Contact telephone number',
      type: 'text',
      required: false,
      section: 'Person charged',
      helpText: 'A contact number for the person charged, where one is given.',
      provenance: 'documented',
      validation: { format: 'telephone' },
    },
    {
      id: 'custodyNumber',
      label: 'Custody number',
      type: 'text',
      required: true,
      section: 'Case identifiers',
      helpText: 'The custody record number for this detention.',
      provenance: 'documented',
      validation: { format: 'custodyNumber', maxLength: 40 },
    },
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      section: 'Case identifiers',
      helpText:
        'Case URN in the format force code / unit code / sequence / year, e.g. 01AB0123456/24.',
      mapsTo: 'urn',
      provenance: 'documented',
      validation: { format: 'urn', },
    },
    {
      id: 'arrestSummonsNumber',
      label: 'Arrest/Summons Number (A/S No.)',
      type: 'text',
      required: true,
      section: 'Case identifiers',
      helpText:
        'The ASN allocated to this arrest or summons; it ties the charge to the PNC record and is returned to CPS systems.',
      provenance: 'documented',
      validation: { format: 'asn', maxLength: 40 },
    },
    {
      id: 'firstArrestDate',
      label: 'First arrest date',
      type: 'date',
      required: false,
      section: 'Case identifiers',
      helpText: 'Date of the first arrest in this case, which may precede the date of charge.',
      provenance: 'documented',
      validation: { notAfter: { fieldId: 'chargeDate', severity: 'advisory', message: 'The first arrest is usually on or before the charge date — check this is right.' }, noFutureDate: true },
    },
    {
      id: 'prolificOffender',
      label: 'Prolific or other priority offender (PPO)',
      type: 'checkbox',
      required: false,
      section: 'Case identifiers',
      helpText: 'Tick where the person charged is managed as a PPO; the form prints it as a flag.',
      provenance: 'documented',
    },
    {
      id: 'youthOffender',
      label: 'Youth offender (YO)',
      type: 'checkbox',
      required: false,
      section: 'Case identifiers',
      helpText:
        'Tick where the person charged is under 18 at the date of charge. An appropriate adult must then sign below.',
      provenance: 'documented',
    },
    {
      id: 'interpreterLanguage',
      label: 'Interpreter — language / dialect',
      type: 'text',
      required: false,
      section: 'Interpreter',
      helpText:
        'Record the dialect as well as the language where it matters, so the right interpreter can be arranged for court.',
      provenance: 'documented',
      validation: { maxLength: 80 },
    },
    {
      id: 'interpreterName',
      label: 'Name of interpreter',
      type: 'text',
      required: false,
      section: 'Interpreter',
      helpText: 'Name of the interpreter present when the charge was put.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'cautionGiven',
      label: 'The person charged was cautioned in the terms printed on the form',
      type: 'checkbox',
      required: true,
      section: 'Charges',
      helpText:
        'The caution is pre-printed on the MG4 and must be given as printed. Tick to confirm it was given before any reply was recorded.',
      provenance: 'documented',
    },
    {
      id: 'chargeWording',
      label: 'Charge(s)',
      type: 'textarea',
      required: true,
      section: 'Charges',
      // The paper form is a numbered table; approximated flatly, one per line.
      helpText:
        'One charge per line, numbered sequentially, using the precise wording from the Police National Legal Database. Additional charges continue the same numbering.',
      mapsTo: 'charges',
      provenance: 'documented',
      rows: 6,
    },
    {
      id: 'cjsOffenceCodes',
      label: 'CJS offence codes',
      type: 'textarea',
      required: false,
      section: 'Charges',
      helpText:
        'The CCCJS offence code for each charge, one per line in the same order as the charges above.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'specimenOrAdditionalCharges',
      label: 'Specimen or additional charges',
      type: 'checkbox',
      required: false,
      section: 'Charges',
      helpText:
        'Tick where these are specimen or additional charges — the Manual of Guidance requires it to be marked clearly at the top of the form.',
      provenance: 'documented',
    },
    {
      id: 'continuationCharges',
      label: 'Continuation charges attached',
      type: 'checkbox',
      required: false,
      section: 'Charges',
      helpText: 'Tick where charges continue on a further sheet.',
      provenance: 'documented',
    },
    {
      id: 'replyAfterCharge',
      label: 'Reply (if any)',
      type: 'textarea',
      required: false,
      section: 'Charges',
      helpText:
        'Record any reply verbatim and contemporaneously, in the words used. Leave blank if nothing was said.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'signaturePersonCharged',
      label: 'Signed — person charged (typed name)',
      type: 'text',
      required: true,
      section: 'Signatures and officers',
      helpText:
        'Typed name standing in for the signature of the person charged; the PDF carries space for a wet signature.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'signatureAppropriateAdult',
      label: 'Signed — appropriate adult (typed name)',
      type: 'text',
      required: false,
      section: 'Signatures and officers',
      helpText:
        'Required where the person charged is a youth or a vulnerable adult; leave blank otherwise.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'chargingOfficer',
      label: 'Officer charging',
      type: 'text',
      required: true,
      section: 'Signatures and officers',
      helpText:
        'Name, rank and number of the officer who put the charge — normally the custody sergeant.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'officerInCase',
      label: 'Officer in the case',
      type: 'text',
      required: true,
      section: 'Signatures and officers',
      helpText:
        'Name, rank and number of the officer in the case, who may be someone other than the charging officer.',
      mapsTo: 'officerInCase',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'chargeAcceptedBy',
      label: 'Charge accepted by',
      type: 'text',
      required: true,
      section: 'Signatures and officers',
      helpText: 'Name, rank and number of the officer who accepted the charge.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'timeCharged',
      label: 'Time charged',
      type: 'time',
      required: true,
      section: 'Signatures and officers',
      helpText: 'Time the charge was put, from the custody record.',
      provenance: 'documented',
    },
    {
      id: 'chargeDate',
      label: 'Date charged',
      type: 'date',
      required: true,
      section: 'Signatures and officers',
      helpText: 'Date the charge was put.',
      provenance: 'documented',
      validation: { notBefore: { casePath: 'offenceDate', message: 'A charge cannot be dated before the offence recorded on the case file.' }, noFutureDate: true },
    },
    {
      id: 'unconditionalBailGranted',
      label: 'Unconditional bail granted after charge',
      type: 'checkbox',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText:
        'This panel is for post-charge UNCONDITIONAL bail only. For any other type of bail use an MG4A. Tick to complete the boxes below.',
      provenance: 'documented',
    },
    {
      id: 'courtName',
      label: 'Court',
      type: 'text',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText:
        "The magistrates' or youth court the person is bailed to surrender to. Only applies where unconditional bail was granted.",
      mapsTo: 'courtName',
      provenance: 'documented',
    },
    {
      id: 'courtAddress',
      label: 'Court address',
      type: 'textarea',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText: 'Full address of the court, as the form requires it in full.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'hearingDate',
      label: 'First hearing date',
      type: 'date',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText: 'Date the person bailed must surrender to the court.',
      mapsTo: 'nextHearingAt',
      provenance: 'documented',
      validation: { notBefore: { fieldId: 'chargeDate', message: 'A hearing cannot be listed before the charge date.' }, },
    },
    {
      id: 'firstHearingTime',
      label: 'First hearing time',
      type: 'time',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText: 'Time the person bailed must surrender to the court.',
      provenance: 'documented',
    },
    {
      id: 'signaturePersonBailed',
      label: 'Signed — person bailed (typed name)',
      type: 'text',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText: 'Typed name standing in for the signature of the person bailed.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'officerGrantingBail',
      label: 'Officer granting bail',
      type: 'text',
      required: false,
      section: 'Post-charge unconditional bail',
      helpText:
        'Surname, rank and number of the officer granting bail, with the time and date it was granted.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'bailConditions',
      label: 'Bail conditions',
      type: 'textarea',
      required: false,
      section: 'Post-charge unconditional bail',
      // Kept because a live draft stores a value under this id; the real MG4
      // covers unconditional bail only.
      helpText:
        'The MG4 records unconditional bail only — conditions belong on an MG4A. Retained for drafts started before this form was rebuilt.',
      provenance: 'likely',
      rows: 3,
    },
  ],
};

const MG5: FormTemplate = {
  code: 'MG5',
  name: 'Police Report / Case Summary',
  description:
    'The case summary relied on at first hearing — circumstances, evidence and interview account.',
  templateVersion: 4,
  fields: [
    {
      id: 'urn',
      label: 'URN',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText: 'The Unique Reference Number for the case, e.g. 01AB0123456/24.',
      placeholder: 'e.g. 01AB0123456/24',
      mapsTo: 'urn',
      validation: { format: 'urn', maxLength: 20 },
    },
    {
      id: 'defendantName',
      label: 'Defendant full name',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText: 'Full name of the defendant this summary relates to.',
      mapsTo: 'defendantName',
      validation: { maxLength: 120 },
    },
    {
      id: 'chargesList',
      label: 'Charges',
      type: 'textarea',
      required: true,
      section: 'Case details',
      helpText: 'Each charge and its statutory provision, one per line, matching the MG4.',
      mapsTo: 'charges',
      rows: 3,
    },
    {
      id: 'offenceDate',
      label: 'Date of offence',
      type: 'date',
      required: false,
      section: 'Case details',
      helpText:
        'The date the offence was committed. Where charges span several dates, state the range in the summary of circumstances instead.',
      mapsTo: 'offenceDate',
      validation: { noFutureDate: true },
    },
    {
      id: 'summaryOfCircumstances',
      label: 'Summary of the circumstances',
      type: 'textarea',
      required: true,
      section: 'Summary of evidence',
      helpText:
        'A fair, balanced account of the alleged offence: what happened, when, where and how the defendant is said to be involved. Avoid opinion; state what the evidence shows.',
      rows: 10,
      // UC-06: prose, so it gets the highlight layer and the assistant panel.
      narrative: true,
    },
    {
      id: 'keyEvidence',
      label: 'Key evidence',
      type: 'textarea',
      required: true,
      section: 'Summary of evidence',
      helpText:
        'The main items of evidence (witnesses, CCTV, forensic, exhibits) supporting each charge, and which witness or exhibit each point comes from.',
      rows: 6,
      narrative: true,
    },
    {
      id: 'defendantInterview',
      label: "Account given in interview",
      type: 'textarea',
      required: true,
      section: 'Summary of evidence',
      helpText:
        'A summary of the account (or no-comment position) the defendant gave in interview. This must fairly reflect any explanation or denial offered.',
      rows: 5,
      narrative: true,
    },
    {
      id: 'injuriesLoss',
      label: 'Injuries / loss / damage',
      type: 'textarea',
      required: false,
      section: 'Impact',
      helpText: 'Any injury to persons or loss/damage to property resulting from the offence.',
      rows: 3,
      narrative: true,
    },
    {
      id: 'victimPersonalStatement',
      label: 'Victim personal statement taken?',
      type: 'select',
      required: true,
      section: 'Impact',
      helpText:
        'Whether a Victim Personal Statement has been taken, offered and declined, or is to follow.',
      options: [
        { value: 'taken', label: 'Taken — attached' },
        { value: 'declined', label: 'Offered and declined' },
        { value: 'to_follow', label: 'To follow' },
        { value: 'na', label: 'Not applicable' },
      ],
    },
    {
      id: 'compensationClaimed',
      label: 'Compensation claimed (£)',
      type: 'number',
      required: false,
      section: 'Impact',
      helpText: 'Amount of compensation sought, in pounds, if quantified.',
      validation: { min: 0 },
    },
    {
      id: 'previousConvictionsAttached',
      label: 'Previous convictions attached',
      type: 'checkbox',
      required: false,
      section: 'Antecedents',
      helpText: "Tick if the defendant's previous convictions (PNC printout) are attached to the file.",
    },
    {
      id: 'officerCompleting',
      label: 'Officer completing report',
      type: 'text',
      required: true,
      section: 'Completion',
      helpText: 'Name, rank and collar number of the officer completing this summary.',
      mapsTo: 'officerInCase',
    },
    {
      id: 'dateCompleted',
      label: 'Date completed',
      type: 'date',
      required: true,
      section: 'Completion',
      helpText: 'Date this case summary was completed.',
      validation: { noFutureDate: true },
    },
  ],
};

/**
 * MG6 — UC-04 unused material schedule (ticket LER-1080).
 *
 * The seven original fields keep their ids: live drafts store values under them,
 * and renaming an id strands the value on the next autosave. They are marked
 * `provenance: 'likely'` because they are placeholder fields that have NOT been
 * checked against a specimen — MG6's field-set rebuild from the sourced research
 * (41/41 documented) is separate work, deliberately out of UC-04's scope.
 *
 * NOTE on the designation: official sources call MG6 "Case File Evidence and
 * Information", with unused material on the separate MG6C/MG6D/MG6E schedules
 * (docs/answers/LER-1205-designation-mismatches.md). That decision belongs to a
 * decision-maker and does NOT block this build: the schedule is declared as a
 * `group` field, and no behaviour anywhere keys off the form code, so the
 * mechanics follow the field definition if the form is renamed or split.
 */
const MG6: FormTemplate = {
  code: 'MG6',
  name: 'Case File Evidence and Information',
  description:
    'The police-to-CPS case file information form: outstanding evidence and target dates, disclosure, witness issues, the charging rationale, and the unused material schedule this repo carries on it.',
  // v2 (LER-1080): declares the unused material schedule.
  // v4: field set rebuilt from the sourced research — the 41 printed boxes, each
  // citing on the field itself the box it came from. Strictly additive: every
  // pre-existing id is untouched, including the UC-04 schedule.
  // v5 (UC-07): adds the MG6D sensitive material schedule as a declared
  // sensitive section. Strictly additive again; every pre-existing id untouched.
  // v6 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 6,
  verification: 'verified',
  fields: [
    {
      id: 'urn',
      label: 'URN',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText:
        'The Unique Reference Number for the case, as it appears in the MG6 header alongside the defendant.',
      mapsTo: 'urn',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: URN header box on page 1; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { format: 'urn', maxLength: 40 },
    },
    {
      id: 'defendantName',
      label: 'Defendant full name',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText:
        'The defendant named in the header. The printed form shows this as the "R v" box, so give the full name.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: \'R v\' header box on page 1 (the label here is a light paraphrase of the print); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { maxLength: 120 },
    },
    {
      id: 'disclosureOfficer',
      label: 'Disclosure officer',
      type: 'text',
      required: true,
      section: 'Report',
      helpText:
        'Name, rank and number of the disclosure officer responsible for this schedule and for the continuing duty to review it.',
      provenance: 'likely',
      validation: { maxLength: 120 },
    },
    {
      id: 'scheduleReference',
      label: 'Schedule reference',
      type: 'text',
      required: true,
      section: 'Report',
      helpText: 'Reference for this schedule, so it can be cited from the case file and by the prosecutor.',
      provenance: 'likely',
      validation: { maxLength: 60 },
    },
    {
      id: 'caseComplexity',
      label: 'Case complexity',
      type: 'select',
      required: false,
      section: 'Report',
      // Manual rather than derived from the Case record: MG6 can be started
      // standalone, and the Case model has no complexity column. See PRD §6 for
      // the decision and its migration path (a caseComplexity CaseFieldPath once
      // the case-management integration lands, with this becoming the override).
      helpText:
        'How complex the case is. Used only to judge whether the schedule below looks implausibly sparse — it never blocks anything.',
      provenance: 'inference',
      options: [
        { value: 'complex', label: 'Complex' },
        { value: 'standard', label: 'Standard' },
        { value: 'summary_only', label: 'Summary only' },
      ],
    },
    {
      // The schedule itself. Columns are scalar field definitions; the row's
      // displayed number is its position, computed at render and never stored.
      id: 'unusedMaterialItems',
      label: 'Unused material schedule',
      type: 'group',
      required: true,
      section: 'Unused material schedule',
      helpText:
        'Every item of unused material, one row each. Numbering is automatic and stays continuous — deleting a row renumbers the rest after you confirm.',
      provenance: 'documented',
      // Marking a row Sensitive raises hasSensitiveMaterial on the draft. Wired
      // here rather than in code so another schedule can do the same.
      sensitivityFlag: { columnId: 'classification', whenValue: 'sensitive' },
      complexityFieldId: 'caseComplexity',
      columns: [
        {
          id: 'itemReference',
          label: 'Item reference',
          type: 'text',
          required: true,
          helpText: 'Your reference for this item. Each must be unique — two items cannot share one.',
          provenance: 'documented',
          validation: { maxLength: 60, uniqueInGroup: true },
        },
        {
          id: 'description',
          label: 'Description',
          type: 'text',
          required: true,
          helpText: 'What the item is, in enough detail for the prosecutor to judge its relevance.',
          provenance: 'documented',
          validation: { maxLength: 300 },
        },
        {
          id: 'materialType',
          label: 'Material type',
          type: 'select',
          required: true,
          helpText: 'The kind of material, so it can be handled and stored appropriately.',
          provenance: 'documented',
          options: [
            { value: 'document', label: 'Document' },
            { value: 'cctv', label: 'CCTV' },
            { value: 'forensic', label: 'Forensic' },
            { value: 'digital', label: 'Digital device / data' },
            { value: 'physical', label: 'Physical exhibit' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          id: 'classification',
          label: 'Classification',
          type: 'select',
          required: true,
          // Choosing Sensitive raises a draft-level flag automatically; UC-07
          // owns what then happens to the item. Marked, not protected.
          helpText:
            'Sensitive or non-sensitive. Marking an item sensitive flags this form for sensitive-material handling automatically.',
          provenance: 'documented',
          options: [
            { value: 'non_sensitive', label: 'Non-Sensitive' },
            { value: 'sensitive', label: 'Sensitive' },
          ],
        },
      ],
    },
    {
      // UC-07: the MG6D schedule — the sensitive counterpart of the schedule
      // above. `sensitive: true` is what activates the whole handling regime
      // (red banner, confirmation gate, redaction, export exclusion, audit);
      // none of it keys off the form code, so the disputed designation
      // (LER-1205) can be resolved either way without behaviour change.
      // Not statically required: it is mandatory only while sensitive material
      // exists, which sensitiveScheduleFindings() reports as an error-severity
      // consistency finding (uc-07 open-questions D3).
      id: 'sensitiveScheduleItems',
      label: 'Sensitive material schedule',
      type: 'group',
      required: false,
      sensitive: true,
      section: 'MG6D — Sensitive material schedule',
      helpText:
        'Only relevant, sensitive unused material, one item per row, in detail. Say where each item is held and why it is considered sensitive. This schedule is never disclosed to the defence and is excluded from the non-sensitive export.',
      provenance: 'documented',
      source:
        "Manual of Guidance reference MG06D, 'Schedule of Relevant Sensitive Unused Material' — Home Office, 'Criminal casefiles: forms, standards, and file structure' (published 9 June 2026), forms table: list only relevant, sensitive unused material, in detail; provide its location; provide the reason it is considered to be sensitive.",
      rowNoun: 'sensitive item',
      columns: [
        {
          id: 'description',
          label: 'Description of material (in detail)',
          type: 'textarea',
          required: true,
          rows: 2,
          helpText:
            'What the item is, in enough detail for the prosecutor to judge whether they agree it is sensitive.',
          provenance: 'documented',
          source:
            "Manual of Guidance reference MG06D — 'list only relevant, sensitive unused material, in detail'. Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
          validation: { maxLength: 600 },
        },
        {
          id: 'location',
          label: 'Location',
          type: 'text',
          required: true,
          helpText: 'Where the material is held, so it can be produced if the court requires it.',
          provenance: 'documented',
          source:
            "Manual of Guidance reference MG06D — 'provide its location'. Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
          validation: { maxLength: 200 },
        },
        {
          id: 'sensitivityReason',
          label: 'Reason the material is considered sensitive',
          type: 'textarea',
          required: true,
          rows: 2,
          helpText:
            'Why this material is sensitive — the basis on which the prosecutor will decide whether to agree, and whether a public interest immunity application is needed.',
          provenance: 'documented',
          source:
            "Manual of Guidance reference MG06D — 'provide the reason it is considered to be sensitive'. Home Office, 'Criminal casefiles: forms, standards, and file structure' (9 June 2026), forms table.",
          validation: { maxLength: 600 },
        },
      ],
    },
    {
      id: 'unusedSummary',
      label: 'Summary of unused material',
      type: 'textarea',
      required: true,
      section: 'Assessment',
      helpText: 'Overview of the unused material as a whole, beyond the item-by-item schedule above.',
      provenance: 'likely',
      rows: 4,
    },
    {
      id: 'underminesCase',
      label: 'Does any unused material undermine the case or assist the defence?',
      type: 'select',
      required: true,
      section: 'Assessment',
      helpText:
        'The disclosure test. Answering yes requires the detail below — this is the judgement the schedule exists to support.',
      // Stays 'likely': the box is printed as a question with a blank answer space,
      // so a Yes/No control is this project's inference — the same call made for the
      // other question boxes added in v4.
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 4 \'Is there any relevant material that may undermine the prosecution case or assist the defence case?\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md \u00a7 MG6. The Yes/No typing is this project\u2019s inference \u2014 see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'underminesDetail',
      label: 'If yes, give details',
      type: 'textarea',
      required: false,
      section: 'Assessment',
      helpText: 'Which items, and how each undermines the prosecution case or assists the defence.',
      // Upgraded from 'likely' by the v4 rebuild: this IS the printed section 4
      // free-text box, so it now carries the citation for it. The id is unchanged.
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 4 details of material that may undermine the prosecution or assist the defence, corroborated additionally by National Disclosure Standards 2018 para 2.2.1; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md \u00a7 MG6.',
      rows: 4,
      validation: { requiredWhen: { fieldId: 'underminesCase', equals: 'yes' }, },
    },
    {
      id: 'sensitiveMaterial',
      label: 'Sensitive material exists in this case',
      type: 'checkbox',
      required: false,
      section: 'Assessment',
      // Retained (a draft may hold a value) but now largely superseded: the
      // schedule's per-row classification is authoritative and drives the
      // derived hasSensitiveMaterial flag.
      helpText:
        'Retained from earlier drafts. The schedule\u2019s per-item classification above is what drives sensitive-material handling.',
      provenance: 'likely',
    },
    {
      id: 'medicalEvidence',
      label: 'Medical evidence — injuries and evidence required',
      type: 'textarea',
      required: false,
      section: '1. Medical evidence',
      helpText:
        'What injuries are alleged and what medical evidence is needed. The 2001 ACPO/CPS/BMA Accident and Emergency protocol governs how it is obtained.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 1 "Medical evidence"; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'medicalTargetDate',
      label: 'Target date for obtaining medical evidence',
      type: 'date',
      required: false,
      section: '1. Medical evidence',
      helpText:
        'When the medical evidence is expected. A target date, so it may legitimately be in the future.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 1 target-date box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
    },
    {
      id: 'forensicEvidence',
      label: 'Forensic evidence',
      type: 'textarea',
      required: false,
      section: '2. Forensic evidence',
      helpText:
        'What has been submitted for forensic examination and what is expected from it.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 2 "Forensic evidence"; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'forensicTargetDate',
      label: 'Target date for forensic results',
      type: 'date',
      required: false,
      section: '2. Forensic evidence',
      helpText:
        'The delivery date for the forensic results, taken from section 12 of the MG21 where one exists.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 2 target-date box (Manual of Guidance note 6 keys it to MG21 section 12); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
    },
    {
      id: 'visualMaterialViewed',
      label: 'Has all visually recorded material in police possession been viewed and copied?',
      type: 'select',
      required: false,
      section: '3. Visually recorded material',
      helpText:
        'Whether every CCTV, photograph or other visual item held has been viewed and copied. Multiplex systems can delay copying.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 3 "Visually recorded evidence (CCTV / Photographs etc.)"; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'visualMaterialTargetDate',
      label: 'Target date for viewing / copying visual material',
      type: 'date',
      required: false,
      section: '3. Visually recorded material',
      helpText:
        'When outstanding visual material will have been viewed and copied.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 3 target-date box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
    },
    {
      id: 'additionalVisualMaterial',
      label: 'Additional visual material to be obtained',
      type: 'textarea',
      required: false,
      section: '3. Visually recorded material',
      helpText:
        'Visual material not yet in police possession — where it is, who holds it, and what is being done to obtain it.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 3 free-text box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500 },
    },
    {
      id: 'thirdPartyMaterial',
      label: 'Is there any relevant third party material?',
      type: 'select',
      required: false,
      section: '4. Disclosure',
      helpText:
        'Whether material relevant to the case is held by a third party such as a local authority, school or hospital.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 4 third-party-material question; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'thirdPartyMaterialDetail',
      label: 'Third party material — what it is and who holds it',
      type: 'textarea',
      required: false,
      section: '4. Disclosure',
      helpText:
        'What the third party material is, who holds it, and what steps have been taken to obtain or inspect it.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 4 third-party-material free-text box (the print carries a footnote on third-party material); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500, requiredWhen: { fieldId: 'thirdPartyMaterial', equals: 'yes' } },
    },
    {
      id: 'outstandingStatements',
      label: 'Are there any outstanding witness statements to be obtained?',
      type: 'select',
      required: false,
      section: '5. Victim(s) / witness(es)',
      helpText:
        'Whether any witness statement is still to be taken.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 5 outstanding-statements question; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'outstandingStatementsTargetDate',
      label: 'Target date for outstanding statements',
      type: 'date',
      required: false,
      section: '5. Victim(s) / witness(es)',
      helpText:
        'When the outstanding statements are expected to have been obtained.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 5 target-date box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
    },
    {
      id: 'vulnerableWitnesses',
      label: 'Anticipated not-guilty plea: are there vulnerable or intimidated witnesses?',
      type: 'select',
      required: false,
      section: '5. Victim(s) / witness(es)',
      helpText:
        'Whether any witness is vulnerable or intimidated. Child witnesses and victims automatically qualify for special measures.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: sections 5b/5c (Manual of Guidance note 8: child witnesses/victims automatically qualify); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'specialMeasuresMeeting',
      label: 'Will a Special Measures meeting be required?',
      type: 'select',
      required: false,
      section: '5. Victim(s) / witness(es)',
      helpText:
        'Whether a special measures meeting is needed. The assessment itself belongs on the MG2, which this form cross-references.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: sections 5b/5c special-measures question, which cross-references "form MG2 Witness Assessment for Special Measures"; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'witnessesRefusedStatement',
      label: 'Witnesses who have refused to give a statement',
      type: 'textarea',
      required: false,
      section: '5. Victim(s) / witness(es)',
      helpText:
        'Who has refused to give a statement, and anything known about why. Consider whether a witness summons should be sought.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 5d (Manual of Guidance note 9); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500 },
    },
    {
      id: 'othersToArrest',
      label: 'Others yet to be arrested and interviewed',
      type: 'textarea',
      required: false,
      section: '6. Other offenders',
      helpText:
        'Anyone else suspected of involvement who has not yet been arrested and interviewed.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 6a; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1000 },
    },
    {
      id: 'othersToCharge',
      label: 'Others yet to be charged',
      type: 'textarea',
      required: false,
      section: '6. Other offenders',
      helpText:
        'Anyone arrested and interviewed but not yet charged, and what the intention is.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 6b; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1000 },
    },
    {
      id: 'othersOutOfCourtDisposal',
      label: 'Others dealt with by another out of court disposal',
      type: 'textarea',
      required: false,
      section: '6. Other offenders',
      helpText:
        'Anyone dealt with by caution, community resolution or another out of court disposal, and which one.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 6c; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1000 },
    },
    {
      id: 'othersCharged',
      label: 'Others charged',
      type: 'textarea',
      required: false,
      section: '6. Other offenders',
      helpText:
        'Anyone else already charged in connection with this matter, and with what.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 6d; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1000 },
    },
    {
      id: 'publicInterestMatters',
      label: 'Are there any matters of local or public interest?',
      type: 'select',
      required: false,
      section: '7. Local / public interest',
      helpText:
        'Whether the case carries local or public interest. Particular regard is given to racist motivation where there are grounds to fear racial intimidation.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 7 (Manual of Guidance note 11); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'publicInterestDetail',
      label: 'Local / public interest details',
      type: 'textarea',
      required: false,
      section: '7. Local / public interest',
      helpText:
        'What the local or public interest is, so the prosecutor can weigh it in the public-interest stage.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 7 free-text box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500 },
    },
    {
      id: 'pocaConsidered',
      label: 'Is POCA or other asset recovery being considered?',
      type: 'select',
      required: false,
      section: '8. Proceeds of crime / asset recovery',
      helpText:
        'Whether proceeds-of-crime or other asset-recovery action is being considered in this case.',
      provenance: 'likely',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 8; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6. The box is printed as a question with a blank answer space, so typing it as Yes/No is this project\'s inference — see docs/usecases/uc-04/open-questions.md.',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
    },
    {
      id: 'pocaDetail',
      label: 'POCA details and timetable',
      type: 'textarea',
      required: false,
      section: '8. Proceeds of crime / asset recovery',
      helpText:
        'What asset-recovery action is proposed and when, so the prosecutor can plan around it.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 8 free-text box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500 },
    },
    {
      id: 'fiuContactNumber',
      label: 'Financial Investigation Unit contact number',
      type: 'text',
      required: false,
      section: '8. Proceeds of crime / asset recovery',
      helpText:
        'Contact number for the Financial Investigation Unit dealing with the case, so the prosecutor can reach them directly.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 8 box \'Contact number for Financial Investigation Unit dealing:\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { format: 'telephone' },
    },
    {
      id: 'additionalInformation',
      label: 'Additional information',
      type: 'textarea',
      required: false,
      section: '9. Additional information',
      helpText:
        'Anything else the prosecutor should know, including accomplice witnesses. The form may be used to express opinions.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: section 9 (Manual of Guidance notes 4 and 9); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'dateCompleted',
      label: 'Date completed',
      type: 'date',
      required: true,
      section: 'Completion',
      helpText: 'Date this schedule was completed. The duty to review unused material continues after it.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: \'Date MG6 completed:\' following section 9; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md \u00a7 MG6.',
      validation: { noFutureDate: true },
    },
    {
      id: 'evidentialTestApplied',
      label: 'Evidential test applied',
      type: 'select',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'Which test was applied to the charging decision: the Full Code Test or the Threshold Test.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: the two \'Full code Test\' / \'Threshold Test\' checkboxes on the rationale page (real FORMCHECKBOXes in the .docx specimen); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      options: [
        { value: 'full_code', label: 'Full Code Test' },
        { value: 'threshold', label: 'Threshold Test' },
      ],
    },
    {
      id: 'rationaleCharges',
      label: 'Charge(s)',
      type: 'textarea',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'The charges the decision covers. The .docx adaptation of this form labels the same box "Allegation(s)".',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page box \'Charge(s)\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 3,
      validation: { maxLength: 1500 },
    },
    {
      id: 'rationaleEvidentialCriteria',
      label: 'Evidential criteria',
      type: 'textarea',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'How the evidence meets the test applied — the evidential half of the charging rationale.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page box \'Evidential criteria\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'rationalePublicInterest',
      label: 'Public interest',
      type: 'textarea',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'Why a prosecution is in the public interest — the second half of the charging rationale.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page box \'Public interest\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'rationaleUnusedMaterial',
      label: 'Unused material (rationale)',
      type: 'textarea',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'Which documentation should be retained and scheduled, and anything that should be disclosed to help the defence prepare early.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page box \'Unused material (comment on the documentation that should be retained and included on the MG6 schedules; specify any information which should be disclosed to assist the defence in the early preparation of their case)\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'rationaleWitnessIssues',
      label: 'Witness / victim issues',
      type: 'textarea',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'Whether a victim personal statement was made, and whether a witness summons or a special measures application may be needed.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page box \'Witness/Victim issues (Victim personal statement made?; state whether a witness summons should be sought if witness retracts statement or if a Special Measures application is required)\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'chargingDecisionMaker',
      label: 'Charging decision maker',
      type: 'text',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'Who made the charging decision — name, rank and number, as recorded on the rationale page.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page decision-maker box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { maxLength: 120 },
    },
    {
      id: 'chargingDecisionDate',
      label: 'Date of charging decision',
      type: 'date',
      required: false,
      section: 'Rationale for police charging decision',
      helpText:
        'The date the charging decision was made. It cannot be in the future.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: rationale page date box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { noFutureDate: true },
    },
    {
      id: 'remandDefendantName',
      label: 'Defendant full name (remand page)',
      type: 'text',
      required: false,
      section: 'Remand in custody — witness intimidation',
      helpText:
        'The defendant named on the remand page. Page 3 is completed separately for each defendant remanded in custody.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: page 3 \'IF SEEKING A REMAND IN CUSTODY...\' defendant box (Manual of Guidance note 2: a separate Prison Service copy per remanded defendant); corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { maxLength: 120 },
    },
    {
      id: 'remandDefendantDob',
      label: 'Defendant date of birth (remand page)',
      type: 'date',
      required: false,
      section: 'Remand in custody — witness intimidation',
      helpText:
        'The defendant\u2019s date of birth. The printed box adds "(If under 18 years old, show age)".',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: page 3 date-of-birth box, printed \'(If under 18 years old, show age)\'; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { noFutureDate: true },
    },
    {
      id: 'remandNoContactWitnesses',
      label: 'Victim(s) / witness(es) the prisoner must not contact',
      type: 'textarea',
      required: false,
      section: 'Remand in custody — witness intimidation',
      helpText:
        'Who the prisoner must not contact, so the Prison Service can act on it. This page is the one section the printed form marks MUST be completed.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: page 3 list of victims/witnesses, with the printed MUST / DO NOT instructions and numbered list 1-6; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      rows: 4,
      validation: { maxLength: 2000 },
    },
    {
      id: 'remandDate',
      label: 'Date (remand page)',
      type: 'date',
      required: false,
      section: 'Remand in custody — witness intimidation',
      helpText:
        'The date page 3 was completed, which may differ from the date the MG6 itself was completed.',
      provenance: 'documented',
      source:
        'MG6 \'CASE FILE EVIDENCE and INFORMATION\' (Manual of Guidance 2010/11), printed box: page 3 date box; corroborated by two independent specimens, bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx. See docs/mg-form-research-findings.md § MG6.',
      validation: { noFutureDate: true },
    },
  ],
};

const MG11: FormTemplate = {
  code: 'MG11',
  name: 'Witness Statement',
  description:
    'Statement of a witness under s.9 CJA 1967 / s.5B MCA 1980, with declaration.',
  // v2 (UC-03): added `title` and `specialMeasuresApplied` for the wizard.
  // v5 (UC-08): `exhibitsReferenced` declares the exhibit-reference crossRef
  // (cites). Annotation only — no field added, renamed or removed.
  // v6: per-field sourcing against the genuine 2013 specimen
  // (bbpolice.uk/uploads/MG11.pdf) — metadata only, no field added, renamed or
  // removed. 12 fields documented with citations; `title` and
  // `exhibitsReferenced` are inference (no printed box exists for either);
  // `specialMeasuresApplied` is likely (practice-derived). Setting
  // `verification` moves MG11 into conformance's sourcing tier on purpose.
  // v7 (D-B, provisional): the declaration constant adopted the two-specimen
  // wording (page-count parenthetical + "stated in it anything" + comma) and
  // the LER-1071-73 page-count interpolation activated with it. No field
  // added, renamed or removed — the declaration is never a field value.
  // v8 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 8,
  verification: 'verified',
  fields: [
    {
      id: 'title',
      label: 'Title',
      type: 'text',
      required: false,
      section: 'Witness details',
      helpText: 'How the witness is addressed, e.g. "Mr", "Ms", "Dr". Optional.',
      placeholder: 'Mr / Mrs / Ms / Dr',
      // The 2013 specimen has no Title box — "Statement of:" is one line. This
      // field is our data-entry convenience, so it must not claim a source.
      provenance: 'inference',
      validation: { maxLength: 20 },
    },
    {
      id: 'witnessName',
      label: 'Full name of witness',
      type: 'text',
      required: true,
      section: 'Witness details',
      helpText:
        'The witness’s full name as it should appear on the statement. Use block capitals for the surname, e.g. "Jane SMITH".',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed boxes: \'Statement of:\' on page 1 and \'Name of witness:\' on page 2; specimen bbpolice.uk/uploads/MG11.pdf (genuine 2013 form). See docs/mg-form-research-findings.md § MG11.',
      validation: { maxLength: 120 },
    },
    {
      id: 'witnessDob',
      label: 'Date of birth',
      type: 'date',
      required: true,
      section: 'Witness details',
      helpText:
        'Date of birth of the witness. If the witness is under 18, their age determines special measures eligibility.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed box: \'Date and place of birth:\' on page 2 (this field captures the date half only; the place half and page 1\'s \'Age if under 18\' box are not modelled); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { noFutureDate: true },
    },
    {
      id: 'witnessOccupation',
      label: 'Occupation',
      type: 'text',
      required: false,
      section: 'Witness details',
      helpText: 'The witness’s occupation, e.g. "Shop manager" or "Police constable".',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed box: \'Occupation:\' on page 1; specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { maxLength: 80 },
    },
    {
      id: 'witnessAddress',
      label: 'Address',
      type: 'textarea',
      required: true,
      section: 'Witness details',
      helpText:
        'Home or professional address. For police officers, the station address is used. This section is withheld from the defence copy.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed boxes: \'Home Address:\' and \'Postcode:\' on page 2, in the \'Witness contact details\' block (this single field flattens the two printed boxes); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      rows: 3,
    },
    {
      id: 'witnessPhone',
      label: 'Contact telephone number',
      type: 'text',
      required: false,
      section: 'Witness details',
      helpText: 'A daytime contact number for the witness. Withheld from the defence copy.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed boxes: \'Mobile:\', \'Home Telephone Number:\' and \'Work Telephone Number:\' on page 2 (this single field flattens three printed boxes); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { format: 'telephone' },
    },
    {
      id: 'statementDate',
      label: 'Date statement taken',
      type: 'date',
      required: true,
      section: 'Statement',
      helpText: 'The date on which this statement was made and signed.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed boxes: \'Date:\' beneath the witness signature on page 1 and \'Time and place statement taken:\' on page 2 (this field captures the date only; time-and-place is not modelled); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { notBefore: { fieldId: 'witnessDob', message: 'A statement cannot be dated before the witness was born.' }, notAfter: { casePath: 'nextHearingAt', severity: 'advisory', message: 'This statement is dated after the listed hearing — normal for a further statement, worth confirming.' }, noFutureDate: true },
    },
    {
      id: 'statementText',
      label: 'Statement',
      type: 'textarea',
      required: true,
      section: 'Statement',
      helpText:
        'The witness’s account in their own words, first person, past tense. Set out events chronologically; identify times, places and people precisely; record verbatim any significant words spoken.',
      rows: 14,
      // UC-06: the narrative this whole feature exists for. `witnessAddress` and
      // `exhibitsReferenced` are textareas on this same form and deliberately
      // are NOT narratives.
      narrative: true,
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), the ruled statement area on page 1 between the printed declaration and the signature boxes (printed but unlabelled); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { minLength: 30 },
    },
    {
      id: 'exhibitsReferenced',
      label: 'Exhibits referred to',
      // UC-08: cites the exhibit-reference vocabulary MG12's list defines, so
      // the review's Check 3 can flag a cited exhibit no list carries.
      crossRef: { vocabulary: 'exhibitReference', role: 'cites' },
      type: 'textarea',
      required: false,
      section: 'Statement',
      helpText:
        'List any exhibits produced by the witness, one per line, using their initials and a sequence number, e.g. "JS/1 — CCTV disc".',
      // The 2013 specimen has NO exhibits box: exhibits are cited inside the
      // narrative by convention. This field is our structured convenience for
      // that convention (and what UC-08's crossRef reads), so it must not
      // claim a printed source.
      provenance: 'inference',
      rows: 3,
    },
    {
      id: 'declarationConfirmed',
      // The wording itself is MG11_DECLARATION, rendered read-only above this
      // checkbox — it is never a field value, so the label only confirms it.
      label: 'The witness has read the declaration above and confirms it',
      type: 'checkbox',
      required: true,
      section: 'Declaration',
      helpText:
        'The statutory declaration under s.89 CJA 1967. The witness must read and confirm it before signing; a statement without it is inadmissible under s.9.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), the printed declaration block and \'Signature: (witness)\' box on page 1 (the checkbox is this product\'s digital surrogate for signing beneath the printed declaration; the wording itself is MG11_DECLARATION, and its match to the specimen is a recorded open question — see docs/answers/template-sourcing-evidence-2026-08.md §3); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
    },
    {
      id: 'signatureName',
      label: 'Signature (typed name)',
      type: 'text',
      required: true,
      section: 'Declaration',
      helpText: 'Typed name standing in for the witness signature in this draft.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed boxes: \'Signature: (witness)\' on page 1 and \'Signature of witness:\' / \'PRINT NAME:\' on page 2 (a typed name stands in for the wet signature in this draft product); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { maxLength: 120 },
    },
    {
      id: 'statementTakenBy',
      label: 'Statement taken by',
      type: 'text',
      required: true,
      section: 'Declaration',
      helpText: 'Name and role of the person who took the statement.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed box: \'Statement taken by:\' on page 2 (the adjacent \'Station:\' box is not modelled); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      validation: { maxLength: 120 },
    },
    {
      id: 'witnessConsentsCourt',
      label: 'Witness is willing to attend court',
      type: 'checkbox',
      required: false,
      section: 'Witness care',
      helpText:
        'Tick if the witness has confirmed they are willing to attend court to give evidence.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed box: Witness care a) \'Is the witness willing to attend court?\' on page 2 (the printed rider \'If \'No\', include reason(s) on form MG6.\' is not modelled); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
    },
    {
      id: 'specialMeasures',
      label: 'Special measures consideration',
      type: 'select',
      required: false,
      section: 'Witness care',
      helpText:
        'Whether the witness may be eligible for special measures (YJCEA 1999), e.g. as a young, vulnerable or intimidated witness.',
      provenance: 'documented',
      source:
        'MG11 \'WITNESS STATEMENT\' (2013), printed box: Witness care c) \'Does the witness require a Special Measures Assessment as a vulnerable or intimidated witness?\' on page 2 (the select\'s s.16/s.17 option labels are statute-derived structure over the printed question, which itself cites youth, disability and fear); specimen bbpolice.uk/uploads/MG11.pdf. See docs/mg-form-research-findings.md § MG11.',
      options: [
        { value: 'none', label: 'None identified' },
        { value: 'vulnerable', label: 'Vulnerable witness (s.16)' },
        { value: 'intimidated', label: 'Intimidated witness (s.17)' },
        { value: 'assessment', label: 'Assessment required' },
      ],
    },
    {
      // Revealed by the wizard only when the witness is treated as vulnerable
      // (under 18 at the statement date, or a special-measures category chosen).
      id: 'specialMeasuresApplied',
      label: 'Special measures applied',
      type: 'textarea',
      required: false,
      section: 'Witness care',
      helpText:
        'Record the measures actually applied or requested, e.g. screens, live link, intermediary, pre-recorded cross-examination (YJCEA 1999 ss.23–30).',
      // The 2013 specimen asks about the assessment NEED (Witness care c —
      // submit MG2), never about measures applied; recording what was applied
      // is practice-derived, so this stays a claim about practice, not print.
      provenance: 'likely',
      rows: 3,
    },
  ],
};

/**
 * MG12 — Exhibit List (UC-03 sourcing work, ticket LER-1035).
 *
 * Field set reconciled with docs/mg-form-research-findings.md: 9 researched
 * fields, all `documented`, verdict usable-as-draft with two independent
 * specimens agreeing exactly.
 *
 * The field count grows only 5 -> 7, and that is the honest outcome rather than a
 * shortfall. Of the nine researched fields, SIX are columns of a repeating table:
 * the printed form carries twelve rows, each with police property reference,
 * brief description, exhibit reference number, person producing, current
 * location, and an "attached" tick. FormFieldDefinition has no repeating group,
 * so those six are approximated flatly inside `exhibitEntries` — one exhibit per
 * line, columns named in its help text — rather than faked as a table or split
 * into twelve numbered copies of five fields. A repeating-group field type is the
 * proper fix and is tracked separately.
 *
 * `verification: 'unverified'` — no practitioner has signed this off. See
 * docs/stories/LER-1035-open-questions.md.
 */
const MG12: FormTemplate = {
  code: 'MG12',
  name: 'Exhibit List',
  description: 'Schedule of exhibits relied on, with references, producers and current locations.',
  // v2 (LER-1035): reconciled with the sourced field set.
  // v4 (UC-08): `exhibitEntries` declares the exhibit-reference crossRef
  // (defines). Annotation only — no field added, renamed or removed.
  // v5 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 5,
  verification: 'verified',
  fields: [
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText:
        'Case URN in the format force code / unit code / sequence / year, e.g. 01AB0123456/24.',
      mapsTo: 'urn',
      provenance: 'documented',
      validation: { format: 'urn', },
    },
    {
      id: 'defendantName',
      label: 'Defendant full name',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText: 'Full name of the defendant the exhibit list relates to.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'compiledBy',
      label: 'List compiled by',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText: 'Name, rank and number of the officer compiling the exhibit list.',
      provenance: 'likely',
      validation: { maxLength: 120 },
    },
    {
      id: 'exhibitEntries',
      label: 'Exhibits',
      // UC-08: the list of record for the exhibit-reference vocabulary.
      crossRef: { vocabulary: 'exhibitReference', role: 'defines' },
      type: 'textarea',
      required: true,
      section: 'Exhibits',
      // Flat stand-in for the printed 12-row table; see the header comment.
      helpText:
        'One exhibit per line, in the order they appear on the form. Give each line as: exhibit reference — description (say if it is a copy) — person producing — police property reference — current location — attached? For example "JS/1 — CCTV disc (copy) — PC 4571 Hughes — PR/2024/118 — exhibits store — attached".',
      provenance: 'documented',
      rows: 10,
    },
    {
      id: 'storageLocation',
      label: 'Current location of exhibits',
      type: 'text',
      required: true,
      section: 'Exhibits',
      helpText:
        'Where the exhibits are held if they are all in one place; otherwise record each location on its line above.',
      provenance: 'documented',
      validation: { maxLength: 160 },
    },
    {
      id: 'continuityConfirmed',
      label: 'Continuity statements obtained for all exhibits',
      type: 'checkbox',
      required: false,
      section: 'Exhibits',
      helpText:
        'Tick when continuity is covered for every exhibit listed. Not a box on the printed form — retained because drafts store a value under this id.',
      provenance: 'likely',
    },
    {
      id: 'dateCompiled',
      label: 'Date of completion',
      type: 'date',
      required: true,
      section: 'Completion',
      helpText: 'Date this exhibit list was completed.',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
  ],
};

const MG14: FormTemplate = {
  code: 'MG14',
  name: 'Eyewitness / Identification Statement',
  description: 'Statement covering identification evidence and ADVOKATE factors.',
  templateVersion: 1,
  fields: [
    {
      id: 'witnessName',
      label: 'Full name of witness',
      type: 'text',
      required: true,
      helpText: 'Full name of the identifying witness.',
      validation: { maxLength: 120 },
    },
    {
      id: 'observationDate',
      label: 'Date of observation',
      type: 'date',
      required: true,
      helpText: 'Date on which the witness observed the person they identify.',
      validation: { noFutureDate: true },
    },
    {
      id: 'observationDuration',
      label: 'Length of observation',
      type: 'text',
      required: true,
      helpText: 'How long the witness had the person under observation (ADVOKATE: Amount of time).',
    },
    {
      id: 'distanceVisibility',
      label: 'Distance and visibility',
      type: 'textarea',
      required: true,
      helpText:
        'Distance from the person observed and the visibility/lighting conditions at the time (ADVOKATE: Distance, Visibility).',
      rows: 3,
    },
    {
      id: 'obstructions',
      label: 'Obstructions to view',
      type: 'textarea',
      required: false,
      helpText: 'Anything that obstructed the view, even momentarily (ADVOKATE: Obstruction).',
      rows: 2,
    },
    {
      id: 'knownToWitness',
      label: 'Person known to witness?',
      type: 'select',
      required: true,
      helpText:
        'Whether the witness knew the person before, and how well (ADVOKATE: Known or seen before).',
      options: [
        { value: 'known_well', label: 'Known well' },
        { value: 'known_slightly', label: 'Known slightly' },
        { value: 'stranger', label: 'Stranger' },
      ],
    },
    {
      id: 'descriptionGiven',
      label: 'First description given',
      type: 'textarea',
      required: true,
      helpText:
        'The first description of the person the witness gave to police, recorded verbatim where possible (Code D requirement).',
      rows: 4,
    },
    {
      id: 'identificationAccount',
      label: 'Account of identification',
      type: 'textarea',
      required: true,
      helpText:
        'Full first-person account of the observation and any subsequent identification (ADVOKATE: Any reason to remember, Time lapse, Error or discrepancy).',
      rows: 8,
    },
  ],
};

/**
 * MG15 — Interview Record (ticket LER-1038).
 *
 * Sourced from docs/mg-form-research-findings.md: 17 fields, verdict
 * usable-with-caveats. THREE were not corroborated by the independent verifier
 * and are handled accordingly rather than written as documented:
 *  - "Signature (other) — typed name" — NOT written.
 *  - the certification "Date" — NOT written (the interview date already exists).
 *  - "Interview reference no(s)." — the merged box was uncorroborated; the
 *    verifier reports the real form carries TWO boxes, audio tape references and
 *    visual image references, so it is written as two fields marked `likely`.
 * The "Voluntary Interview" record type is likewise not offered: it traces to the
 * same uncorroborated source.
 *
 * The uncorroborated material traces to a document whose `dc:creator` metadata
 * reads "Claude" — an AI recreation of a form, not a specimen. Anything resting
 * only on it is treated as absent.
 *
 * NOTE on `interviewee`: it keeps `mapsTo: 'defendantName'`. An interview under
 * caution is normally of the suspect, so the mapping is right in the common case,
 * but the research warns the interviewee may be a witness. Auto-fill only writes
 * to empty fields and badges what it wrote, so the value is visible and
 * clearable — and the risk is raised in
 * docs/stories/LER-1038-open-questions.md rather than silently removed.
 *
 * `verification: 'unverified'`.
 */
const MG15: FormTemplate = {
  code: 'MG15',
  name: 'Interview Record',
  description: 'Record of an interview, whether contemporaneous notes or a record of a recording.',
  // v2 (LER-1038): sourced field set, minus the uncorroborated boxes.
  // v4 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 4,
  verification: 'verified',
  fields: [
    {
      id: 'recordMethod',
      label: 'Type of record',
      type: 'select',
      required: true,
      section: 'Interview details',
      helpText: 'How this record was made (Code C 11.7).',
      provenance: 'documented',
      options: [
        { value: 'contemporaneous', label: 'Contemporaneous notes' },
        { value: 'asap_after', label: 'Made as soon as practicable afterwards' },
        { value: 'pocket_book', label: 'Pocket notebook entry' },
      ],
    },
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      section: 'Interview details',
      helpText: 'Case URN, e.g. 01AB0123456/24.',
      mapsTo: 'urn',
      provenance: 'documented',
      validation: { format: 'urn', },
    },
    {
      id: 'interviewee',
      label: 'Person interviewed',
      type: 'text',
      required: true,
      section: 'Interview details',
      // Mapped because an interview under caution is normally of the suspect;
      // see the header note and the open-questions file.
      helpText:
        'Full name of the person interviewed. Where the interviewee is a witness rather than the suspect, correct any prefilled name — it will not be the right person.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'policeExhibitNumber',
      label: 'Police Exhibit No.',
      type: 'text',
      required: true,
      section: 'Interview details',
      helpText:
        'The exhibit number given to this record, so it can be produced as an exhibit in its own right.',
      provenance: 'documented',
      validation: { maxLength: 40 },
    },
    {
      id: 'location',
      label: 'Place of interview',
      type: 'text',
      required: true,
      section: 'Interview details',
      helpText: 'Police station or other location where the interview took place.',
      provenance: 'documented',
      validation: { maxLength: 160 },
    },
    {
      id: 'numberOfPages',
      label: 'Number of pages',
      type: 'number',
      required: false,
      section: 'Interview details',
      helpText: 'Total pages of this record, counting continuation sheets.',
      provenance: 'documented',
      validation: { min: 1, max: 999 },
    },
    {
      id: 'interviewDate',
      label: 'Date of interview',
      type: 'date',
      required: true,
      section: 'Interview details',
      helpText: 'Date the interview took place.',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
    {
      id: 'interviewStart',
      label: 'Time interview commenced',
      type: 'time',
      required: true,
      section: 'Interview details',
      helpText: 'Time the interview began.',
      provenance: 'documented',
    },
    {
      id: 'interviewEnd',
      label: 'Time interview concluded',
      type: 'time',
      required: true,
      section: 'Interview details',
      helpText: 'Time the interview ended.',
      provenance: 'documented',
      validation: { notBefore: { fieldId: 'interviewStart', strict: true, message: 'The interview must end after it starts.' }, },
    },
    {
      id: 'interviewDuration',
      label: 'Duration of interview',
      type: 'text',
      required: false,
      section: 'Interview details',
      helpText:
        'Total interview time, e.g. "1 hr 20 min". The form carries it as its own box because breaks mean it is not simply end minus start.',
      provenance: 'documented',
      validation: { maxLength: 40 },
    },
    {
      id: 'audioTapeReferences',
      label: 'Audio tape reference no(s).',
      type: 'text',
      required: false,
      section: 'Interview details',
      // The research's single merged "Interview reference no(s)." box was not
      // corroborated; the verifier reports two separate boxes.
      helpText:
        'Reference numbers of any audio recordings of this interview, comma separated. Leave blank for a written record.',
      provenance: 'likely',
      validation: { maxLength: 120 },
    },
    {
      id: 'visualImageReferences',
      label: 'Visual image reference no(s).',
      type: 'text',
      required: false,
      section: 'Interview details',
      helpText:
        'Reference numbers of any visual recordings of this interview, comma separated. Leave blank if none.',
      provenance: 'likely',
      validation: { maxLength: 120 },
    },
    {
      id: 'interviewers',
      label: 'Interviewer(s)',
      type: 'text',
      required: true,
      section: 'Interview details',
      helpText: 'Name, rank and number of each interviewing officer.',
      provenance: 'documented',
      validation: { maxLength: 200 },
    },
    {
      id: 'otherPersonsPresent',
      label: 'Other persons present',
      type: 'textarea',
      required: false,
      section: 'Interview details',
      helpText:
        'Everyone else present and their role, one per line — legal representative, appropriate adult, interpreter, intermediary.',
      provenance: 'documented',
      rows: 3,
    },
    {
      id: 'cautionGiven',
      label: 'The person interviewed was cautioned',
      type: 'checkbox',
      required: true,
      section: 'Interview details',
      helpText:
        'Tick to confirm the caution was given before questioning, and record the terms in the account below if they differed.',
      provenance: 'likely',
    },
    {
      id: 'questionsAnswers',
      label: 'Record of interview',
      type: 'textarea',
      required: true,
      section: 'Record of interview',
      helpText:
        'The questions and answers as near verbatim as possible. Record significant statements and any no-comment responses in the words used.',
      provenance: 'documented',
      rows: 14,
    },
    {
      id: 'offeredToRead',
      label: 'Record offered to interviewee to read and sign',
      type: 'checkbox',
      required: false,
      section: 'Certification',
      helpText:
        'Tick if the interviewee was given the opportunity to read and sign the record, and note any refusal above.',
      provenance: 'likely',
    },
    {
      id: 'signatureInterviewer',
      label: 'Signature (interviewer) — typed name',
      type: 'text',
      required: true,
      section: 'Certification',
      helpText:
        'Typed name of the interviewing officer certifying the record; the PDF carries space for a wet signature.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
  ],
};

/**
 * MG16 — Bad Character or Dangerous Offender Information (ticket LER-1039).
 *
 * The sourced field set (docs/mg-form-research-findings.md, verdict
 * usable-as-draft) describes a police-to-CPS INFORMATION form: BC/DO type ticks,
 * brief charge details, the material relied on, an officer-completing block and a
 * CPS-use panel. 11 of its 15 fields are `documented`; 3 are `likely`; 1 ("Stage
 * of submission") is a `guess` and is therefore NOT written — it is an open
 * question instead.
 *
 * UNRESOLVED, AND IMPORTANT: the research indicates the six fields this template
 * already had — subjectName, subjectType, gateway, convictionsRelied,
 * relevanceExplanation, noticeDate — describe the separate MoJ *notice to adduce*
 * form (ebc003) rather than the MG16 information form, and that MG16 is
 * defendant-only. If that is right, the s.100 non-defendant reasoning recorded on
 * `subjectName` below rests on a false premise. That is a legal judgement, so
 * nothing was deleted or remapped: the documented boxes are ADDED alongside, the
 * originals keep their ids and values, and the question is put to a practitioner
 * in docs/stories/LER-1039-open-questions.md.
 */
const MG16: FormTemplate = {
  code: 'MG16',
  name: 'Bad Character or Dangerous Offender Information',
  description:
    'Information supplied to the prosecutor about a defendant’s bad character or dangerous-offender status.',
  // v2 (LER-1039): documented boxes added alongside the original six.
  // v4 (D-F, provisional): verification flipped to 'verified' against the
  // MoG 2011 specimen (docs/decisions/layout-verification-record.md).
  // Metadata only — no field added, renamed or removed.
  templateVersion: 4,
  verification: 'verified',
  fields: [
    {
      id: 'defendantName',
      label: 'Defendant’s full name',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText:
        'Full name of the defendant this information concerns. See also “Person to whom the evidence relates” below — whether the two are always the same person is an open question for MG16.',
      mapsTo: 'defendantName',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'urn',
      label: 'Unique Reference Number (URN)',
      type: 'text',
      required: true,
      section: 'Case details',
      helpText: 'Case URN, e.g. 01AB0123456/24.',
      mapsTo: 'urn',
      provenance: 'documented',
      validation: { format: 'urn', },
    },
    {
      id: 'arrestSummonsNumber',
      label: 'Arrest/Summons Number (A/S No.)',
      type: 'text',
      required: false,
      section: 'Case details',
      helpText: 'The ASN for this case, where one has been allocated.',
      provenance: 'documented',
      validation: { format: 'asn', maxLength: 40 },
    },
    {
      id: 'badCharacterEvidence',
      label: 'Bad character (BC) — evidence for trial',
      type: 'checkbox',
      required: false,
      section: 'Type of information',
      helpText:
        'Tick where this form supplies bad character evidence intended for use at trial. Both boxes may apply.',
      provenance: 'documented',
    },
    {
      id: 'dangerousOffenderInformation',
      label: 'Dangerous offender (DO) — information for sentencing',
      type: 'checkbox',
      required: false,
      section: 'Type of information',
      helpText:
        'Tick where this form supplies dangerous-offender information relevant to sentencing rather than trial.',
      provenance: 'documented',
    },
    {
      id: 'chargeDetails',
      label: 'Brief details of charge(s) or proposed charge(s)',
      type: 'textarea',
      required: true,
      section: 'Charges and material',
      helpText: 'Short description of each charge or proposed charge, one per line.',
      mapsTo: 'charges',
      provenance: 'documented',
      rows: 4,
    },
    {
      id: 'relevantEvidence',
      label: 'Relevant evidence / information',
      type: 'textarea',
      required: true,
      section: 'Charges and material',
      helpText:
        'The material relied on. Set out each item so the prosecutor can assess admissibility without going back to the file.',
      provenance: 'documented',
      rows: 6,
    },
    {
      id: 'convictionsRelied',
      label: 'Convictions / conduct relied upon',
      type: 'textarea',
      required: true,
      section: 'Charges and material',
      helpText:
        'Each previous conviction or instance of reprehensible conduct relied on: date, court, offence and sentence.',
      provenance: 'likely',
      rows: 6,
    },
    {
      id: 'otherThanConvictions',
      label: 'Evidence or information other than convictions',
      type: 'textarea',
      required: false,
      section: 'Charges and material',
      helpText:
        'Bad character material that is not a previous conviction — e.g. cautions, reprimands, or conduct not resulting in a charge.',
      provenance: 'likely',
      rows: 4,
    },
    {
      id: 'documentationAttached',
      label: 'Relevant documentation attached',
      type: 'checkbox',
      required: false,
      section: 'Charges and material',
      helpText: 'Tick where supporting documents accompany this form, and list them above.',
      provenance: 'likely',
    },
    {
      // Retained from the original field set. The comment below records the
      // reasoning as it stood; the research now questions its premise.
      // MG16 may be defendant-only, in which case the s.100 hazard does not
      // arise — see docs/stories/LER-1039-open-questions.md. Deliberately NOT
      // resolved here: it is a legal judgement, not an implementation choice.
      id: 'subjectName',
      label: 'Person to whom the evidence relates',
      type: 'text',
      required: true,
      section: 'Charges and material',
      helpText:
        'Full name of the defendant or non-defendant whose bad character is to be adduced. Left unmapped: on a s.100 notice the subject is a non-defendant, so prefilling the defendant would name the wrong person.',
      provenance: 'likely',
    },
    {
      id: 'subjectType',
      label: 'Subject is',
      type: 'select',
      required: true,
      section: 'Charges and material',
      helpText:
        'Whether the material concerns a defendant (s.101 CJA 2003) or a non-defendant (s.100 CJA 2003).',
      provenance: 'likely',
      options: [
        { value: 'defendant', label: 'Defendant (s.101)' },
        { value: 'non_defendant', label: 'Non-defendant (s.100)' },
      ],
    },
    {
      id: 'gateway',
      label: 'Gateway relied upon',
      type: 'select',
      required: true,
      section: 'Charges and material',
      helpText:
        'The statutory gateway through which admission is sought, e.g. s.101(1)(d) important matter in issue.',
      provenance: 'likely',
      options: [
        { value: '101_1_c', label: 's.101(1)(c) — important explanatory evidence' },
        { value: '101_1_d', label: 's.101(1)(d) — important matter in issue' },
        { value: '101_1_f', label: 's.101(1)(f) — correcting a false impression' },
        { value: '101_1_g', label: 's.101(1)(g) — attack on another’s character' },
        { value: '100_1_b', label: 's.100(1)(b) — substantial probative value (non-defendant)' },
      ],
    },
    {
      id: 'relevanceExplanation',
      label: 'Relevance to the present case',
      type: 'textarea',
      required: true,
      section: 'Charges and material',
      helpText:
        'Why the bad character evidence is relevant and admissible through the selected gateway.',
      provenance: 'likely',
      rows: 5,
    },
    {
      id: 'officerCompleting',
      label: 'Officer completing form (rank, number or job title)',
      type: 'text',
      required: true,
      section: 'Completion',
      // Not mapped: the officer submitting BC/DO information is not necessarily
      // the officer in the case, and the research does not say it is.
      helpText:
        'Name and rank, number or job title of the person completing this form. Not necessarily the officer in the case.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'signatureName',
      label: 'Signature (typed name)',
      type: 'text',
      required: false,
      section: 'Completion',
      helpText: 'Typed name standing in for the signature; the PDF carries space for a wet signature.',
      provenance: 'likely',
      validation: { maxLength: 120 },
    },
    {
      id: 'noticeDate',
      label: 'Date',
      type: 'date',
      required: true,
      section: 'Completion',
      helpText:
        'Date this form was completed. Time limits for a bad character notice run under CrimPR Part 21.',
      provenance: 'documented',
      validation: { notAfter: { fieldId: 'dateReceivedByProsecutor', message: 'A notice cannot be received by the prosecutor before it was dated.' }, noFutureDate: true },
    },
    {
      id: 'reviewingLawyer',
      label: 'Duty Prosecutor / reviewing lawyer',
      type: 'text',
      required: false,
      section: 'CPS use',
      helpText: 'Completed by the CPS: the prosecutor who reviewed this information.',
      provenance: 'documented',
      validation: { maxLength: 120 },
    },
    {
      id: 'dateReceivedByProsecutor',
      label: 'Date received by prosecutor',
      type: 'date',
      required: false,
      section: 'CPS use',
      helpText: 'Completed by the CPS: the date this information reached the prosecutor.',
      provenance: 'documented',
      validation: { noFutureDate: true },
    },
  ],
};

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  MG1,
  MG2,
  MG3,
  MG4,
  MG5,
  MG6,
  MG11,
  MG12,
  MG14,
  MG15,
  MG16,
];

export function getFormTemplate(code: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((t) => t.code === (code as MgFormCode));
}

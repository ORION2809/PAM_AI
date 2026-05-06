> STATUS: The PAMAI duplicate-expense workflow is the active implementation in this repository.
> The WiFi complaint workflow referenced below is historical comparison only. Retired endpoints now return `410` migration responses.

. Revised use case
Business scenario
Pega detects that uploaded expense documents may be duplicates because they have the same:
Expense dateExpense amountMerchant/vendorDocument typeUploaded file metadataExtracted OCR fields
Pega sends an email to the user:
We found possible duplicate expense documents in your submission.Please use the PAMAI voice assistant to confirm whether these are actual duplicates or separate valid expenses.
The email contains a secure PAMAI link.
User opens the link. PAMAI already knows the case context and starts the conversation.
After the conversation, PAMAI sends back to Pega:
User confirmed duplicate: YES / NO / PARTIAL / UNCLEARExplanation from userWhether reupload is requiredTranscript summaryRecommended next action

2. New architecture
Pega Case│├── Documents Upload├── Audit Documents│   └── Duplicate Expense Check│├── Duplicate Document Identification│   ├── Send email with PAMAI URL│   ├── Wait for PAMAI response│   ├── Analyze PAMAI response│   ├── Is Reupload Required?│   ├── Change to Reupload Documents│   └── Change to Manager Approval│└── Manager Approval / Reupload Documents / Approval Rejection
External PAMAI architecture:
Pega Case Flow│├── POST session data to PAMAI│▼PAMAI Backend│├── Stores voice session├── Generates secure conversation URL├── Preloads case + duplicate document context├── Waits for user to open link│▼PAMAI Web Voice UI│├── Advanced orb interface├── Voice conversation├── Confirms user identity├── Explains duplicate issue├── Captures user answer│▼PAMAI Backend│├── Validates structured result├── Stores transcript + result JSON├── Sends callback to Pega│▼Pega│├── Updates case data├── Routes to reupload / manager approval / manual review

3. What changes from the previous voice agent design
Previous WiFi complaint agentNew Pega duplicate-doc agentUser starts generic support callUser opens case-specific secure linkSQL customer lookup using mobile numberPega sends case/user/document context beforehandAgent diagnoses WiFi issueAgent clarifies duplicate expense evidenceStores open/closed complaint JSONSends structured response back to PegaAgent decides open/closed casePega decides case routingSQL is main data sourcePega is main data sourceJSON folders are final outputJSON is audit/export only; Pega is system of record
This is the right enterprise architecture. PAMAI should not become a parallel case-management system.

4. End-to-end flow
Step 1 — Pega detects duplicate documents
In your screenshot, this is likely inside:
Audit Documents → Duplicate Expense Check
Pega identifies duplicate candidates.
Example:
Expense 1:Date: 2026-05-01Amount: ₹2,450Merchant: UberDocument: uber_receipt_1.pdfExpense 2:Date: 2026-05-01Amount: ₹2,450Merchant: UberDocument: uber_receipt_2.pdf

Step 2 — Pega creates PAMAI voice session
Pega calls PAMAI before sending the email.
POST https://pamai-api.company.com/v1/voice-sessions
Request from Pega to PAMAI
{  "sourceSystem": "Pega",  "caseId": "EXP-10293",  "caseReference": "C-382910",  "assignmentId": "ASSIGN-77281",  "caseType": "ExpenseReview",  "currentStage": "Duplicate Document Identification",  "currentStep": "Wait for Customer Clarification",  "conversationPurpose": "DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION",  "customer": {    "customerId": "EMP-10045",    "fullName": "Rahul Sharma",    "email": "rahul.sharma@company.com",    "mobile": "+919876543210"  },  "duplicateFindings": [    {      "duplicateGroupId": "DUP-GRP-001",      "reason": "Same expense date and same amount detected across multiple uploaded documents.",      "confidence": 0.91,      "expenseRecords": [        {          "expenseRecordId": "EXP-LINE-001",          "documentId": "DOC-001",          "fileName": "cab_receipt_1.pdf",          "expenseDate": "2026-05-01",          "amount": 2450,          "currency": "INR",          "merchant": "Uber",          "documentType": "Receipt"        },        {          "expenseRecordId": "EXP-LINE-002",          "documentId": "DOC-002",          "fileName": "cab_receipt_2.pdf",          "expenseDate": "2026-05-01",          "amount": 2450,          "currency": "INR",          "merchant": "Uber",          "documentType": "Receipt"        }      ]    }  ],  "callback": {    "url": "https://pega.company.com/prweb/api/pamai/v1/duplicate-response",    "authType": "OAUTH2_CLIENT_CREDENTIALS"  },  "expiresAt": "2026-05-08T18:30:00+05:30",  "metadata": {    "createdByOperator": "System",    "tenant": "ExpensePOC",    "locale": "en-IN"  }}

Step 3 — PAMAI creates secure session URL
PAMAI stores the request and returns a URL.
Response from PAMAI to Pega
{  "sessionId": "PAMAI-SESSION-9f8a12",  "status": "READY",  "conversationUrl": "https://pamai.company.com/voice/session/PAMAI-SESSION-9f8a12#token=signed-token",  "expiresAt": "2026-05-08T18:30:00+05:30"}
Pega then inserts this URL into the email.
Do not put raw case ID, customer email, or document IDs directly in the URL. Use a signed token.
Bad:
https://pamai.company.com?caseId=EXP-10293&email=rahul@company.com
Good:
https://pamai.company.com/voice/session/PAMAI-SESSION-9f8a12#token=signed-token

5. Email from Pega to user
The Pega email should say something like:
EmailSubjectAction required: Clarification needed for possible duplicate expense documentsAction required: Clarification needed for possible duplicate expense documents Dear Rahul,We found possible duplicate expense documents in your expense submission.The documents appear to have the same expense date and amount. Please use the secure PAMAI voice assistant link below to confirm whether these are actual duplicate documents or separate valid expenses.Open PAMAI voice assistant: {{PAMAI_CONVERSATION_URL}}This link is valid until {{EXPIRY_DATE_TIME}}.Regards,Expense Review Team

6. PAMAI conversation flow
The voice agent should not behave like a general chatbot. It should run a controlled clarification flow.
Conversation states
SESSION_LOADEDIDENTITY_CHECKCASE_CONTEXT_EXPLANATIONDUPLICATE_FINDING_EXPLANATIONUSER_CLARIFICATIONFOLLOW_UP_QUESTIONCONFIRM_FINAL_ANSWERSUBMIT_TO_PEGACOMPLETED

Voice flow example
Agent:Hello Rahul. I am PAMAI, your expense review assistant.I am here to clarify a possible duplicate document issue in your expense claim.Agent:For security, please confirm the last four digits of your registered mobile number.User:3210.Agent:Thank you. I found your expense review case.Agent:We detected two expense documents with the same date, amount, and merchant.Both appear to be for ₹2,450 on 1 May 2026 for Uber.Agent:Are these two documents for the same expense, or are they two separate valid expenses?User:They are separate rides. One was from home to office and the other was from office to client location.Agent:Understood. So you are confirming these are not duplicate documents.Can you briefly explain why both have the same amount and date?User:The two trips happened on the same day and both fares were exactly the same.Agent:Thank you. I will send this explanation back to the expense review team.Please confirm: should I mark these as separate valid expenses?User:Yes.Agent:Done. I have submitted your clarification.

7. Output PAMAI sends back to Pega
After the call, PAMAI sends structured JSON to Pega.
POST https://pega.company.com/prweb/api/pamai/v1/duplicate-response
Response from PAMAI to Pega
{  "sessionId": "PAMAI-SESSION-9f8a12",  "caseId": "EXP-10293",  "caseReference": "C-382910",  "assignmentId": "ASSIGN-77281",  "conversationPurpose": "DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION",  "status": "COMPLETED",  "completedAt": "2026-05-06T11:42:30+05:30",  "userDecision": {    "duplicateConfirmed": "NO",    "decisionType": "SEPARATE_VALID_EXPENSES",    "requiresReupload": false,    "requiresManualReview": false,    "userExplanation": "The two expenses were separate rides on the same date. Both rides had the same fare amount, but they were for different travel purposes.",    "finalUserConfirmation": true  },  "duplicateGroupsReviewed": [    {      "duplicateGroupId": "DUP-GRP-001",      "expenseRecordIds": [        "EXP-LINE-001",        "EXP-LINE-002"      ],      "documentIds": [        "DOC-001",        "DOC-002"      ],      "userResponse": "NOT_DUPLICATE",      "explanation": "Separate rides with same amount on the same date."    }  ],  "agentSummary": {    "summary": "User confirmed the flagged expense documents are not duplicates. User explained that both expenses occurred on the same date and had the same amount but represented two different rides.",    "confidence": 0.88,    "recommendedNextAction": "PROCEED_TO_MANAGER_APPROVAL"  },  "transcript": [    {      "speaker": "agent",      "text": "We detected two expense documents with the same date, amount, and merchant."    },    {      "speaker": "user",      "text": "They are separate rides. One was from home to office and the other was from office to client location."    },    {      "speaker": "agent",      "text": "Please confirm: should I mark these as separate valid expenses?"    },    {      "speaker": "user",      "text": "Yes."    }  ],  "technicalMetadata": {    "voiceModel": "tts-provider-name",    "reasoningModel": "reasoning-model-name",    "language": "en-IN",    "durationSeconds": 142,    "idempotencyKey": "PAMAI-SESSION-9f8a12-COMPLETION"  }}

8. Possible user outcomes
PAMAI should return only one of these outcomes.
User outcomeMeaningPega next actionDUPLICATE_CONFIRMEDUser agrees documents are duplicatesRoute to reupload / rejection / correctionNOT_DUPLICATEUser says they are separate valid expensesRoute to Manager ApprovalPARTIAL_DUPLICATESome docs are duplicate, some are validRoute to review or reuploadREUPLOAD_REQUIREDUser cannot explain or agrees to upload correct docsRoute to Reupload DocumentsUNCLEAR_RESPONSEVoice conversation was inconclusiveKeep in duplicate identification / manual reviewSESSION_EXPIREDUser did not respond in timeEscalate/reminder/manual action

9. Pega routing logic
Based on your screenshot, PAMAI should fit mainly inside this alternate stage:
Duplicate Document Identification
Current steps in screenshot:
Wait for Customer Email...TestAnalyze Email ResponseIsReloadRequiredChange to Documents R...Change to Manager App...
For PAMAI, convert that to:
Create PAMAI SessionSend PAMAI Link EmailWait for PAMAI ResponseAnalyze PAMAI ResponseIs Reupload Required?Change to Reupload DocumentsChange to Manager Approval
Suggested mapping
PAMAI response: NOT_DUPLICATE→ Change to Manager ApprovalPAMAI response: DUPLICATE_CONFIRMED→ Change to Reupload Documents or Approval RejectionPAMAI response: REUPLOAD_REQUIRED→ Change to Reupload DocumentsPAMAI response: UNCLEAR_RESPONSE→ Keep in Duplicate Document Identification / manual reviewPAMAI response: SESSION_EXPIRED→ Send reminder or route to manual review

10. PAMAI backend endpoints
Your voice agent backend should expose these APIs.
1. Create voice session
POST /v1/voice-sessions
Purpose:
Pega sends case, user, and duplicate document context.PAMAI creates a ready-to-use voice session.

2. Get session context
GET /v1/voice-sessions/{sessionId}
Purpose:
Frontend loads the session context after user opens the secure link.
The frontend should never directly receive sensitive backend-only metadata unless needed.

3. Start conversation
POST /v1/voice-sessions/{sessionId}/start
Purpose:
Marks session as started.Initializes voice runtime.Loads prompt/context.

4. Submit conversation result
POST /v1/voice-sessions/{sessionId}/complete
Purpose:
Stores final conversation result inside PAMAI.Triggers callback to Pega.

5. Callback retry/status
GET /v1/voice-sessions/{sessionId}/callback-status
Purpose:
Shows whether response was successfully delivered to Pega.

11. PAMAI internal database design
For MVP, use PostgreSQL or SQLite.
Table: voice_sessions
CREATE TABLE voice_sessions (  id TEXT PRIMARY KEY,  pega_case_id TEXT NOT NULL,  pega_case_reference TEXT,  assignment_id TEXT,  customer_name TEXT,  customer_email TEXT,  customer_mobile_masked TEXT,  session_status TEXT NOT NULL,  session_token_hash TEXT NOT NULL,  callback_url TEXT NOT NULL,  expires_at TIMESTAMP NOT NULL,  created_at TIMESTAMP NOT NULL,  started_at TIMESTAMP,  completed_at TIMESTAMP);
Table: duplicate_findings
CREATE TABLE duplicate_findings (  id TEXT PRIMARY KEY,  session_id TEXT NOT NULL,  duplicate_group_id TEXT NOT NULL,  reason TEXT,  confidence NUMERIC,  finding_json JSONB NOT NULL,  FOREIGN KEY (session_id) REFERENCES voice_sessions(id));
Table: conversation_results
CREATE TABLE conversation_results (  id TEXT PRIMARY KEY,  session_id TEXT NOT NULL,  user_decision TEXT NOT NULL,  requires_reupload BOOLEAN,  requires_manual_review BOOLEAN,  user_explanation TEXT,  agent_summary TEXT,  confidence NUMERIC,  result_json JSONB NOT NULL,  created_at TIMESTAMP NOT NULL,  FOREIGN KEY (session_id) REFERENCES voice_sessions(id));
Table: pega_callback_attempts
CREATE TABLE pega_callback_attempts (  id TEXT PRIMARY KEY,  session_id TEXT NOT NULL,  callback_status TEXT NOT NULL,  http_status_code INTEGER,  response_body TEXT,  attempted_at TIMESTAMP NOT NULL,  retry_count INTEGER DEFAULT 0,  FOREIGN KEY (session_id) REFERENCES voice_sessions(id));

12. JSON file output for audit
You can still keep JSON files, but not as the main system of record.
Suggested folder structure:
/data/pamai-sessions  /ready    PAMAI-SESSION-9f8a12.json  /completed    PAMAI-SESSION-9f8a12.json  /callback-failed    PAMAI-SESSION-9f8a12.json
Completed result file:
{  "sessionId": "PAMAI-SESSION-9f8a12",  "caseId": "EXP-10293",  "status": "COMPLETED",  "userDecision": "NOT_DUPLICATE",  "requiresReupload": false,  "userExplanation": "These were two separate rides on the same date with the same amount.",  "recommendedNextAction": "PROCEED_TO_MANAGER_APPROVAL",  "sentToPega": true,  "sentToPegaAt": "2026-05-06T11:42:35+05:30"}

13. Voice agent prompt
Use this as the system prompt for the PAMAI reasoning layer.
You are PAMAI, a voice assistant helping users clarify possible duplicate expense documents in a Pega expense review case.Your job is not to approve or reject the expense. Your job is to:1. Explain the duplicate document concern clearly.2. Ask the user whether the documents are actual duplicates or separate valid expenses.3. Ask follow-up questions if the answer is unclear.4. Capture the user's explanation.5. Ask for final confirmation.6. Return a structured result to the backend.You must not invent case data.Use only the case context provided by the backend.Do not expose internal confidence scores to the user.Do not say the case is approved.Do not say the reimbursement is guaranteed.Do not make policy decisions.Do not ask for unrelated personal information.If the user confirms the documents are duplicates, classify as DUPLICATE_CONFIRMED.If the user explains they are separate valid expenses, classify as NOT_DUPLICATE.If some documents are duplicates and others are valid, classify as PARTIAL_DUPLICATE.If the user says they need to upload corrected documents, classify as REUPLOAD_REQUIRED.If the user is unclear, contradictory, or refuses to answer, classify as UNCLEAR_RESPONSE.Always produce the final backend result in the required JSON schema.

14. Final structured LLM output schema
Your backend should force the model into this schema.
{  "userDecision": "NOT_DUPLICATE",  "requiresReupload": false,  "requiresManualReview": false,  "finalUserConfirmation": true,  "userExplanation": "The documents are for separate expenses even though the amount and date are the same.",  "duplicateGroupsReviewed": [    {      "duplicateGroupId": "DUP-GRP-001",      "userResponse": "NOT_DUPLICATE",      "explanation": "Separate rides with the same fare."    }  ],  "agentSummary": "User confirmed the flagged documents are separate valid expenses and provided an explanation.",  "recommendedNextAction": "PROCEED_TO_MANAGER_APPROVAL",  "confidence": 0.88}

15. Deployment design
For demo:
Frontend:Vercel / AWS AmplifyBackend:Render / Railway / AWS Elastic Beanstalk / ECS FargateDatabase:Supabase Postgres / RDS PostgresStorage:S3 or local folder for demo JSONVoice:Browser mic + STT/TTS for demoorDeepgram/OpenAI STT + ElevenLabs/OpenAI TTSDomain:https://pamai.company.com
For enterprise/Pega integration:
Frontend:AWS Amplify or S3 + CloudFrontBackend:AWS ECS Fargate or EKSDatabase:AWS RDS PostgreSQLStorage:S3 encrypted bucketSecrets:AWS Secrets ManagerLogs:CloudWatchSecurity:OAuth2 client credentials / signed JWT / HMAC callbacksNetwork:WAF + HTTPS + custom domain

16. URL design for Pega email
Use this:
https://pamai.company.com/voice/session/{sessionId}?token={signedToken}
Example:
https://pamai.company.com/voice/session/PAMAI-SESSION-9f8a12?token=eyJhbGciOi...
The frontend flow:
1. User opens URL.2. Frontend sends sessionId + token to backend.3. Backend validates token.4. Backend checks expiry.5. Backend loads case context.6. Frontend starts voice session.

17. Security requirements
Minimum security for demo:
Signed session tokenToken expiryNo raw PII in URLHTTPS onlySession status validationOne-time or limited-use linkBasic audit logs
Production security:
OAuth2 between Pega and PAMAIHMAC-signed callbacksToken expiryReplay protectionIdempotency keyEncrypted database fieldsEncrypted transcript storageConsent message before recordingPII masking in logsIP allowlisting if possibleManual fallback if callback fails
The user email link alone should not be treated as full identity proof. For demo, it is acceptable. For production, add one extra check:
Confirm last four digits of registered mobile numberorOTP to registered email/mobile

18. What the Pega team needs to build
Since you are building only the AI voice agent, give the Pega team this integration requirement.
Pega must expose/provide
1. Duplicate expense detection output2. Case ID / assignment ID3. Customer name and email4. Duplicate document metadata5. REST connector to create PAMAI session6. Email template with PAMAI URL7. REST service to receive PAMAI result8. Data mapping from PAMAI result to Pega case fields9. Routing logic after PAMAI response
Pega should not expect PAMAI to
Approve expensesReject expensesMove stages directly without Pega rulesOwn case lifecycleStore final case stateAccess Pega clipboard directly
PAMAI sends a structured clarification. Pega decides what to do.

19. What your PAMAI team needs to build
1. Voice-session creation API2. Secure session URL generation3. Session context store4. Voice UI with advanced orb5. Conversation state machine6. Reasoning prompt/schema7. Transcript capture8. Final decision extraction9. Pega callback sender10. Callback retry mechanism11. JSON audit file generation12. Admin/debug screen for demo

20. Best demo story
For the demo, show this exact journey:
1. Pega case reaches Duplicate Document Identification.2. Pega creates PAMAI session.3. Pega sends email with PAMAI link.4. User opens link.5. Orb starts in STANDING BY.6. Agent says:   "Hello Rahul, I am PAMAI. I am here to clarify a possible duplicate expense document issue."7. Agent explains the duplicate finding.8. User says:   "No, they are separate expenses."9. Agent asks:   "Can you explain why the amount and date are the same?"10. User explains.11. Agent confirms:   "Should I send this clarification back to the expense review team?"12. User says yes.13. PAMAI sends result to Pega.14. Pega case moves to Manager Approval.

21. Final target architecture
Pega Case Flow    │    │ 1. Duplicate found    ▼Pega Connector    │    │ POST /v1/voice-sessions    ▼PAMAI Backend    │    │ creates session + signed URL    ▼Pega Email    │    │ sends URL to user    ▼PAMAI Voice UI    │    │ user conversation    ▼PAMAI Reasoning Layer    │    │ extracts structured decision    ▼PAMAI Callback Service    │    │ POST result to Pega    ▼Pega Case    │    ├── NOT_DUPLICATE → Manager Approval    ├── DUPLICATE_CONFIRMED → Reupload / Rejection    ├── REUPLOAD_REQUIRED → Reupload Documents    └── UNCLEAR_RESPONSE → Manual review
This is the right conversion of your original AI voice-agent idea into a Pega-relevant enterprise use case. It keeps the demo impressive, but more importantly, it makes the integration clean, governable, and believable for a Pega customer.
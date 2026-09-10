/**
 * Single source of truth for meeting records (list, summary, transcript,
 * conversation feed, and translations). Used by API routes and pages.
 */

export type MeetingStatus = "live" | "summary";

export type MeetingActionItem = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "open" | "done";
};

export type TranscriptLine = {
  id: string;
  speaker: string;
  role: string;
  text: string;
  textHi: string;
  textTe: string;
  time: string;
  confidence: number;
};

export type MeetingAiAnswer = {
  id: string;
  question: string;
  questionHi: string;
  questionTe: string;
  answer: string;
  answerHi: string;
  answerTe: string;
  pinned: boolean;
};

export type MeetingRecord = {
  id: string;
  title: string;
  time: string;
  duration: string;
  attendees: number;
  status: MeetingStatus;
  tags: string[];
  generatedIn?: string;
  executiveSummary: string;
  executiveSummaryHi: string;
  executiveSummaryTe: string;
  keyDecisions: string[];
  risks: Array<{ type: "risk" | "question"; text: string }>;
  actionItems: MeetingActionItem[];
  transcript: TranscriptLine[];
  aiAnswers: MeetingAiAnswer[];
  emailSubject: string;
  emailBody: string;
};

export type MeetingListItem = Pick<
  MeetingRecord,
  "id" | "title" | "time" | "duration" | "attendees" | "status" | "tags"
>;

const MEETINGS: MeetingRecord[] = [
  {
    id: "m1",
    title: "Q3 Product Sync",
    time: "Today · 10:00 AM",
    duration: "42m",
    attendees: 8,
    status: "summary",
    tags: ["Product", "Roadmap"],
    generatedIn: "18s",
    executiveSummary:
      "The team aligned on a three-phase enterprise rollout for CueAI Companion. Latency SLOs were set at p95 under 800ms for live suggestions. Screen Context will remain opt-in with explicit privacy controls. SSO / SCIM is deferred to Phase 3 pending Security review.",
    executiveSummaryHi:
      "टीम ने CueAI Companion के लिए तीन-चरणीय एंटरप्राइज़ रोलआउट पर सहमति बनाई। लाइव सुझावों के लिए लेटेंसी लक्ष्य p95 800ms से कम रखा गया। स्क्रीन कॉन्टेक्स्ट ऑप्ट-इन रहेगा। SSO/SCIM को Phase 3 तक स्थगित किया गया।",
    executiveSummaryTe:
      "టీమ్ CueAI Companion కోసం మూడు-దశల ఎంటర్‌ప్రైజ్ రోలౌట్‌పై ఏకీభవించింది. లైవ్ సూచనలకు లేటెన్సీ లక్ష్యం p95 800ms కంటే తక్కువగా ఉంచబడింది. స్క్రీన్ కాంటెక్స్ట్ ఆప్ట్-ఇన్‌గా ఉంటుంది. SSO/SCIM Phase 3కి వాయిదా పడింది.",
    keyDecisions: [
      "Ship Companion glass panel in two sprints",
      "Keep Screen Context opt-in for enterprise",
      "Defer deep RAG when confidence < 0.7",
    ],
    risks: [
      {
        type: "risk",
        text: "Latency may spike on low-bandwidth enterprise VPNs.",
      },
      {
        type: "question",
        text: "Which region locks are required for EU workspaces?",
      },
    ],
    actionItems: [
      {
        id: "ai1",
        title: "Finalize Companion latency SLOs",
        owner: "Marcus Lee",
        due: "Aug 12",
        status: "open",
      },
      {
        id: "ai2",
        title: "Draft opt-in privacy copy for screen capture",
        owner: "Alex Chen",
        due: "Aug 10",
        status: "open",
      },
      {
        id: "ai3",
        title: "Share enterprise SSO checklist with Security",
        owner: "Priya Nair",
        due: "Aug 14",
        status: "done",
      },
    ],
    transcript: [
      {
        id: "m1-t1",
        speaker: "Priya Nair",
        role: "PM",
        text: "Let's align on the enterprise rollout timeline for CueAI Companion.",
        textHi: "आइए CueAI Companion के लिए एंटरप्राइज़ रोलआउट टाइमलाइन पर सहमति बनाएं।",
        textTe: "CueAI Companion కోసం ఎంటర్‌ప్రైజ్ రోలౌట్ టైమ్‌లైన్‌పై ఏకీభవిద్దాం.",
        time: "00:02:14",
        confidence: 0.98,
      },
      {
        id: "m1-t2",
        speaker: "Alex Chen",
        role: "You",
        text: "We can ship the always-on glass panel in two sprints if screen context stays opt-in.",
        textHi: "अगर स्क्रीन कॉन्टेक्स्ट ऑप्ट-इन रहता है तो हम दो स्प्रिंट में ग्लास पैनल शिप कर सकते हैं।",
        textTe: "స్క్రీన్ కాంటెక్స్ట్ ఆప్ట్-ఇన్‌గా ఉంటే రెండు స్ప్రింట్లలో గ్లాస్ ప్యానెల్ షిప్ చేయవచ్చు.",
        time: "00:02:41",
        confidence: 0.96,
      },
      {
        id: "m1-t3",
        speaker: "Marcus Lee",
        role: "Eng",
        text: "What's our latency budget for real-time answers during Zoom calls?",
        textHi: "Zoom कॉल के दौरान रीयल-टाइम उत्तरों के लिए हमारा लेटेंसी बजट क्या है?",
        textTe: "Zoom కాల్స్ సమయంలో రియల్-టైమ్ సమాధానాలకు మా లేటెన్సీ బడ్జెట్ ఎంత?",
        time: "00:03:05",
        confidence: 0.94,
      },
      {
        id: "m1-t4",
        speaker: "Priya Nair",
        role: "PM",
        text: "Sub-800ms for suggestions. Summaries can be async after the call ends.",
        textHi: "सुझावों के लिए 800ms से कम। सारांश कॉल खत्म होने के बाद async हो सकते हैं।",
        textTe: "సూచనలకు 800ms కంటే తక్కువ. సారాంశాలు కాల్ తర్వాత async కావచ్చు.",
        time: "00:03:22",
        confidence: 0.97,
      },
    ],
    aiAnswers: [
      {
        id: "m1-a1",
        question: "Latency budget for real-time answers?",
        questionHi: "रीयल-टाइम उत्तरों के लिए लेटेंसी बजट?",
        questionTe: "రియల్-టైమ్ సమాధానాలకు లేటెన్సీ బడ్జెట్?",
        answer:
          "Target p95 < 800ms for suggestion cards. Use streaming tokens and local transcript buffer; defer full RAG to background when confidence < 0.7.",
        answerHi:
          "सुझाव कार्ड के लिए p95 < 800ms लक्ष्य रखें। स्ट्रीमिंग टोकन और लोकल ट्रांसक्रिप्ट बफ़र उपयोग करें; confidence < 0.7 पर पूर्ण RAG को बैकग्राउंड में भेजें।",
        answerTe:
          "సూచన కార్డులకు p95 < 800ms లక్ష్యం. స్ట్రీమింగ్ టోకెన్లు మరియు లోకల్ ట్రాన్స్క్రిప్ట్ బఫర్ ఉపయోగించండి; confidence < 0.7 అయితే పూర్తి RAGని బ్యాక్‌గ్రౌండ్‌కు పంపండి.",
        pinned: true,
      },
      {
        id: "m1-a2",
        question: "Enterprise rollout timeline?",
        questionHi: "एंटरप्राइज़ रोलआउट टाइमलाइन?",
        questionTe: "ఎంటర్‌ప్రైజ్ రోలౌట్ టైమ్‌లైన్?",
        answer:
          "Phase 1: Companion + live transcript (2 sprints). Phase 2: Screen context opt-in + admin controls. Phase 3: SSO / SCIM and retention policies.",
        answerHi:
          "Phase 1: Companion + लाइव ट्रांसक्रिप्ट (2 स्प्रिंट)। Phase 2: स्क्रीन कॉन्टेक्स्ट ऑप्ट-इन + एडमिन नियंत्रण। Phase 3: SSO/SCIM और रिटेंशन नीतियाँ।",
        answerTe:
          "Phase 1: Companion + లైవ్ ట్రాన్స్క్రిప్ట్ (2 స్ప్రింట్లు). Phase 2: స్క్రీన్ కాంటెక్స్ట్ ఆప్ట్-ఇన్ + అడ్మిన్ నియంత్రణలు. Phase 3: SSO/SCIM మరియు రిటెన్షన్ విధానాలు.",
        pinned: false,
      },
    ],
    emailSubject: "Notes from Q3 Product Sync",
    emailBody:
      "Hi team — thanks for a focused sync. We locked Phase 1/2 scope for Companion, confirmed the 800ms latency budget, and kept Screen Context opt-in. Action items and owners are listed below. Reply if anything looks off.",
  },
  {
    id: "m2",
    title: "Enterprise Security Review",
    time: "Today · 2:30 PM",
    duration: "28m",
    attendees: 5,
    status: "live",
    tags: ["Security"],
    generatedIn: "12s",
    executiveSummary:
      "Security reviewed CueAI capture exclusion, retention defaults, and admin audit coverage. Content protection is confirmed for Windows overlay. Retention auto-delete remains off until legal signs off.",
    executiveSummaryHi:
      "सिक्योरिटी ने CueAI कैप्चर एक्सक्लूजन, रिटेंशन डिफ़ॉल्ट और एडमिन ऑडिट कवरेज की समीक्षा की। Windows ओवरले के लिए कंटेंट प्रोटेक्शन पुष्टि हुई। लीगल साइन-ऑफ तक ऑटो-डिलीट बंद रहेगा।",
    executiveSummaryTe:
      "సెక్యూరిటీ CueAI క్యాప్చర్ ఎక్స్‌క్లూజన్, రిటెన్షన్ డిఫాల్ట్‌లు మరియు అడ్మిన్ ఆడిట్ కవరేజ్‌ను సమీక్షించింది. Windows ఓవర్‌లేకు కంటెంట్ ప్రొటెక్షన్ నిర్ధారించబడింది. లీగల్ సైన్-ఆఫ్ వరకు ఆటో-డిలీట్ ఆఫ్‌లో ఉంటుంది.",
    keyDecisions: [
      "Keep exclude-from-capture enabled by default on desktop",
      "Require Admin role for retention cleanup jobs",
      "Ship audit export CSV in next sprint",
    ],
    risks: [
      {
        type: "risk",
        text: "Some meeting apps may still capture overlay on unsupported OS builds.",
      },
      {
        type: "question",
        text: "Do we need DPA language updates for EU customers this quarter?",
      },
    ],
    actionItems: [
      {
        id: "m2-ai1",
        title: "Document capture exclusion OS matrix",
        owner: "Jordan Blake",
        due: "Aug 11",
        status: "open",
      },
      {
        id: "m2-ai2",
        title: "Draft audit export schema",
        owner: "Alex Chen",
        due: "Aug 13",
        status: "open",
      },
    ],
    transcript: [
      {
        id: "m2-t1",
        speaker: "Elena Rossi",
        role: "CISO",
        text: "Confirm the overlay is excluded from Teams screen share on Windows 11.",
        textHi: "पुष्टि करें कि Windows 11 पर Teams स्क्रीन शेयर से ओवरले बाहर रखा गया है।",
        textTe: "Windows 11లో Teams స్క్రీన్ షేర్ నుండి ఓవర్‌లే మినహాయించబడిందని నిర్ధారించండి.",
        time: "00:01:08",
        confidence: 0.97,
      },
      {
        id: "m2-t2",
        speaker: "Alex Chen",
        role: "You",
        text: "We use setContentProtection. Applied status is surfaced in the companion capture indicator.",
        textHi: "हम setContentProtection उपयोग करते हैं। लागू स्थिति companion कैप्चर इंडिकेटर में दिखती है।",
        textTe: "మేము setContentProtection ఉపయోగిస్తాము. వర్తింపు స్థితి companion క్యాప్చర్ ఇండికేటర్‌లో కనిపిస్తుంది.",
        time: "00:01:32",
        confidence: 0.95,
      },
      {
        id: "m2-t3",
        speaker: "Jordan Blake",
        role: "Sec",
        text: "Retention cleanup must stay disabled until legal approves auto-delete.",
        textHi: "लीगल ऑटो-डिलीट मंज़ूर करे तब तक रिटेंशन क्लीनअप बंद रहना चाहिए।",
        textTe: "లీగల్ ఆటో-డిలీట్ ఆమోదించే వరకు రిటెన్షన్ క్లీనప్ ఆఫ్‌లో ఉండాలి.",
        time: "00:02:04",
        confidence: 0.96,
      },
    ],
    aiAnswers: [
      {
        id: "m2-a1",
        question: "Is overlay capture exclusion reliable?",
        questionHi: "क्या ओवरले कैप्चर एक्सक्लूजन भरोसेमंद है?",
        questionTe: "ఓవర్‌లే క్యాప్చర్ ఎక్స్‌క్లూజన్ నమ్మదగినదా?",
        answer:
          "On supported Windows builds, setContentProtection excludes the window from common capture pipelines. Always verify the companion capture status indicator before sharing.",
        answerHi:
          "समर्थित Windows बिल्ड पर setContentProtection सामान्य कैप्चर पाइपलाइन से विंडो को बाहर रखता है। शेयर करने से पहले companion कैप्चर स्टेटस इंडिकेटर जांचें।",
        answerTe:
          "మద్దతు ఉన్న Windows బిల్డ్‌లలో setContentProtection సాధారణ క్యాప్చర్ పైప్‌లైన్ల నుండి విండోను మినహాయిస్తుంది. షేర్ చేసే ముందు companion క్యాప్చర్ స్టేటస్ ఇండికేటర్‌ను ధృవీకరించండి.",
        pinned: true,
      },
    ],
    emailSubject: "Notes from Enterprise Security Review",
    emailBody:
      "Hi team — Security confirmed capture exclusion defaults and asked us to keep retention cleanup disabled pending legal. Audit export CSV is next. Ping if you need the OS matrix draft.",
  },
  {
    id: "m3",
    title: "Customer Success Weekly",
    time: "Yesterday",
    duration: "55m",
    attendees: 12,
    status: "summary",
    tags: ["CS"],
    generatedIn: "22s",
    executiveSummary:
      "CS reviewed renewal health for Northstar and Lumen. Three expansion opportunities were prioritized. Companion onboarding friction remains the top churn risk for mid-market accounts.",
    executiveSummaryHi:
      "CS ने Northstar और Lumen की रिन्यूअल हेल्थ की समीक्षा की। तीन विस्तार अवसर प्राथमिकता में रखे गए। मिड-मार्केट खातों के लिए Companion ऑनबोर्डिंग घर्षण मुख्य churn जोखिम है।",
    executiveSummaryTe:
      "CS Northstar మరియు Lumen రిన్యూవల్ హెల్త్‌ను సమీక్షించింది. మూడు విస్తరణ అవకాశాలకు ప్రాధాన్యత ఇవ్వబడింది. మిడ్-మార్కెట్ ఖాతాలకు Companion ఆన్‌బోర్డింగ్ ఘర్షణ ప్రధాన churn ప్రమాదం.",
    keyDecisions: [
      "Prioritize Northstar enterprise seat expansion",
      "Ship companion first-run checklist in help center",
      "Schedule Lumen QBR for next Thursday",
    ],
    risks: [
      {
        type: "risk",
        text: "Two accounts reported companion hotkey conflicts with CAD tools.",
      },
      {
        type: "question",
        text: "Can we offer a guided overlay tour for new seats?",
      },
    ],
    actionItems: [
      {
        id: "m3-ai1",
        title: "Publish companion first-run checklist",
        owner: "Sarah Kim",
        due: "Aug 9",
        status: "open",
      },
      {
        id: "m3-ai2",
        title: "Book Lumen QBR",
        owner: "James Okonkwo",
        due: "Aug 8",
        status: "done",
      },
    ],
    transcript: [
      {
        id: "m3-t1",
        speaker: "Sarah Kim",
        role: "CS",
        text: "Northstar wants twenty more Pro seats if Companion onboarding drops under ten minutes.",
        textHi: "अगर Companion ऑनबोर्डिंग दस मिनट से कम हो तो Northstar बीस और Pro सीटें चाहता है।",
        textTe: "Companion ఆన్‌బోర్డింగ్ పది నిమిషాల్లోపు అయితే Northstar ఇంకా ఇరవై Pro సీట్లు కోరుతోంది.",
        time: "00:04:10",
        confidence: 0.95,
      },
      {
        id: "m3-t2",
        speaker: "James Okonkwo",
        role: "Ops",
        text: "Hotkey conflicts with CAD tools came up twice this week — we should document remapping.",
        textHi: "इस हफ्ते CAD टूल्स के साथ हॉटकी संघर्ष दो बार आया — रीमैपिंग दस्तावेज़ित करनी चाहिए।",
        textTe: "ఈ వారం CAD టూల్స్‌తో హాట్‌కీ సంఘర్షణ రెండుసార్లు వచ్చింది — రీమ్యాపింగ్ డాక్యుమెంట్ చేయాలి.",
        time: "00:05:02",
        confidence: 0.93,
      },
      {
        id: "m3-t3",
        speaker: "Alex Chen",
        role: "You",
        text: "I can add a first-run overlay tour and a remappable hotkey note to the help center.",
        textHi: "मैं हेल्प सेंटर में फर्स्ट-रन ओवरले टूर और रीमैपेबल हॉटकी नोट जोड़ सकता हूँ।",
        textTe: "నేను హెల్ప్ సెంటర్‌కు ఫస్ట్-రన్ ఓవర్‌లే టూర్ మరియు రీమ్యాపబుల్ హాట్‌కీ నోట్ జోడించగలను.",
        time: "00:05:41",
        confidence: 0.97,
      },
    ],
    aiAnswers: [
      {
        id: "m3-a1",
        question: "Top churn risk for mid-market?",
        questionHi: "मिड-मार्केट के लिए मुख्य churn जोखिम?",
        questionTe: "మిడ్-మార్కెట్‌కు ప్రధాన churn ప్రమాదం?",
        answer:
          "Companion onboarding friction. Ship a first-run checklist and remappable hotkey guidance to keep time-to-value under ten minutes.",
        answerHi:
          "Companion ऑनबोर्डिंग घर्षण। टाइम-टू-वैल्यू दस मिनट से कम रखने के लिए फर्स्ट-रन चेकलिस्ट और रीमैपेबल हॉटकी मार्गदर्शन शिप करें।",
        answerTe:
          "Companion ఆన్‌బోర్డింగ్ ఘర్షణ. టైమ్-టు-వాల్యూ పది నిమిషాల్లోపు ఉంచేందుకు ఫస్ట్-రన్ చెక్‌లిస్ట్ మరియు రీమ్యాపబుల్ హాట్‌కీ మార్గదర్శకత్వం షిప్ చేయండి.",
        pinned: true,
      },
    ],
    emailSubject: "Notes from Customer Success Weekly",
    emailBody:
      "Hi team — CS prioritized Northstar expansion and Lumen QBR. Companion first-run checklist is the unblocker for mid-market churn. Hotkey remapping docs requested.",
  },
  {
    id: "m4",
    title: "Design Critique — CueAI Companion",
    time: "Mon",
    duration: "36m",
    attendees: 6,
    status: "summary",
    tags: ["Design"],
    generatedIn: "15s",
    executiveSummary:
      "Design locked the companion glass treatment and resize handles. Minimum size stays 400×420. Expand/restore presets were approved. Avoid card clutter in the overlay chrome.",
    executiveSummaryHi:
      "डिज़ाइन ने companion ग्लास ट्रीटमेंट और रीसाइज़ हैंडल लॉक किए। न्यूनतम आकार 400×420 रहेगा। Expand/restore प्रीसेट स्वीकृत। ओवरले क्रोम में कार्ड क्लटर से बचें।",
    executiveSummaryTe:
      "డిజైన్ companion గ్లాస్ ట్రీట్‌మెంట్ మరియు రీసైజ్ హ్యాండిల్స్ లాక్ చేసింది. కనిష్ట పరిమాణం 400×420గా ఉంటుంది. Expand/restore ప్రీసెట్‌లు ఆమోదించబడ్డాయి. ఓవర్‌లే క్రోమ్‌లో కార్డ్ క్లటర్ నివారించండి.",
    keyDecisions: [
      "Keep transparent glass panel with teal accent",
      "Enforce 400×420 minimum bounds",
      "Ship corner + edge resize handles in this release",
    ],
    risks: [
      {
        type: "risk",
        text: "Small laptop viewports may clip the expanded 720×760 preset.",
      },
      {
        type: "question",
        text: "Should presenter mode dock left or right by default?",
      },
    ],
    actionItems: [
      {
        id: "m4-ai1",
        title: "Polish resize hit targets",
        owner: "Design",
        due: "Aug 10",
        status: "open",
      },
      {
        id: "m4-ai2",
        title: "Validate expand preset on 1366×768",
        owner: "Alex Chen",
        due: "Aug 9",
        status: "open",
      },
    ],
    transcript: [
      {
        id: "m4-t1",
        speaker: "Maya Ortiz",
        role: "Design",
        text: "The overlay must never shrink below four hundred by four twenty.",
        textHi: "ओवरले कभी भी चार सौ गुणा चार सौ बीस से छोटा नहीं होना चाहिए।",
        textTe: "ఓవర్‌లే ఎప్పుడూ నాలుగు వందల × నాలుగు వందల ఇరవై కంటే చిన్నది కాకూడదు.",
        time: "00:06:18",
        confidence: 0.98,
      },
      {
        id: "m4-t2",
        speaker: "Alex Chen",
        role: "You",
        text: "Agreed — we clamp bounds in the native companion window manager.",
        textHi: "सहमत — हम नेटिव companion विंडो मैनेजर में बाउंड क्लैंप करते हैं।",
        textTe: "అంగీకారం — నేటివ్ companion విండో మేనేజర్‌లో బౌండ్స్ క్లాంప్ చేస్తాము.",
        time: "00:06:40",
        confidence: 0.96,
      },
      {
        id: "m4-t3",
        speaker: "Maya Ortiz",
        role: "Design",
        text: "Expand should jump to seven twenty by seven sixty, then restore prior size.",
        textHi: "Expand को सात सौ बीस गुणा सात सौ साठ पर जाना चाहिए, फिर पिछला आकार बहाल करें।",
        textTe: "Expand ఏడు వందల ఇరవై × ఏడు వందల అరవైకి వెళ్లాలి, తర్వాత మునుపటి పరిమాణం పునరుద్ధరించాలి.",
        time: "00:07:05",
        confidence: 0.94,
      },
    ],
    aiAnswers: [
      {
        id: "m4-a1",
        question: "Minimum companion size?",
        questionHi: "न्यूनतम companion आकार?",
        questionTe: "కనిష్ట companion పరిమాణం?",
        answer: "400×420 is the enforced minimum. Expanded preset is 720×760 with restore to prior bounds.",
        answerHi: "लागू न्यूनतम आकार 400×420 है। Expanded प्रीसेट 720×760 है और पिछले बाउंड पर restore होता है।",
        answerTe: "అమలయ్యే కనిష్ట పరిమాణం 400×420. Expanded ప్రీసెట్ 720×760 మరియు మునుపటి బౌండ్స్‌కు restore అవుతుంది.",
        pinned: true,
      },
    ],
    emailSubject: "Notes from Design Critique — CueAI Companion",
    emailBody:
      "Hi team — Design locked glass treatment, min size 400×420, and expand/restore presets. Please validate on 1366×768 before release.",
  },
];

const byId = new Map(MEETINGS.map((m) => [m.id, m]));

export function listMeetings(): MeetingListItem[] {
  return MEETINGS.map(({ id, title, time, duration, attendees, status, tags }) => ({
    id,
    title,
    time,
    duration,
    attendees,
    status,
    tags,
  }));
}

export function getMeetingById(id: string): MeetingRecord | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function meetingExists(id: string): boolean {
  return byId.has(id);
}

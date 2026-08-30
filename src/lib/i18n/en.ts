/**
 * English dictionary — the source-of-truth shape for all locales (`type Dictionary = typeof en`).
 * Strings marked `// tentative` are `(tentative — PM-confirm)` in acceptance.md: the literal is
 * asserted today and flips in place if the PM changes it. AC ids noted where a string is asserted.
 */
export const en = {
  common: {
    next: "Next",
    back: "Back",
    cancel: "Cancel",
    confirm: "Confirm",
    edit: "Edit",
    approve: "Approve",
    change: "Change",
    remove: "Remove",
    add: "Add",
    save: "Save",
    done: "Done",
    close: "Close",
    retry: "Retry",
    optional: "optional",
    required: "required",
    missing: "missing",
    byAgent: "Filled by your AI assistant",
    agentTag: "AI",
    yes: "Yes",
    no: "No",
    me: "Me",
    supplier: "Supplier",
    sar: "SAR",
  },
  nav: {
    project: "Project",
    equipment: "Equipment",
    preferences: "Preferences",
    preview: "Preview",
  },
  shell: {
    home: "Home",
    profile: "Profile",
    requests: "Requests",
    compare: "Compare bids",
    dashboard: "Dashboard",
    browse: "Browse",
    surveys: "Surveys",
    inbox: "Inbox",
    request: "Request",
    account: "Account",
    // The phone menu button, which opens the nav sheet — the three places the centred row holds
    // on a wider bar.
    menu: "Menu",
    // The language switch names its DESTINATION, not its state — the control is a two-way choice.
    switchLang: "Switch to Arabic",
    // The account menu's entry to . The route and its content are unchanged; «Settings» is
    // what a reader looks for beside Sign out, and it keeps the header to four tabs.
    settings: "Settings",
    signIn: "Sign in",
    welcome: "Welcome",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    tierGuest: "Guest",
    tierBasic: "Basic rentee",
    tierVerified: "Verified",
    verifyNudge: "Verify",
    stepsGuest: "1 of 3 steps · complete your profile to unlock requests.",
    stepsBasic: "2 of 3 steps · verify your company to unlock unlimited requests.",
    verifiedNote: "Your company is verified.",
    notifications: "Notifications",
    company: "My Organization",
    // Short forms for the mobile bottom bar, which splits its width evenly across the tabs —
    // the full labels truncate to stubs there ("Compare bids" already did before Company existed).
    companyShort: "Company",
    compareShort: "Compare",
    dashboardShort: "Board",
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all read",
    all: "All",
    unread: "Unread",
    today: "Today",
    yesterday: "Yesterday",
    earlier: "Earlier",
    empty: "You're all caught up.",
    emptyUnread: "No unread notifications.",
    loadError: "Couldn't load notifications.",
    justNow: "Just now",
  },
  home: {
    title: "Home",
    statSuppliers: "Verified Suppliers",
    statEquipment: "Equipment Listed",
    statCities: "Cities Covered",
    createRequest: "Create request",
    // ── The CTA band (owner's comp, "Moedatech Create Request CTA", 2026-08-29) ─────────────
    // The headline names the ACT, not the marketplace: the renter is not here to admire a platform,
    // he is here to get a machine. «AI» is its own token so it can carry the brand's ink — the comp
    // colours that one word and nothing else on the band.
    ctaTitleBefore: "Let ",
    ctaTitleAi: "our AI assistant",
    ctaTitleAfter: " find your next equipment",
    ctaSubtitle: "Describe what you need in plain words. Our AI assistant matches you with the right suppliers.",
    uploadRfq: "Upload RFQ",
    suppliersTitle: "Suggested Suppliers",
    viewAll: "View all",
    showLess: "Show less",
    // ── The dashboard's requests block (owner, 2026-08-29) ──────────────────────────────────────
    // The column says how long suppliers can still ANSWER, not what the backend calls the row: the
    // renter is deciding whether to chase, extend or award, and a status word answers none of that.
    reqSummary: "{n} open · {bids} new bids",
    reqMoreItems: "+{n} more",
    reqDaysLeft: "{n} days left",
    reqOneDayLeft: "1 day left",
    reqToday: "Closes today",
    reqExpired: "Expired",
    // «Closed» is the STATUS speaking, and it outranks both dates: a request the backend has shut
    // takes no more bids whatever its deadline said, so a countdown beside it would be a lie the
    // renter acts on. Only when the row is still live do the two deadline sources get a say.
    reqClosed: "Closed",
    // The row's own actions, as the prototype carries them — share the bid link, edit the request,
    // cancel it. Titles only: the icons are the control, and three labelled buttons on a dense row
    // would be wider than the request they act on.
    reqShare: "Share for bids",
    reqEdit: "Edit request",
    reqCancel: "Cancel request",
    reqOpenDetails: "Open request details",
    // The rail shows the newest five; the rest are one scroll away, and the strip says so rather
    // than letting a cut-off row be the only hint that there are more.
    moreBidsBelow: "{n} more",
    /** The toggle back, on both cards once they are open. */
    showFewer: "Show fewer",
    // The table's own foot, mirroring the rail's. The header says «20 open» over five rows, and
    // without this the reader's only reading of that gap is that the list is broken.
    moreRequests: "{n} more requests",
    compareBids: "Compare bids",
    colSite: "Site",
    colEquipment: "Equipment",
    colBids: "Bids",
    colCloses: "Closes",
    newBidsCount: "{n} new bids",
    noBidsYet: "No bids yet.",
    nudgeGuestTitle: "Complete your profile",
    nudgeGuestBody: "Add your details to unlock requests and bids.",
    nudgeGuestCta: "Complete profile",
    nudgeBasicTitle: "Get verified",
    nudgeBasicBody: "Verify your company to become a trusted renter.",
    nudgeBasicCta: "Get verified",
    verifiedTitle: "You're verified",
    verifiedBody: "Your company is verified.",
    yourRequests: "My Requests",
    priceBids: "Price Bids",
    completedDeals: "Completed Deals",
    soon: "Coming soon",
    reqSub: "Equipment requests you've posted",
    bidsSub: "Supplier offers on your requests",
    dealsSub: "Your closed & fulfilled orders",
    reqStat: "Open requests",
    bidsStat: "Total bids received",
    dealsStat: "No deals yet",
  },
  browse: {
    title: "Verified Suppliers",
    signInTitle: "Sign in to browse suppliers",
    signInBody: "Browsing suppliers and their equipment needs an account. Sign in — it only takes a moment.",
    search: "Search stores or equipment",
    city: "City",
    category: "Category",
    subcategory: "Subcategory",
    measurement: "Measurement",
    verifiedOnly: "Verified only",
    anyCity: "All cities",
    anyCategory: "All categories",
    anySubcategory: "All subcategories",
    anyMeasurement: "All measurements",
    pickCategoryFirst: "Select a category first",
    pickSubcategoryFirst: "Select a subcategory first",
    newLabel: "New",
    equipmentCount: "equipment",
    empty: "No suppliers match your filters.",
    error: "We couldn't load suppliers.",
    retry: "Retry",
    loading: "Loading…",
  },
  store: {
    back: "Back",
    share: "Share",
    verified: "Verified",
    newLabel: "New",
    equipment: "Equipment",
    views: "views",
    documents: "Store Documents",
    docCR: "Commercial Registration",
    docVAT: "VAT",
    docNationalAddress: "National Address",
    statusVerified: "Verified",
    statusPending: "Pending",
    operators: "Operators",
    comingSoon: "Coming soon",
    priceOnRequest: "Price on request",
    perDay: "/ day",
    perWeek: "/ week",
    perMonth: "/ month",
    perJob: "/ job",
    noEquipment: "No equipment listed yet.",
    error: "We couldn't load this store.",
    retry: "Retry",
    loading: "Loading…",
    requestThis: "Request this equipment",
    specManufacturer: "Manufacturer",
    specModel: "Model",
    specYear: "Year",
    specFuel: "Fuel",
    specPrice: "Price",
    specLocation: "Location",
    specHours: "Operating hours",
    photos: "Photos",
    docsShort: "Documents",
    close: "Close",
  },
  intake: {
    reading: "Reading",
    heading: "How would you like to create your request?",
    subheading: "Describe your request, or upload an existing RFQ document. If it belongs to a project, its defaults fill themselves in.",
    optUploadTitle: "Write / Upload RFQ",
    optUploadDesc: "Write your request or upload a file — your AI assistant fills the form automatically.",
    recommended: "Recommended",
    optManualTitle: "Fill Manually",
    optManualDesc: "Enter equipment details step by step using a guided form.",
    comingSoon: "Coming soon",
    orUploadBelow: "Or upload a file below",
    attachDivider: "or attach a file",
    dropSub: "Add as many files as you like — we'll read them all",
    tabRfq: "RFQ", // AC-01 tentative
    tabManual: "Manual", // AC-01 tentative
    tabLater: "LATER",
    manualNote: "Manual entry is coming in a later release.",
    pasteLabel: "Describe your request",
    // Each example is BOTH the sentence the placeholder types itself through and, shortened, a chip
    // under the box that writes it in for real. Short on purpose: a placeholder that runs to two
    // lines reads as content rather than as an invitation.
    examples: [
      { chip: "30 forklifts to Site B, 3 weeks", text: "I want 30 forklifts delivered to Site B by Friday, for 3 weeks" },
      { chip: "Crane rental in Riyadh", text: "I need a 20-ton crane rental in Riyadh for 2 weeks" },
      { chip: "Mixers with operators", text: "Looking for 5 concrete mixers with operators included" },
      { chip: "Excavators with diesel included", text: "3 excavators, diesel included, starting next Sunday" },
    ],
    uploadRfq: "Upload RFQ",
    addSomething: "Add a description or a file",
    continueLabel: "Continue",
    pastePlaceholder: "Write your request in plain words — e.g. “I need a 30-ton forklift at King Khalid Airport, Riyadh, for 3 weeks starting next Sunday, with an operator and diesel included, delivered to site.”\n\nYou can also paste an email, or an equipment list.",
    uploadLabel: "Attach files too",
    uploadOptional: "optional — add as many as you like",
    dropTitle: "Drop files here, or",
    uploadHint: "PDF, image, Word or Excel",
    acceptedTypes: "Accepted file types: PDF, image, Word, Excel.", // AC-07 tentative
    fileRejected: "Only PDF, image, Word, or Excel files can be processed.", // AC-07 tentative
    startProcessing: "Continue",
    attachedFiles: "Attached files",
    emptyHint: "Paste text or attach at least one file to continue.",
    yourRequest: "Your request",
    backToReview: "Back to review",
    reAnalyze: "Re-analyze",
    editReparseNote: "Editing your request re-runs the AI and refreshes your items.",
  },
  draftPrompt: {
    title: "Continue your request?",
    body: "You have a request in progress. Continue where you left off, or start over.",
    continue: "Continue draft",
    startOver: "Start over",
    restartTitle: "Start over?",
    restartConfirm: "This clears your current request and starts a new one.",
  },
  processing: {
    title: "Reading your RFQ…",
    note: "Project details and items will appear as they're parsed.",
    sub: "This usually takes a few seconds — hang tight.",
    stage1: "Reading your document/text",
    stage2: "Extracting your project details",
    stage3: "Matching your equipment to what we provide",
    stage4: "Preparing your request",
    // AC-56 e.g. "24 items found · 3 need a quick check · 2 not available"
    summaryItems: "{count} items found",
    summaryNeedCheck: "{count} need a quick check",
    summaryNotAvailable: "{count} not available",
    // The live feed. The first two lines are said while the request is still in flight, so they
    // report what was SENT rather than what was found; everything after names real extracted items.
    agentWorking: "AGENT WORKING",
    liveActivity: "LIVE ACTIVITY",
    feedReading: "Reading your document/text…",
    feedRead: "Found readable text — {n} request block",
    feedExtracted: "Extracted site, duration and quantities",
    feedChecking: "Checking: {item}",
    feedMatched: "{item} → matched to {match}",
    feedAllMatched: "All equipment matched — preparing your request",
    stageScan: "Scan",
    stageExtract: "Extract",
    stageMatch: "Match",
    stageAnalyze: "Analyze",
  },
  step1: {
    title: "Project details",
    subtitle: "We read these from your RFQ — they apply to your whole request, across all items.",
    location: {
      confirmPrompt: "Is this the right site? Please confirm it before you continue.",
      fillPrompt: "Add the project location before you can confirm.", // AC-16: can't confirm an empty location
      card: "Location",
      unconfirmed: "Location not confirmed",
      confirmed: "Location confirmed",
      changeHint: "Search above to change", // AC-16: editing the location re-requires confirm
      confirmAction: "Confirm location", // AC-16 tentative
      setViaMap: "Set on map",
      useGps: "Use my current location",
      setManual: "Drop a pin manually",
      extractedFrom: "From your RFQ",
      conflictTitle: "Two different locations were found — pick one:",
      fromText: "From text", // AC-47 tentative
      fromFile: "From file", // AC-47 tentative
      multiLocationTitle: "This request covers a single location.", // AC-48
      multiLocationBody: "The other location(s) we found need a separate request.",
      startSeparateRequest: "Start a separate request", // AC-48: opens a fresh request in a new tab
      mapPicker: {
        searchPlaceholder: "Search a place, or paste a Maps link / coordinates",
        search: "Search",
        useMyLocation: "Use my location",
        pinnedNoAddress: "Pinned location (no address found)",
        locating: "Locating address…",
      },
    },
    timing: {
      card: "Timing & Hours",
      rentalBasis: "Rental basis",
      extendable: "Extendable",
      extendableHint: "Can run beyond the chosen period.",
      quoteNote: "You'll be quoted according to this frequency.", // AC-13 tentative
      startDate: "Start date",
      endDate: "End date",
      hoursPerDay: "Hours per day",
    },
    advanced: {
      card: "Advanced",
      collapsedEmpty: "No advanced settings set",
      workingDays: "Working days per week",
      overtime: "Overtime rate",
      equipmentYear: "Minimum equipment year",
    },
    certificates: {
      card: "Certificates",
      safety: "Safety",
      otherSafetyPlaceholder: "Name the certificate (optional)",
      other: "Other certificates",
    },
    requestWide: {
      delivery: "Delivery to site",
      return: "Return from site",
      fuelResponsibility: "Fuel responsibility",
    },
  },
  step2: {
    title: "Your equipment",
    subtitle: "Each line from your RFQ is matched to available equipment. Answer the quick questions, then continue. Nothing is sent until you review it.",
    fromRfq: "From your RFQ",
    matchedTo: "Matched to",
    settingsForAll: "Settings for all equipment",
    settingsForAllHint: "Defaults for every item below — open any item to change it for that item only.",
    appliesToItems: "Applies to {count} items",
    certificatesTitle: "Required certificates",
    itemSettings: "Operator, fuel & delivery",
    filterAll: "All items",
    filterNeedsOk: "Needs your OK",
    filterMatched: "Matched",
    filterNotAvailable: "Not available",
    triageTip: "Confirm each match. Once an item is matched, open Edit to set operator, fuel and other details.",
    approveAll: "Approve all",
    groupEmpty: "Nothing here.",
    status: {
      matched: "Matched", // AC-54 / AC-30
      needsOk: "Needs your OK", // AC-54
      notAvailable: "Not available", // AC-54 / AC-30 tentative
    },
    confidentReady: "Ready — no action needed.",
    needsValidationPrompt: "We matched this — approve it or change it.",
    nearestSuggested: "Nearest available size: {measurement}.", // AC-19
    pickSizeToApprove: "Pick a size to approve.", // AC-18/19: why Approve is disabled
    unitConversion: "{fromValue}{fromUnit} ≈ {toValue}{toUnit} in our sizes.", // AC-20
    editTaxonomy: "Edit match",
    category: "Category",
    subcategory: "Subcategory",
    measurement: "Size",
    pickCategory: "Select category",
    pickSubcategory: "Select subcategory",
    pickMeasurement: "Select size",
    addItem: "Add item",
    removeConfirm: "Remove this item from the request?",
    noMatch: {
      provide: "Provide it for me?", // AC-30/31 tentative
      // Both explainers state the outcome up front: a no-match item never goes out to suppliers
      // (AC-33), whether or not the renter messages us — so the row shouldn't imply otherwise.
      explainer: "We couldn't find this in our catalogue — it won't be included in this request.",
      // Shown when the equipment IS in the catalogue but the requested SIZE isn't yet (a genuine new size).
      newSizeExplainer: "We carry this equipment, but not this size yet — message us to add it. It won't be included in this request.",
      // AC-31: prefilled WhatsApp message to Moedatech support requesting the equipment be sourced.
      whatsappMessage: 'Hi Moedatech, I\'m creating an RFQ and need equipment that isn\'t available in the app: "{item}". Please add/source it for me so it is added to my request. Thank you!',
      // New-size variant: equipment exists, the size doesn't — ask support to add the size.
      whatsappMessageSize: 'Hi Moedatech, I\'m creating an RFQ for "{item}" but the size I need isn\'t in the app yet. Please add this size so it can be added to my request. Thank you!',
      // AC-31: shown in place of the action once the renter has been handed off to WhatsApp — the item
      // stays put so returning from WhatsApp doesn't look like it was dropped.
      requested: "We got your message — we'll add this and contact you on WhatsApp.",
    },
    perItem: {
      quantity: "Quantity",
      operatorNeeded: "Operator needed",
      nightShift: "Night shift",
      nationality: "Nationality",
      nationalityRestricted: "Restricted",
      nationalityAny: "Any",
      applyToAll: "Apply these settings to all items",
      certificate: "Operator certificate",
      fat: "F.A.T (Food, Accommodation & Transport)",
      fatFood: "F.A.T — Food",
      fatTransport: "F.A.T — Accommodation & transport",
      workType: "Work type",
      workTypePlaceholder: "e.g. lifting steel beams, tower assembly",
      equipmentYear: "Minimum equipment year",
      equipmentYearHint: "Leave on “Any” to use the request-wide year",
      attachments: "Attachments",
      attachmentsHint: "Accessories needed with this equipment (optional)",
      customAttachmentPlaceholder: "Add another (e.g. breaker, auger)",
      addAttachment: "Add",
      nationalityCustom: "Which nationalities?",
      nationalityCustomPlaceholder: "e.g. Saudi, Egyptian, Filipino",
      certificateOther: "Other certificate",
      certificateOtherPlaceholder: "Name the required certificate",
      fuelType: "Fuel type",
      additionalNotes: "Additional notes",
      deliveryOverride: "Delivery (override)",
      returnOverride: "Return (override)",
      fuelRespOverride: "Fuel responsibility (override)",
      editableOnceMatched: "Confirm the match to edit item details.",
      useRequestDefault: "Use request default",
    },
    blockedNote: "Resolve the flagged items before continuing.", // AC-29
  },
  step3: {
    title: "Preferences",
    subtitle: "These apply to the whole request. Filled in from your RFQ — edit anything.",
    coreTerms: "Core terms", // AC-35 tentative
    optionalExtras: "Optional Extras", // AC-35 tentative
    payment: { title: "Payment", terms: "Payment terms", method: "Payment method" },
    maintenance: {
      title: "Maintenance",
      responsibility: "Responsibility",
      sla: "Response SLA",
    },
    additionalNotes: "Additional notes",
    budget: { title: "Budget", label: "Budget ceiling", hint: "Entered in SAR." },
    supplierFilters: {
      title: "Supplier filters",
      verifiedOnly: "Verified suppliers only",
      subletting: "Allow subletting / crosshire",
      bidWindow: "Offer / bid window",
    },
  },
  preview: {
    title: "Review and send",
    subtitle: "Here's your full request. Send it once and every supplier can bid — you'll get one quotation covering all items.",
    shareTeaserTitle: "Invite suppliers you already know",
    shareTeaserBody: "Once you send this, you'll get a shareable link to invite suppliers to bid — even ones off Moedatech. Their bids land right here for you to compare.",
    post: "Post request",
    send: "Send request",
    edit: "Edit",
    confirmed: "confirmed",
    notSent: "{count} not available — left off this request.",
    export: "Open in Excel", // AC-52
    itemsTable: "All items",
    projectSummary: "Project",
    equipmentSummary: "Equipment",
    preferencesSummary: "Preferences",
    whyTitle: "What I assumed — please confirm",
    perItem: "Per item",
    table: {
      equipment: "Equipment",
      category: "Category",
      size: "Size",
      qty: "Qty",
      year: "Year",
      operator: "Operator",
      operatorCert: "Operator cert",
      food: "Food (F.A.T)",
      transport: "Accom. & transport",
      fuel: "Fuel",
      fuelResp: "Fuel resp.",
      delivery: "Delivery",
      return: "Return",
      certificate: "Safety cert",
      notes: "Notes",
    },
  },
  confirmation: {
    title: "Your request is sent",
    message: "Suppliers can now see it and send bids. You'll get one quotation covering all the items in your request.",
    newRequest: "New request",
    done: "Done",
    laterNote: "Tracking bids and managing this request on the web is coming soon — for now you'll continue with bids in the Moedatech app as usual.",
    itemsSummary: "{count} items",
  },
  /**
   * mobile/016 — the "Start Your Request" first-request pop-up and the trial-mode surfaces it leads to.
   * Copy is kept identical to the app's l10n keys (trialStartYourRequestTitle, trialRequestCardTitle, …)
   * so a renter sees the same words on web and mobile.
   */
  startRequest: {
    title: "Start Your Request",
    trialTitle: "Trial Request",
    trialBody: "Try the request flow with sample bids — nothing is sent to suppliers.",
    realTitle: "Real Request",
    realBody: "Send your request to real suppliers and get live bids.",
    cancel: "CANCEL AND RETURN",
    close: "Close",
    /** Ribbon above the RFQ flow while trial mode is on. */
    modeBanner: "Trial run — nothing will be sent to suppliers.",
    modeBannerSwitch: "Switch to a real request",
    /** Shown with the sample bids on a trial request. */
    bidsBanner: "These are sample bids for your trial — no real suppliers were contacted.",
    trialBadge: "TRIAL",
    disappearsSoon: "TRIAL - DISAPPEARS SOON",
  },
  /**
   * Multi-company membership (docs/plans/company-shared-visibility.md). Copy is character-identical
   * to the app's `company*` arb keys so the two surfaces read the same — the consent and close-down
   * wording in particular is load-bearing (both describe irreversible transfers).
   */
  company: {
    myCompany: "My Company",
    myCompanySubtitle: "Join a company or manage your team",
    details: "Details",
    share: "Share",
    // No company yet → join by code.
    joinTitle: "Join a company",
    noCompany: "You're not part of a company yet. Enter an invite code from a company owner to join.",
    enterCode: "Invite code",
    joinButton: "Join",
    joinRequestSent: "Join request sent — waiting for the owner to approve.",
    invalidCode: "That invite code isn't valid.",
    joinConsent:
      "Equipment, requests and bids you add — including ones you already have — become this company's and stay with it if you later leave. Continue?",
    // Pending membership.
    pendingApproval: "Waiting for the owner to approve you.",
    pendingBadge: "Awaiting approval",
    pendingHint: "We'll notify you as soon as the owner approves your request.",
    // Escape hatch from a valid-but-wrong invite code: the pending row otherwise blocks
    // joining anywhere else until an owner happens to reject you.
    cancelJoin: "Withdraw request",
    cancelJoinConfirm:
      "Withdraw your request to join this company? Nothing has been shared yet, so nothing is lost — and you'll be able to enter a different invite code straight away.",
    cancelJoinDone: "Join request withdrawn.",
    // Owner: invite code + join requests.
    // The heading over the whole team card — the code, the roster and the way out under one word.
    team: "Team",
    // The invite panel names itself INSIDE that card, so it says what the code is rather than
    // repeating the card it sits in.
    inviteCode: "Invite code",
    inviteTeam: "Invite your team",
    inviteHint: "Share this code with your team so they can join.",
    inviteCodeCopied: "Invite code copied",
    inviteShareMessage: "Join my company on Moedatech with this invite code:",
    inviteDownload: "Download the Moedatech app:",
    // The other route to having a company: verify and one is created for you (app parity —
    // companyCreateOwn* keys). Offered ABOVE the join form, as in the app.
    createOwnTitle: "Add your own company",
    createOwnDesc:
      "Verify to create your own company and unlock full access — or join an existing company with an invite code below.",
    createOwnCta: "Create your company",
    pendingJoiners: "Pending join requests",
    approve: "Approve",
    remove: "Remove",
    // Roster.
    members: "Members",
    roleOwner: "Owner",
    roleMember: "Member",
    you: "You",
    verified: "Verified",
    promote: "Make owner",
    demote: "Remove owner role",
    promoteConfirm:
      "Make {name} an owner? They'll get full control of the company, including the invite code and member management.",
    demoteConfirm: "Remove {name}'s owner role? They'll stay a member.",
    // Exits.
    leave: "Leave company",
    leaveConfirm:
      "Leave your company? You'll lose your access to the firm's requests, bids and equipment — including ones you created or brought in. This can't be undone without a new invite.",
    promoteFirst: "You're the owner. Promote another member to owner before you leave.",
    dissolve: "Close company",
    dissolveConfirm:
      "You're the only member, so leaving closes this company for good.\n\nNothing is lost: your equipment, requests, bids and past deals move back to your personal account and stay yours. But this can't be undone — the invite code stops working and the company's CR and VAT verification is retired, so you'd need to verify a new company to come back.\n\nAny deal rooms still in progress will be closed automatically and the other party notified.",
    // Shared UI.
    cancel: "Cancel",
    retry: "Retry",
    loadError: "Couldn't load your company. Please try again.",
    signInTitle: "Sign in to manage your company",
    signInBody: "Join a company with an invite code, or manage your team, once you sign in.",
  },
  guest: {
    blockTitle: "Create an account to continue", // AC-02
    blockBody: "RFQ creation is available to registered renters. Create an account to start a request.",
    createAccount: "Create account",
    postTitle: "Complete your details",
    postBody: "Just a few details to finish setting up your account.",
    // Request-submit gate only — makes it clear the request posts right after (shown when submitting a request).
    postBodyRequest: "Complete your details and your request will be posted right away.",
    postGateTitle: "Sign in to post your request",
    // General title for the sign-in/register modal — it serves BOTH new and returning accounts.
    gateTitle: "Sign in to continue",
    gateSub: "Enter your phone number — we'll text a verification code. New or returning, just enter your number.",
    // Guest AI-agent limit reached (per-device run cap). Neutral wording — no free/paid framing.
    trialTitle: "You've reached your limit",
    trialSub: "Sign in to continue.",
  },
  gate: {
    confirmLocation: "Confirm the location to continue.", // AC-12/16
    chooseRentalBasis: "Choose a rental basis to continue.", // AC-12/13
    resolveLocationConflict: "Resolve the location conflict to continue.", // AC-47
    resolveItems: "Resolve the flagged equipment items to continue.", // AC-29
    // MREQ-AC-09 — the app's required set, named per control so the dot lands on what's empty.
    noItems: "Add at least one machine to continue.",
    categoryMissing: "Choose a category.",
    subtypeMissing: "Choose a type.",
    capacityMissing: "Choose a size.",
    fuelMissing: "Choose a fuel type.",
    quantityMissing: "Set how many you need.",
    deliveryMissing: "Say who delivers to site.",
    returnMissing: "Say who returns it from site.",
    locationMissing: "Set where the machine goes.",
    // MREQ-AC-54 — web-only gates, each satisfied by an explicit "nothing" answer.
    yearMissing: "Choose a minimum year, or Any year.",
    certMissing: "Choose a certificate, or No certificate.",
    confirmChargedDays: "Confirm how many days you'll be charged for.",
  },
  errors: {
    emptyTitle: "We couldn't read a request from that", // AC-09 tentative
    emptyBody: "Try again, or edit what you pasted.",
    networkTitle: "Connection problem", // AC-10 tentative
    networkBody: "Something went wrong. Your input is saved — try again.",
    busyTitle: "The AI assistant is busy",
    busyBody: "It's handling a lot of requests right now. Your input is saved — try again in a moment.",
    unavailableTitle: "The AI assistant is unavailable",
    unavailableBody: "It couldn't process your request right now. Your input is saved — try again shortly.",
    switchManual: "Switch to Manual",
  },
  options: {
    rentalBasis: { daily: "Daily", weekly: "Weekly", monthly: "Monthly" },
    overtime: { without: "Without", "1.5x": "1.5×", "2x": "2×" },
    equipmentYear: { any: "Any", custom: "Custom…", customPlaceholder: "Type a year, e.g. 2008" },
    safetyCert: { tuv: "TÜV", aramco: "Aramco Certified", spsp: "SPSP", "saso-technical": "SASO technical inspection", other: "Other" },
    otherCert: { "local-content": "Local content", "saso-registration": "SASO registration" },
    party: { me: "Me", supplier: "Supplier" },
    fuelType: { diesel: "Diesel", petrol: "Petrol", electric: "Electric", hybrid: "Hybrid" },
    paymentTerm: {
      upfront: "Upfront",
      daily: "Daily",
      "net-30": "Net 30",
      "net-60": "Net 60",
      "end-of-job": "End of job",
    },
    paymentMethod: { "bank-transfer": "Bank transfer", cash: "Cash" },
    maintenanceResp: { supplier: "Supplier", renter: "Renter" },
    maintenanceSla: { "4h": "4h", "8h": "8h", "24h": "24h", "48h": "48h", "72h": "72h" },
    bidWindow: { "24h": "24h", "48h": "48h", "72h": "72h", "1-week": "1 week" },
    accommodation: { me: "Me", supplier: "Supplier" },
    operatorNeeded: { yes: "Yes", no: "No" },
  },
  auth: {
    brandPill: "Equipment, on demand",
    brandHeadline: "Rent the right equipment, from suppliers you can trust.",
    brandSubtitle: "Post a request, compare competitive bids from verified suppliers, and book — all in one place.",
    feat1Title: "Post a request in minutes",
    feat1Sub: "Tell us what you need, when and where",
    feat2Title: "Or upload an RFQ — your smart assistant handles it",
    feat2Sub: "We read your document & build the request",
    feat3Title: "Compare bids & enter the deal room to negotiate",
    feat3Sub: "Competitive offers from verified suppliers",
    brandFoot: "Rentee web",
    signInTitle: "Welcome back", // AC-01
    signInSub: "Enter your phone number to continue. We'll text you a verification code.",
    phoneLabel: "Phone number", // AC-01
    phonePlaceholder: "5X XXX XXXX",
    deliveryLabel: "Send code via", // T5: OTP delivery channel
    viaSms: "Text (SMS)",
    viaEmail: "Email",
    emailLabel: "Email address",
    emailInvalid: "Enter a valid email address.",
    countryLabel: "Country",
    smsSaudiOnly: "SMS isn't available outside Saudi Arabia — use Email to get your code.",
    emailChoiceTitle: "Keep your saved email?",
    emailChoiceBody: "This number already uses {stored}. Keep it, or switch to the one you just entered ({new})?",
    emailKeep: "Keep current",
    emailUseNew: "Use new",
    emailSwitching: "Switching…",
    emailSwitchError: "Couldn't switch your email — keeping the current one.",
    withPhone: "Phone",
    withEmail: "Email",
    entryTitle: "Sign in or create your account",
    entrySub: "Enter your phone or email — we'll send a verification code. New or returning, this is the only step.",
    addPhoneTitle: "Add your phone number",
    addPhoneSub: "Your phone is your account identity — we'll text a code to verify it.",
    verifyCreate: "Verify & create account",
    verifyPhone: "Verify",
    phoneVerified: "Phone verified",
    signInInstead: "Sign in instead",
    emailRequiredTitle: "Add your email",
    emailRequiredSub: "We'll use it for receipts and to help you sign in.",
    emailSignInUnavailable: "We couldn't sign you in with this email — please use your phone number.",
    finishTitle: "Finish your signup",
    finishBody: "You're almost there — add your details to finish creating your account.",
    finishCta: "Finish signup",
    sendCode: "Send code", // AC-01
    sending: "Sending…",
    signInFoot: "New here? Just enter your number — we'll set you up.",
    codeTitle: "Enter the 4-digit code", // AC-02
    codeSentTo: "We sent it to {phone}", // AC-02
    verify: "Verify & continue", // AC-03
    verifying: "Verifying…",
    back: "Back", // AC-13
    resend: "Resend code", // AC-12
    resent: "A new code has been sent.", // AC-12
    signOut: "Sign out", // AC-19
    // Restore gate — a verified sign-in on a self-deleted account (app parity: restoreAccount* strings).
    restoreTitle: "Welcome back!",
    restoreBody: "You deleted this account earlier. Restore it to get your profile, requests and bids back — everything is still here.",
    restoreConfirm: "Yes, restore my account",
    restoring: "Restoring…",
    restoreDeny: "No, sign out",
    restoreError: "We couldn't restore your account. Please try again.",
    errors: {
      invalid_phone: "Enter a valid phone number.",
      invalid_code: "That code isn't right. Try again.", // AC-09
      expired: "That code has expired. Request a new one.", // AC-11
      locked: "Too many attempts. Request a new code.", // AC-10
      send_failed: "We couldn't send the code. Please try again.", // AC-15
      email_ambiguous: "This email is linked to more than one account — use a different email, or sign in with your phone.",
      email_taken: "This email is already in use.",
      phone_taken: "You already have an account with this number.",
      phone_not_verified: "Please verify your phone number first.",
      offline: "You appear to be offline. Check your connection and try again.", // AC-24
      unknown: "Something went wrong. Please try again.",
    },
  },
  onboarding: {
    step1: "Create account",
    step2: "Verify company",
    later: "later",
    backToHome: "Back to home",
    title: "Create your account",
    subtitle: "Complete your details to start requesting equipment from verified suppliers.",
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone number",
    verified: "Verified",
    city: "City",
    jobTitle: "Job title",
    companyName: "Company name",
    companyNamePlaceholder: "Your company name",
    email: "Email",
    whatsapp: "WhatsApp number",
    optional: "optional",
    selectCity: "Select your city",
    selectJobTitle: "Select your job title",
    submit: "Create account",
    submitting: "Creating…",
    errors: {
      firstName: "First name must be 2–30 characters.", // AC-02/03
      lastName: "Last name must be 2–50 characters.", // AC-02/03
      city: "Select your city.", // AC-02
      jobTitle: "Select your job title.", // AC-02
      email: "Enter a valid email address.",
      emailRequired: "A valid email address is required.",
      whatsapp: "Enter a valid Saudi mobile number.", // AC-04
      phone: "Enter your phone number and verification code.",
      submit: "We couldn't save your details. Please try again.",
      offline: "You appear to be offline. Your details are kept — try again.", // AC-23
    },
  },
  verify: {
    step1: "Create account",
    step2: "Verify company",
    done: "done",
    title: "Verify your company",
    subtitle: "Send your company documents for review to become a verified renter.",
    authorityRole: "Your authority",
    roleOwner: "Owner",
    roleManager: "Manager",
    roleEmployee: "Employee",
    nationalId: "National ID",
    companyCity: "Company city",
    cityPlaceholder: "Select a city",
    optional: "optional",
    upload: "Upload",
    uploading: "Uploading…",
    uploaded: "Uploaded",
    submit: "Submit for verification",
    submitting: "Submitting…",
    resubmit: "Resubmit",
    back: "Back",
    pendingTitle: "Verification pending",
    pendingBody: "Your company details are under review. We'll update your status here.", // AC-13/14
    verifiedTitle: "You're verified",
    verifiedBody: "Your company has been verified.", // AC-19
    rejectedTitle: "Verification not approved",
    rejectedBody: "Your submission wasn't approved. You can adjust your details and resubmit.", // AC-17
    errors: {
      role: "Select your authority.", // AC-09
      docType: "Only JPEG, PNG, WebP, or PDF files are accepted.", // AC-11
      submit: "We couldn't submit. Please try again.",
      // E12004: this account was deleted, so every gated call is refused until it's restored. Retrying
      // the form can never work — send them through sign-in, where the restore prompt is waiting.
      accountDeleted: "This account was deleted. Sign out and sign in again to restore it, then submit.",
      offline: "You appear to be offline. Your input is kept — try again.", // AC-23
    },
    /**
     * The single-pile company-documents flow. Copy is taken verbatim from the mobile app's
     * `companyDocs*` / `companyLogo*` strings so both products say the same thing in both languages;
     * only the handful of browser-specific messages at the end have no app counterpart.
     */
    pile: {
      title: "Add company documents",
      heroTitle: "Upload your documents in one go",
      heroSubtitle: "Send us everything you have — our team will review it and confirm your request.",
      requiredSection: "Required to continue",
      requiredPill: "Required",
      optionalSection: "Additional documents",
      optionalPill: "Optional",
      reqCr: "Commercial Registration",
      reqNationalAddress: "National Address",
      reqVat: "VAT",
      optBank: "Bank details",
      optLocalContent: "Local Content",
      optQualifications: "Qualifications",
      optSaso: "SASO certificate",
      dropzoneTitle: "Drag or upload your documents here",
      dropzoneSubtitle: "Commercial registration, national address, tax, and any extra documents — in one batch",
      dropzoneHint: "Images or PDF · up to {max} documents",
      limitReached: "Maximum reached ({count} documents)",
      remove: "Remove",
      submit: "Send documents",
      identityTitle: "A quick confirmation of your identity",
      roleLabel: "Your role at the company",
      roleEmployee: "Non-authorized employee",
      roleManager: "Authorized employee",
      roleOwner: "Owner",
      nationalIdLabel: "National ID / Iqama number",
      cityLabel: "City",
      logoLabel: "Company logo",
      logoNote: "Appears on your quotations, your shared request link, and the bid form suppliers open.",
      logoChange: "Change",
      logoUpload: "Upload",
      logoRemove: "Remove",
      continue: "Continue",
      confirmHeadline:
        "Not uploading the required company documents may lead to your registration being rejected",
      confirmEstimate: "We review and get back to you within 24–48 hours",
      confirmSubmit: "Confirm and send",
      confirmBack: "Back",
      sentTitle: "Documents sent",
      sentBody:
        "Our team will review your request within 24 to 48 hours, and we'll let you know if we need anything else.",
      // What the reviewer typed, shown above the form for a renter who is here to resubmit.
      rejectionLabel: "Not approved",
      // The read-only side: what actually reached us, for a renter who has already submitted.
      docsOnFileTitle: "Your submitted documents",
      docsOnFileCr: "Commercial Registration",
      docsOnFileVat: "VAT certificate",
      docsOnFileNationalAddress: "National Address certificate",
      docsOnFileView: "View",
      noDocsTitle: "No documents received yet",
      noDocsBody: "Your request is under review. We'll let you know once it has been checked.",
      // Browser-only messages — the app has no equivalent because a phone screen cannot be reloaded
      // out from under an upload the way a tab can.
      errors: {
        unsupportedType: "Only JPEG, PNG, WebP, or PDF files are accepted.",
        tooLarge: "Each document must be 100 MB or smaller.",
        empty: "That file is empty.",
        tooMany: "You can send up to {max} documents at once.",
        presign: "We couldn't start the upload. Please try again.",
        partial: "Some documents didn't upload. Press Send documents again to retry just those.",
        // CO1013 — a member of a company they do not own. The backend's own wording is shown when it
        // arrives; this is the fallback.
        memberCannotVerify:
          "You belong to a company you do not own. Only its owner submits it for verification.",
      },
      unloadWarning: "Your documents are still uploading. Leave this page and they won't be sent.",
    },
  },
  profile: {
    greeting: "Hi{name}",
    // The field's own name. It read «First name / Last name» — a form's question standing in for a
    // fact's label, which is what a two-part name field leaves behind when it stops being a form.
    name: "Name",
    // Headings for the page's three groups. «Edit profile» used to title the first one AND its own
    // button, and «Log out» titled a group holding two acts only one of which is logging out.
    profileSection: "Profile",
    accountSection: "Account",
    editProfile: "Edit profile",
    editProfileSub: "Update your name, city, and contact details.",
    account: "Account",
    // Company / verification card
    companyVerifiedTitle: "Company verified",
    companyVerifiedBody: "Your company is verified — you have a trusted renter badge.",
    companyPendingTitle: "Verification in review",
    companyPendingBody: "Your company details are under review. We'll update your status here.",
    companyNoneTitle: "Verify your company",
    companyNoneBody: "Verify your company to become a trusted renter and unlock unlimited requests.",
    companyRejectedTitle: "Verification not approved",
    companyRejectedBody: "Your submission wasn't approved. You can adjust your details and resubmit.",
    companyCta: "Start verification",
    companyResubmit: "Review & resubmit",
    // Edit form
    firstName: "First name",
    lastName: "Last name",
    city: "City",
    jobTitle: "Job title",
    companyName: "Company name",
    companyNamePlaceholder: "Your company name",
    email: "Email",
    whatsapp: "WhatsApp number",
    optional: "optional",
    selectCity: "Select your city",
    selectJobTitle: "Select your job title",
    save: "Save changes",
    saving: "Saving…",
    saved: "Profile updated",
    cancel: "Cancel",
    // Change phone
    changePhone: "Change phone number",
    changePhoneSub: "Update the mobile number you sign in with.",
    currentPhone: "Current number",
    newPhone: "New number",
    sendCode: "Send code",
    sending: "Sending…",
    phoneCodeTitle: "Enter verification code",
    phoneCodeSentTo: "We sent a 4-digit code to {phone}.",
    verify: "Verify & update",
    verifying: "Verifying…",
    resend: "Resend code",
    resent: "Code resent.",
    phoneChanged: "Phone number updated. Please sign in again.",
    // Settings
    settings: "Settings",
    language: "Language",
    english: "English",
    arabic: "العربية",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    support: "Support",
    logout: "Log out",
    loggingOut: "Signing out…",
    // Delete account
    deleteAccount: "Delete account",
    deleteAccountSub: "Permanently remove your account and data.",
    deleteTitle: "Delete your account?",
    deleteBody: "This permanently removes your account, requests, and bids. This can't be undone.",
    deleteConfirmLabel: "Type {word} to confirm",
    deleteConfirmWord: "DELETE",
    deleting: "Deleting…",
    // Errors
    loadError: "Couldn't load your profile.",
    saveError: "We couldn't save your changes. Please try again.",
    cantClear: "This can't be removed once saved. Please keep a value here.",
    changePhoneError: "We couldn't send the code. Please try again.",
    otpError: "That code isn't right. Please try again.",
    phoneInUse: "That number is already registered to another account.",
    deleteError: "We couldn't delete your account. Please try again.",
    offline: "You appear to be offline. Please try again.",
  },
  /**
   * Deal-room rentee map (RMAP, spec §6.6). Every string on the map surface, in one block.
   *
   * Terminology: the supplier is **«المؤجّر»**, never «المورد» — decision 5 in the RMAP design
   * reference. The shipped app uses «المؤجّر» 79 times against 21, so the spec's own wording is
   * superseded and this block is the reference for the rest of the feature.
   *
   * Freshness copy (AC-230): nothing here may imply that offers update on their own. There is no
   * push — `freshnessNote` states the three triggers explicitly (§7.5.1).
   */
  bidMap: {
    /* ── v3 · the equipment-verification surface (spec 004 §5, §6.1–§6.3) ──
       The route, the panel header, the count pills and the shortfall alert. */
    // V1 — the route, and the entry to it from a bid card
    surfaceTitle: "Equipment in this offer",
    verifyEntry: "Check the equipment",
    loadingBid: "Loading this offer…",
    bidFailed: "This offer couldn't be loaded",
    bidFailedWhy: "It may have been withdrawn, or the link may be out of date. Open it again from your bids.",
    backToBids: "Back to the bids",
    signInTitle: "Sign in to check this offer's equipment",
    signInBody: "Offers are tied to your account.",
    signIn: "Sign in",
    // Off-platform offers never open this surface (RM3-AC-25) — they keep their own viewer.
    offPlatformNotHere: "This offer came in through your shared link",
    offPlatformNotHereWhy: "It carries items, not registered equipment — so there is nothing here to place or verify. Open it from your bids to read the submission and reply.",
    // V2 — panel header. Identity only: no contact details, no deals count, no IBAN, CR or VAT.
    //
    // ── Both were SHORTENED because they were eating the supplier's name (owner, 2026-08-19) ──────
    // The panel is 392px. «Verified company» and «Company documents» took 118px and 148px of it, and
    // with the gutters and gaps that left about 73px for the name — so every real supplier rendered
    // as «Al-Faisal …» and the header identified nobody. The Arabic pair is «شركة موثّقة» /
    // «مستندات الشركة», roughly half the width, which is why the prototype's header fits and ours
    // did not: the long wording is the web's own, not the app's, and it is the part that gives way.
    //
    // Neither word is lost. This header shows one company and its name is the line above; «Verified»
    // there can only mean the company, and «Documents ›» can only be its papers — the machine's own
    // papers live behind «Details ›» on each card and are never reached from here. The full phrases
    // survive where there is room for them: the company panel's own heading still reads «Company
    // documents», and the chip carries «Verified company on the platform» on its title.
    verifiedCompany: "Verified",
    /** The chip's full sentence, on its `title` — the prototype puts it there too. */
    verifiedCompanyWhy: "Verified company on the platform",
    companyDocuments: "Documents",
    // V3 — the count pills. `type` is the REQUEST's own equipment type, and it agrees with the count.
    // "With the supplier" means machines that FIT this request, never his whole yard.
    // «registered», not the prototype's «لدى المورد» / "with the supplier" (owner, 2026-08-10). The
    // count is of machines on the supplier's FILE that fit this request — "with the supplier" reads as
    // physical possession, which is a different claim and one this number cannot make. "Registered"
    // is also the word the rest of this surface already uses for the same fact («لا توجد معدّة مسجّلة»).
    countOwned: "{n} {type} registered",
    countInOffer: "{n} in this offer",
    // V4 — the shortfall alert. It states the DIFFERENCE, not the offered total, and it is the WHOLE
    // alert: one sentence beside one button, the same shape the Arabic and the prototype have.
    //
    // It carries no noun where the Arabic carries «وحدة», because Arabic's counted noun keeps one
    // literal form at every count (the decision `unitCountLabel` records) and English's does not — a
    // literal "units" here would print "1 units" on the reachable one-unit shortfall. The count reads
    // against the «{n} in this offer» pill directly above it, which is where the noun already is.
    // ONE LINE beside the button, at the panel's 392px (owner, 2026-08-11). ~~"{n} in this offer have
    // no registered machine — they don't appear on the map"~~ wrapped to three. The dash clause went
    // with it: "no registered machine" already says it is not on a map, and the alert sits above the
    // list it is absent from.
    shortfall: "{n} in this offer with no registered equipment",
    // "it", not "them" — the count reads «1 unit» far more often than not, and a plural button beside
    // a singular line is the kind of mismatch a reader trips on before they can say why.
    shortfallAction: "Ask him to add it",
    // V11 — the send. Sending is also what creates the deal room, so the control acknowledges that a
    // question left, and a failure says so rather than letting the renter assume it arrived.
    shortfallSending: "Sending…",
    shortfallSent: "Asked",
    requestFailed: "The request didn't reach the supplier. Try again.",
    requestInvalid: "This request can't be sent as it is.",
    // One ask, one card (owner, 2026-08-10). Both of these say the same thing in two places: the
    // reason a control is disabled, and the reason a send came back refused. Neither may read as a
    // failure — "try again" is precisely what the rule exists to stop, and the question is already
    // with the supplier.
    askPendingWhy: "You've already asked this, and the supplier hasn't answered yet.",
    requestAlreadyPending: "You've already asked this. It's with the supplier — you'll see his answer in the chat.",
    // Map canvas
    // The prototype's copy verbatim: «مشروعك». "Your site" names a place on a map; the pin names the
    // PROJECT, which is the thing every distance on this surface is measured from.
    yourSite: "Your project",
    noSiteLocation: "This request has no project location",
    noBids: "No bids on this item yet",
    // Availability vocabulary — ONE scale (§6.9.1)
    confirmed: "Confirmed",
    assumed: "Not confirmed",
    noLocation: "Location not shared",
    unitOf: "Unit {i} of {n}",
    multiLocation: "{n} locations",
    unitsConfirmed: "{c} confirmed · {a} not confirmed",
    // T13 — the bid list panel
    title: "Offers received",
    pickSupplier: "Pick a supplier from the list to see their equipment",
    sortPrice: "Lowest price",
    sortNearest: "Nearest",
    sortNearestOff: "Nearest — needs a project location",
    rate: "Offer price",
    ratePer: "SAR / {unit}",
    perDay: "day",
    perWeek: "week",
    perMonth: "month",
    perJob: "job",
    distance: "Distance",
    km: "km",
    cheapest: "Lowest price of all offers",
    offPlatform: "Off-platform",
    justArrived: "Just arrived",
    unitsOfferedLine: "{n} offered",
    unitsIdentifiedLine: "{n} identified — serial, documents and location",
    unitsUnidentifiedLine: "{n} unidentified — readiness can't be checked",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    freshnessNote: "Offers update when you open this page, come back to it, or press refresh.",
    // T15 — the colour key, hosted inside the panel
    keyToggle: "What do the colours mean?",
    keyHeading: "Every pin on the map is one piece of equipment",
    keyConfirmed: "Confirmed — the supplier confirmed its yard in the offer readiness",
    keyUnconfirmed: "Not confirmed — he hasn't confirmed it yet",
    keyNotUnavailable:
      "“Not confirmed” does not mean unavailable — it means the supplier hasn't named its yard in the offer readiness yet. Ask him to confirm from the equipment panel.",
    keyCountOnly: "Units added as a count only don't appear on the map — no equipment is registered for them.",
    // V10 — the machine marker's availability label (§6.8). One scale, two labels, and "not confirmed"
    // reads as UNANSWERED — never refused, never unavailable (RM3-AC-20). The "you can request it"
    // variant is gone with the hollow marker; a machine he did not offer is now an ORDINARY red pin
    // (RM3-AC-10, 2026-08-13), not a variant, and `pinUnconfirmed` is its label.
    pinAvailable: "Availability confirmed",
    pinUnconfirmed: "Not confirmed yet",
    /** The selected marker's in-offer tag (§6.4 landing pre-selection, RM3-AC-34). */
    pinInOffer: "In this offer",
    // A flag beside the distance on the map. Never a warning colour: colour here is availability's.
    mapOutOfCity: "Outside the city",
    loadingFleet: "Loading this supplier's equipment…",
    /* ── V5 · the equipment list (§6.4) ──
       Flat, nearest first, the WHOLE matching fleet. No serial number and no load capacity (RM3-AC-12):
       the serial identifies the machine to the system, and the type and size are already stated once,
       in the count pills. */
    // ONE chip carrying availability (RM3-AC-32) — never a chip plus a band below it, which made cards
    // unequal in height and split one fact across two rows. The unconfirmed chip states the unanswered
    // availability and nothing else (RM3-AC-30 — no reason, no cause).
    //
    // «· in this offer» was dropped from the confirmed chip (owner, 2026-08-19). Offer membership is
    // carried by the orange `pinInOffer` badge, so the chip was stating the same fact twice.
    //
    // **The MAP PIN is the only reader left** (owner, 2026-08-28). The card's own availability chip
    // went with the redesign that made the distance the card's whole subject — the colour of the
    // distance says what the chip said, on the object the renter is actually comparing. The pin's
    // hover box still needs the words, so the keys stay.
    eqChipConfirmed: "Availability confirmed",
    eqChipUnconfirmed: "Not confirmed yet",
    // `eqVerifiedMachine` and `eqNoPhoto` deleted the same day, with the title's ✓ and the photo cell
    // they labelled. `isEquipmentVerified` is untouched and still the one definition of the word; no
    // surface draws its verdict today.
    // Qualifies the offer, not the number: the yard sits outside the request city's own radius, so
    // delivery is a mobilisation worth asking about.
    eqOutOfCity: "· Outside the city",
    eqAskConfirm: "Ask him to confirm",
    eqAskConfirmWhy: "Ask the supplier to confirm this equipment is available",
    eqDetails: "Details",
    // The card body's own label — it finds the machine on the map rather than opening its panel.
    eqFind: "Show on map",
    // `eqNoCerts` deleted (owner, 2026-08-19). A machine whose request named no certificate now says
    // NOTHING — the card's row 4 renders empty and holds its line on `min-height`, and the map pin's
    // hover box drops the row entirely. Neither wording survived reading: "No certificates on the
    // machine" is a claim about the MACHINE this line cannot make (it lists what the REQUEST asked
    // for), and "No certificates requested" explained an absence nobody had asked about. No readers
    // are left, so the key went with them.
    eqDistanceUnit: "km from your project",
    eqNoDistance: "Distance not known",
    // ── The distance chip, and the tutorial behind it (owner, 2026-08-28) ──────────────────
    // The card's dominant fact is now the distance, painted with the availability it is only as good
    // as. A red distance is not a bad distance — it is a distance nobody has promised — and that is
    // exactly the sentence a renter could not get from a chip, so the first press explains it before
    // it asks anything.
    eqYardExplainTitle: "How this distance works",
    // Three steps, in the order they happen. It replaced two paragraphs that said the same true
    // things in prose (owner, 2026-08-31) — prose is where a renter looking at a red number stops
    // reading, and what he wants to know is where he is in a flow and what the end of it gets him.
    eqYardStep1T: "Today it stands here",
    eqYardStep1B: "This is the machine's own location right now, read off its file — not a delivery distance quoted for your job.",
    eqYardStep2T: "Nobody has promised it",
    eqYardStep2B: "The supplier hasn't named the yard this machine would move from for your offer, so red means unanswered — not refused, and not unavailable.",
    eqYardStep3T: "Ask him, and it turns green",
    eqYardStep3B: "The question goes into your chat with him, ready to send. When he names the yard, this distance turns green and the machine counts as confirmed for your offer.",
    eqYardExplainCta: "Ask the supplier",
    eqYardExplainLater: "Not now",
    // The same surface, in the state where the question is already out. It shows what was asked and
    // says it is waiting — never a second «Ask», which would put a duplicate card in the room.
    eqYardAskedTitle: "You already asked about this machine",
    eqYardAskedBody: "Your request is in the conversation with the supplier and has not been answered yet.",
    eqYardAskedWhat: "What you asked",
    // The chips' own explanations, on hover and to a screen reader.
    eqYardConfirmedWhy: "The supplier named the yard this machine moves from, so this distance is confirmed for your offer.",
    eqYardUnconfirmedWhy: "Not confirmed for this offer — press to see what that means and to ask.",
    // The dots beside the file icon: the machine's papers, scored the way the app scores them.
    eqReadinessOnFile: "{done} of {total} documents on file",
    eqOpenFile: "Open this machine's file",
    eqNoPhoto: "No photo",
    eqSelect: "Show this equipment on the map",
    // RM3-AC-26 — a price and a count were given, and nothing else. No empty card furniture.
    eqNoneRegistered: "No equipment is registered in this offer",
    eqNoneRegisteredWhy: "The supplier gave a price and a count only, so there is nothing here to place or verify.",
    // V17 — the list's filters (§6.4a). Chips select for what a machine HAS, never for what it lacks,
    // and the count always states the whole (RM3-AC-28a→28e). Group and chip copy comes from the
    // model, bilingual, so the list and a Dart port cannot label the same band differently.
    eqFilterLabel: "Filter the equipment in this offer",
    eqFilterClear: "Clear filters",
    // «3 of 8» — the numerator is what is shown, the denominator is the whole offer.
    eqShownOfTotal: "{n} of {total}",
    // The filtered empty state — deliberately unlike RM3-AC-26's. That one is a statement about the
    // supplier; this one is a statement about the chips the renter pressed.
    eqFilterEmpty: "No equipment matches what you chose",
    eqFilterEmptyWhy: "Active filters: {filters}. This offer has {total} — clear the filters to see them all.",
    // The company panel's own back control, and the detail's.
    // The list-foot ask (§6.4). The prototype says «المورد»; this surface says «المؤجّر» / supplier.
    eqAskAnother: "Ask the supplier to add another {type}",
    eqAskAnotherSent: "Asked",
    // The offer-first expander (owner, 2026-08-19). The count is in the label because pressing this
    // adds cards AND pins: the renter should know how much is about to arrive on both surfaces.
    eqShowAll: "Show {n} more in his fleet",
    eqShowOfferOnly: "Show only what he offered",
    // The divider where the offer ends. It says these are the supplier's, not this offer's — without
    // it the extra cards read as offered machines that were hiding.
    eqBeyondOffer: "Also in his fleet — not in this offer",
    backToEquipment: "Back to the equipment",
    // What the map is NOT showing, in words. Silence would read as "this supplier has no machines".
    //
    // The V4 shortfall alert has no subtitle key any more (2026-08-11, aligning to the v3 prototype,
    // whose alert is one line of text and a button): `shortfall` is the whole alert. The paragraph
    // that lived here — "They were added as a count only — no machine is registered for them, so they
    // have no location, documents or serial to show." — spent three grey lines unpacking a
    // consequence "no registered machine — they don't appear on the map" already carries. An earlier
    // `claimedNotDrawn` headline went the same way and for the same reason: one slot, one sentence.
    noLocatable: "None of this supplier's equipment can be placed",
    // The resize grip's accessible name. Says what dragging does and what returns it, because the
    // control is invisible until hovered and a screen reader never sees the cursor change.
    resizePanel: "Drag to widen the panel — double-click, or Home, to restore",
    noLocatableWhy:
      "He hasn't shared a yard for any equipment that fits this request, so nothing can be drawn. Ask him to confirm a yard.",
    offPlatformNoPins: "An off-platform offer has no pin",
    offPlatformNoPinsWhy: "It was submitted through your shared link, so it carries no registered equipment and no location.",
    fleetFailed: "The equipment couldn't be loaded",
    fleetFailedWhy: "This isn't a statement about the offer. Press refresh to try again.",
    keyOffPlatform: "Off-platform offers carry no location, so they get no pin.",
  },
  /* ── V12 · the chat dock (spec 004 §6.9, 004a §2) ──
     One supplier, a tab per item. The unread badge is REST, so nothing here may imply immediacy. */
  chatDock: {
    title: "Chat",
    close: "Close the chat",
    dismiss: "Dismiss",
    itemFallback: "This item",
    // A tab whose bid has no room is compose-only — the room is created by SENDING, never by opening.
    composeOnly: "No messages yet. Your first message starts the conversation with the supplier.",
    empty: "No messages yet.",
    unavailable: "Chat isn't available right now.",
    placeholder: "Write a message…",
    // The notice is refresh-timed (mount · focus · post-send · the poll). It states that a reply IS
    // there — never that it just arrived, which is a recency it cannot know.
    noticeTitle: "You have a reply from the supplier",
    // What KIND of arrival, in a chip beside the sender's name. A refusal takes the bubble's warm
    // tone — not red, which on this surface belongs to availability alone.
    kindReply: "Reply to your ask",
    kindRefusal: "Your ask was refused",
    kindMessage: "New message",
    // The bubble QUOTES the message itself (owner, 2026-08-11). This is what it says when there are
    // no words to quote — a file or a shared point — so it still reports what came rather than
    // inventing a sentence the supplier never wrote.
    noticeAttachment: "Sent you an attachment",
    // The composer's send control. The prototype labels it «إرسال» in words; ours draws a glyph, so
    // the word has to reach a screen reader some other way or the button announces as "button".
    send: "Send",
    // The attach control (owner, 2026-08-11: «just add things already exist in the existing chat
    // like upload and voice note»). A glyph again, so the word reaches a screen reader from here.
    // What it is ALLOWED to attach, and what it says when it refuses, is the shared gate's — only
    // the label is this surface's, because this surface's strings are keyed here.
    attach: "Attach a file",
    // Beside an attachment, never instead of it: the bubble OPENS the file, this KEEPS it. Same word
    // and the same control the deal room already carries (owner, 2026-08-11) — a paper the supplier
    // sends in the chat has to be savable from wherever the renter is reading the conversation.
    save: "Save",
    // The placement control. Both labels name the STATE the press moves to, not the one it is in — a
    // toggle labelled with its current state is the oldest way to make a button lie.
    placeFill: "Fill the map area",
    // The call control the old deal room has carried since B5, restored here (owner, 2026-08-12).
    // The number is reached, never printed into the band.
    call: "Call the supplier",
    callUnavailable: "No number on file",
    placeMirror: "Show beside the map",
    // ── The review card (RM3-AC-17) ──
    // An ask is COMPOSED into the conversation and sent only when this is pressed. Cancelling writes
    // nothing at all — not a message, and not the deal room, which the send is what creates.
    draftCancel: "Cancel",
    draftSend: "Send the request",
    // The card's press target. The card names a machine, and the reason it is pressable is that the
    // supplier reading it has to reach that machine to add a document or confirm its yard.
    openMachine: "Open this equipment",
  },
  /* ── V12 · the price footer (spec 004 §6.10, 004a §4a.1 + §4a.4) ──
     Figures and a hand-off. It never edits a figure and never re-implements negotiation. */
  priceFooter: {
    perPeriod: "SAR / {unit}",
    // Every figure in the breakdown carries the currency, exactly as the app's bid footer prints it.
    currency: "SAR",
    day: "day",
    week: "week",
    month: "month",
    job: "job",
    // Plurals — for the rental basis line ONLY ("… × 14 days × 1 unit"), which counts periods and
    // units out loud. The singular keys above still label the rate itself ("SAR / day").
    days: "days",
    weeks: "weeks",
    months: "months",
    jobs: "jobs",
    unitOne: "unit",
    unitMany: "units",
    openingOffer: "Opening offer",
    fromDealRoom: "From the deal room",
    // A text link that says what pressing it DOES, both ways round — the app's footer names the next
    // state rather than the section (owner, 2026-08-11, from the app screenshot). The old single
    // "Details" + chevron left the reader to decode the arrow.
    showDetails: "Show details",
    hideDetails: "Hide details",
    // The footer's two ways in, named by INTENT rather than by destination (owner, 2026-08-11).
    // ~~"Negotiate" / "Continue in the deal room"~~ — both described the room the renter arrives in,
    // which he has not seen yet and cannot want; these describe what he is about to do with the price
    // in front of him. "Counter this price" is the owner's own wording (2026-08-11); the Arabic pair
    // «اطلب سعراً أقل» / «اعتمد» is the app's, verbatim.
    //
    // Both now land in `/deal-room/[id]?act=…`, which opens the room's OWN three-step flow on
    // arrival. The price is still settled in exactly one place (004a §4a.2) — this only removes the
    // second press that used to stand between the renter and the sheet he had already asked for.
    counterPrice: "Counter this price",
    // "Accept", not "Approve" (owner, 2026-08-11). The Arabic keeps the app's «اعتمد», but in
    // English this button and the deal room's own are one act reached from two surfaces, and the
    // room says Accept. A renter who pressed "Approve" and landed on a sheet headed "Accept" would
    // have had to work out that they are the same thing.
    confirmPrice: "Accept",
    // The one place the offered and the agreed count are reconciled (RM3-AC-66).
    unitsDiffer: "Priced on {agreed} agreed units — the offer was made of {offered}.",
    rental: "Rental",
    // The basis, restated under the label the way the BID CARD restates it: the raw quoted rate over its
    // own period, the days it is actually charged across, then how many units — so the rental total is
    // arithmetic the reader can check, not a claim. Billable days, never the calendar span: the total
    // excludes the Fridays, and a basis line that counted them stated a sum its own figure contradicted.
    // ── The map footer's basis lines, PER MACHINE (owner, 2026-08-19) ────────────────────────────
    // The two above state the basis for the whole offer — "{rate}/{unit} × {days} × {n} units" — which
    // is right where the figure beside them is a whole-offer figure. The map footer's breakdown states
    // its lines per machine and applies the count once at the foot, so its basis must not carry the
    // unit count as well: printed there it would multiply a number the line below it multiplies again.
    rentalBasisDays: "{rate}/{unit} × {days} billable days",
    rentalBasisUnit: "{rate}/{unit}",
    // The heading over that per-machine block, and the row that closes it. Only drawn on a multi-unit
    // offer, where the two blocks differ; a single machine draws one set and needs neither.
    perUnitHead: "Per unit",
    overallTotal: "Overall total",
    unitsCount: "{n} units",
    rentalBasis: "{rate}/{unit} × {days} billable days × {n} {units} in your request",
    // Nothing to prorate — open-ended, per-job, or no start date. One full period, as quoted.
    rentalBasisFlat: "{rate}/{unit} × {n} {units} in your request",
    // The fixed divisor behind a weekly/monthly rate — what turns the quoted rate into the day count
    // beside it. Printed whether or not this particular period comes out exact (app parity).
    divisorWeek: "6 working days/week",
    divisorMonth: "26 working days/month",
    // The legs keep their internal names as KEYS (mob/demob is what the backend and the deal room
    // call them) but wear the app's plain words, which is what a renter reading a price expects.
    mobilisation: "Delivery",
    demobilisation: "Return",
    excluded: "Not charged",
    subtotal: "Subtotal before VAT",
    vat: "VAT (15%)",
    total: "Total",
    noDuration: "This request has no duration, so the figures cover one full period.",
  },
  /* ── The requests workspace (docs/implementation-plans/requests-workspace/plan.md) ──
     One page for every request, its items and its bids. Phase 1 is the shell: the rail, the strip
     that names what is selected, and the two tabs. */
  workspace: {
    title: "My Requests",
    // The rail's first tile. It is an action, not a request, so it says what it makes.
    newRequest: "New",
    closed: "Closed",
    // The units a request asked for, on the rail tile. Rendered only when it is more than one.
    unitsBadge: "×{n}",
    // The rail's two counts, as words, on the tile's tooltip — the badges themselves are too small to
    // carry the distinction and a renter should not have to infer it from a glyph.
    itemsBadge: "{n} different machines",
    unitsTitle: "×{n} of one machine",
    railScrollNext: "More requests",
    railScrollPrev: "Earlier requests",
    // The dark strip, left half — the request itself.
    bidsCount: "{n} bids",
    oneBid: "1 bid",
    openRequest: "Open the request",
    // The bid count on the navy, said as three parts so the number can carry its own weight.
    bidsWord: "bids",
    bidWord: "bid",
    // The primary control acts on the picked bid, so it says why it is inert.
    selectBidFirst: "Select a bid first",
    fullDetails: "Full details",
    share: "Share",
    quotation: "Quotation",
    quotationNeedsRoom: "The quotation is issued in the deal room — open the conversation with this supplier first.",
    // The dark strip, right half — the item, and what the selected supplier offers against it.
    offers: "{supplier} offers",
    noBidSelected: "No bid selected",
    noBidsYet: "No bids on this item yet",
    itemsInRequest: "Items",
    hideRequest: "Hide this request",
    equipmentAndDocs: "Equipment & docs",
    reviewEquipment: "Review equipment",
    viewDocuments: "View documents",
    docsShort: "Documents",
    // The picked machine, as the reference shows it: a ribbon on the thumbnail and a chip beside
    // the model. «Not checked» is the honest state — nobody has confirmed a yard for it yet.
    ribbonConfirmed: "Confirmed",
    ribbonUnconfirmed: "Unconfirmed",
    availabilityConfirmed: "Availability confirmed",
    availabilityNotChecked: "Availability not checked",
    // The request's own terms, as chips on the strip beside the item they qualify. They were
    // drawer-only, which made the renter open a panel to recall what he had asked for while reading
    // what he was being offered.
    chipStarts: "Starts {date}",
    chipDuration: "{n} days",
    chipMore: "+{n} more",
    // Read off the bid's copy of the request terms, not derived from the rental type.
    chipOperator: "With operator",
    // The two tabs and the export beside them.
    tabCards: "Cards",
    tabCompare: "Compare",
    download: "Download",
    // The one download beside the tabs, named for what the tab it stands over exports.
    downloadQuotation: "Download quotation",
    exportComparison: "Export comparison",
    // Puts every benched bid back on the comparison — and therefore back in the export, which covers
    // what the comparison covers. Named with its count so the renter knows what he is bringing back.
    selectAll: "Select all ({n} off)",
    // The source filter. "Via app" is a bid placed through Moedatech; "Offline" is one that arrived
    // through the share link or was typed in by the renter.
    source: "Source",
    sourceAll: "All",
    sourceApp: "Via app",
    sourceOffline: "Offline",
    // Empty states.
    emptyTitle: "No requests yet",
    emptyBody: "Create your first request to start getting supplier bids — you'll set up your account when you submit.",
    emptyCta: "Create request",
    signedOutTitle: "Sign in to see your requests",
    signedOutBody: "Your requests, the bids on them, and every comparison live here once you're signed in.",
    signedOutCta: "Sign in",
    loading: "Loading your requests…",
    loadFailed: "Your requests could not be loaded. Check your connection and try again.",
    retry: "Try again",
    // Phase 1 ships the shell; the two panes arrive with phases 2 and 3.
    tabPending: "This view is still being built.",
    // ── The bid card ──
    // The card's source line, said in full. The header chip above is the short form.
    sourceAppLong: "Via Moedatech app",
    sourceOfflineLong: "Offline · added by you",
    notOnApp: "Not on the app",
    openChat: "Open the conversation",
    // "{period}" is the rental period the bid quoted in — Monthly rental, Weekly rental, and so on.
    // The price block mirrors the app's bid card (`v3_bid_card.dart`, `price_expanded_breakdown.dart`,
    // checked 2026-08-12). The headline names the rental type; on a weekly or monthly bid it carries
    // the RATE, so suppliers compare on what they quoted, and the prorated total moves into the rows.
    rentalDaily: "Daily rental",
    rentalWeekly: "Weekly rental",
    rentalMonthly: "Monthly rental",
    rentalJob: "Job price",
    perUnitLabel: "{label} per unit",
    // The rental row explains the headline: the rate spread across the days actually billed.
    rentalRowDays: "Rental · {n} days",
    rentalRowNoDuration: "Rental",
    rentalRowCustom: "Rental for the specified period",
    deliveryToSite: "Delivery to site",
    returnFromSite: "Return from site",
    notQuoted: "Not quoted",
    grandTotal: "Grand total",
    grandTotalInclVat: "Grand total · incl. VAT",
    // Multi-unit only, in the same box: the true all-units figure, which is not the per-unit total
    // times the count — each transport leg carries its own unit count.
    overallTotal: "Overall total",
    // What the figure was multiplied by, INLINE with the label (owner, 2026-08-29) — a bare «· 4»
    // read as a line number, and the app's stacked «Units: 4» caption spent a row of the totals box on
    // four characters. Parenthesised, it is part of the phrase it qualifies.
    unitsCountLabel: "({n} units)",
    // ── The offered-units badge (app parity: `bidOffersUnits` / `bidAcceptedUnits`) ─────────────
    // Drawn only where the REQUEST asked for more than one unit, which is the app's own gate: on a
    // single-unit request every bid covers the whole of it and the chip states nothing.
    offersUnits: "{n} units",
    acceptedUnits: "{accepted} of {offered} units accepted",
    // ── Off-platform pair ────────────────────────────────────────────────────────────────────────
    // The invite reaches the supplier through the renter's OWN WhatsApp, the way «Provide it for me?»
    // reaches support (owner, 2026-08-25) — so the message is written in the renter's voice and says
    // what the supplier gets, not what Moedatech wants. It names the firm so a supplier holding
    // several conversations knows which renter is asking.
    inviteToApp: "Invite to Moedatech",
    inviteSent: "Invite opened",
    inviteNoContact: "This bid carries no number to reach the supplier on.",
    inviteMessage:
      "Hello {supplier} — I received your bid through Moedatech. If you install the Moedatech app you'll see my requests directly and can bid on more of them. https://moedatech.net",
    viewQuote: "View quote",
    // The renter typed an off-platform quote in himself, so it is his to correct.
    editQuote: "Edit quote",
    // The next move on an off-platform row: get that supplier onto the app.
    offlineInvite: "Offline · invite ↗",
    notBuiltYet: "Not available yet.",
    // ── When a bid's three counts disagree (`unit-count-notes`) ──────────────────────────────────
    // Said only where they genuinely diverge. `priced` is what the money was built on, `offered` is
    // what the bid claims, and `named` is how many distinct machines are actually behind it — a
    // supplier may commit to more units than he holds machines for, and the padding is invisible
    // without this line.
    countPricedAbove: "Priced on {priced} units, though the offer lists {offered}.",
    countPricedBelow: "Priced on {priced} of the {offered} units offered.",
    countClaimed: "{n} of these units name no machine — {named} machines were listed.",
    // ── The comparison matrix ──
    // "Pick one" focuses the row — it drives the strip above. It never awards; that is the deal room.
    supplierPickOne: "Supplier · pick one",
    // The same header, in the two halves the 180px column has room for.
    supplier: "Supplier",
    pickOne: "· pick one",
    removeColumn: "Take off the comparison",
    recommended: "Recommended",
    awaitingReply: "Awaiting reply",
    inNegotiation: "In negotiation",
    perCycle: "Per cycle",
    colRate: "Rental",
    // The three totals. The third is named after the request's own duration.
    firstCycle: "First cycle",
    everyCycleAfter: "Every cycle after",
    overDays: "{n} days",
    // Their popovers. Each lists the lines the figure was added from, in that order.
    howFirstCycle: "How first cycle is built",
    howEveryCycle: "How every cycle after is built",
    howDuration: "How {n} days is built",
    // The duration column charges billable days, so its popover names them rather than claiming a
    // count of whole months. Ruled 2026-08-12: the shared pricing module governs this figure, and it
    // prorates at rate ÷ divisor a day with Fridays excluded — the same equation the deal room and
    // the quotation use, so one rental cannot cost two different amounts across the app.
    //
    // `{d}` is that divisor, and it used to be the literal 26 (owner, 2026-08-26). A weekly bid was
    // therefore told «Rental ÷ 26 × 11 billable days» over a figure built on ÷ 6 — the money was
    // right and the sentence explaining it was not, and a reader who checked it would have got 1,777
    // where the column said 8,855.
    rentalOverDays: "Rental ÷ {d} × {n} billable days",
    // Daily has a divisor of 1 and a per-job price has none at all, so neither has a division to
    // explain and both would read as noise («÷ 1», «÷ 0») if forced through the sentence above.
    rentalOverDaysFlat: "Rental × {n} billable days",
    fridaysNote: "{days} days minus its Fridays = {billable} billable days.",
    transportOnce: "Delivery + return",
    paidOnce: "paid once, cycle 1",
    vatNote: "All figures in SAR. VAT applied at 15% on the taxable lines above.",
    // The terms split: what the request asked for, against what suppliers volunteered.
    termsYouSet: "Terms you set",
    theyOffered: "They offered on their own",
    termOperator: "Operator",
    termFuel: "Fuel",
    termPayment: "Payment",
    termSla: "Maintenance SLA",
    termOvertime: "Overtime",
    termNationality: "Nationality",
    // A term the supplier never answered. Said out loud, because a blank cell reads as "nothing to pay".
    didntSay: "Didn't say",
    rankWithAi: "Rank with AI",
    aiRanked: "AI ranked",
    // Under the three grand totals, so a figure is never read as a pre-tax one.
    withVat: "with VAT",
    // On a term the RENTER set: what he asked for, beside the column's name.
    youAsked: "you asked",
    // A term every supplier answered the same way. The column says it once, then says nobody differs.
    sameFromAll: "same from all {n}",
    // The two closed column groups, standing on their edge.
    groupCost: "Cost",
    groupTerms: "Terms",
    // The rails say what pressing them does; the rail itself carries one word.
    openCost: "Show the cost columns",
    openTerms: "Show the terms columns",
    // The fold controls. A rail says what pressing it brings back.
    openTotals: "Show the grand totals",
    hideGroup: "Fold this group away",
    hideColumn: "Fold this column away",
    showColumn: "Show this column",
    // The supplier line under a name in the comparison, where the column is 185px wide.
    sourceOfflineShort: "Offline · added by you",
    // A yes/no term, said as a word rather than the wire's own YES / NO.
    termYes: "Yes",
    termNo: "No",
    // The equipment rail is a door, not a group: availability is a machine-by-machine question and
    // the map already answers it in full, so pressing it opens the picked bid's machines there.
    checkAvailability: "Check availability",
    // ── The suggestion bar under the comparison ──
    aiSuggestion: "AI suggestion",
    aiWhatIdDo: "What I'd do",
    aiBrand: "MOEDATECH AI",
    aiRankPrompt: "Rank these bids for me",
    aiRanking: "Reading the bids…",
    // The equipment group. Its cell states how many of the bid's machines the supplier has named a
    // yard for, in the MAP's words — one vocabulary for availability across the product.
    groupEquipment: "Equipment",
    colAvailability: "Availability",
    exportPopupBlocked: "Allow pop-ups to print the comparison.",
    docsEquipment: "This machine",
    docsCompany: "The company",
    docsNone: "No documents on this bid yet.",
    docsFailed: "Those documents could not be loaded.",
    docOpen: "Open",
    docNoLink: "No link",
    // ── The request drawer ──
    shareRequest: "Share request",
    editRequest: "Edit request",
    cancelRequest: "Cancel this request",
    unitsCount: "{n} units",
    factStarts: "Starts",
    factDuration: "Duration",
    factSite: "Site",
    factRequested: "Requested",
    factBidsIn: "Bids in",
    daysValue: "{n} days",
    // "4 · 2 via the app, 2 added offline" — the total alone hides that half were typed in by hand.
    bidsSplit: "{app} via the app, {offline} added offline",
    certsRequired: "Certificates required",
    // The one-time post-bid edit, in the app's own words (`app_en.arb`, editOnceConfirm*). The web
    // used to hide Edit entirely once a bid arrived; the app has allowed exactly one since 2026-08-05.
    editOnceTitle: "One-time edit",
    editOnceBody: "You can edit this request only once after a bid has been placed. Continue to the edit form?",
    editOnceContinue: "Continue editing",
    editCapUsed: "You've already used your one edit for this request",
  },
  survey: {
    navTitle: "Surveys",
    badgeAria: "You have a survey waiting",
    emptyTitle: "No surveys right now",
    emptyBody: "When one of your requests wraps up, we'll ask what happened here.",
    // Q1 — who did you rent from? (doc §8)
    q1Title: "How did your request go?",
    q1Question: "You requested {equipment}. Who did you end up renting from, and for how much?",
    someoneElse: "Someone else (not listed)",
    noOne: "No one — I didn't rent",
    priceLabel: "How much did you pay {unit}?",
    reasonNoOne: "If you don't mind, what happened?",
    reasonSomeoneElse: "Tell us more (optional)",
    confirm: "Confirm",
    skip: "Skip for now",
    // Q2 — still need this? (no bids)
    q2Title: "Your request hasn't received any bids yet",
    q2Body: "Try loosening your requirements so more suppliers can take part — otherwise we'll close this request for you.",
    edit: "Edit my requirements",
    close: "Close the request",
  },

  /**
   * The request canvas (MREQ). Replaces the four-step wizard's own key groups; `step1`–`step3` stay
   * for now because other surfaces still read a handful of their labels.
   */
  projects: {
    home: {
      viewAll: "All {n}",
      onSite: "{n} units on site",
    },
    offer: {
      alreadyTitle: "You already have a project at {site}",
      alreadySub: "Add this request to it, or say it is a different site — two projects for one place split the site's picture in two.",
      addTo: "Add it to {site}",
      addToSub: "Nothing on the request changes. It just appears on that site's chart.",
      different: "It's a different site",
      differentSub: "Same address, different job. We make a second project and file this under it.",
      createTitle: "Make a project from this request?",
      createSub: "State the site once and your next request for it is one line of typing.",
      savedHeading: "Saved as the project",
      staysHeading: "Stays with this request",
      fieldSite: "Site",
      fieldDates: "Dates",
      fieldBasis: "Rental basis",
      fieldHours: "Hours per day",
      fieldPayment: "Payment terms",
      fieldEquipment: "Equipment",
      fieldBudget: "Budget",
      fieldMethod: "Payment method",
      fieldSuppliers: "Supplier filters",
      thisRequestOnly: "this request only",
      verifiedOnly: "verified only",
      createAction: "Make the project",
      notNow: "Not now",
    },
    docs: {
      title: "Papers for this award",
      none: "Nothing attached yet.",
      kind: "What is it",
      kinds: {
        po: "Purchase order",
        contract: "Contract",
        quotation: "Supplier's quotation",
        other: "Other",
      },
      attach: "Attach a file",
      removeNamed: "Remove {name}",
      oursIsGenerated: "Our quotation for this request is generated, not uploaded — download it from the row menu. The one here is the quotation the SUPPLIER sent you.",
      tooBig: "That file is over {max}. Attach a smaller one.",
      badType: "PDF, JPG, PNG or WEBP. Convert it first, or take a photo of the page.",
      readFailed: "That file could not be read. Try another.",
    },
    conflict: {
      openTheForm: "Open the work order and change its dates there \u2014 that form owns the check that keeps a group\u2019s rows in step.",
      title: "This runs to different dates",
      intro: "Both are kept. Keeping the difference is usually right — a machine that stays longer than the site's own dates is a fact, not a mistake.",
      keepDifferent: "Keep it different",
      matchProject: "Match the project",
      costsTheEdit: "This request has bids, so matching the project uses its one remaining edit.",
      editUsed: "This request has already used its one post-bid edit, so it cannot be changed. The difference stays, and the chart keeps showing it.",
      closed: "This request is closed, so nothing can change it now.",
    },
    move: {
      fileTitle: "File this in a project",
      moveTitle: "Move this to another project",
      changesNothing: "Filing changes nothing on the request — not one value moves, even where the new site says something different. That is why it works after bids and costs you no edit.",
      movingDropsAwards: "Moving it to another site removes the awards recorded here, with their marks and documents. The request itself is untouched.",
      atThisAddress: "At {site}",
      noneHere: "No project at {site} yet.",
      orAnother: "Or another project",
      chooseOne: "Choose a project",
      file: "File",
      move: "Move",
      removeFromProject: "Remove from this project",
    },
    workOrder: {
      equipment: "What is on site",
      machine: "Machine",
      category: "Category",
      subtype: "Type",
      size: "Size",
      search: "Search…",
      notInCatalogue: "Not in our catalogue — I will type the name",
      rawLabelPlaceholder: "What it is, e.g. Welding machine",
      rawSizePlaceholder: "Size, e.g. 400A",
      quantity: "How many",
      notes: "Notes",
      addMachine: "Add another machine",
      differentTerms: "Different terms for this machine",
      termsComing: "Operator, delivery, fuel and certificates for this machine. Arriving with the terms editor.",
      period: "How long it is here",
      periodHint: "Leave these empty and the work order runs to the site's own dates.",
      differs: "This runs to different dates from the site ({start} → {end}). That is allowed — both are kept, and the chart shows the difference.",
      supplier: "Who provides it",
      supplierHint: "A work order is awarded the moment it exists, because the machine is already here. Leave a supplier blank for your own fleet.",
      supplierPlaceholder: "Supplier, or your own fleet",
      unnamedMachine: "This machine",
    },
    menu: {
      label: "Row actions",
      award: "Award",
      reviewBids: "Review the bids",
      changeAward: "Change the award",
      attachDocument: "Attach a document",
      markMobilized: "Mark mobilized",
      undoMobilized: "Undo mobilized",
      markDemobilized: "Mark demobilized",
      undoDemobilized: "Undo demobilized",
      openRequest: "Open the request",
      ourQuotation: "Our quotation",
      openDealRoom: "Open the deal room",
      editWorkOrder: "Edit the work order",
      deleteWorkOrder: "Delete the work order",
      removeFromProject: "Remove from the project",
      fileInProject: "File in a project",
    },
    award: {
      title: "Who is supplying this?",
      privateNote: "Your own record. This is not the marketplace accept — it reads nothing from the deal room and writes nothing to it.",
      supplier: "Supplier",
      supplierPlaceholder: "Type the supplier's name",
      notRegistered: "not vendor-registered",
      units: "Units",
      rate: "Rate",
      ratePlaceholder: "SAR, optional",
      basis: "Per",
      daily: "day",
      weekly: "week",
      monthly: "month",
      split: "Split across another supplier",
      counter: "{used} of {qty} assigned",
      overBy: "{n} too many",
      save: "Award",
      unawardTitle: "Un-award this?",
      unawardBody: "{n} units from {supplier} stop being recorded on this site. These go with it:",
      marksGoToo: "The mobilized and demobilized marks",
      unawardAction: "Un-award",
    },
    board: {
      railCounts: "{r} requests · {w} work orders",
      unassigned: "Unassigned",
      unassignedSub: "Posted before you had a site for them. Filing one takes a click and changes nothing about the request.",
      loading: "Opening…",
      namedByUs: "named by us",
      project: "Project",
      location: "Location",
      firstStart: "First start",
      lastEnd: "Last end",
      addWorkOrder: "Add work order",
      newRequest: "New request",
      whatIsHere: "What is on this site",
      ownPeriod: "own dates",
      nothingYet: "Nothing on this site yet. Add a work order for a machine already here, or post a request.",
    },
    chart: {
      of: "of",
      notAwarded: "not awarded yet",
      awaiting: "awaiting award",
      mobilized: "Arrived",
      demobilized: "Left",
    },
    del: {
      confirmTitle: "Delete this project?",
      confirmBody: "“{name}” has nothing filed under it, so nothing is lost. This cannot be undone.",
      confirmAction: "Delete project",
      busyTitle: "This project is in use",
      busyBody: "“{name}” cannot be deleted while these are filed under it:",
      countRequests: "{n} requests",
      countWorkOrders: "{n} work orders",
      countUnits: "{n} units awarded, with their marks and documents",
      finishedLead: "If the job is finished,",
      finished: "you need do nothing. A site reads as ended on its own once its last date passes.",
      wrongPlaceLead: "If one row is in the wrong place,",
      wrongPlace: "use Remove from the project on that row. It keeps everything and simply stops being filed here.",
      mistakeLead: "If the project was made by mistake,",
      mistake: "remove what is filed under it and the delete appears.",
    },
    created: {
      title: "“{name}” is ready",
      sub: "What is on this site?",
      workOrder: "Add a work order",
      workOrderSub: "A machine already on site — your own, or a vendor you use. Private: no supplier ever sees it.",
      request: "Post a new request",
      requestSub: "Ask our suppliers. The site's terms are filled in already — you type the machine.",
      later: "Not now",
    },
    surface: {
      summary: "{n} sites",
        heading: "Your projects",
        sub: "A site you state once. Every request for it starts filled in.",
        newProject: "New project",
        editTitle: "Project settings",
        empty: "No projects yet. Make one and your next request for that site is one line of typing.",
        counts: "{requests} requests · {workOrders} work orders · {units} units awarded",
        stale: "Someone else changed this project while you had it open. Close and reopen it to see their change first.",
        saveFailed: "That did not save. Try again.",
      },
    form: {
        addressRequired: "Add the location first — drop a pin, or type it.",
        whereTitle: "Where",
        address: "Location",
        addressPlaceholder: "Drop a pin above, or type the location",
        title: "Title",
        titlePlaceholder: "Optional",
        titleHint: "Leave it blank and we call it “{fallback}”.",
        whenTitle: "When & terms",
        extendableLabel: "Extendable",
        extendableYes: "May be extended",
        basis: "Rental basis",
        hours: "Hours per day",
        start: "Start date",
        end: "End date",
        paymentTerms: "Payment terms",
        paymentHint: "Your finance team's terms — every machine on this site.",
        applyTitle: "What is already on this site",
        applyNote: "Nothing here changes unless you tick it. A request with bids has one edit left, and ticking it spends that edit.",
        stateFree: "no bids — free to edit",
        stateCosts: "has bids — uses its one edit",
        stateUsed: "edit already used",
        stateClosed: "closed",
        stateWorkOrder: "work order — always editable",
        saveProjectOnly: "Project only",
        saveAndApply: "Save and apply to {n}",
      },
    chips: {
      label: "Project",
      ended: "ended",
      all: "All projects",
    },
    pills: {
      startFrom: "start from",
      pickTemplate: "—",
      templateApplied: "terms copied",
      kindWorkOrder: "Work order",
      kindRequest: "Request",
      site: "site",
      basis: "basis",
      start: "start",
      end: "end",
      paymentTerms: "payment",
      extendable: "extendable",
      editNote: "Every value above is this project's, and editing one here changes only this request.",
      conflict: "You wrote {spoken}, which is not this project's site.",
      keepMine: "Keep what I wrote",
      useProject: "Use the project's site",
      captionLead: "You type the machine.",
      caption: "What it is, its size, how many, and any accessory. Everything else above is filled in already.",
    },
  },
  create: {
    youWrote: "YOU WROTE",
    needsYou: "{n} things need you",
    needsYouOne: "1 thing needs you",
    startOver: "Start over",
    machine: "The machine",
    operator: "The operator",
    operatorRail: "OPERATOR",
    where: "Where it goes",
    when: "When it runs",
    lockedForRequest: "locked for the whole request",
    collapse: "collapse",
    change: "change",
    nextEquipment: "Next equipment",
    previousEquipment: "Previous equipment",
    addAnother: "Add another machine",
    reviewAndSend: "Review & send",
    itemOfCount: "Equipment #{n} of {total}",
    provenance: {
      agent: "AI selected",
      default: "AI selected",
      // PROJ - deliberately NOT "AI selected". The renter chose this themselves, once, for the whole
      // site; calling it the agent's would misattribute their own decision back to them.
      project: "From your project",
      renter: "changed by you",
    },
    machineCard: {
      category: "CATEGORY",
      type: "TYPE",
      size: "SIZE",
      searchTypes: "Search types…",
      searchSizes: "Search sizes…",
      fuel: "FUEL",
      minYear: "MINIMUM YEAR",
      anyYear: "Any year",
      cert: "CERTIFICATE",
      noCert: "No certificate",
      certOther: "Name the certificate",
      quantity: "QUANTITY",
      logistics: "LOGISTICS",
      delivery: "DELIVERY TO SITE",
      returnFromSite: "RETURN FROM SITE",
      fuelResponsibility: "FUEL RESPONSIBILITY",
      attachment: "ATTACHMENT",
      workType: "WORK TYPE",
      workTypePlaceholder: "What will it lift?",
      notes: "NOTES",
      notesOptional: "(optional)",
      notesPlaceholder: "Anything else the supplier should know…",
      unavailableTitle: "{equipment} isn't available from suppliers right now.",
      unavailableWhatsapp: "Message us on WhatsApp",
      unavailableChoose: "Choose another type",
      sourcingRequested: "We're looking for this one — we'll be in touch.",
    },
    operatorCard: {
      /**
       * Short forms for the certificate CHIPS only. `options.safetyCert` spells
       * "SASO technical inspection", which is right in a table cell and wraps this row onto two
       * lines. The stored value is untouched — this is a label, not a vocabulary.
       */
      certShort: {
        "tuv": "TÜV",
        "spsp": "SPSP",
        "saso-technical": "SASO",
        "aramco": "Aramco",
        "other": "Other",
      } as Record<string, string>,
      food: "FOOD",
      accommodation: "ACCOM. & TRANSPORT",
      certificates: "OPERATOR CERTIFICATES",
      moreDetails: "MORE DETAILS",
      nationality: "NATIONALITY",
      nationalityAny: "Any",
      nationalityRestricted: "Restricted",
      nationalityCustom: "Which nationalities work for you?",
      nightShift: "NIGHT SHIFT",
      nightIncluded: "Included",
      nightDayOnly: "Day only",
      noOperator: "No operator needed — we drive it ourselves",
      withOperator: "with an operator",
    },
    wherePanel: {
      searchPlaceholder: "Search a place, or paste a Maps link / coordinates",
      dragHint: "Drag the map, or drop a pin where the machine goes",
      confirm: "This is the right spot",
      useMyLocation: "Use my location",
    },
    whenPanel: {
      dates: "START & END DATE",
      startDate: "START DATE",
      endDate: "END DATE",
      duration: "Duration",
      billing: "HOW YOU'RE BILLED",
      extendable: "Extendable",
      quoteRate: "Suppliers quote you a {basis} rate.",
      moreDetails: "MORE DETAILS",
      moreDetailsHint: "hours a day, overtime",
      hours: "HOURS A DAY",
      hoursStandard: "KSA STANDARD",
      overtime: "OVERTIME RATE",
      // MREQ-AC-33/34 — the charged-day disclosure, in TWO LINES (owner, 2026-08-25): the count and
      // its arithmetic on one, the acknowledgement on the next. The uppercase title above it is gone
      // — the sentence names the number, so a heading only made the block taller.
      // `chargedLine` follows the count, which is rendered beside it at 20px.
      chargedLine: "billable days — {total} calendar days less {fridays} Fridays, at {hours} hours a day",
      chargedLineBasis: "billable days — {total} calendar days less {fridays} Fridays, at {hours} hours a day, billed {basis}",
      chargedNoDates: "Add a start and end date and we'll show exactly how many days you'll be charged for. Fridays are never charged.",
      confirmCharged: "I understand suppliers will quote against {charged} billable days",
      confirmChargedNoDates: "I understand suppliers will price without a fixed end date.",
      // Shown in place of the count when the window runs backwards, which used to read as «1 day».
      datesReversed: "The end date is before the start date. Fix the dates to see billable days.",
      tooShortMonthly: "Your dates cover {days} days. Monthly billing usually needs 30 days or more.",
      tooShortWeekly: "Your dates cover {days} days. Weekly billing usually needs 7 days or more.",
      // ── The condition was inverted, and the Arabic proved it (owner, 2026-08-26) ─────────────────
      // These read «Suppliers quote LOWER when they don't know your dates» — an argument for leaving
      // the dates blank, on the one notice whose whole job is to get them filled in. The Arabic beside
      // it had said the opposite all along («better prices when they DO know»), so the two languages
      // were handing a renter opposite advice out of the same box.
      //
      // The owner's wording, and DURATION is the word that carries it: a supplier who knows how long
      // the machine is committed for prices that period, and one who does not pads for the longest
      // plausible answer. Dates are what he is being asked for; duration is what he does with them.
      //
      // One first sentence across all three, because the reason does not change — only the ask does.
      // A renter who has filled the start in should not be told again that his dates are missing; he
      // should be told which one is.
      nudgeBoth: "Suppliers price lower when they know your duration. Add a start and end date to get better bids.",
      nudgeEnd: "Suppliers price lower when they know your duration. Add an end date to get better bids.",
      nudgeStart: "Suppliers price lower when they know your duration. Add a start date to get better bids.",
    },
    carry: {
      title: "Equipment #{n}",
      locked: "The site and schedule already apply to your whole request, so this equipment uses the same ones automatically.",
      copied: "Its other details — like delivery, food, and certificates — start out matching this equipment, but you can change any of them.",
      editFirst: "Edit this item first",
      continue: "Continue",
    },
    ready: {
      title: "Ready to send",
      subtitle: "This is exactly what suppliers will see. Terms and payment come after the bids arrive — nothing else to fill in here.",
      where: "Where it goes",
      when: "When it runs",
      machineAndOperator: "The machine & operator",
      preferences: "Preferences",
      equipment: "Equipment",
      billingDuration: "BILLING & DURATION",
      hoursOvertime: "HOURS & OVERTIME",
      chargedDays: "DAYS CHARGED",
      equipmentTile: "EQUIPMENT",
      logistics: "LOGISTICS",
      operatorTile: "OPERATOR",
      foodStay: "FOOD & STAY",
      paymentTerms: "PAYMENT TERMS",
      maintenance: "MAINTENANCE",
      maintenanceSla: "RESPONSE TIME",
      budget: "BUDGET CEILING · SAR",
      bidWindow: "OFFER / BID WINDOW",
      supplierFilters: "SUPPLIER FILTERS",
      verifiedOnly: "Verified suppliers only",
      sublettingAllowed: "Allow subletting / crosshire",
      additionalNotes: "ADDITIONAL NOTES",
      notesPlaceholder: "Anything else…",
      optional: "(optional)",
      inviteTitle: "Invite suppliers you already know",
      inviteBody:
        "Once you send this, you'll get a shareable link to invite suppliers to bid — even ones off Moedatech. Their bids land right here for you to compare.",
      backToEditing: "Back to editing",
      send: "Send to suppliers",
      notSet: "not set",
    },
  },
};

export type Dictionary = typeof en;

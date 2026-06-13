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
    request: "Request",
    account: "Account",
    welcome: "Welcome",
    tierGuest: "Guest",
    tierBasic: "Basic rentee",
    tierVerified: "Verified",
    stepsGuest: "1 of 3 steps · complete your profile to unlock requests.",
    stepsBasic: "2 of 3 steps · verify your company to unlock unlimited requests.",
    verifiedNote: "Your company is verified.",
  },
  home: {
    title: "Home",
    eyebrow: "Smart Equipment Marketplace",
    bannerTitle: "Order your next equipment, faster than ever",
    bannerSubtitle: "Post your request and get competitive bids from verified suppliers — or upload an RFQ and let your smart assistant build it automatically.",
    createRequest: "Create request",
    uploadRfq: "Upload RFQ",
    suppliersTitle: "Suggested Suppliers",
    viewAll: "View all",
    showLess: "Show less",
    nudgeGuestTitle: "Complete your profile",
    nudgeGuestBody: "Add your details to unlock requests and bids.",
    nudgeGuestCta: "Complete profile",
    nudgeBasicTitle: "Get verified",
    nudgeBasicBody: "Verify your company to become a trusted renter.",
    nudgeBasicCta: "Get verified",
    verifiedTitle: "You're verified",
    verifiedBody: "Your company is verified.",
    yourRequests: "Your Requests",
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
    heading: "New rental request",
    subheading: "Already have an RFQ? Paste it or upload your files to start a request from it. You review everything before it's sent.",
    tabRfq: "RFQ", // AC-01 tentative
    tabManual: "Manual", // AC-01 tentative
    tabLater: "LATER",
    manualNote: "Manual entry is coming in a later release.",
    pasteLabel: "Paste your RFQ",
    pastePlaceholder: "Paste your equipment list, email, or RFQ here…",
    uploadLabel: "Attach files too",
    uploadOptional: "optional — add as many as you like",
    dropTitle: "Drop files here, or browse",
    uploadHint: "PDF, image, Word or Excel",
    acceptedTypes: "Accepted file types: PDF, image, Word, Excel.", // AC-07 tentative
    fileRejected: "Only PDF, image, Word, or Excel files can be processed.", // AC-07 tentative
    startProcessing: "Continue",
    attachedFiles: "Attached files",
    emptyHint: "Paste text or attach at least one file to start.",
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
      equipmentYear: "Equipment year",
      customize: "Customize…",
      siteAccess: "Site access restrictions",
    },
    certificates: {
      card: "Certificates",
      safety: "Safety",
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
    settingsForAll: "Settings for all items",
    settingsForAllHint: "These apply to every item — you can still override any of them per item.",
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
      cancel: "Cancel", // AC-30/32 tentative
      explainer: "We couldn't find this in our catalogue.",
      // AC-31: prefilled WhatsApp message to Moedatech support requesting the equipment be sourced.
      whatsappMessage: 'Hi Moedatech, I\'m creating an RFQ and need equipment that isn\'t available in the app: "{item}". Please add/source it for me so it is added to my request. Thank you!',
    },
    perItem: {
      quantity: "Quantity",
      operatorNeeded: "Operator needed",
      nightShift: "Night shift",
      nationality: "Nationality",
      nationalityArab: "Arab",
      nationalityOther: "Other",
      applyToAll: "Apply these settings to all items",
      certificate: "Operator certificate",
      transfer: "Transfer",
      accommodation: "Accommodation",
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
      customSla: "Custom SLA",
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
    perItem: "Per item",
    table: {
      equipment: "Equipment",
      category: "Category",
      size: "Size",
      qty: "Qty",
      year: "Year",
      operator: "Operator",
      fuel: "Fuel",
      fuelResp: "Fuel resp.",
      delivery: "Delivery",
      return: "Return",
      certificate: "Certificate",
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
  guest: {
    blockTitle: "Create an account to continue", // AC-02
    blockBody: "RFQ creation is available to registered renters. Create an account to start a request.",
    createAccount: "Create account",
  },
  gate: {
    confirmLocation: "Confirm the location to continue.", // AC-12/16
    chooseRentalBasis: "Choose a rental basis to continue.", // AC-12/13
    resolveLocationConflict: "Resolve the location conflict to continue.", // AC-47
    resolveItems: "Resolve the flagged equipment items to continue.", // AC-29
  },
  errors: {
    emptyTitle: "We couldn't read a request from that", // AC-09 tentative
    emptyBody: "Try again, or switch to the Manual tab.",
    networkTitle: "Connection problem", // AC-10 tentative
    networkBody: "Something went wrong. Your input is saved — try again.",
    switchManual: "Switch to Manual",
  },
  options: {
    rentalBasis: { daily: "Daily", weekly: "Weekly", monthly: "Monthly" },
    overtime: { without: "Without", "1.5x": "1.5×", "2x": "2×" },
    equipmentYear: { any: "Any" },
    siteAccess: {
      "weight-limit": "Weight limit",
      "height-limit": "Height limit",
      "security-permit": "Security permit",
      "delivery-window": "Delivery window",
      "no-overnight-storage": "No overnight storage",
      "special-transport-permit": "Special transport permit",
    },
    safetyCert: { tuv: "TÜV", spsp: "SPSP", "saso-technical": "SASO technical inspection" },
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
    maintenanceSla: { "4h": "4h", "8h": "8h", "24h": "24h", custom: "Custom" },
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
    errors: {
      invalid_phone: "Enter a valid phone number.",
      invalid_code: "That code isn't right. Try again.", // AC-09
      expired: "That code has expired. Request a new one.", // AC-11
      locked: "Too many attempts. Request a new code.", // AC-10
      send_failed: "We couldn't send the code. Please try again.", // AC-15
      offline: "You appear to be offline. Check your connection and try again.", // AC-24
      unknown: "Something went wrong. Please try again.",
    },
  },
  onboarding: {
    step1: "Create account",
    step2: "Verify company",
    later: "later",
    title: "Create your account",
    subtitle: "Complete your details to start requesting equipment from verified suppliers.",
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone number",
    verified: "Verified",
    city: "City",
    jobTitle: "Job title",
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
      whatsapp: "Enter a valid Saudi mobile number.", // AC-04
      submit: "We couldn't save your details. Please try again.",
      offline: "You appear to be offline. Your details are kept — try again.", // AC-23
    },
  },
  verify: {
    step1: "Create account",
    step2: "Verify company",
    done: "done",
    title: "Verify your company",
    subtitle: "Submit your company details for review to become a verified renter.",
    authorityRole: "Your authority",
    roleOwner: "Owner",
    roleManager: "Manager",
    roleEmployee: "Employee",
    companyName: "Company name",
    nationalId: "National ID",
    companyCity: "Company city",
    cityPlaceholder: "Select a city",
    companyAddress: "Company address",
    companyLocation: "Company location",
    crDoc: "Commercial Registration (CR)",
    vatDoc: "VAT certificate",
    nationalAddressDoc: "National Address document",
    localContentDoc: "Local Content certificate",
    sasoDoc: "SASO Heavy Equipment certificate",
    otherDoc: "Other document",
    docsTitle: "Company documents",
    moreDocsTitle: "Additional documents",
    detailsTitle: "Company details",
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
      companyName: "Company name must be 2–200 characters.", // AC-09
      cr: "The CR document is required.", // AC-10
      vat: "The VAT document is required.", // AC-10
      nationalAddress: "The National Address document is required.", // required to match the app (company_verification_page.dart:302 + '*' label); AC-10 lists only CR/VAT
      docType: "Only JPEG, PNG, WebP, or PDF files are accepted.", // AC-11
      submit: "We couldn't submit. Please try again.",
      offline: "You appear to be offline. Your input is kept — try again.", // AC-23
    },
  },
};

export type Dictionary = typeof en;

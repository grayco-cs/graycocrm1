import React, { useState, useEffect, useRef } from 'react';
import {
  Hammer, FileText, Upload, Download, Plus, X, Check, Clock,
  MapPin, DollarSign, Users, Link as LinkIcon, LogOut, Globe,
  Eye, EyeOff, AlertCircle, Briefcase, Send, Trash2, Edit3,
  ExternalLink, Calendar, Building2, Shield, UserCheck, UserX,
  Loader2, Sparkles, ChevronLeft, ChevronRight, Hash, Mail, Phone, FileSpreadsheet,
  ClipboardList, MessageSquare, TrendingUp, Settings
} from 'lucide-react';

// Records and files go through the portal's server function (it filters what each person sees)
import { sget as _sget, sset as _sset, sdel as _sdel, sloadMany, COLLECTIONS, openFile, uploadDataUrl,
  saveGeneration, savesPending, setSaveErrorHandler, rememberLoaded } from './storage.js';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, changePassword as authChangePw,
  checkPassword, getCurrentUser, inviteInfo as fetchInviteInfo, requestPasswordReset, takeRecoveryFromUrl, api } from './auth.js';
import { EMBEDDED, COMPANY as CFG_COMPANY } from './config.js';
import logoUrl from './grayco-logo.png';

/* ============================================================
   TRANSLATIONS — every visible string is keyed
   ============================================================ */
const T = {
  en: {
    appName: 'Subcontractor Portal',
    companyName: 'GrayCo',
    companyTag: 'Construction Services',
    login: 'Log In', logout: 'Log Out', register: 'Request Access',
    username: 'Username', password: 'Password', email: 'Email',
    fullName: 'Full Name',
    phone: 'Phone', trades: 'Trades (comma separated)',
    submit: 'Submit', cancel: 'Cancel', save: 'Save', edit: 'Edit', delete: 'Delete',
    confirm: 'Confirm', back: 'Back', view: 'View', close: 'Close',
    needAccount: "Don't have an account?", haveAccount: 'Already have an account?',
    accountPending: 'Your account is pending approval. A GrayCo team member will review your request.',
    invalidLogin: 'Invalid username or password.',
    requestSubmitted: 'Request submitted! You will be notified when approved.',
    // Nav
    jobs: 'Open Jobs', myBids: 'My Bids', allBids: 'All Bids',
    pendingSubs: 'Pending Approvals', approvedSubs: 'Approved Subs',
    addJob: 'Add Job', adminLinks: 'Plan Rooms & Links',
    settings: 'Settings',
    // Job fields
    projectTitle: 'Project Title', address: 'Project Address',
    bidDueDate: 'Bid Due Date', scope: 'Scope of Work',
    specifications: 'Specifications', notes: 'Notes',
    plans: 'Plans & Documents', uploadPlans: 'Upload Plans (PDF)',
    analyzeWithAI: 'Auto-Fill from Plans (AI)',
    analyzing: 'Analyzing plans with AI…',
    downloadPlans: 'Download Plans',
    // Bid
    enterBid: 'Submit Bid', bidAmount: 'Bid Amount ($)',
    bidAttachments: 'Attach Bid Documents (optional)',
    bidAttachmentsHint: 'Attach your PDF proposal, breakdown, or exclusions letter.',
    bidScope: 'Scope Included in Bid', bidNotes: 'Bid Notes / Exclusions',
    bidSubmitted: 'Bid submitted successfully.',
    yourBid: 'Your Bid', noBidsYet: 'No bids submitted yet.',
    // Status
    open: 'Open', closed: 'Closed', awarded: 'Awarded',
    pending: 'Pending', approved: 'Approved',
    daysLeft: 'days left', dueToday: 'Due Today', overdue: 'Overdue',
    // Admin links
    addLink: 'Add Link', linkTitle: 'Title', linkUrl: 'URL', linkCategory: 'Category',
    linkNotes: 'Notes', adminOnly: 'Admin Only — not visible to subcontractors',
    // Empty states
    noJobs: 'No open jobs at this time. Check back soon.',
    noJobsAdmin: 'No jobs yet. Click "Add Job" to create your first.',
    noPending: 'No pending approval requests.',
    noLinks: 'No links saved. Add plan room URLs and other resources.',
    // AI feature
    aiHelpText: 'Upload PDF plans first, then click "Auto-Fill from Plans" to let Claude extract the address, scope, and key specifications automatically.',
    aiSuccess: 'Plan analysis complete. Review and edit the auto-filled fields below.',
    aiError: 'Could not analyze plans. Please fill the fields manually.',
    // Misc
    role: 'Role', admin: 'Admin', sub: 'Subcontractor',
    createdBy: 'Posted by', createdOn: 'Posted',
    bidsReceived: 'Bids Received', viewBids: 'View Bids',
    welcome: 'Welcome', selectLanguage: 'Language',
    confirmDelete: 'Are you sure you want to delete this?',
    fileTooLarge: 'File is too large.',
    approve: 'Approve', deny: 'Deny',
    bid: 'Bid', bids: 'Bids',
    chooseFile: 'Choose plan files (PDF, ZIP, DWG, images)…',
    projectManager: 'Project Manager',
    estimator: 'Estimator',
    // Estimating
    estimating: 'Estimating', estimateBuilder: 'Estimate Builder',
    acceptBid: 'Accept Bid', accepted: 'Accepted', rejected: 'Rejected',
    rejectBid: 'Reject', unacceptBid: 'Un-accept',
    bidAccepted: 'Bid accepted and added to estimate.',
    addToEstimate: 'Add to Estimate',
    lineItems: 'Line Items', tradeOrCategory: 'Trade / Category',
    direct: 'Direct Cost', directTotal: 'Total Direct Cost',
    overhead: 'Overhead', overheadPct: 'Overhead %',
    profit: 'Profit', profitPct: 'Profit %',
    contingency: 'Contingency', contingencyPct: 'Contingency %',
    bond: 'Bond', bondPct: 'Bond %',
    tax: 'Tax', taxPct: 'Tax %',
    finalEstimate: 'Final Estimate', grandTotal: 'Grand Total',
    margin: 'Margin', markup: 'Markup',
    copyEstimate: 'Copy Estimate', copyForGDrive: 'Copy for Google Drive',
    copyTSV: 'Copy as Spreadsheet (TSV)',
    copySummary: 'Copy Summary',
    exportCSV: 'Export CSV',
    estimateNumber: 'Estimate #',
    addLineItem: 'Add Line Item', addManualItem: '+ Add Manual Line',
    deleteItem: 'Remove',
    qty: 'Qty', unit: 'Unit', unitPrice: 'Unit Price', extended: 'Extended',
    descrip: 'Description',
    noEstimates: 'No estimates yet. Open a job and accept bids to start building one.',
    noBidsAcceptedYet: 'No bids have been accepted on this job yet.',
    estimateNotes: 'Estimate Notes',
    estimateStatus: 'Status',
    statusDraft: 'Draft', statusFinal: 'Final', statusSent: 'Sent',
    markFinal: 'Mark Final', markDraft: 'Mark Draft',
    copiedToClipboard: 'Copied to clipboard.',
    summary: 'Summary',
    bidNumber: 'Bid', subTotal: 'Subtotal',
    // Visibility, invites, won jobs, tracking
    visibility: 'Visibility', public: 'Public', private: 'Private',
    publicHint: 'All approved subs can see this job.',
    privateHint: 'Only invited subs can see this job.',
    inviteSubs: 'Invite Subs', inviteByEmail: 'Invite by Email',
    inviteLink: 'Invite Link', copyInviteLink: 'Copy Invite Link',
    invitedSubs: 'Invited Subs', enterEmails: 'Enter emails (comma or newline separated)',
    inviteSent: 'Invite added — copy the link to share.',
    activity: 'Activity', activityLog: 'Activity Log',
    viewedAt: 'viewed', downloadedAt: 'downloaded',
    lastActivity: 'Last Activity', noActivity: 'No activity yet.',
    markWon: 'Mark Won', markLost: 'Mark Lost', wonJob: 'WON', lostJob: 'LOST',
    won: 'Won', lost: 'Lost',
    planArchive: 'Plan Archive', archivedPlans: 'Archived plans (won jobs)',
    permanent: 'PERMANENT',
    emailBidToOffice: 'Email Bid to Office',
    bidEmailPrepared: 'Bid email opened in your mail app.',
    signupWithInvite: 'You were invited to bid on:',
    // Bid results sharing
    bidResults: 'Bid Results',
    resultsSharing: 'Bid Results Sharing',
    resultsPrivate: 'Private', resultsPrivateHint: 'Subs never see how their bid ranked.',
    resultsRanks: 'Share Placement Only', resultsRanksHint: "Subs see their own place (e.g. '3rd'). No total count, no other amounts, no other names.",
    resultsFull: 'Share Placement + All Amounts', resultsFullHint: "Subs see their place (e.g. '2nd of 7') and the full ranked list of bid amounts. Company names still hidden.",
    yourPlacement: 'Your bid placement:',
    place: 'place', placeOf: 'of', totalBids: 'total bids',
    winningBid: 'Winning bid:',
    // Sub stats
    myStats: 'My Bid Stats', portalActivity: 'Your activity on the GrayCo portal',
    statsBidsSubmitted: 'Bids Submitted', statsBidsAccepted: 'Bids Accepted',
    statsBidsPending: 'Bids Pending', statsJobsWon: 'Jobs Won',
    statsWinRate: 'Win Rate', statsTotalValue: 'Total Won Value',
    statsNoData: 'Submit your first bid to start building your history.',
    // GrayCo's role on this project + trades sought
    grayCoRole: "GrayCo's Role on This Project",
    roleGC: 'General Contractor', roleSub: 'Subcontractor',
    roleGCHint: 'GrayCo is the GC — soliciting bids from all trades needed to build it out.',
    roleSubHint: "GrayCo is bidding as a sub — soliciting bids from other subs to help fulfill our scope.",
    tradesSought: 'Trades / Scope We Need Bids For',
    tradesSoughtHint: 'Example: "Drywall, framing, insulation" or "Roofing only — underlayment, sheet metal, cap sheet"',
    ourRoleOnJob: 'Our Role on This Project',
    weAreBidding: 'We are bidding:',
    // Trade-specific scopes
    tradeScopes: 'Trade-Specific Scopes',
    tradeScopesHint: 'Break scope out by trade when bidding several trades on one job. Optional — you can just use the master Scope field above if simpler.',
    addTradeScope: '+ Add Trade Scope',
    tradeName: 'Trade',
    tradeScopeText: 'Scope for this trade',
    removeTradeScope: 'Remove',
    tradeNamePlaceholder: 'e.g. Drywall, Framing, Roofing',
    tradeScopePlaceholder: 'What this trade covers on this specific project…',
    // Takeoff / measure tool
    measure: 'Measure',
    takeoff: 'Takeoff',
    setScale: 'Set Scale',
    measureLine: 'Line', measureRect: 'Rectangle', measurePoly: 'Area (Polygon)',
    undo: 'Undo',
    clearAll: 'Clear All',
    scaleNotSet: 'Scale not set yet. Click "Set Scale", pick two points on a known dimension, then type its real length.',
    scaleSetPrompt: 'What is the real distance between those two points? (e.g. 10 or 10ft or 10\'6")',
    measurements: 'Measurements',
    noMeasurements: 'No measurements yet. Pick a tool and start clicking.',
    closeTakeoff: 'Close',
    takeoffMode: 'Mode',
    scaleSet: 'Scale set:',
    perPixel: 'per pixel',
    zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Reset Zoom',
    prevPage: 'Prev', nextPage: 'Next', pageOf: 'of',
    layer: 'Layer', layers: 'Layers', addLayer: '+ Add Layer',
    label: 'Label', rename: 'Rename',
    shareWithGrayCo: 'Share with GrayCo',
    finishPolygon: 'Double-click or press Enter to close the shape',
    subTakeoffs: 'Subcontractor Takeoffs',
    noSubTakeoffs: 'No sub has shared takeoffs on this job yet.',
    viewTakeoff: 'View', readOnlyBanner: 'Read-only — viewing takeoffs shared by',
    // In-portal messaging (per-job thread)
    messages: 'Messages',
    messagesHint: 'Messages here reach the assigned PM, Estimator, and office. They also carry over to the CRM once wired.',
    typeMessage: 'Type a message…',
    sendMessage: 'Send',
    noMessages: 'No messages yet. Ask a question, request a walkthrough, or clarify scope.',
    messageFrom: 'from',
    unread: 'unread',
    graycoTeam: 'GrayCo Team',
    // Password change
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm New Password',
    passwordUpdated: 'Password updated. You\'re all set.',
    passwordMismatch: 'New passwords don\'t match.',
    passwordTooShort: 'Password must be at least 8 characters.',
    wrongCurrent: 'Current password is incorrect.',
    mustChangeTitle: 'Set your password',
    mustChangeHint: 'You\'re logged in with the default password. Please set a new one before continuing.',
    // Soft prompt after login when user still has default password
    suggestChangeTitle: 'Would you like to change your password?',
    suggestChangeHint: 'You\'re using a default password. For better security, pick your own. You can also keep the default for now and change it later from the header.',
    keepDefaultForNow: 'Keep default for now',
    suggestStrongPassword: '✨ Suggest a Strong Password',
    suggestedPasswordUsed: 'Suggested password filled in — write it down before saving.',
    // Expanded sub registration fields
    signupCompanyInfo: 'Company Information',
    signupContactInfo: 'Primary Contact',
    signupBusinessDetails: 'Business Details',
    signupOptionalInfo: 'Optional but Helpful',
    signupDocsInfo: 'Company Documents',
    signupDocsHint: 'You can upload these now to speed things up, or add them later from My Documents. Note: W-9, General Liability, and Workers Comp are all REQUIRED before you can submit any bids.',
    legalCompanyName: 'Legal Company Name',
    legalCompanyNameHint: 'The exact name that appears on your W-9 and insurance certificates.',
    dbaName: 'DBA / Trade Name',
    dbaNameHint: 'If you do business under a different name, list it here.',
    businessAddress: 'Business Address',
    businessCity: 'City', businessState: 'State', businessZip: 'ZIP',
    website: 'Website',
    yearsInBusiness: 'Years in Business',
    numEmployees: 'Number of Employees',
    unionAffiliation: 'Union Affiliation',
    serviceArea: 'Service Area',
    serviceAreaHint: 'Cities, counties, or states where you take work.',
    licenseNumbers: 'License Numbers',
    licenseNumbersHint: 'e.g. "TN GC #12345, MS Electrical #67890" — separate multiple with commas.',
    einTaxId: 'EIN / Tax ID (last 4 digits only)',
    einTaxIdHint: 'For our records — never displayed to anyone else. Full EIN goes on your W-9.',
    contactTitle: 'Your Title / Role',
    tradesPerformed: 'Trades You Perform',
    tradesPerformedHint: 'Select all that apply. This helps us match you to relevant projects.',
    // Duplicate warning
    possibleDuplicate: 'Possible Match Found',
    possibleDuplicateHint: 'A company with similar info is already in our system:',
    continueAnyway: 'Yes, this is a NEW company — continue',
    imAlreadyRegistered: 'That\'s us — I already have an account',
    // Signup completion
    signupComplete: 'Account created! You can bid on public jobs immediately. Complete your documents to unlock all features.',
    // Scope/spec attachments
    scopeAttachments: 'Scope Documents',
    specAttachments: 'Specification Documents',
    attachDoc: 'Attach Document',
    orTypeScope: 'Or type scope below:',
    orTypeSpecs: 'Or type specifications below:',
    attachHint: 'Upload PDF, Word, or other reference documents.',
    // PO / project reference (for CRM handoff — see docs/CRM-INTEGRATION.md)
    poNumber: 'PO Number', poNumberHint: 'Leave blank and one will be auto-generated (like PO-2026-0001). The CRM will use this same PO when the job is officially added there.',
    projectId: 'CRM Project ID', projectIdHint: 'Optional. Fill in only if this bid ties to a project that already exists in the CRM.',
    projectRef: 'Project Ref',
    pmContact: 'PM Contact',
    callPM: 'Call', emailPM: 'Email',
    teamMembers: 'Team', editTeam: 'Edit Team Contact Info',
    title_field: 'Title', updateContact: 'Update Contact Info',
    contactSaved: 'Contact info saved.',
    bidsEmailedTo: 'Send bids and questions to:',
    selectPM: 'Select project manager…',
    callAboutJob: 'Call about this job',
    mySettings: 'My Documents',
    myWork: 'My Work & Pay',
    pendingBanner: 'Your account is waiting for GrayCo to approve it. Meanwhile, upload your W-9 and insurance certificates here — it speeds up approval. Questions? Call 901-585-0944.',
    forgotPassword: 'Forgot password?',
    resetSent: 'If that e-mail has an account, a link to choose a new password is on its way.',
    loginEmail: 'Email',
    mwIntro: 'Your work with GrayCo, straight from our books: jobs you are on, invoices we have received from you and where each one stands, and what we have on file for your insurance and taxes.',
    mwNotLinked: 'Your company is not connected to GrayCo\'s records yet. Once the office links your account, your jobs, payments and 1099 information will show here. Call 901-585-0944 if you have already worked with us.',
    mwJobs: 'Jobs with GrayCo', mwNoJobs: 'No jobs on file with you yet.',
    mwScopes: 'Scopes of work sent to you', mwAgreements: 'Subcontract agreements',
    mwPay: 'Invoices & payments', mwNoPay: 'No invoices from you on file yet.',
    mwWaiting: 'Waiting for approval', mwApproved: 'Approved, not yet paid', mwPaidYear: 'Paid this year', mwPaidAll: 'Paid all time',
    mwInsurance: 'Insurance & papers on file', mwOkToPay: 'Everything GrayCo needs to pay you is on file.',
    mwNotOkToPay: 'Something GrayCo needs before paying you is missing or expired. Upload it under My Documents.',
    mwTax: '1099 information', mw1099Note: 'Totals of the payments GrayCo has recorded for your invoices, by year. GrayCo sends a 1099-NEC for each year that totals $600 or more. Your official 1099 comes from GrayCo by January 31.',
    mwRefresh: 'Refresh',
    companyDocs: 'Company Documents',
    uploadDoc: 'Upload Document', docType: 'Document Type',
    docLabel: 'Label / Description', expirationDate: 'Expiration Date (if any)',
    docExpired: 'EXPIRED', docExpiringSoon: 'Expires Soon',
    docCurrent: 'Current', docNoExp: 'No Expiration',
    docW9: 'W-9 Form', docInsGL: 'General Liability Insurance',
    docInsWC: 'Workers Comp Insurance', docInsAuto: 'Auto Insurance',
    docLicense: 'Contractor License', docOther: 'Other',
    docsRequired: 'Required to bid:',
    docsBidBlocked: 'You cannot submit a bid until your documents are current. Please update your documents in "My Documents".',
    docsMissing: 'Missing or expired required documents',
    viewSubDocs: 'View Documents', subDocuments: 'Subcontractor Documents',
    noDocsYet: 'No documents uploaded yet.',
    allCurrent: 'All documents are current.',
    daysUntilExp: 'days until expiration',
  },
  es: {
    appName: 'Portal de Subcontratistas',
    companyName: 'GrayCo',
    companyTag: 'Servicios de Construcción',
    login: 'Iniciar Sesión', logout: 'Cerrar Sesión', register: 'Solicitar Acceso',
    username: 'Usuario', password: 'Contraseña', email: 'Correo Electrónico',
    fullName: 'Nombre Completo',
    phone: 'Teléfono', trades: 'Especialidades (separadas por coma)',
    submit: 'Enviar', cancel: 'Cancelar', save: 'Guardar', edit: 'Editar', delete: 'Eliminar',
    confirm: 'Confirmar', back: 'Atrás', view: 'Ver', close: 'Cerrar',
    needAccount: '¿No tiene cuenta?', haveAccount: '¿Ya tiene cuenta?',
    accountPending: 'Su cuenta está pendiente de aprobación. Un miembro del equipo de GrayCo revisará su solicitud.',
    invalidLogin: 'Usuario o contraseña inválidos.',
    requestSubmitted: '¡Solicitud enviada! Le notificaremos cuando sea aprobada.',
    jobs: 'Trabajos Abiertos', myBids: 'Mis Ofertas', allBids: 'Todas las Ofertas',
    pendingSubs: 'Aprobaciones Pendientes', approvedSubs: 'Subcontratistas Aprobados',
    addJob: 'Agregar Trabajo', adminLinks: 'Planos y Enlaces',
    settings: 'Configuración',
    projectTitle: 'Título del Proyecto', address: 'Dirección del Proyecto',
    bidDueDate: 'Fecha Límite de Oferta', scope: 'Alcance del Trabajo',
    specifications: 'Especificaciones', notes: 'Notas',
    plans: 'Planos y Documentos', uploadPlans: 'Subir Planos (PDF)',
    analyzeWithAI: 'Auto-Llenar desde los Planos (IA)',
    analyzing: 'Analizando los planos con IA…',
    downloadPlans: 'Descargar Planos',
    enterBid: 'Enviar Oferta', bidAmount: 'Monto de la Oferta ($)',
    bidAttachments: 'Adjuntar Documentos de Oferta (opcional)',
    bidAttachmentsHint: 'Adjunte su propuesta PDF, desglose o carta de exclusiones.',
    bidScope: 'Alcance Incluido en la Oferta', bidNotes: 'Notas / Exclusiones de la Oferta',
    bidSubmitted: 'Oferta enviada con éxito.',
    yourBid: 'Su Oferta', noBidsYet: 'Aún no se han enviado ofertas.',
    open: 'Abierto', closed: 'Cerrado', awarded: 'Adjudicado',
    pending: 'Pendiente', approved: 'Aprobado',
    daysLeft: 'días restantes', dueToday: 'Vence Hoy', overdue: 'Vencido',
    addLink: 'Agregar Enlace', linkTitle: 'Título', linkUrl: 'URL', linkCategory: 'Categoría',
    linkNotes: 'Notas', adminOnly: 'Solo Administradores — no visible para subcontratistas',
    noJobs: 'No hay trabajos abiertos en este momento. Vuelva pronto.',
    noJobsAdmin: 'Aún no hay trabajos. Haga clic en "Agregar Trabajo" para crear el primero.',
    noPending: 'No hay solicitudes de aprobación pendientes.',
    noLinks: 'No hay enlaces guardados. Agregue URLs de planos y otros recursos.',
    aiHelpText: 'Suba primero los planos en PDF, luego haga clic en "Auto-Llenar desde los Planos" para que Claude extraiga automáticamente la dirección, el alcance y las especificaciones clave.',
    aiSuccess: 'Análisis de planos completo. Revise y edite los campos auto-llenados a continuación.',
    aiError: 'No se pudieron analizar los planos. Por favor complete los campos manualmente.',
    role: 'Rol', admin: 'Administrador', sub: 'Subcontratista',
    createdBy: 'Publicado por', createdOn: 'Publicado',
    bidsReceived: 'Ofertas Recibidas', viewBids: 'Ver Ofertas',
    welcome: 'Bienvenido', selectLanguage: 'Idioma',
    confirmDelete: '¿Está seguro de que desea eliminar esto?',
    fileTooLarge: 'El archivo es demasiado grande.',
    approve: 'Aprobar', deny: 'Rechazar',
    bid: 'Oferta', bids: 'Ofertas',
    chooseFile: 'Elegir archivos de planos (PDF, ZIP, DWG, imágenes)…',
    projectManager: 'Gerente de Proyecto',
    estimator: 'Estimador',
    // Estimating
    estimating: 'Estimación', estimateBuilder: 'Constructor de Estimación',
    acceptBid: 'Aceptar Oferta', accepted: 'Aceptada', rejected: 'Rechazada',
    rejectBid: 'Rechazar', unacceptBid: 'Cancelar Aceptación',
    bidAccepted: 'Oferta aceptada y agregada a la estimación.',
    addToEstimate: 'Agregar a Estimación',
    lineItems: 'Partidas', tradeOrCategory: 'Especialidad / Categoría',
    direct: 'Costo Directo', directTotal: 'Costo Directo Total',
    overhead: 'Gastos Generales', overheadPct: 'Gastos Generales %',
    profit: 'Utilidad', profitPct: 'Utilidad %',
    contingency: 'Contingencia', contingencyPct: 'Contingencia %',
    bond: 'Fianza', bondPct: 'Fianza %',
    tax: 'Impuesto', taxPct: 'Impuesto %',
    finalEstimate: 'Estimación Final', grandTotal: 'Total General',
    margin: 'Margen', markup: 'Recargo',
    copyEstimate: 'Copiar Estimación', copyForGDrive: 'Copiar para Google Drive',
    copyTSV: 'Copiar como Hoja de Cálculo (TSV)',
    copySummary: 'Copiar Resumen',
    exportCSV: 'Exportar CSV',
    estimateNumber: 'Estimación #',
    addLineItem: 'Agregar Partida', addManualItem: '+ Agregar Manual',
    deleteItem: 'Eliminar',
    qty: 'Cant.', unit: 'Unidad', unitPrice: 'Precio Unit.', extended: 'Extendido',
    descrip: 'Descripción',
    noEstimates: 'Aún no hay estimaciones. Abra un trabajo y acepte ofertas para comenzar.',
    noBidsAcceptedYet: 'Aún no se han aceptado ofertas en este trabajo.',
    estimateNotes: 'Notas de Estimación',
    estimateStatus: 'Estado',
    statusDraft: 'Borrador', statusFinal: 'Final', statusSent: 'Enviada',
    markFinal: 'Marcar Final', markDraft: 'Marcar Borrador',
    copiedToClipboard: 'Copiado al portapapeles.',
    summary: 'Resumen',
    bidNumber: 'Oferta', subTotal: 'Subtotal',
    // Visibility, invites, won jobs, tracking
    visibility: 'Visibilidad', public: 'Público', private: 'Privado',
    publicHint: 'Todos los subcontratistas aprobados pueden ver este trabajo.',
    privateHint: 'Solo los subcontratistas invitados pueden ver este trabajo.',
    inviteSubs: 'Invitar Subs', inviteByEmail: 'Invitar por Email',
    inviteLink: 'Enlace de Invitación', copyInviteLink: 'Copiar Enlace',
    invitedSubs: 'Subs Invitados', enterEmails: 'Ingrese correos (separados por coma o línea nueva)',
    inviteSent: 'Invitación agregada — copie el enlace para compartir.',
    activity: 'Actividad', activityLog: 'Registro de Actividad',
    viewedAt: 'vio', downloadedAt: 'descargó',
    lastActivity: 'Última Actividad', noActivity: 'Sin actividad aún.',
    markWon: 'Marcar Ganado', markLost: 'Marcar Perdido', wonJob: 'GANADO', lostJob: 'PERDIDO',
    won: 'Ganado', lost: 'Perdido',
    planArchive: 'Archivo de Planos', archivedPlans: 'Planos archivados (trabajos ganados)',
    permanent: 'PERMANENTE',
    emailBidToOffice: 'Enviar Oferta a la Oficina',
    bidEmailPrepared: 'Correo de oferta abierto en su aplicación de correo.',
    signupWithInvite: 'Fue invitado a ofertar en:',
    bidResults: 'Resultados de Ofertas',
    resultsSharing: 'Compartir Resultados',
    resultsPrivate: 'Privado', resultsPrivateHint: 'Los subs nunca ven cómo se clasificó su oferta.',
    resultsRanks: 'Solo Posición', resultsRanksHint: "Los subs ven solo su lugar (ej. '3er'). Sin conteo total, sin otros montos, sin otros nombres.",
    resultsFull: 'Posición + Montos', resultsFullHint: "Los subs ven su lugar (ej. '2 de 7') y la lista ordenada completa de montos. Nombres de compañías siguen ocultos.",
    yourPlacement: 'Su posición:',
    place: 'lugar', placeOf: 'de', totalBids: 'ofertas totales',
    winningBid: 'Oferta ganadora:',
    myStats: 'Mis Estadísticas', portalActivity: 'Su actividad en el portal de GrayCo',
    statsBidsSubmitted: 'Ofertas Enviadas', statsBidsAccepted: 'Ofertas Aceptadas',
    statsBidsPending: 'Ofertas Pendientes', statsJobsWon: 'Trabajos Ganados',
    statsWinRate: 'Tasa de Éxito', statsTotalValue: 'Valor Total Ganado',
    statsNoData: 'Envíe su primera oferta para comenzar su historial.',
    grayCoRole: 'Rol de GrayCo en Este Proyecto',
    roleGC: 'Contratista General', roleSub: 'Subcontratista',
    roleGCHint: 'GrayCo es el GC — solicitando ofertas de todas las especialidades necesarias.',
    roleSubHint: 'GrayCo está ofertando como sub — solicitando ofertas de otros subs.',
    tradesSought: 'Especialidades / Alcance Que Buscamos',
    tradesSoughtHint: 'Ejemplo: "Tabla roca, estructura, aislamiento" o "Solo techado — impermeabilizante, lámina, cubierta"',
    ourRoleOnJob: 'Nuestro Rol en Este Proyecto',
    weAreBidding: 'Estamos ofertando:',
    tradeScopes: 'Alcances por Especialidad',
    tradeScopesHint: 'Divida el alcance por especialidad si oferta varias en un trabajo. Opcional.',
    addTradeScope: '+ Agregar Alcance',
    tradeName: 'Especialidad',
    tradeScopeText: 'Alcance para esta especialidad',
    removeTradeScope: 'Eliminar',
    tradeNamePlaceholder: 'ej. Tabla Roca, Estructura, Techado',
    tradeScopePlaceholder: 'Qué cubre esta especialidad en este proyecto…',
    measure: 'Medir', takeoff: 'Medición',
    setScale: 'Configurar Escala',
    undo: 'Deshacer', clearAll: 'Borrar Todo',
    scaleNotSet: 'Escala no configurada. Haga clic en "Configurar Escala", elija dos puntos y escriba la distancia real.',
    scaleSetPrompt: '¿Cuál es la distancia real entre esos dos puntos? (ej. 10 o 10ft)',
    measurements: 'Mediciones', noMeasurements: 'Sin mediciones aún.',
    closeTakeoff: 'Cerrar', takeoffMode: 'Modo',
    scaleSet: 'Escala:', perPixel: 'por píxel',
    // Takeoff extras (multi-page, zoom, layers, sharing)
    measureLine: 'Línea', measureRect: 'Rectángulo', measurePoly: 'Área (Polígono)',
    zoomIn: 'Acercar', zoomOut: 'Alejar', zoomReset: 'Restablecer Zoom',
    prevPage: 'Anterior', nextPage: 'Siguiente', pageOf: 'de',
    layer: 'Capa', layers: 'Capas', addLayer: '+ Agregar Capa',
    label: 'Etiqueta', rename: 'Renombrar',
    shareWithGrayCo: 'Compartir con GrayCo',
    finishPolygon: 'Doble clic o presione Enter para cerrar la forma',
    subTakeoffs: 'Mediciones de Subcontratistas',
    noSubTakeoffs: 'Ningún sub ha compartido mediciones en este trabajo aún.',
    viewTakeoff: 'Ver', readOnlyBanner: 'Solo lectura — viendo mediciones compartidas por',
    messages: 'Mensajes',
    messagesHint: 'Los mensajes llegan al PM, Estimador y oficina asignados. También pasarán al CRM cuando esté conectado.',
    typeMessage: 'Escriba un mensaje…',
    sendMessage: 'Enviar',
    noMessages: 'Aún no hay mensajes. Pregunte, pida una visita o aclare el alcance.',
    messageFrom: 'de', unread: 'no leído',
    graycoTeam: 'Equipo GrayCo',
    changePassword: 'Cambiar Contraseña',
    currentPassword: 'Contraseña Actual',
    newPassword: 'Nueva Contraseña',
    confirmPassword: 'Confirmar Nueva Contraseña',
    passwordUpdated: 'Contraseña actualizada.',
    passwordMismatch: 'Las contraseñas no coinciden.',
    passwordTooShort: 'La contraseña debe tener al menos 8 caracteres.',
    wrongCurrent: 'La contraseña actual es incorrecta.',
    mustChangeTitle: 'Establezca su contraseña',
    mustChangeHint: 'Inició sesión con la contraseña predeterminada. Establezca una nueva antes de continuar.',
    suggestChangeTitle: '¿Desea cambiar su contraseña?',
    suggestChangeHint: 'Está usando la contraseña predeterminada. Para mayor seguridad, elija la suya. También puede mantener la predeterminada por ahora y cambiarla luego desde el encabezado.',
    keepDefaultForNow: 'Mantener por ahora',
    suggestStrongPassword: '✨ Sugerir Contraseña Fuerte',
    suggestedPasswordUsed: 'Contraseña sugerida completada — anótela antes de guardar.',
    signupCompanyInfo: 'Información de la Compañía',
    signupContactInfo: 'Contacto Principal',
    signupBusinessDetails: 'Detalles del Negocio',
    signupOptionalInfo: 'Opcional pero Útil',
    signupDocsInfo: 'Documentos de la Compañía',
    signupDocsHint: 'Puede subirlos ahora o después desde Mis Documentos. Nota: W-9, Responsabilidad General y Compensación Laboral son REQUERIDOS antes de ofertar.',
    legalCompanyName: 'Razón Social',
    legalCompanyNameHint: 'El nombre exacto que aparece en su W-9 y certificados de seguro.',
    dbaName: 'Nombre Comercial (DBA)',
    dbaNameHint: 'Si opera bajo otro nombre, indíquelo aquí.',
    businessAddress: 'Dirección Comercial',
    businessCity: 'Ciudad', businessState: 'Estado', businessZip: 'Código Postal',
    website: 'Sitio Web',
    yearsInBusiness: 'Años en el Negocio',
    numEmployees: 'Número de Empleados',
    unionAffiliation: 'Afiliación Sindical',
    serviceArea: 'Área de Servicio',
    serviceAreaHint: 'Ciudades, condados o estados donde trabaja.',
    licenseNumbers: 'Números de Licencia',
    licenseNumbersHint: 'ej. "TN GC #12345, MS Electrical #67890"',
    einTaxId: 'EIN / ID Fiscal (últimos 4 dígitos)',
    einTaxIdHint: 'Para nuestros registros — nunca se muestra a terceros.',
    contactTitle: 'Su Título / Rol',
    tradesPerformed: 'Especialidades que Realiza',
    tradesPerformedHint: 'Seleccione todas las que apliquen.',
    possibleDuplicate: 'Posible Coincidencia Encontrada',
    possibleDuplicateHint: 'Una compañía con información similar ya está en nuestro sistema:',
    continueAnyway: 'Sí, es una compañía NUEVA — continuar',
    imAlreadyRegistered: 'Somos nosotros — ya tengo cuenta',
    signupComplete: '¡Cuenta creada! Puede ofertar en trabajos públicos inmediatamente. Complete sus documentos para desbloquear todas las funciones.',
    // Scope/spec attachments
    scopeAttachments: 'Documentos de Alcance',
    specAttachments: 'Documentos de Especificaciones',
    attachDoc: 'Adjuntar Documento',
    orTypeScope: 'O escriba el alcance abajo:',
    orTypeSpecs: 'O escriba las especificaciones abajo:',
    attachHint: 'Suba PDF, Word u otros documentos de referencia.',
    poNumber: 'Número de PO', poNumberHint: 'Deje en blanco y se generará automáticamente (ej. PO-2026-0001). El CRM usará este mismo PO al añadir el trabajo oficialmente.',
    projectId: 'ID de Proyecto CRM', projectIdHint: 'Opcional. Complete solo si esta oferta se vincula a un proyecto ya existente en el CRM.',
    projectRef: 'Ref Proyecto',
    pmContact: 'Contacto del Gerente',
    callPM: 'Llamar', emailPM: 'Email',
    teamMembers: 'Equipo', editTeam: 'Editar Información de Contacto del Equipo',
    title_field: 'Cargo', updateContact: 'Actualizar Información de Contacto',
    contactSaved: 'Información de contacto guardada.',
    bidsEmailedTo: 'Envíe ofertas y preguntas a:',
    selectPM: 'Seleccionar gerente de proyecto…',
    callAboutJob: 'Llamar sobre este trabajo',
    mySettings: 'Mis Documentos',
    myWork: 'Mi Trabajo y Pagos',
    pendingBanner: 'Su cuenta está esperando la aprobación de GrayCo. Mientras tanto, suba aquí su W-9 y certificados de seguro — así se aprueba más rápido. ¿Preguntas? Llame al 901-585-0944.',
    forgotPassword: '¿Olvidó su contraseña?',
    resetSent: 'Si ese correo tiene una cuenta, le enviamos un enlace para elegir una nueva contraseña.',
    loginEmail: 'Correo electrónico',
    mwIntro: 'Su trabajo con GrayCo, tomado de nuestros registros: los trabajos en los que está, las facturas que hemos recibido de usted y su estado, y lo que tenemos archivado de su seguro e impuestos.',
    mwNotLinked: 'Su compañía todavía no está conectada a los registros de GrayCo. Cuando la oficina vincule su cuenta, aquí verá sus trabajos, pagos e información del 1099. Llame al 901-585-0944 si ya ha trabajado con nosotros.',
    mwJobs: 'Trabajos con GrayCo', mwNoJobs: 'Todavía no hay trabajos registrados con usted.',
    mwScopes: 'Alcances de trabajo enviados', mwAgreements: 'Contratos de subcontratista',
    mwPay: 'Facturas y pagos', mwNoPay: 'Todavía no hay facturas suyas registradas.',
    mwWaiting: 'Esperando aprobación', mwApproved: 'Aprobado, sin pagar', mwPaidYear: 'Pagado este año', mwPaidAll: 'Pagado en total',
    mwInsurance: 'Seguros y documentos archivados', mwOkToPay: 'GrayCo tiene todo lo necesario para pagarle.',
    mwNotOkToPay: 'Falta o venció algo que GrayCo necesita antes de pagarle. Súbalo en Mis Documentos.',
    mwTax: 'Información del 1099', mw1099Note: 'Totales de los pagos que GrayCo ha registrado por sus facturas, por año. GrayCo envía un 1099-NEC por cada año que sume $600 o más. Su 1099 oficial llega de GrayCo antes del 31 de enero.',
    mwRefresh: 'Actualizar',
    companyDocs: 'Documentos de la Compañía',
    uploadDoc: 'Subir Documento', docType: 'Tipo de Documento',
    docLabel: 'Etiqueta / Descripción', expirationDate: 'Fecha de Vencimiento (si aplica)',
    docExpired: 'VENCIDO', docExpiringSoon: 'Vence Pronto',
    docCurrent: 'Vigente', docNoExp: 'Sin Vencimiento',
    docW9: 'Formulario W-9', docInsGL: 'Seguro de Responsabilidad General',
    docInsWC: 'Seguro de Compensación Laboral', docInsAuto: 'Seguro de Auto',
    docLicense: 'Licencia de Contratista', docOther: 'Otro',
    docsRequired: 'Requerido para ofertar:',
    docsBidBlocked: 'No puede enviar una oferta hasta que sus documentos estén vigentes. Por favor actualice sus documentos en "Mis Documentos".',
    docsMissing: 'Documentos requeridos faltantes o vencidos',
    viewSubDocs: 'Ver Documentos', subDocuments: 'Documentos del Subcontratista',
    noDocsYet: 'Aún no hay documentos subidos.',
    allCurrent: 'Todos los documentos están vigentes.',
    daysUntilExp: 'días hasta el vencimiento',
  }
};

/* ============================================================
   STORAGE — window.storage wrappers (shared across users)
   ============================================================ */
// Storage now backed by Supabase (see storage.js). Same interface for App code.
const sget = _sget;
const sset = _sset;
const sdel = _sdel;

// Largest file the portal stores (the bucket's limit)
const MAX_FILE = 50 * 1024 * 1024;

// Record ids: unique across everyone using the portal at the same moment
function newId(prefix) {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return prefix + '_' + Date.now().toString(36) + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/* ============================================================
   PLAN STORAGE — stored per-job to bypass the 5MB-per-key limit.
   jobs[] in main storage holds only plan METADATA (name/size/type).
   The actual PDF binary lives under 'plans:{jobId}'.
   This lets the portal hold 100+ jobs, each with up to ~5 MB of plans.
   ============================================================ */
async function savePlansFor(jobId, plans) {
  // Only save if there are plans with actual binary data
  const withData = (plans || []).filter(p => p.dataUrl);
  if (withData.length === 0) { await sdel(`plans:${jobId}`); return; }
  await sset(`plans:${jobId}`, withData);
}
async function loadPlansFor(jobId) {
  return (await sget(`plans:${jobId}`)) || [];
}
async function deletePlansFor(jobId) {
  await sdel(`plans:${jobId}`);
}
function stripPlanBinaries(plans) {
  return (plans || []).map(p => ({ name: p.name, size: p.size, type: p.type }));
}

/* ============================================================
   VISIBILITY, INVITES, ACTIVITY HELPERS
   ============================================================ */
// Determine if a given sub user can see a given job
function canSeeJob(job, user, invites) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!job) return false;
  // Default to public if the field is missing (backward-compat)
  const visibility = job.visibility || 'public';
  if (visibility === 'public') return true;
  // Private: only invited users (by email match, case-insensitive) can see it
  const email = (user.email || '').toLowerCase();
  return invites.some(inv => inv.jobId === job.id && (inv.email || '').toLowerCase() === email);
}

// Generate a new PO number for a job that doesn't have one yet.
// Format: PO-YYYY-NNNN, where NNNN is the sequential count of jobs created this year.
// Uniqueness: the CRM should treat this string as the canonical PO when the job is
// later officially created there — they merge on this identifier.
function generatePO(jobs) {
  const year = new Date().getFullYear();
  const thisYearJobs = (jobs || []).filter(j => {
    try { return new Date(j.createdAt).getFullYear() === year; } catch { return false; }
  });
  // Also look at existing POs this year to avoid collisions if some were typed manually
  const existingNums = thisYearJobs
    .map(j => (j.poNumber || '').match(new RegExp(`^PO-${year}-(\\d+)$`)))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const maxExisting = existingNums.length ? Math.max(...existingNums) : 0;
  const next = Math.max(maxExisting, thisYearJobs.length) + 1;
  return `PO-${year}-${String(next).padStart(4, '0')}`;
}

// Generate a random token for invite links
function makeToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Build an invite URL a sub can visit to sign up pre-linked to the job
function inviteUrl(jobId, token) {
  const base = (typeof window !== 'undefined' && window.location)
    ? `${window.location.origin}${window.location.pathname}` : '';
  return `${base}?invite=${token}&job=${jobId}`;
}

/* ============================================================
   SUBCONTRACTOR DOCUMENTS — W9, insurance, etc.
   Stored per-user under 'subdocs:{userId}' to keep jobs/users keys tiny.
   ============================================================ */
const DOC_TYPES = [
  { id: 'w9', required: true, expires: false, color: '#1E40AF' },
  { id: 'insurance_general', required: true, expires: true, color: '#B91C1C' },
  { id: 'insurance_workers_comp', required: true, expires: true, color: '#B91C1C' },
  { id: 'insurance_auto', required: false, expires: true, color: '#CA8A04' },
  { id: 'license', required: false, expires: true, color: '#15803D' },
  { id: 'other', required: false, expires: false, color: '#64748B' },
];
const REQUIRED_DOC_TYPES = DOC_TYPES.filter(d => d.required).map(d => d.id);

function docTypeLabel(typeId, t) {
  const map = {
    w9: t.docW9, insurance_general: t.docInsGL, insurance_workers_comp: t.docInsWC,
    insurance_auto: t.docInsAuto, license: t.docLicense, other: t.docOther,
  };
  return map[typeId] || typeId;
}
function docStatus(doc) {
  // Returns { label, color, days } — 'expired', 'expiring' (<30d), 'current', 'no_expiration'
  if (!doc.expirationDate) return { kind: 'no_exp' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(doc.expirationDate);
  const days = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { kind: 'expired', days };
  if (days <= 30) return { kind: 'expiring', days };
  return { kind: 'current', days };
}
function hasCurrentRequired(userId, subDocsIndex) {
  // subDocsIndex is a map { userId -> docs[] }
  const docs = subDocsIndex[userId] || [];
  for (const typeId of REQUIRED_DOC_TYPES) {
    const doc = docs.find(d => d.type === typeId);
    if (!doc) return { ok: false, missing: typeId };
    const st = docStatus(doc);
    if (st.kind === 'expired') return { ok: false, expired: typeId };
  }
  return { ok: true };
}
async function saveSubDocs(userId, docs) {
  await sset(`subdocs:${userId}`, docs);
}
async function loadSubDocs(userId) {
  return (await sget(`subdocs:${userId}`)) || [];
}

/* ============================================================
   COMPANY CONFIG — central place to update office contact
   ============================================================ */
const COMPANY = {
  name: 'GrayCo Construction Services, LLC',
  city: 'Bartlett, TN',
  officeEmail: 'office@grayco-cs.com',
  bidsEmail: 'office@grayco-cs.com',
};

/* ============================================================
   STYLES
   ============================================================ */
const styles = {
  // Color tokens — navy matches the GrayCo logo exactly
  navy: '#140665',
  navy2: '#1F0F7D',
  navyDeep: '#0A0338',  // near-black for headings on dark
  cream: '#FBFAF7',     // slightly warmer cream
  card: '#FFFFFF',
  surface: '#F5F3EE',   // subtle surface color for grouped panels
  accent: '#D4A017',     // GrayCo gold
  accentDk: '#A07509',   // dark gold for hover
  accentSoft: '#FFF4D6', // soft gold wash
  blue: '#1E3A8A',
  green: '#15803D',
  greenSoft: '#DCFCE7',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
  border: '#EDE9E0',     // softer border
  borderDk: '#94A3B8',
  text: '#0F172A',
  text2: '#64748B',      // slightly lighter secondary text
  text3: '#94A3B8',      // tertiary metadata
  // Typography — Inter is more modern than IBM Plex for body
  fontDisplay: "'Oswald', 'Arial Narrow', sans-serif",
  fontBody: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  // Elevation
  shadowSm: '0 1px 2px rgba(20, 6, 101, 0.04)',
  shadowMd: '0 4px 12px rgba(20, 6, 101, 0.06), 0 1px 3px rgba(20, 6, 101, 0.04)',
  shadowLg: '0 10px 30px rgba(20, 6, 101, 0.08), 0 4px 8px rgba(20, 6, 101, 0.04)',
  // Radii
  radius: 12,
  radiusLg: 16,
  radiusFull: 999,
};

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }
body, html { margin: 0; padding: 0; font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'; -webkit-font-smoothing: antialiased; }
input, textarea, select, button { font-family: inherit; }
input:focus, textarea:focus, select:focus { outline: 2px solid ${styles.accent}; outline-offset: 1px; border-color: ${styles.accent}; }
.btn-primary:hover { background: ${styles.accentDk} !important; transform: translateY(-1px); box-shadow: ${styles.shadowMd}; }
.btn-secondary:hover { background: ${styles.navy2} !important; transform: translateY(-1px); box-shadow: ${styles.shadowMd}; }
.btn-ghost:hover { background: ${styles.surface} !important; border-color: ${styles.borderDk} !important; }
.btn-danger:hover { background: #991B1B !important; transform: translateY(-1px); }
.btn-success:hover { background: #14532D !important; transform: translateY(-1px); }
.card-hover { transition: all 200ms ease; }
.card-hover:hover { border-color: ${styles.accent}; box-shadow: ${styles.shadowLg}; transform: translateY(-2px); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-in { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 720px) {
  .nav-tabs { flex-wrap: wrap !important; gap: 4px !important; }
  .nav-tab-label { display: none !important; }
  .main-pad { padding: 20px 16px !important; }
  header > div { padding-left: 16px !important; padding-right: 16px !important; flex-wrap: wrap; }
}
`;

/* ============================================================
   REUSABLE UI
   ============================================================ */
const Btn = ({ variant = 'primary', children, icon: Icon, size = 'md', style, ...props }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center',
    border: 'none', cursor: 'pointer', fontWeight: 600,
    fontFamily: styles.fontBody, transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
    borderRadius: 10, letterSpacing: '-0.005em',
  };
  const sizes = {
    sm: { padding: '7px 14px', fontSize: 13 },
    md: { padding: '11px 20px', fontSize: 14 },
    lg: { padding: '14px 26px', fontSize: 15 },
  };
  const variants = {
    primary: { background: styles.accent, color: styles.navy, boxShadow: styles.shadowSm },
    secondary: { background: styles.navy, color: '#fff', boxShadow: styles.shadowSm },
    ghost: { background: '#fff', color: styles.text, border: `1px solid ${styles.border}` },
    danger: { background: styles.red, color: '#fff', boxShadow: styles.shadowSm },
    success: { background: styles.green, color: '#fff', boxShadow: styles.shadowSm },
  };
  const cls = `btn-${variant}`;
  return (
    <button className={cls} style={{ ...base, ...sizes[size], ...variants[variant], ...(props.disabled ? { opacity: 0.6, cursor: 'default' } : {}), ...style }} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />} {children}
    </button>
  );
};

const Field = ({ label, children, required }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{
      display: 'block', fontSize: 12, fontWeight: 600, color: styles.text2,
      letterSpacing: '-0.005em', marginBottom: 6,
    }}>
      {label} {required && <span style={{ color: styles.red }}>*</span>}
    </label>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', padding: '11px 14px', fontSize: 14,
  border: `1px solid ${styles.border}`, borderRadius: 10,
  background: '#fff', color: styles.text, fontFamily: styles.fontBody,
  transition: 'border-color 150ms, box-shadow 150ms',
};

const Badge = ({ children, color = styles.navy, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: 11, fontWeight: 600,
    color, background: bg || `${color}12`, borderRadius: styles.radiusFull,
    letterSpacing: '-0.005em', gap: 4,
    border: `1px solid ${color}20`,
  }}>{children}</span>
);

const Card = ({ children, hover, style = {}, onClick }) => (
  <div className={hover ? 'card-hover' : ''} onClick={onClick} style={{
    background: styles.card, border: `1px solid ${styles.border}`,
    borderRadius: styles.radius, padding: 22,
    boxShadow: styles.shadowSm,
    cursor: onClick ? 'pointer' : 'default', ...style,
  }}>{children}</div>
);

/* ============================================================
   GRAYCO LOGO — real uploaded logo embedded as base64
   Source: client-supplied logo, navy #140665 on transparent
   ============================================================ */
const LOGO_B64 = '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';

function GrayCoLogo({ size = 'md', variant = 'navy', style = {} }) {
  // variant: 'navy' (default, for white/light backgrounds) or 'white' (inverted for dark backgrounds)
  const sizes = {
    xs: 32, sm: 48, md: 64, lg: 96, xl: 160, xxl: 220,
  };
  const s = sizes[size] || sizes.md;
  const filter = variant === 'white' ? 'brightness(0) invert(1)' : 'none';
  return (
    <img
      src={`data:image/png;base64,${LOGO_B64}`}
      alt="GrayCo Construction Services"
      style={{
        height: s, width: 'auto', display: 'block',
        filter, ...style,
      }}
    />
  );
}

/* ============================================================
   CHANGE PASSWORD MODAL — three modes:
   - 'voluntary': opened via Change Password button in header, dismissible
   - 'suggestion': soft prompt after login when user still has default password, dismissible
   - 'forced': blocking, no dismiss (not currently used but supported for future use)
   ============================================================ */
function ChangePasswordModal({ t, user, onPasswordChanged, onClose, mode = 'voluntary', showToast }) {
  // mode: 'voluntary' (from header button) | 'suggestion' (soft prompt on default password) | 'forced' (blocking)
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (next.length < 8) { showToast(t.passwordTooShort, 'error'); return; }
    if (next !== confirm) { showToast(t.passwordMismatch, 'error'); return; }
    setBusy(true);
    // Check the current password first (not needed when arriving from a "forgot password" e-mail)
    if (mode !== 'recovery' && !(await checkPassword(user.email, current))) {
      setBusy(false);
      showToast(t.wrongCurrent, 'error');
      return;
    }
    const result = await authChangePw(next);
    if (result.error) {
      setBusy(false);
      showToast('Password update failed: ' + result.error, 'error');
      return;
    }
    onPasswordChanged(next);   // parent updates user state (suggestPasswordChange flag cleared server-side by authChangePw)
    showToast(t.passwordUpdated);
    setTimeout(() => onClose(), 300);
  }

  // Generate a strong readable password: 4 words + 2 digits + a symbol
  // Avoids ambiguous chars, easy-ish to type on mobile
  function generateStrong() {
    const words = ['River', 'Steel', 'Cobalt', 'Falcon', 'Anvil', 'Quartz', 'Timber', 'Slate',
                   'Cedar', 'Ember', 'Ridge', 'Onyx', 'Iron', 'Bison', 'Hawk', 'Forge',
                   'Basalt', 'Meadow', 'Copper', 'Willow', 'Granite', 'Vector', 'Beacon'];
    const symbols = '!@#$%&*';
    const w1 = words[Math.floor(Math.random() * words.length)];
    const w2 = words[Math.floor(Math.random() * words.length)];
    const digits = Math.floor(10 + Math.random() * 90);
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const pw = `${w1}-${w2}-${digits}${sym}`;
    setNext(pw);
    setConfirm(pw);
    showToast(t.suggestedPasswordUsed);
  }

  const title = mode === 'forced' ? t.mustChangeTitle
              : mode === 'suggestion' ? t.suggestChangeTitle
              : mode === 'recovery' ? 'Choose a new password'
              : t.changePassword;
  const hint = mode === 'forced' ? t.mustChangeHint
             : mode === 'suggestion' ? t.suggestChangeHint
             : null;
  const canDismiss = mode !== 'forced';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={canDismiss ? onClose : undefined}>
      <div style={{
        background: '#fff', borderRadius: styles.radiusLg, padding: 28,
        maxWidth: 460, width: '100%', boxShadow: styles.shadowLg,
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{
          fontFamily: styles.fontBody, fontSize: 20, fontWeight: 700,
          letterSpacing: '-0.02em', color: styles.navy, marginBottom: 6, marginTop: 0,
        }}>{title}</h2>
        {hint && (
          <div style={{ fontSize: 13, color: styles.text2, marginBottom: 18, lineHeight: 1.5 }}>
            {hint}
          </div>
        )}
        {mode !== 'recovery' && (
          <Field label={t.currentPassword}>
            <input type="password" style={inputStyle} value={current}
              onChange={e => setCurrent(e.target.value)}
              autoFocus autoComplete="current-password" />
          </Field>
        )}
        <Field label={t.newPassword}>
          <input type="password" style={inputStyle} value={next}
            onChange={e => setNext(e.target.value)}
            autoComplete="new-password" />
          <button type="button" onClick={generateStrong} style={{
            marginTop: 6, background: 'transparent', border: 'none',
            color: styles.accentDk, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, padding: 0,
          }}>{t.suggestStrongPassword}</button>
        </Field>
        <Field label={t.confirmPassword}>
          <input type="password" style={inputStyle} value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            autoComplete="new-password" />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {mode === 'suggestion' && (
            <Btn variant="ghost" onClick={onClose} disabled={busy}>{t.keepDefaultForNow}</Btn>
          )}
          {(mode === 'voluntary' || mode === 'recovery') && (
            <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          )}
          <Btn icon={Check} onClick={submit} disabled={busy}>{t.changePassword}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */
export default function App() {
  const [lang, setLang] = useState('en');
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [bids, setBids] = useState([]);
  const [links, setLinks] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [activity, setActivity] = useState([]);   // {id, jobId, userId, kind: 'view'|'download', at, planName?}
  const [invites, setInvites] = useState([]);     // {id, jobId, email, token, createdAt, createdBy, usedBy?}
  const [messages, setMessages] = useState([]);   // {id, jobId, senderId, senderName, senderCompany, senderRole, body, at, readBy: []}
  const [subDocs, setSubDocs] = useState({});  // { userId: docs[] }
  const [user, setUser] = useState(null);
  const [impersonatedFrom, setImpersonatedFrom] = useState(null);  // holds real admin user when previewing as sub
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [view, setView] = useState('jobs');
  const [activeJob, setActiveJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [toast, setToast] = useState(null);
  const t = T[lang];

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), kind === 'error' ? 10000 : 3500);
  };

  // Load everything this person may see (the server filters it), after sign-in.
  async function loadAll(u) {
    const subKey = u.role === 'admin' ? 'subdocs:*' : `subdocs:${u.id}`;
    const data = await sloadMany([...COLLECTIONS, subKey]);
    setUsers(data.users || []);
    setJobs(data.jobs || []);
    setBids(data.bids || []);
    setLinks(data.links || []);
    setEstimates(data.estimates || []);
    setActivity(data.activity || []);
    setInvites(data.invites || []);
    setMessages(data.messages || []);
    setSubDocs(u.role === 'admin' ? (data[subKey] || {}) : { [u.id]: data[subKey] || [] });
    const fresh = (data.users || []).find(x => x.id === u.id);
    if (fresh) setUser(prev => (prev && prev.id === fresh.id ? { ...prev, ...fresh } : prev));
  }

  async function startSession(u) {
    setLoading(true);
    try {
      setUser(u);
      setView(u.role === 'sub' && !u.approved ? 'mySettings' : 'jobs');
      setActiveJob(null);
      await loadAll(u);
    } catch (e) {
      console.error('Load failed:', e);
      showToast(e.message || 'Could not load the portal.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSaveErrorHandler(msg => showToast(msg, 'error'));
    (async () => {
      try {
        // Back from a "forgot password" e-mail?
        const rec = await takeRecoveryFromUrl();
        if (rec && rec.error) showToast(rec.error, 'error');
        const restored = await getCurrentUser();
        if (restored) {
          await startSession(restored);
          if (rec && rec.recovery) setShowChangePassword('recovery');
          return;
        }
      } catch (e) {
        console.warn('session restore failed', e);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New bids, messages and jobs from other people show up within a minute.
  useEffect(() => {
    if (!user || loading) return;
    const tick = async () => {
      if (document.hidden || savesPending()) return;
      const gen = saveGeneration();
      try {
        const subKey = user.role === 'admin' ? 'subdocs:*' : `subdocs:${user.id}`;
        const keys = [...COLLECTIONS, subKey];
        const { data } = await api('load', { keys });
        if (saveGeneration() !== gen || savesPending()) return;   // something was saved meanwhile; next time
        await sloadManyApply(keys, data);
      } catch (e) { /* quiet: next tick */ }
    };
    async function sloadManyApply(keys, data) {
      rememberLoaded(keys, data);
      setUsers(data.users || []);
      setJobs(data.jobs || []);
      setBids(data.bids || []);
      setLinks(data.links || []);
      setEstimates(data.estimates || []);
      setActivity(data.activity || []);
      setInvites(data.invites || []);
      setMessages(data.messages || []);
      const subKey = keys[keys.length - 1];
      setSubDocs(user.role === 'admin' ? (data[subKey] || {}) : { [user.id]: data[subKey] || [] });
      setActiveJob(prev => prev ? ((data.jobs || []).find(j => j.id === prev.id) || prev) : prev);
    }
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id, loading]);

  // Persist whenever data changes — wrapped in try/catch so storage errors never crash the app
  useEffect(() => {
    if (loading || !user) return;
    sset('users', users).catch(e => console.warn('users save failed', e));
  }, [users, loading]);
  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        for (const job of jobs) {
          if (job.plans && job.plans.some(p => p.dataUrl && p.dataUrl.startsWith('data:'))) {
            await savePlansFor(job.id, job.plans);
          }
        }
        const jobsLite = jobs.map(j => ({ ...j, plans: stripPlanBinaries(j.plans) }));
        await sset('jobs', jobsLite);
      } catch (e) {
        console.error('Job persistence failed:', e);
      }
    })();
  }, [jobs, loading]);
  useEffect(() => {
    if (loading || !user) return;
    sset('bids', bids).catch(e => console.warn('bids save failed', e));
  }, [bids, loading]);
  useEffect(() => {
    if (loading || !user) return;
    sset('links', links).catch(e => console.warn('links save failed', e));
  }, [links, loading]);
  useEffect(() => {
    if (loading || !user) return;
    sset('estimates', estimates).catch(e => console.warn('estimates save failed', e));
  }, [estimates, loading]);
  useEffect(() => {
    if (loading || !user) return;
    // Cap activity log at 5000 entries to keep storage size reasonable
    const capped = activity.slice(-5000);
    sset('activity', capped).catch(e => console.warn('activity save failed', e));
  }, [activity, loading]);
  useEffect(() => {
    if (loading || !user) return;
    sset('invites', invites).catch(e => console.warn('invites save failed', e));
  }, [invites, loading]);

  useEffect(() => {
    if (loading || !user) return;
    // Cap messages at 10000 entries globally
    const capped = messages.slice(-10000);
    sset('messages', capped).catch(e => console.warn('messages save failed', e));
  }, [messages, loading]);

  // Persist login session so page refreshes don't log people out.
  // Session persistence is handled automatically by Supabase Auth
  // (see config.js — persistSession: true). No idle timeout, ever.

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: styles.cream,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: styles.fontBody, gap: 24,
      }}>
        <style>{fontImport}</style>
        <GrayCoLogo size="lg" variant="navy" />
        <Loader2 size={28} className="spin" color={styles.accent} />
      </div>
    );
  }

  // ============ AUTH SCREENS ============
  if (!user) {
    return (
      <>
        <style>{fontImport}</style>
        <AuthScreen
          t={t} lang={lang} setLang={setLang}
          mode={authMode} setMode={setAuthMode}
          onLogin={(u) => startSession(u)}
          showToast={showToast}
        />
      </>
    );
  }

  // ============ MAIN SHELL ============
  const isAdmin = user.role === 'admin';

  const pendingApproval = user.role === 'sub' && !user.approved;
  const navTabs = pendingApproval ? [
    { id: 'mySettings', label: t.mySettings, icon: Settings },
  ] : isAdmin ? [
    { id: 'jobs', label: t.jobs, icon: Briefcase },
    { id: 'addJob', label: t.addJob, icon: Plus },
    { id: 'allBids', label: t.allBids, icon: ClipboardList },
    { id: 'estimating', label: t.estimating, icon: TrendingUp },
    { id: 'archive', label: t.planArchive, icon: Building2 },
    { id: 'pending', label: t.pendingSubs, icon: UserCheck },
    { id: 'subs', label: t.approvedSubs, icon: Users },
    { id: 'team', label: t.teamMembers, icon: Shield },
    { id: 'links', label: t.adminLinks, icon: LinkIcon },
  ] : [
    { id: 'jobs', label: t.jobs, icon: Briefcase },
    { id: 'myBids', label: t.myBids, icon: FileText },
    { id: 'myWork', label: t.myWork, icon: DollarSign },
    { id: 'mySettings', label: t.mySettings, icon: Settings },
  ];

  return (
    <>
      <style>{fontImport}</style>
      <div style={{
        minHeight: '100vh', background: styles.cream,
        fontFamily: styles.fontBody, color: styles.text,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* HEADER */}
        <header style={{
          background: '#fff', color: styles.text,
          borderBottom: `1px solid ${styles.border}`,
          boxShadow: styles.shadowSm,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <GrayCoLogo size={isAdmin ? "sm" : "md"} variant="navy" />
              <div style={{
                paddingLeft: 20, borderLeft: `1px solid ${styles.border}`,
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{
                  fontFamily: styles.fontBody, fontSize: 15, fontWeight: 700,
                  color: styles.navy, letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}>{t.appName}</div>
                <div style={{ fontSize: 11, color: styles.text3, letterSpacing: '-0.005em' }}>
                  Subcontractor Bidding
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{user.name}</div>
                <div style={{ fontSize: 11, color: styles.text2 }}>
                  {user.company} · {isAdmin ? t.admin : t.sub}
                </div>
              </div>
              {isAdmin && !impersonatedFrom && (
                <Btn variant="ghost" size="sm" icon={Eye}
                  onClick={() => {
                    const demoSub = users.find(u => u.role === 'sub' && u.approved);
                    if (!demoSub) {
                      showToast('There is no approved subcontractor to preview yet.', 'error');
                      return;
                    }
                    setImpersonatedFrom(user);
                    setUser(demoSub);
                    setView('jobs');
                    setActiveJob(null);
                    showToast(`Previewing portal as ${demoSub.name}.`);
                  }}>
                  View as Sub
                </Btn>
              )}
              {!impersonatedFrom && !EMBEDDED && (
                <Btn variant="ghost" size="sm" icon={Settings}
                  onClick={() => setShowChangePassword(true)}>
                  {t.changePassword}
                </Btn>
              )}
              {!EMBEDDED && (
                <Btn variant="ghost" size="sm" icon={LogOut}
                  onClick={async () => { await authSignOut(); setUser(null); setImpersonatedFrom(null); setView('jobs'); setActiveJob(null); }}>
                  {t.logout}
                </Btn>
              )}
            </div>
          </div>

          {/* Change Password modal — voluntary from header OR soft suggestion when default password */}
          {(showChangePassword || user.suggestPasswordChange) && !impersonatedFrom && (
            <ChangePasswordModal
              t={t} user={user}
              mode={showChangePassword === 'recovery' ? 'recovery' : showChangePassword ? 'voluntary' : 'suggestion'}
              showToast={showToast}
              onPasswordChanged={(newPw) => {
                // Update both the users list AND the current user state atomically
                setUsers(users.map(u => u.id === user.id ? { ...u, suggestPasswordChange: false } : u));
                setUser({ ...user, suggestPasswordChange: false });
              }}
              onClose={() => {
                setShowChangePassword(false);
                // If they dismissed a suggestion prompt, mark the flag off so we don't nag them again this session
                if (user.suggestPasswordChange) {
                  setUsers(users.map(u => u.id === user.id ? { ...u, suggestPasswordChange: false } : u));
                  setUser({ ...user, suggestPasswordChange: false });
                }
              }}
            />
          )}

          {/* NAV TABS — pill style */}
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 14px' }}>
            <div className="nav-tabs" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {navTabs.map(tab => {
                const active = view === tab.id;
                const Icon = tab.icon;
                return (
                  <button key={tab.id}
                    onClick={() => { setView(tab.id); setActiveJob(null); }}
                    style={{
                      background: active ? styles.navy : 'transparent',
                      color: active ? '#fff' : styles.text2,
                      border: 'none', cursor: 'pointer',
                      padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8,
                      fontFamily: styles.fontBody, fontWeight: 600, fontSize: 13,
                      borderRadius: styles.radiusFull,
                      transition: 'all 150ms', letterSpacing: '-0.01em',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = styles.surface; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    <Icon size={15} />
                    <span className="nav-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* IMPERSONATION BANNER — shows when an admin is viewing as a sub */}
        {impersonatedFrom && (
          <div style={{
            background: styles.accent, color: styles.navy,
            padding: '10px 28px', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', letterSpacing: '-0.01em',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Eye size={16} />
              <span>Previewing as subcontractor <strong>{user.name}</strong> ({user.company})</span>
            </div>
            <button onClick={() => {
              setUser(impersonatedFrom);
              setImpersonatedFrom(null);
              setView('jobs');
              setActiveJob(null);
              showToast('Returned to admin view.');
            }} style={{
              background: styles.navy, color: '#fff', border: 'none',
              padding: '6px 14px', borderRadius: styles.radiusFull,
              fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
              cursor: 'pointer', letterSpacing: '-0.01em',
            }}>← Return to Admin View</button>
          </div>
        )}

        {pendingApproval && (
          <div style={{
            background: styles.accentSoft, color: styles.navy, padding: '12px 28px', fontSize: 13,
            fontWeight: 600, borderBottom: `1px solid ${styles.border}`, lineHeight: 1.5,
          }}>
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>{t.pendingBanner}</div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="main-pad" style={{ flex: 1, maxWidth: 1280, margin: '0 auto', padding: '40px 28px', width: '100%' }}>
          {activeJob ? (
            <JobDetail t={t} job={activeJob} user={user} bids={bids} setBids={setBids}
              onBack={() => setActiveJob(null)} showToast={showToast}
              jobs={jobs} setJobs={setJobs} users={users} subDocs={subDocs}
              estimates={estimates} setEstimates={setEstimates}
              activity={activity} setActivity={setActivity}
              invites={invites} setInvites={setInvites}
              messages={messages} setMessages={setMessages}
              setView={setView} />
          ) : (
            <>
              {view === 'jobs' && <JobList t={t} jobs={jobs} user={user} users={users}
                invites={invites} onOpen={setActiveJob} bids={bids} />}
              {view === 'myBids' && <MyBids t={t} bids={bids} jobs={jobs} user={user}
                onOpen={setActiveJob} />}
              {view === 'myWork' && <MyWork t={t} user={user} asAdmin={!!impersonatedFrom} />}
              {view === 'mySettings' && <SubSettings t={t} user={user}
                onSaveProfile={patch => {
                  setUsers(users.map(u => u.id === user.id ? { ...u, ...patch } : u));
                  setUser({ ...user, ...patch });
                }}
                subDocs={subDocs} setSubDocs={setSubDocs}
                bids={bids} jobs={jobs} showToast={showToast} />}
              {view === 'addJob' && <AddJob t={t} jobs={jobs} setJobs={setJobs}
                user={user} users={users} showToast={showToast} setView={setView} />}
              {view === 'allBids' && <AllBids t={t} bids={bids} jobs={jobs}
                users={users} onOpen={setActiveJob} />}
              {view === 'estimating' && <EstimatingTab t={t} estimates={estimates}
                setEstimates={setEstimates} jobs={jobs} bids={bids} users={users}
                onOpen={setActiveJob} showToast={showToast} />}
              {view === 'archive' && <PlanArchive t={t} jobs={jobs}
                onOpen={setActiveJob} />}
              {view === 'pending' && <PendingSubs t={t} users={users} setUsers={setUsers}
                showToast={showToast} />}
              {view === 'subs' && <ApprovedSubs t={t} users={users} setUsers={setUsers}
                subDocs={subDocs} showToast={showToast} bids={bids} jobs={jobs} />}
              {view === 'team' && <TeamPage t={t} users={users} setUsers={setUsers}
                showToast={showToast} />}
              {view === 'links' && <AdminLinks t={t} links={links} setLinks={setLinks}
                showToast={showToast} />}
            </>
          )}
        </main>

        {/* LANGUAGE TOGGLE FOOTER */}
        <footer style={{
          borderTop: `1px solid ${styles.border}`, background: '#fff',
          padding: '16px 24px',
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <GrayCoLogo size="xs" variant="navy" />
              <div style={{
                fontSize: 12, color: styles.text2, paddingLeft: 14,
                borderLeft: `1px solid ${styles.border}`,
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div>© {new Date().getFullYear()} GrayCo Construction Services, LLC</div>
                <div style={{ lineHeight: 1.5 }}>
                  {t.bidsEmailedTo}{' '}
                  <span style={{ color: styles.text }}>the Project Manager listed on the job</span>
                  {' '}and{' '}
                  <a href={`mailto:${COMPANY.officeEmail}`} style={{
                    color: styles.accent, textDecoration: 'none', fontWeight: 600,
                  }}>
                    {COMPANY.officeEmail}
                  </a>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} color={styles.text2} />
              <span style={{ fontSize: 12, color: styles.text2, marginRight: 6 }}>{t.selectLanguage}:</span>
              <button onClick={() => setLang('en')} style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                background: lang === 'en' ? styles.navy : 'transparent',
                color: lang === 'en' ? '#fff' : styles.text,
                border: `1px solid ${lang === 'en' ? styles.navy : styles.border}`,
                borderRadius: styles.radiusFull, cursor: 'pointer', letterSpacing: '-0.01em',
              }}>English</button>
              <button onClick={() => setLang('es')} style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                background: lang === 'es' ? styles.navy : 'transparent',
                color: lang === 'es' ? '#fff' : styles.text,
                border: `1px solid ${lang === 'es' ? styles.navy : styles.border}`,
                borderRadius: styles.radiusFull, cursor: 'pointer', letterSpacing: '-0.01em',
              }}>Español</button>
            </div>
          </div>
        </footer>

        {/* TOAST */}
        {toast && (
          <div className="fade-in" onClick={() => setToast(null)} style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: toast.kind === 'error' ? styles.red : styles.green,
            color: '#fff', padding: '14px 20px', borderRadius: styles.radius,
            boxShadow: styles.shadowLg, fontWeight: 600,
            display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 480,
            cursor: 'pointer', lineHeight: 1.4, letterSpacing: '-0.01em',
          }}>
            <span style={{ flexShrink: 0, paddingTop: 1 }}>
              {toast.kind === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
            </span>
            <span style={{ wordBreak: 'break-word' }}>{toast.msg}</span>
            <span style={{ flexShrink: 0, opacity: 0.7, fontSize: 11, paddingLeft: 6 }}>✕</span>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   AUTH SCREEN
   ============================================================ */
function AuthScreen({ t, lang, setLang, mode, setMode, onLogin, showToast }) {
  // An invite link (?invite=…&job=…): invited subs are approved right away and pre-linked to the job
  const [inviteInfo, setInviteInfo] = useState(null);
  const inviteParams = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const token = p.get('invite'); const jobId = p.get('job');
      return token && jobId ? { token, jobId } : null;
    } catch { return null; }
  })();
  useEffect(() => {
    if (!inviteParams) return;
    fetchInviteInfo(inviteParams.token, inviteParams.jobId).then(info => {
      if (!info || !info.ok) return;
      setInviteInfo({ invite: { email: info.email }, job: { title: info.jobTitle } });
      if (info.email) setForm(f => ({ ...f, email: f.email || info.email }));
      setMode('register');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    // Login
    username: '', password: '',
    // Contact
    email: '',
    name: '', phone: '', contactTitle: '',
    // Company identity
    company: '', dbaName: '',
    // Address (used for duplicate detection)
    businessAddress: '', businessCity: '', businessState: '', businessZip: '',
    // Business details
    website: '', yearsInBusiness: '', numEmployees: '', unionAffiliation: '',
    serviceArea: '', licenseNumbers: '', einLast4: '',
    // Trades performed (freeform for now, could be multi-select later)
    trades: '',
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);  // { matches: [{company, dbaName, reasons}] } or null
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setError('');
    if (!form.username.trim() || !form.password) { setError(t.invalidLogin); return; }
    setBusy(true);
    const result = await authSignIn(form.username.trim(), form.password);
    setBusy(false);
    if (result.error === 'invalid') { setError(t.invalidLogin); return; }
    if (result.error) { setError(result.message || ('Sign in failed: ' + result.error)); return; }
    onLogin(result.user);
  }

  async function handleForgot() {
    setError('');
    if (!form.username.includes('@')) { setError('Please enter your e-mail address.'); return; }
    setBusy(true);
    const r = await requestPasswordReset(form.username);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    showToast(t.resetSent);
    setMode('login');
  }

  async function handleRegister(force = false) {
    setError('');
    // Basic required fields
    if (!form.password || !form.name || !form.email || !form.company) {
      setError('Please fill all required fields (marked with *).'); return;
    }
    if (!form.email.includes('@')) {
      setError('Please enter a valid email address.'); return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    const profileData = {
      name: form.name,
      phone: form.phone,
      contactTitle: form.contactTitle,
      company: form.company, dbaName: form.dbaName,
      businessAddress: form.businessAddress, businessCity: form.businessCity,
      businessState: form.businessState, businessZip: form.businessZip,
      website: form.website, yearsInBusiness: form.yearsInBusiness,
      numEmployees: form.numEmployees, unionAffiliation: form.unionAffiliation,
      serviceArea: form.serviceArea, licenseNumbers: form.licenseNumbers,
      einLast4: form.einLast4,
      trades: form.trades.split(',').map(s => s.trim()).filter(Boolean),
    };
    setBusy(true);
    let result;
    try {
      result = await authSignUp(form.email, form.password, profileData, {
        invite: inviteParams?.token, job: inviteParams?.jobId, force,
      });
    } catch (e) {
      setBusy(false);
      setError(e.message || 'Sign up failed.');
      return;
    }
    setBusy(false);
    // Possible duplicate company — the server returns only names and why they matched
    if (result.duplicates && result.duplicates.length) {
      setDuplicateWarning({ matches: result.duplicates.map((m, i) => ({ user: { id: 'd' + i, company: m.company, dbaName: m.dbaName }, reasons: m.reasons })) });
      return;
    }
    setDuplicateWarning(null);
    // Signed up: sign straight in
    const login = await authSignIn(form.email, form.password);
    if (login.user) {
      showToast(result.approved ? t.signupComplete : t.accountPending);
      onLogin(login.user);
      return;
    }
    showToast(t.signupComplete);
    setMode('login');
    setForm({ ...form, username: form.email, password: '' });
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: styles.fontBody, padding: 20, position: 'relative',
    }}>
      {/* Gold accent bar at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 5,
        background: `linear-gradient(90deg, ${styles.accent}, ${styles.accentDk})`,
      }} />

      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Logo — on plain white, nothing behind it */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: 28,
        }}>
          <GrayCoLogo size="xxl" variant="navy" style={{ marginBottom: 8 }} />
          <div style={{
            fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600,
            color: styles.navy, letterSpacing: '0.22em', textTransform: 'uppercase',
            marginTop: 6, paddingTop: 14,
            borderTop: `3px solid ${styles.accent}`,
            paddingLeft: 28, paddingRight: 28, textAlign: 'center',
          }}>{t.appName}</div>
        </div>

        {/* Card */}
        <Card style={{ padding: 32, boxShadow: '0 4px 24px rgba(20, 6, 101, 0.08)' }}>
          {inviteInfo && (
            <div style={{
              background: '#FFFBEB', border: `2px solid ${styles.accent}`, borderRadius: 6,
              padding: 14, marginBottom: 20, fontSize: 13, color: styles.text, lineHeight: 1.5,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: styles.accent, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {t.signupWithInvite}
              </div>
              <div style={{ fontFamily: styles.fontDisplay, fontSize: 17, fontWeight: 600, color: styles.navy, textTransform: 'uppercase' }}>
                {inviteInfo.job?.title || 'GrayCo project'}
              </div>
              {inviteInfo.invite.email && (
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 4 }}>
                  Invited email: <strong>{inviteInfo.invite.email}</strong> — use this email when signing up.
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${styles.border}` }}>
            <button onClick={() => { setMode('login'); setError(''); }} style={{
              flex: 1, padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, color: mode === 'login' ? styles.accent : styles.text2,
              borderBottom: `3px solid ${mode === 'login' ? styles.accent : 'transparent'}`,
              marginBottom: -1, fontFamily: styles.fontBody,
            }}>{t.login}</button>
            <button onClick={() => { setMode('register'); setError(''); }} style={{
              flex: 1, padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, color: mode === 'register' ? styles.accent : styles.text2,
              borderBottom: `3px solid ${mode === 'register' ? styles.accent : 'transparent'}`,
              marginBottom: -1, fontFamily: styles.fontBody,
            }}>{t.register}</button>
          </div>

          {mode === 'forgot' ? (
            <>
              <div style={{ fontSize: 13, color: styles.text2, marginBottom: 14, lineHeight: 1.5 }}>
                Enter the e-mail you sign in with. We will send a link to choose a new password.
              </div>
              <Field label={t.loginEmail} required>
                <input style={inputStyle} type="email" autoComplete="email" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleForgot()} />
              </Field>
            </>
          ) : mode === 'login' ? (
            <>
              <Field label={t.loginEmail} required>
                <input style={inputStyle} type="email" autoComplete="email" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </Field>
              <Field label={t.password} required>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: 40 }} type={showPw ? 'text' : 'password'}
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                  <button onClick={() => setShowPw(!showPw)} style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
                    color: styles.text2,
                  }}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </Field>
            </>
          ) : (
            <>
              {/* CONTACT SECTION */}
              <div style={{ fontSize: 11, fontWeight: 700, color: styles.text2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>
                {t.signupContactInfo}
              </div>
              <Field label={t.fullName} required>
                <input style={inputStyle} value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <Field label={t.email + ' *'}>
                  <input style={inputStyle} type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={t.phone}>
                  <input style={inputStyle} type="tel" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} />
                </Field>
              </div>
              <Field label={t.contactTitle}>
                <input style={inputStyle} value={form.contactTitle}
                  placeholder="Owner / Estimator / Project Manager"
                  onChange={e => setForm({ ...form, contactTitle: e.target.value })} />
              </Field>

              {/* COMPANY IDENTITY */}
              <div style={{ fontSize: 11, fontWeight: 700, color: styles.text2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>
                {t.signupCompanyInfo}
              </div>
              <Field label={t.legalCompanyName + ' *'}>
                <input style={inputStyle} value={form.company}
                  onChange={e => setForm({ ...form, company: e.target.value })} />
                <div style={{ fontSize: 11, color: styles.text3, marginTop: 4 }}>{t.legalCompanyNameHint}</div>
              </Field>
              <Field label={t.dbaName}>
                <input style={inputStyle} value={form.dbaName}
                  onChange={e => setForm({ ...form, dbaName: e.target.value })} />
                <div style={{ fontSize: 11, color: styles.text3, marginTop: 4 }}>{t.dbaNameHint}</div>
              </Field>
              <Field label={t.businessAddress}>
                <input style={inputStyle} value={form.businessAddress}
                  placeholder="Street address"
                  onChange={e => setForm({ ...form, businessAddress: e.target.value })} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Field label={t.businessCity}>
                  <input style={inputStyle} value={form.businessCity}
                    onChange={e => setForm({ ...form, businessCity: e.target.value })} />
                </Field>
                <Field label={t.businessState}>
                  <input style={inputStyle} value={form.businessState} maxLength={2}
                    placeholder="TN"
                    onChange={e => setForm({ ...form, businessState: e.target.value.toUpperCase() })} />
                </Field>
                <Field label={t.businessZip}>
                  <input style={inputStyle} value={form.businessZip} maxLength={10}
                    onChange={e => setForm({ ...form, businessZip: e.target.value })} />
                </Field>
              </div>
              <Field label={t.website}>
                <input style={inputStyle} value={form.website} type="url"
                  placeholder="https://"
                  onChange={e => setForm({ ...form, website: e.target.value })} />
              </Field>

              {/* BUSINESS DETAILS */}
              <div style={{ fontSize: 11, fontWeight: 700, color: styles.text2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>
                {t.signupBusinessDetails}
              </div>
              <Field label={t.tradesPerformed}>
                <input style={inputStyle} value={form.trades}
                  placeholder="Drywall, Paint, Flooring"
                  onChange={e => setForm({ ...form, trades: e.target.value })} />
                <div style={{ fontSize: 11, color: styles.text3, marginTop: 4 }}>{t.tradesPerformedHint}</div>
              </Field>
              <Field label={t.serviceArea}>
                <input style={inputStyle} value={form.serviceArea}
                  placeholder="Memphis metro, West TN, N. MS"
                  onChange={e => setForm({ ...form, serviceArea: e.target.value })} />
              </Field>
              <Field label={t.licenseNumbers}>
                <input style={inputStyle} value={form.licenseNumbers}
                  onChange={e => setForm({ ...form, licenseNumbers: e.target.value })} />
                <div style={{ fontSize: 11, color: styles.text3, marginTop: 4 }}>{t.licenseNumbersHint}</div>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={t.yearsInBusiness}>
                  <input style={inputStyle} value={form.yearsInBusiness} type="number" min="0"
                    onChange={e => setForm({ ...form, yearsInBusiness: e.target.value })} />
                </Field>
                <Field label={t.numEmployees}>
                  <input style={inputStyle} value={form.numEmployees} type="number" min="0"
                    onChange={e => setForm({ ...form, numEmployees: e.target.value })} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={t.unionAffiliation}>
                  <select style={inputStyle} value={form.unionAffiliation}
                    onChange={e => setForm({ ...form, unionAffiliation: e.target.value })}>
                    <option value="">Select…</option>
                    <option value="non-union">Non-Union</option>
                    <option value="union">Union</option>
                    <option value="both">Both / Merit</option>
                  </select>
                </Field>
                <Field label={t.einTaxId}>
                  <input style={inputStyle} value={form.einLast4} maxLength={4}
                    placeholder="XXXX"
                    onChange={e => setForm({ ...form, einLast4: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>

              {/* LOGIN CREDENTIALS */}
              <div style={{ fontSize: 11, fontWeight: 700, color: styles.text2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>
                Login Credentials
              </div>

              <Field label={t.password + ' *'}>
                <input style={inputStyle} type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} />
              </Field>

              {/* Docs upload note */}
              <div style={{
                marginTop: 16, padding: 12, background: styles.surface, borderRadius: 8,
                fontSize: 12, color: styles.text2, lineHeight: 1.5,
              }}>
                <strong style={{ color: styles.text }}>{t.signupDocsInfo}:</strong> {t.signupDocsHint}
              </div>
            </>
          )}

          {error && (
            <div style={{
              background: '#FEE2E2', color: styles.red, padding: '10px 14px',
              borderRadius: 6, fontSize: 13, marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500,
            }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <Btn size="lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}
            onClick={mode === 'login' ? handleLogin : mode === 'forgot' ? handleForgot : () => handleRegister(false)}>
            {busy ? <Loader2 size={16} className="spin" /> : null}
            {mode === 'login' ? t.login : mode === 'forgot' ? 'Send the link' : t.register}
          </Btn>
          {mode !== 'register' && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" onClick={() => { setError(''); setMode(mode === 'forgot' ? 'login' : 'forgot'); }} style={{
                background: 'transparent', border: 'none', color: styles.accentDk, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, padding: 4,
              }}>{mode === 'forgot' ? '← ' + t.login : t.forgotPassword}</button>
            </div>
          )}
        </Card>

        {/* Duplicate warning modal — surfaced when signup detects a possible match */}
        {duplicateWarning && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)',
            zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }} onClick={() => setDuplicateWarning(null)}>
            <div style={{
              background: '#fff', borderRadius: styles.radiusLg, padding: 28,
              maxWidth: 520, width: '100%', boxShadow: styles.shadowLg,
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{
                fontFamily: styles.fontBody, fontSize: 20, fontWeight: 700,
                letterSpacing: '-0.02em', color: styles.navy, marginBottom: 6, marginTop: 0,
              }}>⚠️ {t.possibleDuplicate}</h2>
              <div style={{ fontSize: 13, color: styles.text2, marginBottom: 14, lineHeight: 1.5 }}>
                {t.possibleDuplicateHint}
              </div>
              <div style={{
                background: styles.surface, borderRadius: 8, padding: 14,
                marginBottom: 16, maxHeight: 220, overflow: 'auto',
              }}>
                {duplicateWarning.matches.map((m, i) => (
                  <div key={m.user.id} style={{
                    padding: '8px 0',
                    borderBottom: i < duplicateWarning.matches.length - 1 ? `1px solid ${styles.border}` : 'none',
                  }}>
                    <div style={{ fontWeight: 700, color: styles.navy, fontSize: 14 }}>{m.user.company}</div>
                    {m.user.dbaName && <div style={{ fontSize: 12, color: styles.text2 }}>DBA: {m.user.dbaName}</div>}
                    {m.user.businessAddress && (
                      <div style={{ fontSize: 12, color: styles.text2 }}>
                        {m.user.businessAddress}
                        {m.user.businessCity && `, ${m.user.businessCity}`}
                        {m.user.businessState && `, ${m.user.businessState}`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: styles.text3, marginTop: 3 }}>
                      Matched on: {m.reasons.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Btn variant="ghost" onClick={() => {
                  setDuplicateWarning(null);
                  setMode('login');
                }}>{t.imAlreadyRegistered}</Btn>
                <Btn onClick={() => handleRegister(true)}>{t.continueAnyway}</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Language toggle on auth screen */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={() => setLang(lang === 'en' ? 'es' : 'en')} style={{
            background: 'transparent', color: styles.text2, border: 'none',
            cursor: 'pointer', fontSize: 13, padding: 8, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Globe size={14} /> {lang === 'en' ? 'Español' : 'English'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   JOB LIST (subs and admins)
   ============================================================ */
function JobList({ t, jobs, user, users, invites, onOpen, bids }) {
  // Admins see everything. Subs see:
  //  - all open PUBLIC jobs
  //  - PRIVATE jobs they were invited to (by email match)
  //  - jobs they already bid on (so they can find them later even if status changes)
  const bidJobIds = new Set(bids.filter(b => b.userId === user.id).map(b => b.jobId));
  const visibleJobs = user.role === 'admin'
    ? jobs
    : jobs.filter(j => {
        if (bidJobIds.has(j.id)) return true;  // always show jobs they've bid on
        if (j.status === 'closed' || j.status === 'won' || j.status === 'lost') return false;
        return canSeeJob(j, user, invites);
      });

  if (visibleJobs.length === 0) {
    return <EmptyState icon={Briefcase}
      message={user.role === 'admin' ? t.noJobsAdmin : t.noJobs} />;
  }

  return (
    <div>
      <SectionHeader icon={Briefcase} title={t.jobs} count={visibleJobs.length} />
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {visibleJobs.map(job => {
          const myBidExists = bids.some(b => b.jobId === job.id && b.userId === user.id);
          const jobBids = bids.filter(b => b.jobId === job.id);
          return <JobCard key={job.id} t={t} job={job} user={user} users={users}
            onClick={() => onOpen(job)} myBidExists={myBidExists} bidCount={jobBids.length} />;
        })}
      </div>
    </div>
  );
}

function JobCard({ t, job, user, users, onClick, myBidExists, bidCount }) {
  const due = new Date(job.bidDueDate);
  const now = new Date();
  const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  let dueText, dueColor;
  if (daysLeft < 0) { dueText = t.overdue; dueColor = styles.red; }
  else if (daysLeft === 0) { dueText = t.dueToday; dueColor = styles.accent; }
  else { dueText = `${daysLeft} ${t.daysLeft}`; dueColor = daysLeft <= 3 ? styles.accent : styles.text2; }
  const pm = users?.find(u => u.id === job.pmId);
  const estimator = users?.find(u => u.id === job.estimatorId);

  function ContactRow({ person, role }) {
    if (!person) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
        padding: '6px 0',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: styles.radiusFull,
          background: styles.accentSoft, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          <Shield size={13} color={styles.accent} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
          <div style={{ fontWeight: 600, color: styles.text, letterSpacing: '-0.01em' }}>{person.name}</div>
          <div style={{ color: styles.text2, fontSize: 11, letterSpacing: '-0.005em' }}>
            {role}
          </div>
        </div>
        {person.phone && (
          <a href={`tel:${person.phone.replace(/\D/g, '')}`}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 12, fontWeight: 600, color: styles.accent,
              textDecoration: 'none', whiteSpace: 'nowrap',
              padding: '5px 10px', background: '#fff',
              borderRadius: styles.radiusFull, flexShrink: 0,
              boxShadow: styles.shadowSm, letterSpacing: '-0.01em',
            }}>
            📞 {person.phone}
          </a>
        )}
      </div>
    );
  }

  return (
    <Card hover onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {job.status === 'won' && <Badge color={styles.green}>★ {t.wonJob}</Badge>}
          {job.status === 'lost' && <Badge color={styles.text2}>{t.lostJob}</Badge>}
          {(!job.status || job.status === 'open') && <Badge color={styles.green}>● {t.open}</Badge>}
          {job.status === 'closed' && <Badge color={styles.text2}>{t.closed}</Badge>}
          {(job.visibility === 'private') && <Badge color={styles.blue}>🔒 {t.private}</Badge>}
        </div>
        {myBidExists && <Badge color={styles.blue}>✓ {t.yourBid}</Badge>}
      </div>

      <h3 style={{
        fontFamily: styles.fontBody, fontSize: 18, fontWeight: 700,
        margin: '4px 0 12px', letterSpacing: '-0.02em', color: styles.text,
        lineHeight: 1.25,
      }}>{job.title}</h3>

      {job.address && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: styles.text2, marginBottom: 8, letterSpacing: '-0.01em' }}>
          <MapPin size={14} /> {job.address}
        </div>
      )}

      {(job.poNumber || job.projectId) && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10,
        }}>
          {job.poNumber && (
            <span style={{
              fontSize: 11, color: styles.text2, fontWeight: 600,
              background: styles.surface, padding: '3px 9px',
              borderRadius: styles.radiusFull, letterSpacing: '-0.005em',
            }}>PO {job.poNumber}</span>
          )}
          {job.projectId && (
            <span style={{
              fontSize: 11, color: styles.text2, fontWeight: 600,
              background: styles.surface, padding: '3px 9px',
              borderRadius: styles.radiusFull, letterSpacing: '-0.005em',
            }}>{t.projectRef} {job.projectId}</span>
          )}
        </div>
      )}

      {/* Role + trades sought — quick context for subs scanning the list */}
      {(job.grayCoRole || job.tradesSought) && (
        <div style={{
          background: '#FFFBEB', padding: '8px 12px', borderRadius: 8,
          marginBottom: 10, fontSize: 12, color: styles.text, lineHeight: 1.5,
          border: `1px solid ${styles.accentSoft}`,
        }}>
          <span style={{ fontWeight: 700, color: styles.accentDk }}>
            {job.grayCoRole === 'sub' ? '🔨 We\'re a Sub' : '🏗️ We\'re GC'}
          </span>
          {job.tradesSought && (
            <span style={{ color: styles.text2 }}> · bidding: {job.tradesSought}</span>
          )}
        </div>
      )}

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: dueColor, fontWeight: 600, marginBottom: 16,
        background: dueColor === styles.red ? styles.redSoft : (dueColor === styles.accent ? styles.accentSoft : styles.surface),
        padding: '5px 10px', borderRadius: styles.radiusFull, letterSpacing: '-0.01em',
      }}>
        <Clock size={12} /> {dueText} · Due {due.toLocaleDateString()}
      </div>

      {(pm || estimator) && (
        <div style={{
          background: styles.surface, padding: '10px 14px', borderRadius: 10,
          marginBottom: 14,
        }}>
          <ContactRow person={pm} role={t.projectManager} />
          {pm && estimator && estimator.id !== pm.id && (
            <div style={{ borderTop: `1px solid ${styles.border}`, margin: '4px -14px' }} />
          )}
          {(!pm || !estimator || estimator.id !== pm.id) && (
            <ContactRow person={estimator} role={t.estimator} />
          )}
        </div>
      )}

      {job.scope && (
        <div style={{
          fontSize: 13, color: styles.text2, lineHeight: 1.55, marginBottom: 14,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', letterSpacing: '-0.01em',
        }}>
          {job.scope}
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 14, borderTop: `1px solid ${styles.border}`,
        fontSize: 12, color: styles.text2, letterSpacing: '-0.01em',
      }}>
        <span>
          {job.plans?.length || 0} {job.plans?.length === 1 ? 'plan' : 'plans'}
          {user.role === 'admin' && ` · ${bidCount} ${bidCount === 1 ? t.bid : t.bids}`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: styles.accent, fontWeight: 600 }}>
          {t.view} <ChevronRight size={14} />
        </span>
      </div>
    </Card>
  );
}

/* ============================================================
   JOB DETAIL — view, download plans, submit bid
   ============================================================ */
function JobDetail({ t, job, user, bids, setBids, onBack, showToast, jobs, setJobs, users, subDocs, estimates, setEstimates, activity, setActivity, invites, setInvites, messages, setMessages, setView }) {
  const isAdmin = user.role === 'admin';
  const myBid = bids.find(b => b.jobId === job.id && b.userId === user.id);
  const jobBids = bids.filter(b => b.jobId === job.id);
  const due = new Date(job.bidDueDate);

  // Bid form starts from existing bid if there is one, otherwise blank.
  // If the sub navigates away mid-typing, their draft is loaded from storage on mount.
  const draftKey = `bid-draft:${job.id}:${user.id}`;
  const [bidForm, setBidForm] = useState(() => {
    if (myBid) return { amount: String(myBid.amount || ''), scope: myBid.scope || '', notes: myBid.notes || '' };
    return { amount: '', scope: '', notes: '' };
  });
  const [bidDocs, setBidDocs] = useState(myBid?.docs || []);
  // Load draft on mount (for subs only, no draft needed for admins on their own job)
  useEffect(() => {
    if (myBid || user.role !== 'sub') return;
    (async () => {
      try {
        const saved = await sget(draftKey);
        if (saved && (saved.amount || saved.scope || saved.notes)) {
          setBidForm(saved);
        }
      } catch (e) { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);
  // Save draft on any bid form change (debounced by React batching)
  useEffect(() => {
    if (myBid || user.role !== 'sub') return;
    if (!bidForm.amount && !bidForm.scope && !bidForm.notes) return;
    sset(draftKey, bidForm).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidForm]);

  const [fullPlans, setFullPlans] = useState(null);  // plans with binary data, lazy-loaded
  const [takeoffPlan, setTakeoffPlan] = useState(null);  // currently-open takeoff modal

  // Lazy-load the plan binaries when the job is opened (not in the list)
  useEffect(() => {
    (async () => {
      try {
        const p = await loadPlansFor(job.id);
        setFullPlans(p);
      } catch (e) {
        console.warn('plan load failed', e);
        setFullPlans([]);
      }
    })();
  }, [job.id]);

  async function downloadPlan(plan) {
    // Find the hydrated plan (with dataUrl) by filename match
    let dataUrl = plan.dataUrl;
    if (!dataUrl && fullPlans) {
      const hydrated = fullPlans.find(p => p.name === plan.name);
      dataUrl = hydrated?.dataUrl;
    }
    if (!dataUrl) { showToast('Plan file not available', 'error'); return; }
    openFile(dataUrl, plan.name);
    logDownload(plan.name);  // track for admin activity view
  }

  function submitBid() {
    // Block bid if required docs (W9, insurance) are missing or expired
    if (user.role === 'sub') {
      const check = hasCurrentRequired(user.id, subDocs);
      if (!check.ok) {
        showToast(t.docsBidBlocked, 'error');
        return;
      }
    }
    if (!bidForm.amount) { showToast('Enter a bid amount', 'error'); return; }
    const newBid = {
      id: newId('b'),
      jobId: job.id, userId: user.id,
      userName: user.name, userCompany: user.company,
      userEmail: user.email, userPhone: user.phone,
      amount: parseFloat(bidForm.amount),
      scope: bidForm.scope, notes: bidForm.notes,
      docs: bidDocs,
      submittedAt: new Date().toISOString(),
    };
    if (myBid) {
      setBids(bids.map(b => b.id === myBid.id ? { ...newBid, id: myBid.id } : b));
    } else {
      setBids([...bids, newBid]);
    }
    showToast(t.bidSubmitted);
    setBidForm({ amount: '', scope: '', notes: '' });
    // Clean up the draft — bid is now the real thing
    sdel(draftKey).catch(() => {});
  }

  async function deleteJob() {
    if (!confirm(t.confirmDelete)) return;
    await deletePlansFor(job.id);  // clean up the plans key too
    setJobs(jobs.filter(j => j.id !== job.id));
    setBids(bids.filter(b => b.jobId !== job.id));
    onBack();
    showToast('Job deleted');
  }

  function toggleStatus() {
    setJobs(jobs.map(j => j.id === job.id ? { ...j, status: j.status === 'closed' ? 'open' : 'closed' } : j));
  }

  // Log a "view" event when a sub opens a job (once per session per job)
  useEffect(() => {
    if (user.role !== 'sub') return;
    try {
      const alreadyLoggedThisSession = activity.some(a =>
        a.jobId === job.id && a.userId === user.id && a.kind === 'view' &&
        (Date.now() - new Date(a.at).getTime()) < 15 * 60 * 1000  // within 15 min
      );
      if (!alreadyLoggedThisSession) {
        setActivity(prev => [...prev, {
          id: newId('a'),
          jobId: job.id, userId: user.id, userName: user.name,
          userCompany: user.company, kind: 'view', at: new Date().toISOString(),
        }]);
      }
    } catch (e) { console.warn('view logging failed', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  function logDownload(planName) {
    if (user.role !== 'sub') return;
    try {
      setActivity(prev => [...prev, {
        id: newId('a'),
        jobId: job.id, userId: user.id, userName: user.name,
        userCompany: user.company, kind: 'download',
        planName, at: new Date().toISOString(),
      }]);
    } catch (e) { console.warn('download logging failed', e); }
  }

  function markWon() {
    setJobs(jobs.map(j => j.id === job.id ? { ...j, status: 'won', wonAt: new Date().toISOString() } : j));
    showToast('Marked WON. Plans are now archived permanently.');
  }
  function markLost() {
    setJobs(jobs.map(j => j.id === job.id ? { ...j, status: 'lost', lostAt: new Date().toISOString() } : j));
    showToast('Marked LOST.');
  }
  function reopenJob() {
    setJobs(jobs.map(j => j.id === job.id ? { ...j, status: 'open' } : j));
    showToast('Job reopened.');
  }

  // ---- EDIT JOB ----
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  function startEdit() {
    setEditForm({
      title: job.title || '',
      address: job.address || '',
      bidDueDate: job.bidDueDate || '',
      pmId: job.pmId || '',
      estimatorId: job.estimatorId || '',
      poNumber: job.poNumber || '',
      projectId: job.projectId || '',
      visibility: job.visibility || 'public',
      bidResultsSharing: job.bidResultsSharing || 'private',
      grayCoRole: job.grayCoRole || 'gc',
      tradesSought: job.tradesSought || '',
      tradeScopes: job.tradeScopes || [],
      scope: job.scope || '',
      specifications: job.specifications || '',
      notes: job.notes || '',
    });
    setEditing(true);
  }
  function saveEdit() {
    if (!editForm.title.trim()) { showToast('Project title is required.', 'error'); return; }
    if (!editForm.bidDueDate) { showToast('Bid due date is required.', 'error'); return; }
    if (!editForm.pmId) { showToast('Please select a Project Manager.', 'error'); return; }
    if (!editForm.estimatorId) { showToast('Please select an Estimator.', 'error'); return; }
    setJobs(jobs.map(j => j.id === job.id ? {
      ...j,
      title: editForm.title.trim(),
      address: editForm.address.trim(),
      bidDueDate: editForm.bidDueDate,
      pmId: editForm.pmId,
      estimatorId: editForm.estimatorId,
      poNumber: editForm.poNumber.trim(),
      projectId: editForm.projectId.trim(),
      visibility: editForm.visibility,
      bidResultsSharing: editForm.bidResultsSharing,
      grayCoRole: editForm.grayCoRole,
      tradesSought: editForm.tradesSought,
      tradeScopes: editForm.tradeScopes,
      scope: editForm.scope,
      specifications: editForm.specifications,
      notes: editForm.notes,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    } : j));
    setEditing(false);
    showToast('Job updated.');
  }
  function cancelEdit() { setEditing(false); }

  // Email the bid to office@grayco-cs.com using the user's mail client
  function emailBidToOffice() {
    if (!myBid) { showToast('Submit your bid on the portal first, then email.', 'error'); return; }
    const pm = users.find(u => u.id === job.pmId);
    const estimator = users.find(u => u.id === job.estimatorId);
    // Route TO the PM (primary), CC office and estimator so nothing gets missed
    const to = pm?.email || 'office@grayco-cs.com';
    const ccList = ['office@grayco-cs.com'];
    if (estimator?.email && estimator.id !== pm?.id && !ccList.includes(estimator.email)) {
      ccList.push(estimator.email);
    }
    const cc = ccList.join(',');
    const subject = `Bid Submission — ${job.title}${job.address ? ' — ' + job.address : ''} — $${myBid.amount.toLocaleString()}`;
    const lines = [
      `Subcontractor Portal — Bid Submission`,
      ``,
      `Project: ${job.title}`,
      job.address ? `Address: ${job.address}` : '',
      `Bid Due: ${new Date(job.bidDueDate).toLocaleDateString()}`,
      pm ? `Project Manager: ${pm.name}${pm.phone ? ' • ' + pm.phone : ''}` : '',
      estimator && estimator.id !== pm?.id ? `Estimator: ${estimator.name}${estimator.phone ? ' • ' + estimator.phone : ''}` : '',
      ``,
      `Company:  ${user.company}`,
      `Contact:  ${user.name}`,
      `Email:    ${user.email}`,
      user.phone ? `Phone:    ${user.phone}` : '',
      ``,
      `Bid Amount: $${myBid.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
      ``,
      myBid.scope ? `Scope included:\n${myBid.scope}\n` : '',
      myBid.notes ? `Notes / exclusions:\n${myBid.notes}\n` : '',
      `--`,
      `Submitted via GrayCo Subcontractor Portal on ${new Date(myBid.submittedAt).toLocaleString()}`,
      `Job Reference ID: ${job.id}`,
    ].filter(Boolean).join('\n');
    const url = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
    window.location.href = url;
    showToast(t.bidEmailPrepared);
  }

  // Invite a sub by email — creates an invite record and returns the URL
  function addInvite(email) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || !clean.includes('@')) return null;
    // Don't create duplicates for the same email+job
    const existing = invites.find(i => i.jobId === job.id && (i.email || '').toLowerCase() === clean);
    if (existing) return existing;
    const inv = {
      id: newId('i'),
      jobId: job.id, email: clean, token: makeToken(),
      createdAt: new Date().toISOString(),
      createdBy: user.id, createdByName: user.name,
    };
    setInvites(prev => [...prev, inv]);
    return inv;
  }

  // Helper: get or create the estimate for this job
  function ensureEstimate() {
    let est = estimates.find(e => e.jobId === job.id);
    if (est) return est;
    est = {
      id: newId('e'),
      jobId: job.id,
      number: 'EST-' + new Date().getFullYear() + '-' + String(estimates.length + 1).padStart(3, '0'),
      lineItems: [],
      marginPct: 15,   // flat margin — quick-pick from the standard rates
      notes: '',
      status: 'draft',
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
    };
    setEstimates([est, ...estimates]);
    return est;
  }

  function acceptBid(bid) {
    try {
      // Mark the bid accepted, clear any rejection
      setBids(bids.map(b => b.id === bid.id ? {
        ...b, accepted: true, rejected: false,
        acceptedAt: new Date().toISOString(),
        acceptedBy: user.name, acceptedById: user.id,
      } : b));
      // Add a line item to the job's estimate
      const est = ensureEstimate();
      const newItem = {
        id: newId('li'),
        bidId: bid.id,
        category: (bid.userCompany || 'Subcontractor'),
        description: bid.scope || `Awarded to ${bid.userCompany}`,
        qty: 1, unit: 'LS', unitPrice: bid.amount,
        notes: bid.notes || '',
        source: 'bid',
      };
      const updated = { ...est, lineItems: [...est.lineItems, newItem] };
      setEstimates(prev => {
        const exists = prev.find(e => e.id === est.id);
        return exists ? prev.map(e => e.id === est.id ? updated : e) : [updated, ...prev];
      });
      showToast(t.bidAccepted);
    } catch (err) {
      console.error('acceptBid failed', err);
      showToast('Could not accept bid: ' + (err?.message || 'unknown error'), 'error');
    }
  }

  function unacceptBid(bid) {
    setBids(bids.map(b => b.id === bid.id ? {
      ...b, accepted: false, acceptedAt: null, acceptedBy: null, acceptedById: null,
    } : b));
    // Remove any line items from the estimate that originated from this bid
    setEstimates(prev => prev.map(e => e.jobId === job.id
      ? { ...e, lineItems: e.lineItems.filter(li => li.bidId !== bid.id) }
      : e
    ));
    showToast('Bid un-accepted.');
  }

  function rejectBid(bid) {
    setBids(bids.map(b => b.id === bid.id ? {
      ...b, rejected: true, accepted: false,
      rejectedAt: new Date().toISOString(),
      rejectedBy: user.name, rejectedById: user.id,
    } : b));
  }

  function unrejectBid(bid) {
    setBids(bids.map(b => b.id === bid.id ? {
      ...b, rejected: false, rejectedAt: null, rejectedBy: null, rejectedById: null,
    } : b));
  }

  return (
    <div className="fade-in">
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack} style={{ marginBottom: 20 }}>
        {t.back}
      </Btn>

      {/* EDIT JOB PANEL — shown as an overlay card when editing */}
      {editing && (
        <Card style={{
          marginBottom: 20,
          border: `2px solid ${styles.accent}`,
          background: '#FFFBEB',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${styles.border}`,
          }}>
            <h2 style={{
              fontFamily: styles.fontBody, fontSize: 20, fontWeight: 700,
              letterSpacing: '-0.02em', color: styles.navy, margin: 0,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Edit3 size={20} /> Edit Job Details
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Btn>
              <Btn size="sm" icon={Check} onClick={saveEdit}>Save Changes</Btn>
            </div>
          </div>

          <Field label={t.projectTitle} required>
            <input style={inputStyle} value={editForm.title}
              onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <Field label={t.address}>
              <input style={inputStyle} value={editForm.address}
                onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
            </Field>
            <Field label={t.bidDueDate} required>
              <input style={inputStyle} type="date" value={editForm.bidDueDate}
                onChange={e => setEditForm({ ...editForm, bidDueDate: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t.poNumber}>
              <input style={inputStyle} value={editForm.poNumber}
                onChange={e => setEditForm({ ...editForm, poNumber: e.target.value })} />
            </Field>
            <Field label={t.projectId}>
              <input style={inputStyle} value={editForm.projectId}
                onChange={e => setEditForm({ ...editForm, projectId: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t.projectManager} required>
              <select style={inputStyle} value={editForm.pmId}
                onChange={e => setEditForm({ ...editForm, pmId: e.target.value })}>
                {users.filter(u => u.role === 'admin').map(u => (
                  <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label={t.estimator} required>
              <select style={inputStyle} value={editForm.estimatorId}
                onChange={e => setEditForm({ ...editForm, estimatorId: e.target.value })}>
                {users.filter(u => u.role === 'admin').map(u => (
                  <option key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ''}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t.visibility} required>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEditForm({ ...editForm, visibility: 'public' })}
                style={{
                  flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${editForm.visibility === 'public' ? styles.accent : styles.border}`,
                  background: editForm.visibility === 'public' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🌐 {t.public}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 2 }}>{t.publicHint}</div>
              </button>
              <button type="button" onClick={() => setEditForm({ ...editForm, visibility: 'private' })}
                style={{
                  flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${editForm.visibility === 'private' ? styles.accent : styles.border}`,
                  background: editForm.visibility === 'private' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🔒 {t.private}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 2 }}>{t.privateHint}</div>
              </button>
            </div>
          </Field>
          <Field label={t.grayCoRole}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEditForm({ ...editForm, grayCoRole: 'gc' })}
                style={{
                  flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${editForm.grayCoRole === 'gc' ? styles.accent : styles.border}`,
                  background: editForm.grayCoRole === 'gc' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🏗️ {t.roleGC}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 2 }}>{t.roleGCHint}</div>
              </button>
              <button type="button" onClick={() => setEditForm({ ...editForm, grayCoRole: 'sub' })}
                style={{
                  flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${editForm.grayCoRole === 'sub' ? styles.accent : styles.border}`,
                  background: editForm.grayCoRole === 'sub' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🔨 {t.roleSub}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 2 }}>{t.roleSubHint}</div>
              </button>
            </div>
          </Field>
          <Field label={t.tradesSought}>
            <input style={inputStyle} value={editForm.tradesSought}
              placeholder="e.g. Drywall, framing, insulation"
              onChange={e => setEditForm({ ...editForm, tradesSought: e.target.value })} />
            <div style={{ fontSize: 11, color: styles.text3, marginTop: 4, lineHeight: 1.4 }}>{t.tradesSoughtHint}</div>
          </Field>
          <Field label={t.resultsSharing}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { id: 'private', label: `🔒 ${t.resultsPrivate}`, hint: t.resultsPrivateHint },
                { id: 'ranks', label: `📊 ${t.resultsRanks}`, hint: t.resultsRanksHint },
                { id: 'full', label: `📋 ${t.resultsFull}`, hint: t.resultsFullHint },
              ].map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => setEditForm({ ...editForm, bidResultsSharing: opt.id })}
                  style={{
                    padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${editForm.bidResultsSharing === opt.id ? styles.accent : styles.border}`,
                    background: editForm.bidResultsSharing === opt.id ? '#FFFBEB' : '#fff',
                    borderRadius: 8, fontFamily: styles.fontBody,
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10.5, color: styles.text2, marginTop: 3, lineHeight: 1.4 }}>{opt.hint}</div>
                </button>
              ))}
            </div>
          </Field>
          <Field label={t.scope}>
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={editForm.scope}
              onChange={e => setEditForm({ ...editForm, scope: e.target.value })} />
          </Field>
          <Field label={t.specifications}>
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={editForm.specifications}
              onChange={e => setEditForm({ ...editForm, specifications: e.target.value })} />
          </Field>
          <TradeScopesEditor t={t}
            tradeScopes={editForm.tradeScopes}
            setTradeScopes={ts => setEditForm({ ...editForm, tradeScopes: ts })} />
          <Field label={t.notes}>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
          </Field>

          <div style={{
            marginTop: 8, padding: 12, background: styles.surface, borderRadius: 8,
            fontSize: 12, color: styles.text2, lineHeight: 1.5,
          }}>
            <strong>Note:</strong> Plans, scope/spec documents, bids, and activity history are managed separately —
            they aren't overwritten by this edit. Close this panel to see them.
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
        {/* MAIN PANEL */}
        <div>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge color={job.status === 'closed' ? styles.text2 : styles.green}>
              {job.status === 'closed' ? t.closed : t.open}
            </Badge>
          </div>
          <h1 style={{
            fontFamily: styles.fontDisplay, fontSize: 36, fontWeight: 700,
            margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1,
          }}>{job.title}</h1>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24, color: styles.text2, fontSize: 14 }}>
            {job.address && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><MapPin size={16} /> {job.address}</div>}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Calendar size={16} /> Due {due.toLocaleDateString()}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Users size={16} /> {jobBids.length} {jobBids.length === 1 ? t.bid : t.bids}
            </div>
          </div>

          {/* OUR ROLE — big prominent banner showing GC vs Sub + trades sought */}
          {(job.grayCoRole || job.tradesSought) && (
            <Card style={{
              marginBottom: 12,
              background: '#FFFBEB',
              border: `2px solid ${styles.accent}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: styles.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>
                  {job.grayCoRole === 'sub' ? '🔨' : '🏗️'}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: styles.accentDk,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{t.ourRoleOnJob}</div>
                  <div style={{
                    fontFamily: styles.fontBody, fontSize: 18, fontWeight: 700,
                    color: styles.navy, letterSpacing: '-0.02em', marginTop: 2,
                  }}>
                    GrayCo is the {job.grayCoRole === 'sub' ? t.roleSub : t.roleGC}
                  </div>
                  {job.tradesSought && (
                    <div style={{ fontSize: 13, color: styles.text, marginTop: 8, lineHeight: 1.5 }}>
                      <strong style={{ color: styles.text2 }}>{t.weAreBidding}</strong> {job.tradesSought}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* PROJECT CONTACTS — PM + Estimator, prominent so subs can reach out */}
          {(() => {
            const pm = users.find(u => u.id === job.pmId);
            const estimator = users.find(u => u.id === job.estimatorId);
            const samePerson = pm && estimator && pm.id === estimator.id;
            if (!pm && !estimator) return null;

            function ContactBlock({ person, role, isFirst }) {
              if (!person) return null;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  paddingTop: isFirst ? 0 : 14,
                  paddingBottom: isFirst ? 14 : 0,
                  borderBottom: isFirst ? `1px solid ${styles.navy2}` : 'none',
                }}>
                  <div style={{
                    width: 44, height: 44, background: styles.accent, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Shield size={22} color={styles.navy} />
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{
                      fontSize: 11, color: styles.accent, letterSpacing: '0.1em',
                      textTransform: 'uppercase', fontWeight: 600, marginBottom: 3,
                    }}>{role}</div>
                    <div style={{ fontFamily: styles.fontDisplay, fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
                      {person.name}
                    </div>
                    {person.title && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{person.title}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {person.phone && (
                      <a href={`tel:${person.phone.replace(/\D/g, '')}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 14px', background: styles.accent, color: styles.navy,
                        borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 14,
                        fontFamily: styles.fontBody,
                      }}>
                        <Phone size={14} /> {person.phone}
                      </a>
                    )}
                    {person.email && (
                      <a href={`mailto:${person.email}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 14px', background: 'transparent', color: '#fff',
                        borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13,
                        border: `1.5px solid ${styles.navy2}`,
                      }}>
                        <Mail size={14} /> {t.emailPM}
                      </a>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <Card style={{
                marginBottom: 16, background: styles.navy, color: '#fff',
                border: `1px solid ${styles.navy2}`,
              }}>
                {samePerson ? (
                  <ContactBlock person={pm} role={`${t.projectManager} & ${t.estimator}`} isFirst={false} />
                ) : (
                  <>
                    <ContactBlock person={pm} role={t.projectManager} isFirst={true} />
                    <ContactBlock person={estimator} role={t.estimator} isFirst={false} />
                  </>
                )}
              </Card>
            );
          })()}

          {(job.scope || (job.scopeDocs && job.scopeDocs.length > 0)) && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={sectionTitleStyle}><ClipboardList size={18} /> {t.scope}</h3>
              {job.scopeDocs && job.scopeDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: job.scope ? 14 : 0 }}>
                  {job.scopeDocs.map(doc => {
                    const sizeMB = doc.size / (1024 * 1024);
                    const sizeLabel = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(doc.size / 1024).toFixed(0)} KB`;
                    return (
                      <div key={doc.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', border: `1px solid ${styles.border}`,
                        borderRadius: 6, background: styles.cream,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <FileText size={18} color={styles.accent} style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{doc.name}</div>
                            <div style={{ fontSize: 11, color: styles.text2 }}>{sizeLabel}</div>
                          </div>
                        </div>
                        <Btn size="sm" icon={Download} onClick={() => {
                          openFile(doc.dataUrl, doc.name);
                          logDownload(doc.name);
                        }}>Download</Btn>
                      </div>
                    );
                  })}
                </div>
              )}
              {job.scope && (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: styles.text }}>{job.scope}</div>
              )}
            </Card>
          )}

          {(job.specifications || (job.specDocs && job.specDocs.length > 0)) && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={sectionTitleStyle}><FileText size={18} /> {t.specifications}</h3>
              {job.specDocs && job.specDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: job.specifications ? 14 : 0 }}>
                  {job.specDocs.map(doc => {
                    const sizeMB = doc.size / (1024 * 1024);
                    const sizeLabel = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(doc.size / 1024).toFixed(0)} KB`;
                    return (
                      <div key={doc.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', border: `1px solid ${styles.border}`,
                        borderRadius: 6, background: styles.cream,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <FileText size={18} color={styles.accent} style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{doc.name}</div>
                            <div style={{ fontSize: 11, color: styles.text2 }}>{sizeLabel}</div>
                          </div>
                        </div>
                        <Btn size="sm" icon={Download} onClick={() => {
                          openFile(doc.dataUrl, doc.name);
                          logDownload(doc.name);
                        }}>Download</Btn>
                      </div>
                    );
                  })}
                </div>
              )}
              {job.specifications && (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: styles.text }}>{job.specifications}</div>
              )}
            </Card>
          )}

          {/* Trade-specific scopes (optional) — one card per trade */}
          {job.tradeScopes && job.tradeScopes.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={sectionTitleStyle}><Briefcase size={18} /> {t.tradeScopes}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {job.tradeScopes.map((ts, idx) => (
                  <div key={ts.id || idx} style={{
                    border: `1px solid ${styles.border}`, borderRadius: 10, padding: 14,
                    background: styles.surface,
                  }}>
                    <div style={{
                      display: 'inline-block', padding: '4px 10px',
                      background: styles.accent, color: styles.navy,
                      fontSize: 12, fontWeight: 700, borderRadius: styles.radiusFull,
                      letterSpacing: '-0.01em', marginBottom: 8,
                    }}>
                      🔨 {ts.trade || `Trade ${idx + 1}`}
                    </div>
                    {ts.scope && (
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, color: styles.text }}>
                        {ts.scope}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {job.notes && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={sectionTitleStyle}><MessageSquare size={18} /> {t.notes}</h3>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: styles.text }}>{job.notes}</div>
            </Card>
          )}

          {/* PLANS */}
          <Card style={{ marginBottom: 16 }}>
            <h3 style={sectionTitleStyle}><FileText size={18} /> {t.plans}</h3>
            {(!job.plans || job.plans.length === 0) ? (
              <div style={{ color: styles.text2, fontSize: 13 }}>No plans uploaded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {job.plans.map((plan, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', border: `1px solid ${styles.border}`,
                    borderRadius: 6, background: styles.cream,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={20} color={styles.accent} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: styles.text2 }}>{(plan.size / 1024).toFixed(0)} KB</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Takeoff button — only shown for PDF plans */}
                      {(plan.name.toLowerCase().endsWith('.pdf') || plan.type === 'application/pdf') && (
                        <Btn size="sm" variant="ghost" onClick={() => {
                          // Pull the plan with its dataUrl (hydrated version)
                          const hydrated = (fullPlans || []).find(p => p.name === plan.name) || plan;
                          if (!hydrated.dataUrl) {
                            showToast('Plan not yet loaded. Try again in a moment.', 'error');
                            return;
                          }
                          setTakeoffPlan(hydrated);
                        }}>
                          📐 {t.measure}
                        </Btn>
                      )}
                      <Btn size="sm" icon={Download} onClick={() => downloadPlan(plan)}>
                        {t.downloadPlans}
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* TAKEOFF MODAL */}
          {takeoffPlan && (
            <TakeoffModal plan={takeoffPlan} jobId={job.id} user={user} t={t}
              onClose={() => setTakeoffPlan(null)} />
          )}

          {/* ADMIN: VIEW BIDS */}
          {isAdmin && jobBids.length > 0 && (
            <Card>
              <h3 style={sectionTitleStyle}><DollarSign size={18} /> {t.bidsReceived} ({jobBids.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {jobBids.sort((a, b) => a.amount - b.amount).map((b, idx) => (
                  <div key={b.id} style={{
                    border: `2px solid ${b.accepted ? styles.green : (b.rejected ? '#FCA5A5' : styles.border)}`,
                    borderRadius: 6, padding: 14,
                    background: b.accepted ? '#F0FDF4' : (b.rejected ? '#FEF2F2' : styles.cream),
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          {/* Placement rank — always visible to admins */}
                          <span style={{
                            fontFamily: styles.fontDisplay, fontSize: 11, fontWeight: 700,
                            background: idx === 0 ? styles.accent : styles.text3, color: idx === 0 ? styles.navy : '#fff',
                            padding: '3px 8px', borderRadius: styles.radiusFull, letterSpacing: '0.03em',
                          }}>
                            {idx === 0 ? '1ST' : idx === 1 ? '2ND' : idx === 2 ? '3RD' : `${idx + 1}TH`}
                          </span>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{b.userCompany}</div>
                          {b.accepted && <Badge color={styles.green}>✓ {t.accepted}</Badge>}
                          {b.rejected && <Badge color={styles.red}>{t.rejected}</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: styles.text2 }}>{b.userName} • {new Date(b.submittedAt).toLocaleString()}</div>
                      </div>
                      <div style={{
                        fontFamily: styles.fontDisplay, fontSize: 22, fontWeight: 700, color: styles.accent,
                      }}>${b.amount.toLocaleString()}</div>
                    </div>
                    {b.scope && <div style={{ fontSize: 13, marginTop: 8 }}><strong>Scope:</strong> {b.scope}</div>}
                    {b.notes && <div style={{ fontSize: 13, marginTop: 4, color: styles.text2 }}><strong>Notes:</strong> {b.notes}</div>}
                    {b.docs && b.docs.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: styles.text2, letterSpacing: '-0.005em' }}>
                          Attached bid documents:
                        </div>
                        {b.docs.map(doc => (
                          <a key={doc.id} href={doc.dataUrl} download={doc.name} target="_blank" rel="noopener"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: 12, color: styles.accent, textDecoration: 'none',
                              fontWeight: 600, padding: '4px 8px', background: '#fff',
                              borderRadius: 4, border: `1px solid ${styles.border}`,
                              width: 'fit-content',
                            }}>
                            <FileText size={12} /> {doc.name}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Audit trail — who accepted or rejected this bid, and when */}
                    {b.accepted && b.acceptedBy && (
                      <div style={{
                        marginTop: 10, fontSize: 12, color: '#065F46',
                        background: '#DCFCE7', padding: '6px 10px', borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
                      }}>
                        <Check size={13} /> Accepted by {b.acceptedBy} · {new Date(b.acceptedAt).toLocaleString()}
                      </div>
                    )}
                    {b.rejected && b.rejectedBy && (
                      <div style={{
                        marginTop: 10, fontSize: 12, color: '#991B1B',
                        background: '#FEE2E2', padding: '6px 10px', borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
                      }}>
                        <X size={13} /> Rejected by {b.rejectedBy} · {new Date(b.rejectedAt).toLocaleString()}
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!b.accepted && !b.rejected && (
                        <>
                          <Btn size="sm" variant="success" icon={Check} onClick={() => acceptBid(b)}>
                            {t.acceptBid}
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => rejectBid(b)}>
                            {t.rejectBid}
                          </Btn>
                        </>
                      )}
                      {b.accepted && (
                        <Btn size="sm" variant="ghost" onClick={() => unacceptBid(b)}>
                          {t.unacceptBid}
                        </Btn>
                      )}
                      {b.rejected && (
                        <Btn size="sm" variant="ghost" onClick={() => unrejectBid(b)}>
                          {t.unacceptBid}
                        </Btn>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {jobBids.some(b => b.accepted) && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${styles.border}`, display: 'flex', gap: 8 }}>
                  <Btn size="md" icon={TrendingUp} onClick={() => setView('estimating')}>
                    Open Estimate Builder →
                  </Btn>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* SIDEBAR — Bid form (subs) or Admin actions */}
        <div style={{ position: 'sticky', top: 20 }}>
          {!isAdmin ? (
            <>
            <Card>
              <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
                <Send size={18} /> {myBid ? `${t.yourBid}` : t.enterBid}
              </h3>
              {(() => {
                const check = hasCurrentRequired(user.id, subDocs);
                if (check.ok) return null;
                return (
                  <div style={{
                    background: '#FEE2E2', border: '1px solid #FCA5A5', padding: 12,
                    borderRadius: 6, marginBottom: 14, fontSize: 12, color: styles.red,
                    lineHeight: 1.5,
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <AlertCircle size={14} /> {t.docsMissing}
                    </div>
                    <div style={{ color: '#7F1D1D', marginBottom: 8 }}>{t.docsBidBlocked}</div>
                    <Btn size="sm" icon={Settings} onClick={() => setView('mySettings')}>
                      {t.mySettings}
                    </Btn>
                  </div>
                );
              })()}
              {myBid && (
                <div style={{
                  background: '#DBEAFE', padding: '8px 12px', borderRadius: 4,
                  fontSize: 12, color: styles.blue, marginBottom: 12, fontWeight: 600,
                }}>
                  ${myBid.amount.toLocaleString()} submitted {new Date(myBid.submittedAt).toLocaleDateString()}
                </div>
              )}
              <Field label={t.bidAmount} required>
                <input style={inputStyle} type="number" step="0.01"
                  placeholder={myBid ? myBid.amount : '0.00'}
                  value={bidForm.amount}
                  onChange={e => setBidForm({ ...bidForm, amount: e.target.value })} />
              </Field>
              <Field label={t.bidScope}>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                  value={bidForm.scope}
                  onChange={e => setBidForm({ ...bidForm, scope: e.target.value })} />
              </Field>
              <Field label={t.bidNotes}>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  value={bidForm.notes}
                  onChange={e => setBidForm({ ...bidForm, notes: e.target.value })} />
              </Field>
              <AttachmentList t={t} label={t.bidAttachments} hint={t.bidAttachmentsHint}
                docs={bidDocs} setDocs={setBidDocs} showToast={showToast} />
              <Btn size="lg" icon={Send} style={{ width: '100%', justifyContent: 'center' }}
                onClick={submitBid}>
                {myBid ? 'Update Bid' : t.enterBid}
              </Btn>
              {myBid && (
                <Btn size="md" variant="ghost" icon={Mail}
                  onClick={emailBidToOffice}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  {t.emailBidToOffice}
                </Btn>
              )}
            </Card>

            {/* BID PLACEMENT / RESULTS — shown to subs when admin has enabled sharing on this job */}
            {myBid && job.bidResultsSharing && job.bidResultsSharing !== 'private' && (
              (() => {
                // The server sends a sub only their place (and, for "full", the amounts without names)
                const sortedBids = myBid._total != null
                  ? (myBid._amounts
                      ? myBid._amounts.map((x, i) => ({ id: x.mine ? myBid.id : 'other' + i, amount: x.amount, accepted: x.accepted, userCompany: x.mine ? myBid.userCompany : '' }))
                      : Array.from({ length: myBid._total }, (_, i) => ({ id: i + 1 === myBid._rank ? myBid.id : 'other' + i, amount: 0 })))
                  : jobBids.slice().sort((a, b) => a.amount - b.amount);
                const myRank = sortedBids.findIndex(b => b.id === myBid.id) + 1;
                const winning = sortedBids.find(b => b.accepted) || sortedBids[0];
                const sharing = job.bidResultsSharing;
                return (
                  <Card style={{ marginTop: 12, borderTop: `3px solid ${styles.accent}` }}>
                    <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
                      <TrendingUp size={18} /> {t.bidResults}
                    </h3>
                    <div style={{
                      background: styles.surface, padding: '14px 16px', borderRadius: 10,
                    }}>
                      <div style={{ fontSize: 11, color: styles.text2, fontWeight: 600, letterSpacing: '-0.005em', marginBottom: 4 }}>
                        {t.yourPlacement}
                      </div>
                      <div style={{
                        fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: styles.navy,
                        display: 'flex', alignItems: 'baseline', gap: 6,
                      }}>
                        {myRank === 1 ? '1st' : myRank === 2 ? '2nd' : myRank === 3 ? '3rd' : `${myRank}th`}
                        {sharing === 'full' && (
                          <span style={{ fontSize: 13, color: styles.text2, fontWeight: 500 }}>
                            {t.placeOf} {sortedBids.length} {t.totalBids}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: styles.text2, marginTop: 4 }}>
                        Your bid: <strong>${myBid.amount.toLocaleString()}</strong>
                      </div>
                    </div>

                    {/* Full-amounts list — competitor names stay hidden even here */}
                    {sharing === 'full' && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: styles.text2,
                          letterSpacing: '-0.005em', marginBottom: 4,
                        }}>
                          All bid amounts (low to high):
                        </div>
                        {sortedBids.map((b, i) => {
                          const isMe = b.id === myBid.id;
                          return (
                            <div key={b.id} style={{
                              display: 'flex', justifyContent: 'space-between',
                              padding: '6px 10px', fontSize: 12, borderRadius: 4,
                              background: isMe ? '#FFFBEB' : 'transparent',
                              fontWeight: isMe ? 600 : 400,
                            }}>
                              <span>{i + 1}. {isMe ? `${b.userCompany} (you)` : `Bid #${i + 1}`}</span>
                              <span>${b.amount.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div style={{
                      fontSize: 11, color: styles.text3, marginTop: 10, lineHeight: 1.5,
                      fontStyle: 'italic',
                    }}>
                      {sharing === 'full'
                        ? 'Competitor company names are kept confidential.'
                        : 'Other bid details are kept confidential.'}
                    </div>
                  </Card>
                );
              })()
            )}
            {/* Sub messaging with the GrayCo team */}
            <MessagesPanel t={t} job={job} user={user} users={users}
              messages={messages} setMessages={setMessages}
              isAdmin={false} showToast={showToast} />
            </>
          ) : (
            <>
            <Card>
              <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
                <Settings size={18} /> Admin Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {job.status !== 'won' && job.status !== 'lost' && (
                  <>
                    <Btn variant="success" icon={Check} onClick={markWon}
                      style={{ justifyContent: 'center' }}>
                      {t.markWon}
                    </Btn>
                    <Btn variant="ghost" onClick={markLost} style={{ justifyContent: 'center' }}>
                      {t.markLost}
                    </Btn>
                  </>
                )}
                {(job.status === 'won' || job.status === 'lost') && (
                  <>
                    <div style={{
                      padding: '10px 12px', borderRadius: 6, textAlign: 'center',
                      background: job.status === 'won' ? '#D1FAE5' : '#F3F4F6',
                      color: job.status === 'won' ? '#065F46' : styles.text2,
                      fontWeight: 700, fontFamily: styles.fontDisplay, letterSpacing: '0.1em',
                    }}>
                      {job.status === 'won' ? `★ ${t.wonJob}` : t.lostJob}
                      {job.status === 'won' && (
                        <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, letterSpacing: '0.05em' }}>
                          Plans archived permanently
                        </div>
                      )}
                    </div>
                    <Btn variant="ghost" onClick={reopenJob} style={{ justifyContent: 'center' }}>
                      Reopen
                    </Btn>
                  </>
                )}
                <Btn variant={job.status === 'closed' ? 'success' : 'secondary'}
                  onClick={toggleStatus} style={{ justifyContent: 'center' }}>
                  {job.status === 'closed' ? 'Reopen to Bids' : 'Close to New Bids'}
                </Btn>
                <Btn variant="ghost" icon={Edit3} onClick={startEdit} style={{ justifyContent: 'center' }}>
                  Edit Job Details
                </Btn>
                <Btn variant="danger" icon={Trash2} onClick={deleteJob} style={{ justifyContent: 'center' }}>
                  Delete Job
                </Btn>
              </div>
              <div style={{
                marginTop: 16, padding: 12, background: styles.cream, borderRadius: 6,
                fontSize: 12, color: styles.text2, lineHeight: 1.6,
              }}>
                <div><strong>{t.createdBy}:</strong> {job.createdByName}</div>
                <div><strong>{t.createdOn}:</strong> {new Date(job.createdAt).toLocaleDateString()}</div>
                <div><strong>{t.visibility}:</strong> {job.visibility === 'private' ? `🔒 ${t.private}` : `🌐 ${t.public}`}</div>
              </div>
            </Card>

            {/* Invite panel — for private jobs, or optional add invites to public ones */}
            <InvitePanel t={t} job={job} invites={invites} addInvite={addInvite}
              setInvites={setInvites} showToast={showToast} />

            {/* In-portal messages — admin sees every sub's thread on this job */}
            <MessagesPanel t={t} job={job} user={user} users={users}
              messages={messages} setMessages={setMessages}
              isAdmin={true} showToast={showToast} />

            {/* Activity log */}
            <ActivityPanel t={t} job={job} activity={activity} bids={bids} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ATTACHMENT LIST — reusable file attach + list widget
   Used for job Scope Documents and Specification Documents
   ============================================================ */
function AttachmentList({ t, label, hint, docs, setDocs, accept, showToast }) {
  const fileRef = useRef();

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Files go to the private bucket: 50 MB each at most
    const MAX = MAX_FILE;
    const newDocs = [];
    let skipped = 0;
    for (const f of files) {
      try {
        if (f.size > MAX) { skipped++; continue; }
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('Read failed'));
          r.readAsDataURL(f);
        });
        newDocs.push({ id: newId('a'),
          name: f.name, size: f.size, type: f.type, dataUrl });
      } catch (err) {
        console.warn('Could not attach', f.name, err);
      }
    }
    if (newDocs.length) setDocs([...docs, ...newDocs]);
    if (e.target) e.target.value = '';
    if (skipped > 0) showToast(`${skipped} file(s) too large (50 MB each at most).`, 'error');
  }

  function downloadDoc(doc) {
    openFile(doc.dataUrl, doc.name);
  }

  function removeDoc(id) {
    setDocs(docs.filter(d => d.id !== id));
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{
          display: 'block', fontSize: 12, fontWeight: 600, color: styles.text2,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>{label}</label>
        <span style={{ fontSize: 11, color: styles.text2 }}>{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
      </div>
      <input ref={fileRef} type="file"
        accept={accept || '.pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,application/pdf'}
        multiple onChange={handleFiles} style={{ display: 'none' }} />
      <Btn variant="ghost" size="sm" icon={Upload} onClick={() => fileRef.current.click()}>
        {t.attachDoc}
      </Btn>
      {hint && <div style={{ fontSize: 11, color: styles.text2, marginTop: 4 }}>{hint}</div>}
      {docs.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => {
            const sizeMB = doc.size / (1024 * 1024);
            const sizeLabel = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(doc.size / 1024).toFixed(0)} KB`;
            return (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: styles.cream, borderRadius: 4,
                fontSize: 13, border: `1px solid ${styles.border}`,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <FileText size={16} color={styles.accent} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.name}
                  </span>
                  <span style={{ color: styles.text2, flexShrink: 0 }}>({sizeLabel})</span>
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => downloadDoc(doc)} title="Download"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: styles.text2, padding: 4 }}>
                    <Download size={14} />
                  </button>
                  <button onClick={() => removeDoc(doc.id)} title="Remove"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: styles.red, padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAKEOFF MODAL — full-featured (Bluebeam-style basics)
   
   Tools: Line, Rectangle, Polygon/Area, Set Scale
   Multi-page navigation (all pages, per-page scale)
   Zoom in/out/reset with pan (mouse-drag on background)
   Trade layers with color coding + toggle visibility
   Per-measurement label + share-with-GrayCo toggle
   CSV export (all measurements across pages)
   Read-only viewer mode for admins viewing a sub's shared takeoffs
   
   Storage: `takeoff:{userId}:{jobId}:{planName}` holds the full doc:
     { perPageScale, measurements, layers, hiddenLayerIds }
   
   Shared-with-GrayCo model: each measurement has `.shared: bool`.
   Admins can browse subs who have any `.shared` measurements on this job's
   plans, and open the modal in read-only mode filtered to shared only.
   ============================================================ */

const DEFAULT_TAKEOFF_LAYERS = [
  { id: 'l_gen',   name: 'General',    color: '#DC2626' },
  { id: 'l_dw',    name: 'Drywall',    color: '#2563EB' },
  { id: 'l_frm',   name: 'Framing',    color: '#059669' },
  { id: 'l_mep',   name: 'MEP',        color: '#7C3AED' },
  { id: 'l_flr',   name: 'Flooring',   color: '#EA580C' },
  { id: 'l_roof',  name: 'Roofing',    color: '#DB2777' },
];

// Shoelace area formula for polygon (returns absolute pixel area)
function polygonArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y;
    sum -= pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(pts) {
  if (!pts || pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    sum += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  // close the loop for polygon
  if (pts.length >= 3) {
    sum += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return sum;
}

function parseFeetInput(str) {
  if (!str) return null;
  const s = str.toString().trim().replace(/["]/g, '');
  const ftInMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(\d+(?:\.\d+)?)?\s*(?:in|inches)?$/i);
  if (ftInMatch) {
    const ft = parseFloat(ftInMatch[1]);
    const inches = ftInMatch[2] ? parseFloat(ftInMatch[2]) : 0;
    return ft + inches / 12;
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function formatFeet(feet) {
  if (!isFinite(feet)) return '?';
  const ft = Math.floor(feet);
  const inches = Math.round((feet - ft) * 12);
  if (inches === 0) return `${ft}'`;
  if (inches === 12) return `${ft + 1}'`;
  return `${ft}'-${inches}"`;
}

function TakeoffModal({ plan, jobId, user, onClose, t, readOnly = false, sharedFrom = null, storageOverride = null }) {
  const canvasRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const [pdfDoc, setPdfDoc] = React.useState(null);
  const [pageNum, setPageNum] = React.useState(1);
  const [numPages, setNumPages] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);
  const [baseScale, setBaseScale] = React.useState(1);  // fit-to-width scale
  const [loadError, setLoadError] = React.useState(null);
  const [renderReady, setRenderReady] = React.useState(false);

  const [tool, setTool] = React.useState('line');  // 'line' | 'rect' | 'poly' | 'setScale'
  const [pending, setPending] = React.useState([]);  // in-progress points
  const [perPageScale, setPerPageScale] = React.useState({});  // { pageNum: pxPerFoot }
  const [measurements, setMeasurements] = React.useState([]);  // per-page below
  const [layers, setLayers] = React.useState(DEFAULT_TAKEOFF_LAYERS);
  const [activeLayerId, setActiveLayerId] = React.useState(DEFAULT_TAKEOFF_LAYERS[0].id);
  const [hiddenLayerIds, setHiddenLayerIds] = React.useState([]);
  const [defaultShareOn, setDefaultShareOn] = React.useState(false);

  const storageKey = storageOverride || `takeoff:${user.id}:${jobId}:${plan.name}`;

  // Load saved state
  React.useEffect(() => {
    (async () => {
      try {
        const saved = await sget(storageKey);
        if (saved) {
          if (saved.measurements) setMeasurements(saved.measurements);
          if (saved.perPageScale) setPerPageScale(saved.perPageScale);
          if (saved.layers) setLayers(saved.layers);
          if (saved.hiddenLayerIds) setHiddenLayerIds(saved.hiddenLayerIds);
        }
      } catch (e) { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on any material change (skip in read-only)
  React.useEffect(() => {
    if (readOnly || !renderReady) return;
    sset(storageKey, { measurements, perPageScale, layers, hiddenLayerIds }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, perPageScale, layers, hiddenLayerIds, renderReady]);

  // Load PDF once
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window !== 'undefined' && !window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        if (cancelled) return;
        if (!plan.name.toLowerCase().endsWith('.pdf') && plan.type !== 'application/pdf') {
          setLoadError('Takeoff only works on PDF plans.');
          return;
        }
        const dataUrl = plan.dataUrl;
        if (!dataUrl) { setLoadError('Plan file not loaded. Try re-opening the job.'); return; }
        const pdf = await window.pdfjsLib.getDocument(dataUrl).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (e) {
        console.error('Takeoff PDF load failed:', e);
        setLoadError('Could not load PDF for takeoff: ' + (e.message || String(e)));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render current page whenever page or zoom changes
  React.useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const containerWidth = Math.min(880, window.innerWidth - 100);
        const viewport1x = page.getViewport({ scale: 1 });
        const fitScale = containerWidth / viewport1x.width;
        setBaseScale(fitScale);
        const effectiveScale = fitScale * zoom;
        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        overlay.width = viewport.width;
        overlay.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (!cancelled) setRenderReady(true);
      } catch (e) { console.warn('page render failed', e); }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, zoom]);

  // Draw overlay whenever anything visual changes
  React.useEffect(() => {
    if (!renderReady) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Draw all measurements on the current page (skip hidden layers)
    const pageScale = perPageScale[pageNum];
    measurements
      .filter(m => m.page === pageNum && !hiddenLayerIds.includes(m.layerId))
      .forEach(m => {
        const layer = layers.find(l => l.id === m.layerId) || layers[0];
        drawMeasurement(ctx, m, layer.color, pageScale, zoom);
      });

    // Draw pending points (in-progress measurement)
    if (pending.length > 0) {
      const pendingColor = tool === 'setScale' ? '#B91C1C' : (layers.find(l => l.id === activeLayerId)?.color || '#DC2626');
      ctx.strokeStyle = pendingColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      // Draw lines connecting pending points
      ctx.beginPath();
      pending.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x * zoom, pt.y * zoom);
        else ctx.lineTo(pt.x * zoom, pt.y * zoom);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw dots at each pending point
      pending.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * zoom, pt.y * zoom, 5, 0, Math.PI * 2);
        ctx.fillStyle = pendingColor;
        ctx.fill();
      });
    }
  }, [measurements, pending, renderReady, pageNum, zoom, layers, hiddenLayerIds, activeLayerId, tool, perPageScale]);

  function drawMeasurement(ctx, m, color, pageScale, zoomFactor) {
    const z = zoomFactor;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (m.type === 'line') {
      const [a, b] = m.points;
      ctx.beginPath();
      ctx.moveTo(a.x * z, a.y * z); ctx.lineTo(b.x * z, b.y * z);
      ctx.stroke();
      drawEndpoints(ctx, m.points, color, z);
      const mid = { x: ((a.x + b.x) / 2) * z, y: ((a.y + b.y) / 2) * z };
      const lbl = m.label || (pageScale ? formatFeet(Math.hypot(b.x - a.x, b.y - a.y) / pageScale) : `${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)}px`);
      drawLabelBox(ctx, mid.x, mid.y, lbl, color);
    } else if (m.type === 'rect') {
      const [a, b] = m.points;
      const x = Math.min(a.x, b.x) * z, y = Math.min(a.y, b.y) * z;
      const w = Math.abs(b.x - a.x) * z, h = Math.abs(b.y - a.y) * z;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = color + '22';  // 13% alpha
      ctx.fillRect(x, y, w, h);
      const areaPx = Math.abs(b.x - a.x) * Math.abs(b.y - a.y);
      const lbl = m.label || (pageScale ? `${(areaPx / (pageScale * pageScale)).toFixed(1)} SF` : `${areaPx.toFixed(0)}px²`);
      drawLabelBox(ctx, x + w / 2, y + h / 2, lbl, color);
    } else if (m.type === 'poly') {
      if (m.points.length < 2) return;
      ctx.beginPath();
      m.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x * z, pt.y * z);
        else ctx.lineTo(pt.x * z, pt.y * z);
      });
      ctx.closePath();
      ctx.fillStyle = color + '22';
      ctx.fill();
      ctx.stroke();
      drawEndpoints(ctx, m.points, color, z);
      const areaPx = polygonArea(m.points);
      const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length * z;
      const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length * z;
      const lbl = m.label || (pageScale ? `${(areaPx / (pageScale * pageScale)).toFixed(1)} SF` : `${areaPx.toFixed(0)}px²`);
      drawLabelBox(ctx, cx, cy, lbl, color);
    }
    // "Shared" indicator
    if (m.shared) {
      const anchor = m.points[0];
      ctx.beginPath();
      ctx.arc(anchor.x * z, anchor.y * z, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#D4A017';
      ctx.fill();
      ctx.fillStyle = '#140665';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', anchor.x * z, anchor.y * z);
    }
  }
  function drawEndpoints(ctx, pts, color, z) {
    pts.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x * z, pt.y * z, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
  }
  function drawLabelBox(ctx, x, y, text, color) {
    ctx.font = 'bold 11px Inter, sans-serif';
    const w = Math.max(ctx.measureText(text).width + 12, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(x - w / 2, y - 10, w, 20);
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - 10, w, 20);
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function onCanvasClick(e) {
    if (!renderReady || readOnly) return;
    const rect = overlayRef.current.getBoundingClientRect();
    // Convert click to unzoomed coordinates
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const newPending = [...pending, { x, y }];

    if (tool === 'setScale') {
      if (newPending.length === 2) {
        const [a, b] = newPending;
        const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
        const answer = prompt(t.scaleSetPrompt);
        if (answer) {
          const feet = parseFeetInput(answer);
          if (feet && feet > 0) {
            setPerPageScale({ ...perPageScale, [pageNum]: pxDist / feet });
          } else {
            alert('Could not read that as a distance. Try "10" or "10ft" or "10\'6\"".');
          }
        }
        setPending([]);
        setTool('line');
      } else {
        setPending(newPending);
      }
    } else if (tool === 'line') {
      if (newPending.length === 2) { commitMeasurement('line', newPending); setPending([]); }
      else setPending(newPending);
    } else if (tool === 'rect') {
      if (newPending.length === 2) { commitMeasurement('rect', newPending); setPending([]); }
      else setPending(newPending);
    } else if (tool === 'poly') {
      setPending(newPending);
      // Polygon closes on double-click (see onCanvasDoubleClick)
    }
  }

  function onCanvasDoubleClick(e) {
    if (tool !== 'poly' || pending.length < 3) return;
    e.preventDefault();
    commitMeasurement('poly', pending);
    setPending([]);
  }

  function commitMeasurement(type, points) {
    setMeasurements(prev => [...prev, {
      id: newId('m'),
      type, page: pageNum, points,
      layerId: activeLayerId,
      label: '',
      shared: defaultShareOn,
      createdAt: new Date().toISOString(),
    }]);
  }

  function undoLast() {
    const onPage = measurements.filter(m => m.page === pageNum);
    if (onPage.length === 0) return;
    const last = onPage[onPage.length - 1];
    setMeasurements(measurements.filter(m => m.id !== last.id));
  }
  function clearPage() {
    if (!confirm(`Clear all measurements on page ${pageNum}?`)) return;
    setMeasurements(measurements.filter(m => m.page !== pageNum));
    setPending([]);
  }

  function exportCSV() {
    const rows = [['#', 'Page', 'Type', 'Layer', 'Label', 'Length (ft)', 'Area (SF)', 'Shared']];
    measurements.forEach((m, i) => {
      const layer = layers.find(l => l.id === m.layerId);
      const scale = perPageScale[m.page];
      let lengthFt = '', areaSf = '';
      if (m.type === 'line') {
        const [a, b] = m.points;
        if (scale) lengthFt = (Math.hypot(b.x - a.x, b.y - a.y) / scale).toFixed(2);
      } else if (m.type === 'rect') {
        const [a, b] = m.points;
        if (scale) {
          lengthFt = (2 * (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / scale).toFixed(2);
          areaSf = (Math.abs(b.x - a.x) * Math.abs(b.y - a.y) / (scale * scale)).toFixed(2);
        }
      } else if (m.type === 'poly') {
        if (scale) {
          lengthFt = (polygonPerimeter(m.points) / scale).toFixed(2);
          areaSf = (polygonArea(m.points) / (scale * scale)).toFixed(2);
        }
      }
      rows.push([i + 1, m.page, m.type, layer?.name || '', m.label || '', lengthFt, areaSf, m.shared ? 'yes' : '']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `takeoff-${plan.name.replace(/\.pdf$/i, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function toggleLayerVisibility(layerId) {
    setHiddenLayerIds(prev => prev.includes(layerId) ? prev.filter(x => x !== layerId) : [...prev, layerId]);
  }
  function addLayer() {
    const name = prompt('New layer name?');
    if (!name) return;
    const colors = ['#DC2626', '#2563EB', '#059669', '#7C3AED', '#EA580C', '#DB2777', '#0891B2', '#CA8A04'];
    const color = colors[layers.length % colors.length];
    setLayers([...layers, { id: newId('l'), name: name.trim(), color }]);
  }
  function updateMeasurement(id, patch) {
    setMeasurements(measurements.map(m => m.id === id ? { ...m, ...patch } : m));
  }
  function deleteMeasurement(id) {
    setMeasurements(measurements.filter(m => m.id !== id));
  }

  const pageScale = perPageScale[pageNum];
  const visibleMeasurements = readOnly
    ? measurements.filter(m => m.shared)  // only show shared ones in read-only
    : measurements;
  const pageMeasurements = visibleMeasurements.filter(m => m.page === pageNum && !hiddenLayerIds.includes(m.layerId));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)',
      zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 12, overflow: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: styles.radiusLg,
        padding: 16, maxWidth: 1200, width: '100%', boxShadow: styles.shadowLg,
        display: 'flex', flexDirection: 'column', gap: 10,
      }} onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontFamily: styles.fontBody, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: styles.navy }}>
              📐 {t.takeoff} — {plan.name}
            </h2>
            <div style={{ fontSize: 12, color: styles.text2, marginTop: 2 }}>
              {pageScale
                ? `Page ${pageNum} scale: 1 ft = ${pageScale.toFixed(1)}px`
                : `Page ${pageNum}: ${t.scaleNotSet}`}
            </div>
          </div>
          {readOnly && sharedFrom && (
            <div style={{
              padding: '6px 12px', background: '#FFFBEB', border: `1px solid ${styles.accent}`,
              borderRadius: 6, fontSize: 12, color: styles.navy, fontWeight: 600,
            }}>👁 {t.readOnlyBanner} {sharedFrom}</div>
          )}
          <Btn variant="ghost" size="sm" icon={X} onClick={onClose}>{t.closeTakeoff}</Btn>
        </div>

        {/* TOOLBAR */}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 10px', background: styles.surface, borderRadius: 8, alignItems: 'center' }}>
            <Btn size="sm" variant={tool === 'setScale' ? 'primary' : 'ghost'} onClick={() => { setTool('setScale'); setPending([]); }}>
              {pageScale ? '↻ Scale' : '⚙ Set Scale'}
            </Btn>
            <div style={{ width: 1, height: 24, background: styles.border, margin: '0 2px' }} />
            <Btn size="sm" variant={tool === 'line' ? 'primary' : 'ghost'} onClick={() => { setTool('line'); setPending([]); }}>
              📏 {t.measureLine}
            </Btn>
            <Btn size="sm" variant={tool === 'rect' ? 'primary' : 'ghost'} onClick={() => { setTool('rect'); setPending([]); }}>
              ▭ {t.measureRect}
            </Btn>
            <Btn size="sm" variant={tool === 'poly' ? 'primary' : 'ghost'} onClick={() => { setTool('poly'); setPending([]); }}>
              ⬡ {t.measurePoly}
            </Btn>
            <div style={{ width: 1, height: 24, background: styles.border, margin: '0 2px' }} />
            {/* Active layer selector */}
            <select value={activeLayerId} onChange={e => setActiveLayerId(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: 12, width: 'auto', fontWeight: 600 }}>
              {layers.map(l => <option key={l.id} value={l.id}>■ {l.name}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: styles.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={defaultShareOn} onChange={e => setDefaultShareOn(e.target.checked)} />
              Share new with GrayCo
            </label>
            <div style={{ width: 1, height: 24, background: styles.border, margin: '0 2px' }} />
            <Btn size="sm" variant="ghost" onClick={undoLast} disabled={measurements.filter(m => m.page === pageNum).length === 0}>{t.undo}</Btn>
            <Btn size="sm" variant="ghost" onClick={clearPage}>Clear Page</Btn>
            <Btn size="sm" variant="ghost" onClick={exportCSV} disabled={measurements.length === 0}>⬇ {t.exportCSV}</Btn>
          </div>
        )}

        {/* PAGE + ZOOM CONTROLS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <Btn size="sm" variant="ghost" onClick={() => setPageNum(Math.max(1, pageNum - 1))} disabled={pageNum === 1}>← {t.prevPage}</Btn>
          <span style={{ padding: '4px 10px', background: styles.surface, borderRadius: 6, fontWeight: 600 }}>
            {pageNum} {t.pageOf} {numPages}
          </span>
          <Btn size="sm" variant="ghost" onClick={() => setPageNum(Math.min(numPages, pageNum + 1))} disabled={pageNum === numPages}>{t.nextPage} →</Btn>
          <div style={{ width: 1, height: 20, background: styles.border, margin: '0 6px' }} />
          <Btn size="sm" variant="ghost" onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}>−</Btn>
          <span style={{ padding: '4px 10px', background: styles.surface, borderRadius: 6, fontWeight: 600, minWidth: 55, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <Btn size="sm" variant="ghost" onClick={() => setZoom(Math.min(4, zoom + 0.2))}>+</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setZoom(1)}>{t.zoomReset}</Btn>
          {tool === 'poly' && pending.length >= 3 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: styles.accentDk, fontStyle: 'italic' }}>{t.finishPolygon}</span>
          )}
        </div>

        {/* MAIN AREA — canvas + right sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10, minHeight: 480 }}>
          {/* PDF + overlay */}
          <div ref={containerRef} style={{
            background: '#F5F3EE', border: `1px solid ${styles.border}`, borderRadius: 8,
            padding: 10, overflow: 'auto', maxHeight: '70vh',
          }}>
            {loadError ? (
              <div style={{ padding: 40, textAlign: 'center', color: styles.red }}>{loadError}</div>
            ) : !renderReady ? (
              <div style={{ padding: 40, textAlign: 'center', color: styles.text2 }}>
                <Loader2 size={24} className="spin" color={styles.accent} />
                <div style={{ marginTop: 10, fontSize: 13 }}>Loading page…</div>
              </div>
            ) : null}
            <div style={{ position: 'relative', display: renderReady ? 'inline-block' : 'none' }}>
              <canvas ref={canvasRef} style={{ display: 'block' }} />
              <canvas ref={overlayRef}
                onClick={onCanvasClick}
                onDoubleClick={onCanvasDoubleClick}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  cursor: readOnly ? 'default' : 'crosshair',
                }} />
            </div>
          </div>

          {/* RIGHT SIDEBAR — layers + measurements list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            {/* Layers panel */}
            <div style={{ padding: 10, background: styles.surface, borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '-0.005em', color: styles.text2, marginBottom: 6 }}>{t.layers.toUpperCase()}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {layers.map(l => (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={!hiddenLayerIds.includes(l.id)} onChange={() => toggleLayerVisibility(l.id)} />
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: l.color, borderRadius: 2 }} />
                    <span>{l.name}</span>
                    <span style={{ marginLeft: 'auto', color: styles.text3, fontSize: 10 }}>
                      {measurements.filter(m => m.layerId === l.id).length}
                    </span>
                  </label>
                ))}
              </div>
              {!readOnly && (
                <button onClick={addLayer} style={{ marginTop: 6, background: 'transparent', border: 'none', color: styles.accentDk, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>{t.addLayer}</button>
              )}
            </div>

            {/* Measurements list for this page */}
            <div style={{ padding: 10, background: styles.surface, borderRadius: 8, flex: 1, overflow: 'auto', maxHeight: 380 }}>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '-0.005em', color: styles.text2, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>PAGE {pageNum} · {pageMeasurements.length}</span>
                {pageScale && (
                  <span style={{ color: styles.accent, fontWeight: 700 }}>
                    LF: {formatFeet(pageMeasurements.reduce((s, m) => {
                      if (m.type === 'line') { const [a, b] = m.points; return s + Math.hypot(b.x - a.x, b.y - a.y) / pageScale; }
                      if (m.type === 'rect') { const [a, b] = m.points; return s + 2 * (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / pageScale; }
                      if (m.type === 'poly') { return s + polygonPerimeter(m.points) / pageScale; }
                      return s;
                    }, 0))}
                  </span>
                )}
              </div>
              {pageMeasurements.length === 0 ? (
                <div style={{ fontSize: 11, color: styles.text3, fontStyle: 'italic', padding: 6 }}>{t.noMeasurements}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pageMeasurements.map((m, i) => {
                    const layer = layers.find(l => l.id === m.layerId) || layers[0];
                    const scale = perPageScale[m.page];
                    let summary = '';
                    if (m.type === 'line' && scale) { const [a, b] = m.points; summary = formatFeet(Math.hypot(b.x - a.x, b.y - a.y) / scale); }
                    else if (m.type === 'rect' && scale) { const [a, b] = m.points; summary = `${(Math.abs(b.x - a.x) * Math.abs(b.y - a.y) / (scale * scale)).toFixed(1)} SF`; }
                    else if (m.type === 'poly' && scale) { summary = `${(polygonArea(m.points) / (scale * scale)).toFixed(1)} SF`; }
                    return (
                      <div key={m.id} style={{
                        padding: 6, background: '#fff', borderRadius: 4,
                        borderLeft: `3px solid ${layer.color}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 4 }}>
                          <div style={{ fontWeight: 600, fontSize: 11 }}>#{i + 1} {m.type} {summary && `· ${summary}`}</div>
                          {!readOnly && (
                            <button onClick={() => deleteMeasurement(m.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: styles.red, padding: 0 }}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {!readOnly ? (
                          <>
                            <input type="text" placeholder="Label..." value={m.label}
                              onChange={e => updateMeasurement(m.id, { label: e.target.value })}
                              style={{ width: '100%', padding: '3px 6px', fontSize: 10, marginTop: 3, border: `1px solid ${styles.border}`, borderRadius: 3 }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: styles.text2, marginTop: 3, cursor: 'pointer' }}>
                              <input type="checkbox" checked={m.shared} onChange={e => updateMeasurement(m.id, { shared: e.target.checked })} />
                              {t.shareWithGrayCo}
                            </label>
                          </>
                        ) : m.label && (
                          <div style={{ fontSize: 10, color: styles.text2, marginTop: 2 }}>{m.label}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: styles.text3, lineHeight: 1.5, padding: 6, background: styles.surface, borderRadius: 6 }}>
          {readOnly
            ? `Read-only view of shared measurements. To make your own takeoff, open this plan from your account.`
            : `Measurements save automatically. Toggle "Share with GrayCo" per measurement to let admins see your takeoff on their side.`}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TRADE SCOPES EDITOR — reusable in AddJob and Edit
   Lets user add/remove/edit per-trade scope entries.
   Each entry: { id, trade, scope }
   ============================================================ */
function TradeScopesEditor({ t, tradeScopes, setTradeScopes }) {
  function addOne() {
    setTradeScopes([...tradeScopes, {
      id: newId('ts'),
      trade: '', scope: '',
    }]);
  }
  function update(id, patch) {
    setTradeScopes(tradeScopes.map(ts => ts.id === id ? { ...ts, ...patch } : ts));
  }
  function remove(id) {
    setTradeScopes(tradeScopes.filter(ts => ts.id !== id));
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 12, fontWeight: 600, color: styles.text2,
        letterSpacing: '-0.005em', marginBottom: 4,
      }}>{t.tradeScopes}</div>
      <div style={{ fontSize: 11, color: styles.text3, marginBottom: 10, lineHeight: 1.5 }}>
        {t.tradeScopesHint}
      </div>
      {tradeScopes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
          {tradeScopes.map((ts, idx) => (
            <div key={ts.id} style={{
              border: `1px solid ${styles.border}`, borderRadius: styles.radius,
              padding: 12, background: '#fff',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 11, color: styles.text2, fontWeight: 600 }}>
                  Trade #{idx + 1}
                </div>
                <button onClick={() => remove(ts.id)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: styles.red, padding: 2,
                }}><Trash2 size={14} /></button>
              </div>
              <input style={{ ...inputStyle, padding: '8px 12px', marginBottom: 8, fontWeight: 600 }}
                placeholder={t.tradeNamePlaceholder} value={ts.trade}
                onChange={e => update(ts.id, { trade: e.target.value })} />
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                placeholder={t.tradeScopePlaceholder} value={ts.scope}
                onChange={e => update(ts.id, { scope: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      <Btn variant="ghost" size="sm" icon={Plus} onClick={addOne}>
        {t.addTradeScope}
      </Btn>
    </div>
  );
}

/* ============================================================
   ADD JOB — with AI plan analysis
   ============================================================ */
function AddJob({ t, jobs, setJobs, user, users, showToast, setView }) {
  const [form, setForm] = useState({
    title: '', address: '', bidDueDate: '', pmId: user.id, estimatorId: user.id,
    poNumber: '', projectId: '',
    visibility: 'public', bidResultsSharing: 'private',
    grayCoRole: 'gc', tradesSought: '',
    scope: '', specifications: '', notes: '',
    tradeScopes: [],
  });
  const [plans, setPlans] = useState([]);
  const [scopeDocs, setScopeDocs] = useState([]);   // attached PDFs/docs for scope
  const [specDocs, setSpecDocs] = useState([]);     // attached PDFs/docs for specs
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const fileRef = useRef();

  async function handleFiles(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    // Plans go to the private bucket: 50 MB each at most
    const MAX_PROTOTYPE_SIZE = MAX_FILE;
    const newPlans = [];
    let skippedTooBig = 0;
    let skippedFailed = 0;
    for (const f of files) {
      try {
        if (f.size > MAX_PROTOTYPE_SIZE) {
          skippedTooBig++;
          continue;
        }
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('FileReader failed'));
          r.readAsDataURL(f);
        });
        newPlans.push({ name: f.name, size: f.size, type: f.type, dataUrl });
      } catch (err) {
        console.warn('Could not read file', f.name, err);
        skippedFailed++;
      }
    }
    // Always commit the files that DID read successfully
    if (newPlans.length > 0) {
      setPlans([...plans, ...newPlans]);
    }
    // Reset the input so the same file can be re-selected if the user wants
    if (e.target) e.target.value = '';
    // Tell the user what happened, but never crash
    if (skippedTooBig > 0) {
      showToast(`${skippedTooBig} file(s) too large (50 MB each at most).`, 'error');
    }
    if (skippedFailed > 0) {
      showToast(`${skippedFailed} file(s) could not be read.`, 'error');
    }
    if (newPlans.length > 0 && skippedTooBig === 0 && skippedFailed === 0) {
      showToast(`Added ${newPlans.length} plan${newPlans.length === 1 ? '' : 's'}.`);
    }
  }

  async function analyzePlans() {
    if (plans.length === 0) { showToast('Upload plans first', 'error'); return; }
    setAnalyzing(true); setAiResult(null);
    try {
      // Use the first PDF for analysis (most projects = single PDF set)
      const pdf = plans.find(p => p.type === 'application/pdf') || plans[0];
      // The plan is uploaded once (saving the job later reuses it), then read on the server
      const fileRef = await uploadDataUrl(pdf.dataUrl, pdf.name);
      const parsed = await api('ai-plans', { fileRef });

      setForm(f => ({
        ...f,
        title: parsed.title || f.title,
        address: parsed.address || f.address,
        scope: parsed.scope || f.scope,
        specifications: parsed.specifications || f.specifications,
        notes: parsed.notes || f.notes,
      }));
      setAiResult('success');
      showToast(t.aiSuccess);
    } catch (e) {
      console.error(e);
      setAiResult('error');
      showToast(e.message || t.aiError, 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  function save() {
    try {
      if (!form.title) { showToast('Project title is required.', 'error'); return; }
      if (!form.bidDueDate) { showToast('Bid due date is required.', 'error'); return; }
      if (!form.pmId) { showToast('Please select a Project Manager.', 'error'); return; }
      if (!form.estimatorId) { showToast('Please select an Estimator.', 'error'); return; }
      // Auto-generate a PO if one wasn't provided — this PO carries over to the CRM
      // when the job is later officially created there. The two sides merge on this identifier.
      const poNumber = (form.poNumber || '').trim() || generatePO(jobs);
      const autoGenerated = !form.poNumber?.trim();
      const job = {
        id: newId('j'),
        ...form,
        poNumber,
        poAutoGenerated: autoGenerated,   // flag so CRM knows this PO originated here
        plans, scopeDocs, specDocs, status: 'open',
        createdBy: user.id, createdByName: user.name,
        createdAt: new Date().toISOString(),
      };
      setJobs([job, ...jobs]);
      showToast(autoGenerated
        ? `Job added. PO ${poNumber} assigned automatically.`
        : 'Job added.');
      setView('jobs');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Could not save job: ' + (err?.message || 'unknown error'), 'error');
    }
  }

  return (
    <div className="fade-in">
      <SectionHeader icon={Plus} title={t.addJob} />

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
          <FileText size={18} /> {t.uploadPlans}
        </h3>
        <input ref={fileRef} type="file" accept=".pdf,.zip,.dwg,.dxf,.dwf,.rvt,.skp,.png,.jpg,.jpeg,.tif,.tiff,application/pdf,application/zip,image/*" multiple onChange={handleFiles}
          style={{ display: 'none' }} />
        <Btn variant="ghost" icon={Upload} onClick={() => fileRef.current.click()}>
          {t.chooseFile}
        </Btn>

        {plans.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plans.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: styles.cream, borderRadius: 4,
                fontSize: 13, border: `1px solid ${styles.border}`,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color={styles.accent} />
                  {p.name} <span style={{ color: styles.text2 }}>({(p.size / 1024).toFixed(0)} KB)</span>
                </span>
                <button onClick={() => setPlans(plans.filter((_, j) => j !== i))} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', color: styles.red,
                  padding: 4,
                }}><X size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn variant="success" icon={Sparkles} onClick={analyzePlans}
            disabled={analyzing || plans.length === 0}
            style={{ opacity: (analyzing || plans.length === 0) ? 0.5 : 1 }}>
            {analyzing ? (
              <><Loader2 size={16} className="spin" /> {t.analyzing}</>
            ) : t.analyzeWithAI}
          </Btn>
          <span style={{ fontSize: 12, color: styles.text2, flex: '1 1 200px', minWidth: 200 }}>
            {t.aiHelpText}
          </span>
        </div>
      </Card>

      <Card>
        <Field label={t.projectTitle} required>
          <input style={inputStyle} value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Field label={t.address}>
            <input style={inputStyle} value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label={t.bidDueDate} required>
            <input style={inputStyle} type="date" value={form.bidDueDate}
              onChange={e => setForm({ ...form, bidDueDate: e.target.value })} />
          </Field>
        </div>
        {/* CRM linking — PO auto-generates here if empty; CRM merges on this identifier */}
        <div style={{
          background: styles.surface, padding: '14px 16px', borderRadius: styles.radius,
          marginBottom: 16, border: `1px dashed ${styles.border}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: styles.text2,
            letterSpacing: '-0.005em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Building2 size={13} color={styles.text2} strokeWidth={2} />
            CRM Link — PO carries over when the job is added to the CRM
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t.poNumber}>
              <input style={inputStyle} value={form.poNumber}
                placeholder="Auto-generated if blank"
                onChange={e => setForm({ ...form, poNumber: e.target.value })} />
              <div style={{ fontSize: 11, color: styles.text3, marginTop: 4, lineHeight: 1.4 }}>{t.poNumberHint}</div>
            </Field>
            <Field label={t.projectId}>
              <input style={inputStyle} value={form.projectId}
                placeholder="PROJ-2026-011 (if it exists)"
                onChange={e => setForm({ ...form, projectId: e.target.value })} />
              <div style={{ fontSize: 11, color: styles.text3, marginTop: 4, lineHeight: 1.4 }}>{t.projectIdHint}</div>
            </Field>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t.projectManager} required>
            <select style={inputStyle} value={form.pmId}
              onChange={e => setForm({ ...form, pmId: e.target.value })}>
              <option value="">{t.selectPM}</option>
              {users.filter(u => u.role === 'admin').map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.title ? ` — ${u.title}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.estimator} required>
            <select style={inputStyle} value={form.estimatorId}
              onChange={e => setForm({ ...form, estimatorId: e.target.value })}>
              <option value="">Select estimator…</option>
              {users.filter(u => u.role === 'admin').map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.title ? ` — ${u.title}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t.visibility} required>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setForm({ ...form, visibility: 'public' })}
              style={{
                flex: 1, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${form.visibility === 'public' ? styles.accent : styles.border}`,
                background: form.visibility === 'public' ? '#FFFBEB' : '#fff',
                borderRadius: 6, fontFamily: styles.fontBody,
              }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                🌐 {t.public}
              </div>
              <div style={{ fontSize: 11, color: styles.text2 }}>{t.publicHint}</div>
            </button>
            <button type="button" onClick={() => setForm({ ...form, visibility: 'private' })}
              style={{
                flex: 1, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${form.visibility === 'private' ? styles.accent : styles.border}`,
                background: form.visibility === 'private' ? '#FFFBEB' : '#fff',
                borderRadius: 6, fontFamily: styles.fontBody,
              }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                🔒 {t.private}
              </div>
              <div style={{ fontSize: 11, color: styles.text2 }}>{t.privateHint}</div>
            </button>
          </div>
        </Field>

        {/* GrayCo's role on this project — GC vs Sub — and what trades we need bids for */}
        <div style={{
          background: '#FAF8F4', padding: '16px 18px', borderRadius: 12,
          marginBottom: 16, border: `1px solid ${styles.border}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: styles.text2,
            letterSpacing: '-0.005em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Briefcase size={13} color={styles.text2} strokeWidth={2} />
            {t.grayCoRole}
          </div>
          <Field label={''}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setForm({ ...form, grayCoRole: 'gc' })}
                style={{
                  flex: 1, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${form.grayCoRole === 'gc' ? styles.accent : styles.border}`,
                  background: form.grayCoRole === 'gc' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🏗️ {t.roleGC}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 3, lineHeight: 1.4 }}>{t.roleGCHint}</div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, grayCoRole: 'sub' })}
                style={{
                  flex: 1, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${form.grayCoRole === 'sub' ? styles.accent : styles.border}`,
                  background: form.grayCoRole === 'sub' ? '#FFFBEB' : '#fff',
                  borderRadius: 8, fontFamily: styles.fontBody,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🔨 {t.roleSub}</div>
                <div style={{ fontSize: 11, color: styles.text2, marginTop: 3, lineHeight: 1.4 }}>{t.roleSubHint}</div>
              </button>
            </div>
          </Field>
          <Field label={t.tradesSought}>
            <input style={inputStyle} value={form.tradesSought}
              placeholder="e.g. Drywall, framing, insulation"
              onChange={e => setForm({ ...form, tradesSought: e.target.value })} />
            <div style={{ fontSize: 11, color: styles.text3, marginTop: 4, lineHeight: 1.4 }}>{t.tradesSoughtHint}</div>
          </Field>
        </div>

        <AttachmentList t={t} label={t.scopeAttachments} hint={t.attachHint}
          docs={scopeDocs} setDocs={setScopeDocs} showToast={showToast} />
        <Field label={t.orTypeScope}>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} />
        </Field>

        <AttachmentList t={t} label={t.specAttachments} hint={t.attachHint}
          docs={specDocs} setDocs={setSpecDocs} showToast={showToast} />
        <Field label={t.orTypeSpecs}>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={form.specifications} onChange={e => setForm({ ...form, specifications: e.target.value })} />
        </Field>

        {/* Trade-specific scopes — optional break-out when bidding multiple trades */}
        <TradeScopesEditor t={t}
          tradeScopes={form.tradeScopes}
          setTradeScopes={ts => setForm({ ...form, tradeScopes: ts })} />

        <Field label={t.notes}>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Field>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Btn size="lg" icon={Check} onClick={save}>{t.save}</Btn>
          <Btn variant="ghost" size="lg" onClick={() => setView('jobs')}>{t.cancel}</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   MY BIDS (sub view)
   ============================================================ */
function MyBids({ t, bids, jobs, user, onOpen }) {
  const myBids = bids.filter(b => b.userId === user.id);
  if (myBids.length === 0) {
    return <EmptyState icon={FileText} message={t.noBidsYet} />;
  }
  return (
    <div>
      <SectionHeader icon={FileText} title={t.myBids} count={myBids.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {myBids.map(b => {
          const job = jobs.find(j => j.id === b.jobId);
          if (!job) return null;
          return (
            <Card key={b.id} hover onClick={() => onOpen(job)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                    {job.title}
                  </div>
                  <div style={{ fontSize: 13, color: styles.text2 }}>
                    {job.address && <>{job.address} • </>}
                    Submitted {new Date(b.submittedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{
                  fontFamily: styles.fontDisplay, fontSize: 24, fontWeight: 700, color: styles.accent,
                }}>${b.amount.toLocaleString()}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   ALL BIDS (admin view)
   ============================================================ */
function AllBids({ t, bids, jobs, users, onOpen }) {
  if (bids.length === 0) {
    return <EmptyState icon={ClipboardList} message={t.noBidsYet} />;
  }
  // Group by job
  const grouped = {};
  bids.forEach(b => {
    if (!grouped[b.jobId]) grouped[b.jobId] = [];
    grouped[b.jobId].push(b);
  });
  return (
    <div>
      <SectionHeader icon={ClipboardList} title={t.allBids} count={bids.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(grouped).map(([jobId, jobBids]) => {
          const job = jobs.find(j => j.id === jobId);
          if (!job) return null;
          const sorted = [...jobBids].sort((a, b) => a.amount - b.amount);
          const low = sorted[0];
          return (
            <Card key={jobId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <div>
                  <h3 style={{
                    fontFamily: styles.fontDisplay, fontSize: 20, fontWeight: 600,
                    margin: 0, textTransform: 'uppercase',
                  }}>{job.title}</h3>
                  <div style={{ fontSize: 13, color: styles.text2, marginTop: 4 }}>
                    {jobBids.length} {jobBids.length === 1 ? t.bid : t.bids} • Low: ${low.amount.toLocaleString()} ({low.userCompany})
                  </div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => onOpen(job)}>{t.view}</Btn>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sorted.map((b, i) => (
                  <div key={b.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px',
                    background: i === 0 ? '#FEF3C7' : styles.cream,
                    border: `1px solid ${i === 0 ? '#FCD34D' : styles.border}`,
                    borderRadius: 4, fontSize: 13,
                  }}>
                    <div>
                      <strong>{b.userCompany}</strong>
                      <span style={{ color: styles.text2 }}> • {b.userName}</span>
                      {i === 0 && <Badge color={styles.accent} bg="#FCD34D">LOW</Badge>}
                    </div>
                    <div style={{ fontWeight: 700, fontFamily: styles.fontDisplay, fontSize: 17 }}>
                      ${b.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   PENDING SUBS (admin)
   ============================================================ */
function PendingSubs({ t, users, setUsers, showToast }) {
  const pending = users.filter(u => u.role === 'sub' && !u.approved);
  if (pending.length === 0) {
    return <EmptyState icon={UserCheck} message={t.noPending} />;
  }
  function approve(id) {
    setUsers(users.map(u => u.id === id ? { ...u, approved: true } : u));
    showToast('Subcontractor approved');
  }
  function deny(id) {
    if (!confirm(t.confirmDelete)) return;
    setUsers(users.filter(u => u.id !== id));
    showToast('Request denied');
  }
  return (
    <div>
      <SectionHeader icon={UserCheck} title={t.pendingSubs} count={pending.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map(u => (
          <Card key={u.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600 }}>{u.company}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{u.name}</div>
                <div style={{ fontSize: 13, color: styles.text2, marginTop: 6 }}>
                  <Mail size={12} style={{ verticalAlign: 'middle' }} /> {u.email}
                  {u.phone && <> • <Phone size={12} style={{ verticalAlign: 'middle' }} /> {u.phone}</>}
                </div>
                {u.trades?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {u.trades.map(tr => <Badge key={tr} color={styles.blue}>{tr}</Badge>)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="success" icon={Check} onClick={() => approve(u.id)}>{t.approve}</Btn>
                <Btn variant="danger" icon={X} onClick={() => deny(u.id)}>{t.deny}</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   APPROVED SUBS (admin)
   ============================================================ */
function ApprovedSubs({ t, users, setUsers, subDocs, showToast }) {
  const approved = users.filter(u => u.role === 'sub' && u.approved);
  const [viewingDocs, setViewingDocs] = useState(null);  // user whose docs we're viewing
  const [viewingWork, setViewingWork] = useState(null);  // user whose CRM work & pay we're viewing
  const [crmSubs, setCrmSubs] = useState(null);          // the CRM's subcontractor list, for linking
  useEffect(() => {
    api('crm-subs').then(r => setCrmSubs(r.subs || [])).catch(() => setCrmSubs([]));
  }, []);
  function linkCrm(id, crmSubId) {
    setUsers(users.map(u => u.id === id ? { ...u, crmSubId: crmSubId || null } : u));
    showToast(crmSubId ? 'Linked to the CRM record.' : 'CRM link removed.');
  }

  if (viewingWork) {
    return (
      <div>
        <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setViewingWork(null)} style={{ marginBottom: 20 }}>
          {t.back}
        </Btn>
        <MyWork t={t} user={viewingWork} asAdmin />
      </div>
    );
  }

  if (approved.length === 0) {
    return <EmptyState icon={Users} message="No approved subcontractors yet." />;
  }
  function revoke(id) {
    if (!confirm('Revoke access for this subcontractor?')) return;
    setUsers(users.map(u => u.id === id ? { ...u, approved: false } : u));
    showToast('Access revoked');
  }
  function downloadDoc(doc) {
    openFile(doc.dataUrl, doc.fileName);
  }

  if (viewingDocs) {
    const u = viewingDocs;
    const docs = subDocs?.[u.id] || [];
    return (
      <div>
        <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setViewingDocs(null)} style={{ marginBottom: 20 }}>
          {t.back}
        </Btn>
        <SectionHeader icon={FileText} title={`${t.subDocuments}: ${u.company}`} count={docs.length} />
        {docs.length === 0 ? (
          <EmptyState icon={FileText} message={t.noDocsYet} />
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {docs.map(doc => {
              const st = docStatus(doc);
              let badgeColor = styles.text2, badgeLabel = t.docNoExp;
              if (st.kind === 'expired') { badgeColor = styles.red; badgeLabel = t.docExpired; }
              else if (st.kind === 'expiring') { badgeColor = '#CA8A04'; badgeLabel = `${t.docExpiringSoon} (${st.days}d)`; }
              else if (st.kind === 'current') { badgeColor = styles.green; badgeLabel = t.docCurrent; }
              return (
                <Card key={doc.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Badge color={DOC_TYPES.find(d => d.id === doc.type)?.color || styles.navy}>
                      {docTypeLabel(doc.type, t)}
                    </Badge>
                    <Badge color={badgeColor}>{badgeLabel}</Badge>
                  </div>
                  <div style={{ fontFamily: styles.fontDisplay, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                    {doc.label}
                  </div>
                  <div style={{ fontSize: 12, color: styles.text2, marginBottom: 10 }}>
                    {doc.fileName} • {(doc.fileSize / 1024).toFixed(0)} KB
                    {doc.expirationDate && <> • Expires {new Date(doc.expirationDate).toLocaleDateString()}</>}
                  </div>
                  <Btn size="sm" icon={Download} onClick={() => downloadDoc(doc)}>View File</Btn>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader icon={Users} title={t.approvedSubs} count={approved.length} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {approved.map(u => {
          const check = hasCurrentRequired(u.id, subDocs || {});
          const docCount = (subDocs?.[u.id] || []).length;
          return (
            <Card key={u.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600 }}>{u.company}</div>
                {check.ok
                  ? <Badge color={styles.green}>✓ Docs</Badge>
                  : <Badge color={styles.red}>! Docs</Badge>}
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: styles.text2, marginTop: 6 }}>{u.email}</div>
              {u.trades?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {u.trades.map(tr => <Badge key={tr} color={styles.blue}>{tr}</Badge>)}
                </div>
              )}
              <Field label="CRM record (jobs, pay, 1099)">
                <select style={{ ...inputStyle, marginTop: 4 }} value={u.crmSubId || ''}
                  onChange={e => linkCrm(u.id, e.target.value)}>
                  <option value="">{crmSubs === null ? 'Loading…' : 'Not linked — pick the CRM record'}</option>
                  {(crmSubs || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.trade ? ' · ' + c.trade : ''}{c.email ? ' · ' + c.email : ''}</option>
                  ))}
                </select>
              </Field>
              {!u.crmSubId && (() => {
                // A likely match (same e-mail or company name) — staff confirm it; it is never linked by itself
                const norm = v => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const hit = (crmSubs || []).find(c => (c.email && c.email === (u.email || '').toLowerCase()) ||
                  (norm(c.name) && [u.company, u.dbaName].some(n => n && norm(n) === norm(c.name))));
                return hit ? (
                  <div style={{ fontSize: 12, color: styles.text2, marginTop: -8, marginBottom: 10 }}>
                    Likely match: <strong>{hit.name}</strong>{' '}
                    <button type="button" onClick={() => linkCrm(u.id, hit.id)} style={{
                      background: 'transparent', border: 'none', color: styles.accentDk, fontWeight: 700, cursor: 'pointer', padding: 0,
                    }}>Link it</button>
                  </div>
                ) : null;
              })()}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="ghost" icon={FileText} onClick={() => setViewingDocs(u)}>
                  {t.viewSubDocs} ({docCount})
                </Btn>
                <Btn size="sm" variant="ghost" icon={DollarSign} onClick={() => setViewingWork(u)}>
                  Work &amp; pay
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => revoke(u.id)}>
                  Revoke
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   MY WORK & PAY (subs; GrayCo can open it from Approved Subs)
   Read-only, straight from the CRM: jobs, invoices / payments,
   1099 totals and the insurance GrayCo has on file.
   ============================================================ */
function MyWork({ t, user, asAdmin = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await api('my-work', asAdmin ? { userId: user.id } : {})); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user.id]);

  const usd = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = d => d ? new Date(d + 'T12:00:00').toLocaleDateString() : '—';
  const stateColor = { paid: styles.green, approved: styles.blue, received: '#CA8A04', declined: styles.red };
  const statCard = {
    background: '#fff', border: `1px solid ${styles.border}`, borderRadius: styles.radius,
    padding: '14px 16px', boxShadow: styles.shadowSm,
  };
  const expiry = (label, date, days, carrier, exempt) => {
    let color = styles.text2, note = 'Not on file';
    if (exempt) { color = styles.green; note = 'Exempt'; }
    else if (date) {
      if (days < 0) { color = styles.red; note = 'Expired ' + day(date); }
      else if (days <= 30) { color = '#CA8A04'; note = 'Expires ' + day(date) + ` (${days}d)`; }
      else { color = styles.green; note = 'Good through ' + day(date); }
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: `1px solid ${styles.border}`, fontSize: 13, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{label}{carrier ? <span style={{ fontWeight: 400, color: styles.text2 }}> · {carrier}</span> : null}</span>
        <span style={{ color, fontWeight: 600 }}>{note}</span>
      </div>
    );
  };
  const yesNo = (label, ok) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${styles.border}`, fontSize: 13 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: ok ? styles.green : styles.text3, fontWeight: 600 }}>{ok ? '✓ On file' : 'Not on file'}</span>
    </div>
  );

  return (
    <div className="fade-in">
      <SectionHeader icon={DollarSign} title={asAdmin ? `${t.myWork}: ${user.company}` : t.myWork} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: styles.text2, lineHeight: 1.5, maxWidth: 720 }}>{t.mwIntro}</div>
        <Btn size="sm" variant="ghost" onClick={load} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : null} {t.mwRefresh}
        </Btn>
      </div>

      {error && <Card style={{ color: styles.red, marginBottom: 16 }}><AlertCircle size={16} style={{ verticalAlign: 'middle' }} /> {error}</Card>}
      {!data && !error && <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" color={styles.accent} /></div>}
      {data && !data.linked && <EmptyState icon={DollarSign} message={t.mwNotLinked} />}

      {data && data.linked && (
        <>
          {asAdmin && (
            <div style={{ fontSize: 12, color: styles.text2, marginBottom: 12 }}>
              CRM record: <strong>{data.crm.name}</strong>
            </div>
          )}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
            {[[t.mwWaiting, data.totals.waitingApproval], [t.mwApproved, data.totals.approvedUnpaid],
              [t.mwPaidYear, data.totals.paidThisYear], [t.mwPaidAll, data.totals.paidAllTime]].map(([label, v]) => (
              <div key={label} style={statCard}>
                <div style={{ fontSize: 11, color: styles.text2, fontWeight: 600 }}>{label}</div>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 22, fontWeight: 700, color: styles.navy, marginTop: 4 }}>{usd(v)}</div>
              </div>
            ))}
          </div>

          <Card style={{ marginBottom: 16 }}>
            <h3 style={sectionTitleStyle}><DollarSign size={18} /> {t.mwPay}</h3>
            {data.invoices.length === 0 ? (
              <div style={{ fontSize: 13, color: styles.text2 }}>{t.mwNoPay}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.invoices.map(iv => (
                  <div key={iv.id} style={{ border: `1px solid ${styles.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {iv.job || 'Job'}{iv.number ? ` · #${iv.number}` : ''}{iv.po ? ` · ${iv.po}` : ''}
                      </div>
                      <div style={{ fontFamily: styles.fontDisplay, fontWeight: 700, fontSize: 16 }}>{usd(iv.amount)}</div>
                    </div>
                    {iv.desc && <div style={{ fontSize: 12, color: styles.text2, marginTop: 2 }}>{iv.desc}</div>}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap', fontSize: 12, color: styles.text2 }}>
                      <Badge color={stateColor[iv.state] || styles.text2}>{iv.label}</Badge>
                      <span>Received {day(iv.received)}</span>
                      {iv.payDate && <span>· Pay date {day(iv.payDate)}</span>}
                      {iv.paidDate && <span>· Paid {day(iv.paidDate)}{iv.checkNo ? ` · Check #${iv.checkNo}` : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h3 style={sectionTitleStyle}><Briefcase size={18} /> {t.mwJobs}</h3>
            {data.jobs.length === 0 ? (
              <div style={{ fontSize: 13, color: styles.text2 }}>{t.mwNoJobs}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.jobs.map(j => (
                  <div key={j.id} style={{ border: `1px solid ${styles.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{j.job}{j.trade ? <span style={{ fontWeight: 400, color: styles.text2 }}> · {j.trade}</span> : null}</div>
                      <Badge color={j.status === 'Awarded' || j.status === 'In Progress' ? styles.green : j.status === 'Rejected' ? styles.red : styles.blue}>{j.status}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: styles.text2, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {j.address && <span><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {j.address}</span>}
                      {j.po && <span><Hash size={11} style={{ verticalAlign: 'middle' }} /> {j.po}</span>}
                      {j.amount > 0 && <span>Amount {usd(j.amount)}</span>}
                      {(j.start || j.end) && <span><Calendar size={11} style={{ verticalAlign: 'middle' }} /> {day(j.start)} – {day(j.end)}</span>}
                    </div>
                    {j.pm && j.pm.name && (
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        PM: <strong>{j.pm.name}</strong>
                        {j.pm.phone && <> · <a href={`tel:${j.pm.phone}`} style={{ color: styles.navy }}>{j.pm.phone}</a></>}
                      </div>
                    )}
                    {j.scope && <div style={{ fontSize: 12, color: styles.text, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{j.scope}</div>}
                  </div>
                ))}
              </div>
            )}
            {data.scopes.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>{t.mwScopes}</h4>
                {data.scopes.map(sc => (
                  <details key={sc.id} style={{ border: `1px solid ${styles.border}`, borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{sc.job || 'Scope of work'}{sc.sent ? ` · sent ${day(sc.sent)}` : ''}{sc.status ? ` · ${sc.status}` : ''}</summary>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{sc.body}</div>
                  </details>
                ))}
              </>
            )}
            {data.agreements.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>{t.mwAgreements}</h4>
                {data.agreements.map(a => (
                  <details key={a.id} style={{ border: `1px solid ${styles.border}`, borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{a.job} · {usd(a.amount)}{a.date ? ` · ${day(a.date)}` : ''}</summary>
                    {a.scope && <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{a.scope}</div>}
                    {a.terms && <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: styles.text2, lineHeight: 1.5, marginTop: 8 }}>{a.terms}</div>}
                  </details>
                ))}
              </>
            )}
          </Card>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Card>
              <h3 style={sectionTitleStyle}><Shield size={18} /> {t.mwInsurance}</h3>
              <div style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 8,
                background: data.compliance.okToPay ? styles.greenSoft : styles.redSoft,
                color: data.compliance.okToPay ? styles.green : styles.red,
              }}>{data.compliance.okToPay ? t.mwOkToPay : t.mwNotOkToPay}</div>
              {expiry('General liability (COI)', data.compliance.glExp, data.compliance.glDays, data.compliance.glCarrier)}
              {expiry("Workers' comp", data.compliance.wcExp, data.compliance.wcDays, data.compliance.wcCarrier, data.compliance.wcExempt)}
              {data.compliance.autoExp && expiry('Auto', data.compliance.autoExp, Math.ceil((new Date(data.compliance.autoExp + 'T12:00:00') - Date.now()) / 864e5), data.compliance.autoCarrier)}
              {yesNo('W-9', data.compliance.w9)}
              {yesNo('Subcontract agreement', data.compliance.subAgreement)}
              {yesNo('Lien waiver', data.compliance.lienWaiver)}
            </Card>
            <Card>
              <h3 style={sectionTitleStyle}><FileText size={18} /> {t.mwTax}</h3>
              <div style={{ fontSize: 12, color: styles.text2, lineHeight: 1.5, marginBottom: 10 }}>{t.mw1099Note}</div>
              {Object.keys(data.tax.paidByYear).length === 0 ? (
                <div style={{ fontSize: 13, color: styles.text2 }}>{t.mwNoPay}</div>
              ) : Object.keys(data.tax.paidByYear).sort().reverse().map(y => (
                <div key={y} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${styles.border}`, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{y}</span>
                  <span>
                    {usd(data.tax.paidByYear[y])}{' '}
                    <span style={{ color: data.tax.paidByYear[y] >= data.tax.threshold ? styles.navy : styles.text3, fontWeight: 600 }}>
                      {data.tax.paidByYear[y] >= data.tax.threshold ? '· 1099-NEC' : '· under $600'}
                    </span>
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 12, marginTop: 10 }}>
                W-9 on file: <strong>{data.tax.w9OnFile ? 'Yes' : 'No'}</strong>
                {data.tax.taxIdLast4 && <> · Tax ID ending <strong>{data.tax.taxIdLast4}</strong></>}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   ADMIN LINKS (plan rooms, etc.)
   ============================================================ */
function AdminLinks({ t, links, setLinks, showToast }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', category: '', notes: '' });

  function save() {
    if (!form.title || !form.url) { showToast('Title and URL required', 'error'); return; }
    let url = form.url;
    if (!url.startsWith('http')) url = 'https://' + url;
    setLinks([{ id: newId('l'), ...form, url, createdAt: new Date().toISOString() }, ...links]);
    setForm({ title: '', url: '', category: '', notes: '' });
    setAdding(false);
    showToast('Link saved');
  }

  function remove(id) {
    if (!confirm(t.confirmDelete)) return;
    setLinks(links.filter(l => l.id !== id));
  }

  // Group by category
  const grouped = {};
  links.forEach(l => {
    const cat = l.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(l);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <SectionHeader icon={LinkIcon} title={t.adminLinks} count={links.length} noMargin />
        {!adding && <Btn icon={Plus} onClick={() => setAdding(true)}>{t.addLink}</Btn>}
      </div>

      <div style={{
        background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6,
        padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Shield size={16} /> {t.adminOnly}
      </div>

      {adding && (
        <Card style={{ marginBottom: 16 }}>
          <Field label={t.linkTitle} required>
            <input style={inputStyle} value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. BuildingConnected - Tractor Supply Jackson" />
          </Field>
          <Field label={t.linkUrl} required>
            <input style={inputStyle} value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="https://..." />
          </Field>
          <Field label={t.linkCategory}>
            <input style={inputStyle} value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Plan Rooms, Bid Boards, Vendors, Suppliers" />
          </Field>
          <Field label={t.linkNotes}>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon={Check} onClick={save}>{t.save}</Btn>
            <Btn variant="ghost" onClick={() => { setAdding(false); setForm({ title: '', url: '', category: '', notes: '' }); }}>
              {t.cancel}
            </Btn>
          </div>
        </Card>
      )}

      {links.length === 0 && !adding ? (
        <EmptyState icon={LinkIcon} message={t.noLinks} />
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <h3 style={{
              fontFamily: styles.fontDisplay, fontSize: 16, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: styles.text2, margin: '0 0 10px',
              borderBottom: `2px solid ${styles.accent}`, paddingBottom: 6, display: 'inline-block',
            }}>{cat}</h3>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {items.map(l => (
                <Card key={l.id} style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                    <a href={l.url} target="_blank" rel="noreferrer" style={{
                      color: styles.text, textDecoration: 'none', fontWeight: 600, fontSize: 14,
                      display: 'flex', alignItems: 'center', gap: 6, flex: 1,
                    }}>
                      <ExternalLink size={14} color={styles.accent} /> {l.title}
                    </a>
                    <button onClick={() => remove(l.id)} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: styles.text2, padding: 2,
                    }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ fontSize: 11, color: styles.text2, marginTop: 4, wordBreak: 'break-all' }}>{l.url}</div>
                  {l.notes && <div style={{ fontSize: 12, color: styles.text2, marginTop: 6 }}>{l.notes}</div>}
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ============================================================
   SUB SETTINGS — W9, insurance, and other documents
   ============================================================ */
/* Company profile — what GrayCo has on file for this subcontractor; they keep it current. */
function CompanyProfileCard({ t, user, onSave, showToast }) {
  const fields = ['name', 'phone', 'contactTitle', 'company', 'dbaName', 'businessAddress', 'businessCity',
    'businessState', 'businessZip', 'website', 'serviceArea', 'licenseNumbers', 'yearsInBusiness', 'numEmployees'];
  const fromUser = () => {
    const f = {};
    fields.forEach(k => { f[k] = user[k] == null ? '' : String(user[k]); });
    f.trades = (user.trades || []).join(', ');
    return f;
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fromUser);
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  function save() {
    if (!form.name.trim() || !form.company.trim()) { showToast('Name and company are required.', 'error'); return; }
    onSave({
      ...form,
      businessState: form.businessState.toUpperCase().slice(0, 2),
      yearsInBusiness: form.yearsInBusiness ? parseInt(form.yearsInBusiness, 10) || null : null,
      numEmployees: form.numEmployees ? parseInt(form.numEmployees, 10) || null : null,
      trades: form.trades.split(',').map(x => x.trim()).filter(Boolean),
    });
    setOpen(false);
    showToast(t.contactSaved || 'Saved.');
  }
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}><Building2 size={18} /> {user.company}</h3>
          <div style={{ fontSize: 13, color: styles.text2, lineHeight: 1.6 }}>
            {user.name}{user.contactTitle ? ` · ${user.contactTitle}` : ''} · {user.email}{user.phone ? ` · ${user.phone}` : ''}
            {user.businessAddress && <><br />{user.businessAddress}{user.businessCity ? `, ${user.businessCity}` : ''}{user.businessState ? `, ${user.businessState}` : ''} {user.businessZip || ''}</>}
            {user.trades?.length > 0 && <><br />Trades: {user.trades.join(', ')}</>}
          </div>
        </div>
        {!open && <Btn size="sm" variant="ghost" icon={Edit3} onClick={() => { setForm(fromUser()); setOpen(true); }}>Edit profile</Btn>}
      </div>
      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label={t.fullName + ' *'}><input style={inputStyle} value={form.name} onChange={set('name')} /></Field>
            <Field label={t.phone}><input style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} /></Field>
            <Field label={t.contactTitle}><input style={inputStyle} value={form.contactTitle} onChange={set('contactTitle')} /></Field>
            <Field label={t.legalCompanyName + ' *'}><input style={inputStyle} value={form.company} onChange={set('company')} /></Field>
            <Field label={t.dbaName}><input style={inputStyle} value={form.dbaName} onChange={set('dbaName')} /></Field>
            <Field label={t.website}><input style={inputStyle} value={form.website} onChange={set('website')} /></Field>
            <Field label={t.businessAddress}><input style={inputStyle} value={form.businessAddress} onChange={set('businessAddress')} /></Field>
            <Field label={t.businessCity}><input style={inputStyle} value={form.businessCity} onChange={set('businessCity')} /></Field>
            <Field label={t.businessState}><input style={inputStyle} maxLength={2} value={form.businessState} onChange={set('businessState')} /></Field>
            <Field label={t.businessZip}><input style={inputStyle} maxLength={10} value={form.businessZip} onChange={set('businessZip')} /></Field>
            <Field label={t.tradesPerformed}><input style={inputStyle} value={form.trades} onChange={set('trades')} /></Field>
            <Field label={t.serviceArea}><input style={inputStyle} value={form.serviceArea} onChange={set('serviceArea')} /></Field>
            <Field label={t.licenseNumbers}><input style={inputStyle} value={form.licenseNumbers} onChange={set('licenseNumbers')} /></Field>
            <Field label={t.yearsInBusiness}><input style={inputStyle} type="number" min="0" value={form.yearsInBusiness} onChange={set('yearsInBusiness')} /></Field>
            <Field label={t.numEmployees}><input style={inputStyle} type="number" min="0" value={form.numEmployees} onChange={set('numEmployees')} /></Field>
          </div>
          <div style={{ fontSize: 12, color: styles.text2, marginBottom: 10 }}>To change the e-mail you sign in with, call GrayCo at 901-585-0944.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn size="sm" icon={Check} onClick={save}>{t.save}</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function SubSettings({ t, user, subDocs, setSubDocs, bids, jobs, showToast, onSaveProfile }) {
  const docs = subDocs[user.id] || [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    type: 'w9', label: '', expirationDate: '', file: null,
  });
  const fileRef = useRef();

  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_FILE) {
      showToast(t.fileTooLarge + ' (50 MB at most)', 'error'); return;
    }
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej;
      r.readAsDataURL(f);
    });
    setForm({ ...form, file: { name: f.name, size: f.size, type: f.type, dataUrl } });
  }

  async function saveDoc() {
    if (!form.file) { showToast('Choose a file', 'error'); return; }
    const typeMeta = DOC_TYPES.find(d => d.id === form.type);
    if (typeMeta?.expires && !form.expirationDate) {
      showToast('This document type requires an expiration date.', 'error'); return;
    }
    const newDoc = {
      id: newId('d'),
      type: form.type,
      label: form.label || docTypeLabel(form.type, t),
      fileName: form.file.name,
      fileSize: form.file.size,
      fileType: form.file.type,
      dataUrl: form.file.dataUrl,
      expirationDate: form.expirationDate || null,
      uploadedAt: new Date().toISOString(),
    };
    // Remove any existing doc of the same required type (replace it)
    const typeIsRequired = DOC_TYPES.find(d => d.id === form.type)?.required;
    const newDocs = typeIsRequired
      ? [...docs.filter(d => d.type !== form.type), newDoc]
      : [...docs, newDoc];
    await saveSubDocs(user.id, newDocs);
    setSubDocs({ ...subDocs, [user.id]: newDocs });
    setAdding(false);
    setForm({ type: 'w9', label: '', expirationDate: '', file: null });
    showToast('Document saved.');
  }

  async function removeDoc(id) {
    if (!confirm(t.confirmDelete)) return;
    const newDocs = docs.filter(d => d.id !== id);
    await saveSubDocs(user.id, newDocs);
    setSubDocs({ ...subDocs, [user.id]: newDocs });
    showToast('Document removed.');
  }

  function downloadDoc(doc) {
    openFile(doc.dataUrl, doc.fileName);
  }

  const check = hasCurrentRequired(user.id, subDocs);

  // Compute portal stats for this sub — bids, acceptance, wins
  const myBids = (bids || []).filter(b => b.userId === user.id);
  const acceptedBids = myBids.filter(b => b.accepted);
  const pendingBids = myBids.filter(b => !b.accepted && !b.rejected);
  // Jobs the sub won = jobs where their accepted bid is on a job with status 'won'
  const wonJobs = acceptedBids.filter(b => {
    const j = (jobs || []).find(x => x.id === b.jobId);
    return j && j.status === 'won';
  });
  const winRate = myBids.length ? Math.round((acceptedBids.length / myBids.length) * 100) : 0;
  const totalWonValue = wonJobs.reduce((s, b) => s + (b.amount || 0), 0);

  const statCardStyle = {
    background: '#fff', border: `1px solid ${styles.border}`, borderRadius: styles.radius,
    padding: '14px 16px', boxShadow: styles.shadowSm,
  };

  return (
    <div>
      <SectionHeader icon={Settings} title={t.mySettings} count={docs.length} />
      {user.role === 'sub' && onSaveProfile && <CompanyProfileCard t={t} user={user} onSave={onSaveProfile} showToast={showToast} />}

      {/* PORTAL STATS — sub's bid history at a glance */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <TrendingUp size={18} color={styles.accent} />
          <h3 style={{
            fontFamily: styles.fontBody, fontSize: 17, fontWeight: 700,
            letterSpacing: '-0.02em', color: styles.text, margin: 0,
          }}>{t.myStats}</h3>
          <span style={{ fontSize: 11, color: styles.text3 }}>· {t.portalActivity}</span>
        </div>

        {myBids.length === 0 ? (
          <div style={{
            padding: 20, textAlign: 'center', color: styles.text2, fontSize: 13,
            background: styles.surface, borderRadius: styles.radius,
          }}>{t.statsNoData}</div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
          }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: styles.text2, letterSpacing: '-0.005em' }}>{t.statsBidsSubmitted}</div>
              <div style={{ fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: styles.navy, marginTop: 4 }}>
                {myBids.length}
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: styles.text2, letterSpacing: '-0.005em' }}>{t.statsJobsWon}</div>
              <div style={{ fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: '#065F46', marginTop: 4 }}>
                {wonJobs.length}
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: styles.text2, letterSpacing: '-0.005em' }}>{t.statsBidsPending}</div>
              <div style={{ fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: styles.accent, marginTop: 4 }}>
                {pendingBids.length}
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: styles.text2, letterSpacing: '-0.005em' }}>{t.statsWinRate}</div>
              <div style={{ fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: styles.navy, marginTop: 4 }}>
                {winRate}%
              </div>
            </div>
            {totalWonValue > 0 && (
              <div style={{ ...statCardStyle, gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: styles.text2, letterSpacing: '-0.005em' }}>{t.statsTotalValue}</div>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 26, fontWeight: 700, color: '#065F46', marginTop: 4 }}>
                  ${totalWonValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Status banner */}
      {check.ok ? (
        <div style={{
          background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 6,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#065F46',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={16} /> <strong>{t.allCurrent}</strong>
        </div>
      ) : (
        <div style={{
          background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: styles.red,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={16} /> <strong>{t.docsMissing}</strong>
          <span>— {check.missing && `Missing: ${docTypeLabel(check.missing, t)}`}
          {check.expired && `Expired: ${docTypeLabel(check.expired, t)}`}</span>
        </div>
      )}

      {/* Required types guide */}
      <div style={{
        background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6,
        padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400E',
      }}>
        <strong>{t.docsRequired}</strong> {REQUIRED_DOC_TYPES.map(typeId => docTypeLabel(typeId, t)).join(', ')}
      </div>

      {!adding && (
        <Btn icon={Plus} onClick={() => setAdding(true)} style={{ marginBottom: 16 }}>
          {t.uploadDoc}
        </Btn>
      )}

      {adding && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
            <Upload size={18} /> {t.uploadDoc}
          </h3>
          <Field label={t.docType} required>
            <select style={inputStyle} value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}>
              {DOC_TYPES.map(d => (
                <option key={d.id} value={d.id}>
                  {docTypeLabel(d.id, t)}{d.required ? ' ★' : ''}
                </option>
              ))}
            </select>
          </Field>
          {form.type === 'other' && (
            <Field label={t.docLabel}>
              <input style={inputStyle} value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Business tax license" />
            </Field>
          )}
          {DOC_TYPES.find(d => d.id === form.type)?.expires && (
            <Field label={t.expirationDate} required>
              <input style={inputStyle} type="date" value={form.expirationDate}
                onChange={e => setForm({ ...form, expirationDate: e.target.value })} />
            </Field>
          )}
          <Field label="File (PDF or image)">
            <input ref={fileRef} type="file"
              accept="application/pdf,image/*"
              onChange={handleFile}
              style={{ fontSize: 13 }} />
            {form.file && (
              <div style={{ fontSize: 12, color: styles.text2, marginTop: 6 }}>
                ✓ {form.file.name} ({(form.file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon={Check} onClick={saveDoc}>{t.save}</Btn>
            <Btn variant="ghost" onClick={() => { setAdding(false); setForm({ type: 'w9', label: '', expirationDate: '', file: null }); }}>
              {t.cancel}
            </Btn>
          </div>
        </Card>
      )}

      {docs.length === 0 ? (
        <EmptyState icon={FileText} message={t.noDocsYet} />
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {docs.map(doc => {
            const st = docStatus(doc);
            let badgeColor = styles.text2, badgeLabel = t.docNoExp;
            if (st.kind === 'expired') { badgeColor = styles.red; badgeLabel = t.docExpired; }
            else if (st.kind === 'expiring') { badgeColor = '#CA8A04'; badgeLabel = `${t.docExpiringSoon} (${st.days}d)`; }
            else if (st.kind === 'current') { badgeColor = styles.green; badgeLabel = t.docCurrent; }
            return (
              <Card key={doc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <Badge color={DOC_TYPES.find(d => d.id === doc.type)?.color || styles.navy}>
                    {docTypeLabel(doc.type, t)}
                  </Badge>
                  <Badge color={badgeColor}>{badgeLabel}</Badge>
                </div>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  {doc.label}
                </div>
                <div style={{ fontSize: 12, color: styles.text2, marginBottom: 10 }}>
                  {doc.fileName} • {(doc.fileSize / 1024).toFixed(0)} KB
                  {doc.expirationDate && <> • Expires {new Date(doc.expirationDate).toLocaleDateString()}</>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" icon={Download} onClick={() => downloadDoc(doc)}>View</Btn>
                  <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => removeDoc(doc.id)}>{t.delete}</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TEAM PAGE — admins edit phone numbers and titles for PMs
   ============================================================ */
function TeamPage({ t, users, setUsers, showToast }) {
  const admins = users.filter(u => u.role === 'admin');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ phone: '', title: '' });

  function startEdit(u) {
    setEditing(u.id);
    setForm({ phone: u.phone || '', title: u.title || '' });
  }
  function save() {
    setUsers(users.map(u => u.id === editing ? { ...u, ...form } : u));
    setEditing(null);
    showToast(t.contactSaved);
  }

  return (
    <div>
      <SectionHeader icon={Shield} title={t.teamMembers} count={admins.length} />
      <div style={{
        background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6,
        padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E',
      }}>
        These contact details show on every job so subcontractors can call the right PM.
        Update phone numbers and titles here. To add or remove a GrayCo person, use the CRM: 💎 → Team access.
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {admins.map(u => (
          <Card key={u.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, background: styles.accent, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: styles.fontDisplay, fontSize: 20, fontWeight: 700, color: styles.navy,
              }}>
                {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: styles.text2 }}>{u.title || 'Admin'}</div>
              </div>
            </div>

            {editing === u.id ? (
              <>
                <Field label={t.title_field}>
                  <input style={inputStyle} value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Project Manager" />
                </Field>
                <Field label={t.phone}>
                  <input style={inputStyle} value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="901-555-0100" />
                </Field>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="sm" icon={Check} onClick={save}>{t.save}</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>{t.cancel}</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: styles.text2 }}>
                    <Phone size={13} /> {u.phone || <em style={{ color: styles.red }}>No phone set</em>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: styles.text2 }}>
                    <Mail size={13} /> {u.email}
                  </div>
                </div>
                <Btn size="sm" variant="ghost" icon={Edit3} onClick={() => startEdit(u)}>
                  {t.updateContact}
                </Btn>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   INVITE PANEL — admin invites subs by email; generates a shareable link
   ============================================================ */
function InvitePanel({ t, job, invites, addInvite, setInvites, showToast }) {
  const [email, setEmail] = useState('');
  const jobInvites = invites.filter(i => i.jobId === job.id);

  function addOne() {
    if (!email.trim()) return;
    const inv = addInvite(email);
    if (inv) {
      setEmail('');
      showToast(t.inviteSent);
    } else {
      showToast('Invalid email', 'error');
    }
  }

  function copyLink(inv) {
    const url = inviteUrl(inv.jobId, inv.token);
    try {
      navigator.clipboard.writeText(url);
      showToast('Invite link copied — paste into your email/text to the sub.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('Invite link copied.');
    }
  }

  function removeInvite(id) {
    if (!confirm('Remove this invite? The link will stop working.')) return;
    setInvites(prev => prev.filter(i => i.id !== id));
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
        <Mail size={18} /> {t.inviteSubs}
      </h3>
      <div style={{ fontSize: 12, color: styles.text2, marginBottom: 10, lineHeight: 1.5 }}>
        Enter a sub's email. They'll get a private link that opens the signup page pre-linked to this job.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input style={{ ...inputStyle, flex: 1 }} type="email"
          placeholder="subcontractor@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addOne()} />
        <Btn size="md" icon={Plus} onClick={addOne}>Add</Btn>
      </div>

      {jobInvites.length === 0 ? (
        <div style={{ fontSize: 12, color: styles.text2, fontStyle: 'italic' }}>
          No invites yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {jobInvites.map(inv => (
            <div key={inv.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: '8px 10px', background: styles.cream, borderRadius: 4,
              fontSize: 12, border: `1px solid ${styles.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong>{inv.email}</strong>
              </div>
              <button onClick={() => copyLink(inv)} title="Copy invite link" style={{
                background: styles.navy, color: '#fff', border: 'none', cursor: 'pointer',
                padding: '5px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              }}>Copy Link</button>
              <button onClick={() => removeInvite(inv.id)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: styles.red, padding: 2,
              }}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   ACTIVITY PANEL — shows who's viewed / downloaded this job's plans
   ============================================================ */
/* ============================================================
   MESSAGES PANEL — per-job conversation thread
   Admin sees ALL threads on the job (grouped by sub). Sub sees only their own.
   
   Data model per message:
   {
     id, jobId, senderId, senderName, senderCompany, senderRole,
     recipientSubId,   // for admin→sub messages: which sub thread this belongs to
     body, at, readBy: [userId, ...]
   }
   
   When sub sends: recipientSubId = null (their user id is the thread key)
   When admin sends: recipientSubId = target sub's user id
   Thread key: message.senderRole === 'sub' ? message.senderId : message.recipientSubId
   
   Future CRM integration: messages carry `graycoRecipients` (PM + Estimator + office
   ids) so the CRM can route them to the right person's alert queue.
   ============================================================ */
function MessagesPanel({ t, job, user, users, messages, setMessages, isAdmin, showToast }) {
  const jobMessages = messages.filter(m => m.jobId === job.id);

  // Mark messages read by this user on mount and on new message
  React.useEffect(() => {
    const toMark = jobMessages.filter(m => !(m.readBy || []).includes(user.id));
    if (toMark.length === 0) return;
    const ids = new Set(toMark.map(m => m.id));
    setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, readBy: [...(m.readBy || []), user.id] } : m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobMessages.length]);

  const [draft, setDraft] = React.useState('');
  const [activeSubThread, setActiveSubThread] = React.useState(null);  // admin: which sub thread to view

  // Group messages by sub thread key
  function threadKeyOf(m) {
    return m.senderRole === 'sub' ? m.senderId : m.recipientSubId;
  }

  const threads = {};
  jobMessages.forEach(m => {
    const key = threadKeyOf(m);
    if (!key) return;
    if (!threads[key]) threads[key] = [];
    threads[key].push(m);
  });
  Object.values(threads).forEach(arr => arr.sort((a, b) => new Date(a.at) - new Date(b.at)));

  const subThreadKeys = Object.keys(threads).sort((a, b) => {
    const lastA = threads[a][threads[a].length - 1].at;
    const lastB = threads[b][threads[b].length - 1].at;
    return new Date(lastB) - new Date(lastA);
  });

  // Sub's own thread
  const myThread = threads[user.id] || [];

  // Determine assigned GrayCo team for this job (for CRM routing metadata)
  const pm = users.find(u => u.id === job.pmId);
  const est = users.find(u => u.id === job.estimatorId);
  const office = users.find(u => (u.email || '').toLowerCase() === 'office@grayco-cs.com');
  const graycoRecipients = [pm, est, office].filter(Boolean).map(u => ({ id: u.id, name: u.name, role: u.title || 'Admin' }));

  function send() {
    if (!draft.trim()) return;
    const targetSubId = isAdmin ? activeSubThread : null;
    if (isAdmin && !targetSubId) {
      showToast('Pick a sub thread first.', 'error');
      return;
    }
    const newMsg = {
      id: newId('msg'),
      jobId: job.id,
      senderId: user.id,
      senderName: user.name,
      senderCompany: user.company,
      senderRole: user.role,
      recipientSubId: targetSubId,
      body: draft.trim(),
      at: new Date().toISOString(),
      readBy: [user.id],
      // CRM routing metadata: which GrayCo team members should be alerted
      graycoRecipients: user.role === 'sub' ? graycoRecipients : null,
    };
    setMessages([...messages, newMsg]);
    setDraft('');
  }

  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function MessageBubble({ m, showSender = true }) {
    const isMine = m.senderId === user.id;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        marginBottom: 8,
      }}>
        {showSender && (
          <div style={{
            fontSize: 10, color: styles.text3, fontWeight: 600,
            marginBottom: 3, letterSpacing: '-0.005em',
          }}>
            {isMine ? 'You' : (m.senderRole === 'sub' ? m.senderCompany : `${m.senderName} · ${t.graycoTeam}`)}
            {' · '}{timeAgo(m.at)}
          </div>
        )}
        <div style={{
          maxWidth: '80%', padding: '9px 13px', borderRadius: 12,
          background: isMine ? styles.accent : styles.surface,
          color: isMine ? styles.navy : styles.text,
          fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          border: isMine ? 'none' : `1px solid ${styles.border}`,
        }}>{m.body}</div>
      </div>
    );
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
        <MessageSquare size={18} /> {t.messages}
        {jobMessages.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: styles.text2,
            background: styles.surface, padding: '3px 10px', borderRadius: styles.radiusFull,
          }}>{jobMessages.length}</span>
        )}
      </h3>
      <div style={{ fontSize: 11, color: styles.text3, marginBottom: 12, lineHeight: 1.5 }}>
        {t.messagesHint}
      </div>

      {isAdmin ? (
        // ADMIN VIEW: list of sub threads on the left, active thread on the right
        <div>
          {subThreadKeys.length === 0 ? (
            <div style={{ fontSize: 12, color: styles.text2, fontStyle: 'italic', padding: 8 }}>
              {t.noMessages}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, minHeight: 200 }}>
              {/* Thread list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRight: `1px solid ${styles.border}`, paddingRight: 8 }}>
                {subThreadKeys.map(key => {
                  const thread = threads[key];
                  const lastMsg = thread[thread.length - 1];
                  const subUser = users.find(u => u.id === key);
                  const unread = thread.filter(m => !(m.readBy || []).includes(user.id) && m.senderId !== user.id).length;
                  return (
                    <button key={key} onClick={() => setActiveSubThread(key)}
                      style={{
                        textAlign: 'left', padding: '8px 10px', cursor: 'pointer',
                        border: `2px solid ${activeSubThread === key ? styles.accent : 'transparent'}`,
                        background: activeSubThread === key ? '#FFFBEB' : '#fff',
                        borderRadius: 6, fontFamily: styles.fontBody,
                      }}>
                      <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>
                        {subUser ? (subUser.company || subUser.name) : 'Unknown'}
                        {unread > 0 && (
                          <span style={{
                            marginLeft: 6, background: styles.red, color: '#fff',
                            fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                          }}>{unread}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: styles.text3, marginTop: 2 }}>
                        {thread.length} msg · {timeAgo(lastMsg.at)}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Active thread */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {activeSubThread ? (
                  <>
                    <div style={{ maxHeight: 300, overflow: 'auto', paddingRight: 4, marginBottom: 10 }}>
                      {threads[activeSubThread].map(m => <MessageBubble key={m.id} m={m} />)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <textarea style={{
                        ...inputStyle, minHeight: 44, resize: 'vertical', flex: 1,
                        fontFamily: 'inherit', fontSize: 13,
                      }}
                        placeholder={t.typeMessage} value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
                      <Btn icon={Send} onClick={send} disabled={!draft.trim()}>{t.sendMessage}</Btn>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: styles.text2, fontStyle: 'italic', padding: 20, textAlign: 'center' }}>
                    Select a sub on the left to view their conversation.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // SUB VIEW: just their own thread with the GrayCo team
        <div>
          <div style={{ maxHeight: 300, overflow: 'auto', paddingRight: 4, marginBottom: 10 }}>
            {myThread.length === 0 ? (
              <div style={{ fontSize: 12, color: styles.text2, fontStyle: 'italic', padding: 12, textAlign: 'center' }}>
                {t.noMessages}
              </div>
            ) : (
              myThread.map(m => <MessageBubble key={m.id} m={m} />)
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <textarea style={{
              ...inputStyle, minHeight: 44, resize: 'vertical', flex: 1,
              fontFamily: 'inherit', fontSize: 13,
            }}
              placeholder={t.typeMessage} value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
            <Btn icon={Send} onClick={send} disabled={!draft.trim()}>{t.sendMessage}</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivityPanel({ t, job, activity, bids }) {
  const jobActivity = activity.filter(a => a.jobId === job.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  // Group by sub (userId) for a per-sub summary
  const bySub = {};
  jobActivity.forEach(a => {
    if (!bySub[a.userId]) {
      bySub[a.userId] = {
        userId: a.userId,
        userName: a.userName,
        userCompany: a.userCompany,
        views: 0, downloads: 0,
        downloadedPlans: new Set(),
        firstAt: a.at, lastAt: a.at,
      };
    }
    const b = bySub[a.userId];
    if (a.kind === 'view') b.views++;
    if (a.kind === 'download') { b.downloads++; if (a.planName) b.downloadedPlans.add(a.planName); }
    if (new Date(a.at) > new Date(b.lastAt)) b.lastAt = a.at;
    if (new Date(a.at) < new Date(b.firstAt)) b.firstAt = a.at;
  });

  const jobBidsByUser = {};
  (bids || []).filter(b => b.jobId === job.id).forEach(b => { jobBidsByUser[b.userId] = b; });

  // Sort subs by most recent activity
  const subSummaries = Object.values(bySub).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>
        <Eye size={18} /> {t.activity}
        {subSummaries.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: styles.text2,
            background: styles.surface, padding: '3px 10px', borderRadius: styles.radiusFull,
          }}>{subSummaries.length} {subSummaries.length === 1 ? 'sub' : 'subs'} engaged</span>
        )}
      </h3>

      {jobActivity.length === 0 ? (
        <div style={{ fontSize: 12, color: styles.text2, fontStyle: 'italic' }}>
          {t.noActivity}
        </div>
      ) : (
        <>
          {/* PER-SUB SUMMARY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {subSummaries.map(s => {
              const bid = jobBidsByUser[s.userId];
              return (
                <div key={s.userId} style={{
                  padding: 12, borderRadius: styles.radius, background: '#fff',
                  border: `1px solid ${bid ? '#86EFAC' : styles.border}`,
                  boxShadow: styles.shadowSm,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 10, marginBottom: 6, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: styles.text, letterSpacing: '-0.01em' }}>
                        {s.userCompany || s.userName}
                      </div>
                      <div style={{ fontSize: 11, color: styles.text2, marginTop: 2 }}>
                        {s.userName}
                      </div>
                    </div>
                    {bid ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#065F46',
                        background: '#DCFCE7', padding: '3px 10px',
                        borderRadius: styles.radiusFull,
                      }}>✓ Bid ${bid.amount.toLocaleString()}</span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: styles.text2,
                        background: styles.surface, padding: '3px 10px',
                        borderRadius: styles.radiusFull,
                      }}>No bid yet</span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', gap: 12, fontSize: 12, color: styles.text2,
                    flexWrap: 'wrap', alignItems: 'center',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Eye size={12} />
                      <strong style={{ color: styles.text }}>{s.views}</strong>
                      {s.views === 1 ? ' view' : ' views'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Download size={12} color={styles.accent} />
                      <strong style={{ color: styles.text }}>{s.downloads}</strong>
                      {s.downloads === 1 ? ' download' : ' downloads'}
                      {s.downloadedPlans.size > 0 && (
                        <span style={{ color: styles.text3 }}> ({s.downloadedPlans.size} unique)</span>
                      )}
                    </span>
                    <span style={{ marginLeft: 'auto', color: styles.text3, fontSize: 11 }}>
                      last: {timeAgo(s.lastAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* RAW EVENT LOG — collapsed by default via details/summary */}
          <details style={{ fontSize: 12 }}>
            <summary style={{
              cursor: 'pointer', color: styles.text2, fontWeight: 600,
              padding: '6px 0', letterSpacing: '-0.005em',
            }}>
              View raw event log ({jobActivity.length} events)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
              {jobActivity.slice(0, 100).map(a => (
                <div key={a.id} style={{
                  fontSize: 11, padding: '5px 9px', borderRadius: 4,
                  background: styles.cream, border: `1px solid ${styles.border}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {a.kind === 'view' ? <Eye size={11} color={styles.text2} /> : <Download size={11} color={styles.accent} />}
                  <div style={{ flex: 1, lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{a.userCompany || a.userName}</span>
                    <span style={{ color: styles.text2 }}>
                      {' '}{a.kind === 'view' ? t.viewedAt : `${t.downloadedAt} ${a.planName || ''}`}
                    </span>
                  </div>
                  <span style={{ color: styles.text3, fontSize: 10 }}>{new Date(a.at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

/* ============================================================
   PLAN ARCHIVE — permanent record of plans from WON jobs
   ============================================================ */
function PlanArchive({ t, jobs, onOpen }) {
  const wonJobs = jobs.filter(j => j.status === 'won');
  if (wonJobs.length === 0) {
    return <EmptyState icon={Building2}
      message="No won jobs yet. Mark a job as WON to archive its plans here." />;
  }
  return (
    <div>
      <SectionHeader icon={Building2} title={t.planArchive} count={wonJobs.length} />
      <div style={{
        background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6,
        padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E',
      }}>
        <strong>{t.archivedPlans}</strong> — these plans are kept permanently for reference.
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {wonJobs.map(job => (
          <Card key={job.id} hover onClick={() => onOpen(job)}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <Badge color={styles.green}>★ {t.wonJob}</Badge>
              <Badge color={styles.accent}>{t.permanent}</Badge>
            </div>
            <h3 style={{
              fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600,
              margin: '4px 0 6px', textTransform: 'uppercase',
            }}>{job.title}</h3>
            {job.address && <div style={{ fontSize: 12, color: styles.text2, marginBottom: 8 }}>
              <MapPin size={12} style={{ verticalAlign: 'middle' }} /> {job.address}
            </div>}
            <div style={{ fontSize: 12, color: styles.text2 }}>
              {job.plans?.length || 0} plan file{(job.plans?.length || 0) !== 1 ? 's' : ''}
              {job.wonAt && <> • Won {new Date(job.wonAt).toLocaleDateString()}</>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ESTIMATING TAB — list of all estimates, with builder per-job
   ============================================================ */
function EstimatingTab({ t, estimates, setEstimates, jobs, bids, users, onOpen, showToast }) {
  const [openEstId, setOpenEstId] = useState(null);
  const openEst = estimates.find(e => e.id === openEstId);

  if (openEst) {
    const job = jobs.find(j => j.id === openEst.jobId);
    return (
      <EstimateBuilder
        t={t} estimate={openEst} job={job} bids={bids} users={users}
        estimates={estimates} setEstimates={setEstimates}
        onBack={() => setOpenEstId(null)}
        onJumpToJob={() => job && onOpen(job)}
        showToast={showToast}
      />
    );
  }

  if (estimates.length === 0) {
    return <EmptyState icon={TrendingUp} message={t.noEstimates} />;
  }

  return (
    <div>
      <SectionHeader icon={TrendingUp} title={t.estimating} count={estimates.length} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
        {estimates.map(est => {
          const job = jobs.find(j => j.id === est.jobId);
          const totals = computeEstimateTotals(est);
          return (
            <Card key={est.id} hover onClick={() => setOpenEstId(est.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                <Badge color={est.status === 'final' ? styles.green : (est.status === 'sent' ? styles.blue : styles.text2)}>
                  {est.status === 'final' ? t.statusFinal : est.status === 'sent' ? t.statusSent : t.statusDraft}
                </Badge>
                <div style={{ fontSize: 11, color: styles.text2, fontWeight: 600 }}>
                  {est.number}
                </div>
              </div>
              <h3 style={{
                fontFamily: styles.fontDisplay, fontSize: 18, fontWeight: 600,
                margin: '4px 0 6px', textTransform: 'uppercase',
              }}>
                {job ? job.title : 'Job removed'}
              </h3>
              {job?.address && (
                <div style={{ fontSize: 12, color: styles.text2, marginBottom: 10 }}>{job.address}</div>
              )}
              <div style={{
                background: styles.cream, padding: '10px 12px', borderRadius: 4,
                marginTop: 10, marginBottom: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: styles.text2 }}>
                  <span>{est.lineItems.length} line item{est.lineItems.length !== 1 ? 's' : ''}</span>
                  <span>Direct: ${totals.direct.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})} • {totals.marginPct.toFixed(0)}% margin</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginTop: 8, paddingTop: 8, borderTop: `1px solid ${styles.border}`,
                }}>
                  <span style={{ fontSize: 11, color: styles.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t.grandTotal}
                  </span>
                  <span style={{ fontFamily: styles.fontDisplay, fontSize: 22, fontWeight: 700, color: styles.accent }}>
                    ${totals.grand.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   ESTIMATE COMPUTATION — flat margin model
   Grand Total = Direct Cost / (1 - margin%)
   So a $100k direct cost at 20% margin = $125,000 (margin = $25k = 20% of $125k).
   Also compute markup% for reference: (grand - direct) / direct.
   Backward-compat: if the estimate still has old overheadPct/profitPct fields,
   fold them into a single computed margin so old data still displays right.
   ============================================================ */
function computeEstimateTotals(est) {
  const direct = (est.lineItems || []).reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);
  let marginPct = Number(est.marginPct);
  if (isNaN(marginPct)) {
    // Legacy migration: derive an effective margin from old fields
    const oh = Number(est.overheadPct) || 0;
    const p = Number(est.profitPct) || 0;
    const c = Number(est.contingencyPct) || 0;
    const b = Number(est.bondPct) || 0;
    const t = Number(est.taxPct) || 0;
    const step1 = direct * (1 + oh / 100);
    const step2 = step1 * (1 + p / 100);
    const step3 = step2 * (1 + c / 100);
    const step4 = step3 * (1 + b / 100);
    const step5 = step4 * (1 + t / 100);
    marginPct = step5 > 0 ? ((step5 - direct) / step5) * 100 : 0;
  }
  const grand = marginPct >= 100 ? direct * 999 : direct / (1 - marginPct / 100);
  const marginDollars = grand - direct;
  const markup = direct > 0 ? (marginDollars / direct) * 100 : 0;
  return { direct, grand, marginPct, marginDollars, markup };
}

/* Standard margin quick-picks — GrayCo defaults */
const MARGIN_PRESETS = [10, 15, 18, 20, 25, 30, 33];

/* ============================================================
   ESTIMATE BUILDER — line items + markups + copy/export
   ============================================================ */
function EstimateBuilder({ t, estimate, job, bids, users, estimates, setEstimates, onBack, onJumpToJob, showToast }) {
  const totals = computeEstimateTotals(estimate);
  const acceptedBids = bids.filter(b => b.jobId === estimate.jobId && b.accepted);

  function patch(updates) {
    setEstimates(estimates.map(e => e.id === estimate.id ? { ...e, ...updates } : e));
  }

  function updateItem(itemId, updates) {
    patch({
      lineItems: estimate.lineItems.map(li => li.id === itemId ? { ...li, ...updates } : li),
    });
  }

  function deleteItem(itemId) {
    patch({ lineItems: estimate.lineItems.filter(li => li.id !== itemId) });
  }

  function addManualItem() {
    patch({
      lineItems: [...estimate.lineItems, {
        id: newId('li'),
        category: '', description: '',
        qty: 1, unit: 'LS', unitPrice: 0,
        notes: '', source: 'manual',
      }],
    });
  }

  function deleteEstimate() {
    if (!confirm('Delete this estimate? This will not un-accept any bids.')) return;
    setEstimates(estimates.filter(e => e.id !== estimate.id));
    onBack();
    showToast('Estimate deleted.');
  }

  // Build copy/export strings
  function buildSummaryText() {
    const lines = [];
    lines.push(`GRAYCO CONSTRUCTION SERVICES, LLC`);
    lines.push(`ESTIMATE ${estimate.number}`);
    if (job) {
      lines.push('');
      lines.push(`Project: ${job.title}`);
      if (job.address) lines.push(`Address: ${job.address}`);
      const pm = users.find(u => u.id === job.pmId);
      const est = users.find(u => u.id === job.estimatorId);
      if (pm) lines.push(`Project Manager: ${pm.name}${pm.phone ? ' • ' + pm.phone : ''}`);
      if (est && est.id !== pm?.id) lines.push(`Estimator: ${est.name}${est.phone ? ' • ' + est.phone : ''}`);
    }
    lines.push('');
    lines.push('LINE ITEMS:');
    estimate.lineItems.forEach((li, i) => {
      const ext = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
      lines.push(`  ${i + 1}. ${li.category}${li.description ? ' — ' + li.description : ''}`);
      lines.push(`     ${li.qty} ${li.unit} @ $${(Number(li.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} = $${ext.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`);
    });
    lines.push('');
    lines.push(`Direct Cost:  $${totals.direct.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`);
    lines.push(`Margin ${totals.marginPct.toFixed(1)}%: $${totals.marginDollars.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`);
    lines.push('');
    lines.push(`GRAND TOTAL:  $${totals.grand.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`);
    lines.push(`(Equivalent markup: ${totals.markup.toFixed(1)}%)`);
    if (estimate.notes) {
      lines.push('');
      lines.push('Notes:');
      lines.push(estimate.notes);
    }
    return lines.join('\n');
  }

  function buildTSV() {
    // Tab-separated lines that paste cleanly into Google Sheets / Excel
    const rows = [];
    rows.push(['Estimate', estimate.number].join('\t'));
    if (job) {
      rows.push(['Project', job.title].join('\t'));
      if (job.address) rows.push(['Address', job.address].join('\t'));
    }
    rows.push('');
    rows.push(['#', 'Category', 'Description', 'Qty', 'Unit', 'Unit Price', 'Extended'].join('\t'));
    estimate.lineItems.forEach((li, i) => {
      const ext = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
      rows.push([
        i + 1,
        li.category || '',
        li.description || '',
        li.qty || 0,
        li.unit || '',
        (Number(li.unitPrice) || 0).toFixed(2),
        ext.toFixed(2),
      ].join('\t'));
    });
    rows.push('');
    rows.push(['', '', '', '', '', 'Direct Cost', totals.direct.toFixed(2)].join('\t'));
    rows.push(['', '', '', '', '', `Margin ${totals.marginPct.toFixed(1)}%`, totals.marginDollars.toFixed(2)].join('\t'));
    rows.push(['', '', '', '', '', 'GRAND TOTAL', totals.grand.toFixed(2)].join('\t'));
    return rows.join('\n');
  }

  function buildCSV() {
    // CSV with proper quoting
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [];
    rows.push(['#', 'Category', 'Description', 'Qty', 'Unit', 'Unit Price', 'Extended'].map(esc).join(','));
    estimate.lineItems.forEach((li, i) => {
      const ext = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
      rows.push([
        i + 1, li.category || '', li.description || '',
        li.qty || 0, li.unit || '',
        (Number(li.unitPrice) || 0).toFixed(2), ext.toFixed(2),
      ].map(esc).join(','));
    });
    rows.push(['', '', '', '', '', 'Direct Cost', totals.direct.toFixed(2)].map(esc).join(','));
    rows.push(['', '', '', '', '', `Margin ${totals.marginPct.toFixed(1)}%`, totals.marginDollars.toFixed(2)].map(esc).join(','));
    rows.push(['', '', '', '', '', 'GRAND TOTAL', totals.grand.toFixed(2)].map(esc).join(','));
    return rows.join('\n');
  }

  // CRM-ready JSON payload. Structured so the CRM's estimator can consume it
  // directly when we build the import endpoint on the CRM side.
  function buildCRMPayload() {
    const pm = job && users.find(u => u.id === job.pmId);
    const est = job && users.find(u => u.id === job.estimatorId);
    const acceptedBidsList = bids.filter(b => b.jobId === estimate.jobId && b.accepted).map(b => ({
      bidId: b.id, company: b.userCompany, contact: b.userName,
      email: b.userEmail || null,
      amount: b.amount, scope: b.scope || '', notes: b.notes || '',
      submittedAt: b.submittedAt,
    }));
    return {
      source: 'grayco-bid-portal',
      exportedAt: new Date().toISOString(),
      estimate: {
        id: estimate.id,
        number: estimate.number,
        status: estimate.status,
        marginPct: totals.marginPct,
        directCost: Number(totals.direct.toFixed(2)),
        marginDollars: Number(totals.marginDollars.toFixed(2)),
        grandTotal: Number(totals.grand.toFixed(2)),
        markupPct: Number(totals.markup.toFixed(2)),
        notes: estimate.notes || '',
        createdBy: estimate.createdByName,
        createdAt: estimate.createdAt,
      },
      job: job ? {
        id: job.id, title: job.title, address: job.address || '',
        poNumber: job.poNumber || null,              // CRM merges on this identifier
        poAutoGenerated: !!job.poAutoGenerated,       // true if portal generated it; CRM should adopt this PO
        projectId: job.projectId || null,             // secondary reference; may be blank
        bidDueDate: job.bidDueDate,
        grayCoRole: job.grayCoRole || 'gc',           // 'gc' or 'sub' — GrayCo's role on this project
        tradesSought: job.tradesSought || '',         // what trades we're soliciting bids for
        projectManager: pm ? { id: pm.id, name: pm.name, email: pm.email, phone: pm.phone } : null,
        estimator: est ? { id: est.id, name: est.name, email: est.email, phone: est.phone } : null,
        scope: job.scope || '',
        specifications: job.specifications || '',
        tradeScopes: job.tradeScopes || [],
        notes: job.notes || '',
      } : null,
      lineItems: estimate.lineItems.map((li, i) => ({
        seq: i + 1,
        bidId: li.bidId || null,   // links back to a portal bid if from an accepted bid
        source: li.source,         // 'bid' or 'manual'
        category: li.category || '',
        description: li.description || '',
        qty: Number(li.qty) || 0,
        unit: li.unit || '',
        unitPrice: Number(li.unitPrice) || 0,
        extended: (Number(li.qty) || 0) * (Number(li.unitPrice) || 0),
      })),
      acceptedBids: acceptedBidsList,
    };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t.copiedToClipboard);
    } catch (e) {
      // Fallback for older browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(t.copiedToClipboard);
      } catch (e2) {
        console.error(e2);
        showToast('Copy failed. Try selecting the text manually.', 'error');
      }
    }
  }

  function downloadCSV() {
    const csv = buildCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${estimate.number}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function downloadJSON() {
    const payload = buildCRMPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${estimate.number}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function copyJSONForCRM() {
    // Copies the CRM-ready JSON payload to clipboard so we can paste it into the CRM
    // once the estimator's import endpoint is built. Same payload shape now = no rework later.
    const payload = buildCRMPayload();
    const json = JSON.stringify(payload, null, 2);
    await copyText(json);
  }

  return (
    <div className="fade-in">
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack} style={{ marginBottom: 16 }}>
        {t.back}
      </Btn>

      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <Badge color={estimate.status === 'final' ? styles.green : (estimate.status === 'sent' ? styles.blue : styles.text2)}>
            {estimate.status === 'final' ? t.statusFinal : estimate.status === 'sent' ? t.statusSent : t.statusDraft}
          </Badge>
          <span style={{ fontSize: 12, color: styles.text2, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {estimate.number}
          </span>
        </div>
        <h1 style={{
          fontFamily: styles.fontDisplay, fontSize: 32, fontWeight: 700,
          margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1,
        }}>
          {job ? job.title : 'Job removed'}
        </h1>
        {job?.address && (
          <div style={{ fontSize: 13, color: styles.text2, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} /> {job.address}
            {job && (
              <Btn variant="ghost" size="sm" onClick={onJumpToJob} style={{ marginLeft: 12 }}>
                Open Job →
              </Btn>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>

        {/* LEFT — line items table */}
        <div>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                <ClipboardList size={18} /> {t.lineItems}
              </h3>
              <div style={{ fontSize: 12, color: styles.text2 }}>
                {acceptedBids.length} accepted bid{acceptedBids.length !== 1 ? 's' : ''}
              </div>
            </div>

            {estimate.lineItems.length === 0 ? (
              <div style={{
                padding: 28, textAlign: 'center', color: styles.text2,
                background: styles.cream, borderRadius: 6, fontSize: 14,
              }}>
                {t.noBidsAcceptedYet}<br />
                <Btn size="sm" variant="ghost" onClick={addManualItem} style={{ marginTop: 12 }}>
                  {t.addManualItem}
                </Btn>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {estimate.lineItems.map((li, idx) => {
                  const ext = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
                  return (
                    <div key={li.id} style={{
                      border: `1px solid ${styles.border}`, borderRadius: 6, padding: 12,
                      background: li.source === 'bid' ? '#F0FDF4' : styles.card,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: styles.text2, fontWeight: 600 }}>
                          #{idx + 1} {li.source === 'bid' ? '• from accepted bid' : '• manual'}
                        </div>
                        <button onClick={() => deleteItem(li.id)} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer', color: styles.red, padding: 2,
                        }}><Trash2 size={14} /></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input style={{ ...inputStyle, padding: '6px 10px' }}
                          placeholder={t.tradeOrCategory}
                          value={li.category}
                          onChange={e => updateItem(li.id, { category: e.target.value })} />
                        <input style={{ ...inputStyle, padding: '6px 10px' }}
                          placeholder={t.descrip}
                          value={li.description}
                          onChange={e => updateItem(li.id, { description: e.target.value })} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr 1fr', gap: 8, alignItems: 'center' }}>
                        <input style={{ ...inputStyle, padding: '6px 10px' }} type="number" step="0.01"
                          placeholder={t.qty} value={li.qty}
                          onChange={e => updateItem(li.id, { qty: e.target.value })} />
                        <input style={{ ...inputStyle, padding: '6px 10px' }}
                          placeholder={t.unit} value={li.unit}
                          onChange={e => updateItem(li.id, { unit: e.target.value })} />
                        <input style={{ ...inputStyle, padding: '6px 10px' }} type="number" step="0.01"
                          placeholder={t.unitPrice} value={li.unitPrice}
                          onChange={e => updateItem(li.id, { unitPrice: e.target.value })} />
                        <div style={{
                          padding: '7px 10px', background: styles.cream, borderRadius: 4, textAlign: 'right',
                          fontFamily: styles.fontDisplay, fontWeight: 700, fontSize: 14,
                        }}>
                          ${ext.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Btn variant="ghost" size="sm" icon={Plus} onClick={addManualItem} style={{ marginTop: 14 }}>
              {t.addManualItem}
            </Btn>
          </Card>

          {/* NOTES */}
          <Card style={{ marginTop: 14 }}>
            <h3 style={{ ...sectionTitleStyle, margin: '0 0 10px' }}>
              <MessageSquare size={18} /> {t.estimateNotes}
            </h3>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={estimate.notes || ''}
              onChange={e => patch({ notes: e.target.value })} />
          </Card>

          {/* COPY/EXPORT BUTTONS */}
          <Card style={{ marginTop: 14 }}>
            <h3 style={{ ...sectionTitleStyle, margin: '0 0 12px' }}>
              <Download size={18} /> {t.copyEstimate}
            </h3>

            {/* Send-to-CRM section — coming feature but ready to feed CRM today */}
            <div style={{
              background: styles.navy, color: '#fff', padding: '14px 16px',
              borderRadius: 6, marginBottom: 14,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: styles.accent,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
              }}>
                Send to GrayCo CRM Estimator
              </div>
              <div style={{ fontSize: 12, color: '#C4B5D7', marginBottom: 12, lineHeight: 1.5 }}>
                The CRM's estimator tab will accept this payload directly (once the CRM import is wired up).
                For now, copy or download the JSON — the shape won't change, so nothing has to be redone later.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" icon={ClipboardList} onClick={copyJSONForCRM}
                  style={{ background: styles.accent, color: styles.navy }}>
                  Copy CRM Payload
                </Btn>
                <Btn size="sm" variant="ghost" icon={Download} onClick={downloadJSON}
                  style={{ background: 'transparent', color: '#fff', border: `1.5px solid ${styles.navy2}` }}>
                  Download .json
                </Btn>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: styles.text2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Or copy to Google Drive / spreadsheet:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn icon={ClipboardList} onClick={() => copyText(buildSummaryText())}>
                {t.copySummary}
              </Btn>
              <Btn icon={FileSpreadsheet} variant="secondary" onClick={() => copyText(buildTSV())}>
                {t.copyTSV}
              </Btn>
              <Btn icon={Download} variant="ghost" onClick={downloadCSV}>
                {t.exportCSV}
              </Btn>
            </div>
            <div style={{ fontSize: 11, color: styles.text2, marginTop: 10, lineHeight: 1.5 }}>
              <strong>{t.copyTSV}:</strong> opens cleanly in Google Sheets — paste into your estimate template and the columns line up.<br />
              <strong>{t.copySummary}:</strong> plain-text version for emails or Google Doc estimate templates.
            </div>
          </Card>
        </div>

        {/* RIGHT — margin picker + totals (sticky) */}
        <div style={{ position: 'sticky', top: 20 }}>
          <Card>
            <h3 style={{ ...sectionTitleStyle, margin: '0 0 12px' }}>
              <DollarSign size={18} /> {t.summary}
            </h3>

            <SummaryRow label={t.directTotal} value={totals.direct} bold />

            {/* Margin quick-picks */}
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: styles.text2,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
              }}>
                {t.margin} %
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                {MARGIN_PRESETS.map(pct => {
                  const active = Number(estimate.marginPct) === pct;
                  return (
                    <button key={pct} type="button"
                      onClick={() => patch({ marginPct: pct })}
                      style={{
                        padding: '10px 4px', cursor: 'pointer', fontFamily: styles.fontDisplay,
                        fontSize: 15, fontWeight: 700,
                        border: `2px solid ${active ? styles.accent : styles.border}`,
                        background: active ? styles.accent : '#fff',
                        color: active ? styles.navy : styles.text,
                        borderRadius: 6,
                      }}>
                      {pct}%
                    </button>
                  );
                })}
              </div>
              {/* Custom margin input for anything off the preset list */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: styles.text2 }}>Custom:</span>
                <input style={{ ...inputStyle, padding: '6px 10px', fontSize: 13, textAlign: 'right', flex: 1 }}
                  type="number" step="0.1" min="0" max="99"
                  value={estimate.marginPct || 0}
                  onChange={e => patch({ marginPct: Number(e.target.value) || 0 })} />
                <span style={{ fontSize: 13, color: styles.text2, fontWeight: 600 }}>%</span>
              </div>
            </div>

            {/* Margin dollars row */}
            <div style={{ marginTop: 14, padding: '10px 12px', background: styles.cream, borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: styles.text2 }}>
                <span>{t.margin} ${' '}({totals.marginPct.toFixed(1)}%)</span>
                <span style={{ fontFamily: styles.fontDisplay, fontWeight: 700, color: styles.text }}>
                  ${totals.marginDollars.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: styles.text2, marginTop: 4 }}>
                <span>Equivalent markup</span>
                <span style={{ fontWeight: 600 }}>{totals.markup.toFixed(1)}%</span>
              </div>
            </div>

            {/* Grand Total */}
            <div style={{
              marginTop: 14, padding: '16px 18px', background: styles.navy, borderRadius: 6,
            }}>
              <div style={{
                fontSize: 11, color: styles.accent, letterSpacing: '0.1em',
                textTransform: 'uppercase', fontWeight: 600,
              }}>{t.grandTotal}</div>
              <div style={{
                fontFamily: styles.fontDisplay, fontSize: 32, fontWeight: 700, color: '#fff',
                marginTop: 4, letterSpacing: '-0.01em',
              }}>
                ${totals.grand.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                Direct + {totals.marginPct.toFixed(1)}% margin
              </div>
            </div>

            {/* Status toggle + delete */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${styles.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select style={inputStyle} value={estimate.status}
                onChange={e => patch({ status: e.target.value })}>
                <option value="draft">{t.statusDraft}</option>
                <option value="final">{t.statusFinal}</option>
                <option value="sent">{t.statusSent}</option>
              </select>
              <Btn variant="danger" size="sm" icon={Trash2} onClick={deleteEstimate}>
                Delete Estimate
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helpers for the summary panel
function SummaryRow({ label, value, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '8px 0',
      fontSize: 13, fontWeight: bold ? 700 : 500,
      borderBottom: `1px solid ${styles.border}`,
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: styles.fontDisplay, fontWeight: 700 }}>
        ${value.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
      </span>
    </div>
  );
}
function PctRow({ label, value, dollar, onChange }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 70px 90px',
      alignItems: 'center', gap: 6, padding: '8px 0', fontSize: 13,
      borderBottom: `1px solid ${styles.border}`,
    }}>
      <span style={{ color: styles.text2 }}>{label}</span>
      <input style={{ ...inputStyle, padding: '5px 8px', fontSize: 13, textAlign: 'right' }}
        type="number" step="0.01" min="0"
        value={value || 0}
        onChange={e => onChange(Number(e.target.value) || 0)} />
      <span style={{ fontFamily: styles.fontDisplay, fontWeight: 700, textAlign: 'right' }}>
        ${(dollar || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
      </span>
    </div>
  );
}

/* ============================================================
   SHARED UI HELPERS
   ============================================================ */
const sectionTitleStyle = {
  fontFamily: styles.fontDisplay, fontSize: 16, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
  margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8,
  color: styles.navy,
};

function SectionHeader({ icon: Icon, title, count, noMargin }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 28, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 40, height: 40, background: styles.accentSoft, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={styles.accent} strokeWidth={2.2} />
      </div>
      <h1 style={{
        fontFamily: styles.fontBody, fontSize: 26, fontWeight: 700,
        margin: 0, letterSpacing: '-0.03em', color: styles.text,
      }}>{title}</h1>
      {count !== undefined && (
        <span style={{
          fontSize: 13, fontWeight: 600, color: styles.text2,
          background: styles.surface, padding: '4px 10px',
          borderRadius: styles.radiusFull, letterSpacing: '-0.01em',
        }}>{count}</span>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 20px', color: styles.text2,
      background: '#fff', border: `1px solid ${styles.border}`, borderRadius: styles.radiusLg,
    }}>
      <div style={{
        width: 64, height: 64, background: styles.surface, borderRadius: styles.radiusFull,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <Icon size={28} color={styles.text3} strokeWidth={1.8} />
      </div>
      <div style={{ fontSize: 15, marginBottom: 24, maxWidth: 400, marginInline: 'auto', lineHeight: 1.5 }}>{message}</div>
      <div style={{ opacity: 0.5 }}>
        <GrayCoLogo size="xs" variant="navy" />
      </div>
    </div>
  );
}

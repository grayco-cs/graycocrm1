// ============================================================================
// CONFIG — GrayCo Bids (bids.grayco-cs.com)
// ============================================================================
//
// The portal runs on the GrayCo CRM's own Supabase project and Netlify site:
//   • portal.grayco-cs.com            → subcontractors (and GrayCo staff) sign in here
//   • crm.grayco-cs.com/subportal/    → the 🔨 Sub Portal tab inside the CRM (already signed in)
//
// The browser only uses Supabase for signing in. Every record and file goes through
// the server function netlify/functions/subportal.js, which shows each subcontractor
// only their own records. The anon key below is public by design (it is also in the
// CRM's index.html): on its own it opens nothing.
// ============================================================================

export const SB_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
export const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
export const API_URL = '/.netlify/functions/subportal';
// 33.151: the working portal (awarded jobs, scopes, messages, pay) is portal.grayco-cs.com; this app is the bid site.
export const PORTAL_URL = 'https://portal.grayco-cs.com';

// Opened as the Sub Portal tab inside the CRM: the CRM shows the logo and handles sign-out.
export const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

// Company defaults shown throughout the UI
export const COMPANY = {
  name: 'GrayCo Construction Services, LLC',
  city: 'Bartlett, TN',
  officeEmail: 'office@grayco-cs.com',
  officePhone: '901-585-0944',
  portalUrl: 'portal.grayco-cs.com',
};

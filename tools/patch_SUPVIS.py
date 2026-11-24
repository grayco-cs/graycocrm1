# SUPVIS (owner 11/24, ABC Supply's Tom: "I was on the portal and couldn't find any projects including Los Gatos"): a supplier saw
# a bid job only when an admin had ticked "🧱 Suppliers can quote (materials)" — off by default, and even an invite to the job did
# not open it. Owner 11/19: "Vendors … should also be able to … see these jobs for bid". Now an approved supplier sees every open
# PUBLIC bid job unless an admin un-ticked the box (suppliersCanQuote === false), and a supplier INVITED to a job always sees it.
# The new-job e-mails to suppliers (_lib/bidmail.js) are unchanged: still only a ticked job or an invite.
def sub(p, a, b, n=1):
    t = open(p, encoding='utf-8').read(); assert t.count(a) == n, (p, a[:70], t.count(a)); open(p, 'w', encoding='utf-8').write(t.replace(a, b))
S = 'netlify/functions/subportal.js'
sub(S, "      const canSee = j.suppliersCanQuote === true && ((j.visibility || 'public') === 'public' || invited.has(r.id));",
       "      const canSee = invited.has(r.id) || (j.suppliersCanQuote !== false && (j.visibility || 'public') === 'public');   /* patch SUPVIS: on unless un-ticked; an invite always opens it */")
A = 'subportal-app/src/App.jsx'
sub(A, "      suppliersCanQuote: job.suppliersCanQuote === true, materialList: job.materialList || '',   /* patch SUPPLIER */",
       "      suppliersCanQuote: job.suppliersCanQuote !== false, materialList: job.materialList || '',   /* patch SUPPLIER · SUPVIS: on unless un-ticked */")
sub(A, "          {(isAdmin || isSupplier) && job.suppliersCanQuote && job.materialList && (",
       "          {(isAdmin || isSupplier) && job.suppliersCanQuote !== false && job.materialList && (")
sub(A, "          {isAdmin && (job.suppliersCanQuote || (mquotes || []).some(q => q.jobId === job.id)) && (",
       "          {isAdmin && (job.suppliersCanQuote !== false || (mquotes || []).some(q => q.jobId === job.id)) && (")
print('SUPVIS: done')

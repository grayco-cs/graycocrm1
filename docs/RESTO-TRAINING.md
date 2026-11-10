# GrayCo Fire & Smoke Restoration and Odor Control training (patch RESTOTRAIN)

Where: 📄 Forms & Docs → 🎓 Training (filter **IICRC**). Two GrayCo courses, written in GrayCo's own words:

- **GrayCo Fire & Smoke Restoration** — 8 lessons + quiz (covers the IICRC FSRT subjects).
- **GrayCo Odor Control** — 9 lessons + quiz (covers the IICRC OCT subjects).

Required for the **Insurance / Mitigation** role and open to everyone else. Each lesson has its own "✓ I read this". The last
part of each course is a 20-question quiz; passing (16 of 20) ticks it automatically, and it can't be ticked by hand, so
👥 Team progress shows who passed. Each course's first part links the printable manual (`/training/*.pdf`).

Change the words in `tools/restotrain_content.py`, then:

    python3 tools/patch_RESTOTRAIN.py           # updates index.html
    python3 tools/build_restotrain_pdfs.py <dir> # rebuilds /training/*.pdf; answer keys go to <dir> (not the site)

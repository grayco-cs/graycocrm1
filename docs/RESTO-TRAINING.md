# GrayCo Water, Fire & Smoke and Odor Control training (patch RESTOTRAIN)

Where: 📄 Forms & Docs → 🎓 Training (filter **IICRC**). Two GrayCo courses, written in GrayCo's own words:

- **GrayCo Water Damage Restoration** — 9 lessons + quiz (covers the IICRC WRT subjects, including dehumidifier, air mover and standing-water math).
- **GrayCo Fire & Smoke Restoration** — 8 lessons + quiz (covers the IICRC FSRT subjects).
- **GrayCo Odor Control** — 9 lessons + quiz (covers the IICRC OCT subjects).

Required for the **Insurance / Mitigation** role and open to everyone else. Each lesson has its own "✓ I read this". The last
part of each course is a 20-question test: tap an answer and it shows right away (✓, or ✗ with the right answer and why),
with a running score. When finished the score is saved (last, best, tries); 16 of 20 ticks the part (never by hand).
👥 Team progress lists every person's test scores. Each course's first part links the printable manual (`/training/*.pdf`).

Change the words in `tools/restotrain_content.py`, then:

    python3 tools/patch_RESTOTRAIN.py           # updates index.html
    python3 tools/build_restotrain_pdfs.py <dir> # rebuilds /training/*.pdf; answer keys go to <dir> (not the site)

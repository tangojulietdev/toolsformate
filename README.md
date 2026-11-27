# Meridian Tools for Mate

Maritime tools for the watchkeeper by Tango Juliet Dev: ROB, ETA, speed, ventilation, unit converter, hydrostatics interpolation, deadweight / max cargo intake, a Ballast Exchange tab (exchange planner with keep on arrival, D-1 check with safety buffer, step by step plan, drafts, trim, propeller immersion, bridge visibility and list at every step, SF/BM/GM from the loading computer, Excel export with formulas), proofread, time zones, load line zones, a Calculator (salinity and DWA, days, SF and density, trim and draft, rolling period and turning heel, anchor holding, mooring hours (Form 5 time sheet), NRE days for Indian seafarers) and a Garbage Stowage Board (GMP drums per deck, fill and free space, MARPOL Annex V categories, editable per vessel) a Budget tab, and a Media tab (contracts and salary by pay day, ledger, recurring EMIs and SIPs, monthly budgets, and the final in hand forecast for any date) a Crew OT tab (monthly overtime per crew: OT till the entry date, remaining days auto-estimated at 1 h weekday and 9 h for Sat, Sun and any date tapped as a holiday, port ops and coasting extras, manual carry over, fixed 103 h deducted, final OT, hourly rate per crew, extra payments such as hold cleaning, final amount, copy for email and Excel export with live formulas) and a Media tab that compresses and converts photos (JPG, PNG, WebP, HEIC, target file size, photos to PDF), PDFs (compress, target size, to images, merge), video (MP4, WebM, MOV, MKV, resolution, quality or target size, trim, rotate, remove sound, GIF, extract audio) and audio (MP3, M4A, OGG, WAV).

Installable PWA that works offline. All data stays on the device.

`source/tools-for-mate-single-file.html` is the editable single-file version of the app.

`ballast-exchange.html` is the Ballast Exchange module (with the Hydrostatics table) as one standalone offline HTML file.

UI: same interface as Meridian PDF Mate. Frosted glass top bar with the four tool groups (Voyage, Cargo & Stability, Ship's Office, Personal) in the middle and the chosen group's tools, each in its own colour, in the row underneath. On phones the tools sit in a floating glass dock with the group switcher in its first button. Search (Ctrl K), light and dark switch, bridge night mode (red on black, five brightness levels), About and keyboard shortcuts behind the i button. Alt+1 to 4 switch group.


Media engines in `vendor/` load only when the Media tab is used: Mediabunny and its MP3 encoder (MPL-2.0, LAME LGPL), pdf.js (Apache-2.0), pdf-lib (MIT), heic-to (LGPL-3.0), gifenc (MIT). Video and audio use the browser's WebCodecs hardware encoders.

`app.js` is built from the source file with esbuild (React 19), see the source for the app code. `media.js` is plain ES module code.

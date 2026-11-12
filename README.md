# Meridian Tools for Mate

Maritime tools for the watchkeeper by Tango Juliet Dev: ROB, ETA, speed, ventilation, unit converter, hydrostatics interpolation, deadweight / max cargo intake, proofread, time zones, load line zones, a Calculator (salinity and DWA, days, SF and density, trim and draft, rolling period and turning heel, ballast exchange, anchor holding, mooring hours (Form 5 time sheet), NRE days for Indian seafarers) and a Garbage Stowage Board (GMP drums per deck, fill and free space, MARPOL Annex V categories, editable per vessel) a Budget tab, and a Media tab (contracts and salary by pay day, ledger, recurring EMIs and SIPs, monthly budgets, and the final in hand forecast for any date) and a Media tab that compresses and converts photos (JPG, PNG, WebP, HEIC, target file size, photos to PDF), PDFs (compress, target size, to images, merge), video (MP4, WebM, MOV, MKV, resolution, quality or target size, trim, rotate, remove sound, GIF, extract audio) and audio (MP3, M4A, OGG, WAV).

Installable PWA that works offline. All data stays on the device.

`source/tools-for-mate-single-file.html` is the editable single-file version of the app.

UI: macOS style window with sidebar and unified toolbar on desktop, iOS list to detail navigation on phones. Control metrics adapted from [Puppertino](https://github.com/codedgar/Puppertino) (MIT).


Media engines in `vendor/` load only when the Media tab is used: Mediabunny and its MP3 encoder (MPL-2.0, LAME LGPL), pdf.js (Apache-2.0), pdf-lib (MIT), heic-to (LGPL-3.0), gifenc (MIT). Video and audio use the browser's WebCodecs hardware encoders.

`app.js` is built from the source file with esbuild (React 19), see the source for the app code. `media.js` is plain ES module code.

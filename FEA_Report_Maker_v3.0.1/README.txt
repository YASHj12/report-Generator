FEA REPORT MAKER  -  version 3.0.1
================================

Drop your ANSYS screenshots in. The program LOOKS AT EVERY PICTURE, says what it is (and why), reads the numbers
from the colour legends (every number TWICE), and writes the first draft of the Mech Well FEA report. You SEE the
report as slides inside the page, and you download the PowerPoint or a PDF with one click - like any download in a
browser: the file lands in the Downloads folder of your computer (Windows: File Explorer > Downloads).

Everything runs on YOUR computer. No picture and no data is sent to the internet.

NEW IN 3.0.1   (a small fix release - the program itself works as in 3.0)
  * Python 3.9, 3.10 and 3.11 could not start the program (one line of code was only valid from Python 3.12).
    Fixed. The program is now checked with Python 3.9, 3.10, 3.13, 3.14 and 3.15.
  * python.org now offers a new "Python install manager" instead of the classic installer. The Windows start
    file no longer waits silently when only that manager is installed: it shows what to do. The install guide
    now gives a direct link to the classic installer and explains the manager as the second way.
  * The first start says that a quiet window is normal (the packages need 1 to 5 minutes to download).

NEW IN 3.0   (your list, one by one)
  1. EVERY PICTURE IS CHECKED, AND THE REASON IS SHOWN.  A stress or contour picture can no longer end up
     among the geometry pictures: a picture with colours of a result plot is a result, whatever its name says.
     In the table "Pictures" a grey line under every picture says WHY it was sorted so ("the title says
     'Maximum Shear Stress' (Shaft)", "a colour contour without legend, with the red Max flag" ...).
  2. SHEAR AND PRINCIPAL RESULTS.  Maximum shear stress, shear stress, maximum / minimum / middle principal stress,
     stress intensity, elastic strain, safety factor - and results of ONE PART (for example "Equivalent Stress
     Shaft") - are recognised. Each gets its own slide, a caption "Maximum Shear Stress - 515 MPa, which exceeds
     the material allowable shear stress of 85 MPa.", a sentence in the observations and a row in the final
     summary table. See "FURTHER RESULTS" in part 4 for the rules.
  3. CASE NUMBERS START AT CASE 1 - AND ONLY WHEN THE PROGRAM IS SURE.  The number comes from (a) what you typed
     or chose on the upload page, else (b) the loads: a case whose loads are contained in another case's loads
     comes first (pressure only, then pressure + moment), else (c) it is left BLANK and a card at the top asks
     "Which load case is which?". Nothing is put into "Case 3" or "Case 4" by a guess any more. One ANSYS
     system only = Case 1.
  4. ZOOMED AND CUT-SECTION PICTURES GO ON THE SAME SLIDE AS THEIR FULL VIEW (like pages 14 - 16 of your
     Damper Blade report). The program studies the full view: where the model is empty, where the legend and the
     title are - and puts the small pictures there (or in a strip, or on a slide of their own when there is no
     room, and says so). A red box and an arrow mark the place of a zoom - only when it is a zoom and both
     pictures show the red Max flag. A cut section gets the label "Cut section" and no box.
  5. THE UPLOAD PAGE ASKS FIRST: how many load cases? ("Not sure" is fine.) All together (bulk) or case by case
     (one box per load case)? Then you may give each picture a NAME and say WHAT IT IS. A zoomed or cut-section
     picture is named after the result it belongs to: "equivalent stress", "shaft max shear" ...
     The names need not be perfect: they are only a help, never an order (a picture that is a colour contour
     stays a result picture).
  6. THE PREVIEW CHANGES ONLY WHEN YOU PRESS "PREVIEW".  It is built once, by itself, when the pictures have
     been read. After that every change only turns the label to "Out of date: press Preview to update" (and
     the Preview button glows). Downloading builds its own file from what is on the screen and leaves the
     preview alone.
  7. MATERIAL PAGE WITH PARTS.  Add a row for each part (Blade, Shaft, Dowel pin ...). When shear results exist
     the table gets the column "Allowable Shear Stress (MPa)" and the formula  tau-all = 0.5 x Syt / FOS  is
     printed next to the allowable-stress formula (as in your Damper Blade report).
  8. LONG LISTS NEVER RUN OFF A SLIDE.  Observations (and the assumptions list) that cannot fit continue on
     "(1/2)", "(2/2)" slides; the verdict and the closing line stay on the last one.
  9. A STEP-BY-STEP GUIDE FOR WINDOWS: the file  START_HERE_WINDOWS.txt  (in this folder) - for a person who
     has never installed a program.

EARLIER VERSIONS

NEW IN 2.2   (read this if you still see the OLD screen)
  * The page shows its VERSION at the top right (a small box "v3.0.1"). If it shows another number, or no
    number at all, you are looking at an OLD copy that is still open in another black window.
    Close that black window and its browser tab, then start this folder again.
  * An old copy that is still running can no longer be opened by mistake: the new copy starts on the next
    free port (5056, 5057 ...) and the black window says so. Your browser opens the right address by itself.
  * Reading the pictures never waits for ever. A picture the reader cannot finish within a minute is handed
    over to you (manual mode for that picture only); all the others are read normally.
  * After a download the message has a button "Open the Downloads folder".

NEW IN 2.1
  * The preview is there by itself. As soon as the pictures are read, the report appears as slides at
    the top of the page and updates a moment after every change you make. It needs nothing
    else installed (no LibreOffice).
  * "Download PowerPoint" and "Download PDF" are normal browser downloads, always available.
    Nothing has to be generated first, and there is no separate "done" page.
  * NOTHING BLOCKS YOU any more. A picture you do not have (geometry, mesh, a setup or result
    picture ...) is simply left out, or - your choice - an empty labelled frame is kept. A number that is
    missing leaves out its sentence. A missing yield stress gives neutral wording and a yellow
    "[value - please confirm]". The program never stops with an error for something that is missing;
    it carries on and tells you what it did.
  * Without Tesseract (the picture reader) the program still works: "manual mode" - pictures are sorted by
    their file names and you type the numbers.
  * In the PowerPoint, every "[... please confirm]" is highlighted YELLOW, so an unfinished spot cannot
    be overlooked.

Version 2 was built with a "council" of hostile reviewers (FEA analyst, QA lead, meshing
specialist, daily user, client reviewer, slide designer, red-team tester) who attacked every
idea before it was built and attacked the finished program afterwards. Versions 2.1, 2.2 and 3.0 went through a
fifth, sixth and seventh round of the same kind. The record is in docs\COUNCIL_REVIEW.md.


-----------------------------------------------------------------------------
1.  INSTALL  (one time, about 10 minutes)
-----------------------------------------------------------------------------

A)  Python 3.9 or newer   (checked with 3.9, 3.10, 3.13, 3.14 and 3.15)
      Windows : use the CLASSIC installer. Direct link to the official file on python.org:
                https://www.python.org/ftp/python/3.14.8/python-3.14.8-amd64.exe
                Run it, TICK  "Add python.exe to PATH"  on the first screen, then click "Install Now".
                (python.org also offers a newer tool, the "Python install manager". It works as well, but it
                 installs only the manager: open a cmd window once and type   py install 3.14 )
      Mac     : https://www.python.org/downloads/   (or:  brew install python)
      Linux   : normally already there  (sudo apt install python3 python3-venv)

B)  Tesseract OCR  =  the "picture reader"   (RECOMMENDED - without it the program runs in manual mode)
      Windows : https://github.com/UB-Mannheim/tesseract/wiki
                Download the "tesseract-ocr-w64-setup ..." installer and install with the default options.
      Mac     : brew install tesseract
      Linux   : sudo apt install tesseract-ocr

C)  LibreOffice   (OPTIONAL - only makes the PDF contain real, selectable text)
      https://www.libreoffice.org/download/
      Not needed for the preview and not needed for the PowerPoint. Without it the PDF is made
      from pictures of the slides (looks the same, but its text cannot be selected or searched).
      For a PDF with real text you can also use PowerPoint: File > Save As > PDF.


-----------------------------------------------------------------------------
2.  START
-----------------------------------------------------------------------------

   (First extract the ZIP: right-click it > Extract All... > Extract. Do not start from inside the ZIP window.
    Use a NEW folder - do not extract over an older version.)

   Windows : double-click   start_windows.bat
   Mac     : double-click   start_mac.command      (first time: right-click > Open)
   Linux   : in a terminal  ./start_mac_linux.sh

The very first start installs a few Python packages (internet needed, about 1 minute).
After that the program works completely offline.

A black window opens - leave it open while you work - and your browser opens at
        http://127.0.0.1:5055
(If an older copy is still running, this one uses the next free number - 5056 and so on - and the black
window tells you. The address in the browser is always the right one.)
The small box "v3.0.1" at the top right is the version you are looking at.
The top right of the page shows "Picture reader: ready" (or "manual mode" when Tesseract is
not installed - see 1B) and where the PDF comes from.

To stop the program: close the black window.
If you close the browser tab by mistake, open the address again: the page offers
"Continue your last report?" and everything you typed is back.


-----------------------------------------------------------------------------
3.  HOW TO USE
-----------------------------------------------------------------------------

 1. UPLOAD PAGE.
    a) "How many load cases does this job have?"  Choose the number, or "Not sure" (then the program finds out
       from the pictures: every ANSYS system A, B ... is one load case). "1" puts every setup / deformation /
       stress picture into Case 1.
    b) "How do you want to add the pictures?"
         All together (bulk) .... one box, drop every picture of the job in any order.
         Case by case ........... one box for the general pictures (geometry, mesh) and one box per load case.
       Drag the pictures into the box (or click the box and choose them). They appear in the list "Your pictures".
       Missing some of them? Drop what you have - see "NOTHING BLOCKS YOU" below.
    c) In the list you may (all optional):
         Name ......... what the picture shows, in your words: "case 2 equivalent stress", "shaft max shear".
         What is it? .. leave "Let the app decide", or say: geometry, mesh, setup, total deformation, von-Mises
                        stress, "Another result" (and which: shear, principal ... and the part), "Zoomed or
                        cut-section picture" (and which of the two) or "Do not use".
         Load case .... Auto, or the number.
       A zoomed or cut-section picture must be NAMED AFTER ITS RESULT ("equivalent stress", "shaft max shear"),
       so that the program puts it on the slide of that result.
    d) Press "Read the pictures" (a few seconds; the page counts the seconds and has a Cancel button).
    No pictures at hand? Press "Try it with the 9 example pictures".

 2. REVIEW.  Look at the preview (top of the page) and check the draft below it. Yellow boxes are things
    only you know. Everything else is filled in, and every sentence can be edited.
    - If the card "Which load case is which?" is there, choose the case number of each group of pictures.
    - The preview shows the real report: arrows or the small slides below it move through the pages,
      "Full screen" shows a slide large.  IT DOES NOT CHANGE WHILE YOU TYPE. When the label says
      "Out of date", press "Preview" (bottom bar) or "Update preview" to see your changes.
    - "Checks" lists what the program noticed.
    - "Pictures": every picture, what it is, why, and which load case. Change it there if it is wrong - the
      draft is rebuilt. A zoomed / cut-section picture has "Belongs to" (the plot whose slide it joins).
    - "Material": one row for the main part and one row per further part (button "Add ... to the material
      table" in the part's result box). The results of a part use the allowable of ITS row.
    - Next to every number you see the crop of the picture it was read from: compare them.

 3. Press "Download PowerPoint" or "Download PDF" (bottom right, or under the preview). The file is built from
    what is on the screen at that moment (not from the older preview). The browser
    saves the file in your Downloads folder. A small message tells you the file name and has a button
    "Open the Downloads folder" (File Explorer opens there; or press Ctrl+J in Chrome / Edge to see the list).
    A copy is also kept in the folder  outputs  of this program.
    You may download at any time - also while yellow boxes are still open. Whatever is not filled in
    appears as a yellow [text in brackets] in the PowerPoint, to be completed there.

    If your browser asks WHERE to save every file: Chrome / Edge > Settings > Downloads > switch off
    "Ask where to save each file before downloading". Then the files go straight to Downloads.


NOTHING BLOCKS YOU  -  what happens when something is missing
  A picture is missing ...
     geometry / mesh ........ that slide is left out; the section numbers close up (2., 3. ...). A mesh slide
                              is kept as a frame if you typed mesh statistics.
     setup picture .......... the setup slide shows the list of loads and supports only.
     one result picture ..... the other result picture fills the whole slide.
     both result pictures ... that results slide is left out.
     a whole load case ...... that case is left out; the summary table lists the cases that exist.
     Under the preview you can choose instead:  "If a picture is missing: Keep an empty frame to fill in
     PowerPoint". The frame is a real picture box labelled "... not provided": in PowerPoint right-click it >
     Change Picture and your picture takes its place.
  A number is missing ...
     maximum deformation / stress ... its sentences are left out and the summary table shows a dash.
     yield stress .................. neutral wording ("Von-Mises stress in the Blade is 74.2 MPa."), no pass / fail
                                     statement, and a yellow "[value - please confirm]" where the allowable
                                     stress belongs. The program never invents a verdict.
  The picture reader (Tesseract) is missing ... manual mode (file names are used to guess what a picture is;
     you type the Max values and the lines of the setup list).
  A picture file is damaged ... it is treated as missing.
  Under the preview a blue box lists what was left out or simplified, in plain words.


WHAT THE PROGRAM DOES BY ITSELF
  - decides which picture is geometry / mesh / setup / total deformation / von-Mises stress /
    another result type, and which load case each belongs to (also when two separate ANSYS
    projects both call their case "A")
  - never mistakes a shear, principal, directional or part plot (Shaft, Dowel pin ...) for the main
    total-deformation / von-Mises plot of the whole model: those are "further results"
  - finds the zoomed and cut-section pictures (colour, no legend) and the plot each one belongs to, and puts them
    on that plot's slide
  - reads Max deformation and Max stress from the legends, TWICE with different OCR settings;
    repairs a dropped decimal point inside a legend; flags any disagreement
  - reads the loads and supports (A, B, C ...), writes the sentences, converts pressure to mmWC
  - names Top / Bottom view from the axis arrows, names the cases, writes captions, observations,
    the pass / fail statement and the final summary table
  - uses the same picture only once if you upload it twice
  - suggests the yield stress from the stress legend; checks units, density, Young's modulus,
    Poisson's ratio, gravity, FOS; checks mesh statistics against the ANSYS limits
  - keeps your work safe: everything you type is saved automatically
  - keeps a preview ready: built once automatically, rebuilt only when you press Preview

WHAT NEEDS YOU
  - the yield stress (always typed or accepted by you, never remembered between jobs)
  - WHERE the supports and loads are ("on the left shaft") - the pictures cannot tell
  - client / report number when they are not in the ANSYS model name; the date
  - what a section or detail view shows ("Section A-A through the hub") - no program can see that; and whether a
    picture is a zoom or a cut section when the name does not say it (the label "Detail view" is used then)
  - the material and yield stress of each part (Shaft, Dowel pin ...)
  - the order of the load cases, when the loads do not tell it
  - HOW to report a stress that is absurdly high (see 4.)
  - names of load cases when two cases have the same loads
  - a last look at the PowerPoint before it goes to the client


-----------------------------------------------------------------------------
4.  THE THINGS THAT WERE ADDED FOR BIG MODELS AND FOR FEA JUDGEMENT
-----------------------------------------------------------------------------

BIG OR WIDE MODELS - "Picture layout" card
  When two pictures share a slide they get small. The program measures the text INSIDE your
  screenshots (legend, axes) and tells you how big it will be on the slide, for each layout:
        Side by side  |  Stacked (one above the other)  |  One per slide
  About 5.5 pt is what the Mech Well template gives. Auto keeps the template look whenever the
  text stays readable (5 pt or more) and switches to the layout with the largest text when it
  does not. You can override it for the whole report or for one load case. If even the best
  layout leaves the text small, the program says so honestly - then export the picture larger or
  closer to the model, or add zoomed views. (A very TALL model cannot be helped by any layout,
  because the slide height is the limit.)
  The same applies to the setup picture (picture on top, list underneath) and to geometry,
  mesh and additional views. More than 8 summary rows continue on a second slide.

ZOOMED VIEWS AND CUT SECTIONS - on the slide of their full view
  A picture with the colours of a result but no legend is a zoomed view, a cut section or a second view of a plot.
  It belongs to a plot (total deformation, von-Mises, a further result). The parent is found from the words of its
  name ("shaft max shear zoom" -> the Shaft max-shear plot) or - when there is only one candidate - the plot
  itself (marked "my guess: check it"); otherwise the field "Belongs to" stays YELLOW. A view takes the load case
  of its plot.
  The slide: the full view stays as large as possible; the small pictures sit in the empty space of the full view
  (never over the legend, the title or the model), otherwise in a strip, otherwise on slides of their own (a note
  says so). Each small picture has a label (Zoomed view / Cut section / Detail view - editable). A red box and an
  arrow connect a ZOOM with the place it shows, only when both pictures show the red Max flag; for a cut section
  or a picture of unknown kind there is no box (a box that may be wrong is worse than none).
  All pictures are normal PowerPoint pictures: you can still move them.
  A second picture of the SAME kind that is a full plot (not a view) is still an "additional view" of the case.

FURTHER RESULTS - shear, principal stress, results of one part
  Every further result gets its own slide (after the main plots, before the observations), a caption, a sentence
  in the observations, and a row in the final summary table (the table then says "Max. Stress" and lists
  "Case - ...: Shaft - Max-shear stress").
  Compared with:                                           allowable used
     von-Mises, stress intensity, max principal            the allowable stress  (yield / FOS)
     min principal                                         the allowable stress, on the absolute value
     maximum shear, shear stress                           the allowable SHEAR stress = 0.5 x allowable (setting shear_ratio)
     deformation, strain, normal, directional ...          no allowable: the value is stated
     safety factor                                         above / below 1
  A result of ONE PART is never compared with the allowable of the whole model (the part may be another
  material). Its allowable is, in this order: the number you typed in its box, else the row of the material
  table whose Item is the part (Item "Shaft" for "Equivalent Stress Shaft"), else NOTHING - the sentence shows a
  yellow  [Allowable stress of the Shaft - please confirm]  and no verdict is invented.
  Sense checks (list "Checks"): maximum shear / von-Mises must lie between 0.50 and 0.58 for the same part (if not, one
  reading is wrong or the two plots show different parts); stress intensity / von-Mises between 1.00 and 1.15;
  a part result at 2 x yield or more is flagged as a probable stress singularity (also in the sentence); principal
  stresses carry a note that for ductile steel the von-Mises stress governs. A minimum principal stress and a
  minimum safety factor are read from the BOTTOM of the legend - check them.
  If a further result exceeds its allowable, the verdict of the case becomes "structurally inadequate ... Need
  to take corrective actions." even when the main plot passes.

VERDICT TIERS AND THE SINGULARITY GUARD
  The report compares the maximum von-Mises stress with the allowable stress (yield / FOS):
     within allowable                      -> "adequate", with the utilisation in %
     above allowable, below yield          -> "exceeds ... need to take corrective actions"
     above yield                           -> same, plus a note that the linear-elastic result is
                                              only indicative at that location
     2 x yield or more (setting)           -> almost always a stress singularity (point support,
                                              sharp corner, contact edge) or a load / unit error.
                                              The program does NOT decide: you must choose
                                              (a) report as it is,
                                              (b) the peak is a local singularity - report the stress
                                                  away from it (you type where, and the value),
                                              (c) no conclusion yet - the model must be refined.
  Your choice is written into the observations and the summary table. The program never invents
  the "away from the peak" value.

OPTIONAL ENGINEERING EVIDENCE (printed only if you fill it in)
  - location of the maximum stress / deformation   - reaction-force check (applied vs reactions)
  - allowable deformation (adds a table column)    - mesh statistics under the mesh picture
  - assumptions & scope slide (a tick-list; NOTHING is ticked for you)
  - revision / prepared by / checked by / drawing reference on the cover
  - a one-click working-temperature note


-----------------------------------------------------------------------------
5.  SETTINGS  (settings.json - open with Notepad, save, restart the program)
-----------------------------------------------------------------------------

   port                 the number in the address (default 5055)
   report_no_pattern    how the report number is made; {job} = job number from the model name
   fos                  default factor of safety (1.3)
   material             default material row (the page also remembers what you typed last time)
   units                the "Units: ..." line of the material page
   mm_format            "sig3" = 3 significant digits (2.42 mm);  "sample" = 4 decimals like the old report
   show_utilisation     "(utilisation 25 %)" in the within-limit sentence
   shear_ratio          allowable SHEAR stress = this x allowable stress (0.5 = maximum-shear / Tresca; 0.577 for von-Mises)
   singularity_factor   peak stress at or above this many times YIELD -> you must choose how to report it (2.0)
   min_legend_pt        legend text on the slide below this size is flagged (5.0 pt)
   mesh_limits          warning limits for the mesh statistics (ANSYS Meshing Help values)
   assumption_library   the tick-list of the Assumptions card - write your own standard sentences
   missing_pictures     "skip" = a missing picture's slide is left out (default), "frame" = keep an empty frame
                        (the page also remembers the choice you make under the preview)
   keep_copy_in_outputs true = every downloaded report is also copied into the folder  outputs


-----------------------------------------------------------------------------
6.  LIMITS  (please read)
-----------------------------------------------------------------------------

  * Built and tested on THREE real jobs (KCP MLD Blade, the Silvertone guillotine gate and the Damper Blade
    6148 with its 23 pictures, three parts, shear plots, zoomed views and cut sections) plus many deliberately
    nasty variants (wide, tall and huge pictures, JPG, duplicates, other result types, two projects both called
    "A", 10 load cases, 16 results in one case, damaged pictures ...). All three real jobs were sorted correctly
    and every Max value was read correctly. A fourth job may still surprise it.
  * It expects the normal ANSYS Workbench screenshot: title block top-left, colour legend at the
    left, load / support legend top-left of the setup picture. If it cannot read something it says
    so (yellow box or a note in "Checks") and you type the value - it never invents numbers.
  * Whether a small picture is a ZOOM or a CUT SECTION cannot be read reliably from its pixels. The program uses
    the words of its name ("zoom", "section", "cut", "detail") and what you choose; otherwise it says
    "Detail view" and draws no box. Which plot a view belongs to comes from the words of its name or from
    being the only candidate; otherwise it stays blank and yellow.
  * The place of the small pictures on a slide is chosen automatically. It is a good start, not a promise: look
    at the preview, and move a picture in PowerPoint if you prefer another place.
  * The size of the text on the slide is an estimate (measured from the legend digits).
  * The 2 x yield rule is a rule of thumb. The engineer decides.
  * The main plots use ONE governing allowable stress (several materials: you choose the governing row). A part
    uses the material-table row whose Item has the same name as the part (or the number you typed).
    No stress linearisation / averaging: peak values only. Principal stresses are compared with the allowable
    stress as a simple tension / compression check; for ductile steel the von-Mises stress governs.
  * The allowable shear stress is 0.5 x the allowable stress (setting shear_ratio) - a design choice, not a
    law of nature; change it in settings.json if your standard says otherwise.
  * The generated PowerPoint uses the same layout as the template, but it was only checked in
    LibreOffice and by the program's own slide renderer, not in PowerPoint itself - give it one look in
    PowerPoint before sending. The yellow highlight of unfinished spots shows in PowerPoint 2019 / 365.
  * The preview is drawn by the program's own slide renderer (so it works on every computer). It follows
    the PowerPoint file closely (text lines agree with LibreOffice's within a fraction of a point) but it
    is not PowerPoint: a line may break one word earlier or later, and text may sit a pixel or two apart.
  * Without LibreOffice the PDF is made from pictures of the slides: it looks the same, but its text
    cannot be selected or searched.
  * Without Tesseract (manual mode) the program cannot read the pictures; it guesses from the file names
    only, and you type every number. With unnamed pictures you choose what each one is.
  * The Windows start file could not be tested on a real Windows PC by the person who built it.
    If it fails, send a photo of the black window. (START_HERE_WINDOWS.txt tells you how.)
  * The preview and the downloads run inside the program on YOUR computer. Do not upload confidential
    pictures to any copy of the program that runs on someone else's computer.
  * It is a drafting aid. The engineer remains responsible for the numbers and the conclusions.


-----------------------------------------------------------------------------
7.  PROBLEMS
-----------------------------------------------------------------------------

  "Python was not found"            Install Python (step 1A) with the CLASSIC installer. If you installed only the
                                    "Python install manager": open a cmd window and type   py install 3.14   once.
  "Picture reader: manual mode"     Tesseract is not installed (step 1B). You can work without it, but the
                                    numbers are not read from the pictures. Windows: restart the program afterwards.
  The download does not start       The page shows a link "Nothing happened? Click here". A pop-up blocker or
                                    a "this site wants to download multiple files" question can be the cause: allow it.
                                    If the page is shown INSIDE another window (for example the preview pane of a
                                    website) that window can forbid every download. Open the program in a normal
                                    browser tab of your own computer (start_windows.bat), or take the copy from outputs.
  I still see the old screen        Look at the top right of the page: it must say  v3.0.1.  If not, an OLD copy is still
                                    open. Close all black windows of the program and the browser tabs, start the new
                                    folder again. (Extract the ZIP into a NEW folder; do not mix it with an old one.)
  Where is my file?                 Your browser's Downloads folder (Windows: File Explorer > Downloads, or
                                    Ctrl+J in Chrome / Edge, or the button "Open the Downloads folder" in the
                                    message). Also in the folder  outputs  of this program.
  The page waits for ever           It should not any more (see "EARLIER VERSIONS"). Press Cancel and press "Read the pictures" again;
                                    if a picture keeps failing, rename it  case1_bc.png  /  case1_stress.png ...  and try again.
  The slide looks slightly different in PowerPoint
                                    The preview is the program's own drawing, not PowerPoint (see 6.).
  PowerPoint says "Protected View" PowerPoint does this for every file that was downloaded from a browser.
                                    Click "Enable Editing" - the file is your own report.
  The browser does not open         Type  http://127.0.0.1:5055  in the address bar.
  "port ... in use"                 Normally nothing to do: the program takes the next free number by itself.
                                    Only if no number is free: close the other black windows.
  Packages could not be installed   Check the internet connection and start again. (To force a fresh
                                    install delete the hidden folder  .venv  and start again.)
  A picture is sorted wrongly       Change "What is it?" / "Load case" in the Pictures table.
  A number is wrong                 Compare with the crop next to it and type the correct value.
  Old pictures                      Temporary copies are kept in the folder  work  for 7 days.
                                    You can delete that folder any time.


-----------------------------------------------------------------------------
8.  WHAT IS IN THIS FOLDER
-----------------------------------------------------------------------------

  start_windows.bat / start_mac.command / start_mac_linux.sh    start the program
  settings.json                                                 your defaults and limits
  outputs\                                                      a copy of every report you download
  examples\                                                     9 example pictures (KCP MLD Blade)
  docs\COUNCIL_REVIEW.md                                        how the program was challenged
  app\                                                          the program (web page + picture reader)
  engine\                                                       the report builder (template look, fonts, logos)

Third-party software used: Tesseract OCR (Apache-2.0), Flask, python-pptx, Pillow, NumPy,
pytesseract; LibreOffice (optional, MPL-2.0); the Liberation Sans fonts (SIL Open Font License, see
engine\fonts\LICENSE.txt) are used to measure and draw text so that lines break the same way as in PowerPoint.

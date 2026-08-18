# BV Regional Editor MVP

## Ziel und Grenze

Der Editor erzeugt ausschließlich das modellneutrale Custom-Objekt `BV_REGIONAL` nach `bv.regional` Version 1. Modell-Patcher, Conditioning-Compiler und Sampler-Logik gehören ausdrücklich nicht in den Editor. Dadurch können spätere Backends für Anima, Krea 2, Flux-Familien, Illustrious oder Qwen Image denselben Vertrag konsumieren.

In Version 1 ist nur die Overlap-Semantik `joint` ausführbar. Die reservierten Werte `normalized`, `priority` und `exclusive` bleiben im Schema sichtbar, werden aber von der Runtime-Validierung bewusst abgelehnt.

## Nodes

- `BV Regional Prompt`: kompakte Graph-Node und einziger Besitzer des serialisierten Dokuments. Ausgabe: `BV_REGIONAL`.
- `BV Regional Debug`: kanonisches JSON, eine kurze Zusammenfassung und die separat verkabelbare `document_id`.
- `BV Regional Select`: wählt Global, Background oder genau eine Region per UUID beziehungsweise eindeutigem Namen.
- `BV Regional Deconstructor`: produktiver Convenience-Seam für dieselbe Auswahl und gibt positive/negative Prompts jeweils als `BV_AST`, Plain Text und ursprünglichen Quelltext sowie die stabile Auswahlidentität aus. Seine `BV_REGIONAL_SELECTION` kann direkt an den Mask Renderer und spätere Detailer-Adapter angeschlossen werden.
  Der Regionsselector wird im Frontend aus der direkt verbundenen `BV Regional Prompt`-Node als Namens-Dropdown aufgebaut, speichert intern jedoch die stabile Regions-UUID. Doppelte Namen erhalten zur Unterscheidung einen kurzen UUID-Zusatz.
- `BV Regional Prompt Extract`: gibt positiven und negativen Prompt jeweils als `BV_AST`, Plain Text und ursprünglichen Quelltext aus.
- `BV Regional Mask Render`: rendert die gewählte Region, die volle Global-Maske oder die unbedeckte Background-Maske und gibt zusätzlich deren Pixel-BBox aus.
- `BV Regional Native Conditioning`: kompiliert `BV_REGIONAL + CLIP` zu positivem und negativem nativem ComfyUI-`CONDITIONING`. Ein nichtleerer Global Prompt bleibt unmaskiert; Background und aktivierte Regionen erhalten gerenderte Masken. Ist Global leer, arbeiten vorhandene Regionen ohne zusätzliches unmaskiertes Empty-Conditioning. Nur ein vollständig leerer Promptzweig erhält einen technischen Empty-Fallback. Regionsstärken werden sichtbar mit `region_strength_multiplier` multipliziert, dessen neutraler Standard `1.0` bleibt. Die Ausgaben funktionieren mit dem normalen KSampler, bieten aber keine modellintern gepatchte Attention-Isolation.
- `BV Regional SDXL Attention`: kompiliert `BV_REGIONAL + MODEL + CLIP`, klont ein validiertes SDXL-Modell und routet Global, Background sowie beliebig viele Regionen über gepatchte Cross-Attention. Global bleibt vollflächig verfügbar, Background nur in der unbedeckten Restfläche und Regionen innerhalb ihrer gerenderten Masken; `joint`-Überlappungen stellen alle beteiligten Region-Slots bereit. Die Node liefert `patched_model`, `positive` und `negative` für einen normalen KSampler. Empfohlener Startpunkt: Attention Strength `1.0`, Start `0.0`, End `0.5`. Nicht-SDXL-Architekturen werden explizit abgewiesen. Der Pfad ist mit WAI Illustrious SDXL und Pony Diffusion V6 XL real verifiziert.
- `BV Regional Anima Adapter`: kompiliert Global, Background und beliebig viele aktivierte Regionen zu einer `ANIMA_CONDITIONING_REGIONS`-Kette für das optionale NodePack `Comfyui-Anima-Regional-Conditioning`. Dadurch entfallen einzelne CLIP-Encode-, Mask-Render- und `Anima Conditioning Region`-Nodes pro Region. `positive` und `negative` gehen an den normalen KSampler; `regions` und optional `background` an `Apply Anima Regional Conditioning Patch`. Der Adapter enthält bewusst keinen kopierten Attention-Patcher.
- `BV Regional Anima Conditioning`: eigenständiger Hauptpfad ohne Laufzeitabhängigkeit vom externen Anima-NodePack. Die Node kompiliert das Dokument, patcht ein validiertes Anima-Modell intern und gibt `patched_model`, `positive` und `negative` für einen normalen KSampler aus. Die Attention-Implementierung basiert unter MIT-Hinweis auf `Comfyui-Anima-Regional-Conditioning` und verwendet einen BV-spezifischen Wrapper-Key.
- `BV Regional Preview Send` (interne kompatible Klassenkennung `BV Regional Image Send`): sendet ein temporäres Preview-Ergebnis an den Editor eines ausgewählten `BV Regional Prompt`. Die sichtbare Auswahl verwendet Node-Titel und Node-ID, während intern die stabile `document_id` gespeichert wird. Bei mehreren ausgeführten Sendern gewinnt das zuletzt beim Frontend eingetroffene Ergebnis; entfernte Ziele werden nicht stillschweigend auf ein anderes Dokument umgebogen.
- `BV Regional Save Send` (interne Klassenkennung `BV Regional Image Save`): speichert das Bild regulär im ComfyUI-Output, sendet dasselbe gespeicherte Ergebnis an den ausgewählten Editor und reicht das Bild am Ausgang weiter. Zielauflösung und Last-Sender-Wins-Semantik entsprechen der Preview-Variante.
  Das modellbezogene Backend wird erst beim Ausführen dieser Node importiert. Fehlende optionale Abhängigkeiten oder inkompatible ComfyUI-Patcher-Schnittstellen dürfen deshalb nicht die Registrierung des übrigen BV NodePacks verhindern.

## Editor-Verhalten

Der Editor wird über den `Regional`-Button in der ComfyUI Action Bar oder über `Open Regional Editor` auf einer `BV Regional Prompt`-Node geöffnet. Er ist ein DOM/React-Fenster außerhalb des Graph-Canvas und bleibt deshalb bei Canvas-Zoom und Navigation unverändert.

Mehrere Dokument-Nodes werden im Kopf des Editors umgeschaltet. Der aktive Node-Widgetwert wird automatisch aktualisiert. Undo/Redo verwaltet bis zu 100 Dokumentstände. `Ctrl/Cmd+Z` und `Ctrl/Cmd+Shift+Z` werden bei geöffnetem Editor in der Capture-Phase abgefangen und nicht an ComfyUI weitergereicht.

Der nichtsemantische Editorzustand wird getrennt vom `BV_REGIONAL`-Dokument pro `document_id` gespeichert und beim erneuten Öffnen derselben Node wiederhergestellt. Dazu gehören insbesondere aufgeklappte Menüs und Bereiche, aktive Tabs, Panelbreiten, Viewport/Zoom sowie die zuletzt gewählte Region und Ebene. Dieser Komfortzustand darf weder Compiler-Ausgaben noch die deterministische Dokumentserialisierung beeinflussen.

Der Editor erhält zwei viewport-feste Betriebsarten. `Workspace` füllt den verfügbaren Viewport mit festen Rändern, folgt Browsergrößenänderungen automatisch und ist weder frei verschiebbar noch skalierbar. `Floating` ist frei verschiebbar und skalierbar; außerhalb des Fensters bleibt ComfyUI vollständig bedienbar, sodass der Benutzer parallel im Graph navigieren und arbeiten kann. Graph-Zoom und Graph-Pan dürfen Position oder Größe des Floating-Fensters nicht beeinflussen. Der Floating-Modus speichert seine Fenstergeometrie pro `document_id`; beide Modi können ohne Verlust von Dokument-, Undo- oder Auswahlzustand wechseln.

Implementiert ist ein versionierter lokaler View-State pro `document_id`. Er speichert Workspace-/Floating-Geometrie, Panelbreiten, Artboard-Zoom/Pan/Fit, aktive Region und Ebene, Werkzeug, Brush-Einstellungen, Anzeige-Deckkraft, Isolation und das zuletzt geöffnete Top-Menü. Alte, beschädigte, außerhalb des Viewports liegende oder wegen Storage-Quota nicht speicherbare Zustände werden sicher normalisiert beziehungsweise ignoriert; sie verändern niemals `BV_REGIONAL`.

Unterstützte Authoring-Werkzeuge:

- normalisierte Rechtecke,
- additive Pinselstriche,
- subtraktive Pinselstriche,
- beliebig viele unabhängige Regionen,
- Canvas-Breite und -Höhe für korrektes WYSIWYG-Seitenverhältnis,
- Global-, Background- und Regionsprompts,
- positive und negative Quellen einschließlich `negative_mode=zero_out`,
- Region Strength und Feather.

Die zweite Interaktionsiteration ergänzt:

- Live-Vorschau für Rechtecke und Brush-Strokes vor `pointerup`,
- echte visuelle Add/Subtract-Komposition statt weißer Subtract-Striche,
- Select, Move und acht Resize-Handles für Rechtecke und komplette Brush-Strokes,
- numerische X-/Y-/Breite-/Höhe-Bearbeitung,
- runde und eckige Brushes mit Size, Hardness, Opacity und optionalem Stylus-Druck,
- einen größen- und härtebezogenen Brush-Cursor,
- separate lineare Anzeige-Deckkraft ohne Änderung der Maskendaten,
- Geometrieebenen je Region mit Auswahl, Sichtbarkeit, Aktivstatus, Lock und Reihenfolge,
- nichtdestruktive, innerhalb der gewählten Ebene gruppierte Subtract-Strokes,
- Duplizieren, Löschen sowie Solo-Darstellung der ausgewählten Ebene,
- vereinfachte Brush-Pfade zur Reduktion der Workflowgröße,
- korrekte Brush-Abmessungen auf nichtquadratischen Canvases.
- sortierbare Regionen mit synchronisierter zukünftiger Priorität,
- direkt in der linken Seitenleiste umbenennbare Regionen und Ebenen,
- frei ziehbare und lokal persistierte Panelbreiten,
- Datei-, Bearbeiten-, Ansicht- und Hilfe-Menüs einschließlich JSON-Import/Export,
- integrierte Tastatur- und Maushilfe.
- viewport-feste Werkzeug- und Zoomleisten; nur die Zeichen-Stage wird transformiert,
- Zoom unter dem Mauszeiger sowie Pan mit mittlerer Maustaste oder `Leertaste + Ziehen`.
- kompakte Hauptmenüs und eine vertikale schwebende SVG-Werkzeugpalette direkt am Artboard,
- kontextuelles Brush-Einstellungsflyout anstelle einer dauerhaft breiten oberen Toolleiste,
- vorgesehener, zunächst deaktivierter Ebenenbefehl `Getrennte Flächen aufteilen…`.

Geometrieebenen besitzen dafür rückwärtskompatible optionale Felder `enabled` und `authoring`. Brush-Strokes können zusätzlich `shape` und `pressure_mode` speichern. Fehlen diese Felder in einem älteren Workflow, ergänzt der Editor stabile Standardwerte.

## Hintergrundbilder

`BV Regional Preview Send` speichert ausschließlich eine ComfyUI-Temp-Preview. Die Browser-Session ordnet das letzte Ergebnis anhand der `document_id` zu. Das Bild wird nicht in `BV_REGIONAL` und nicht als Base64 im Workflow persistiert. Ein Workflow-Reload beginnt daher absichtlich ohne Sender-Hintergrund, bis die Sender-Node erneut ausgeführt wird.

## Prompt-Bearbeitung und Completion

### Prompt-Schnellbearbeitung

Ohne den vollständigen Editor zu öffnen, ist eine kompakte Prompt-Palette erreichbar. Sie bietet direkte Ziele für Global, Background und jede Region und zeigt jeweils Positive und Negative als editierbare Textfelder. Die Zielauswahl verwendet sichtbare Namen, speichert intern jedoch stabile IDs. Änderungen laufen durch dieselbe Validierungs- und Dokumentpipeline wie Änderungen im vollständigen Editor; es entsteht keine zweite Prompt-Datenquelle.

Die Schnellbearbeitung ist sowohl über die jeweilige `BV Regional Prompt`-Node als auch über die globale Action-Bar-Oberfläche erreichbar. Bei mehreren Editor-Nodes zeigt die Dokumentauswahl eindeutig, welches Dokument aktiv ist; das zuletzt gewählte Prompt-Ziel wird pro Dokument gespeichert.

### Autovervollständigung und Textassistenz

Die Promptfelder verwenden `BV Global Completion`, ein nodepack-weites Completion-Modul mit austauschbarer Suggestion-Provider-Schnittstelle. Dieselbe Engine integriert neben BV React-Editoren auch geeignete klassische ComfyUI- und Nodes-2.0-Multiline-Widgets. Sie verwendet lokale CSV-/TSV-Datasets, unterstützt priorisierte Quellen und kann global oder im Editor deaktiviert werden. Details und Integrationsverträge stehen in `docs/specs/bv-global-completion.md`.

`comfy-ex-tagcomplete` und vergleichbare Widget-Extensions können abgekoppelte React-/Floating-Textfelder nicht über einen gemeinsamen stabilen nativen Opt-in-Hook registrieren. BV emuliert deshalb weder Node-DOM noch importiert es private Frontendklassen fremder Extensions. Normale `<textarea>`-Semantik und bubbling `input`-Events bleiben für allgemeine Interoperabilität erhalten. Bridges zu einzelnen Fremdsystemen sind außerhalb des MVP als optionale Adapter denkbar, dürfen aber weder Kernfunktion noch lokales Datenformat bestimmen.

Das Completion-System ist für weitere Providerklassen vorbereitet: Embeddings, LoRAs, Wildcards, AST-/Kontextvorschläge sowie später Rechtschreib-, Übersetzungs- oder Sprachassistenz. Vorschläge verändern den kanonischen Prompt niemals ohne explizite Benutzerübernahme.

Rechtschreib- oder Sprachkorrektur wird als separater optionaler Text-Assistant vorgesehen. Sie darf niemals ungefragt den kanonischen Prompt verändern und muss Vorschlag, Übernahme und Rücknahme klar trennen. Eine mögliche TextLab-Integration wird erst nach Prüfung ihrer konkreten Schnittstelle festgelegt.

## Verifikation

Automatisiert:

- JSON-Schema- und Fixture-Vertrag,
- Prompt-AST-Parsing,
- Dokumentvalidierung einschließlich IDs, Parent-Zyklen und normalisierter Geometrie,
- Rechteck-, Pinsel-, Subtraktions-, Global- und Background-Masken,
- Adapterpipeline Select → Prompt Extract → Mask Render,
- TypeScript Strict Typecheck,
- Vite Production Build.

Interaktiv verifiziert:

- Krea 2 über `BV Regional Native Conditioning`: lokale Farb-/Musterzuordnung und Prompt-Swap funktionieren; getrennte Instanzerzeugung ohne Global-Komposition bleibt eine Grenze des nativen Backends.
- Anima über den eingebauten `BV Regional Anima Conditioning`-Patcher: zwei getrennte Charaktere, regionale Haar-/Outfit-Zuordnung, Background-Routing und normaler KSampler funktionieren im realen GPU-Lauf. Der externe Sen-sou-Apply-Node war dabei nicht Bestandteil des Ausführungspfads.
- SDXL über `BV Regional SDXL Attention`: WAI Illustrious SDXL und Pony Diffusion V6 XL wurden mit zwei kontrastierenden Charakterregionen, leichter Überlappung, Background-Routing und normalem KSampler real auf der GPU verifiziert. Unter identischen Ausgangseinstellungen und ohne backend-spezifisches Native-Tuning war die semantische Trennung stabiler als mit `BV Regional Native Conditioning`; dies ist kein generelles Qualitätsurteil über optimierte Native-Workflows.

Interaktive Smoke-Test-Matrix für Releases:

1. Node anlegen, Editor über Node und Action Bar öffnen.
2. Zwei `BV Regional Prompt`-Nodes anlegen und im Editor wechseln.
3. Rechteck sowie Add/Subtract-Pinsel erstellen; Workflow speichern, neu laden und Daten prüfen.
4. Bei geöffnetem Editor `Ctrl+Z` testen und sicherstellen, dass der Graph nicht rückgängig gemacht wird.
5. Sender vor und nach einem Detailer ausführen; das zuletzt ausgeführte Bild muss gewinnen.
6. Node in einem Subgraph laden und über die globale Dokumentauswahl öffnen.
7. Editor schließen und dieselbe Node erneut öffnen; Menüs, Panels, Viewport und Auswahl müssen dokumentbezogen wiederhergestellt werden.

## Bekannte MVP-Grenzen

- Der native Conditioning-Compiler ist vorhanden. Echte modellinterne Attention-Isolation steht für Anima über den optionalen externen Patcher-Adapter bereit; eigene BV-Patcher und weitere Modellfamilien fehlen noch.
- Der ältere Anima-Adapter benötigt `Comfyui-Anima-Regional-Conditioning` und bleibt vorerst als Vergleichs-/Fallbackpfad erhalten. Der neue eingebaute Anima-Patcher benötigt dieses NodePack nicht. Beide Pfade können regionale Negativprompts noch nicht isoliert routen; sie werden daher nicht stillschweigend globalisiert. Der KSampler-Negativzweig verwendet nur Global Negative beziehungsweise Zero-Out.
- Noch keine ausführbaren Priority-/Exclusive-/Normalized-Overlap-Modi.
- Parent-Regionen sind im Datenvertrag enthalten; die Editor-UI bietet dafür noch keinen Hierarchie-Selektor.
- Die SVG-Live-Vorschau nähert den Hardness-Verlauf mit einem Blur an; die Python-Maskenberechnung bleibt die maßgebliche Ausgabe.
- Hintergrund-Historie lebt nur in der aktuellen Browser-Session.

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
- `BV Regional Anima Adapter`: kompiliert Global, Background und beliebig viele aktivierte Regionen zu einer `ANIMA_CONDITIONING_REGIONS`-Kette für das optionale NodePack `Comfyui-Anima-Regional-Conditioning`. Dadurch entfallen einzelne CLIP-Encode-, Mask-Render- und `Anima Conditioning Region`-Nodes pro Region. `positive` und `negative` gehen an den normalen KSampler; `regions` und optional `background` an `Apply Anima Regional Conditioning Patch`. Der Adapter enthält bewusst keinen kopierten Attention-Patcher.
- `BV Regional Anima Conditioning`: eigenständiger Hauptpfad ohne Laufzeitabhängigkeit vom externen Anima-NodePack. Die Node kompiliert das Dokument, patcht ein validiertes Anima-Modell intern und gibt `patched_model`, `positive` und `negative` für einen normalen KSampler aus. Die Attention-Implementierung basiert unter MIT-Hinweis auf `Comfyui-Anima-Regional-Conditioning` und verwendet einen BV-spezifischen Wrapper-Key.
- `BV Regional Preview Send` (interne kompatible Klassenkennung `BV Regional Image Send`): sendet ein temporäres Preview-Ergebnis an den Editor eines ausgewählten `BV Regional Prompt`. Die sichtbare Auswahl verwendet Node-Titel und Node-ID, während intern die stabile `document_id` gespeichert wird. Bei mehreren ausgeführten Sendern gewinnt das zuletzt beim Frontend eingetroffene Ergebnis; entfernte Ziele werden nicht stillschweigend auf ein anderes Dokument umgebogen.
- `BV Regional Save Send` (interne Klassenkennung `BV Regional Image Save`): speichert das Bild regulär im ComfyUI-Output, sendet dasselbe gespeicherte Ergebnis an den ausgewählten Editor und reicht das Bild am Ausgang weiter. Zielauflösung und Last-Sender-Wins-Semantik entsprechen der Preview-Variante.
  Das modellbezogene Backend wird erst beim Ausführen dieser Node importiert. Fehlende optionale Abhängigkeiten oder inkompatible ComfyUI-Patcher-Schnittstellen dürfen deshalb nicht die Registrierung des übrigen BV NodePacks verhindern.
- `BV Regional Image Send`: IMAGE-Passthrough, das eine temporäre Preview an eine `document_id` sendet. Pro Dokument gewinnt die zuletzt ausgeführte Sender-Node.

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

`BV Regional Image Send` speichert ausschließlich eine ComfyUI-Temp-Preview. Die Browser-Session ordnet das letzte Ergebnis anhand der `document_id` zu. Das Bild wird nicht in `BV_REGIONAL` und nicht als Base64 im Workflow persistiert. Ein Workflow-Reload beginnt daher absichtlich ohne Sender-Hintergrund, bis die Sender-Node erneut ausgeführt wird.

## Geplante Editor-Erweiterungen

### Prompt-Schnellbearbeitung

Ohne den vollständigen Editor zu öffnen, soll eine kompakte Prompt-Palette erreichbar sein. Sie bietet direkte Ziele für Global, Background und jede Region und zeigt jeweils Positive und Negative als editierbare Textfelder. Die Zielauswahl verwendet sichtbare Namen, speichert intern jedoch stabile IDs. Änderungen laufen durch dieselbe Validierungs-, AST- und Undo-Pipeline wie Änderungen im vollständigen Editor; es entsteht keine zweite Prompt-Datenquelle.

Die Schnellbearbeitung soll sowohl über die jeweilige `BV Regional Prompt`-Node als auch über die globale Action-Bar-Oberfläche für das aktuell gewählte Dokument erreichbar sein. Bei mehreren Editor-Nodes muss vor dem Bearbeiten eindeutig sichtbar sein, welches Dokument aktiv ist.

### Autovervollständigung und Textassistenz

Die Promptfelder verwenden `BV Global Completion`, ein nodepack-weites Completion-Modul mit austauschbarer Suggestion-Provider-Schnittstelle. Dieselbe Engine integriert neben BV React-Editoren auch geeignete klassische ComfyUI- und Nodes-2.0-Multiline-Widgets, sodass Benutzer kein zweites Completion-System benötigen. Details und Integrationsverträge stehen in `docs/specs/bv-global-completion.md`.

`comfy-ex-tagcomplete` und vergleichbare Widget-Extensions können abgekoppelte React-/Floating-Textfelder nicht über einen gemeinsamen stabilen nativen Opt-in-Hook registrieren. BV emuliert deshalb weder Node-DOM noch importiert es private Frontendklassen fremder Extensions. Normale `<textarea>`-Semantik und bubbling `input`-Events bleiben für allgemeine Interoperabilität erhalten. Bridges zu einzelnen Fremdsystemen sind außerhalb des MVP als optionale Adapter denkbar, dürfen aber weder Kernfunktion noch lokales Datenformat bestimmen.

Das Completion-System wird von Beginn an für weitere Providerklassen vorbereitet: lokale Tagdaten, Embeddings, LoRAs, Wildcards, AST-/Kontextvorschläge sowie später Rechtschreib-, Übersetzungs- oder Sprachassistenz. Vorschläge verändern den kanonischen Prompt niemals ohne explizite Benutzerübernahme und jede Übernahme muss über den normalen Editor-Undo-Pfad rückgängig sein.

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

Vor dem ersten Release noch interaktiv in ComfyUI prüfen:

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

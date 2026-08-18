# BV Regional -> Ideogram 4 JSON

Stand: 2026-08-18
Status: Architektur- und Implementierungsrecherche, noch keine Implementierung

## Kurzfazit

Ein Export ist sinnvoll und technisch gut machbar, aber **kein verlustfreier Formatwechsel**. Ideogram 4 versteht strukturierte Beschreibungen mit optionalen rechteckigen Bounding Boxes; `BV_REGIONAL` beschreibt dagegen echte Masken aus Rechtecken, Brush-Strokes, Rastermasken und Add/Subtract-Operationen.

Ein MVP als `BV Regional Ideogram 4 Export` Node genügt, wenn er:

1. nur das offizielle Ideogram-Koordinatensystem ausgibt,
2. Geometrieverluste über eine explizite Strategie behandelt,
3. einen maschinenlesbaren/lesbaren Conversion-Report ausgibt,
4. Negative Prompts und BV-Maskenparameter nicht stillschweigend als unterstützt darstellt,
5. Style-, Text-Element- und Palette-Metadaten als eigene Exportoptionen erhält.

Die bestehende Regional-Editor-UI muss dafür nicht dupliziert werden. Für eine gute statt nur minimale Integration sind jedoch Compileroptionen beziehungsweise ein kleines `BV_IDEOGRAM4_OPTIONS`-Objekt empfehlenswert.

## Verifizierte Primärquellen

- [Offizieller Ideogram-4 Prompting Guide, Commit `990fe1c`](https://github.com/ideogram-oss/ideogram4/blob/990fe1c4e950bb9e9dc90e01c0ad98ba434f83c2/docs/prompting.md)
- [Offizielle Ideogram-4 Inference-Dokumentation, Commit `990fe1c`](https://github.com/ideogram-oss/ideogram4/blob/990fe1c4e950bb9e9dc90e01c0ad98ba434f83c2/docs/inference.md)
- [Offizieller Ideogram-4 Caption-Verifier, Commit `990fe1c`](https://github.com/ideogram-oss/ideogram4/tree/990fe1c4e950bb9e9dc90e01c0ad98ba434f83c2/src/ideogram4)
- [Offizielle Ideogram-4 Modelllizenz, Commit `990fe1c`](https://github.com/ideogram-oss/ideogram4/blob/990fe1c4e950bb9e9dc90e01c0ad98ba434f83c2/model_licenses/LICENSE-IDEOGRAM-4-NON-COMMERCIAL)
- [ComfyUI `BuildJsonPromptIdeogram`, Commit `72865f4`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy_extras/nodes_json_prompt.py#L7-L67)
- [ComfyUI Ideogram Bounding-Box-Konvertierung, Commit `72865f4`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy_extras/nodes_bounding_boxes.py#L206-L231)
- [ComfyUI Ideogram Element Builder, Commit `72865f4`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy_extras/nodes_bounding_boxes.py#L276-L315)
- [KJNodes Ideogram 4 Prompt Builder, Commit `3f20054`](https://github.com/kijai/ComfyUI-KJNodes/blob/3f20054214fec9f9234fd3841ae6f1e4287948f6/nodes/ideogram4_nodes.py)
- Projektvertrag: [`schemas/bv_regional_v1.schema.json`](../../schemas/bv_regional_v1.schema.json)

Die GitHub-Links sind auf konkrete Commits gepinnt. Der lokal untersuchte KJNodes-Stand meldet Paketversion `1.5.0`; das installierte Verzeichnis enthält selbst keine Git-Metadaten.

## Exaktes Ideogram-4 Caption-Schema

Ideogram 4 wurde laut offiziellem Prompting Guide ausschließlich mit strukturierten JSON-Captions trainiert. Das Caption-Objekt wird lokal als **kompakter JSON-String** an die Pipeline übergeben. Die Feldreihenfolge ist Teil des trainierten Vertrags und wird durch den offiziellen `CaptionVerifier` geprüft.

```json
{
  "high_level_description": "Optional, aber stark empfohlen",
  "style_description": {
    "aesthetics": "...",
    "lighting": "...",
    "medium": "illustration",
    "art_style": "...",
    "color_palette": ["#112233", "#AABBCC"]
  },
  "compositional_deconstruction": {
    "background": "Pflichtfeld",
    "elements": [
      {
        "type": "obj",
        "bbox": [100, 50, 900, 475],
        "desc": "...",
        "color_palette": ["#AABBCC"]
      },
      {
        "type": "text",
        "bbox": [50, 700, 150, 950],
        "text": "LITERAL TEXT",
        "desc": "..."
      }
    ]
  }
}
```

### Top-Level

| Feld | Vertrag |
|---|---|
| `high_level_description` | Optionaler String, ein bis zwei Sätze, stark empfohlen. |
| `style_description` | Optionales Objekt. Wenn vorhanden, müssen die unten beschriebenen Pflichtfelder vollständig und geordnet vorliegen. |
| `compositional_deconstruction` | Pflichtobjekt; enthält zwingend zuerst `background`, dann `elements`. |

### Style

`style_description` enthält genau eine der Varianten:

- Photo: `aesthetics`, `lighting`, `photo`, `medium`, optional zuletzt `color_palette`
- Non-photo: `aesthetics`, `lighting`, `medium`, `art_style`, optional zuletzt `color_palette`

Die globale Palette erlaubt bis zu 16 Farben. Farben sind uppercase `#RRGGBB`.

### Elemente

- Objekt: `type`, optional `bbox`, `desc`, optional `color_palette`
- Text: `type`, optional `bbox`, `text`, `desc`, optional `color_palette`
- Die Elementpalette erlaubt bis zu 5 Farben.
- `bbox` darf fehlen; das Element ist dann semantisch beschrieben, aber nicht räumlich platziert.
- Unbekannte Felder und falsche Reihenfolgen führen beim offiziellen Verifier zu Warnungen und können die Qualität verschlechtern.

### Serialisierung

Die offizielle Empfehlung lautet sinngemäß:

```python
json.dumps(caption, separators=(",", ":"), ensure_ascii=False)
```

Das bedeutet: kompakt, UTF-8-Zeichen nicht unnötig als `\uXXXX` escapen und Einfügereihenfolge der Dictionaries erhalten.

## Koordinaten-, Canvas- und BBox-Semantik

Standard-Ideogram-BBox:

```text
[y_min, x_min, y_max, x_max]
```

- Beide Achsen sind unabhängig auf Ganzzahlen `0..1000` normalisiert.
- Ursprung ist links oben.
- `x` wächst nach rechts, `y` nach unten.
- `bbox` beschreibt eine Platzierungs-/Kompositionsvorgabe, keine harte Pixelmaske.
- Die gleiche normalisierte Box hat bei unterschiedlichen Canvas-Seitenverhältnissen eine andere physische Form.

Für einen BV-Rechtecklayer mit normalisierten Werten ergibt sich:

```text
y_min = round(clamp(y, 0, 1) * 1000)
x_min = round(clamp(x, 0, 1) * 1000)
y_max = round(clamp(y + height, 0, 1) * 1000)
x_max = round(clamp(x + width, 0, 1) * 1000)
```

`canvas.width` und `canvas.height` gehören nicht in die Caption. Sie werden als separate Generierungsparameter verwendet. Ideogram 4 unterstützt laut offizieller Inference-Dokumentation Breite und Höhe als Vielfache von 16, je `256..2048`, und Seitenverhältnisse bis `6:1` beziehungsweise `1:6`. Der Exporter sollte daher:

- BV-Größe separat ausgeben,
- bei nicht unterstützter Größe warnen oder optional auf ein gültiges Vielfaches von 16 clampen,
- **nicht** auf absolute Pixelkoordinaten oder `[x_min,y_min,x_max,y_max]` umschalten.

KJNodes bietet zwar non-standard `absolute` und `xy` für andere Tools an; diese Modi sind für einen Ideogram-4-Exporter bewusst nicht zu übernehmen.

## Background, Main Prompt, Objekte und Textregionen

- BV `prompts.global.positive_source` passt semantisch zu `high_level_description`.
- BV `prompts.background.positive_source` passt zu `compositional_deconstruction.background`.
- Ein aktiviertes BV-Region-Prompt passt zu einem Ideogram-Element `desc`.
- BV kennt aktuell keinen expliziten Ideogram-Elementtyp und kein Feld für den literal zu rendernden Text. Deshalb muss der Default `type: "obj"` sein.
- `type: "text"` darf nicht aus Tag-Namen oder AST-Kategorien erraten werden. Dafür braucht es eine explizite per-Region-Override-Konfiguration mit `type`, `text` und optionaler Palette.
- Die Editorfarbe `region.authoring.color` ist eine reine Anzeigeeigenschaft. Sie darf **nicht** automatisch als Ideogram `color_palette` interpretiert werden.

## Overlap und Reihenfolge

Ideogram erlaubt sich überschneidende Bounding Boxes. Es gibt aber weder `overlap.mode` noch ein dokumentiertes mathematisches Blend-, Joint-, Exclusive- oder Priority-Verfahren.

ComfyUIs offizieller Bounding-Box-Editor beschreibt seine Liste als Background-zuerst und Foreground-zuletzt. KJNodes zeigt dieselbe Front/Back-Reihenfolge im Editor. Daraus darf nur folgende vorsichtige Abbildung abgeleitet werden:

- Overlap selbst: durch überlappende `bbox` darstellbar.
- BV `joint`: **approximiert** durch gleichzeitig vorhandene, überlappende Elemente.
- BV `priority`: nur approximiert durch Elementreihenfolge; keine garantierte Konfliktauflösung.
- BV `normalized` und `exclusive`: nicht abbildbar.

Wenn nach BV-Priorität sortiert wird, sollte P0 als höchste Priorität zuletzt/weiter im Vordergrund ausgegeben werden. Eine stabile Sortierung wäre `priority` absteigend und innerhalb gleicher Priorität in Dokumentreihenfolge. Diese Sortierung muss eine Option bleiben, weil die offizielle Ideogram-Spezifikation keine Prioritätsgarantie für Arrayreihenfolge formuliert.

## Vollständiges BV-Feldmapping

Legende: **L** = verlustfrei, **A** = approximiert/optional, **N** = nicht im Ideogram-Schema darstellbar.

| BV-Feld | Ziel / Verhalten | Status |
|---|---|---|
| `schema`, `version` | Nur Eingabevalidierung; nicht exportieren. | L |
| `document_id`, `title` | Kein Ideogram-Feld; nur Report/Workflow-Metadaten. | N |
| `canvas.width`, `canvas.height` | Separate Node-Ausgänge/Generierungsparameter, nicht Caption. | L bis Ideogram-Limits, sonst A |
| `prompts.global.positive_source` | `high_level_description`. | L für Text, nicht zwingend gleiche Modellwirkung |
| `prompts.background.positive_source` | `compositional_deconstruction.background`. | L für Text |
| Global/background `negative_source` | Kein Caption-Feld; separat an negative Conditioning weitergeben. | N im JSON |
| `negative_mode` | Betrifft separaten Conditioning-Pfad, nicht Ideogram JSON. | N im JSON |
| `overlap.mode=joint` | Überlappende Elemente ohne expliziten Modus. | A |
| `overlap.mode=normalized/priority/exclusive` | Kein Schemaäquivalent. | N; allenfalls Reihenfolge/Maskenzerlegung als A |
| `region.id`, `name` | Stabiler Compiler-/Report-Key; nicht in Caption einbetten. | N im JSON |
| `parent_region_id` | Hierarchie wird flach; kein Schemaäquivalent. | N |
| `region.enabled` | Disabled Region weglassen. | L |
| `region.strength` | Kein Elementgewicht. Optional nur als Include-Schwelle nutzen, sonst warnend ignorieren. | N |
| `region.priority` | Optionale Elementreihenfolge. | A |
| `region.prompts.positive_source` | Element `desc`. | L für Text |
| `region.prompts.negative_source` | Kein Element-Negativfeld; separat aggregieren oder warnen. | N im JSON |
| `mask.feather` | Ideogram-BBox hat keine Feather-Semantik. | N |
| `authoring.visible` | UI-Sichtbarkeit darf Sampling nicht verändern; ignorieren. | L als Authoring-Vertrag |
| `authoring.locked` | Nur Authoring; ignorieren. | L als Authoring-Vertrag |
| `authoring.color` | Nur Editoranzeige; nicht als Promptfarbe verwenden. | N im JSON |
| Geometrie `enabled` | Disabled Geometrie bei Maskenberechnung ignorieren. | L |
| Geometrie `authoring`, IDs, Namen | Nur Editor/Report; nicht exportieren. | N im JSON |
| Ein einzelnes additives `rect` | Direkt zu einer `bbox`. | L |
| Mehrere additive Rechtecke | Union-BBox oder mehrere Elemente. | A |
| `brush_stroke` | Gerenderte Maske auf BBox/Komponenten reduzieren. | A |
| `raster_mask` | Alpha-Maske auf BBox/Komponenten reduzieren. | A |
| `operation: subtract` | Vor der BBox-Ermittlung in finale BV-Maske einrechnen; Loch/Kontur geht verloren. | A/N |
| Brush `size`, `shape`, `hardness`, `opacity`, `pressure_mode`, `points` | Nur zur Maskenrasterisierung; nicht im Ziel vorhanden. | N nach Rasterisierung |

## Prompt AST

Ideogram erwartet Plaintext-Strings in den Caption-Feldern, kein BV Prompt AST. Daher:

- AST vor dem Export über den vorhandenen deterministischen BV-Renderer zu Text flatten.
- Original-Source verwenden, wenn kein AST benötigt/erzeugt wurde.
- AST-Struktur, Kategorien und Detailer-Semantik werden im Ideogram JSON nicht erhalten.
- Optional kann der Node das unveränderte AST als separaten Passthrough-Ausgang anbieten; es darf nicht als unbekanntes Caption-Feld eingebettet werden.

Das ist Textkonvertierung, keine geometrische AST-Semantik.

## Empfohlene Geometrie-Compilerstrategien

Der Exporter sollte mindestens diese Strategie anbieten:

### `region_union_bbox` (empfohlener Default)

1. Effektive BV-Maske einer Region aus allen enabled Add/Subtract-Layern rendern.
2. Sichtbare Pixel oberhalb eines festen Alpha-Schwellwerts bestimmen.
3. Eine enge Bounding Box um die gesamte resultierende Maske bilden.
4. Ein Element pro BV-Region ausgeben.

Vorteil: Eine Region bleibt genau ein semantisches Objekt.

Nachteil: L-förmige Bereiche, Löcher und weit getrennte Inseln werden grob umfasst.

### `connected_components`

Die finale Maske rasterisieren und jede zusammenhängende sichtbare Insel als eigenes Element mit wiederholter `desc` ausgeben.

Vorteil: bessere räumliche Abdeckung.

Nachteil: Ideogram kann die wiederholte Beschreibung als mehrere Objekte interpretieren; daher nicht Default.

### `geometry_boxes`

Jedes additive Rechteck beziehungsweise jede Layer-BBox als eigenes Element ausgeben; Subtract nur in einem vorherigen Maskenschritt berücksichtigen.

Vorteil: leicht nachvollziehbar.

Nachteil: semantische Duplikation und für Brushes kaum sinnvoll.

### `unplaced`

Nur ein Element ohne `bbox` ausgeben, wenn die Geometrie nicht zuverlässig reduziert werden kann.

Vorteil: semantischer Prompt bleibt erhalten.

Nachteil: keine räumliche Steuerung.

### Strikte Fehleroption

`strict_geometry=true` sollte bei allem außer einem einzelnen additiven Rechteck abbrechen. Das ist für Tests und reproduzierbare Workflows wertvoll, aber zu streng als UX-Default.

## Negative Prompts

Die Ideogram-Caption besitzt weder globale noch elementbezogene Negative-Prompt-Felder. Eine Eigenkreation wie `negative_desc` wäre schemafremd und würde Verifier-Warnungen erzeugen.

Empfehlung:

- JSON bleibt ausschließlich positiv.
- Der Exporter gibt zusätzlich `negative_text` und optional `negative_ast` aus oder verweist auf den existierenden BV-Deconstructor.
- Globales und Background-Negativ sowie Regionsnegative werden nur nach einer expliziten Policy aggregiert (`global_only`, `all_enabled`, `none`).
- `negative_mode=zero_out` bleibt Aufgabe des Modell-Conditioning-Adapters.
- Der Conversion-Report nennt jedes nicht exportierte Negative-Prompt-Feld.

## Vorgeschlagene Node-Schnittstelle

### Inputs

- `regional: BV_REGIONAL`
- `options: BV_IDEOGRAM4_OPTIONS` optional
- alternativ für MVP direkt als Widgets:
  - `geometry_strategy = region_union_bbox`
  - `alpha_threshold = 0.01`
  - `order_strategy = document | priority_foreground_last`
  - `strict_geometry = false`
  - `style = none | photo | art_style`
  - Stylefelder und globale Palette
  - `region_overrides_json` für `type`, `text`, `desc`, `color_palette`

### Outputs

- `prompt: STRING` — kompakter Ideogram-JSON-String für lokale Text-Encoding-Pipelines
- `prompt_dict: DICT` — optional für offizielle ComfyUI-/API-nahe Verarbeitung
- `width: INT`, `height: INT`
- `negative_text: STRING` optional
- `report: STRING` oder eigener Report-Type

Der Node sollte niemals unbekannte BV-Metadaten in die Caption kopieren.

## Import und Round-Trip

KJNodes kann JSON strikt lesen und versucht danach eine begrenzte Reparatur (äußeres Objekt extrahieren, trailing commas entfernen). Beim autoritativen wired Import wird das gelesene Caption-Dictionary unverändert durchgereicht. Sobald die Caption jedoch in Editorboxen zerlegt und neu aufgebaut wird, bleiben nur die bekannten Ideogram-Felder erhalten.

Konsequenzen:

- BV -> Ideogram -> KJNodes ist für bekannte Caption-Felder interoperabel.
- Ideogram -> BV -> Ideogram ist kein verlustfreier Round-Trip, solange BV keine expliziten Felder für Texttyp, literal Text, Paletten und Style besitzt.
- Ein späterer Importer sollte fremde Caption-Metadaten entweder in einem klar benannten Extension-Bereich des BV-Dokuments erhalten oder bewusst verwerfen; niemals unsichtbar in Prompttext codieren.

## Versions- und Qualitätsrisiken

1. Offizielle ComfyUI Ideogram-Nodes sind derzeit als experimental markiert.
2. Key Order ist modellrelevant; generische JSON-Sortierung (`sort_keys`) ist zu vermeiden.
3. KJNodes unterstützt aus Interoperabilitätsgründen non-standard absolute/xy Modi. Unser Ideogram-Exporter sollte nur official normalized/yx erzeugen.
4. Ein Element pro Maskeninsel kann unbeabsichtigte Objektduplikate verursachen.
5. Bounding Boxes sind Attention-/Layout-Hinweise, keine harte Inhaltsmaske. Ergebnisgrenzen können von den Boxen abweichen.
6. `high_level_description`, Regionsbeschreibungen und Background können sich semantisch widersprechen; der Compiler kann das erkennen/warnen, aber nicht zuverlässig auflösen.
7. Modell- und API-Verträge können nach dem gepinnten Stand weiterentwickelt werden. Schema-Version und Source-Commit sollten im Exportreport stehen, nicht in der Caption.

## Lizenz und Clean-room

- BV Node Pack ist GPL-3.0.
- Der lokal untersuchte KJNodes-Code ist ebenfalls GPL-3.0. Direkte Übernahme wäre damit grundsätzlich nur unter Erfüllung der GPL- und Notice-/Attributionspflichten vertretbar.
- Für diese Funktion ist keine Quellcodeübernahme nötig: Feldnamen, Koordinaten und Schema sind im offiziellen Ideogram-Prompting-Vertrag und in ComfyUIs offizieller Implementierung dokumentiert.
- Empfohlen ist eine eigene Implementierung gegen diesen öffentlichen Datenvertrag, mit eigenen Tests und eigener Masken-Compilerlogik. KJNodes wird als Interoperabilitätsreferenz und Inspiration genannt, nicht als Codequelle kopiert.
- Die Ideogram-Inference-Codebasis steht getrennt von den Modellgewichten. Die Ideogram-4-Gewichte unterliegen dem **Ideogram Non-Commercial Model Agreement**. Der Exporter selbst kann ohne Gewichte verteilt werden; Download und Nutzung der Gewichte müssen separat auf deren Lizenz verweisen. Diese Einschätzung ist keine Rechtsberatung.

## Entscheidung

**Implementieren:** `BV Regional Ideogram 4 Export` als eigenständigen Compiler-Node, ohne zweiten Regioneneditor.

**MVP-Default:**

- positives globales Prompt -> `high_level_description`
- Background positive -> `background`
- enabled Region -> `obj`
- finale Regionsmaske -> `region_union_bbox`
- Dokumentreihenfolge beibehalten
- Style `none`
- kompakter UTF-8 JSON-String plus `DICT`, Dimensionen und Conversion-Report
- jede verlorene Semantik explizit im Report

**Direkt vorsehen, aber nicht zwingend im ersten UI ausbauen:**

- per-Region `text`/Palette Overrides
- Style Options Type
- Connected-components Strategie
- Priority-as-order Strategie
- Negative-Text-Ausgang

Damit bleibt der BV-Editor modellneutral, während Ideogram-spezifische Caption-Semantik an einer klaren Adaptergrenze sitzt.

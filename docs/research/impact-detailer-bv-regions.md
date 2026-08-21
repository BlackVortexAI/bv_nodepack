# BV-Regionen als Eingabe fuer Impact-Detailer

## Untersuchungsrahmen

Diese Notiz prueft, ob der BV Regional Editor vorhandene Detailer aus Impact Pack
unterstuetzen kann, ohne einen eigenen Detailer zu implementieren. Untersucht wurden
am 20. August 2026 die folgenden `main`-Snapshots:

- [ComfyUI-Impact-Pack `429d015`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/tree/429d0159ad429e64d2b3916e6e7be9c22d025c3c)
- [ComfyUI-Impact-Subpack `50c7b71`](https://github.com/ltdrdata/ComfyUI-Impact-Subpack/tree/50c7b71a6a224734cc9b21963c6d1926816a97f1)
- [ComfyUI-Inspire-Pack `d23db9a`](https://github.com/ltdrdata/ComfyUI-Inspire-Pack/tree/d23db9aa544de9a6d4c609cb7005fa9e0d42031d)

Alle Aussagen ueber die Fremdpakete beziehen sich auf diese unveraenderten
Snapshots. Architekturfolgerungen fuer BV sind gesondert gekennzeichnet.

## Kurzfazit

BV-Regionen koennen vorhandene Impact-Detailer bereits sinnvoll steuern. Der
stabilste Vertrag ist die generische ComfyUI-`MASK`, die `BV Regional Mask` schon
ausgibt. Zwei offizielle Impact-Pfade nehmen sie entgegen:

1. direkt: `BV Regional Mask -> MaskDetailer (pipe)`;
2. mit mehr Kontrolle: `BV Regional Mask -> MASK to SEGS -> Detailer (SEGS)`.

Ein dritter, besonders sinnvoller Pfad laesst den Gesichtsdetektor aktiv und nutzt
die BV-Region nur als raeumliches Gate:

`BBOX Detector (SEGS) -> Pixelwise(SEGS & MASK) -> Detailer (SEGS)`.

Der `FaceDetailer` selbst hat dagegen keinen externen `MASK`-, Bounding-Box- oder
`SEGS`-Eingang. Ihn um BV-Regionen zu erweitern wuerde einen Impact-spezifischen
`BBOX_DETECTOR`-Adapter oder einen Fork erfordern und ist nicht zu empfehlen.

## Bestaetigte Vertrage

### BV liefert den benoetigten neutralen Vertrag bereits

`BV Regional Select` beziehungsweise `BV Regional Deconstructor` erzeugen eine
Auswahl. `BV Regional Mask` rendert diese Auswahl in der gewuenschten Bildgroesse
und gibt `MASK`, `x`, `y`, `width` und `height` aus. Damit kann eine benannte
BV-Region ohne Impact-Abhaengigkeit in dessen offizielle Maskenpfade eingespeist
werden. Der aktuelle BV-Vertrag liegt in
[`py/nodes/bv_regional.py`](../../py/nodes/bv_regional.py) und die Bounding-Box-
Berechnung in
[`py/util/regional/mask_renderer.py`](../../py/util/regional/mask_renderer.py).

Die Rendergroesse muss der Bildgroesse entsprechen, die detailliert wird. Eine
Region aus dem Generations-Canvas sollte daher fuer das tatsaechliche Detailer-Bild
neu gerendert und nicht als bereits gerasterte Maske blind weitergereicht werden.

### `MaskDetailer (pipe)`: direktester Integrationspfad

`MaskDetailerPipe` verlangt `image: IMAGE`, `mask: MASK` und `basic_pipe:
BASIC_PIPE` sowie Guide-, Sampling-, Feather-, Crop- und Cycle-Parameter. Intern
konvertiert er die Maske mit `mask_to_segs(..., combined=False, ...)` in `SEGS` und
ruft danach den normalen `DetailerForEach` auf. Image-Batches werden abgelehnt.
[Quellcode](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L1738-L1838)

Dieser Pfad eignet sich, wenn eine einzelne BV-Auswahl genau den Bereich beschreibt,
der nachbearbeitet werden soll. Er benoetigt weder eigene `SEGS` noch einen
Detektor. `mask_mode=masked only` beschraenkt Noise/Paste auf die Maske; die Crop-
Groesse wird weiterhin aus deren Geometrie und `crop_factor` abgeleitet.

### `MASK to SEGS`: offizielle Bruecke fuer komplexere Workflows

`MaskToSEGS` nimmt `mask: MASK`, `combined`, `crop_factor`, `bbox_fill`,
`drop_size` und `contour_fill` entgegen und gibt `SEGS` aus.
[Node-Vertrag](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/segs_nodes.py#L1334-L1357)

Die Core-Implementierung zeigt die wichtige Semantik:

- `combined=True` erzeugt ein Segment um alle Pixel ungleich null;
- `combined=False` erzeugt ein Segment je aeusserer Kontur;
- `drop_size` entfernt kleine Komponenten;
- `crop_factor` vergroessert den Crop um die erkannte Bounding Box;
- das Standardlabel ist fuer alle erzeugten Segmente `A`.

[Implementierung](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/core.py#L1296-L1387)

`SEGS` ist kein einfacher Bounding-Box-Typ. Der Vertrag lautet
`((height, width), [SEG, ...])`; ein `SEG` enthaelt `cropped_image`,
`cropped_mask`, `confidence`, `crop_region`, `bbox`, `label` und
`control_net_wrapper`.
[Definition](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/core.py#L46-L48)

BV sollte diesen internen Python-Vertrag nicht selbst nachbauen. `MASK to SEGS`
ist die robuste Kompatibilitaetsgrenze.

### Zwei Detailer-Pfade fuer fertige `SEGS`

`DetailerForEach`, im UI `Detailer (SEGS)`, nimmt `image`, `segs`, Model/CLIP/VAE,
Conditionings und Detailparameter entgegen und gibt das fertige Vollbild aus. Er
skaliert `SEGS` auf die Bildgroesse, iteriert die Segmente, croppt am
`crop_region`, nutzt `cropped_mask` fuer Noise und Compositing und kann maskierte
Conditionings passend zum Crop zuschneiden. Image-Batches sind nicht erlaubt.
[Node und Verarbeitung](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L215-L430)

`SEGSDetailer` nimmt ebenfalls `image` und `segs`, gibt aber bearbeitete `SEGS`
statt eines fertig komponierten Vollbilds aus. Anschliessend ist `SEGSPaste`
erforderlich. Dieser zweistufige Pfad ist sinnvoll, wenn zwischen Detailing und
Paste noch SEGS-Operationen stattfinden sollen.
[SEGSDetailer](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/segs_nodes.py#L31-L168)
und
[SEGSPaste](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/segs_nodes.py#L170-L231)

### `FaceDetailer`: keine externe Regionsschnittstelle

`FaceDetailer` verlangt einen `BBOX_DETECTOR`; optionale Verfeinerer sind
`SAM_MODEL` und `SEGM_DETECTOR`. Es gibt keinen `MASK`-, `bbox`- oder `SEGS`-
Eingang.
[Inputs](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L735-L793)

Intern ruft der Node immer `bbox_detector.detect(...)` auf, schneidet die Treffer
optional mit SAM beziehungsweise einem Segmentierungsdetektor und uebergibt die
entstandenen `SEGS` an `DetailerForEach`.
[Ablauf](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L795-L841)

Eine BV-Region kann dem `FaceDetailer` daher nicht direkt sagen: "Das Gesicht ist
hier." Ein eigener Provider koennte formal den `BBOX_DETECTOR`-Vertrag
implementieren, waere aber eine unnoetig enge Kopplung an Impact-Interna. Der
offizielle `SEGS`-Detailer bietet denselben nachgelagerten Verarbeitungspfad ohne
diese Kopplung.

### Detektion beibehalten, BV nur als raeumliches Gate

Impacts `Pixelwise(SEGS & MASK)` nimmt vorhandene Detektor-`SEGS` und eine externe
`MASK` entgegen.
[Node](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L1937-L1950)

Die Operation schneidet die Vollbildmaske fuer jedes vorhandene `crop_region` zu
und verknuepft sie mit dessen `cropped_mask`. Bounding Box, Crop, Label und
Confidence des Detektortreffers bleiben erhalten.
[Core](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/core.py#L1133-L1154)

Das ist fuer "Gesicht liegt in dieser Personenregion" meist besser als die BV-
Region selbst zum Gesicht zu erklaeren: Der Detektor bestimmt weiterhin die genaue
Gesichtsgeometrie, BV verhindert nur Treffer ausserhalb der vorgesehenen Zone. Die
Operation erzeugt keine neuen Treffer ausserhalb vorhandener Detektor-Bounding-
Boxes. Leer geschnittene Segmente bleiben im Bundle, werden vom Detailer wegen
leerer Maske aber uebersprungen.

### Labels und regionsspezifische Prompts

`MASK to SEGS` vergibt standardmaessig nur das Label `A`. Wenn mehrere BV-Regionen
unterschiedliche Detailer-Prompts erhalten sollen, kann jede Region separat nach
`SEGS` konvertiert, mit `SEGSLabelAssign` beschriftet und mit `SEGSConcat`
zusammengefuehrt werden.
[LabelAssign](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/segs_nodes.py#L475-L505)
und
[SEGSConcat](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/segs_nodes.py#L876-L902)

Der `Detailer (SEGS)` besitzt ausserdem einen `wildcard`-Eingang und verarbeitet
SEGS-Labels in seinem Wildcard-Modus. Das ist eine vorhandene Impact-Funktion, kein
Grund fuer einen BV-eigenen Detailer. Die genaue Wildcard-/Label-Syntax sollte in
einem Referenzworkflow separat verifiziert werden, bevor BV sie als festen Vertrag
dokumentiert.

## Rolle von Inspire und Impact Subpack

Inspire stellt keinen alternativen Detailer mit externem BV-Regionsvertrag bereit.
`Regional Prompt Simple` nimmt `BASIC_PIPE` plus `MASK` und erzeugt
`REGIONAL_PROMPTS` fuer Impacts Regional-Sampler-Infrastruktur.
[`RegionalPromptSimple`](https://github.com/ltdrdata/ComfyUI-Inspire-Pack/blob/d23db9aa544de9a6d4c609cb7005fa9e0d42031d/inspire/regional_nodes.py#L14-L79)

`Regional Prompt By Color Mask` erzeugt zusaetzlich eine `MASK`, und `Regional
Conditioning Simple` erzeugt maskiertes Standard-`CONDITIONING`.
[`regional_nodes.py`](https://github.com/ltdrdata/ComfyUI-Inspire-Pack/blob/d23db9aa544de9a6d4c609cb7005fa9e0d42031d/inspire/regional_nodes.py#L100-L158)
Diese Nodes koennen im selben Workflow nuetzlich sein, ersetzen aber weder
`MASK to SEGS` noch den Detailer-Eingang.

Impact Subpack liefert mit `UltralyticsDetectorProvider` lediglich die fuer Impact
passenden `BBOX_DETECTOR`- und `SEGM_DETECTOR`-Objekte aus einem Modellnamen. Es
enthaelt keine Regions- oder Detailer-Bruecke.
[`subpack_nodes.py`](https://github.com/ltdrdata/ComfyUI-Impact-Subpack/blob/50c7b71a6a224734cc9b21963c6d1926816a97f1/modules/subpack_nodes.py#L20-L65)

In keinem der drei untersuchten Repositories existiert ein Node namens
`PhraseDetailer` oder `Phrase Detailer`. Falls damit ein Node aus einem vierten Pack
gemeint ist, muss dessen Repository separat untersucht werden.

## Empfohlene BV-Strategie

### Jetzt: vorhandenen generischen Ausgang verwenden

Keine Aenderung am Detailer und kein eigener `SEGS`-Typ. Der bestehende
`BV Regional Mask`-Ausgang ist die richtige, paketneutrale Integrationsgrenze.

Empfohlene Workflows:

| Ziel | Workflow | Bewertung |
| --- | --- | --- |
| Eine bekannte Region detaillieren | `BV Regional Mask -> MaskDetailer (pipe)` | Minimal und robust |
| Mehrere Inseln/Regionen kontrollieren | je Region `MASK to SEGS`, optional labeln/concat, dann `Detailer (SEGS)` | Beste Erweiterbarkeit |
| Gesicht innerhalb einer Personenzone finden | Detektor-`SEGS -> Pixelwise(SEGS & MASK) -> Detailer (SEGS)` | Fachlich bevorzugt |
| Vorhandenen `FaceDetailer` direkt fuettern | Nicht moeglich | Nicht verfolgen |

### Optional spaeter: Komfort statt neuer Detailer

Falls die manuelle Verkabelung mehrerer Regionen zu aufwendig wird, waere eine
optionale BV-Komfort-Node vertretbar, die mehrere benannte Auswahlen als einzelne
`MASK`-Ausgaenge beziehungsweise als neutrales Listenmodell bereitstellt. Eine
direkte Ausgabe von Impacts internem `SEGS` sollte nur in einer klar optionalen
Integration liegen und `ComfyUI-Impact-Pack` nicht zur Kernabhaengigkeit des BV
Regional Editors machen.

Vor einer solchen Komfortfunktion sollten drei reale Workflows verifiziert werden:

1. eine BV-Personenregion als Gate fuer einen Face-BBOX-Detektor;
2. zwei benannte Regionen mit unterschiedlichen Impact-Wildcard-/Label-Prompts;
3. eine Region mit mehreren getrennten Maskeninseln bei `combined=True` und
   `combined=False`.

## Entscheidung

Das IST-System muss nicht unveraendert bleiben, aber die Verbesserung gehoert in
die Workflow-Komposition, nicht in einen neuen Detailer. BV schafft Mehrwert durch
praezise, benannte und reproduzierbare Masken. Impact bleibt fuer Detektion,
`MASK -> SEGS`, Cropping, Inpainting und Compositing verantwortlich.

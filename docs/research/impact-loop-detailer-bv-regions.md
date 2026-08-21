# Impact-Loop-Nodes fuer sequenzielle BV-Detailer-Regionen

## Untersuchungsrahmen

Diese Notiz prueft, ob die offiziellen Loop-/Logic-Nodes des
`ComfyUI-Impact-Pack` mehrere vom BV Regional Editor markierte Detailer-Regionen
sequenziell auf dasselbe Bild anwenden koennen. Untersucht wurde am 20. August
2026 der bereits fuer die Impact-Integration festgehaltene `main`-Snapshot:

- [ComfyUI-Impact-Pack `429d015`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/tree/429d0159ad429e64d2b3916e6e7be9c22d025c3c)

Die Aussagen beziehen sich auf den offiziellen Quellcode, dessen README und das
offizielle `loop-test.json`. Es wurde kein Laufzeittest in ComfyUI ausgefuehrt.

## Kurzfazit

Die Impact-Loop-Idee ist als Referenz interessant, aber **nicht die geeignete
Ausfuehrungsbasis fuer einen BV Multi-Region Detailer**.

Impact besitzt keine Nodes namens `Loop Start` und `Loop End` und auch keinen
gekapselten Schleifenkoerper. Das offizielle Loop-Beispiel wiederholt vielmehr den
gesamten Workflow ueber ComfyUIs **Auto Queue**. Werte und Bilder werden dabei
ueber Frontend-Ereignisse in Receiver-Widgets fuer den naechsten Prompt geschrieben;
`ImpactConditionalStopIteration` beendet lediglich Auto Queue. Das ist eine Folge
separater Prompt-Ausfuehrungen, keine dynamische Schleife innerhalb eines Prompts.
[README](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/README.md#L453-L483)
· [offizieller Loop-Workflow](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/tests/workflows/loop-test.json)

Technisch koennte BV so je Queue-Lauf genau eine Region waehlen, das zuletzt
detaillierte Bild per `Image Sender`/`Image Receiver` rueckfuehren und nach der
letzten Region Auto Queue stoppen. Diese Loesung waere jedoch frontend- und
widget-zustandsabhaengig, speichernd statt tensorintern, API-ungeeignet, schwer
abzubrechen beziehungsweise wiederaufzunehmen und nicht atomar. Sie sollte daher
nicht als Produktvertrag des BV Editors verwendet werden.

## Welche „Loop-Nodes“ tatsaechlich existieren

Die registrierten Node-Namen und UI-Anzeigen sind:

| Registrierter Name | UI-Name / Rolle | Inputs | Outputs |
| --- | --- | --- | --- |
| `ImpactValueSender` | Value Sender | `value: *`, `link_id: INT`, optional `signal_opt: *` | `signal: *` |
| `ImpactValueReceiver` | Value Receiver | `typ: STRING|INT|FLOAT|BOOLEAN`, `value: STRING`, `link_id: INT` | `*` |
| `ImpactConditionalStopIteration` | Conditional Stop Iteration | `cond: BOOLEAN` | keine |
| `ImpactCompare` | Compare | Vergleich, `a: *`, `b: *` | `BOOLEAN` |
| `ImpactConditionalBranch` | Conditional Branch | `cond`, true-/false-Wert | ausgewaehlter Wert `*` |
| `ImpactQueueTrigger` | Queue Trigger | Signal, Modus | Signal |
| `ImpactQueueTriggerCountdown` | Queue Trigger (Countdown) | Signal, Countdown, Modus | Signal, Countdown |
| `ImpactControlBridge` | Control Bridge | `value: *`, `mode: BOOLEAN`, `behavior: Stop|Mute|Bypass` | `value: *` |

Die offiziellen Mappings bestaetigen insbesondere, dass weder ein Start-Node noch
ein End-Node mit State-Port existiert.
[`__init__.py`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/__init__.py#L288-L338)

### State- und Iterationssemantik

`ImpactValueSender` ist ein Output-Node. Er sendet `value-send` mit `link_id` und
Wert an den Browser; sein einziger Output reicht nur das optionale Signal weiter.
`ImpactValueReceiver` liest keinen serverseitigen Sender-State, sondern konvertiert
sein eigenes String-Widget gemaess `typ` nach `INT`, `FLOAT`, `BOOLEAN` oder laesst
es als String stehen. Damit sind nur skalare Widgetwerte direkt rueckkoppelbar;
`IMAGE`, `MASK`, `SEGS`, `BASIC_PIPE` oder ein BV-Auftragsobjekt sind kein
Receiver-Vertrag.
[`ImpactValueSender` und `ImpactValueReceiver`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/logics.py#L383-L438)

Der Browser-Handler sucht passende `ImpactValueReceiver` anhand `link_id`, schreibt
Wert und Typ in dessen Widgets und stellt so erst den Zustand fuer einen folgenden
Queue-Lauf bereit. Das ist explizit Frontend-Mutation, keine IMAGE-Kante im
ausgefuehrten Graphen.
[`valueSendHandler`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/js/impact-pack.js#L214-L246)

`ImpactConditionalStopIteration` sendet bei `cond=true` lediglich das Ereignis
`stop-iteration`. Der Frontend-Handler setzt daraufhin das Auto-Queue-Kontrollfeld
auf `false`. Der Node beendet keinen lokalen Schleifenkoerper und liefert keinen
Endzustand zurueck.
[`ImpactConditionalStopIteration`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/logics.py#L321-L337)
· [Frontend-Handler](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/js/impact-pack.js#L243-L249)

### IMAGE-Rueckfuehrung

Das offizielle `loop-test.json` benutzt `Image Sender` und `Image Receiver`, nicht
eine zyklische `IMAGE`-Verbindung. Der Sender speichert ein Bild als temporaere
Datei und sendet dessen Metadaten; der Browser schreibt den Dateinamen in den
Receiver. Der naechste Prompt laedt das Bild wieder. Der Beispielgraph schaltet
zwischen Anfangsbild und Receiver-Bild, verarbeitet es und sendet das Ergebnis
erneut.
[Workflow-Stellen fuer Receiver, Switch und Sender](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/tests/workflows/loop-test.json#L230-L407)
· [`imgSendHandler`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/js/impact-pack.js#L146-L188)

Folgen fuer BV:

- Ein Detailer-Ergebnis kann ueber mehrere Queue-Laeufe sequenziell werden, aber
  nicht als in-memory Tensor-State einer Schleife.
- Zwischenstufen landen im Temp-Speicher und werden erneut dekodiert.
- Ein abgebrochener oder parallel gestarteter Workflow kann Receiver-/Widget-State
  hinterlassen; `link_id` trennt Kanaele, bietet aber keine Transaktion pro BV-
  Dokument oder Queue-Run.
- Die letzte IMAGE-Ausgabe und der aktuelle Regionsindex muessten getrennt
  persistiert und konsistent gehalten werden.

## Listen und `SEGS` sind keine IMAGE-Akkumulator-Schleife

Impact besitzt inzwischen echte ComfyUI-Listen-Helfer:

- `Make List (Any)` sammelt dynamische Inputs und deklariert den Output als Liste.
- `Select Nth Item (Any list)` konsumiert eine Liste und einen Index; ausserhalb
  des Bereichs liefert er das letzte Element.
- `List Bridge` konsumiert und liefert eine Liste gesammelt, damit ein vorheriger
  listenbasierter Subworkflow abgeschlossen ist.

[`MakeAnyList` und `NthItemOfAnyList`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/util_nodes.py#L403-L467)
· [`ImpactListBridge`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/logics.py#L755-L778)

Damit lassen sich Masken oder Auftragsparameter auflisten und einzeln auswaehlen.
Eine normale ComfyUI-Listenauswertung bildet einen Node jedoch ueber Listenelemente
ab; sie fuehrt nicht automatisch Ausgabe `IMAGE[n]` als Eingabe `IMAGE[n+1]`
zurueck. Werden mehrere BV-Masken an einen `MaskDetailer (pipe)` gemappt, entstehen
daher unabhaengige Detailer-Ergebnisse aus demselben Eingangsbild, nicht ein
fortlaufend verfeinertes Bild.

`SEGS` ist seinerseits bereits ein Bundle aus Bildgroesse und mehreren Segmenten.
`Detailer (SEGS)` iteriert diese Segmente intern und komponiert jedes Ergebnis in
das fortgeschriebene Vollbild. Das ist eine echte sequenzielle IMAGE-Fortschreibung
innerhalb eines Nodes, jedoch mit **einem gemeinsamen** Model/CLIP/VAE- und
Conditioning-/Sampling-Vertrag; regionsspezifische Prompts laufen nur ueber
Impacts Label-/Wildcard-Mechanik, nicht ueber eine Liste verschiedener
`BASIC_PIPE`s.
[`DetailerForEach`-Verarbeitung](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L215-L430)

`MaskDetailer (pipe)` wandelt genau eine Maske in `SEGS` um und ruft ebenfalls
`DetailerForEach` auf. Sowohl dieser Pfad als auch `Detailer (SEGS)` lehnen echte
IMAGE-Batches ab. Ein IMAGE-Batch ist deshalb ebenfalls kein Ersatz fuer
sequenzielle Regionen.
[`MaskDetailerPipe`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py#L1738-L1838)

## Dynamische Graphausfuehrung und Grenzen

`Control Bridge` ist ebenfalls kein Loop-Block. Im Modus `Stop` gibt er den Wert
weiter oder liefert fuer den nachfolgenden Pfad einen `ExecutionBlocker`. In den
Modi `Mute`/`Bypass` inspiziert er Workflow-Metadaten, sendet die zu aendernden
Node-IDs ans Frontend, unterbricht die aktuelle Verarbeitung und laesst das
Frontend einen angepassten Prompt erneut einreihen.
[`ImpactControlBridge`](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/logics.py#L592-L721)

Das README nennt fuer `Control Bridge` ausdruecklich folgende Grenzen:

- Batch Count groesser als eins funktioniert nicht verlaesslich.
- zufaellige Seeds und vorherige zustandsaendernde Actions koennen die Ausfuehrung
  stoeren;
- `Queue Trigger`, `Set Widget Value` und `Set Mute State` sollen am Workflow-Ende
  liegen;
- Mute-/Bypass-Verhalten ist ohne Workflow-Metadaten in API-Ausfuehrungen nicht
  verfuegbar.

[offizielle Einschraenkungen](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/429d0159ad429e64d2b3916e6e7be9c22d025c3c/README.md#L462-L483)

Ein vom Editor erzeugter BV-Workflow sollte deshalb weder Auto Queue noch
Frontend-Mutation als Voraussetzung fuer korrekte Bildverarbeitung haben.

## Bewertung der BV-Optionen

## Nachtrag: EasyUse besitzt einen echten In-Prompt-Loop

Anders als Impact stellt `ComfyUI-Easy-Use` mit `easy forLoopStart` und
`easy forLoopEnd` einen dynamisch expandierten Schleifenkoerper innerhalb einer
Prompt-Ausfuehrung bereit. `forLoopStart` liefert `flow`, `index` und bis zu 19
mitgefuehrte Werte; `forLoopEnd` nimmt den aktualisierten Zustand entgegen und
expandiert intern ueber `whileLoopStart`/`whileLoopEnd`. EasyUse beschreibt die
Funktion selbst als lazy For Loop und hat die maximale Zahl der Ein-/Ausgaenge ab
Version 1.3.0 auf 20 erhoeht.
[Offizielles EasyUse-README](https://github.com/yolain/ComfyUI-Easy-Use/blob/main/README.md)

Damit ist folgender BV-Prototyp grundsaetzlich moeglich:

```text
Detailer region count -> easy forLoopStart
                         index -> BV Detailer Job at Index
             value1: current IMAGE -> MaskDetailer (pipe)
                                      -> easy forLoopEnd initial_value1
easy forLoopEnd value1 -> final IMAGE
```

BV benoetigt dafuer keinen Batch von Bildern, sondern zwei kleine, paketneutrale
Interfaces: `detailer_count(regional)` und
`detailer_job_at(regional, index, image, model, clip, vae)`. Der zweite Aufruf
waehlt die nach Prioritaet sortierte `detailer`-/`both`-Region und erzeugt deren
Maske sowie `BASIC_PIPE`. Das vom Detailer ausgegebene Einzelbild ist der
Loop-Akkumulator fuer die naechste Iteration.

Der Ansatz ist fachlich passender als Impacts Auto-Queue-Loop, bleibt aber eine
optionale EasyUse-Integration. EasyUse-Listen werden an Loop-Ports teilweise als
einzelne Elemente ausgewertet; ein offenes Issue dokumentiert dieses Verhalten.
Der BV-Prototyp sollte deshalb nur das skalare `IMAGE` und einfache Identitaeten
mitfuehren, nicht eine rohe Liste von Masken oder Auftragsobjekten.
[EasyUse Issue #815](https://github.com/yolain/ComfyUI-Easy-Use/issues/815)

Ausserdem gab es nach Aenderungen an ComfyUIs dynamischer Ausfuehrung konkrete
Kompatibilitaetsregressionen der Loop-Nodes. Deshalb muss der Prototyp mit der im
BV NodePack tatsaechlich verwendeten ComfyUI-/Frontend-Version getestet werden;
der BV-Kernvertrag darf nicht von EasyUse-internen Klassen abhaengen.
[EasyUse Issue #863](https://github.com/yolain/ComfyUI-Easy-Use/issues/863)

**Aktualisierte Empfehlung:** EasyUse ist der beste Kandidat fuer einen kleinen
Machbarkeitsprototyp. Wenn der Loop in der Zielinstallation stabil laeuft, kann
der Editor optional eine kompakte EasyUse-Schleife erzeugen. Die explizite
Detailer-Kette bleibt der robuste, abhaengigkeitsarme Fallback und die besser
debuggbare Materialisierung.

| Ansatz | Sequenzielles gemeinsames IMAGE | Eigener Prompt/Pipe pro Region | Robustheit | Bewertung |
| --- | --- | --- | --- | --- |
| Impact-Auto-Queue-Loop | Ja, ueber Temp-Datei zwischen Prompts | Nur mit zusaetzlichem Index-/Widget-State | Niedrig | Nur Experiment/PoC |
| EasyUse `forLoopStart`/`forLoopEnd` | Ja, als mitgefuehrter In-Prompt-Zustand | Ja, ueber BV-Auftrag am Index | Mittel bis hoch, versionsabhaengig | Bevorzugter Prototyp |
| ComfyUI-Listen ueber `MaskDetailer` | Nein; Ergebnisse sind unabhaengig | Ja, listenweise prinzipiell moeglich | Mittel | Falsche Semantik |
| Ein gemeinsames `SEGS` + `Detailer (SEGS)` | Ja, intern | Gemeinsame Pipe; Unterschiede nur per Label/Wildcard/Hook | Hoch | Gut bei homogenem Detailprofil |
| Editor erzeugt eine Kette `MaskDetailer (pipe)` je Region | Ja, direkte IMAGE-Kanten | Ja | Hoch | Bevorzugt fuer sichtbaren Graphen |
| BV-eigener Orchestrator-Node | Ja, intern | Ja | Abhaengig von Integrationsgrenze | Optional spaeter |

## Empfehlung

Die Impact-Loop-Nodes sollten **nicht** die Grundlage der Editor-Funktion „pro
Detailer-Region einen separaten Detailauftrag erzeugen“ werden. Der Editor sollte
stattdessen nach stabiler Regions-ID und definierter Reihenfolge eine explizite,
sequenzielle `MaskDetailer (pipe)`-Kette materialisieren:

```text
initial IMAGE
  -> Region A: BV Detailer Mask -> MaskDetailer (pipe)
  -> Region B: BV Detailer Mask -> MaskDetailer (pipe)
  -> Region C: BV Detailer Mask -> MaskDetailer (pipe)
  -> final IMAGE
```

Falls alle Regionen dasselbe Detailprofil teilen, ist ein gemeinsames, gelabeltes
`SEGS`-Bundle plus `Detailer (SEGS)` kompakter und nutzt Impacts bereits vorhandene
interne Segmentiteration. Falls jede Region eigene `BASIC_PIPE`-, Conditioning-
oder Samplingwerte benoetigt, bleibt die explizite Node-Kette semantisch sauberer.

Die Auto-Queue-Loesung ist dennoch als kleiner Referenz-Prototyp nuetzlich, um zu
verstehen, welche minimalen Orchestrator-Daten BV spaeter braucht: sortierte
Regions-IDs, aktueller Index, aktuelles IMAGE und eine eindeutige
Abbruchbedingung. Sie sollte aber nicht als produktive Laufzeitarchitektur
uebernommen werden.

## Detector-Ports: Provider-Matrix und sichere optionale Materialisierung

Stand der lokalen Zielinstallation: `ComfyUI 2026-06`, installierte Verzeichnisse
`custom_nodes/comfyui-impact-pack` und `custom_nodes/comfyui-impact-subpack`.
Die Befunde wurden gegen die offiziellen Repositories abgeglichen.

### Provider liefern nicht immer drei wirklich nutzbare Werte

| Provider | deklarierte Ausgaenge | tatsaechlich nutzbar |
| --- | --- | --- |
| Impact `ONNXDetectorProvider` | `BBOX_DETECTOR` | BBOX |
| Impact `CLIPSegDetectorProvider` | `BBOX_DETECTOR` | BBOX; Suchtext wird bereits beim Provider konfiguriert |
| Impact `SAMLoader` | `SAM_MODEL` | SAM |
| Subpack `UltralyticsDetectorProvider`, `bbox/...` | `BBOX_DETECTOR`, `SEGM_DETECTOR` | nur BBOX |
| Subpack `UltralyticsDetectorProvider`, `segm/...` | `BBOX_DETECTOR`, `SEGM_DETECTOR` | BBOX und SEGM |

Quellen: [Impact Provider und SAMLoader](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/Main/modules/impact/impact_pack.py#L2265-L2455),
[Ultralytics Provider](https://github.com/ltdrdata/ComfyUI-Impact-Subpack/blob/main/modules/subpack_nodes.py#L357-L416),
[offizielle Detector-Anleitung](https://github.com/ltdrdata/ComfyUI-extension-tutorials/blob/Main/ComfyUI-Impact-Pack/tutorial/detectors.md).
Lokal entsprechen dem insbesondere `comfyui-impact-pack/modules/impact/impact_pack.py:56-145`
und `comfyui-impact-subpack/modules/subpack_nodes.py:20-60`.

Der kritische Sonderfall ist das Ultralytics-BBOX-Modell: Der Provider gibt am
zweiten, als `SEGM_DETECTOR` deklarierten Ausgang nicht Python-`None`, sondern
eine Instanz von `NO_SEGM_DETECTOR` aus. Diese Klasse ist leer. Wird dieser
Ausgang mit `segm_detector_opt` verbunden, sieht Impact einen Wert ungleich
`None` und versucht `segm_detector.detect(...)`; daraus folgt ein
`AttributeError`. Quellen:
[Provider-Rueckgabe](https://github.com/ltdrdata/ComfyUI-Impact-Subpack/blob/main/modules/subpack_nodes.py#L405-L416),
[leere Sentinel-Klasse](https://github.com/ltdrdata/ComfyUI-Impact-Subpack/blob/main/modules/subcore.py#L1413-L1419),
[FaceDetailer-Verzweigung](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/Main/modules/impact/impact_pack.py#L3405-L3441).
Lokal: `subpack_nodes.py:57-60`, `subcore.py:117-122` und
`impact_pack.py:811-826`.

### Welche Impact-Nodes die Detector-Werte wirklich erwarten

- `FaceDetailer`: `bbox_detector` ist **required**;
  `sam_model_opt` und `segm_detector_opt` sind **optional**. Bei beiden
  vorhandenen Werten hat SAM Vorrang (`if sam ... elif segm ...`). Lokal:
  `impact_pack.py:735-785` und `811-826`.
- `SimpleDetectorForEach`: ebenfalls BBOX required, SAM und SEGM optional und
  mit derselben SAM-vor-SEGM-Semantik. Lokal:
  `modules/impact/detectors.py:193-258`.
- `ToDetailerPipe` und `BasicPipeToDetailerPipe`: BBOX required; SAM und SEGM
  optional. Fehlende optionale Keys werden mit `kwargs.get(..., None)` im Pipe
  gespeichert. Lokal: `modules/impact/pipe.py:5-36` und `184-216`;
  [offizielle Quelle](https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/Main/modules/impact/pipe.py#L1073-L1127).
- `FaceDetailerPipe` besitzt keine separaten Detector-Eingaenge; die drei Werte
  kommen aus `DETAILER_PIPE`. Lokal: `impact_pack.py:1636-1718`.
- `MaskDetailerPipe` besitzt ueberhaupt keine Detector-Eingaenge. Er nimmt eine
  fertige `MASK`; Detektion und Regionsbegrenzung muessen davor stattfinden.
  Lokal: `impact_pack.py:1738-1793`.
- `Detailer (SEGS)` nimmt fertige `SEGS`; auch hier gehoert die Detector-Auswahl
  in den vorgelagerten Adapter, nicht in den Detailer selbst.

### Nicht verbunden, verbundenes `None` und Sentinel sind drei verschiedene Faelle

ComfyUI iteriert zur Laufzeit nur ueber Keys, die im Prompt unter `inputs`
tatsaechlich vorhanden sind. Ein nicht verbundener optionaler Port fehlt daher
vollstaendig im Argument-Dictionary; die Python-Defaultwerte der Zielmethode
greifen. Ein vorhandener Link wird dagegen ausgewertet und sein konkreter Wert
als Argument weitergereicht. Quelle:
[ComfyUI `get_input_data`](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py#L2441-L2500),
lokal `execution.py:159-227`.

Ein verbundener Ausgang, der wirklich Python-`None` liefert, wird folglich als
`None` uebergeben. Das funktioniert fuer die untersuchten Impact-Pfade, weil sie
explizit `is not None` pruefen. Es ist jedoch kein allgemeiner Vertrag fuer
beliebige Fremd-Nodes. Ein typisierter Sentinel wie `NO_SEGM_DETECTOR` ist noch
problematischer: Er besteht die statische Socket-Typpruefung, ist aber zur
Laufzeit non-null und implementiert nicht das erwartete Protokoll.

Darum darf BV unbrauchbare Alternativen nicht als Fake-Objekt oder Null-Link
weiterreichen. Der korrekte Zustand ist: **Der optionale Input-Key existiert im
expandierten Prompt nicht.**

### GraphBuilder kann optionale Links wirklich weglassen

`GraphBuilder.Node.set_input(key, None)` entfernt den Key; ebenso entfernt
`replace_node_output(..., new_value=None)` alle betroffenen Input-Kanten. Die
finalisierte Expansion serialisiert danach nur die verbleibenden Inputs.
Quelle: [ComfyUI GraphBuilder](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_execution/graph_utils.py#L524-L635),
lokal `comfy_execution/graph_utils.py:44-77` und `93-113`.
`DynamicPrompt` nimmt diese expandierten Knoten als ephemere Nodes auf:
[ComfyUI DynamicPrompt](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_execution/graph.py#L905-L968),
lokal `comfy_execution/graph.py:21-62`.

Damit kann der BV-Loop beziehungsweise der BV-Impact-Adapter pro Job den
Detailer-/Detector-Untergraph erzeugen und `sam_model_opt` oder
`segm_detector_opt` nur dann setzen, wenn ein validiertes Binding vorliegt.

### Empfohlener BV-Vertrag

Kein klassischer Splitter mit drei immer verbundenen Outputs. Stattdessen ein
paketneutraler Registry-/Binding-Wert mit expliziter Praesenz und Capabilities:

```python
BVDetectorBinding = {
    "id": "eyes",
    "bbox": bbox_or_absent,
    "segm": segm_or_absent,
    "sam": sam_or_absent,
    "capabilities": {"bbox", "segm"},
    "query": "eyes",
}
```

`absent` ist dabei Metadatenzustand im BV-Objekt, **kein** Objekt auf einer
Impact-Kante. Vor der Graph-Expansion muss BV duck-typed validieren:

- BBOX/SEGM: Objekt vorhanden und erwartete `detect`-Operation verfuegbar;
- SAM: bekannte/registrierte `SAM_MODEL`-Binding-Art;
- Provider-Sentinels ohne Protokoll werden als absent normalisiert;
- Konfigurationsfehler wie „SEGM verlangt, aber nicht vorhanden“ werden vor dem
  Detailer mit Job-ID und Binding-ID gemeldet, nicht still ignoriert.

Die Materialisierung erfolgt danach selektiv:

```python
inputs = {"bbox_detector": binding["bbox"], ...}  # required
if binding_has_valid_sam:
    inputs["sam_model_opt"] = binding["sam"]
elif binding_has_valid_segm:
    inputs["segm_detector_opt"] = binding["segm"]
```

Diese Prioritaet spiegelt Impacts eigene Semantik. Wenn spaeter mehrere
Detector-Stufen kombiniert werden sollen, erzeugt BV vorgelagerte SEGS-/Masken-
Operationen und uebergibt dem finalen Detailer das fertige Ergebnis; es sollte
nicht versuchen, mehrere optionale FaceDetailer-Ports gleichzeitig als
allgemeine Detector-Pipeline umzudeuten.

**Klare Empfehlung:** UI-seitig darf ein `BV Detector Router` drei sichtbare
Slots beziehungsweise Statusanzeigen anbieten. Laufzeitseitig soll er jedoch
einen einzigen `BV_DETECTOR_BINDING`-Wert liefern. Erst der dynamische
BV-Impact-Adapter materialisiert ausschliesslich die validen, fuer den aktuellen
Job benoetigten Links. So entstehen weder Fake-Detektoren noch verbundene
Null-Ausgaenge, und Fremd-Nodes muessen keine BV-Sentinel-Semantik kennen.

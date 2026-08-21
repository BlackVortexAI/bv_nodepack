# ComfyUI-Detailer-Interop für BV Regional (Stand 20.08.2026)

## Kurzfazit

Impact Pack bleibt der einzige große, eigenständige ComfyUI-Stack, der **Detektion, segmentweise Detailer-Ausführung und Masken-Detailing** als zusammenhängende API anbietet. Der vermeintlich wichtigste Konkurrent EasyUse ist kein zweites Backend: `easy detailerFix` ruft zur Laufzeit direkt Impacts `FaceDetailer` beziehungsweise `MaskDetailerPipe` auf. Detail Daemon ist trotz des Namens kein regionaler Detailer, sondern ein Sampler-/Sigma-Modifikator.

Für BV sollte deshalb nicht `SEGS` zum Kernvertrag werden. Der paketneutrale Kern sollte Jobs aus `IMAGE + MASK + Prompt/CONDITIONING + optionalen Detector-Bindings + Sampling-Profil` ausführen. Impact erhält einen ersten Adapter; ein zweiter, nützlicher Adapter kann später das generische Crop/Sample/Stitch-Protokoll bedienen. Damit ist BV heute optimal mit Impact nutzbar, ohne sich konzeptionell daran festzubinden.

## Methodik und Einordnung

Untersucht wurden ausschließlich Primärquellen: offizielle GitHub-Repositories, deren README, Changelog und Quellcode sowie die offizielle Comfy-Org-Workflow-Registry. Sterne und Aktivitätsangaben sind Momentaufnahmen vom 20.08.2026 und keine Qualitätsgarantie.

Als „echter Detailer“ gilt hier eine Pipeline, die eine räumlich begrenzte Teilfläche auswählt, sie mit eigenem Sampling/Prompt bearbeitet und zurück in das Bild komponiert. Reine Upscaler, Prompt-Wrapper, Sampler-Modifikatoren und Detektoren ohne nachgelagertes Inpainting werden getrennt ausgewiesen.

## Marktbild

| Kandidat | Reichweite/Aktivität | Tatsächliche Kategorie | BV-Priorität |
|---|---:|---|---|
| [Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) | 2.055.471 Registry-Downloads, 2.950 Sterne laut [Comfy-Org-Katalog](https://github.com/Comfy-Org/workflow_templates/blob/main/site/knowledge/custom-nodes/comfyui-impact-pack.md) | vollständiger Detector-/SEGS-/Detailer-Stack | **jetzt unterstützen** |
| [EasyUse](https://github.com/yolain/ComfyUI-Easy-Use) | 2,7k Sterne, 752 Commits; Detailer/Subgraph-Fix im April 2026, weiterhin aktiv | UX-/Pipe-Wrapper um Impact | kein eigenes Backend |
| [Inpaint Crop And Stitch](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch) | 1,1k Sterne; 2026 GPU- und Kompatibilitätsupdates | generisches Crop/Stitch-Transportprotokoll | **Adapter später** |
| [Acly Inpaint Nodes](https://github.com/Acly/comfyui-inpaint-nodes) | 1,2k Sterne, 81 Commits; Flux-2-Klein-Postprocessing dokumentiert | Inpaint-Modelle und Maskenwerkzeuge, kein Orchestrator | Backend-Baustein später |
| [Detail Daemon](https://github.com/Jonseed/ComfyUI-Detail-Daemon) | 960 Sterne; neue interaktive GUI am 11.08.2026 | Sigma-/Sampler-Modifikator | nicht als Detailer-Backend |
| [Efficiency Nodes ED](https://github.com/NyaamZ/efficiency-nodes-ED) | 53 Sterne | Impact-Add-on/Context-Wrapper | kein eigenes Backend |

## 1. Impact Pack – Referenzbackend

Die offizielle Comfy-Org-Beschreibung nennt `FaceDetailer`, `DetailerForEach`, `SAMLoader` und `SAMDetectorCombined` explizit als Detector-/Detailer-Funktionen. Impact ist damit nicht bloß ein UI-Wrapper, sondern besitzt den vollständigen Lebenszyklus von Erkennung über Segmenttransport bis zur verfeinerten Ausgabe.

### Formate und Fähigkeiten

- Standardtypen: `IMAGE`, `MASK`, `MODEL`, `CLIP`, `VAE`, `CONDITIONING`.
- Eigene Typen: `SEGS`, `BBOX_DETECTOR`, `SEGM_DETECTOR`, `SAM_MODEL`, `BASIC_PIPE`, `DETAILER_PIPE`, `DETAILER_HOOK`.
- `FaceDetailer` kombiniert BBOX-Erkennung mit optionalem SAM beziehungsweise SEGM und führt Crop, Sampling und Composite intern aus.
- `Detailer (SEGS)` akzeptiert bereits aufbereitete Segmente. Das ist der sinnvollste erste BV-Ausgangsadapter, sofern BV ROI-Erkennung und Rebase selbst übernimmt.
- `MaskDetailer (pipe)` akzeptiert eine `MASK` und ist der direkte Fallback für regionsbasierte Jobs ohne Detektor.
- `DetailerForEach` verarbeitet Segmente einzeln; Impact besitzt also native Multi-Segment-Semantik, aber keinen BV-Jobplan mit regionsspezifischen Prompts und heterogenen Detector-Bindings.

### Bewertung

**Jetzt unterstützen.** Der erste Adapter soll nicht Impacts `FaceDetailer` fernsteuern, sondern wahlweise:

1. BV-Detektor-ROI → vollbildbezogene `SEGS` → Impact `Detailer (SEGS)`, oder
2. BV-Regionsmaske → Impact `MaskDetailer (pipe)`.

Damit bleiben optionale Detector-Ports und Impact-Sentinel-Objekte außerhalb des Loop-Vertrags. Abhängigkeit und Lizenz des installierten Impact Packs bleiben extern; BV sollte keinen Impact-Code kopieren.

## 2. EasyUse `detailerFix` – populär, aber kein alternatives Backend

EasyUse ist groß und aktiv: Das [offizielle Repository](https://github.com/yolain/ComfyUI-Easy-Use) zeigt 2,7k Sterne, 213 Forks und 752 Commits; die Activity nennt noch 2026 einen Fix für Detailer in Subgraphs. Die README beschreibt EasyUse ausdrücklich als Integrationspaket für andere populäre Nodes.

Der entscheidende Primärbefund steht im [Quellcode `py/nodes/fix.py`](https://github.com/yolain/ComfyUI-Easy-Use/blob/main/py/nodes/fix.py):

- `easy preDetailerFix` nimmt `PIPE_LINE`, optional eine `bbox_segm_pipe`, `sam_pipe` und `IMAGE` entgegen.
- `easy preMaskDetailerFix` nimmt `PIPE_LINE + MASK`, Detailer-/Samplingparameter sowie optional `IMAGE` entgegen.
- `easy detailerFix` gibt `PIPE_LINE`, `IMAGE`, `cropped_refined` und `cropped_enhanced_alpha` aus.
- Im Maskenpfad lädt es `ALL_NODE_CLASS_MAPPINGS["MaskDetailerPipe"]` und wirft ohne Impact Pack einen Fehler.
- Im Detektorpfad lädt es `ALL_NODE_CLASS_MAPPINGS["FaceDetailer"]` und wirft ohne Impact Pack ebenfalls einen Fehler.
- `easy ultralyticsDetectorPipe` lädt Impacts `UltralyticsDetectorProvider`; `easy samLoaderPipe` lädt Impacts `SAMLoader`.
- Prompts liegen nicht pro Segment vor, sondern als `positive`/`negative` im gemeinsamen `PIPE_LINE`. `cycle` wiederholt denselben Detailerauftrag; es ist kein heterogener Job-Loop.

### Bewertung

**Kein eigener BV-Adapter.** EasyUse ist ein wichtiger Workflow-Interop-Testfall, aber jede Integration würde nur eine zweite, engere Fassade über dasselbe Impact-Backend bauen. Allenfalls später `BV_PIPELINE_RESULT -> PIPE_LINE` als allgemeiner Komfortkonverter, nicht als Detailer-Strategie.

## 3. ComfyUI-Inpaint-CropAndStitch – wichtigster paketneutraler Zweitpfad

Das Repository hat 1,1k Sterne und 138 Commits. Der Changelog dokumentiert Batch-Support seit 14.05.2024, eine große Präzisions-/UX-Überarbeitung 2025, 30- bis 100-fache GPU-Beschleunigung am 09.01.2026 und einen Kompatibilitätswechsel des Default-Geräts am 25.05.2026. Es ist damit aktuell gepflegt und kein verlassenes Hilfsprojekt.

### Formate und Fähigkeiten

Der [Quellcode](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch/blob/main/inpaint_cropandstitch.py) definiert:

- `Inpaint Crop`: Eingänge `IMAGE`, `MASK`, optional eine Kontextmaske; Ausgänge eigener `STITCH`-Datensatz, zugeschnittenes `IMAGE`, zugeschnittene `MASK` und je nach Version Kontextmaske.
- `Inpaint Stitch`: Eingänge `STITCH + IMAGE`; Ausgang `IMAGE`.
- `STITCH` speichert Originalbild, Crop-Ursprung, Blendmaske, Resize-Faktoren und Ausgangsgröße.
- Native Batchbehandlung für Bilder und Masken ist implementiert.
- Kein Detektor, kein `SEGS`, kein `BBOX`, kein Prompt, kein Conditioning und kein Sampling: Zwischen Crop und Stitch kann jedoch ein beliebiger Standard-ComfyUI-Inpaint-Workflow liegen.
- Lizenz: GPL-3.0; Abhängigkeiten umfassen ComfyUI, PyTorch/Torchvision, NumPy, Pillow und SciPy. Die README nennt ComfyUI-Manager als Installationsweg.

### Bewertung

**Adapter später, mit hoher Priorität.** Nicht als fremden „Detailer“ ansprechen, sondern als `crop_stitch`-Ausführungsstrategie. BV kann `IMAGE + effektive MASK` hineinreichen, dazwischen seine eigenen `MODEL/VAE/CONDITIONING`-Nodes oder einen injizierten Sampler verwenden und das Ergebnis zurückstitchen.

Architektonisch sollte BV allerdings zunächst ein eigenes ROI-Transform-Objekt besitzen. Ein Adapter kann dieses auf `STITCH` abbilden; der BV-Kern darf den fremden, versionsabhängigen Dictionary-Aufbau nicht als persistentes Format übernehmen.

## 4. Acly `comfyui-inpaint-nodes` – starkes Inpaint-Backend, kein Detailer-Orchestrator

Das offizielle Repository hat 1,2k Sterne und 81 Commits. Es unterstützt Fooocus-Inpaint für SDXL, LaMa und MAT sowie Masken-Pre-/Postprocessing; die README dokumentiert inzwischen ausdrücklich einen für Flux 2 Klein nützlichen `Denoise to Compositing Mask`-Schritt.

### Formate und Fähigkeiten

- Standardtypen dominieren: `IMAGE`, `MASK`, `MODEL`, `VAE`, `LATENT`, `CONDITIONING`.
- `VAE Encode & Inpaint Conditioning` erzeugt `latent_inpaint` und `latent_samples` ohne doppeltes VAE-Encoding.
- Masken können expandiert, geschrumpft, stabilisiert und zum Füllen/Blenden verwendet werden.
- LaMa/MAT führen promptloses Inpainting über einen eigenen geladenen Inpaint-Modelltyp aus.
- Keine Detektoren, keine BBOX/SEGS, keine automatische Crop/Rebase/Stitch-Kette, kein regionsspezifischer Multi-Job-Loop.
- Lizenz GPL-3.0; OpenCV ist für Telea/Navier-Stokes optional, LaMa/MAT beruhen auf Spandrel.

### Bewertung

**Kein Detailer-Adapter jetzt.** Sehr sinnvoll als später auswählbarer `inpaint_backend` innerhalb eines BV-Jobs, insbesondere für promptlose Reparatur/Objektentfernung. Der BV-Vertrag sollte deshalb Conditioning optional machen und eine Backend-Capability `supports_prompt` führen.

## 5. Detail Daemon – Namensfalle, ausdrücklich kein regionaler Detailer

Detail Daemon ist aktuell relevant (960 Sterne, 49 Commits; README-Update mit interaktiver Sampler-GUI vom 11.08.2026), erfüllt aber nicht die Detailer-Definition. Das [offizielle Repository](https://github.com/Jonseed/ComfyUI-Detail-Daemon) beschreibt fünf Nodes, die Sigma-Zeitpläne beziehungsweise Sampler verändern: `Detail Daemon Sampler GUI`, `Detail Daemon Sampler`, `Detail Daemon Graph Sigmas`, `Multiply Sigmas` und `Lying Sigma Sampler`.

- Ein-/Ausgaben sind Sampler/Sigma-bezogen, nicht `MASK`, `SEGS` oder BBOX.
- Keine Detektion, kein Crop, kein Stitch, keine räumliche Region und kein eigener Prompt pro Region.
- Funktioniert mit `SamplerCustomAdvanced`; für klassische KSampler wird ein Bleh-Sampler-Preset beschrieben.
- Lizenz MIT.

### Bewertung

**Nicht als Detailer-Backend unterstützen.** Optional könnte ein BV-Samplingprofil später einen beliebigen `SAMPLER`/Sigma-Modifier injizieren. Das ist eine orthogonale Extension-Point-Frage und darf nicht im Detector-/Region-Adapter landen.

## 6. Weitere Kandidaten und Wrapper

### Efficiency Nodes ED

Das Repository nennt seine `FaceDetailer`, `MaskDetailer` und `Detailer (SEGS)` ausdrücklich Add-ons beziehungsweise modifizierte Varianten von Impact Pack und macht Impact optional erforderlich. Mit 53 Sternen ist es außerdem weit kleiner als die oben genannten Kandidaten. **Kein eigenes Backend; nur UX-/Context-Interop.**

### Smart Image Crop and Stitch und ähnliche Forks

[ComfyUI-Smart-Image-Crop-and-Stitch](https://github.com/HallettVisual/ComfyUI-Smart-Image-Crop-and-Stitch) sowie neuere Crop/Stitch-Suiten lösen Variationen desselben Transports. Sie ändern nicht den minimalen Vertrag: `IMAGE + MASK -> Crop-Kontext + Crop-Bild + Crop-Maske -> bearbeitetes Crop-Bild -> IMAGE`. Ein Provider-Adapter kann später mehrere Implementierungen kapseln; einzelne Forks rechtfertigen jetzt keine eigene Kern-API.

### Ultimate SD Upscale, SUPIR und reine Detektor-Packs

Sie sind relevante Nachbearbeitungswerkzeuge, aber keine semantischen Regions-Detailer: Ultimate SD Upscale arbeitet kachel-/upscaleorientiert, SUPIR restauriert/upscaled, Detektor-Packs erzeugen Masken/BBOX/Segmente ohne zwingende Detail-Pipeline. Sie können später Backends oder Detector-Provider sein, verändern aber nicht den BV-Jobvertrag.

## Paketneutraler minimaler BV-Vertrag

Der Vertrag soll weder Impact-`SEGS`, EasyUse-`PIPE_LINE` noch CropAndStitch-`STITCH` persistieren:

```ts
type BVDetailJob = {
  id: string;
  regionIds: string[];
  regionMask: MASK;                 // Full-image coordinates
  prompt?: {
    positiveText?: string;
    negativeText?: string;
    positive?: CONDITIONING;
    negative?: CONDITIONING;
    composition: "primary" | "combined" | "context";
  };
  detection?: {
    roi: "region_crop" | "full_image";
    bindings: BVDetectorBinding[];
    result: "replace" | "intersect_region" | "union_region";
  };
  sampling: BVDetailSamplingProfile;
  backend: string;                  // z.B. impact-segs, impact-mask, crop-stitch
};

type BVDetailTarget = {
  fullMask: MASK;
  roi: { x: number; y: number; width: number; height: number };
  localMask: MASK;
  detections?: Array<{
    bboxLocal?: [number, number, number, number];
    maskLocal?: MASK;
    label?: string;
    score?: number;
  }>;
};

type BVDetailResult = {
  image: IMAGE;
  effectiveMask?: MASK;
  crops?: IMAGE[];
  diagnostics?: unknown;
};
```

### Obligatorische Adapter-Capabilities

```ts
type BVDetailBackendCapabilities = {
  acceptsMask: boolean;
  acceptsDetections: boolean;
  acceptsConditioning: boolean;
  acceptsPromptText: boolean;
  supportsBatch: boolean;
  supportsSequentialAccumulation: boolean;
};
```

Wichtige Regel: Detector-Provider liefern intern optionale Fähigkeiten in **einem Bundle**. Fehlende BBOX-/SEGM-/SAM-Fähigkeiten werden nicht als `None`-Kanten oder Sentinel-Objekte an fremde Nodes verbunden. Der jeweilige Adapter materialisiert ausschließlich tatsächlich vorhandene Eingänge.

## Priorisierte Umsetzung

1. **Jetzt: BV Loop und eigener ROI/Detector/Rebase-Kern.** Der Loop trägt aktuelles `IMAGE`, Jobplan und Index; ein Job liefert Full-Image-Maske, Prompt/Conditioning und optional lokal erkannte Targets.
2. **Jetzt: Impact-Adapter.** Primär `BVDetailTarget -> SEGS -> Detailer (SEGS)`; für reine Masken `MaskDetailer (pipe)`. Impact-Typen bleiben an der Adaptergrenze.
3. **Früh danach: generischer interner Crop/Sample/Stitch-Backendvertrag.** Dieser ist wichtiger als eine direkte Kopplung an ein zweites Pack, weil er native ComfyUI-Sampler und mehrere Inpaint-Modelle erlaubt.
4. **Adapter später: Inpaint Crop And Stitch.** Als austauschbarer Transportprovider, insbesondere wegen ausgereiftem Blending, Batch-Support und aktiver 2026-Pflege.
5. **Optional später: Acly-Inpaint-Backends.** LaMa/MAT/Fooocus als Ausführungsstrategie, nicht als Detailerplan.
6. **Nicht separat: EasyUse und Efficiency Nodes ED.** Beides sind für diesen Zweck Impact-Fassaden.
7. **Nicht als Detailer: Detail Daemon.** Optionaler Sampler-Hook bleibt orthogonal.

## Entscheidungsfolgen für das Editor-Interface

Das UI darf „Detailer“ als BV-Konzept zeigen, nicht als Impact-Node-Auswahl. Ein Job konfiguriert Region(en), Promptkomposition, optionale Detector-Pipeline, Reihenfolge und Profil. Unter „Backend“ genügt zunächst `Impact (SEGS)` beziehungsweise `Impact (Mask)`; später können `Native Crop/Stitch`, `CropAndStitch` und promptlose Inpaint-Backends hinzukommen, ohne Planformat oder Loop-Semantik zu ändern.

Damit ist die Antwort auf die Ausgangsfrage klar: Es gibt derzeit keinen anderen großen Rising Star mit einem konkurrierenden Segmentformat, den BV sofort gleichrangig unterstützen müsste. Es gibt jedoch einen sehr relevanten zweiten **Ausführungsstil** – standardisiertes Crop/Sample/Stitch auf `IMAGE + MASK`. Genau deshalb sollte der Kern masken-/ROI-basiert und Impact nur der erste Adapter sein.

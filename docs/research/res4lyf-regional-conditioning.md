# RES4LYF Regional Conditioning

## Untersuchungsrahmen

Diese Notiz untersucht RES4LYF ausschließlich als technische Referenz für eine mögliche Regional-Prompting-Funktion im BV NodePack. Analysiert wurden der Quellcode und die mitgelieferten Workflows des folgenden, unveränderlichen Snapshots:

- Repository: [ClownsharkBatwing/RES4LYF](https://github.com/ClownsharkBatwing/RES4LYF)
- Branch: `main`
- Commit: [`26036f647ca15d3048a193daf99a40cecfc3820d`](https://github.com/ClownsharkBatwing/RES4LYF/tree/26036f647ca15d3048a193daf99a40cecfc3820d)
- Untersuchungsdatum: 2026-08-16

Alle Aussagen im Abschnitt „Bestätigte Fakten“ beziehen sich auf diesen Snapshot. Architekturfolgerungen für BV sind separat gekennzeichnet.

## Kurzfazit

RES4LYF implementiert Regional Prompting nicht als gewöhnliches ComfyUI Area Conditioning. Es kombiniert:

1. regionale `CONDITIONING`-Objekte und Masken,
2. daraus erzeugte Cross- und Self-Attention-Masken,
3. modellfamilienabhängige Patches der Diffusionsmodellklassen und Attention-Blöcke sowie
4. spezielle Sampler-Logik, welche die Regionaldaten für die konkrete Latent-Größe vorbereitet und in den Modellaufruf transportiert.

Der Regional-Output trägt zwar den ComfyUI-Typ `CONDITIONING`, ist aber **nicht mit einem normalen KSampler ausführbar**. Der Standard-KSampler wertet den eingebetteten `callback_regional` nicht aus und übergibt die RES4LYF-spezifischen Objekte nicht an den gepatchten Modellcode.

## Bestätigte Fakten

### Relevante Nodes und Dateien

Die Node-Registrierung befindet sich in [`__init__.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/__init__.py). Relevant sind insbesondere:

- `ClownRegionalConditioning`
- `ClownRegionalConditionings`
- `ClownRegionalConditioning2`
- `ClownRegionalConditioning3`
- `ClownRegionalConditioning_AB`
- `ClownRegionalConditioning_ABC`

Die Implementierungen liegen in [`conditioning.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/conditioning.py):

- `ClownRegionalConditioning_AB` und `_ABC` modellieren zwei beziehungsweise drei feste Regionen.
- `ClownRegionalConditioning2` und `3` sind vereinfachte Varianten davon.
- `ClownRegionalConditioning` fügt jeweils eine Region zu einer Kette des Custom Types `COND_REGIONS` hinzu.
- `ClownRegionalConditionings` kompiliert eine beliebig lange `COND_REGIONS`-Kette in ein als `CONDITIONING` deklariertes Objekt.

Die Attention-Masken und regionalen Kontextcontainer werden in [`attention_masks.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/attention_masks.py) implementiert. Die zentralen Klassen sind:

- `BaseAttentionMask`
- `FullAttentionMask`
- `FullAttentionMaskHiDream`
- `CrossAttentionMask`
- `SplitAttentionMask`
- `RegionalContext`

Die modellfamilienabhängigen Patch-Nodes liegen in [`models.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/models.py):

- `ReFluxPatcher` / `ReFluxPatcherAdvanced`
- `ReChromaPatcher` / `ReChromaPatcherAdvanced`
- `ReHiDreamPatcher` / `ReHiDreamPatcherAdvanced`
- `ReSD35Patcher` / `ReSD35PatcherAdvanced`
- `ReSDPatcher`
- `ReAuraPatcher` / `ReAuraPatcherAdvanced`
- `ReWanPatcher` / `ReWanPatcherAdvanced`

Diese Patcher klonen das ComfyUI-`MODEL` und ersetzen über `add_object_patch` Modell-, Block- oder Attention-Klassen durch RES4LYF-Implementierungen aus den Verzeichnissen `flux/`, `chroma/`, `hidream/`, `sd35/`, `sd/`, `aura/` und `wan/`.

### Datenfluss und Custom Types

`ClownRegionalConditioning` erzeugt keine serialisierte Szenenbeschreibung, sondern erweitert eine Python-Liste vom Custom Type `COND_REGIONS`. Jeder Eintrag enthält:

```text
use_self_attn_mask
edge_width
conditioning
mask
```

`ClownRegionalConditionings` liest diese Liste, erzeugt zunächst ein nullbasiertes `CONDITIONING` und speichert darin einen `callback_regional`. Dieser Callback benötigt später das konkrete Modell, um die endgültigen Regionaldaten zu erzeugen.

Beim Kompilieren entstehen drei zentrale Objekte:

- `AttnMask`: modellabhängige Cross-/Self-Attention-Maske,
- `RegContext`: zusammengeführte regionale Text- beziehungsweise zusätzliche Modellkontexte,
- `RegParam`: zeitabhängige Regionalgewichte und Region-Bleed-Werte.

Die spezielle Sampler-Logik in [`beta/samplers.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/beta/samplers.py) ruft `callback_regional` mit dem tatsächlich verwendeten Modell auf. Anschließend setzt sie Latent-Abmessungen, generiert die Attention-Maske und legt `AttnMask`, `RegContext` und `RegParam` in den Sampler-Optionen ab.

### Sampling- und Model-Patch-Mechanik

RES4LYF maskiert die Attention direkt:

- Regionale Text-Embeddings werden zu einem gemeinsamen regionalen Kontext zusammengeführt.
- Die Cross-Attention zwischen Bildtokens und den Texttokens einer Region wird durch deren Maske begrenzt.
- Je nach Modellfamilie wird zusätzlich die Self-Attention zwischen Bildtokens regional getrennt.
- `edge_width` öffnet Self-Attention an Regionsgrenzen, um sichtbare Nähte zu reduzieren.
- `spineless` deaktiviert die Self-Attention-Isolation für die jeweilige Region, lässt die regionale Cross-Attention aber bestehen.

Für SD 1.5 und SDXL wird `SplitAttentionMask` verwendet. WAN verwendet abhängig von Sliding-Self-Attention `CrossAttentionMask` oder `SplitAttentionMask`. HiDream besitzt `FullAttentionMaskHiDream`; die übrigen unterstützten Modelltypen verwenden im Compilerpfad `FullAttentionMask`.

Die Intensität ist nicht nur ein statischer Strength-Wert. `weight` und `region_bleed` können entweder konstant oder über `SIGMAS` beziehungsweise einen Scheduler zeitabhängig sein. `start_step`, `end_step` und `region_bleed_start_step` begrenzen ihre Aktivität im Samplingverlauf.

### Inkompatibilität mit normalen KSamplern

Die mitgelieferten Regional-Nodes geben formal `CONDITIONING` aus. Dieses Objekt ist dennoch kein vollständig vorbereitetes Standard-Conditioning:

- Die Node hinterlegt zunächst nur `callback_regional`.
- Der Callback wird erst in RES4LYFs Beta-Sampler aufgerufen.
- Erst dort werden die Masken an die tatsächliche Latent-Größe angepasst und `AttnMask`, `RegContext` und `RegParam` in den Samplertransport übernommen.
- Der gepatchte Modellcode erwartet genau diese zusätzlichen Transformer-Optionen.

Ein normaler ComfyUI-KSampler kennt diesen Vertrag nicht. Ein `Re*Patcher` allein reicht ebenfalls nicht, weil die Sampler-seitige Callback- und Optionslogik fehlt. Der Einführungsworkflow dokumentiert ausdrücklich, dass Regional Conditioning einen `Re`-Patcher und die Beta-Versionen von ClownSampler plus SharkSampler oder ClownsharKSampler benötigt: [`intro to clownsampling.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/intro%20to%20clownsampling.json).

### Regionen, Restregion und Main Prompt

RES4LYF besitzt im Regionalmodell keinen gesonderten „Main Prompt“.

Bei den vereinfachten Zwei-Zonen-Nodes gibt es ein maskiertes und ein unmaskiertes Conditioning. Das unmaskierte Conditioning übernimmt in den Beispielen faktisch die Rolle des Hintergrund- oder Main-Prompts.

Beim beliebig langen `COND_REGIONS`-Modell ist jede Prompt-/Masken-Kombination eine eigenständige Region. Wird beim nächsten beziehungsweise letzten `ClownRegionalConditioning` keine Maske verbunden, berechnet die Node eine Restmaske aus der noch nicht von früheren Regionen belegten Fläche. Der Einführungsworkflow empfiehlt dies ausdrücklich, um unconditionierte Lücken zu vermeiden.

Ein globaler Prompt, der zugleich innerhalb aller Regionen gilt, ist nicht als eigener Kanal modelliert. Er müsste entweder:

- vor dem Encoding in jeden Regionalprompt eingearbeitet werden oder
- als zusätzliche Vollbildregion verwendet werden.

Die zweite Variante erzeugt Überlappungen und muss hinsichtlich Gewichtung und Bildwirkung separat getestet werden.

### Overlap-Semantik

RES4LYF definiert keine explizite Priorität, Z-Reihenfolge oder „höchste Region gewinnt“-Regel. Jede Regionsmaske wird unabhängig in die Attention-Matrix eingetragen. Liegt ein Bildtoken in mehreren Masken, kann es deshalb auf die Textkontexte mehrerer Regionen zugreifen.

Damit ist Overlap funktional vorgesehen, aber semantisch eher ein gemeinsamer beziehungsweise additiver Attention-Bereich als ein Layer-Compositor. Die Self-Attention-Teilmasken werden vereinigt; `edge_width` kann zusätzliche Übergangsbereiche öffnen.

Mitgelieferte Workflows demonstrieren sowohl verschachtelte als auch überlappende Zonen:

- [`flux regional redux (3 zone, nested).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%283%20zone%2C%20nested%29.json)
- [`flux regional redux (3 zone, overlapping).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%283%20zone%2C%20overlapping%29.json)

### Negative Conditioning

[`beta/samplers.py`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/beta/samplers.py) besitzt einen symmetrischen Verarbeitungsweg für Regionaldaten im negativen Conditioning. Dafür werden separate Objekte `AttnMask_neg`, `RegContext_neg` und `RegParam_neg` erzeugt.

Der Einführungsworkflow hebt regionales negatives Conditioning ausdrücklich für HiDream hervor und beschreibt es dort als hilfreich zur regionalen Stilkontrolle. Aus dem vorhandenen Code allein folgt jedoch nicht, dass negatives Regional Conditioning in jeder unterstützten Modellfamilie qualitativ und semantisch gleichwertig funktioniert. Das ist pro Zielmodell zu verifizieren.

### Unterstützte Modellfamilien

Das [`README.md`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/README.md) nennt für Regional Conditioning:

- HiDream
- Flux
- Chroma
- SD3.5
- SD 1.5
- SDXL
- AuraFlow
- WAN

Die jeweiligen Patcher und die modellbezogenen Implementierungsverzeichnisse bestätigen diese Aufteilung im untersuchten Snapshot. Die Unterstützung ist kein generischer Modellvertrag: Jede Modellfamilie benötigt einen passenden `Re*Patcher` und angepassten Attention-/Modellcode.

### Mitgelieferte Workflow-Referenzen

Die wichtigste Gesamtreferenz ist:

- [`intro to clownsampling.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/intro%20to%20clownsampling.json)

Spezifische Regional-Workflows im Verzeichnis [`example_workflows`](https://github.com/ClownsharkBatwing/RES4LYF/tree/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows) sind:

- [`chroma regional antiblur.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/chroma%20regional%20antiblur.json)
- [`flux regional antiblur.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20antiblur.json)
- [`flux regional redux (2 zone).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%282%20zone%29.json)
- [`flux regional redux (3 zone, nested).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%283%20zone%2C%20nested%29.json)
- [`flux regional redux (3 zone, overlapping).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%283%20zone%2C%20overlapping%29.json)
- [`flux regional redux (3 zones).json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/flux%20regional%20redux%20%283%20zones%29.json)
- [`hidream regional 3 zones.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/hidream%20regional%203%20zones.json)
- [`hidream regional antiblur.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/hidream%20regional%20antiblur.json)
- [`sdxl regional antiblur.json`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/example_workflows/sdxl%20regional%20antiblur.json)

Die Antiblur-Workflows sind besonders relevant für `edge_width`, asymmetrische Bool-Masken und die Trennung zwischen Objekt- und Hintergrundregion. Zu mehreren Workflows liegen im selben Verzeichnis Resultat- und Workflow-Screenshots vor.

### Abhängigkeiten

[`requirements.txt`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/requirements.txt) und [`pyproject.toml`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/pyproject.toml) deklarieren:

- `opencv-python`
- `matplotlib`
- `pywavelets`
- `numpy>=1.26.4`

Zusätzlich setzt der untersuchte Regionalcode PyTorch, `einops` und zahlreiche interne ComfyUI-Module voraus. Diese werden nicht als eigenständige Regional-Abhängigkeiten deklariert, weil sie typischerweise über ComfyUI beziehungsweise dessen Laufzeitumgebung vorhanden sind.

`rgthree-comfy` wird im README für verschachtelte Sampler-Menüs empfohlen, ist aber keine technische Kernabhängigkeit des Regional-Conditioning-Pfads. Einzelne Beispielworkflows können zusätzliche Utility-Nodes wie `MaskPreview` enthalten.

## Lizenz- und Reuse-Grenze

Die Lizenzlage ist widersprüchlich:

- Die Datei [`LICENSE`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/LICENSE) beginnt mit einer zusätzlichen Klausel, die die Verwendung der Software oder abgeleiteter Werke für kommerzielle Services ohne Erlaubnis beziehungsweise separate kommerzielle Lizenz untersagt. Darauf folgt der Text der GNU AGPLv3.
- [`pyproject.toml`](https://github.com/ClownsharkBatwing/RES4LYF/blob/26036f647ca15d3048a193daf99a40cecfc3820d/pyproject.toml) deklariert dagegen `license = "MIT"`.

Diese Angaben sind nicht miteinander vereinbar. Für BV ist deshalb konservativ die restriktivere `LICENSE`-Datei maßgeblich, bis der Rechteinhaber die Lizenzlage schriftlich geklärt hat.

Folgende Grenze gilt für die weitere Arbeit:

- keine direkte Codeübernahme,
- kein Copy/Paste einzelner Algorithmen oder Modellklassen,
- keine mechanische Portierung oder eng abgeleitete Implementierung,
- keine Übernahme RES4LYF-spezifischer interner Datenstrukturen als Implementierungsabkürzung.

RES4LYF darf als **Clean-Room-Referenz** für öffentlich beobachtbares Verhalten, Anforderungen, Testfälle und abstrakte Architekturkonzepte dienen. Eine BV-Implementierung muss eigenständig auf Basis offizieller ComfyUI-Schnittstellen und eigener technischer Entscheidungen entstehen. Diese Notiz ist keine Rechtsberatung; vor einer engeren Wiederverwendung wäre eine explizite Lizenzfreigabe oder rechtliche Prüfung erforderlich.

## Architekturfolgerungen für BV

Die folgenden Punkte sind Schlussfolgerungen aus dem bestätigten Verhalten, keine Aussagen über bereits implementierte BV-Funktionalität.

### 1. Persistentes Dokument und Sampling-Backend trennen

`BV_REGIONAL_AST` sollte ausschließlich die dauerhafte, versionierte Szenenbeschreibung transportieren:

- Canvas und Koordinatensystem,
- Main Prompt,
- Regionen und Geometrien,
- regionale Prompts,
- IDs und Metadaten,
- Strength-, Übergangs- und gegebenenfalls Zeitparameter.

Modell- oder Samplerobjekte, Tensoren und Callbacks gehören nicht in diesen Vertrag. Dadurch bleibt der Editor unabhängig von der später gewählten Samplingtechnik.

### 2. Zwei Backends vorsehen

Eine sinnvolle Architektur erlaubt mindestens zwei Compilerpfade:

1. **Standard-Backend:** Übersetzung in natives ComfyUI Area/Mask Conditioning. Vorteil: normale KSampler; Nachteil: begrenztere regionale Isolation.
2. **Attention-Backend:** eigenständiger, modellfamilienbezogener Patch- und Samplingpfad für stärkere Cross-/Self-Attention-Trennung.

RES4LYF belegt, dass der zweite Pfad mehr als eine Conditioning-Node benötigt. Soll BV eine vergleichbare Isolation erreichen, muss der Vertrag zwischen Compiler, Modellpatch und Sampler ausdrücklich entworfen werden.

### 3. Main Prompt explizit definieren

BV sollte die in RES4LYF fehlende Main-Prompt-Semantik nicht implizit lassen. Vor Implementierung ist festzulegen, ob der Main Prompt:

- überall gilt und regionale Prompts ergänzt,
- nur für die Restregion gilt oder
- pro Region wahlweise ergänzt beziehungsweise ersetzt wird.

Für das Attention-Backend ist „Main überall“ nicht automatisch eine bloße Vollbildregion, weil dadurch systematische Overlaps entstehen. Der Compiler muss die gewünschte Semantik gezielt in regionale Textkontexte übersetzen.

### 4. Restregion und Lücken validieren

Der Editor kann geometrisch nicht abgedeckte Flächen zuverlässig erkennen. BV sollte dafür eine explizite, automatisch erzeugbare Restregion anbieten und vor dem Sampling warnen oder blockieren, wenn Flächen ohne Conditioning entstehen und dies nicht ausdrücklich gewünscht ist.

### 5. Overlap als eigener Vertrag

RES4LYFs Mehrfach-Attention in Überlappungen ist nur eine mögliche Semantik. `BV_REGIONAL_AST` sollte Overlap nicht vorschnell als Layer-Priorität interpretieren. Sinnvolle explizite Modi wären später beispielsweise:

- gemeinsam/additiv,
- normalisiert,
- Priorität gewinnt,
- niedrigere Maske ausschneiden.

Jeder Modus benötigt definierte Maskenoperationen und visuelle Referenztests.

### 6. Übergangsparameter fachlich benennen

Die RES4LYF-Konzepte `edge_width`, Self-Attention-Isolation und zeitabhängiger Region Bleed zeigen, dass ein einzelner Strength-Regler für hochwertiges Regional Prompting möglicherweise nicht genügt. BV sollte diese Konzepte zunächst im Backend-Modell kapseln und nur solche Parameter in das öffentliche AST aufnehmen, deren modellübergreifende Bedeutung stabil definiert werden kann.

### 7. Negative Regionen separat verifizieren

Das Schema kann regionale negative Prompts früh vorsehen. Ihre Aktivierung im Compiler sollte jedoch pro Modellfamilie getestet und als Capability ausgewiesen werden. Aus einem vorhandenen symmetrischen Codepfad folgt keine garantierte qualitative Gleichwertigkeit.

## Offene Verifikationen mit dem BV-Referenzworkflow

Der noch bereitzustellende Beispielworkflow sollte verwendet werden, um mindestens folgende Punkte festzuhalten:

- tatsächlich eingesetzte Modellfamilie und Patcher,
- gewünschte Main-Prompt-Semantik,
- Verhalten zweier überlappender Regionen,
- gewünschte Isolation gegenüber Prompt Bleeding,
- Rolle von Self-Attention, `edge_width` und Region Bleed,
- globale und regionale Negative Conditionings,
- erwartete Samplerkompatibilität,
- benötigte Deconstructor-Ausgaben für den nachfolgenden Detailer.

Erst dieser Vergleich trennt zwingende Produktanforderungen von Besonderheiten der RES4LYF-Referenzimplementierung.

# LC123 und Anima Regional Conditioning

## Untersuchungsrahmen

Diese Notiz untersucht zwei lokal installierte NodePacks als technische Referenz für das geplante Regional Prompting im BV NodePack:

- [lonecatone23/ComfyUI_LC123_nodes](https://github.com/lonecatone23/ComfyUI_LC123_nodes), lokaler Commit [`79b81758ac54ba8f9b46ecf7682902e87dc26684`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/tree/79b81758ac54ba8f9b46ecf7682902e87dc26684)
- [Sen-sou/Comfyui-Anima-Regional-Conditioning](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning), lokaler Commit [`099cf1fa052721394963418455d49f7087efaf6c`](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning/tree/099cf1fa052721394963418455d49f7087efaf6c)
- Untersuchungsdatum: 2026-08-16

Die lokalen Checkouts lagen unter:

```text
X:\Stability Matrix\Data\Packages\ComfyUI 2026-06\custom_nodes\ComfyUI_LC123_nodes
X:\Stability Matrix\Data\Packages\ComfyUI 2026-06\custom_nodes\Comfyui-Anima-Regional-Conditioning
```

Der installierte LC123-Checkout meldet in [`pyproject.toml`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/pyproject.toml) Version 1.5.0. Das Remote-README auf `main` meldete zum Untersuchungszeitpunkt bereits Version 1.7.3. Der lokale Checkout liegt daher hinter dem aktuellen Remote-Stand. Alle Detailaussagen zu LC123 beziehen sich ausdrücklich auf den oben gepinnten lokalen Commit, nicht ungeprüft auf das spätere `main`.

## Kurzfazit

Die beiden Referenzen bestätigen eine für BV wichtige Architektur:

1. Ein komfortabler Editor kann modellneutral Masken und Prompts erzeugen.
2. Krea2 lässt sich im untersuchten Workflow über natives ComfyUI Mask-/Area-Conditioning und einen normalen KSampler ansteuern.
3. Anima benötigt für stärkere regionale Trennung einen architekturspezifischen Model-Patch, kann danach aber ebenfalls mit einem normalen KSampler gesampelt werden.
4. Sen-sous Anima-Backend unterstützt technisch beliebig viele und auch überlappende Masken. Die Beschränkung auf drei nicht überlappende Regionen stammt allein aus LC123s einzelner RGB-Malfläche.

Damit ist weder ein proprietärer Regional-Sampler noch ein auf drei Farben begrenztes BV-Datenmodell erforderlich. Sinnvoll ist ein stabiles `BV_REGIONAL_AST` mit mehreren Compiler-/Backendpfaden.

## Relevante Dateien und Workflows

### LC123

Die gemeinsame Canvas-, Prompt- und Native-Conditioning-Logik liegt in [`regional_canvas_common.py`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/regional_canvas_common.py). Die zwei zielmodellspezifischen Nodes befinden sich in:

- [`krea2_regional_canvas.py`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/krea2_regional_canvas.py)
- [`anima_regional_canvas.py`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/anima_regional_canvas.py)
- [`web/inline_regional_canvas.js`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/web/inline_regional_canvas.js) für Maloberfläche, Persistenz und Apply-Interaktion

Der lokale Checkout enthält insbesondere diese Referenzworkflows:

- `workflows/Krea2 Inline Regional Canvas Example.json`
- `workflows/Anima Regional Conditioning WF.json`
- `workflows/Anima Inline Regional Canvas workflow.json`

### Sen-sou

Sen-sous vollständige Implementierung befindet sich in [`nodes.py`](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning/blob/099cf1fa052721394963418455d49f7087efaf6c/nodes.py). Die beiden öffentlichen Nodes sind:

- `AnimaConditioningRegion`
- `ApplyAnimaRegionalConditioningPatch`

Das Repository dokumentiert Verhalten, Parameter und Einschränkungen im gepinnten [`README.md`](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning/blob/099cf1fa052721394963418455d49f7087efaf6c/README.md) und liefert `workflows/Regional Conditioning WF.json` als eigene Workflowreferenz.

## LC123-Editor und persistentes Maskenmodell

### Darstellungsmodell

LC123 registriert den Editor als DOM-Widget direkt auf der Graph-Node. Das Widget ist skalierbar und setzt `hideOnZoom: false`, bleibt aber Teil der transformierten Graphdarstellung. Es ist damit nicht mit dem für BV geplanten Floating-Modus vergleichbar: Graph-Pan und Graph-Zoom beeinflussen den LC123-Editor weiterhin.

Die Oberfläche bietet eine einzelne Malfläche mit drei fest verdrahteten Regionsfarben:

```text
RED
GREEN
BLUE
```

Weiß ist die unbemalte Restfläche beziehungsweise der Radierer. Die autoritative Maske ist ein einzelnes RGB-Bild. Ein Pinselstrich schreibt per `source-over`; eine neu gemalte Farbe ersetzt die vorhandene Farbe an dieser Stelle. Malen stapelt keine Regionszugehörigkeiten.

### Keine Overlaps im LC123-Editor

Aufgrund dieses Single-RGB-Modells kann ein Pixel genau einer Farbe oder der weißen Restfläche angehören. LC123s Editor kann daher keine überlappenden Regionen darstellen. Diese Einschränkung stammt nicht vom Anima-Patch: Sen-sou akzeptiert separate `MASK`-Tensoren und bewahrt deren Überlappungen.

### Persistenz

Die Malfläche wird als JSON gespeichert:

```json
{
  "version": 2,
  "width": 1024,
  "height": 1024,
  "data_url": "data:image/png;base64,..."
}
```

Der Wert landet sowohl im serialisierbaren Widget `canvas_data` als auch in `node.properties.arcCanvasData`. Promptwerte werden zusätzlich in `node.properties.animaPrompts` gehalten. `onSerialize` schreibt den aktuellen Zustand; `onConfigure` stellt ihn wieder her und enthält eine Migration für ältere 300-x-150-Defaults. Ein zusätzlicher Browser-Backupmechanismus schützt gegen verlorene Widgetwerte.

Damit wird die komplette gemalte PNG-Maske als Base64 in den Workflow eingebettet. Das ist robust für eine kleine, feste Malmaske, kann bei großen Dokumenten aber Workflowdateien erheblich vergrößern. BV sollte fachliche Regiongeometrien nach Möglichkeit strukturiert speichern und gerasterte Masken nur dann einbetten, wenn sie tatsächlich Freihanddaten enthalten.

### Hintergrund und Apply-Lebenszyklus

Ein verbundener `IMAGE`-Input dient als visuelle Unterlage; er wird getrennt von der autoritativen RGB-Maske behandelt. Der Graph kann bis zum Klick auf `Apply` beziehungsweise bei leerer Maske angehalten werden. Die Browseroberfläche sendet den bestätigten Canvaszustand über die Route `/anima/canvas/apply`, worauf der Python-Teil den Lauf für die betreffende Node-ID fortsetzt.

Der Editor besitzt nur eine globale Maskenstärke. Sie skaliert die Farbintensität aller gemalten Regionen. Beim Anima-Pfad ist der angezeigte `region_strength` lediglich Teil der JSON-Metadaten; die tatsächliche Anima-Regionsstärke wird später pro `AnimaConditioningRegion.weight` festgelegt.

## Masken- und Promptsemantik in LC123

[`regional_canvas_common.py`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/regional_canvas_common.py) ordnet jedes nichtweiße Pixel anhand des Abstands exklusiv dem nächsten R-, G- oder B-Zielwert zu. Die Basismaske wird als Komplement der Vereinigungsmaske berechnet.

### Krea2

Der Krea2-Pfad erzeugt normales ComfyUI-`CONDITIONING`:

- global/default: `quality_prompt + scene_prompt`
- je gemalter Region: `quality_prompt + region_prompt`
- negativ: ein gemeinsames `negative_prompt`

Regionale Conditionings erhalten native ComfyUI-Metadaten für `mask`, `mask_strength`, `area`, `strength` und `set_area_to_bounds`. LC123 erweitert die Masken leicht und ergänzt eine etwas größere Bounding Box, um harte Panel-/Cutout-Artefakte zu reduzieren. Die Restfläche erhält erneut das globale Quality-/Scene-Conditioning.

Der Workflowdatenfluss ist:

```text
CLIPLoader(type=krea2)
        │
        ▼
Krea2RegionalCanvasInline
        ├── POSITIVE ────────┐
        └── NEGATIVE ────────┼──► Standard-KSampler
UNETLoader(Krea2) ───────────┤
LATENT ──────────────────────┘
```

Der lokale Beispielworkflow verwendet `krea2_Turbo_Bf16.safetensors`, einen `CLIPLoader` mit Typ `krea2` und direkt den Standard-`KSampler`. Weder ein Model-Patch noch ein spezieller Sampler ist beteiligt. Dies ist natives Mask-/Area-Conditioning, keine harte architekturspezifische Attention-Isolation. LC123 bezeichnet diese Krea2-Node selbst als Beta.

### Anima

Der Anima-Canvas gibt Conditionings und Masken bewusst getrennt aus:

- `GLOBAL`: `quality_prompt + scene_prompt`
- `RED`, `GREEN`, `BLUE`: jeweils `quality_prompt + region_prompt`, ohne Scene
- `NEGATIVE`: ein globales negatives Conditioning
- je Farbe eine separate `MASK`

Der Scene-Prompt wird absichtlich nicht in jeden Regionalprompt kopiert, damit Regionen nicht jeweils eine eigene Umgebung erfinden. `GLOBAL` wird im Referenzworkflow sowohl an den positiven Eingang des KSamplers als auch an `background_conditioning` des Anima-Patches angeschlossen.

Damit ist die Main-Prompt-Semantik nicht schlicht „Main überall plus Region“. Sie setzt sich aus Background-Conditioning, dem ursprünglichen positiven Samplerkontext, `base_mode` und dem ungepatchten Mischanteil `base_ratio` zusammen.

## Anima-Workflowdatenfluss

Die drei LC123-Regionen werden im Beispiel einzeln in Sen-sous Custom Type übersetzt:

```text
RED CONDITIONING + RED MASK
              │
              ▼
AnimaConditioningRegion
              │ regions
GREEN COND + GREEN MASK
              ▼
AnimaConditioningRegion
              │ regions
BLUE COND + BLUE MASK
              ▼
AnimaConditioningRegion
              │
              ▼
ApplyAnimaRegionalConditioningPatch ◄── Anima MODEL
              │ patched MODEL
              ▼
Standard-KSampler ◄── GLOBAL positive / NEGATIVE
```

`ANIMA_CONDITIONING_REGIONS` ist intern eine unveränderliche verkettete Liste aus `mask`, `conditioning` und `weight`. Beim Apply wird die Kette in Erstellungsreihenfolge abgeflacht. Die Sen-sou-Struktur ist nicht auf drei Regionen begrenzt.

Der LC123-Beispielworkflow nutzt den Patch nur im frühen Samplingabschnitt. Dokumentiert sind unter anderem `start_percent = 0`, `end_percent = 0.35`, harte Cross-Attention-Maskierung und eine schwächere Self-Attention-Isolation. Die im Workflow gespeicherten Werte weichen teilweise von Sen-sous README-Empfehlungen ab; sie sind daher Workflow-Tuning und kein universeller Vertrag.

## Sen-sous Anima-Patchmechanik

### Modellvalidierung und Patchregistrierung

`ApplyAnimaRegionalConditioningPatch` validiert ausdrücklich `model_config.unet_config.image_model == "anima"`. Zusätzlich erwartet die Implementierung ein Diffusionsmodell mit `blocks` und `patch_spatial`. Das MODEL wird geklont; anschließend registriert die Node über `comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL` einen Diffusionsmodell-Wrapper. Das Originalmodell wird nicht global verändert.

### Regionaler Kontext

Der Wrapper liest den normalen positiven beziehungsweise negativen Samplerkontext sowie `cond_or_uncond` und `sigmas` aus `transformer_options`. Regionale Textconditionings werden animaspezifisch vorbereitet: Sind `t5xxl_ids` und optionale Gewichte in den Conditioning-Metadaten vorhanden, ruft der Patch `diffusion_model.preprocess_text_embeds` auf.

Anschließend entsteht ein gemeinsamer Textkontext:

```text
[ base/background | region 1 | region 2 | ... | region N ]
```

Unconditional Chunks werden auf dieselbe Länge aufgefüllt, dürfen aber nur auf den Basisslot zugreifen.

### Masken auf dem Anima-Tokenraster

Der Wrapper erwartet ein fünf-dimensionales Anima-Latent `[B,C,T,H,W]`. Aus `patch_spatial` und `patch_temporal` berechnet er das tatsächliche DiT-Tokenraster und skaliert jede Regionsmaske darauf. Ein positiver Maskenwert bedeutet Regionsmitgliedschaft.

Überlappungen bleiben erhalten: Ein Latenttoken darf Mitglied mehrerer Regionen sein und damit gleichzeitig auf mehrere regionale Textslots zugreifen. Das ist eine Multi-Slot-Attention-Berechtigung, keine skalare Addition, keine Z-Reihenfolge und kein „oberste Region gewinnt“.

### Cross- und Self-Attention

Für Cross-Attention wird ein Bias aufgebaut, der Bildtokens auf die zulässigen Textslots begrenzt. Optional erzeugt der Patch zusätzlich einen Self-Attention-Bias, damit Bildtokens vorwiegend andere Tokens derselben Region beachten. `cross_mask_strength` und `self_mask_strength` steuern die Härte; hohe Self-Isolation kann laut Sen-sou harte Trennlinien und schlechtere globale Interaktion verursachen.

Während des Modellaufrufs ersetzt der Wrapper temporär `attn_op` der Cross- und optional Self-Attention-Blöcke durch PyTorch Scaled Dot Product Attention mit dem berechneten Bias. Ein `finally`-Block stellt alle originalen Attention-Operationen wieder her.

### Base-Semantik

`base_mode` besitzt drei Modi:

- `global`: Basiskontext gilt überall.
- `uncovered_only`: Basiskontext gilt in der nicht von Regionen belegten Fläche.
- `disabled`: Basiskontext wird nicht als normaler regionaler Slot verwendet.

Vollständig unzugeordnete Token dürfen als numerischer Fallback dennoch auf Basetext zugreifen, damit keine Attention-Zeile vollständig blockiert ist.

`base_ratio` berechnet zusätzlich einen ungepatchten Model-Pass und mischt dessen Ergebnis in den regionalen Pass. Das kann globale Kohärenz zurückbringen, erhöht aber während der aktiven Patchphase den Rechenaufwand erheblich, weil zwei Model-Forwards stattfinden.

## Standard-KSampler-Kompatibilität

Beide untersuchten Pfade verwenden den normalen ComfyUI-KSampler:

- Krea2 gibt direkt normales maskiertes `CONDITIONING` aus.
- Anima gibt ein über ComfyUIs Model-Patcher geklontes und gewrapptes `MODEL` aus; die normalen positiven und negativen Conditionings bleiben KSampler-Eingänge.

Es ist daher kein eigener `BV Regional KSampler` zwingend nötig. Die Aussage „jeder KSampler“ muss trotzdem präzisiert werden: Garantiert ist nur ein Samplerpfad, der ComfyUIs normalen Model-Patcher- und `transformer_options`-Vertrag einschließlich `cond_or_uncond` und `sigmas` benutzt. Fremde Custom Sampler, die diese Wrapper oder Optionen umgehen, sind nicht automatisch kompatibel.

## Modell- und Versionsbindung

### Anima

Sen-sou ist absichtlich Anima-spezifisch und nicht allein aufgrund ähnlicher Latents auf WAN, Cosmos oder Flux übertragbar. Der Patch hängt an mehreren konkreten ComfyUI-/Anima-Interna:

- fünf-dimensionales Anima-Latent,
- `diffusion_model.blocks`,
- `cross_attn.attn_op` und `self_attn.attn_op`,
- `patch_spatial` und `patch_temporal`,
- `preprocess_text_embeds`,
- T5XXL-Metadaten im Conditioning,
- `comfy.patcher_extension` und dessen Wrappervertrag.

Das Repository deklariert keine minimale oder maximale ComfyUI-Version und besitzt keine Compatibility Matrix. Änderungen an diesen internen Schnittstellen können den Patch brechen. Für BV muss das Anima-Backend deshalb als explizite Capability mit Laufzeitvalidierung und klarer Fehlermeldung behandelt werden.

### Krea2

Der LC123-Krea2-Workflow setzt den ComfyUI-CLIP-Typ `krea2` und natives Conditioning voraus. Die Node validiert die Modellarchitektur nicht selbst. Obwohl ihre Hilfsfunktionen formal auch andere CLIP-Objekte encodieren könnten, ist die belegte Qualitäts- und Kompatibilitätsaussage auf Krea2 beschränkt.

## Abhängigkeiten

LC123 deklariert in seinem [`pyproject.toml`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/pyproject.toml) nur Python ab 3.10, importiert im untersuchten Pfad jedoch PyTorch, NumPy, Pillow sowie ComfyUI-, Server- und `aiohttp`-Funktionalität. Für Anima Attention verweist das README zusätzlich auf Sen-sou.

Sen-sou besitzt im untersuchten Snapshot keine `requirements.txt` oder `pyproject.toml`. Der Code benötigt PyTorch und `comfy.patcher_extension`; seine entscheidende Laufzeitabhängigkeit ist damit eine nicht versionierte ComfyUI-Installation mit passender Anima-Implementierung.

## Lizenz- und Clean-Room-Grenzen

Beide untersuchten Repositories stehen in ihren jeweiligen [`LICENSE`](https://github.com/lonecatone23/ComfyUI_LC123_nodes/blob/79b81758ac54ba8f9b46ecf7682902e87dc26684/LICENSE)-Dateien beziehungsweise [Sen-sous `LICENSE`](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning/blob/099cf1fa052721394963418455d49f7087efaf6c/LICENSE) unter MIT-Lizenz.

Eine direkte Übernahme ist dadurch grundsätzlich möglich, erfordert bei Kopien oder substanziellen Teilen aber die Beibehaltung des jeweiligen Copyright- und Lizenzhinweises. Sen-sous README nennt außerdem `sd-forge-couple` und `Regional-Prompting-FLUX` als technische Credits, ohne in der untersuchten Version eine zeilenweise Codeprovenienz auszuweisen.

Für eine klare BV-Eigentums- und Wartungsgrenze ist deshalb der konservative Clean-Room-Weg vorzuziehen:

- beobachtetes Verhalten und Schnittstellen als Referenz verwenden,
- eigenes AST, eigenes UI und eigene Compilerlogik entwerfen,
- keine Funktionen, Kommentare oder JS-Strukturen mechanisch kopieren,
- Sen-sou bei Bedarf zunächst als optionale externe Adapter-Abhängigkeit ansprechen,
- bei späterer direkter Codeübernahme Herkunft und MIT-Hinweise ausdrücklich dokumentieren.

## Architekturfolgerungen für BV

Die folgenden Punkte sind Architekturfolgerungen, keine Aussage über bereits implementierte BV-Funktionalität.

### 1. Editor und Samplingvertrag trennen

Der BV-Editor sollte ausschließlich ein versioniertes, modellneutrales `BV_REGIONAL_AST` erzeugen. Darin gehören Canvas, Prompts, stabile Regions-IDs, Geometrien, Maskenreferenzen, Strength und Overlap-Semantik. Model-Patches, Tensoren und ComfyUI-Laufzeitobjekte gehören nicht in das persistente Dokument.

### 2. Mehrere echte Masken statt einer RGB-Maske

Jede BV-Region sollte eine eigene Geometrie beziehungsweise Maske besitzen. Dadurch werden dynamisch viele Regionen und echte Overlaps möglich. Rechtecke können verlustfrei strukturiert gespeichert und erst beim Kompilieren gerastert werden; Freihanddaten benötigen einen gesonderten kompakten Persistenzvertrag.

### 3. Getrennte Backendpfade

Mindestens zwei Backendtypen sind sinnvoll:

1. **Native Conditioning Backend:** kompiliert zu gewöhnlichem ComfyUI Mask-/Area-Conditioning. Das ist der belegte Krea2-Pfad und ein möglicher Fallback für weitere Modelle.
2. **Anima Attention Backend:** kompiliert Regionen in Sen-sous Custom Type oder später in eine eigenständige BV-Implementierung und gibt ein gepatchtes Anima-MODEL aus.

Der Backendresolver muss das konkrete Modell erkennen, Fähigkeiten ausweisen und inkompatible Kombinationen blockieren. Ein stilles Zurückfallen auf eine qualitativ andere Methode wäre irreführend.

### 4. Kein eigener Sampler im ersten Entwurf

Da sowohl Krea2 als auch Anima im Referenzworkflow mit dem Standard-KSampler funktionieren, sollte BV zunächst `CONDITIONING` und gegebenenfalls ein gepatchtes `MODEL` ausgeben. Ein eigener Sampler ist erst gerechtfertigt, wenn eine gewünschte Funktion nicht über ComfyUI-Model-Wrapper und `transformer_options` transportierbar ist.

### 5. Main-Prompt-Semantik ausdrücklich definieren

LC123 zeigt, dass „Main Prompt“ backendabhängig missverständlich werden kann. BV muss fachlich festlegen, ob der Main Prompt:

- überall gilt und Regionen ergänzt,
- nur in unbedeckten Flächen gilt,
- in Regionen ersetzt wird oder
- pro Region zwischen Add und Replace auswählbar ist.

Der Anima-Compiler muss diese fachliche Semantik gezielt auf `base_mode`, Background-Conditioning, Regiontexte und den ungepatchten Mischpfad abbilden. Sie darf nicht zufällig aus der Verkabelung entstehen.

### 6. Overlap als eigener Vertrag

Sen-sou belegt, dass Anima mehrere Maskenzugehörigkeiten pro Token verarbeiten kann. Dessen aktuelle Bedeutung ist gemeinsame Attention auf mehrere regionale Textslots. BV sollte Overlap deshalb nicht automatisch als grafische Z-Reihenfolge interpretieren. Mögliche spätere Modi wie additiv, normalisiert, Priorität oder Maskensubtraktion benötigen jeweils definierte Compilerregeln und visuelle Regressionstests.

### 7. Anima als First-Class-Backend mit Kompatibilitätsprüfung

Anima-Unterstützung ist technisch möglich, aber an konkrete Modellinternas gebunden. Das BV-Backend sollte beim Laden prüfen, ob die erwarteten Modellattribute und Wrapper-APIs vorhanden sind, und eine verständliche Diagnose liefern. Unterstützte ComfyUI-/Anima-Stände sollten durch automatisierte Strukturtests und mindestens einen visuellen Referenzworkflow dokumentiert werden.

### 8. Generische Deconstructor-Ausgaben bleiben sinnvoll

Da das AST separate Regionen und Masken bewahrt, kann ein späterer Deconstructor unabhängig vom Samplingbackend `MASK`, BBox, Regionsprompt und Metadaten ausgeben. Diese Trennung ermöglicht Detailer-Ketten, ohne Sen-sous Laufzeitstruktur als öffentliches BV-Datenmodell zu übernehmen.

## Offene Verifikationen

Vor Implementierung bleiben insbesondere diese Punkte mit BV-eigenen Referenzworkflows zu testen:

- Bildqualität von nativem Krea2 Conditioning gegenüber stärkerem Attention Routing,
- gewünschte Main-Prompt-Semantik für Krea2 und Anima,
- zwei überlappende Regionen mit widersprüchlichen Prompts,
- Einfluss von `base_mode`, `base_ratio` und Self-Attention-Isolation auf Kohärenz und Nähte,
- Speicher- und Laufzeitkosten des zusätzlichen ungepatchten Anima-Passes,
- Verhalten mit Batches und fremden Custom Samplern,
- konkrete ComfyUI-Versionen, gegen die das Anima-Backend abgesichert werden soll,
- gewünschte Masken-, BBox- oder Detailer-Ausgaben des Deconstructors.

# Third-party notices

This file records third-party code or data incorporated into BV Node Pack and the
licenses or provenance obligations that accompany it. Projects that influenced
design or research without contributing copied code are acknowledged separately
below and in the README.

## Microsoft Fluent Emoji

The cyclone artwork (kept in the repository under `docs/assets/brand/`, not part of
the Registry package) and the derived BV Node Pack brand graphics such as the
Registry icon and banner are based on the Flat variant of the Cyclone emoji from
[`microsoft/fluentui-emoji`](https://github.com/microsoft/fluentui-emoji).

MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Baseline completion tag data

`data/completion/bv_default_tags.csv` was sourced from the
tag-data bundle distributed with
[`comfy-ex-tagcomplete`](https://github.com/jupo-ai/comfy-ex-tagcomplete),
snapshot 3.2.0. It contains tag names, category identifiers, usage counts and
aliases derived from public booru tag indexes. It is included as data, not as
copied ExTagComplete program code. The original upstream project is MIT licensed;
the factual source datasets may have separate terms imposed by their respective
services.

## Comfyui-Anima-Regional-Conditioning

`py/util/regional/anima_patcher.py` is derived from
[`Comfyui-Anima-Regional-Conditioning`](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning).

MIT License

Copyright (c) 2026 Vikas Vishwakarma

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## ComfyUI-Krea2-Regional

`py/util/regional/krea2_token_lora.py` adapts the token-mask, class-swap and
activation-space LoRA/LoKr techniques from revision `307081f2` of
[`ComfyUI-Krea2-Regional`](https://github.com/januspluto/ComfyUI-Krea2-Regional).

The following license text is reproduced verbatim from that pinned revision;
its upstream copyright line contains the placeholder shown below.

MIT License

Copyright (c) 2026 YOUR_NAME

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Bundled frontend libraries

`js/bv_nodepack.core.js` is the pack's frontend, built by Vite from the TypeScript
sources in `ui/src`. It is ordinary minified output, not obfuscated code: the sources,
`ui/package.json`, `ui/package-lock.json` and `ui/vite.config.js` are in the repository,
the build is reproducible, and the bundle starts with a readable header listing the
libraries below. The versions and integrity hashes are the ones the lockfile resolved
for the release; `npm ci` installs exactly these.

| Library | Version | License | Copyright | Lockfile integrity (sha512, first 16 chars) |
|---|---|---|---|---|
| react | 18.3.1 | MIT | Facebook, Inc. and its affiliates | `wS+hAgJShR0KhEvP` |
| react-dom | 18.3.1 | MIT | Facebook, Inc. and its affiliates | `5m4nQKp+rZRb09LN` |
| scheduler | 0.23.2 | MIT | Facebook, Inc. and its affiliates | `UOShsPwz7NrMUqhR` |
| flexlayout-react | 0.10.5 | MIT | 2017 Caplin Systems Ltd | `VP2AGJxERKeECmW1` |
| prismjs | 1.30.0 | MIT | 2012 Lea Verou | `DEvV2ZF2r2/63V+t` |
| react-colorful | 5.8.0 | MIT | 2020-present Vlad Shilov | `Wy9OzPfjSN9bF12O` |
| react-simple-code-editor | 0.14.1 | MIT | 2018-2019 Satyajit Sahoo | `BR5DtNRy+AswWJEC` |
| modern-screenshot | 4.7.0 | MIT | 2021-present wxm | `9YxN+ddPSMMlhylO` |

The full integrity strings are in `ui/package-lock.json`. The libraries are included
unmodified; BV does not patch them, including not to change how automated code scans
read them. All eight are distributed under the MIT License reproduced below; the
copyright line of each holder is given in the table.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## modern-screenshot

BV Node Pack bundles `modern-screenshot` 4.7.0 for BV interface image export.

The MIT License (MIT)

Copyright (c) 2021-present wxm

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Inspiration and research acknowledgements

The following projects informed product design, interoperability research or
architecture discussions. They are not bundled runtime dependencies, and no copied
implementation is claimed unless another section of this file says otherwise.

- [`rgthree-comfy`](https://github.com/rgthree/rgthree-comfy): compact workflow,
  control and seed interaction patterns.
- [`ComfyUI_agilly1989_motorway`](https://github.com/agilly1989/ComfyUI_agilly1989_motorway):
  the original inspiration for configurable, user-named values carried and
  overridden along BV Pipe chains.
- [`cg-use-everywhere`](https://github.com/chrisgoringe/cg-use-everywhere):
  wireless value broadcasting and routing-control concepts that informed the
  Smart Pipe wireless design.
- [`ComfyUI-KJNodes`](https://github.com/kijai/ComfyUI-KJNodes): the Ideogram
  prompt-builder editor and detached authoring workflow.
- [`ComfyUI_LC123_nodes`](https://github.com/lonecatone23/ComfyUI_LC123_nodes):
  painted regional authoring plus Krea 2 and Anima workflow references.
- [`ComfyUI-Impact-Pack`](https://github.com/ltdrdata/ComfyUI-Impact-Pack): public
  `MASK`, `SEGS` and detailer contracts used by the optional BV detailer-mask bridge.
  BV does not vendor or import Impact Pack code.
- [`RES4LYF`](https://github.com/ClownsharkBatwing/RES4LYF): clean-room research
  reference for regional attention, overlap semantics and backend boundaries.
- [`comfy-ex-tagcomplete`](https://github.com/jupo-ai/comfy-ex-tagcomplete):
  completion interoperability and UX research. Its bundled tag-data relationship
  is documented in the first section of this file.
- [`Anima-LLLite-Regional-Controlnet`](https://huggingface.co/Sen-sou/Anima-LLLite-Regional-Controlnet):
  experimental color-layout adapter that motivated the optional BV Regional Anima
  LLLite interoperability node. Its weights are not bundled or downloaded by BV.
- [`ComfyUI-Anima-LLLite`](https://github.com/kohya-ss/ComfyUI-Anima-LLLite):
  LLLite format and runtime reference. BV calls the corresponding native ComfyUI
  core runtime and does not vendor this custom-node implementation.
- [`ComfyUI`](https://github.com/Comfy-Org/ComfyUI): native `MODEL_PATCH` loading and
  Anima LLLite application runtime used by the optional BV integration.
- [`Anima`](https://huggingface.co/circlestone-labs/Anima): underlying model ecosystem;
  users must review its current license and derivative-model terms separately from
  any adapter repository label.

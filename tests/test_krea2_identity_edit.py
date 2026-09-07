import copy
import sys
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import torch
sys.path.insert(0, str(Path(__file__).parents[1] / "py"))

from util.regional import krea2_identity_edit as edit
from util.regional.context import context_document
from util.regional.document import default_document, parse_document
from util.regional.reference_images import resolve_source_image
from util.regional.reference_registry import build_reference_provider, materialize_reference_catalog
from util.regional.v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY


class FakeVae:
    def __init__(self): self.calls = []
    def encode(self, pixels):
        self.calls.append(pixels)
        return torch.ones(1, 16, pixels.shape[1]//8, pixels.shape[2]//8)


class IdentityEditTests(unittest.TestCase):
    def setUp(self):
        self.image = torch.rand(1, 32, 64, 3)
        self.doc = default_document()
        self.selection = dict(collector_id=str(uuid.uuid4()), resource_id=str(uuid.uuid4()), role="source")
        self.doc["reference_images"] = [self.selection]
        self.doc["tool_settings"] = {"references": True}
        self.target = {"samples": torch.zeros(1, 16, 8, 8)}
        sample = types.ModuleType("comfy.sample")
        sample.fix_empty_latent_channels = lambda model, target, spatial, temporal: target
        modules = patch.dict(sys.modules, {"comfy.sample": sample})
        modules.start()
        self.addCleanup(modules.stop)

    def test_config_roundtrip_and_validation(self):
        self.assertEqual(context_document(self.doc)["reference_images"], [self.selection])
        bad = copy.deepcopy(self.doc); bad["reference_images"] *= 2
        with self.assertRaises(ValueError): parse_document(bad)
        bad["reference_images"] = [{**self.selection, "resource_id": "bad"}]
        with self.assertRaises(ValueError): parse_document(bad)

    def test_collector_resolution_returns_current_pixels_and_disable_retains_selection(self):
        config = {"schema":"bv.reference_registry_config", "version":1, "collector_id":self.selection["collector_id"], "entries":[{"id":self.selection["resource_id"], "slot":"media0"}]}
        provider = build_reference_provider(config, {"media0":self.image})
        providers = {"reference_resource_provider_1":provider}
        regional = materialize_reference_catalog(self.doc, {"version":1,"collector_ids":[config["collector_id"]]}, providers, registry=REGIONAL_V3_CAPABILITY_REGISTRY)
        self.assertIs(resolve_source_image(regional, self.doc, providers), self.image)
        with self.assertRaisesRegex(ValueError, "exactly once"): resolve_source_image(regional, self.doc, {**providers,"duplicate":provider})
        with self.assertRaisesRegex(ValueError, "exactly once"): resolve_source_image(regional, self.doc, {})
        self.doc["tool_settings"]["references"] = False
        with self.assertRaisesRegex(ValueError, "enabled"): resolve_source_image(regional, self.doc, providers)
        self.assertEqual(self.doc["reference_images"], [self.selection])

    def test_single_source_and_target_validation(self):
        self.assertEqual(edit.validate_inputs(self.image, self.target, FakeVae(), model=object()), (8,8))
        for image, latent, vae in [(self.image.expand(2,-1,-1,-1),self.target,FakeVae()), (self.image,{"samples":torch.zeros(1,4,8,8)},FakeVae()),(self.image,self.target,None)]:
            with self.assertRaises(ValueError): edit.validate_inputs(image, latent, vae, model=object())

    def test_empty_bv_target_uses_native_sampler_normalization(self):
        target = {"samples": torch.zeros(1, 4, 8, 12), "downscale_ratio_spacial": 8}
        original = target["samples"].clone()
        sample = types.ModuleType("comfy.sample")
        model = object()
        with patch.object(sample, "fix_empty_latent_channels", create=True,
                          return_value=torch.zeros(1, 16, 8, 12)) as fix:
            with patch.dict(sys.modules, {"comfy.sample": sample}):
                self.assertEqual(edit.validate_inputs(self.image, target, FakeVae(), model=model), (8, 12))
            fix.assert_called_once_with(model, target["samples"], 8, None)
        self.assertTrue(torch.equal(target["samples"], original))
        self.assertEqual(target["samples"].shape[1], 4)

    def test_normalized_single_frame_shape_and_metadata(self):
        target = {"samples": torch.zeros(1, 4, 8, 12),
                  "downscale_ratio_spacial": 16, "downscale_ratio_temporal": 4}
        sample = sys.modules["comfy.sample"]
        with patch.object(sample, "fix_empty_latent_channels", return_value=torch.zeros(1, 16, 1, 16, 24)) as fix:
            model = object()
            self.assertEqual(edit.validate_inputs(self.image, target, FakeVae(), model=model), (16, 24))
            fix.assert_called_once_with(model, target["samples"], 16, 4)
        with self.assertRaisesRegex(ValueError, "requires target_latent"):
            edit.validate_inputs(self.image, None, FakeVae(), model=object())
        with self.assertRaisesRegex(ValueError, "16-channel"):
            edit.validate_inputs(self.image, {"samples": torch.ones(1, 4, 8, 8)}, FakeVae(), model=object())
        with self.assertRaisesRegex(ValueError, "one frame"):
            edit.validate_inputs(self.image, {"samples": torch.zeros(1, 16, 2, 8, 8)}, FakeVae(), model=object())

    def test_mentions_translate_only_selected_source_utf16(self):
        pair = self.doc["prompts"]["global"]
        pair["positive_source"] = "😀 change @Image 1"
        pair["references"] = {"positive":[{**{key:self.selection[key] for key in ("collector_id","resource_id")},"label":"@Image 1","start":10,"end":18}]}
        self.assertEqual(edit.edit_prompts(self.doc)[0], "😀 change the source image")
        self.assertIn("@Image", pair["positive_source"])
        pair["references"]["positive"][0]["resource_id"] = str(uuid.uuid4())
        with self.assertRaisesRegex(ValueError,"selected"): edit.edit_prompts(self.doc)

    def test_global_only_guards(self):
        self.doc["prompts"]["background"]["positive_source"] = "background edit"
        with self.assertRaisesRegex(ValueError,"Background"): edit.edit_prompts(self.doc)
        self.doc["prompts"]["background"]["positive_source"] = ""
        self.doc["negative_mode"] = "zero_out"
        with self.assertRaisesRegex(ValueError,"grounded"): edit.edit_prompts(self.doc)

    def test_positive_and_empty_negative_grounded_on_same_image(self):
        calls=[]
        class Clip:
            def tokenize(self,text,**kwargs): calls.append((text,kwargs));return text
            def encode_from_tokens_scheduled(self,tokens): return [[torch.ones(1,2,edit.CONDITIONING_WIDTH),{"hooks":"not duplicated"}]]
        positive, negative = edit.grounded_encode(Clip(),"make blue","",self.image)
        self.assertEqual([call[0] for call in calls],["make blue",""])
        self.assertIs(calls[0][1]["images"][0],calls[1][1]["images"][0])
        self.assertIn("<|image_pad|>",calls[0][1]["llama_template"])
        self.assertNotIn("hooks",positive[0][1]);self.assertTrue(torch.equal(negative[0][0],positive[0][0]))

    def test_fit_and_crop_preparation_preserve_geometry(self):
        for mode, shape in [("fit",(32,64)),("crop",(64,64))]:
            vae=FakeVae()
            result=edit._fit_encode_image(self.image,vae,8,8,{},(),mode)
            self.assertEqual(tuple(vae.calls[0].shape[1:3]),shape)
            self.assertEqual(tuple(result.shape[-2:]),tuple(x//8 for x in shape))

    def test_forward_source_first_target_only_and_centered_rope(self):
        captures={}
        class Model:
            patch=2;tdim=4;channels=16
            first=staticmethod(lambda x:x)
            _unpack_context=staticmethod(lambda x:x)
            txtfusion=staticmethod(lambda x,**kwargs:x)
            txtmlp=staticmethod(lambda x:x)
            tmlp=staticmethod(lambda x:x)
            tproj=staticmethod(lambda x:x)
            last=staticmethod(lambda x,t:x)
            def pe_embedder(self,ids): captures['ids']=ids;return ids
        def block(tokens,t,f,bias,**kwargs): captures['tokens']=tokens;captures['bias']=bias;return tokens
        model=Model();model.blocks=[block]
        layers=types.ModuleType('comfy.ldm.flux.layers');layers.timestep_embedding=lambda t,d:torch.zeros(len(t),d)
        x=torch.full((2,16,4,4),2.);source=torch.ones(1,16,2,4);context=torch.zeros(2,1,64)
        with patch.dict(sys.modules,{'comfy.ldm.flux.layers':layers}):
            result=edit.edit_forward(model,x,torch.ones(2),context,source,{},2.,'fit')
            temporal_result=edit.edit_forward(model,x.unsqueeze(2),torch.ones(2),context,source,{},2.,'fit')
            self.assertTrue(torch.equal(temporal_result, x.unsqueeze(2)))
            with self.assertRaisesRegex(ValueError, 'still images'):
                edit.edit_forward(model,x.unsqueeze(2).expand(-1,-1,2,-1,-1),torch.ones(2),context,source,{},2.,'fit')
        self.assertTrue(torch.equal(result,x))
        self.assertTrue(torch.all(captures['tokens'][:,1:3]==1))
        self.assertTrue(torch.all(captures['ids'][:,1:3,0]==1))
        self.assertTrue(torch.all(captures['ids'][:,1:3,1]==.5))
        self.assertTrue(torch.all(captures['bias'][:,:,3:,1:3]>0))
        self.assertTrue(torch.all(captures['bias'][:,:,:3]==0))

    def test_patch_preencodes_once_and_refuses_sampler_size_drift(self):
        comfy=types.ModuleType('comfy');base=types.ModuleType('comfy.model_base');base.Krea2=object
        ext=types.ModuleType('comfy.patcher_extension');ext.WrappersMP=types.SimpleNamespace(DIFFUSION_MODEL='diffusion_model')
        ext.add_wrapper_with_key=lambda kind,key,wrapper,opts:opts.update(wrapper=wrapper)
        comfy.model_base=base;comfy.patcher_extension=ext
        class Model:
            model_options={}
            def process(x):
                assert x.ndim == 5 and x.shape[2] == 1
                return x*3
            model=types.SimpleNamespace(process_latent_in=process)
            def clone(self): result=Model();result.model_options=copy.deepcopy(self.model_options);return result
        model=Model();vae=FakeVae()
        with patch.dict(sys.modules,{'comfy':comfy,'comfy.model_base':base,'comfy.patcher_extension':ext}), patch.object(edit,'_require_krea2'), patch.object(edit,'edit_forward',return_value='result') as forward:
            result=edit.apply_identity_edit(model,self.image,vae,self.target)
            wrapper=result.model_options['transformer_options']['wrapper']
            for _ in range(2): self.assertEqual(wrapper(types.SimpleNamespace(class_obj=object()),self.target['samples'],torch.ones(1),torch.zeros(1,2,30720),None,None,{}),'result')
            self.assertEqual(len(vae.calls),1);self.assertTrue(torch.all(forward.call_args.args[4]==3))
            self.assertEqual(forward.call_args.args[4].ndim, 4)
            class TemporalVae(FakeVae):
                def encode(self, pixels): return super().encode(pixels).unsqueeze(2)
            temporal = edit.apply_identity_edit(model,self.image,TemporalVae(),self.target)
            temporal.model_options['transformer_options']['wrapper'](types.SimpleNamespace(class_obj=object()),self.target['samples'],torch.ones(1),torch.zeros(1,2,30720),None,None,{})
            self.assertEqual(forward.call_args.args[4].ndim, 4)
            with self.assertRaisesRegex(ValueError,'resolution differ'): wrapper(None,torch.zeros(1,16,4,4),None,None)
        self.assertEqual(model.model_options,{})

    def test_later_patches_fail_instead_of_being_silently_ignored(self):
        own={'wrappers':{'diffusion_model':{edit.WRAPPER_KEY:[lambda:None]}}}
        edit.require_compatible_patches(own,installed=True)
        with self.assertRaises(ValueError): edit.require_compatible_patches(own)
        with self.assertRaises(ValueError): edit.require_compatible_patches({**own,'patches':{'attn1_patch':[object()]}},installed=True)
        own['wrappers']['diffusion_model']['another_edit']=[object()]
        with self.assertRaises(ValueError): edit.require_compatible_patches(own,installed=True)


if __name__ == '__main__': unittest.main()

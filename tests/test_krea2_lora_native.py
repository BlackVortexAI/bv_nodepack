"""Optional real ComfyUI CPU proof: static LoRA switches and token object patches."""
import os
import unittest
from tests import test_edit_lora_native as native_fixture

@unittest.skipUnless(os.environ.get('BV_NATIVE_COMFY_ROOT'),'requires isolated native ComfyUI process')
class NativeKreaRoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        native_fixture.NativeEditLoraTests.setUpClass()
    def test_official_diffusers_names_match_native_planner_and_token_injection(self):
        import types
        import torch
        import comfy.model_patcher
        from util.regional.krea2_lora_routing import _classify
        from util.regional.krea2_token_lora import _inject_adapter, TokenLoRASpec
        class Model(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.diffusion_model = torch.nn.Module()
                d = self.diffusion_model
                block = torch.nn.Module(); block.attn = torch.nn.Module(); block.attn.wq = torch.nn.Linear(2, 2, bias=False)
                d.blocks = torch.nn.ModuleList([block])
                d.tmlp = torch.nn.ModuleList([torch.nn.Linear(2, 2), torch.nn.Identity(), torch.nn.Linear(2, 2)])
                d.tproj = torch.nn.ModuleList([torch.nn.Identity(), torch.nn.Linear(2, 2)])
                self.model_config = types.SimpleNamespace(unet_config={"layers": 1})
            def get_dtype(self): return torch.float32
        model = comfy.model_patcher.ModelPatcher(Model(), torch.device("cpu"), torch.device("cpu"))
        pairs = [("transformer.time_embed.linear_1", "diffusion_model.tmlp.0"),
                 ("transformer.time_embed.linear_2", "diffusion_model.tmlp.2"),
                 ("transformer.time_mod_proj", "diffusion_model.tproj.1"),
                 ("transformer.transformer_blocks.0.attn.to_q", "diffusion_model.blocks.0.attn.wq")]
        def state(prefix): return {f"{prefix}.lora_{part}.weight": torch.eye(2) for part in ("A", "B")}
        for external, native in pairs:
            with self.subTest(target=external):
                self.assertEqual(_classify(model, state(external)), _classify(model, state(native)))
        token = state(pairs[-1][0])
        self.assertEqual(_classify(model, token), "token-compatible")
        spec = TokenLoRASpec("mapped", "synthetic", 1., ("r",))
        self.assertEqual(_inject_adapter(model, token, spec), (1, [], []))
        with self.assertRaisesRegex(ValueError, "cannot be resolved"):
            _classify(model, state("transformer.not_a_real_target"))
    def test_real_native_basis_static_and_token_delta_survive_switches(self):
        import json,types
        import torch
        import comfy.ops,comfy.utils,comfy.conds,comfy.model_patcher,comfy.model_management,comfy.samplers,comfy.sd
        from util.regional.krea2_token_lora import _inject_adapter,TokenLoRASpec,_RUNTIME,_RuntimeContext
        from util.regional.static_lora_passes import StaticLoRAPassRouter
        class Model(torch.nn.Module):
            def __init__(self):
                super().__init__();self.diffusion_model=torch.nn.Module()
                self.diffusion_model.blocks=torch.nn.ModuleList([comfy.ops.mixed_precision_ops({}).Linear(8,8,device='cpu',dtype=torch.float32)])
                self.diffusion_model.tmlp=torch.nn.Linear(8,8,bias=False)
                self.diffusion_model.tmlp.weight.data.fill_(1.)
                self.current_patcher=None;self.model_config=types.SimpleNamespace(unet_config={})
            def get_dtype(self):return torch.float32
            def memory_required(self,*args,**kwargs):return 0
            def apply_model(self,x,t,sign,**kwargs):
                z=torch.ones((x.shape[0],4,8))
                value=(self.diffusion_model.blocks[0](z)+self.diffusion_model.tmlp(z))[:,:,0]/8
                return value.reshape(x.shape[0],1,2,2).expand_as(x)*sign.reshape(-1,1,1,1)
        model=Model()
        state={'blocks.0.weight':torch.ones(8,8).to(torch.float8_e4m3fn),'blocks.0.bias':torch.zeros(8),'blocks.0.weight_scale':torch.tensor(2.)}
        state,_=comfy.utils.convert_old_quants(state,metadata={'_quantization_metadata':json.dumps({'layers':{'blocks.0':{'format':'float8_e4m3fn','params':{}}}})})
        model.diffusion_model.load_state_dict(state,strict=False)
        base=comfy.model_patcher.ModelPatcher(model,torch.device('cpu'),torch.device('cpu'))
        base.add_patches({'diffusion_model.blocks.0.weight':('diff',(torch.ones(8,8),))},.5)
        weights=lambda names:{f'diffusion_model.{name}.lora_{direction}.weight':torch.ones((8,1) if direction=='up' else (1,8)) for name in names for direction in ['up','down']}
        # Exercise the actual generation entry. Only text encoding/attention and
        # synthetic geometry/file IO are supplied; planner/static loader/token
        # injector/router installation remain production implementations.
        from unittest.mock import patch
        from util.regional import krea2_generation_lora as generation
        document={'canvas':{'width':2,'height':2},'regions':[{'id':'r','enabled':True}]}
        stacks={'global':[],'r':[('token',.25,0.),('mixed',1.,0.)]}
        region_mask=torch.tensor([[[0.,1.],[0.,1.]]])
        with patch.object(comfy.utils,'load_torch_file',side_effect=lambda path,**_:weights(['blocks.0'] if path=='token' else ['blocks.0','tmlp'])), patch.object(generation,'compile_krea2_attention',return_value=([['p',{}]],[['n',{}]],[],1.)), patch.object(generation,'apply_krea2_attention_patch',side_effect=lambda model,*_:model.clone()), patch.object(generation,'render_selection',return_value=region_mask), patch('util.regional.mask_renderer.render_selection',return_value=region_mask), patch('util.regional.krea2_token_lora.render_selection',return_value=region_mask):
            compiled,positive,negative=generation.compile_krea2_generation_loras(base,None,document,stacks,1.,0.,1.)
        installed=compiled.model_options['transformer_options']['wrappers']['calc_cond_batch'][generation.WRAPPER_KEY][0]
        self.assertEqual(len(installed.models),2)
        token_patch=compiled.model_options['transformer_options']['bv_krea2_token_lora']
        self.assertTrue(torch.equal(token_patch.scope_masks['r'],region_mask))
        actual_mask=next(iter(token_patch.masks(0,4,0,torch.device('cpu')).values()))
        self.assertEqual(actual_mask[0,:,0].tolist(),[0.,1.,0.,1.])
        object_path='diffusion_model.blocks.0'
        self.assertIs(installed.models[0].object_patches[object_path],installed.models[1].object_patches[object_path])
        self.assertIn('diffusion_model.blocks.0.weight',installed.models[0].patches)
        self.assertIn('diffusion_model.tmlp.weight',installed.models[1].patches)
        self.assertEqual({metadata[generation.PASS_KEY] for _,metadata in positive},{0,1})
        self.assertEqual({metadata[generation.PASS_KEY] for _,metadata in negative},{0,1})
        changed,_=comfy.sd.load_lora_for_models(base,None,weights(['blocks.0','tmlp']),1.,0.)
        variants=[base.clone(),changed]
        count,unknown,unmaskable=_inject_adapter(variants[0],weights(['blocks.0']),TokenLoRASpec('token','synthetic',.25,frozenset({'r'})))
        self.assertEqual((count,unknown,unmaskable),(1,[],[]))
        for path,value in variants[0].object_patches.items():
            variants[1].add_object_patch(path,value)
            self.assertIs(variants[1].object_patches[path],value)
        owner='native-generation';router=StaticLoRAPassRouter(variants,owner,pass_key='pass',owner_key='owner',validate_options=lambda _:None)
        x=torch.zeros(2,16,2,2);t=torch.ones(2)
        def branch(sign):
            return [{'pass':i,'owner':owner,'uuid':f'{i}-{sign}','mask':torch.tensor(mask).reshape(1,2,2),'model_conds':{'sign':comfy.conds.CONDRegular(torch.tensor([[sign]]))}} for i,mask in [(0,[1.,0.,1.,0.]),(1,[0.,1.,2.,0.])]]
        comfy.model_management.load_models_gpu([variants[0]]);variants[0].pre_run()
        runtime=_RuntimeContext(token_masks={'token':torch.ones(1,4,1)},text_tokens=0,image_tokens=4,text_layers=12)
        token=_RUNTIME.set(runtime)
        try:
            for _ in range(2):
                for branches in [[branch(1.),branch(-1.)],[branch(-1.),branch(1.)],[branch(1.),None]]:
                    out=comfy.samplers.calc_cond_batch(model,branches,x,t,{'transformer_options':{'wrappers':{'calc_cond_batch':{'native-test':[router]}}}})
                    sign=branches[0][0]['model_conds']['sign'].cond.item()
                    expected=torch.tensor([3.75,5.75,(3.75+2*5.75)/3,0.])*sign
                    torch.testing.assert_close(out[0][0,0].flatten(),expected,rtol=.02,atol=.02)
                    self.assertIs(model.current_patcher,variants[0])
                    if branches[1] is not None:torch.testing.assert_close(out[1],-out[0])
                    else:self.assertEqual(out[1].abs().max(),0.)
        finally:
            _RUNTIME.reset(token);comfy.model_management.unload_all_models()

if __name__=='__main__':unittest.main()

import sys
import unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).parents[1]/'py'))

class KreaRoutingTests(unittest.TestCase):
    def setUp(self):
        from util.regional.krea2_lora_routing import plan_krea2_lora_routes
        self.plan=plan_krea2_lora_routes
        class Model:
            def __init__(self):
                self.diffusion=torch.nn.Module()
                self.diffusion.blocks=torch.nn.ModuleList([torch.nn.Linear(2,2,bias=False)])
                self.diffusion.tmlp=torch.nn.Linear(2,2,bias=False)
                self.basis={'existing-basis':.75}
            def get_model_object(self,name):
                if name=='diffusion_model':return self.diffusion
                raise KeyError(name)
        self.model=Model()
    def weights(self,*modules):
        return {f'diffusion_model.{name}.lora_{direction}.weight':torch.eye(2) for name in modules for direction in ('down','up')}
    def test_complete_global_file_is_static_and_preserves_input_basis(self):
        before=dict(self.model.basis)
        plan=self.plan(self.model,{'global':[('mixed',.8,.2)]},['global'],load_state=lambda _:self.weights('blocks.0','tmlp'))
        self.assertEqual(plan.common,(('mixed',.8,0.),))
        self.assertFalse(any(plan.token_scopes.values()));self.assertFalse(any(plan.multipass_scopes.values()))
        self.assertEqual(plan.clip_scopes['global'],[('mixed',0.,.2)])
        self.assertEqual(self.model.basis,before)
    def test_regional_complete_mixed_file_is_one_static_fallback_not_partial_token(self):
        plan=self.plan(self.model,{'global':[],'r':[('mixed',1.,0.)]},['global','r'],load_state=lambda _:self.weights('blocks.0','tmlp'))
        self.assertEqual(plan.common,())
        self.assertEqual(plan.multipass_scopes['r'],[('mixed',1.,0.)])
        self.assertFalse(plan.token_scopes.get('r'))
    def test_compatible_and_incompatible_files_are_routed_independently(self):
        plan=self.plan(self.model,{'global':[],'r':[('token',1.,0.),('time',.5,0.)]},['global','r'],load_state=lambda path:self.weights('blocks.0' if path=='token' else 'tmlp'))
        self.assertEqual(plan.token_scopes['r'],[('token',1.,0.)])
        self.assertEqual(plan.multipass_scopes['r'],[('time',.5,0.)])
    def test_common_occurrences_ignore_clip_strength_and_inactive_scopes(self):
        stacks={'global':[('a',1.,.1),('a',1.,.2)],'r':[('a',1.,.9)],'disabled':[]}
        plan=self.plan(self.model,stacks,['global','r'],load_state=lambda _:self.weights('blocks.0'))
        self.assertEqual(plan.common,(('a',1.,0.),))
        self.assertEqual(plan.token_scopes['global'],[('a',1.,0.)])
        self.assertEqual(plan.clip_scopes['global'],[('a',0.,.1),('a',0.,.2)])
    def test_explicit_empty_scope_opts_out_and_zero_model_does_not_load(self):
        loaded=[]
        def load(path):loaded.append(path);return self.weights('blocks.0')
        plan=self.plan(self.model,{'global':[('a',1.,0.),('zero',0.,0.)],'r':[]},['global','r'],load_state=load)
        self.assertEqual(plan.common,())
        self.assertEqual(plan.token_scopes['global'],[('a',1.,0.)])
        self.assertNotIn('zero',loaded)
    def test_residual_duplicates_preserve_signed_strength_and_load_file_once(self):
        loaded=[]
        def load(path):loaded.append(path);return self.weights('tmlp')
        plan=self.plan(self.model,{'global':[],'r':[('a',-.5,0.),('a',-.5,0.),('a',2.,0.)]},['global','r'],load_state=load)
        self.assertEqual(plan.multipass_scopes['r'],[('a',-.5,0.),('a',-.5,0.),('a',2.,0.)])
        self.assertEqual(loaded,['a'])
    def test_nonfinite_strength_is_rejected_before_loading(self):
        def load(_):raise AssertionError('invalid strength loaded a file')
        for strength in [float('nan'),float('inf'),-float('inf')]:
            with self.subTest(strength=strength),self.assertRaises(ValueError):
                self.plan(self.model,{'global':[('a',strength,0.)]},['global'],load_state=load)
    def test_real_token_mask_global_residual_respects_optout_image_pixels(self):
        from util.regional.krea2_lora_routing import residual_token_inputs
        from util.regional.krea2_attention import Krea2RegionalSlot
        from util.regional.krea2_token_lora import build_token_lora_specs,build_token_masks
        region=torch.tensor([[[1.,0.],[0.,0.]]]);background=1.-region
        slots=[Krea2RegionalSlot('global',None,1.,2,'global'),Krea2RegionalSlot('region',region,1.,1,'r')]
        entries=[('a',1.,0.)]
        for region_entries,expected in [([],[0.,1.,1.,1.]),(entries,[1.,1.,1.,1.])]:
            with self.subTest(inherited=bool(region_entries)):
                copied,scopes=residual_token_inputs(slots,{'global':entries,'r':region_entries},background)
                specs=build_token_lora_specs(scopes)
                values=build_token_masks(specs,copied,4,4,2,1.,torch.device('cpu'),scope_masks={'r':region})
                self.assertEqual(len(values),1)
                vector=next(iter(values.values()))[0,:,0]
                self.assertEqual(vector[4:8].tolist(),expected)
                self.assertEqual(vector[8:].tolist(),[0.,0.])
                self.assertEqual(vector[1:3].tolist(),[1.,1.])
        self.assertEqual(slots[0].scope,'global');self.assertIsNone(slots[0].mask)
    def test_loader_errors_are_not_compatibility_fallback(self):
        def broken(_):raise OSError('unreadable fixture')
        with self.assertRaisesRegex(OSError,'unreadable fixture'):
            self.plan(self.model,{'global':[],'r':[('bad',1.,0.)]},['global','r'],load_state=broken)
    def test_unknown_incomplete_and_wrong_shape_do_not_silently_fallback(self):
        states=[self.weights('unknown'),{**self.weights('blocks.0'),'diffusion_model.tmlp.lora_down.weight':torch.eye(2)},self.weights('blocks.0')]
        states[-1]['diffusion_model.blocks.0.lora_up.weight']=torch.ones(3,2)
        for state in states:
            with self.subTest(keys=list(state)),self.assertRaises((ValueError,RuntimeError)):
                self.plan(self.model,{'global':[],'r':[('bad',1.,0.)]},['global','r'],load_state=lambda _:state)

if __name__=='__main__':unittest.main()

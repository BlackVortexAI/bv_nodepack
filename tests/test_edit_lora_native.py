"""Optional native CPU contract; run separately with BV_NATIVE_COMFY_ROOT set."""
import os
import sys
import unittest
from pathlib import Path


@unittest.skipUnless(os.environ.get("BV_NATIVE_COMFY_ROOT"), "requires isolated native ComfyUI Python process")
class NativeEditLoraTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path[:0] = [os.environ["BV_NATIVE_COMFY_ROOT"], str(Path(__file__).parents[1]/"py")]
        import comfy.options
        comfy.options.enable_args_parsing()
        sys.argv = [sys.argv[0], "--cpu"]
        import torch
        import comfy.ops
        import comfy.model_patcher
        import comfy.model_management
        import comfy.samplers
        import comfy.sd
        import comfy.conds
        cls.torch = torch

    def test_quantized_native_switches_cfg_and_error_restore(self):
        import json
        import types
        import torch
        import comfy.ops
        import comfy.utils
        import comfy.conds
        import comfy.model_patcher
        import comfy.model_management
        import comfy.samplers
        from util.regional.edit_lora_passes import StaticEditPassRouter, PASS_KEY, OWNER_KEY, WRAPPER_KEY
        from unittest.mock import patch

        class Model(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.diffusion_model=torch.nn.Module()
                self.diffusion_model.layer=comfy.ops.mixed_precision_ops({}).Linear(8,8,device="cpu",dtype=torch.float32)
                self.current_patcher=None
                self.tag='original'
                self.model_config=types.SimpleNamespace(unet_config={})
            def get_dtype(self):return torch.float32
            def memory_required(self,*args,**kwargs):return 0
            def apply_model(self,x,t,sign,**kwargs):
                value=self.diffusion_model.layer(torch.ones((x.shape[0],8)))[:,0]/8
                return torch.ones_like(x)*value.reshape(-1,1,1,1,1)*sign.reshape(-1,1,1,1,1)
        model=Model()
        state={"layer.weight":torch.ones(8,8).to(torch.float8_e4m3fn),"layer.bias":torch.zeros(8),"layer.weight_scale":torch.tensor(2.)}
        state,_=comfy.utils.convert_old_quants(state,metadata={"_quantization_metadata":json.dumps({"layers":{"layer":{"format":"float8_e4m3fn","params":{}}}})})
        model.diffusion_model.load_state_dict(state,strict=False)
        base=comfy.model_patcher.ModelPatcher(model,torch.device("cpu"),torch.device("cpu"))
        # Genuine native static patches on a quantized model, including persistent Basis.
        key="diffusion_model.layer.weight"
        base.add_patches({key:("diff",(torch.ones(8,8),))},.5)
        lora={"diffusion_model.layer.lora_up.weight":torch.ones(8,1),"diffusion_model.layer.lora_down.weight":torch.ones(1,8)}
        a,_=comfy.sd.load_lora_for_models(base,None,lora,1.,0.)
        b,_=comfy.sd.load_lora_for_models(base,None,lora,2.,0.)
        router=StaticEditPassRouter((base,a,b),"native-test")
        x=torch.zeros(2,16,1,2,4); t=torch.ones(2)
        def conditioning(index,mask,sign):
            return {PASS_KEY:index,OWNER_KEY:"native-test","uuid":f"{index}-{sign}","mask":torch.tensor(mask).reshape(1,1,1,4).expand(1,1,2,4),"model_conds":{"sign":comfy.conds.CONDRegular(torch.tensor([[sign]]))}}
        def branches(strength=1.):
            return [[conditioning(0,[1.,0.,0.,0.],sign),conditioning(1,[0.,strength,1.,0.],sign),conditioning(2,[0.,0.,2.,1.],sign)] for sign in [1.,-1.]]
        comfy.model_management.load_models_gpu([base]);base.pre_run()
        def run(cs,executor=comfy.samplers._calc_cond_batch):
            return router(executor,model,cs,x,t,{})
        for _ in range(2):
            for cs in [branches(),list(reversed(branches())),[branches()[0],None]]:
                result=run(cs)
                sign=1. if cs[0][0]["model_conds"]["sign"].cond.item()>0 else -1.
                expected=torch.tensor([2.5,3.5,(3.5+2*4.5)/3,4.5])*sign
                torch.testing.assert_close(result[0][0,0,0,0],expected,rtol=.02,atol=.02)
                self.assertIs(model.current_patcher,base)
                if cs[1] is not None:torch.testing.assert_close(result[1],-result[0])
                else:self.assertEqual(result[1].abs().max(),0.)
        # Public wrapper entrypoint, native branch preparation and timestep gating.
        options={"transformer_options":{"wrappers":{"calc_cond_batch":{WRAPPER_KEY:[router]}}}}
        cs=branches()
        cs[0][1]["timestep_start"]=torch.tensor(.5)
        result=comfy.samplers.calc_cond_batch(model,cs,x,t,options)
        self.assertEqual(result[0][...,1].abs().max(),0.)
        self.assertAlmostEqual(result[0][0,0,0,0,2].item(),4.5,delta=.05)
        for strength in [0.,.5,2.]:
            cs=branches(strength)
            for branch in cs:
                branch[0]["mask"]=branch[0]["mask"].clone()
                branch[0]["mask"][...,1]=max(0.,1.-strength)
            result=run(cs)
            expected=2.5 if strength==0 else 3. if strength==.5 else 3.5
            self.assertAlmostEqual(result[0][0,0,0,0,1].item(),expected,delta=.05)
        # Reject incompatible/foreign conditioning before loading any variant.
        for field,value in [("area",(1,1,0,0)),("control",object()),("hooks",object()),(OWNER_KEY,"other-node")]:
            cs=branches();cs[0][0][field]=value
            with patch.object(comfy.model_management,"load_models_gpu") as load:
                with self.assertRaises(ValueError):run(cs)
                load.assert_not_called()
        def fail(*args):raise RuntimeError("forward failed")
        with self.assertRaisesRegex(RuntimeError,"forward failed"):run(branches(),fail)
        self.assertIs(model.current_patcher,base)
        actual=model.diffusion_model.layer(torch.ones(1,8))[0,0]/8
        self.assertAlmostEqual(actual.item(),2.5,delta=.05)
        with patch.object(b,"pre_run",side_effect=RuntimeError("pre-run failed")):
            with self.assertRaisesRegex(RuntimeError,"pre-run failed"):run(branches())
        self.assertIs(model.current_patcher,base)
        self.assertAlmostEqual((model.diffusion_model.layer(torch.ones(1,8))[0,0]/8).item(),2.5,delta=.05)
        # A later run must still work after the failed one.
        self.assertTrue(torch.isfinite(run(branches())[0]).all())
        self.assertEqual(len(base.patches[key]),1)
        # Compiler -> same prompt plus overlay stack -> native quantized sampler.
        from util.regional.krea2_edit_regions import compile_edit_regions
        from util.regional.document import default_document
        doc=default_document();doc['canvas']={'width':4,'height':2}
        doc['reference_images']=[{'collector_id':'source','resource_id':'image'}]
        doc['regions']=[{'id':name,'name':name,'enabled':True,'usage':'generation','strength':1.,'prompts':{'positive_source':text,'negative_source':''}} for name,text in [('hair','Blonde'),('skin','')]]
        masks={'hair':torch.tensor([[[1.,1.,0.,0.]]]).expand(1,2,4),'skin':torch.tensor([[[0.,1.,1.,0.]]]).expand(1,2,4)}
        def encode(scope,text,*,entries=None):
            index=1 if entries else 0
            value=10. if 'Blonde' in text[0] else 1.
            metadata={PASS_KEY:index,OWNER_KEY:'native-test'}
            return ([[torch.tensor([[value]]),dict(metadata)]],[[torch.tensor([[-value]]),dict(metadata)]])
        with patch('util.regional.krea2_edit_regions.render_selection',side_effect=lambda selection,w,h:masks[selection['region_id']]):
            positive,negative=compile_edit_regions(doc,None,None,scope_encoder=encode,lora_scopes={'skin':[('skin',1,0)]})
        cs=[]
        for branch in (positive,negative):
            cs.append([{**metadata,'uuid':str(i),'model_conds':{'sign':comfy.conds.CONDRegular(embedding)}} for i,(embedding,metadata) in enumerate(branch)])
        for branches_to_run in (cs,list(reversed(cs)),[cs[0],None]):
            output=run(branches_to_run)
            expected=torch.tensor([25.,35.,3.5,2.5]) * (-1 if branches_to_run[0] is cs[1] else 1)
            torch.testing.assert_close(output[0][0,0,0,0],expected,rtol=.02,atol=.02)
            if branches_to_run[1] is not None:torch.testing.assert_close(output[1],-output[0])
        downstream=base.clone()
        downstream.add_patches({key:("diff",(torch.ones(8,8),))},.1)
        comfy.model_management.load_models_gpu([downstream]);downstream.pre_run()
        with patch.object(comfy.model_management,"load_models_gpu") as load:
            with self.assertRaisesRegex(ValueError,"before the Identity Edit"):
                run(branches())
            load.assert_not_called()
        comfy.model_management.unload_all_models()
        # Exercise the exact native delegate/clone API on CPU. The dynamic
        # marker is simulated; no AIMDO allocation or GPU claim is made here.
        from util.regional.edit_lora_passes import EditLoRAPasses
        class CpuDynamic(comfy.model_patcher.ModelPatcher):
            non_dynamic_delegate_model=None
            def is_dynamic(self):return True
            get_non_dynamic_delegate=comfy.model_patcher.ModelPatcherDynamic.get_non_dynamic_delegate
        created=[]
        def factory(*, disable_dynamic=False):
            self.assertTrue(disable_dynamic)
            fresh=Model();fresh.diffusion_model.load_state_dict(state,strict=False)
            created.append(fresh)
            return comfy.model_patcher.ModelPatcher(fresh,torch.device('cpu'),torch.device('cpu'))
        dynamic=CpuDynamic(model,torch.device('cpu'),torch.device('cpu'))
        dynamic.cached_patcher_init=(factory,())
        dynamic.add_patches({key:('diff',(torch.ones(8,8),))},.5)
        dynamic.object_patches={'tag':'preserved'}
        dynamic.set_attachments('basis-proof',('identity',1.))
        other=dynamic.clone();other.add_patches({key:('diff',(torch.ones(8,8),))},1.)
        passes=EditLoRAPasses(dynamic,None,{},None);passes.variant('global');passes.models.append(other)
        prepared=passes.prepare_model()
        self.assertFalse(prepared.is_dynamic());self.assertEqual(len(created),1)
        self.assertIs(passes.models[0].model,passes.models[1].model)
        self.assertIs(passes.models[0].backup,passes.models[1].backup)
        self.assertIsNot(prepared.model,dynamic.model)
        self.assertEqual(prepared.patches_uuid,dynamic.patches_uuid)
        self.assertEqual(prepared.object_patches,dynamic.object_patches)
        self.assertEqual(prepared.get_attachment('basis-proof'),('identity',1.))
        self.assertIsNotNone(dynamic.non_dynamic_delegate_model)
        delegate_router=StaticEditPassRouter(tuple(passes.models),'native-test')
        comfy.model_management.load_models_gpu([prepared]);prepared.pre_run()
        cs=[[conditioning(i,[1.,1.,1.,1.],sign)] for i,sign in [(1,1.),(0,-1.)]]
        for _ in range(3):
            result=delegate_router(comfy.samplers._calc_cond_batch,prepared.model,cs,x,t,{})
            torch.testing.assert_close(result[0],torch.full_like(x,3.5),rtol=.02,atol=.02)
            torch.testing.assert_close(result[1],torch.full_like(x,-2.5),rtol=.02,atol=.02)
            self.assertIs(prepared.model.current_patcher,prepared)
        self.assertEqual(prepared.model.tag,'preserved')
        self.assertEqual(dynamic.model.tag,'original')
        self.assertEqual(len(dynamic.patches[key]),1)
        self.assertEqual(len(created),1)
        self.assertIs(dynamic.get_non_dynamic_delegate().model,prepared.model)
        allocations=[]
        native_zeros=torch.zeros_like
        def record_zeros(value, **kwargs):
            result=native_zeros(value, **kwargs)
            allocations.append(result)
            return result
        def failure(*args, **kwargs):
            raise RuntimeError('delegate forward failure')
        with patch.object(torch,'zeros_like',side_effect=record_zeros):
            with self.assertRaisesRegex(RuntimeError,'delegate forward failure'):
                delegate_router(failure,prepared.model,cs,x,t,{})
        self.assertIs(prepared.model.current_patcher,prepared)
        single=[value for value in allocations if value.shape==x[:, :1].shape]
        self.assertEqual(len(single),2*len(cs))  # counts and first group's weights
        self.assertTrue(all(value.numel()*16==x.numel() for value in single))
        restored=delegate_router(comfy.samplers._calc_cond_batch,prepared.model,cs,x,t,{})
        torch.testing.assert_close(restored[1],torch.full_like(x,-2.5),rtol=.02,atol=.02)
        comfy.model_management.unload_all_models()


if __name__ == "__main__": unittest.main()

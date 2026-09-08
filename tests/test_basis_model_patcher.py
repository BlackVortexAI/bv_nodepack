import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parents[1]/"py"))
from util import model_patcher as subject
from util.regional.lora_v3 import build_lora_provider, reidentify_lora_provider
from util.regional.lora_hooks import resolve_scope_stacks, default_bindings
from util.lora_registry import parse_lora_registry_config, materialize_lora_registry
from util.regional.lora_v3 import resolve_lora_capability, transform_lora_capability, register_lora_contracts
from util.regional.context import normalize_context
from util.regional.document import default_document

A="11111111-1111-4111-8111-111111111111"
B="22222222-2222-4222-8222-222222222222"
S="33333333-3333-4333-8333-333333333333"

class Model:
    def __init__(self): self.attachments={}
    def get_attachment(self, key): return self.attachments.get(key)
    def set_attachments(self,key,value): self.attachments[key]=value
    def clone(self): return copy.deepcopy(self)
class Clip:
    def __init__(self): self.patcher=Model()
    def clone(self): return copy.deepcopy(self)
def provider(identifier=A, strength=1.):
    return build_lora_provider(identifier,{
        S:{"id":S,"name":"Base","role":"basis","stack":[("base.safetensors",strength,.25)]},
        "normal":{"id":"normal","name":"Style","stack":[("style.safetensors",1.,1.)]}})

class AutomaticLoraServiceTests(unittest.TestCase):
    def setUp(self):
        self.model,self.clip=Model(),Clip()
        resolve=patch.object(subject,"resolve_stack_paths",side_effect=lambda stacks:stacks)
        resolve.start();self.addCleanup(resolve.stop)
        apply=patch.object(subject,"apply_static_lora_stack",side_effect=lambda model,clip,entries:(model.clone(),clip.clone() if clip else None))
        self.apply=apply.start();self.addCleanup(apply.stop)
    def test_empty_passthrough(self):
        self.assertEqual(subject.apply_automatic_resources(self.model,self.clip,[]),(self.model,self.clip))
        self.apply.assert_not_called()
    def resources(self):
        return [{"provider_id":A,"resource_id":S,"role":"global","entry_ids":[A,B],
                 "stack":[("base.safetensors",-.5,.25),("base.safetensors",1.,.25)]}]
    def test_occurrence_order_and_original_inputs(self):
        output=subject.apply_automatic_resources(self.model,self.clip,self.resources())
        self.assertEqual(self.apply.call_args.args[2],[("base.safetensors",-.5,.25),("base.safetensors",1.,.25)])
        self.assertIsNot(output[0],self.model)
        self.assertEqual(self.model.attachments,{})
        self.assertEqual(self.clip.patcher.attachments,{})
    def test_model_clip_markers_are_separate(self):
        resources=self.resources()
        model,_=subject.apply_automatic_resources(self.model,None,resources)
        self.assertEqual(self.apply.call_args.args[2],[("base.safetensors",-.5,0.),("base.safetensors",1.,0.)])
        self.assertIs(subject.apply_automatic_resources(model,None,resources)[0],model)
        subject.apply_automatic_resources(model,self.clip,resources)
        self.assertEqual(self.apply.call_args.args[2],[("base.safetensors",0.,.25),("base.safetensors",0.,.25)])
    def test_role_roundtrip_and_collector_reidentification(self):
        config={"schema":"bv.lora_registry_config","version":1,"registry_id":A,"stacks":[{"id":S,"name":"Base","enabled":True,"entries":[]}]}
        self.assertNotIn("role",next(stack for stack in parse_lora_registry_config(config)["stacks"] if stack["id"]==S))
        config["stacks"][0]["role"]="basis"
        self.assertEqual(next(stack for stack in parse_lora_registry_config(config)["stacks"] if stack["id"]==S)["role"],"basis")
        materialized,_=materialize_lora_registry(config)
        self.assertEqual(build_lora_provider(A,materialized["stacks"])["resources"][S]["role"],"basis")
        self.assertEqual(reidentify_lora_provider(provider(),B)["resources"][S]["role"],"basis")
        config["stacks"][0]["role"]="invalid"
        with self.assertRaises(ValueError): parse_lora_registry_config(config)
    def test_legacy_assignment_rejects_basis(self):
        bindings=default_bindings();bindings["global_stack_id"]=S
        with self.assertRaisesRegex(ValueError,"Basis"):
            resolve_scope_stacks({"schema":"bv.lora_stack_registry","version":1,"stacks":provider()["resources"]},bindings,{"regions":[]})
    def test_persisted_v3_assignment_does_not_duplicate_automatic_basis(self):
        capabilities,_=register_lora_contracts()
        context=transform_lora_capability(normalize_context(default_document()),
            {"version":2,"entries":[{"id":B,"source":{"kind":"external","collector_id":A,"resource_id":S},"targets":[{"scope":"global"}]}]},
            operation="replace",registry=capabilities)
        self.assertEqual(resolve_lora_capability(context,provider(),registry=capabilities), {})

if __name__=="__main__": unittest.main()
